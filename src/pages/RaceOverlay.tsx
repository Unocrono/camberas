import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Trophy, MapPin, Clock, TrendingUp } from 'lucide-react';

interface RunnerPosition {
  id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  timestamp: string;
  registration: {
    bib_number: number;
    profiles: {
      first_name: string;
      last_name: string;
    };
  };
}

interface RaceResult {
  id: string;
  overall_position: number;
  finish_time: string;
  registration: {
    bib_number: number;
    profiles: {
      first_name: string;
      last_name: string;
    };
  };
}

const RaceOverlay = () => {
  const { raceId } = useParams<{ raceId: string }>();
  const [topRunners, setTopRunners] = useState<RaceResult[]>([]);
  const [livePositions, setLivePositions] = useState<RunnerPosition[]>([]);
  const [raceName, setRaceName] = useState('');

  useEffect(() => {
    if (!raceId) return;

    const fetchRaceData = async () => {
      // Fetch race name
      const { data: raceData } = await supabase
        .from('races')
        .select('name')
        .eq('id', raceId)
        .single();

      if (raceData) setRaceName(raceData.name);

      // Fetch top 3 runners
      const { data: results } = await supabase
        .from('race_results')
        .select(`
          id,
          overall_position,
          finish_time,
          registration:registrations(
            bib_number,
            profiles(first_name, last_name)
          )
        `)
        .eq('registrations.race_id', raceId)
        .order('overall_position', { ascending: true })
        .limit(3);

      if (results) setTopRunners(results as any);

      // Fetch latest GPS positions
      const { data: positions } = await supabase
        .from('gps_tracking')
        .select(`
          id,
          registration_id,
          latitude,
          longitude,
          speed,
          timestamp,
          registration:registrations(
            bib_number,
            profiles(first_name, last_name)
          )
        `)
        .eq('race_id', raceId)
        .order('timestamp', { ascending: false })
        .limit(10);

      if (positions) setLivePositions(positions as any);
    };

    fetchRaceData();

    // Subscribe to GPS updates
    const gpsChannel = supabase
      .channel('gps-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gps_tracking',
          filter: `race_id=eq.${raceId}`,
        },
        () => {
          fetchRaceData();
        }
      )
      .subscribe();

    // Subscribe to results updates
    const resultsChannel = supabase
      .channel('results-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'race_results',
        },
        () => {
          fetchRaceData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gpsChannel);
      supabase.removeChannel(resultsChannel);
    };
  }, [raceId]);

  const formatTime = (interval: string) => {
    const match = interval.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return interval;
    return `${match[1]}:${match[2]}:${match[3]}`;
  };

  const formatSpeed = (speed: number | null) => {
    if (!speed) return 'N/A';
    return `${(speed * 3.6).toFixed(1)} km/h`;
  };

  return (
    <div className="min-h-screen bg-transparent p-4">
      {/* Race Title Overlay */}
      <div className="mb-6">
        <Card className="bg-gradient-to-r from-primary/90 to-primary-glow/90 backdrop-blur-sm border-0">
          <div className="px-6 py-4">
            <h1 className="text-3xl font-bold text-white text-center tracking-wide">
              {raceName}
            </h1>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top 3 Leaderboard */}
        <Card className="bg-background/90 backdrop-blur-sm border-2 border-primary/20">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Trophy className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Top 3</h2>
            </div>
            <div className="space-y-3">
              {topRunners.map((runner, index) => (
                <div
                  key={runner.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-accent/50 border border-primary/10"
                >
                  <div className="flex items-center gap-4">
                    <div className={`text-2xl font-bold ${
                      index === 0 ? 'text-yellow-500' :
                      index === 1 ? 'text-gray-400' :
                      'text-amber-700'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-lg text-foreground">
                        {runner.registration.profiles.first_name} {runner.registration.profiles.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Dorsal #{runner.registration.bib_number}
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-mono font-bold text-primary">
                    {formatTime(runner.finish_time)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Live GPS Positions */}
        <Card className="bg-background/90 backdrop-blur-sm border-2 border-primary/20">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <MapPin className="h-6 w-6 text-primary animate-pulse" />
              <h2 className="text-2xl font-bold text-foreground">En Vivo</h2>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {livePositions.slice(0, 5).map((position) => (
                <div
                  key={position.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-accent/50 border border-primary/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <div>
                      <div className="font-semibold text-foreground">
                        {position.registration.profiles.first_name} {position.registration.profiles.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Dorsal #{position.registration.bib_number}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-sm font-mono font-semibold text-primary">
                      {formatSpeed(position.speed)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Stats Bar at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4">
        <Card className="bg-gradient-to-r from-primary/90 to-primary-glow/90 backdrop-blur-sm border-0">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-white" />
              <span className="text-white font-semibold">
                {new Date().toLocaleTimeString('es-ES')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-white font-semibold">EN DIRECTO</span>
            </div>
            <div className="text-white font-semibold">
              {livePositions.length} corredores activos
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RaceOverlay;
