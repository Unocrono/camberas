import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseGpxFile, calculateHaversineDistance } from '@/lib/gpxParser';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { Mountain, MapPin } from 'lucide-react';

interface ElevationPoint {
  distance: number;
  elevation: number;
}

interface Checkpoint {
  name: string;
  distance_km: number;
}

interface ElevationMiniProfileProps {
  distanceId: string;
  currentDistanceKm?: number;
  checkpoints?: Checkpoint[];
  className?: string;
}

export function ElevationMiniProfile({ 
  distanceId, 
  currentDistanceKm = 0, 
  checkpoints = [],
  className = '' 
}: ElevationMiniProfileProps) {
  const [elevationData, setElevationData] = useState<ElevationPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalDistance, setTotalDistance] = useState(0);
  const [elevationGain, setElevationGain] = useState(0);

  useEffect(() => {
    if (!distanceId) return;

    const loadElevationData = async () => {
      setLoading(true);
      try {
        const { data: distanceData, error } = await supabase
          .from('race_distances')
          .select('gpx_file_url, distance_km, elevation_gain')
          .eq('id', distanceId)
          .maybeSingle();

        if (error || !distanceData?.gpx_file_url) {
          setLoading(false);
          return;
        }

        const response = await fetch(distanceData.gpx_file_url);
        const gpxText = await response.text();
        const parsedGpx = parseGpxFile(gpxText);

        if (!parsedGpx.tracks || parsedGpx.tracks.length === 0) {
          setLoading(false);
          return;
        }

        // Extract elevation profile with cumulative distance
        const points: ElevationPoint[] = [];
        let cumulativeDistance = 0;
        let totalGain = 0;
        let prevElevation: number | undefined;

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
            
            // Calculate elevation gain
            if (prevElevation !== undefined && elevation > prevElevation) {
              totalGain += elevation - prevElevation;
            }
            prevElevation = elevation;

            // Sample every ~100m to keep data manageable
            if (points.length === 0 || cumulativeDistance - points[points.length - 1].distance >= 0.1) {
              points.push({
                distance: Math.round(cumulativeDistance * 10) / 10,
                elevation: Math.round(elevation),
              });
            }
          }
        });

        setElevationData(points);
        setTotalDistance(distanceData.distance_km || cumulativeDistance);
        setElevationGain(distanceData.elevation_gain || Math.round(totalGain));
      } catch (e) {
        console.error('Error loading elevation data:', e);
      } finally {
        setLoading(false);
      }
    };

    loadElevationData();
  }, [distanceId]);

  // Find current elevation at runner position
  const currentElevation = useMemo(() => {
    if (elevationData.length === 0 || currentDistanceKm <= 0) return null;
    
    // Find the closest point to current distance
    const closest = elevationData.reduce((prev, curr) => 
      Math.abs(curr.distance - currentDistanceKm) < Math.abs(prev.distance - currentDistanceKm) 
        ? curr 
        : prev
    );
    return closest;
  }, [elevationData, currentDistanceKm]);

  // Calculate elevation range for Y axis
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

  if (loading) {
    return (
      <div className={`bg-card rounded-lg p-3 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Mountain className="h-4 w-4 animate-pulse" />
          <span>Cargando perfil...</span>
        </div>
      </div>
    );
  }

  if (elevationData.length === 0) {
    return null; // No GPX data available
  }

  return (
    <div className={`bg-card rounded-lg overflow-hidden ${className}`}>
      {/* Header with stats */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mountain className="h-4 w-4 text-primary" />
          <span>Perfil</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>↑ {elevationGain}m</span>
          {currentElevation && (
            <span className="text-primary font-medium">
              {currentElevation.elevation}m
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-20 px-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={elevationData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            
            <XAxis 
              dataKey="distance" 
              hide 
              domain={[0, totalDistance]} 
            />
            <YAxis 
              hide 
              domain={[minElevation, maxElevation]} 
            />
            
            <Area
              type="monotone"
              dataKey="elevation"
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              fill="url(#elevationGradient)"
              isAnimationActive={false}
            />

            {/* Checkpoint markers */}
            {checkpoints.map((cp, idx) => (
              <ReferenceLine
                key={idx}
                x={cp.distance_km}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="2 2"
                strokeOpacity={0.5}
              />
            ))}

            {/* Current position marker */}
            {currentElevation && currentDistanceKm > 0 && (
              <ReferenceDot
                x={currentElevation.distance}
                y={currentElevation.elevation}
                r={6}
                fill="hsl(var(--primary))"
                stroke="white"
                strokeWidth={2}
              />
            )}

            {/* Vertical line at current position */}
            {currentDistanceKm > 0 && (
              <ReferenceLine
                x={currentDistanceKm}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeOpacity={0.8}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Distance markers */}
      <div className="flex justify-between px-3 pb-2 text-xs text-muted-foreground">
        <span>0 km</span>
        {currentDistanceKm > 0 && (
          <span className="text-primary font-medium flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {currentDistanceKm.toFixed(1)} km
          </span>
        )}
        <span>{totalDistance.toFixed(1)} km</span>
      </div>
    </div>
  );
}
