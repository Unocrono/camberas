import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { LiveGPSMap } from '@/components/LiveGPSMap';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Radio } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
  gps_tracking_enabled: boolean;
  gps_update_frequency: number;
}

const LiveGPSTracking = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const [race, setRace] = useState<Race | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapboxToken, setMapboxToken] = useState<string>('');

  useEffect(() => {
    fetchRaceAndToken();
  }, [id]);

  const fetchRaceAndToken = async () => {
    try {
      const { data: raceData, error: raceError } = await supabase
        .from('races')
        .select('*')
        .eq('id', id)
        .single();

      if (raceError) throw raceError;

      if (!raceData.gps_tracking_enabled) {
        toast({
          title: 'GPS no disponible',
          description: 'El seguimiento GPS no está habilitado para esta carrera',
          variant: 'destructive',
        });
      }

      setRace(raceData);

      const { data: { MAPBOX_PUBLIC_TOKEN } } = await supabase.functions.invoke('get-mapbox-token');
      setMapboxToken(MAPBOX_PUBLIC_TOKEN || '');
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">Cargando mapa...</div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!race) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Carrera no encontrada</p>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  if (!race.gps_tracking_enabled) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <Radio className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">GPS no disponible</h3>
              <p className="text-muted-foreground mb-4">
                El seguimiento GPS no está habilitado para esta carrera
              </p>
              <Button asChild>
                <Link to={`/race/${race.id}`}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Volver a la carrera
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <Button asChild variant="outline" className="mb-4">
          <Link to={`/race/${race.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Link>
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-3xl">{race.name}</CardTitle>
                <CardDescription className="mt-2">
                  {race.location} • {new Date(race.date).toLocaleDateString('es-ES')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-green-500">
                <Radio className="h-5 w-5 animate-pulse" />
                <span className="font-semibold">EN VIVO</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Actualización cada {race.gps_update_frequency} segundos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            {mapboxToken ? (
              <LiveGPSMap raceId={race.id} mapboxToken={mapboxToken} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No se pudo cargar el mapa
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
};

export default LiveGPSTracking;
