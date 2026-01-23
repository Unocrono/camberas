import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Timer, Flag, Download, LogOut, LogIn, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatLocalTime } from '@/lib/timezoneUtils';
import { useNtpOffset } from '@/hooks/useNtpOffset';
import { useStartControlSync } from '@/hooks/useStartControlSync';
import { HoldToStart } from '@/components/start/HoldToStart';
import { EventSelector } from '@/components/start/EventSelector';
import { SyncStatusBadge } from '@/components/start/SyncStatusBadge';
import { NtpStatusBadge } from '@/components/start/NtpStatusBadge';
import { AuthModal } from '@/components/AuthModal';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import startLogo from '@/assets/timing-icon.png';

interface Race {
  id: string;
  name: string;
  date: string;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface RaceWave {
  id: string;
  race_distance_id: string;
  wave_name: string;
  start_time: string | null;
}

export default function StartControl() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>('');
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [waves, setWaves] = useState<RaceWave[]>([]);
  const [selectedDistanceIds, setSelectedDistanceIds] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // PWA Install
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const { offset, lastSync, isCalculating, calibrationProgress, error: ntpError, calculateOffset, correctTimestamp } = useNtpOffset();
  const { isOnline, pendingCount, isSyncing, lastSyncAttempt, registerStart, syncImmediately, forcSync, getStartStatus } = useStartControlSync();

