import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface Moto {
  id: string;
  name: string;
  name_tv: string | null;
  color: string;
  is_active: boolean;
}

interface MotoPosition {
  moto_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  distance_from_start: number | null;
  timestamp: string;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

const MotoOverlay: React.FC = () => {
  const { raceId } = useParams<{ raceId: string }>();
  const [searchParams] = useSearchParams();
  
  const [motos, setMotos] = useState<Moto[]>([]);
  const [positions, setPositions] = useState<Map<string, MotoPosition>>(new Map());
  const [raceDistance, setRaceDistance] = useState<RaceDistance | null>(null);
  const [loading, setLoading] = useState(true);

  // URL parameters
  const mode = searchParams.get('mode') || 'single'; // single, compare, leader
  const motoId1 = searchParams.get('moto1');
  const motoId2 = searchParams.get('moto2');
  const motoId3 = searchParams.get('moto3');
  const theme = searchParams.get('theme') || 'dark';
  const showSpeed = searchParams.get('speed') !== 'false';
  const showDistance = searchParams.get('distance') !== 'false';
  const distanceId = searchParams.get('distanceId');

  // Transparent background for OBS
  useEffect(() => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    return () => {
      document.body.style.background = '';
      document.documentElement.style.background = '';
    };
  }, []);

  // Fetch motos
  useEffect(() => {
    const fetchMotos = async () => {
      if (!raceId) return;

      const { data, error } = await supabase
        .from('race_motos')
        .select('id, name, name_tv, color, is_active')
        .eq('race_id', raceId)
        .eq('is_active', true)
        .order('moto_order');

      if (!error && data) {
        setMotos(data);
      }
    };

    fetchMotos();
  }, [raceId]);

  // Fetch race distance for total distance
  useEffect(() => {
    const fetchDistance = async () => {
      if (!raceId) return;

      let query = supabase
        .from('race_distances')
        .select('id, name, distance_km')
        .eq('race_id', raceId);

      if (distanceId) {
        query = query.eq('id', distanceId);
      }

      const { data, error } = await query.limit(1).single();

      if (!error && data) {
        setRaceDistance(data);
      }
      setLoading(false);
    };

    fetchDistance();
  }, [raceId, distanceId]);

