import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { parseGpxFile, calculateHaversineDistance } from '@/lib/gpxParser';
import { Bike } from 'lucide-react';
interface ElevationPoint {
  distance: number;
  elevation: number;
}

interface MotoData {
  id: string;
  name: string;
  name_tv: string | null;
  color: string;
  distance_from_start: number;
}

interface OverlayConfig {
  elevation_visible: boolean;
  elevation_line_color: string;
  elevation_fill_opacity: number;
  elevation_moto_marker_size: number;
  map_overlay_moto_ids: string[];
  selected_distance_id: string | null;
  delay_seconds: number;
}

const ElevationOverlay = () => {
  const { raceId } = useParams<{ raceId: string }>();
  
  const [config, setConfig] = useState<OverlayConfig | null>(null);
  const [elevationData, setElevationData] = useState<ElevationPoint[]>([]);
  const [motos, setMotos] = useState<MotoData[]>([]);
  const [resolvedRaceId, setResolvedRaceId] = useState<string | null>(null);
  const [totalDistance, setTotalDistance] = useState(0);

  // Resolve raceId (could be slug or UUID)
  useEffect(() => {
    const resolveRaceId = async () => {
      if (!raceId) return;
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(raceId)) {
        setResolvedRaceId(raceId);
        return;
      }
      
      const { data } = await supabase
        .from('races')
        .select('id')
        .eq('slug', raceId)
        .maybeSingle();
      
      if (data) setResolvedRaceId(data.id);
    };
    
    resolveRaceId();
  }, [raceId]);

  // Fetch config
  useEffect(() => {
    if (!resolvedRaceId) return;
    
    const fetchConfig = async () => {
      const { data } = await supabase
        .from('overlay_config')
        .select('elevation_visible, elevation_line_color, elevation_fill_opacity, elevation_moto_marker_size, map_overlay_moto_ids, selected_distance_id, delay_seconds')
        .eq('race_id', resolvedRaceId)
        .maybeSingle();
      
      if (data) {
        setConfig({
          ...data,
          map_overlay_moto_ids: (data.map_overlay_moto_ids as string[]) || []
        });
      }
    };
    
    fetchConfig();
    
    const channel = supabase
      .channel('overlay-config-elevation')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'overlay_config',
        filter: `race_id=eq.${resolvedRaceId}`
      }, () => fetchConfig())
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [resolvedRaceId]);

  // Fetch elevation data from GPX
  useEffect(() => {
    if (!config?.selected_distance_id) return;
    
    const fetchElevation = async () => {
      const { data: distance } = await supabase
        .from('race_distances')
        .select('gpx_file_url, distance_km')
        .eq('id', config.selected_distance_id)
        .maybeSingle();
      
      if (!distance?.gpx_file_url) return;
      
      try {
        const response = await fetch(distance.gpx_file_url);
        const gpxText = await response.text();
        const parsedGpx = parseGpxFile(gpxText);
        
        if (!parsedGpx.tracks?.length) return;
        
        const points: ElevationPoint[] = [];
        let cumulativeDistance = 0;
        
        parsedGpx.tracks.forEach((track) => {
          for (let i = 0; i < track.points.length; i++) {
            const point = track.points[i];
            
            if (i > 0) {
              const prev = track.points[i - 1];
              cumulativeDistance += calculateHaversineDistance(
                prev.lat, prev.lon, point.lat, point.lon
              );
            }
            
            const elevation = point.ele || 0;
            
            // Sample every ~100m
            if (points.length === 0 || cumulativeDistance - points[points.length - 1].distance >= 0.1) {
              points.push({
                distance: Math.round(cumulativeDistance * 10) / 10,
                elevation: Math.round(elevation),
              });
            }
          }
        });
        
        setElevationData(points);
        setTotalDistance(distance.distance_km || cumulativeDistance);
      } catch (e) {
        console.error('Error parsing GPX:', e);
      }
    };
    
    fetchElevation();
  }, [config?.selected_distance_id]);

  // Fetch moto positions
  const fetchMotos = useCallback(async () => {
    if (!resolvedRaceId || !config?.map_overlay_moto_ids?.length) return;
    
    const { data: motoData } = await supabase
      .from('race_motos')
      .select('id, name, name_tv, color')
      .in('id', config.map_overlay_moto_ids);
    
    if (!motoData) return;
    
    const motosWithDistance: MotoData[] = [];
    
    for (const moto of motoData) {
      const { data: gps } = await supabase
        .from('moto_gps_tracking')
        .select('distance_from_start, timestamp')
        .eq('moto_id', moto.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (gps?.distance_from_start != null) {
        const delayMs = (config.delay_seconds || 0) * 1000;
        const gpsTime = new Date(gps.timestamp).getTime();
        const now = Date.now();
        
        if (now - gpsTime >= delayMs) {
          motosWithDistance.push({
            id: moto.id,
            name: moto.name,
            name_tv: moto.name_tv,
            color: moto.color,
            distance_from_start: gps.distance_from_start
          });
        }
      }
    }
    
    setMotos(motosWithDistance);
  }, [resolvedRaceId, config?.map_overlay_moto_ids, config?.delay_seconds]);

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 2000);
    return () => clearInterval(interval);
  }, [fetchMotos]);

  // Calculate elevation for each moto based on distance
  const motoElevations = useMemo(() => {
    if (!elevationData.length) return [];
    
    return motos.map(moto => {
      const distKm = moto.distance_from_start;
      const closest = elevationData.reduce((prev, curr) =>
        Math.abs(curr.distance - distKm) < Math.abs(prev.distance - distKm) ? curr : prev
      );
      
      return {
        ...moto,
        elevation: closest.elevation,
        chartDistance: closest.distance
      };
    });
  }, [motos, elevationData]);

  // Calculate Y axis range
  const { minElevation, maxElevation } = useMemo(() => {
    if (elevationData.length === 0) return { minElevation: 0, maxElevation: 100 };
    const elevations = elevationData.map(p => p.elevation);
    const min = Math.min(...elevations);
    const max = Math.max(...elevations);
    const padding = (max - min) * 0.1;
    return { 
      minElevation: Math.floor(min - padding), 
      maxElevation: Math.ceil(max + padding) 
    };
  }, [elevationData]);

  // Make html/body transparent for overlay
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  if (!config?.elevation_visible) {
    return null;
  }

  const lineColor = config.elevation_line_color || '#00FF00';
  const fillOpacity = config.elevation_fill_opacity || 0.3;
  const markerSize = config.elevation_moto_marker_size || 10;

  return (
    <div 
      style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent',
        padding: '20px',
        position: 'relative'
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={elevationData} margin={{ top: 20, right: 40, bottom: 40, left: 40 }}>
          <defs>
            <linearGradient id="elevationGradientOverlay" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={fillOpacity} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          
          <XAxis 
            dataKey="distance" 
            domain={[0, totalDistance]}
            tickFormatter={(v) => `${v} km`}
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
          />
          <YAxis 
            domain={[minElevation, maxElevation]}
            tickFormatter={(v) => `${v}m`}
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
          />
          
          <Area
            type="monotone"
            dataKey="elevation"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#elevationGradientOverlay)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Moto markers as custom positioned elements */}
      {motoElevations.map((moto) => {
        // Calculate position based on chart dimensions with margins
        const marginLeft = 40;
        const marginRight = 40;
        const marginTop = 20;
        const marginBottom = 40;
        const padding = 20; // container padding
        
        // X position: map distance to chart area
        const xPercent = ((moto.chartDistance / totalDistance) * 100);
        const xPos = `calc(${padding}px + ${marginLeft}px + (100% - ${padding * 2}px - ${marginLeft}px - ${marginRight}px) * ${xPercent / 100})`;
        
        // Y position: map elevation to chart area
        const yRange = maxElevation - minElevation;
        const yPercent = (moto.elevation - minElevation) / yRange;
        const yPos = `calc(${padding}px + ${marginTop}px + (100% - ${padding * 2}px - ${marginTop}px - ${marginBottom}px) * ${1 - yPercent})`;
        
        return (
          <div
            key={moto.id}
            style={{
              position: 'absolute',
              left: xPos,
              top: yPos,
              transform: 'translate(-50%, -100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none'
            }}
          >
            <span style={{
              color: 'white',
              fontSize: '14px',
              fontWeight: 'bold',
              textShadow: '0 0 4px rgba(0,0,0,0.8)',
              marginBottom: '2px'
            }}>
              {moto.name_tv || moto.name}
            </span>
            <div style={{
              backgroundColor: moto.color,
              borderRadius: '50%',
              padding: `${markerSize * 0.4}px`,
              border: '2px solid white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bike size={markerSize} color="white" />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ElevationOverlay;
