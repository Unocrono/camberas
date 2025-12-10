import { useEffect, useState, useRef, useCallback } from 'react';
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
import { 
  Radio, Battery, Navigation, Clock, Wifi, WifiOff, 
  MapPin, Gauge, Play, Square, RefreshCw, AlertTriangle,
  Smartphone, Download, Volume2, VolumeX
} from 'lucide-react';

const GPS_QUEUE_KEY = 'camberas_gps_queue';
const GPS_SESSION_KEY = 'camberas_gps_session';

interface GPSPoint {
  race_id: string;
  registration_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  battery_level: number;
  timestamp: string;
}

interface Race {
  id: string;
  name: string;
  date: string;
  gps_update_frequency: number | null;
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

const GPSTrackerApp = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isNative, watchPosition, getCurrentPosition, clearWatch, requestPermissions } = useNativeGeolocation();
  
  // Sound/vibration settings
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('gps_sound_enabled');
    return stored !== 'false'; // Default to true
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
  const [pendingPoints, setPendingPoints] = useState<GPSPoint[]>([]);
  const [stats, setStats] = useState({
    pointsSent: 0,
    distance: 0,
    speed: 0,
    elapsed: 0,
    lastUpdate: null as Date | null,
  });
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [passedCheckpoints, setPassedCheckpoints] = useState<Set<string>>(new Set());
  
  // Refs
  const watchIdRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const lastPositionRef = useRef<{ latitude: number; longitude: number; altitude: number | null; accuracy: number | null; speed: number | null; timestamp: string } | null>(null);
  const wakeLockRef = useRef<any>(null);
  const passedCheckpointsRef = useRef<Set<string>>(new Set());

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
    
    // Restore session
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

  // Fetch user registrations with GPS enabled
  useEffect(() => {
    if (!user) return;
    
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
              gps_update_frequency
            )
          `)
          .eq('user_id', user.id)
          .in('status', ['confirmed', 'pending'])
          .gte('races.date', today)
          .order('races(date)', { ascending: true });

        if (error) throw error;
        
        // Filter registrations where GPS is enabled
        const gpsEnabled = (data || []).filter((reg: any) => 
          reg.race_distances?.gps_tracking_enabled
        ) as Registration[];
        
        setRegistrations(gpsEnabled);
        
        if (gpsEnabled.length === 1) {
          setSelectedRegistration(gpsEnabled[0]);
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
  }, [user]);

  // Fetch checkpoints when registration is selected
  useEffect(() => {
    if (!selectedRegistration) {
      setCheckpoints([]);
      setPassedCheckpoints(new Set());
      passedCheckpointsRef.current = new Set();
      return;
    }

    const fetchCheckpoints = async () => {
      try {
        const { data, error } = await supabase
          .from('race_checkpoints')
          .select('id, name, latitude, longitude, geofence_radius, checkpoint_order, distance_km, timing_point_id')
          .eq('race_distance_id', selectedRegistration.race_distance_id)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('checkpoint_order', { ascending: true });

        if (error) throw error;
        setCheckpoints((data || []) as Checkpoint[]);
      } catch (error) {
        console.error('Error fetching checkpoints:', error);
      }
    };

    fetchCheckpoints();
  }, [selectedRegistration]);

  // Elapsed time counter
  useEffect(() => {
    if (!isTracking || !startTimeRef.current) return;
    
    const timer = setInterval(() => {
      setStats(prev => ({
        ...prev,
        elapsed: Math.floor((Date.now() - startTimeRef.current!.getTime()) / 1000),
      }));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isTracking]);

  // Sync pending points
  const syncPendingPoints = useCallback(async () => {
    if (pendingPoints.length === 0 || !isOnline) return;
    
    try {
      const { error } = await supabase.from('gps_tracking').insert(pendingPoints);
      
      if (error) throw error;
      
      setStats(prev => ({ ...prev, pointsSent: prev.pointsSent + pendingPoints.length }));
      setPendingPoints([]);
      
      toast({
        title: '✓ Sincronizado',
        description: `${pendingPoints.length} puntos GPS enviados`,
      });
    } catch (error: any) {
      console.error('Sync error:', error);
    }
  }, [pendingPoints, isOnline]);

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

  // Handle GPS position - accepts both native and web format
  const handlePosition = useCallback(async (position: GeolocationResult | GeolocationPosition) => {
    if (!selectedRegistration) return;
    
    // Normalize position data (works with both native and web)
    const lat = 'coords' in position ? position.coords.latitude : position.latitude;
    const lng = 'coords' in position ? position.coords.longitude : position.longitude;
    const altitude = 'coords' in position ? position.coords.altitude : position.altitude;
    const accuracy = 'coords' in position ? position.coords.accuracy : position.accuracy;
    const speed = 'coords' in position ? position.coords.speed : position.speed;
    const now = new Date().toISOString();
    
    // Update current position for mini-map
    setCurrentPosition({ lat, lng });
    
    const point: GPSPoint = {
      race_id: selectedRegistration.race_id,
      registration_id: selectedRegistration.id,
      latitude: lat,
      longitude: lng,
      altitude: altitude,
      accuracy: accuracy,
      speed: speed,
      battery_level: battery,
      timestamp: now,
    };

    // Update distance using stored last position
    if (lastPositionRef.current) {
      const dist = calculateDistance(lastPositionRef.current.latitude, lastPositionRef.current.longitude, lat, lng);
      setStats(prev => ({ ...prev, distance: prev.distance + dist }));
    }
    lastPositionRef.current = { latitude: lat, longitude: lng, altitude, accuracy, speed, timestamp: now };

    // Update speed
    if (speed !== null) {
      setStats(prev => ({ ...prev, speed: speed! * 3.6 })); // m/s to km/h
    }

    // Geofencing: Check if within any checkpoint radius
    for (const checkpoint of checkpoints) {
      if (!checkpoint.latitude || !checkpoint.longitude) continue;
      if (passedCheckpointsRef.current.has(checkpoint.id)) continue;
      
      const distToCheckpoint = calculateDistance(lat, lng, checkpoint.latitude, checkpoint.longitude);
      const radius = checkpoint.geofence_radius || 50;
      
      if (distToCheckpoint <= radius) {
        // Mark as passed to avoid duplicate registrations
        passedCheckpointsRef.current.add(checkpoint.id);
        setPassedCheckpoints(new Set(passedCheckpointsRef.current));
        
        // Register timing reading via GPS
        const timingReading = {
          race_id: selectedRegistration.race_id,
          race_distance_id: selectedRegistration.race_distance_id,
          registration_id: selectedRegistration.id,
          bib_number: selectedRegistration.bib_number || 0,
          checkpoint_id: checkpoint.id,
          timing_point_id: checkpoint.timing_point_id,
          timing_timestamp: now,
          reading_type: 'gps_auto',
          notes: `GPS auto: ${Math.round(distToCheckpoint)}m del checkpoint`,
        };
        
        try {
          const { error } = await supabase.from('timing_readings').insert(timingReading);
          if (!error) {
            // Trigger haptic + sound feedback
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

    // Send or queue GPS point
    if (isOnline) {
      try {
        const { error } = await supabase.from('gps_tracking').insert(point);
        if (error) throw error;
        setStats(prev => ({ 
          ...prev, 
          pointsSent: prev.pointsSent + 1,
          lastUpdate: new Date(),
        }));
        
        // Vibrate on success
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
  }, [selectedRegistration, battery, isOnline, checkpoints, toast, triggerCheckpointFeedback]);

  // Start tracking - uses native Capacitor API for background support
  const startTracking = useCallback(async () => {
    if (!selectedRegistration) {
      toast({
        title: 'GPS no disponible',
        description: 'Selecciona una carrera primero',
        variant: 'destructive',
      });
      return;
    }

    // Request permissions first
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
      : (selectedRegistration.race_distances?.gps_update_frequency || 
         selectedRegistration.races?.gps_update_frequency || 
         30);

    // Initial position
    const initialPos = await getCurrentPosition({ 
      enableHighAccuracy: !lowBatteryMode, 
      timeout: 10000 
    });
    if (initialPos) {
      handlePosition(initialPos);
    }

    // Watch position using native API (supports background on native)
    const watchId = await watchPosition(
      (position) => handlePosition(position),
      { 
        enableHighAccuracy: !lowBatteryMode, 
        timeout: 15000 
      }
    );
    watchIdRef.current = watchId;

    // Interval for periodic updates (backup)
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
    
    // Save session
    localStorage.setItem(GPS_SESSION_KEY, JSON.stringify({
      registrationId: selectedRegistration.id,
      startTime: startTimeRef.current.toISOString(),
      isTracking: true,
    }));

    toast({
      title: '🏃 Tracking iniciado',
      description: isNative 
        ? `Modo nativo activado. Frecuencia: cada ${frequency}s`
        : `Frecuencia: cada ${frequency}s`,
    });
  }, [selectedRegistration, lowBatteryMode, handlePosition, requestPermissions, getCurrentPosition, watchPosition, isNative]);

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
    
    // Sync remaining points
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
            <Button onClick={() => navigate('/auth?returnTo=/track')} className="w-full">
              Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
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

  // No GPS races
  if (registrations.length === 0) {
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

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-inset-top"
         style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <header className="bg-card border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          <span className="font-bold">Camberas GPS</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button
            onClick={() => {
              const newValue = !soundEnabled;
              setSoundEnabled(newValue);
              localStorage.setItem('gps_sound_enabled', String(newValue));
              if (newValue) {
                // Play a test sound to confirm
                triggerCheckpointFeedback();
              }
            }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title={soundEnabled ? 'Sonido activado' : 'Sonido desactivado'}
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-primary" />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          {isOnline ? (
            <Badge variant="outline" className="text-green-500 border-green-500">
              <Wifi className="h-3 w-3 mr-1" /> Online
            </Badge>
          ) : (
            <Badge variant="outline" className="text-orange-500 border-orange-500">
              <WifiOff className="h-3 w-3 mr-1" /> Offline
            </Badge>
          )}
          <Badge variant={battery < 20 ? "destructive" : "outline"}>
            <Battery className="h-3 w-3 mr-1" /> {battery}%
          </Badge>
        </div>
      </header>

      {/* Install Banner */}
      {showInstallPrompt && (
        <div className="bg-primary/10 border-b border-primary/20 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="h-4 w-4" />
            <span>Instala la app para mejor experiencia</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleInstallPWA}>
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
        {/* Race Selector */}
        {!isTracking && registrations.length > 1 && (
          <Card>
            <CardContent className="pt-4">
              <label className="text-sm text-muted-foreground mb-2 block">Selecciona carrera</label>
              <Select 
                value={selectedRegistration?.id || ''} 
                onValueChange={(val) => setSelectedRegistration(registrations.find(r => r.id === val) || null)}
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

        {/* Race Info */}
        {selectedRegistration && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{selectedRegistration.races.name}</h2>
                  <p className="text-sm text-muted-foreground">{selectedRegistration.race_distances.name}</p>
                </div>
                {selectedRegistration.bib_number && (
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
              <div className="text-2xl font-mono font-bold">{formatTime(stats.elapsed)}</div>
              <div className="text-xs text-muted-foreground">Tiempo</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 text-center">
              <Navigation className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-mono font-bold">{formatDistance(stats.distance)}</div>
              <div className="text-xs text-muted-foreground">Distancia</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 text-center">
              <Gauge className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-mono font-bold">{stats.speed.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">km/h</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 text-center">
              <Radio className={`h-5 w-5 mx-auto mb-1 ${isTracking ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
              <div className="text-2xl font-mono font-bold">{stats.pointsSent}</div>
              <div className="text-xs text-muted-foreground">Puntos enviados</div>
            </CardContent>
          </Card>
        </div>

        {/* Mini Map */}
        <Card>
          <CardContent className="p-2">
            <GPSMiniMap 
              latitude={currentPosition?.lat || null}
              longitude={currentPosition?.lng || null}
              distanceId={selectedRegistration?.race_distance_id}
              raceId={selectedRegistration?.race_id}
              distanceTraveled={stats.distance}
              totalDistance={selectedRegistration?.race_distances?.distance_km}
              className="h-48 w-full"
            />
          </CardContent>
        </Card>

        {/* Elevation Profile */}
        {selectedRegistration && (
          <ElevationMiniProfile
            distanceId={selectedRegistration.race_distance_id}
            currentDistanceKm={stats.distance / 1000}
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

        {/* Last Update */}
        {stats.lastUpdate && (
          <div className="text-center text-sm text-muted-foreground">
            Última actualización: {stats.lastUpdate.toLocaleTimeString('es-ES')}
          </div>
        )}
      </main>

      {/* Bottom Action Button */}
      <div className="p-4" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        {!isTracking ? (
          <Button 
            onClick={startTracking} 
            className="w-full h-20 text-xl"
            disabled={!selectedRegistration}
          >
            <Play className="h-8 w-8 mr-3" />
            INICIAR TRACKING
          </Button>
        ) : (
          <Button 
            onClick={stopTracking} 
            variant="destructive" 
            className="w-full h-20 text-xl"
          >
            <Square className="h-8 w-8 mr-3" />
            DETENER
          </Button>
        )}
      </div>
    </div>
  );
};

export default GPSTrackerApp;