  // Fetch initial positions and subscribe to updates
  useEffect(() => {
    if (!raceId || motos.length === 0) return;

    const fetchPositions = async () => {
      const { data, error } = await supabase
        .from('moto_gps_tracking')
        .select('moto_id, latitude, longitude, speed, distance_from_start, timestamp')
        .eq('race_id', raceId)
        .in('moto_id', motos.map(m => m.id))
        .order('timestamp', { ascending: false });

      if (!error && data) {
        const posMap = new Map<string, MotoPosition>();
        data.forEach(pos => {
          if (!posMap.has(pos.moto_id)) {
            posMap.set(pos.moto_id, pos);
          }
        });
        setPositions(posMap);
      }
    };

    fetchPositions();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`moto-gps-${raceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moto_gps_tracking',
          filter: `race_id=eq.${raceId}`
        },
        (payload) => {
          const newPos = payload.new as MotoPosition;
          setPositions(prev => {
            const updated = new Map(prev);
            updated.set(newPos.moto_id, newPos);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, motos]);

  const getMotoDisplayName = (moto: Moto) => moto.name_tv || moto.name;

  const getDistanceToFinish = (pos: MotoPosition | undefined) => {
    if (!pos?.distance_from_start || !raceDistance) return null;
    return Math.max(0, raceDistance.distance_km - Number(pos.distance_from_start));
  };

  const formatDistance = (km: number | null) => {
    if (km === null) return '--';
    return km.toFixed(2) + ' km';
  };

  const formatSpeed = (speed: number | null) => {
    if (speed === null) return '--';
    return speed.toFixed(1) + ' km/h';
  };

  const formatPace = (speed: number | null) => {
    if (!speed || speed <= 0) return '--';
    const paceMinutes = 60 / speed;
    const mins = Math.floor(paceMinutes);
    const secs = Math.round((paceMinutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')} /km`;
  };

  const getDistanceBetween = (pos1: MotoPosition | undefined, pos2: MotoPosition | undefined) => {
    if (!pos1?.distance_from_start || !pos2?.distance_from_start) return null;
    return Math.abs(Number(pos1.distance_from_start) - Number(pos2.distance_from_start));
  };

  const getTimeDifference = (pos1: MotoPosition | undefined, pos2: MotoPosition | undefined) => {
    if (!pos1 || !pos2) return null;
    const t1 = new Date(pos1.timestamp).getTime();
    const t2 = new Date(pos2.timestamp).getTime();
    return Math.abs(t1 - t2) / 1000; // seconds
  };

  const formatTimeDiff = (seconds: number | null) => {
    if (seconds === null) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const baseClasses = theme === 'dark' 
    ? 'bg-black/80 text-white border-white/20' 
    : 'bg-white/90 text-black border-black/20';

  const getMoto = (id: string | null) => motos.find(m => m.id === id);
  const getPos = (id: string | null) => id ? positions.get(id) : undefined;

  // Find first moto (furthest from start)
  const getFirstMoto = () => {
    let maxDistance = -1;
    let firstMoto: Moto | null = null;
    
    motos.forEach(moto => {
      const pos = positions.get(moto.id);
      if (pos?.distance_from_start && Number(pos.distance_from_start) > maxDistance) {
        maxDistance = Number(pos.distance_from_start);
        firstMoto = moto;
      }
    });
    
    return firstMoto;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-transparent">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  // SINGLE MOTO MODE
  if (mode === 'single' && motoId1) {
    const moto = getMoto(motoId1);
    const pos = getPos(motoId1);

    if (!moto) return null;

    return (
      <div className="p-4 bg-transparent">
        <div className={`rounded-lg border-2 p-4 ${baseClasses}`} style={{ borderColor: moto.color }}>
          <div className="flex items-center gap-3 mb-3">
            <div 
              className="w-4 h-4 rounded-full" 
              style={{ backgroundColor: moto.color }}
            />
            <span className="font-bold text-xl">{getMotoDisplayName(moto)}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {showDistance && (
              <div>
                <div className="text-sm opacity-70">A META</div>
                <div className="text-2xl font-mono font-bold">
                  {formatDistance(getDistanceToFinish(pos))}
                </div>
              </div>
            )}
            {showSpeed && (
              <div>
                <div className="text-sm opacity-70">VELOCIDAD</div>
                <div className="text-2xl font-mono font-bold">
                  {formatSpeed(pos?.speed ?? null)}
                </div>
                <div className="text-sm opacity-50">
                  {formatPace(pos?.speed ?? null)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // COMPARE TWO MOTOS MODE
  if (mode === 'compare' && motoId1 && motoId2) {
    const moto1 = getMoto(motoId1);
    const moto2 = getMoto(motoId2);
    const pos1 = getPos(motoId1);
    const pos2 = getPos(motoId2);

    if (!moto1 || !moto2) return null;

    const distBetween = getDistanceBetween(pos1, pos2);
    const timeDiff = getTimeDifference(pos1, pos2);

    return (
      <div className="p-4 bg-transparent">
        <div className={`rounded-lg border p-4 ${baseClasses}`}>
          <div className="text-center text-sm opacity-70 mb-3">DIFERENCIA ENTRE MOTOS</div>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: moto1.color }} />
              <span className="font-semibold">{getMotoDisplayName(moto1)}</span>
            </div>
            <span className="text-lg font-bold">VS</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{getMotoDisplayName(moto2)}</span>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: moto2.color }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-sm opacity-70">DISTANCIA</div>
              <div className="text-3xl font-mono font-bold">
                {formatDistance(distBetween)}
              </div>
            </div>
            <div>
              <div className="text-sm opacity-70">TIEMPO</div>
              <div className="text-3xl font-mono font-bold">
                {formatTimeDiff(timeDiff)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LEADER COMPARISON MODE (moto vs first moto)
  if (mode === 'leader') {
    const firstMoto = getFirstMoto();
    const selectedMotos = [motoId2, motoId3].filter(Boolean).map(id => getMoto(id!)).filter(Boolean) as Moto[];

    if (!firstMoto || selectedMotos.length === 0) {
      return (
        <div className="p-4 bg-transparent">
          <div className={`rounded-lg border p-4 ${baseClasses}`}>
            <div className="text-center opacity-70">
              Esperando posiciones de motos...
            </div>
          </div>
        </div>
      );
    }

    const firstPos = positions.get(firstMoto.id);

    return (
      <div className="p-4 bg-transparent space-y-3">
        {/* First moto header */}
        <div className={`rounded-lg border-2 p-3 ${baseClasses}`} style={{ borderColor: firstMoto.color }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: firstMoto.color }} />
            <span className="font-bold">🏁 CABEZA: {getMotoDisplayName(firstMoto)}</span>
            <span className="ml-auto font-mono">
              {formatDistance(firstPos?.distance_from_start ? Number(firstPos.distance_from_start) : null)} recorridos
            </span>
          </div>
        </div>

        {/* Comparison with other motos */}
        {selectedMotos.map(moto => {
          const pos = positions.get(moto.id);
          const distBetween = getDistanceBetween(firstPos, pos);
          const timeDiff = getTimeDifference(firstPos, pos);

          return (
            <div 
              key={moto.id} 
              className={`rounded-lg border p-3 ${baseClasses}`}
              style={{ borderColor: moto.color }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: moto.color }} />
                  <span className="font-semibold">{getMotoDisplayName(moto)}</span>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <div className="text-xs opacity-70">DISTANCIA</div>
                    <div className="font-mono font-bold">{formatDistance(distBetween)}</div>
                  </div>
                  <div>
                    <div className="text-xs opacity-70">TIEMPO</div>
                    <div className="font-mono font-bold">{formatTimeDiff(timeDiff)}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Default: Show all motos
  return (
    <div className="p-4 bg-transparent space-y-2">
      {motos.map(moto => {
        const pos = positions.get(moto.id);
        return (
          <div 
            key={moto.id}
            className={`rounded-lg border p-3 ${baseClasses}`}
            style={{ borderColor: moto.color }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: moto.color }} />
                <span className="font-semibold">{getMotoDisplayName(moto)}</span>
              </div>
              <div className="flex gap-4 text-right">
                {showDistance && (
                  <div>
                    <div className="text-xs opacity-70">A META</div>
                    <div className="font-mono">{formatDistance(getDistanceToFinish(pos))}</div>
                  </div>
                )}
                {showSpeed && (
                  <div>
                    <div className="text-xs opacity-70">VELOCIDAD</div>
                    <div className="font-mono">{formatSpeed(pos?.speed ?? null)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MotoOverlay;
