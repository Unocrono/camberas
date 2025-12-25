import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNativeGeolocation, GeolocationResult } from '@/hooks/useNativeGeolocation';
import { useCheckpointFeedback } from '@/hooks/useCheckpointFeedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GPSMiniMap } from '@/components/GPSMiniMap';
import { ElevationMiniProfile } from '@/components/ElevationMiniProfile';
import { GPSSplashScreen } from '@/components/GPSSplashScreen';
import { AuthModal } from '@/components/AuthModal';
import gpsLogo from '@/assets/gps-icon.png';
import { parseGpxFile, GpxTrackPoint, calculateDistanceToFinish, getAllTrackPoints, findClosestTrackPoint, calculateDistanceFromStartToPoint } from '@/lib/gpxParser';
import { 
  Battery, Navigation, Clock, Wifi, WifiOff, MapPin, Radio,
  Gauge, Play, Square, RefreshCw, AlertTriangle,
  Smartphone, Download, Volume2, VolumeX, Target, Bike, LogIn, LogOut, User
} from 'lucide-react';

// Camberas brand color
const CAMBERAS_PINK = '#E91E8C';

const GPS_QUEUE_KEY = 'camberas_gps_queue';
const GPS_SESSION_KEY = 'camberas_gps_session';
const SPEED_PACE_PREF_KEY = 'camberas_speed_pace_pref';

// GPS Point for runners
interface GPSPoint {
  race_id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery_level: number;
  timestamp: string;
}

// GPS Point for motos
interface MotoGPSPoint {
  moto_id: string;
  race_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery_level: number;
  timestamp: string;
}

interface Race {
  id: string;
  name: string;
  date: string;
  gps_update_frequency: number | null;
  race_type: string;
}

interface Registration {
  id: string;
  race_id: string;
  race_distance_id: string;
  bib_number: number | null;
  race_distances: {
    name: string;
    distance_km: number;
    gps_tracking_enabled: boolean | null;
    gps_update_frequency: number | null;
  };
  races: Race;
  wave_start_time?: string | null;
}

interface MotoAssignment {
  id: string;
  moto_id: string;
  race_id: string;
  race_distance_id?: string | null;
  wave_start_time?: string | null;
  moto: {
    id: string;
    name: string;
    color: string;
    race: {
      id: string;
      name: string;
      date: string;
      gps_update_frequency: number | null;
    };
  };
}

interface Checkpoint {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number;
  checkpoint_order: number;
  distance_km: number;
  timing_point_id: string | null;
}

interface NextCheckpointInfo {
  name: string;
  distance_km: number;
  distance_remaining_km: number;
}

type AppMode = 'runner' | 'moto';

