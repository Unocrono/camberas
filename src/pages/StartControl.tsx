import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Timer, Flag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNtpOffset } from '@/hooks/useNtpOffset';
import { useStartControlSync } from '@/hooks/useStartControlSync';
import { SlideToStart } from '@/components/start-control/SlideToStart';
import { EventSelector } from '@/components/start-control/EventSelector';
import { SyncStatusBadge } from '@/components/start-control/SyncStatusBadge';
import { NtpStatusBadge } from '@/components/start-control/NtpStatusBadge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

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
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>('');
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [waves, setWaves] = useState<RaceWave[]>([]);
  const [selectedDistanceIds, setSelectedDistanceIds] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const { offset, lastSync, isCalculating, error: ntpError, calculateOffset, correctTimestamp } = useNtpOffset();
  const { isOnline, pendingCount, isSyncing, lastSyncAttempt, registerStart, forcSync, getStartStatus } = useStartControlSync();

  // Reloj en tiempo real
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  // Verificar autorización
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const allowedRoles = ['admin', 'organizer', 'timer'];
      const hasAccess = roles?.some(r => allowedRoles.includes(r.role));
      
      if (!hasAccess) {
        toast({ title: 'Acceso denegado', variant: 'destructive' });
        navigate('/');
        return;
      }

      setIsAuthorized(true);
      fetchRaces(user.id, roles?.map(r => r.role) || []);
    };

    checkAuth();
  }, [navigate, toast]);

  const fetchRaces = async (userId: string, userRoles: string[]) => {
    setIsLoading(true);
    let query = supabase.from('races').select('id, name, date').order('date', { ascending: false });
    
    if (!userRoles.includes('admin')) {
      query = query.eq('organizer_id', userId);
    }
    
    const { data } = await query;
    setRaces(data || []);
    setIsLoading(false);
  };

  // Cargar distancias y waves cuando cambia la carrera
  useEffect(() => {
    if (!selectedRaceId) {
      setDistances([]);
      setWaves([]);
      return;
    }

    const fetchData = async () => {
      const [distancesRes, wavesRes] = await Promise.all([
        supabase.from('race_distances').select('id, name, distance_km').eq('race_id', selectedRaceId).order('distance_km'),
        supabase.from('race_waves').select('id, race_distance_id, wave_name, start_time').eq('race_id', selectedRaceId)
      ]);
      
      setDistances(distancesRes.data || []);
      setWaves(wavesRes.data || []);
    };

    fetchData();
  }, [selectedRaceId]);

  const handleStart = (rawTimestamp: number) => {
    if (selectedDistanceIds.length === 0) {
      toast({ title: 'Selecciona al menos un evento', variant: 'destructive' });
      return;
    }

    const correctedTimestamp = correctTimestamp(rawTimestamp);
    registerStart(selectedRaceId, selectedDistanceIds, correctedTimestamp);
    
    toast({
      title: '¡Salida registrada!',
      description: `${selectedDistanceIds.length} evento(s) a las ${new Date(correctedTimestamp).toLocaleTimeString('es-ES')}`
    });

    setSelectedDistanceIds([]);
  };

  const handleEditStart = (distanceId: string, waveId: string, newTimeISO: string) => {
    const newTimestamp = new Date(newTimeISO).getTime();
    registerStart(selectedRaceId, [distanceId], newTimestamp, true, [waveId]);
    toast({ title: 'Corrección registrada' });
  };

  if (!isAuthorized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Timer className="h-8 w-8 animate-spin text-primary" />
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
          <SyncStatusBadge
            isOnline={isOnline}
            pendingCount={pendingCount}
            isSyncing={isSyncing}
            lastSyncAttempt={lastSyncAttempt}
            onForceSync={forcSync}
          />
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
            <div className="flex justify-center pt-4">
              <SlideToStart
                onStart={handleStart}
                disabled={selectedDistanceIds.length === 0}
                label={selectedDistanceIds.length > 0 
                  ? `Dar salida a ${selectedDistanceIds.length} evento(s)` 
                  : 'Selecciona eventos'
                }
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
