import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { LiveGPSMap } from '@/components/LiveGPSMap';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Radio, Map } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
  slug: string | null;
}

interface Distance {
  id: string;
  name: string;
  distance_km: number;
  gps_tracking_enabled: boolean | null;
  gps_update_frequency: number | null;
  gpx_file_url: string | null;
}

// Helper to validate UUID format
const isValidUUID = (str: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

const LiveGPSTracking = () => {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [raceId, setRaceId] = useState<string | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [distances, setDistances] = useState<Distance[]>([]);
  const [selectedDistanceId, setSelectedDistanceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapboxToken, setMapboxToken] = useState<string>('');

  // Resolve race ID from slug or direct ID
  useEffect(() => {
    const resolveRaceId = async () => {
      const param = slug || id;
      if (!param) return;

      // Si es un UUID válido, usarlo directamente
      if (isValidUUID(param)) {
        setRaceId(param);
        return;
      }

      // Si no es UUID, buscar por slug
      const { data, error } = await supabase
        .from("races")
        .select("id")
        .eq("slug", param)
        .maybeSingle();

      if (data && !error) {
        setRaceId(data.id);
      } else {
        setRaceId(null);
        toast({
          title: "Carrera no encontrada",
          description: "La carrera que buscas no existe",
          variant: "destructive",
        });
        navigate("/races");
      }
    };

    resolveRaceId();
  }, [id, slug, navigate, toast]);

  useEffect(() => {
    if (raceId) {
      fetchRaceAndToken();
    }
  }, [raceId]);

  const fetchRaceAndToken = async () => {
    if (!raceId) return;
    
    try {
      // Fetch race info
      const { data: raceData, error: raceError } = await supabase
        .from('races')
        .select('id, name, date, location, slug')
        .eq('id', raceId)
        .single();

      if (raceError) throw raceError;
      setRace(raceData);

      // Fetch all distances with GPS enabled or GPX available
      const { data: distancesData, error: distancesError } = await supabase
        .from('race_distances')
        .select('id, name, distance_km, gps_tracking_enabled, gps_update_frequency, gpx_file_url')
        .eq('race_id', raceId)
        .or('gps_tracking_enabled.eq.true,gpx_file_url.neq.null')
        .order('distance_km', { ascending: true });

      if (distancesError) throw distancesError;

      if (!distancesData || distancesData.length === 0) {
        toast({
          title: 'GPS no disponible',
          description: 'No hay recorridos disponibles para mostrar en el mapa',
          variant: 'destructive',
        });
        setDistances([]);
      } else {
        setDistances(distancesData);
        // Select the first distance with GPS enabled, or the first one with GPX
        const gpsEnabled = distancesData.find(d => d.gps_tracking_enabled);
        setSelectedDistanceId(gpsEnabled?.id || distancesData[0].id);
      }

      // The edge function returns { token: ... }
      const { data } = await supabase.functions.invoke('get-mapbox-token');
      setMapboxToken(data?.token || '');
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

  const selectedDistance = distances.find(d => d.id === selectedDistanceId);
  
  // Helper to get the race URL (prefer slug)
  const getRaceUrl = () => race?.slug ? `/${race.slug}` : `/race/${race?.id}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24">
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
        <div className="container mx-auto px-4 py-8 pt-24">
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

  if (distances.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24">
          <Card>
            <CardContent className="py-12 text-center">
              <Radio className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">GPS no disponible</h3>
              <p className="text-muted-foreground mb-4">
                No hay recorridos disponibles para mostrar en el mapa
              </p>
              <Button asChild>
                <Link to={getRaceUrl()}>
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
      
      <div className="container mx-auto px-4 py-8 pt-24">
        <Button asChild variant="outline" className="mb-4">
          <Link to={getRaceUrl()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Link>
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl md:text-3xl">{race.name}</CardTitle>
                <CardDescription className="mt-2">
                  {race.location} • {new Date(race.date).toLocaleDateString('es-ES')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                {distances.length > 1 && (
                  <Select
                    value={selectedDistanceId || undefined}
                    onValueChange={setSelectedDistanceId}
                  >
                    <SelectTrigger className="w-[200px]">
                      <Map className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Seleccionar recorrido" />
                    </SelectTrigger>
                    <SelectContent>
                      {distances.map((distance) => (
                        <SelectItem key={distance.id} value={distance.id}>
                          {distance.name} ({distance.distance_km} km)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex items-center gap-2 text-green-500">
                  <Radio className="h-5 w-5 animate-pulse" />
                  <span className="font-semibold text-sm">EN VIVO</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {selectedDistance && (
                <>
                  <span>
                    <strong>Recorrido:</strong> {selectedDistance.name}
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Distancia:</strong> {selectedDistance.distance_km} km
                  </span>
                  {selectedDistance.gps_tracking_enabled && (
                    <>
                      <span>•</span>
                      <span>
                        Actualización cada {selectedDistance.gps_update_frequency || 30} segundos
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:p-6">
            {mapboxToken && selectedDistanceId ? (
              <LiveGPSMap 
                raceId={race.id} 
                distanceId={selectedDistanceId}
                mapboxToken={mapboxToken} 
              />
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