const GPSTrackerApp = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isNative, watchPosition, getCurrentPosition, clearWatch, requestPermissions } = useNativeGeolocation();
  
  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // App mode detection
  const [appMode, setAppMode] = useState<AppMode>('runner');
  const [motoAssignments, setMotoAssignments] = useState<MotoAssignment[]>([]);
  const [selectedMotoAssignment, setSelectedMotoAssignment] = useState<MotoAssignment | null>(null);
  
  // Sound/vibration settings
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('gps_sound_enabled');
    return stored !== 'false';
  });
  
  const { triggerCheckpointFeedback, vibrateGpsTick } = useCheckpointFeedback({
    enableSound: soundEnabled,
    enableVibration: true,
    soundVolume: 0.7,
  });
  
  // State
  const [isTracking, setIsTracking] = useState(false);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [battery, setBattery] = useState(100);
  const [lowBatteryMode, setLowBatteryMode] = useState(false);
  const [pendingPoints, setPendingPoints] = useState<(GPSPoint | MotoGPSPoint)[]>([]);
  const [stats, setStats] = useState({
    pointsSent: 0,
    distance: 0,
    speed: 0,
    elapsed: 0,
    lastUpdate: null as Date | null,
  });
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number; heading: number | null } | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [passedCheckpoints, setPassedCheckpoints] = useState<Set<string>>(new Set());
  const [showSplash, setShowSplash] = useState(true);
  const [showPace, setShowPace] = useState(() => {
    const stored = localStorage.getItem(SPEED_PACE_PREF_KEY);
    return stored === 'pace';
  });
  const [trackPoints, setTrackPoints] = useState<GpxTrackPoint[]>([]);
  const [distanceToFinish, setDistanceToFinish] = useState<number | null>(null);
  const [projectedDistanceKm, setProjectedDistanceKm] = useState<number | null>(null);
  const [nextCheckpoint, setNextCheckpoint] = useState<NextCheckpointInfo | null>(null);
  const [waveStartTime, setWaveStartTime] = useState<string | null>(null);
  
  // Refs
  const watchIdRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const lastPositionRef = useRef<{ latitude: number; longitude: number; altitude: number | null; accuracy: number | null; speed: number | null; timestamp: string } | null>(null);
  const wakeLockRef = useRef<any>(null);
  const passedCheckpointsRef = useRef<Set<string>>(new Set());

  // Check user role and determine app mode
  useEffect(() => {
    if (!user) return;
    
    const checkUserRole = async () => {
      try {
        // Check if user has moto role
        const { data: motoRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'moto')
          .maybeSingle();
        
        if (motoRole) {
          setAppMode('moto');
          // Use yesterday to include races from today that may have started earlier
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const minDate = yesterday.toISOString().split('T')[0];
          const allAssignments: MotoAssignment[] = [];
          
          // 1. Fetch motos directly assigned via user_id in race_motos
          const { data: directMotos, error: directError } = await supabase
            .from('race_motos')
            .select(`
              id,
              name,
              color,
              race_id,
              race_distance_id,
              races!race_motos_race_id_fkey (
                id,
                name,
                date,
                gps_update_frequency
              )
            `)
            .eq('user_id', user.id);
          
          console.log('Direct motos query result:', directMotos, directError);
          
          if (!directError && directMotos) {
            // Filter in JavaScript: races must exist and date >= minDate
            const validDirectMotos = directMotos
              .filter((m: any) => m.races !== null && m.races.date >= minDate)
              .map((m: any) => ({
                id: m.id,
                moto_id: m.id,
                race_id: m.race_id,
                race_distance_id: m.race_distance_id,
                moto: {
                  id: m.id,
                  name: m.name,
                  color: m.color,
                  race: m.races
                }
              }));
            allAssignments.push(...validDirectMotos);
          }
          
          // 2. Fetch moto assignments from moto_assignments table
          const { data: assignments, error: assignError } = await supabase
            .from('moto_assignments')
            .select(`
              id,
              moto_id,
              race_id,
              race_motos!moto_assignments_moto_id_fkey (
                id,
                name,
                color,
                race_distance_id,
                races!race_motos_race_id_fkey (
                  id,
                  name,
                  date,
                  gps_update_frequency
                )
              )
            `)
            .eq('user_id', user.id);
          
          console.log('Moto assignments query result:', assignments, assignError);
          
          if (!assignError && assignments) {
            const validAssignments = assignments
              .filter((a: any) => a.race_motos?.races?.date >= minDate)
              .map((a: any) => ({
                id: a.id,
                moto_id: a.moto_id,
                race_id: a.race_id,
                race_distance_id: a.race_motos.race_distance_id,
                moto: {
                  id: a.race_motos.id,
                  name: a.race_motos.name,
                  color: a.race_motos.color,
                  race: a.race_motos.races
                }
              }));
            
            // Add only if not already added from direct assignment
            validAssignments.forEach((a: MotoAssignment) => {
              if (!allAssignments.find(existing => existing.moto_id === a.moto_id)) {
                allAssignments.push(a);
              }
            });
          }
          
          // Fetch wave start times for moto races
          const raceIds = [...new Set(allAssignments.map(a => a.race_id))];
          if (raceIds.length > 0) {
            const { data: waves } = await supabase
              .from('race_waves')
              .select('race_id, start_time')
              .in('race_id', raceIds)
              .not('start_time', 'is', null)
              .order('start_time', { ascending: true });
            
            if (waves && waves.length > 0) {
              // Create a map of race_id to earliest wave start_time
              const waveMap = new Map<string, string>();
              waves.forEach(w => {
                if (!waveMap.has(w.race_id) && w.start_time) {
                  waveMap.set(w.race_id, w.start_time);
                }
              });
              
              // Add wave_start_time to assignments
              allAssignments.forEach(a => {
                a.wave_start_time = waveMap.get(a.race_id) || null;
              });
            }
          }
          
          setMotoAssignments(allAssignments);
          if (allAssignments.length === 1) {
            setSelectedMotoAssignment(allAssignments[0]);
          }
          setLoading(false);
        } else {
          // Runner mode - continue with normal flow
          setAppMode('runner');
        }
      } catch (error) {
        console.error('Error checking user role:', error);
        setAppMode('runner');
      }
    };
    
    checkUserRole();
  }, [user]);

  // Load pending points from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(GPS_QUEUE_KEY);
    if (stored) {
      try {
        setPendingPoints(JSON.parse(stored));
      } catch (e) {
        console.error('Error loading GPS queue:', e);
      }
    }
    
    const session = localStorage.getItem(GPS_SESSION_KEY);
    if (session) {
      try {
        const { registrationId, startTime, isTracking: wasTracking } = JSON.parse(session);
        if (wasTracking) {
          startTimeRef.current = new Date(startTime);
        }
      } catch (e) {
        console.error('Error restoring session:', e);
      }
    }
  }, []);

  // Save pending points to localStorage
  useEffect(() => {
    localStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(pendingPoints));
  }, [pendingPoints]);

  // Save speed/pace preference to localStorage
  useEffect(() => {
    localStorage.setItem(SPEED_PACE_PREF_KEY, showPace ? 'pace' : 'speed');
  }, [showPace]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingPoints();
    };
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Battery monitoring
  useEffect(() => {
    const checkBattery = async () => {
      if ('getBattery' in navigator) {
        try {
          const batteryInfo: any = await (navigator as any).getBattery();
          const level = Math.round(batteryInfo.level * 100);
          setBattery(level);
          setLowBatteryMode(level < 20);
          
          batteryInfo.addEventListener('levelchange', () => {
            const newLevel = Math.round(batteryInfo.level * 100);
            setBattery(newLevel);
            setLowBatteryMode(newLevel < 20);
            
            if (newLevel < 20 && !lowBatteryMode) {
              toast({
                title: '⚠️ Batería baja',
                description: 'Modo de ahorro activado. Frecuencia GPS reducida.',
                variant: 'destructive',
              });
            }
          });
        } catch (e) {
          console.error('Battery API error:', e);
        }
      }
    };
    checkBattery();
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Fetch user registrations with GPS enabled (runner mode only)
  useEffect(() => {
    if (!user || appMode === 'moto') return;
    
    const fetchRegistrations = async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('registrations')
          .select(`
            id,
            race_id,
            race_distance_id,
            bib_number,
            race_distances!inner (
              name,
              distance_km,
              gps_tracking_enabled,
              gps_update_frequency
            ),
            races!inner (
              id,
              name,
              date,
              gps_update_frequency,
              race_type
            )
          `)
          .eq('user_id', user.id)
          .in('status', ['confirmed', 'pending'])
          .gte('races.date', today)
          .order('races(date)', { ascending: true });

        if (error) throw error;
        
        const gpsEnabled = (data || []).filter((reg: any) => 
          reg.race_distances?.gps_tracking_enabled
        );
        
        const distanceIds = gpsEnabled.map((reg: any) => reg.race_distance_id);
        const { data: waves } = await supabase
          .from('race_waves')
          .select('race_distance_id, start_time')
          .in('race_distance_id', distanceIds);
        
        const waveMap = new Map((waves || []).map(w => [w.race_distance_id, w.start_time]));
        const registrationsWithWaves = gpsEnabled.map((reg: any) => ({
          ...reg,
          wave_start_time: waveMap.get(reg.race_distance_id) || null
        })) as Registration[];
        
        setRegistrations(registrationsWithWaves);
        
        if (registrationsWithWaves.length === 1) {
          const reg = registrationsWithWaves[0];
          setSelectedRegistration(reg);
          if (!localStorage.getItem(SPEED_PACE_PREF_KEY)) {
            setShowPace(reg.races.race_type === 'trail');
          }
        }
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchRegistrations();
  }, [user, appMode]);

  // Fetch checkpoints when registration is selected (runner mode) or moto selected (moto mode)
  useEffect(() => {
    // For moto mode, fetch checkpoints from the first distance with data
    if (appMode === 'moto') {
      if (!selectedMotoAssignment) {
        setCheckpoints([]);
        setNextCheckpoint(null);
        return;
      }

      const fetchMotoCheckpoints = async () => {
        try {
          // First try to get checkpoints from the specific distance assigned to the moto
          let distanceId = selectedMotoAssignment.race_distance_id;
          
          // If no specific distance, get the first distance with checkpoints
          if (!distanceId) {
            const { data: distances } = await supabase
              .from('race_distances')
              .select('id')
              .eq('race_id', selectedMotoAssignment.race_id)
              .limit(1)
              .maybeSingle();
            
            distanceId = distances?.id;
          }

          if (!distanceId) {
            setCheckpoints([]);
            return;
          }

          const { data, error } = await supabase
            .from('race_checkpoints')
            .select('id, name, latitude, longitude, geofence_radius, checkpoint_order, distance_km, timing_point_id')
            .eq('race_distance_id', distanceId)
            .order('checkpoint_order', { ascending: true });

          if (error) throw error;
          setCheckpoints((data || []) as Checkpoint[]);
        } catch (error) {
          console.error('Error fetching moto checkpoints:', error);
          setCheckpoints([]);
        }
      };

      fetchMotoCheckpoints();
      return;
    }

    // Runner mode
    if (!selectedRegistration) {
      setCheckpoints([]);
      setPassedCheckpoints(new Set());
      passedCheckpointsRef.current = new Set();
      setNextCheckpoint(null);
      return;
    }

    const fetchCheckpoints = async () => {
      try {
        const { data, error } = await supabase
          .from('race_checkpoints')
          .select('id, name, latitude, longitude, geofence_radius, checkpoint_order, distance_km, timing_point_id')
          .eq('race_distance_id', selectedRegistration.race_distance_id)
          .order('checkpoint_order', { ascending: true });

        if (error) throw error;
        setCheckpoints((data || []) as Checkpoint[]);
      } catch (error) {
        console.error('Error fetching checkpoints:', error);
      }
    };

    fetchCheckpoints();
  }, [selectedRegistration, selectedMotoAssignment, appMode]);

  // Load GPX track points (runner mode AND moto mode)
  useEffect(() => {
    // For moto mode, we need to fetch GPX from the race
    if (appMode === 'moto') {
      if (!selectedMotoAssignment) {
        setTrackPoints([]);
        setDistanceToFinish(null);
        return;
      }
      
      const loadMotoGpxTrack = async () => {
        try {
          // Fetch GPX from first distance with GPX
          const { data, error } = await supabase
            .from('race_distances')
            .select('gpx_file_url')
            .eq('race_id', selectedMotoAssignment.race_id)
            .not('gpx_file_url', 'is', null)
            .limit(1)
            .maybeSingle();

          if (error || !data?.gpx_file_url) {
            setTrackPoints([]);
            return;
          }

          const response = await fetch(data.gpx_file_url);
          const gpxText = await response.text();
          const parsedGpx = parseGpxFile(gpxText);
          const points = getAllTrackPoints(parsedGpx);
          setTrackPoints(points);
        } catch (error) {
          console.error('Error loading moto GPX track:', error);
          setTrackPoints([]);
        }
      };
      
      loadMotoGpxTrack();
      return;
    }
    
    // Runner mode
    if (!selectedRegistration) {
      setTrackPoints([]);
      setDistanceToFinish(null);
      return;
    }

    const loadGpxTrack = async () => {
      try {
        const { data, error } = await supabase
          .from('race_distances')
          .select('gpx_file_url')
          .eq('id', selectedRegistration.race_distance_id)
          .maybeSingle();

        if (error || !data?.gpx_file_url) {
          setTrackPoints([]);
          return;
        }

        const response = await fetch(data.gpx_file_url);
        const gpxText = await response.text();
        const parsedGpx = parseGpxFile(gpxText);
        const points = getAllTrackPoints(parsedGpx);
        setTrackPoints(points);
      } catch (error) {
        console.error('Error loading GPX:', error);
        setTrackPoints([]);
      }
    };

    loadGpxTrack();
  }, [selectedRegistration, selectedMotoAssignment, appMode]);

  // Recalculate distance to finish when position changes (runner and moto mode)
  useEffect(() => {
    if (!currentPosition || trackPoints.length === 0) {
      setDistanceToFinish(null);
      setProjectedDistanceKm(null);
      return;
    }

    const { index: closestIndex } = findClosestTrackPoint(
      trackPoints,
      currentPosition.lat,
      currentPosition.lng
    );

    const distanceFromStart = calculateDistanceFromStartToPoint(trackPoints, closestIndex);
    setProjectedDistanceKm(distanceFromStart);

    const distance = calculateDistanceToFinish(
      trackPoints,
      currentPosition.lat,
      currentPosition.lng
    );
    setDistanceToFinish(distance);
  }, [currentPosition, trackPoints]);

  // Calculate next checkpoint based on current projected distance (for moto mode primarily)
  useEffect(() => {
    if (checkpoints.length === 0 || projectedDistanceKm === null) {
      setNextCheckpoint(null);
      return;
    }

    // Find the next checkpoint that is ahead of the current position
    // Sort by distance_km ascending and find the first one > projectedDistanceKm
    const sortedCheckpoints = [...checkpoints].sort((a, b) => a.distance_km - b.distance_km);
    
    const next = sortedCheckpoints.find(cp => cp.distance_km > projectedDistanceKm);
    
    if (next) {
      setNextCheckpoint({
        name: next.name,
        distance_km: next.distance_km,
        distance_remaining_km: next.distance_km - projectedDistanceKm
      });
    } else {
      // All checkpoints passed, show last one (Meta) or null
      const lastCheckpoint = sortedCheckpoints[sortedCheckpoints.length - 1];
      if (lastCheckpoint) {
        const remaining = Math.max(0, lastCheckpoint.distance_km - projectedDistanceKm);
        setNextCheckpoint({
          name: lastCheckpoint.name,
          distance_km: lastCheckpoint.distance_km,
          distance_remaining_km: remaining
        });
      } else {
        setNextCheckpoint(null);
      }
    }
  }, [checkpoints, projectedDistanceKm]);

  // Subscribe to wave_start_time changes in real-time
  useEffect(() => {
    const distanceId = appMode === 'runner' 
      ? selectedRegistration?.race_distance_id 
      : selectedMotoAssignment?.race_distance_id;
    const raceId = appMode === 'runner'
      ? selectedRegistration?.race_id
      : selectedMotoAssignment?.race_id;
    
    console.log('[WaveStartTime] distanceId:', distanceId, 'raceId:', raceId, 'appMode:', appMode);
    
    if (!distanceId && !raceId) {
      setWaveStartTime(null);
      return;
    }

    // Initial fetch - ALWAYS filter by distanceId if available (more specific)
    const fetchWaveStartTime = async () => {
      let query = supabase.from('race_waves').select('start_time, race_distance_id');
      
      if (distanceId) {
        query = query.eq('race_distance_id', distanceId);
      } else if (raceId) {
        // Fallback to race_id only if no distanceId
        query = query.eq('race_id', raceId);
      }
      
      const { data, error } = await query.order('start_time', { ascending: false }).limit(1).maybeSingle();
      
      console.log('[WaveStartTime] Query result:', data, 'error:', error);
      
      if (!error && data?.start_time) {
        setWaveStartTime(data.start_time);
      } else {
        setWaveStartTime(null);
      }
    };
    
    fetchWaveStartTime();

    // Real-time subscription
    const channelFilter = distanceId 
      ? `race_distance_id=eq.${distanceId}`
      : `race_id=eq.${raceId}`;
    
    const channel = supabase
      .channel(`wave-start-${distanceId || raceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'race_waves',
          filter: channelFilter
        },
        (payload) => {
          console.log('Wave start time changed:', payload);
          const newStartTime = (payload.new as any)?.start_time;
          if (newStartTime) {
            setWaveStartTime(newStartTime);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRegistration?.race_distance_id, selectedRegistration?.race_id, selectedMotoAssignment?.race_distance_id, selectedMotoAssignment?.race_id, appMode]);

  // Elapsed time counter - uses wave start time for both runner and moto
  useEffect(() => {
    // Calculate elapsed time based on wave start time
    const calculateElapsed = () => {
      if (waveStartTime) {
        const startDate = new Date(waveStartTime);
        const elapsedSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
        return Math.max(0, elapsedSeconds);
      }
      return -1; // Negative to indicate no start time
    };
    
    // Update immediately
    const elapsed = calculateElapsed();
    setStats(prev => ({ ...prev, elapsed }));
    
    // Update every second
    const timer = setInterval(() => {
      const elapsed = calculateElapsed();
      setStats(prev => ({ ...prev, elapsed }));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [waveStartTime]);

  // Sync pending points
  const syncPendingPoints = useCallback(async () => {
    if (pendingPoints.length === 0 || !isOnline) return;
    
    try {
      const tableName = appMode === 'moto' ? 'moto_gps_tracking' : 'gps_tracking';
      
      if (appMode === 'moto') {
        // For moto mode, insert each point and call edge function
        for (const point of pendingPoints) {
          const { data: insertedData, error } = await supabase
            .from(tableName)
            .insert(point)
            .select('id')
            .single();
          
          if (error) throw error;
          
          // Call edge function to calculate distances
          if (insertedData?.id && 'moto_id' in point) {
            supabase.functions.invoke('process-moto-gps', {
              body: {
                moto_id: (point as any).moto_id,
                race_id: point.race_id,
                latitude: point.latitude,
                longitude: point.longitude,
                speed: point.speed,
                heading: point.heading,
                gps_id: insertedData.id
              }
            }).catch(err => console.error('Error calling process-moto-gps:', err));
          }
        }
      } else {
        // For runner mode, batch insert
        const { error } = await supabase.from(tableName).insert(pendingPoints);
        if (error) throw error;
      }
      
      setStats(prev => ({ ...prev, pointsSent: prev.pointsSent + pendingPoints.length }));
      setPendingPoints([]);
      
      toast({
        title: '✓ Sincronizado',
        description: `${pendingPoints.length} puntos GPS enviados`,
      });
    } catch (error: any) {
      console.error('Sync error:', error);
    }
  }, [pendingPoints, isOnline, appMode]);

  // Request wake lock
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (e) {
        console.error('Wake lock error:', e);
      }
    }
  };

  // Release wake lock
  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // Calculate distance between two points
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Handle GPS position - different logic for runners vs motos
  const handlePosition = useCallback(async (position: GeolocationResult | GeolocationPosition) => {
    const lat = 'coords' in position ? position.coords.latitude : position.latitude;
    const lng = 'coords' in position ? position.coords.longitude : position.longitude;
    const altitude = 'coords' in position ? position.coords.altitude : position.altitude;
    const accuracy = 'coords' in position ? position.coords.accuracy : position.accuracy;
    const speed = 'coords' in position ? position.coords.speed : position.speed;
    const heading = 'coords' in position ? (position.coords as any).heading : null;
    
    const timestampUtc = new Date().toISOString();
    
    setCurrentPosition({ lat, lng, heading });

    // Update distance
    if (lastPositionRef.current) {
      const dist = calculateDistance(lastPositionRef.current.latitude, lastPositionRef.current.longitude, lat, lng);
      setStats(prev => ({ ...prev, distance: prev.distance + dist }));
    }
    lastPositionRef.current = { latitude: lat, longitude: lng, altitude, accuracy, speed, timestamp: timestampUtc };

    // Update speed
    if (speed !== null) {
      setStats(prev => ({ ...prev, speed: speed! * 3.6 }));
    }

    if (appMode === 'moto' && selectedMotoAssignment) {
      // MOTO MODE
      const point: MotoGPSPoint = {
        moto_id: selectedMotoAssignment.moto_id,
        race_id: selectedMotoAssignment.race_id,
        latitude: lat,
        longitude: lng,
        altitude: altitude,
        accuracy: accuracy,
        speed: speed,
        heading: heading,
        battery_level: battery,
        timestamp: timestampUtc,
      };

      if (isOnline) {
        try {
          const { data: insertedData, error } = await supabase
            .from('moto_gps_tracking')
            .insert(point)
            .select('id')
            .single();
          if (error) throw error;
          
          // Call edge function to calculate distances from GPX
          if (insertedData?.id) {
            supabase.functions.invoke('process-moto-gps', {
              body: {
                moto_id: point.moto_id,
                race_id: point.race_id,
                latitude: point.latitude,
                longitude: point.longitude,
                speed: point.speed,
                heading: point.heading,
                gps_id: insertedData.id
              }
            }).catch(err => console.error('Error calling process-moto-gps:', err));
          }
          
          setStats(prev => ({ 
            ...prev, 
            pointsSent: prev.pointsSent + 1,
            lastUpdate: new Date(),
          }));
          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }
        } catch (error) {
          setPendingPoints(prev => [...prev, point]);
        }
      } else {
        setPendingPoints(prev => [...prev, point]);
        setStats(prev => ({ ...prev, lastUpdate: new Date() }));
      }
    } else if (appMode === 'runner' && selectedRegistration) {
      // RUNNER MODE
      const point: GPSPoint = {
        race_id: selectedRegistration.race_id,
        registration_id: selectedRegistration.id,
        latitude: lat,
        longitude: lng,
        altitude: altitude,
        accuracy: accuracy,
        speed: speed,
        heading: heading,
        battery_level: battery,
        timestamp: timestampUtc,
      };

      // Geofencing: Check if within any checkpoint radius
      for (const checkpoint of checkpoints) {
        if (!checkpoint.latitude || !checkpoint.longitude) continue;
        if (passedCheckpointsRef.current.has(checkpoint.id)) continue;
        
        const distToCheckpoint = calculateDistance(lat, lng, checkpoint.latitude, checkpoint.longitude);
        const radius = checkpoint.geofence_radius || 50;
        
        if (distToCheckpoint <= radius) {
          passedCheckpointsRef.current.add(checkpoint.id);
          setPassedCheckpoints(new Set(passedCheckpointsRef.current));
          
          const timingReading = {
            race_id: selectedRegistration.race_id,
            race_distance_id: selectedRegistration.race_distance_id,
            registration_id: selectedRegistration.id,
            bib_number: selectedRegistration.bib_number || 0,
            checkpoint_id: checkpoint.id,
            timing_point_id: checkpoint.timing_point_id,
            timing_timestamp: timestampUtc,
            reading_type: 'gps_auto',
            notes: `GPS auto: ${Math.round(distToCheckpoint)}m del checkpoint`,
          };
          
          try {
            const { error } = await supabase.from('timing_readings').insert(timingReading);
            if (!error) {
              triggerCheckpointFeedback();
              toast({
                title: `📍 ${checkpoint.name}`,
                description: `Paso registrado (GPS) - ${checkpoint.distance_km}km`,
              });
            }
          } catch (e) {
            console.error('Error registering GPS timing:', e);
          }
        }
      }

      if (isOnline) {
        try {
          const { error } = await supabase.from('gps_tracking').insert(point);
          if (error) throw error;
          setStats(prev => ({ 
            ...prev, 
            pointsSent: prev.pointsSent + 1,
            lastUpdate: new Date(),
          }));
          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }
        } catch (error) {
          setPendingPoints(prev => [...prev, point]);
        }
      } else {
        setPendingPoints(prev => [...prev, point]);
        setStats(prev => ({ ...prev, lastUpdate: new Date() }));
      }
    }
  }, [selectedRegistration, selectedMotoAssignment, appMode, battery, isOnline, checkpoints, toast, triggerCheckpointFeedback]);

  // Start tracking
  const startTracking = useCallback(async () => {
    if (appMode === 'moto' && !selectedMotoAssignment) {
      toast({
        title: 'Moto no seleccionada',
        description: 'Selecciona una moto primero',
        variant: 'destructive',
      });
      return;
    }
    
    if (appMode === 'runner' && !selectedRegistration) {
      toast({
        title: 'GPS no disponible',
        description: 'Selecciona una carrera primero',
        variant: 'destructive',
      });
      return;
    }

    const hasPerms = await requestPermissions();
    if (!hasPerms) {
      toast({
        title: 'Permisos requeridos',
        description: 'Necesitas permitir acceso al GPS para usar el tracking',
        variant: 'destructive',
      });
      return;
    }

    const frequency = lowBatteryMode 
      ? 60 
      : (appMode === 'moto' 
          ? (selectedMotoAssignment?.moto.race.gps_update_frequency || 10)
          : (selectedRegistration?.race_distances?.gps_update_frequency || 
             selectedRegistration?.races?.gps_update_frequency || 
             30));

    const initialPos = await getCurrentPosition({ 
      enableHighAccuracy: !lowBatteryMode, 
      timeout: 10000 
    });
    if (initialPos) {
      handlePosition(initialPos);
    }

    const watchId = await watchPosition(
      (position) => handlePosition(position),
      { 
        enableHighAccuracy: !lowBatteryMode, 
        timeout: 15000 
      }
    );
    watchIdRef.current = watchId;

    intervalRef.current = setInterval(async () => {
      const pos = await getCurrentPosition({ 
        enableHighAccuracy: !lowBatteryMode, 
        timeout: 10000 
      });
      if (pos) {
        handlePosition(pos);
      }
    }, frequency * 1000);

    startTimeRef.current = new Date();
    setIsTracking(true);
    requestWakeLock();
    
    localStorage.setItem(GPS_SESSION_KEY, JSON.stringify({
      registrationId: appMode === 'runner' ? selectedRegistration?.id : selectedMotoAssignment?.id,
      startTime: startTimeRef.current.toISOString(),
      isTracking: true,
      mode: appMode,
    }));

    toast({
      title: appMode === 'moto' ? '🏍️ Tracking moto iniciado' : '🏃 Tracking iniciado',
      description: isNative 
        ? `Modo nativo activado. Frecuencia: cada ${frequency}s`
        : `Frecuencia: cada ${frequency}s`,
    });
  }, [selectedRegistration, selectedMotoAssignment, appMode, lowBatteryMode, handlePosition, requestPermissions, getCurrentPosition, watchPosition, isNative]);

  // Stop tracking
  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null) {
      await clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    releaseWakeLock();
    setIsTracking(false);
    localStorage.removeItem(GPS_SESSION_KEY);
    
    syncPendingPoints();
    
    toast({
      title: '⏹ Tracking detenido',
      description: `Total: ${stats.pointsSent + pendingPoints.length} puntos`,
    });
  }, [stats.pointsSent, pendingPoints.length, syncPendingPoints, clearWatch]);

  // Install PWA
  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  // Format time
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Format distance
  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  // Auth redirect
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-4">
            <MapPin className="h-16 w-16 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">Camberas GPS</h1>
            <p className="text-muted-foreground">Inicia sesión para compartir tu ubicación durante la carrera</p>
            <Button onClick={() => setShowAuthModal(true)} className="w-full">
              <LogIn className="h-4 w-4 mr-2" />
              Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
        
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          appName="Camberas GPS"
        />
      </div>
    );
  }

  // Loading
  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  // No GPS races/motos
  if (appMode === 'runner' && registrations.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-4">
            <Navigation className="h-16 w-16 mx-auto text-muted-foreground" />
            <h1 className="text-xl font-bold">Sin carreras con GPS</h1>
            <p className="text-muted-foreground text-sm">
              No tienes inscripciones en carreras con seguimiento GPS habilitado
            </p>
            <Button variant="outline" onClick={() => navigate('/races')}>
              Ver Carreras
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (appMode === 'moto' && motoAssignments.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-4">
            <Bike className="h-16 w-16 mx-auto text-muted-foreground" />
            <h1 className="text-xl font-bold">Sin motos asignadas</h1>
            <p className="text-muted-foreground text-sm">
              No tienes asignaciones de moto para carreras próximas
            </p>
            <Button variant="outline" onClick={() => navigate('/')}>
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Splash screen
  if (showSplash) {
    return <GPSSplashScreen onComplete={() => setShowSplash(false)} duration={2500} />;
  }

  const currentRaceId = appMode === 'moto' ? selectedMotoAssignment?.race_id : selectedRegistration?.race_id;
  const currentDistanceId = appMode === 'moto' 
    ? selectedMotoAssignment?.race_distance_id 
    : selectedRegistration?.race_distance_id;

  // Moto color for theming
  const motoColor = selectedMotoAssignment?.moto.color || CAMBERAS_PINK;
  const themeColor = appMode === 'moto' ? motoColor : CAMBERAS_PINK;

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-inset-top"
         style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header - Camberas branded with moto color */}
      <header 
        className="border-b p-4 flex items-center justify-between"
        style={{ 
          background: appMode === 'moto' 
            ? `linear-gradient(135deg, #0a0a0a 0%, ${motoColor}20 100%)` 
            : 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
          borderBottomColor: appMode === 'moto' ? `${motoColor}40` : undefined
        }}
      >
        <div className="flex items-center gap-2">
          <img src={gpsLogo} alt="Camberas GPS" className="h-8 w-8 rounded-full" />
          <span className="font-bold text-white" style={{ color: themeColor }}>
            {appMode === 'moto' ? 'Camberas Moto GPS' : 'Camberas GPS'}
          </span>
          {appMode === 'moto' && selectedMotoAssignment && (
            <Badge 
              variant="outline" 
              className="ml-2"
              style={{ 
                borderColor: motoColor, 
                color: motoColor,
                backgroundColor: `${motoColor}15`
              }}
            >
              <Bike className="h-3 w-3 mr-1" />
              {selectedMotoAssignment.moto.name}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Sound toggle */}
          <button
            onClick={() => {
              const newValue = !soundEnabled;
              setSoundEnabled(newValue);
              localStorage.setItem('gps_sound_enabled', String(newValue));
              if (newValue) {
                triggerCheckpointFeedback();
              }
            }}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title={soundEnabled ? 'Sonido activado' : 'Sonido desactivado'}
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4" style={{ color: CAMBERAS_PINK }} />
            ) : (
              <VolumeX className="h-4 w-4 text-white/50" />
            )}
          </button>
          
          {/* Status indicators - stacked vertically */}
          <div className="flex flex-col gap-0.5">
            {isOnline ? (
              <Badge variant="outline" className="border-emerald-500 text-emerald-400 bg-emerald-500/10 text-xs px-1.5 py-0">
                <Wifi className="h-3 w-3 mr-1" /> Online
              </Badge>
            ) : (
              <Badge variant="outline" className="border-orange-500 text-orange-400 bg-orange-500/10 text-xs px-1.5 py-0">
                <WifiOff className="h-3 w-3 mr-1" /> Offline
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`text-xs px-1.5 py-0 ${battery < 20 ? "border-red-500 text-red-400 bg-red-500/10" : "border-white/30 text-white/70"}`}
            >
              <Battery className="h-3 w-3 mr-1" /> {battery}%
            </Badge>
          </div>
          
          {/* Logout button - emphasized */}
          <button
            onClick={() => {
              if (isTracking) {
                toast({
                  title: 'Tracking activo',
                  description: 'Detén el tracking antes de cerrar sesión',
                  variant: 'destructive',
                });
                return;
              }
              signOut();
              toast({
                title: 'Sesión cerrada',
                description: 'Has cerrado sesión correctamente',
              });
            }}
            className="p-2 rounded-md bg-red-500/20 hover:bg-red-500/30 transition-colors border border-red-500/40 ml-1"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4 text-red-400" />
          </button>
        </div>
      </header>

      {/* Install Banner */}
      {showInstallPrompt && (
        <div 
          className="border-b p-3 flex items-center justify-between"
          style={{ background: `${CAMBERAS_PINK}15`, borderColor: `${CAMBERAS_PINK}30` }}
        >
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="h-4 w-4" style={{ color: CAMBERAS_PINK }} />
            <span>Instala la app para mejor experiencia</span>
          </div>
          <Button 
            size="sm" 
            onClick={handleInstallPWA}
            style={{ backgroundColor: CAMBERAS_PINK, color: 'white' }}
            className="hover:opacity-90"
          >
            <Download className="h-4 w-4 mr-1" /> Instalar
          </Button>
        </div>
      )}

      {/* Low Battery Warning */}
      {lowBatteryMode && (
        <div className="bg-destructive/10 border-b border-destructive/20 p-2 flex items-center justify-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span>Modo ahorro de batería activado</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 space-y-4">
        {/* Moto Selector */}
        {appMode === 'moto' && !isTracking && motoAssignments.length > 1 && (
          <Card>
            <CardContent className="pt-4">
              <label className="text-sm text-muted-foreground mb-2 block">Selecciona moto</label>
              <Select 
                value={selectedMotoAssignment?.id || ''} 
                onValueChange={(val) => {
                  const assignment = motoAssignments.find(a => a.id === val) || null;
                  setSelectedMotoAssignment(assignment);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una moto" />
                </SelectTrigger>
                <SelectContent>
                  {motoAssignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: a.moto.color }}
                        />
                        {a.moto.name} - {a.moto.race.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Race Selector (Runner mode) */}
        {appMode === 'runner' && !isTracking && registrations.length > 1 && (
          <Card>
            <CardContent className="pt-4">
              <label className="text-sm text-muted-foreground mb-2 block">Selecciona carrera</label>
              <Select 
                value={selectedRegistration?.id || ''} 
                onValueChange={(val) => {
                  const reg = registrations.find(r => r.id === val) || null;
                  setSelectedRegistration(reg);
                  if (reg && !localStorage.getItem(SPEED_PACE_PREF_KEY)) {
                    setShowPace(reg.races.race_type === 'trail');
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una carrera" />
                </SelectTrigger>
                <SelectContent>
                  {registrations.map((reg) => (
                    <SelectItem key={reg.id} value={reg.id}>
                      {reg.races.name} - {reg.race_distances.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Race/Moto Info */}
        {(selectedRegistration || selectedMotoAssignment) && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {appMode === 'moto' && selectedMotoAssignment ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: selectedMotoAssignment.moto.color }}
                        />
                        <h2 className="font-semibold truncate">{selectedMotoAssignment.moto.name}</h2>
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedMotoAssignment.moto.race.name}</p>
                    </>
                  ) : selectedRegistration ? (
                    <>
                      <h2 className="font-semibold truncate">{selectedRegistration.races.name}</h2>
                      <p className="text-sm text-muted-foreground">{selectedRegistration.race_distances.name}</p>
                    </>
                  ) : null}
                </div>
                
                {/* Start/Stop Button */}
                {!isTracking ? (
                  <Button 
                    onClick={startTracking} 
                    size="sm"
                    className="text-white px-3 py-1 h-8 text-xs"
                    style={{ backgroundColor: themeColor }}
                    disabled={appMode === 'moto' ? !selectedMotoAssignment : !selectedRegistration}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Iniciar
                  </Button>
                ) : (
                  <Button 
                    onClick={stopTracking} 
                    variant="destructive" 
                    size="sm"
                    className="px-3 py-1 h-8 text-xs"
                  >
                    <Square className="h-3 w-3 mr-1" />
                    Detener
                  </Button>
                )}

                {appMode === 'runner' && selectedRegistration?.bib_number && (
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    #{selectedRegistration.bib_number}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-mono font-bold">
                {stats.elapsed >= 0 ? formatTime(stats.elapsed) : '--:--:--'}
              </div>
              <div className="text-xs text-muted-foreground">
                {waveStartTime ? 'Tiempo carrera' : 'Sin hora salida'}
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowPace(!showPace)}
          >
            <CardContent className="pt-4 text-center">
              <Gauge className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              {showPace ? (
                <>
                  <div className="text-2xl font-mono font-bold">
                    {stats.speed > 0 ? `${Math.floor(60 / stats.speed)}:${String(Math.round((60 / stats.speed % 1) * 60)).padStart(2, '0')}` : '--:--'}
                  </div>
                  <div className="text-xs text-muted-foreground">min/km</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-mono font-bold">{stats.speed.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">km/h</div>
                </>
              )}
            </CardContent>
          </Card>
          
          {/* Distance to finish - for both runner and moto */}
          <Card style={appMode === 'moto' ? { borderColor: `${motoColor}30` } : undefined}>
            <CardContent className="pt-4 text-center">
              <Target className="h-5 w-5 mx-auto mb-1" style={appMode === 'moto' ? { color: motoColor } : undefined} />
              <div className="text-2xl font-mono font-bold" style={appMode === 'moto' ? { color: motoColor } : undefined}>
                {distanceToFinish !== null 
                  ? formatDistance(distanceToFinish * 1000)
                  : selectedRegistration?.race_distances?.distance_km 
                    ? formatDistance((selectedRegistration.race_distances.distance_km * 1000) - stats.distance)
                    : '--'}
              </div>
              <div className="text-xs text-muted-foreground">A meta</div>
            </CardContent>
          </Card>

          {/* Next checkpoint - for both runner and moto */}
          <Card style={appMode === 'moto' ? { borderColor: `${motoColor}30` } : undefined}>
            <CardContent className="pt-4 text-center">
              <Navigation className="h-5 w-5 mx-auto mb-1" style={appMode === 'moto' ? { color: motoColor } : undefined} />
              {nextCheckpoint ? (
                <>
                  <div className="text-2xl font-mono font-bold" style={appMode === 'moto' ? { color: motoColor } : undefined}>
                    {nextCheckpoint.distance_remaining_km.toFixed(1)} km
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-full" title={nextCheckpoint.name}>
                    → {nextCheckpoint.name}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-mono font-bold" style={appMode === 'moto' ? { color: motoColor } : undefined}>--</div>
                  <div className="text-xs text-muted-foreground">Próximo control</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mini Map */}
        <Card>
          <CardContent className="p-2">
            <GPSMiniMap 
              latitude={currentPosition?.lat || null}
              longitude={currentPosition?.lng || null}
              heading={currentPosition?.heading}
              distanceId={currentDistanceId}
              raceId={currentRaceId}
              distanceTraveled={stats.distance}
              totalDistance={appMode === 'runner' ? selectedRegistration?.race_distances?.distance_km : undefined}
              className="h-48 w-full"
            />
          </CardContent>
        </Card>

        {/* Elevation Profile (both runner and moto modes) */}
        {appMode === 'runner' && selectedRegistration && (
          <ElevationMiniProfile
            distanceId={selectedRegistration.race_distance_id}
            currentDistanceKm={projectedDistanceKm ?? stats.distance / 1000}
            checkpoints={checkpoints.map(cp => ({ name: cp.name, distance_km: cp.distance_km }))}
          />
        )}
        {appMode === 'moto' && selectedMotoAssignment && selectedMotoAssignment.race_distance_id && (
          <ElevationMiniProfile
            distanceId={selectedMotoAssignment.race_distance_id}
            currentDistanceKm={projectedDistanceKm ?? 0}
            checkpoints={checkpoints.map(cp => ({ name: cp.name, distance_km: cp.distance_km }))}
          />
        )}

        {/* Pending Points */}
        {pendingPoints.length > 0 && (
          <Card className="border-orange-500/50">
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-orange-500" />
                <span className="text-sm">{pendingPoints.length} puntos pendientes</span>
              </div>
              <Button size="sm" variant="outline" onClick={syncPendingPoints} disabled={!isOnline}>
                <RefreshCw className="h-4 w-4 mr-1" /> Sincronizar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Last Update & Points Sent */}
        {(stats.lastUpdate || stats.pointsSent > 0) && (
          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground px-2">
            <div className="text-center">
              <div className="font-medium">Última actualización</div>
              <div>{stats.lastUpdate ? stats.lastUpdate.toLocaleTimeString('es-ES') : '--:--:--'}</div>
            </div>
            <div className="text-center">
              <div className="font-medium">Puntos enviados</div>
              <div className="flex items-center justify-center gap-1">
                <Radio className={`h-3 w-3 ${isTracking ? 'text-green-500 animate-pulse' : ''}`} />
                {stats.pointsSent}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom padding for safe area */}
      <div className="p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} />
      
      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        appName="Camberas GPS"
      />
    </div>
  );
};

export default GPSTrackerApp;