  // Reloj en tiempo real
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
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

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
      toast({ title: 'App instalada', description: 'Acceso rápido desde tu pantalla de inicio' });
    }
    setDeferredPrompt(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Verificar autorización
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setIsLoading(false);
      return;
    }

    const checkAuth = async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const userRoles = roles?.map(r => r.role) || [];
      const allowedRoles = ['admin', 'organizer', 'timer'];
      const hasAccess = userRoles.some(r => allowedRoles.includes(r));
      
      if (!hasAccess) {
        toast({ title: 'Acceso denegado', description: 'No tienes permisos para esta aplicación', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      setIsAuthorized(true);
      fetchRaces(user.id, userRoles);
    };

    checkAuth();
  }, [user, authLoading, toast]);

  const fetchRaces = async (userId: string, userRoles: string[]) => {
    setIsLoading(true);
    
    try {
      let raceIds: string[] = [];
      
      if (userRoles.includes('admin')) {
        // Admin ve todas las carreras
        const { data } = await supabase
          .from('races')
          .select('id, name, date')
          .order('date', { ascending: false });
        setRaces(data || []);
        setIsLoading(false);
        return;
      }
      
      // Organizador: carreras donde es organizer_id
      if (userRoles.includes('organizer')) {
        const { data: orgRaces } = await supabase
          .from('races')
          .select('id')
          .eq('organizer_id', userId);
        raceIds.push(...(orgRaces?.map(r => r.id) || []));
      }
      
      // Timer: carreras asignadas en timer_assignments
      if (userRoles.includes('timer')) {
        const { data: timerAssignments } = await supabase
          .from('timer_assignments')
          .select('race_id')
          .eq('user_id', userId);
        raceIds.push(...(timerAssignments?.map(a => a.race_id) || []));
      }
      
      // Obtener carreras únicas
      const uniqueRaceIds = [...new Set(raceIds)];
      
      if (uniqueRaceIds.length === 0) {
        setRaces([]);
        setIsLoading(false);
        return;
      }
      
      const { data } = await supabase
        .from('races')
        .select('id, name, date')
        .in('id', uniqueRaceIds)
        .order('date', { ascending: false });
      
      setRaces(data || []);
    } catch (error) {
      console.error('Error fetching races:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar distancias y waves cuando cambia la carrera
  const fetchWavesAndDistances = async () => {
    if (!selectedRaceId) {
      setDistances([]);
      setWaves([]);
      return;
    }

    const [distancesRes, wavesRes] = await Promise.all([
      supabase.from('race_distances').select('id, name, distance_km').eq('race_id', selectedRaceId).order('distance_km'),
      supabase.from('race_waves').select('id, race_distance_id, wave_name, start_time').eq('race_id', selectedRaceId)
    ]);
    
    setDistances(distancesRes.data || []);
    setWaves(wavesRes.data || []);
  };

  useEffect(() => {
    fetchWavesAndDistances();
  }, [selectedRaceId]);
  
  // Recargar waves después de sincronizar
  useEffect(() => {
    if (!isSyncing && pendingCount === 0 && selectedRaceId) {
      // Refrescar datos del servidor cuando termina la sincronización
      fetchWavesAndDistances();
    }
  }, [isSyncing, pendingCount, selectedRaceId]);

  const handleStart = async (rawTimestamp: number) => {
    if (selectedDistanceIds.length === 0) {
      toast({ title: 'Selecciona al menos un evento', variant: 'destructive' });
      return;
    }

    const correctedTimestamp = correctTimestamp(rawTimestamp);
    const pendingStart = registerStart(selectedRaceId, selectedDistanceIds, correctedTimestamp);
    
    // Sincronizar inmediatamente
    const success = await syncImmediately(pendingStart);
    
    if (success) {
      toast({
        title: '¡Salida registrada!',
        description: `${selectedDistanceIds.length} evento(s) a las ${formatLocalTime(correctedTimestamp.toString())}`
      });
    }

    setSelectedDistanceIds([]);
  };

  const handleEditStart = async (distanceId: string, waveId: string, newTimeISO: string) => {
    const newTimestamp = new Date(newTimeISO).getTime();
    const pendingStart = registerStart(selectedRaceId, [distanceId], newTimestamp, true, [waveId]);
    
    // Sincronizar inmediatamente la edición
    const success = await syncImmediately(pendingStart);
    
    if (success) {
      toast({ title: 'Corrección guardada' });
    } else {
      toast({ title: 'Corrección pendiente', description: 'Se sincronizará cuando haya conexión' });
    }
  };

  // Ya no bloqueamos la pantalla durante la calibración - ahora se muestra en el badge

  // Usuario no autenticado
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <motion.img 
          src={startLogo} 
          alt="Start Control" 
          className="h-24 w-24 mb-6"
        />
        <h2 className="text-xl font-bold mb-2">Control de Salidas</h2>
        <p className="text-muted-foreground text-center mb-6">
          Inicia sesión para acceder al control de salidas
        </p>
        <Button onClick={() => setShowAuthModal(true)} className="gap-2">
          <LogIn className="h-4 w-4" />
          Iniciar Sesión
        </Button>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Timer className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <h2 className="text-xl font-bold mb-2">Acceso denegado</h2>
        <p className="text-muted-foreground text-center mb-6">
          No tienes permisos para acceder a esta aplicación
        </p>
        <Button variant="outline" onClick={() => navigate('/')}>
          Volver al inicio
        </Button>
      </div>
    );
  }

  const correctedTime = new Date(correctTimestamp(currentTime.getTime()));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-primary" />
              <h1 className="font-bold text-lg">Control de Salidas</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {showInstallPrompt && (
              <Button variant="outline" size="sm" onClick={handleInstall} className="gap-1.5">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Instalar</span>
              </Button>
            )}
            <SyncStatusBadge
              isOnline={isOnline}
              pendingCount={pendingCount}
              isSyncing={isSyncing}
              lastSyncAttempt={lastSyncAttempt}
              onForceSync={forcSync}
            />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Reloj principal */}
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="py-6 text-center">
            <motion.div
              key={correctedTime.getSeconds()}
              initial={{ scale: 1.02 }}
              animate={{ scale: 1 }}
              className="font-mono text-5xl font-bold tracking-wider"
            >
              {correctedTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              <span className="text-2xl opacity-70">.{correctedTime.getMilliseconds().toString().padStart(3, '0').slice(0, 2)}</span>
            </motion.div>
            <NtpStatusBadge
              offset={offset}
              lastSync={lastSync}
              isCalculating={isCalculating}
              calibrationProgress={calibrationProgress}
              error={ntpError}
              onRecalculate={calculateOffset}
              className="justify-center mt-3"
            />
          </CardContent>
        </Card>

        {/* Selector de carrera */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Carrera</label>
          <Select value={selectedRaceId} onValueChange={setSelectedRaceId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una carrera" />
            </SelectTrigger>
            <SelectContent>
              {races.map(race => (
                <SelectItem key={race.id} value={race.id}>
                  {race.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedRaceId && (
          <>
            <Separator />
            
            {/* Selector de eventos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Eventos / Modalidades</CardTitle>
              </CardHeader>
              <CardContent>
                <EventSelector
                  distances={distances}
                  waves={waves}
                  selectedIds={selectedDistanceIds}
                  onSelectionChange={setSelectedDistanceIds}
                  onEditStart={handleEditStart}
                  getStartStatus={getStartStatus}
                />
              </CardContent>
            </Card>

            {/* Botón de salida */}
            <div className="flex justify-center pt-8 pb-4">
              <HoldToStart
                onStart={handleStart}
                disabled={selectedDistanceIds.length === 0}
              />
            </div>
          </>
        )}
      </main>
      
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
