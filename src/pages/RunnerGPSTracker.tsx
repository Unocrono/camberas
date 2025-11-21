import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Radio, Battery, Navigation, Clock } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const RunnerGPSTracker = () => {
  const { id: raceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isTracking, setIsTracking] = useState(false);
  const [race, setRace] = useState<any>(null);
  const [registration, setRegistration] = useState<any>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [battery, setBattery] = useState<number>(100);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    fetchRaceAndRegistration();
    checkBattery();
  }, [user, raceId]);

  const fetchRaceAndRegistration = async () => {
    try {
      const { data: raceData, error: raceError } = await supabase
        .from('races')
        .select('*')
        .eq('id', raceId)
        .single();

      if (raceError) throw raceError;
      setRace(raceData);

      const { data: regData, error: regError } = await supabase
        .from('registrations')
        .select('*')
        .eq('race_id', raceId)
        .eq('user_id', user!.id)
        .single();

      if (regError) throw regError;
      setRegistration(regData);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const checkBattery = async () => {
    if ('getBattery' in navigator) {
      const battery: any = await (navigator as any).getBattery();
      setBattery(Math.round(battery.level * 100));
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'GPS no disponible',
        description: 'Tu dispositivo no soporta geolocalización',
        variant: 'destructive',
      });
      return;
    }

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const { error } = await supabase.from('gps_tracking').insert({
            race_id: raceId,
            registration_id: registration.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            battery_level: battery,
          });

          if (error) throw error;
          setLastUpdate(new Date());
        } catch (error: any) {
          console.error('Error sending position:', error);
        }
      },
      (error) => {
        toast({
          title: 'Error GPS',
          description: error.message,
          variant: 'destructive',
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    setWatchId(id);
    setIsTracking(true);
    toast({
      title: 'Seguimiento iniciado',
      description: 'Tu posición se está compartiendo',
    });
  };

  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsTracking(false);
    toast({
      title: 'Seguimiento detenido',
      description: 'Ya no se comparte tu posición',
    });
  };

  if (!race || !registration) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Seguimiento GPS</CardTitle>
            <CardDescription>{race.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Radio className={`h-5 w-5 ${isTracking ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
                <span className="font-semibold">
                  {isTracking ? 'Tracking Activo' : 'Tracking Inactivo'}
                </span>
              </div>
              <Badge variant={isTracking ? 'default' : 'secondary'}>
                {isTracking ? 'EN VIVO' : 'PAUSADO'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Battery className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Batería</div>
                  <div className="font-semibold">{battery}%</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Frecuencia</div>
                  <div className="font-semibold">{race.gps_update_frequency}s</div>
                </div>
              </div>
            </div>

            {lastUpdate && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Navigation className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Última actualización</div>
                  <div className="font-semibold">
                    {lastUpdate.toLocaleTimeString('es-ES')}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {!isTracking ? (
                <Button onClick={startTracking} className="w-full" size="lg">
                  <Radio className="mr-2 h-5 w-5" />
                  Iniciar Seguimiento GPS
                </Button>
              ) : (
                <Button onClick={stopTracking} variant="destructive" className="w-full" size="lg">
                  Detener Seguimiento
                </Button>
              )}
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>• Mantén la pantalla encendida durante la carrera</p>
              <p>• Asegúrate de tener batería suficiente</p>
              <p>• El GPS consume más batería con alta precisión</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
};

export default RunnerGPSTracker;
