import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Radio, Battery, Navigation, Clock, Wifi, WifiOff, 
  MapPin, Gauge, Play, Square, RefreshCw, AlertTriangle,
  Smartphone, Download
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
  bib_number: number | null;
  race_distances: {
    name: string;
    gps_tracking_enabled: boolean | null;
    gps_update_frequency: number | null;
  };
  races: Race;
}

const GPSTrackerApp = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
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
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  // Refs
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);
  const wakeLockRef = useRef<any>(null);

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
            bib_number,
            race_distances!inner (
              name,
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

  // Handle GPS position
  const handlePosition = useCallback(async (position: GeolocationPosition) => {
    if (!selectedRegistration) return;
    
    const point: GPSPoint = {
      race_id: selectedRegistration.race_id,
      registration_id: selectedRegistration.id,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      battery_level: battery,
      timestamp: new Date().toISOString(),
    };

    // Update distance
    if (lastPositionRef.current) {
      const dist = calculateDistance(
        lastPositionRef.current.coords.latitude,
        lastPositionRef.current.coords.longitude,
        position.coords.latitude,
        position.coords.longitude
      );
      setStats(prev => ({ ...prev, distance: prev.distance + dist }));
    }
    lastPositionRef.current = position;

    // Update speed
    if (position.coords.speed !== null) {
      setStats(prev => ({ ...prev, speed: position.coords.speed! * 3.6 })); // m/s to km/h
    }

    // Send or queue
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
  }, [selectedRegistration, battery, isOnline]);

  // Start tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation || !selectedRegistration) {
      toast({
        title: 'GPS no disponible',
        description: 'Tu dispositivo no soporta geolocalización',
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
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      (error) => {
        toast({
          title: 'Error GPS',
          description: error.message,
          variant: 'destructive',
        });
      },
      { enableHighAccuracy: !lowBatteryMode, timeout: 10000 }
    );

    // Watch position
    const id = navigator.geolocation.watchPosition(
      handlePosition,
      (error) => console.error('GPS error:', error),
      { 
        enableHighAccuracy: !lowBatteryMode, 
        maximumAge: 0, 
        timeout: 15000 
      }
    );
    watchIdRef.current = id;

    // Interval for periodic updates
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        () => {},
        { enableHighAccuracy: !lowBatteryMode, timeout: 10000 }
      );
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
      description: `Frecuencia: cada ${frequency}s`,
    });
  }, [selectedRegistration, lowBatteryMode, handlePosition]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
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
  }, [stats.pointsSent, pendingPoints.length, syncPendingPoints]);

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
            <Button onClick={() => navigate('/auth')} className="w-full">
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          <span className="font-bold">Camberas GPS</span>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="p-4 pb-8 safe-area-inset-bottom">
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
