import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Monitor, Copy, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
  gps_tracking_enabled: boolean;
}

const StreamingControl = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchRaces();
  }, []);

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from('races')
        .select('id, name, date, location, gps_tracking_enabled')
        .order('date', { ascending: false });

      if (error) throw error;
      setRaces(data || []);
    } catch (error) {
      console.error('Error fetching races:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las carreras',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getOverlayUrl = (raceId: string) => {
    return `${window.location.origin}/race/${raceId}/overlay`;
  };

  const copyOverlayUrl = (raceId: string) => {
    const url = getOverlayUrl(raceId);
    navigator.clipboard.writeText(url);
    setCopiedId(raceId);
    
    toast({
      title: 'URL copiada',
      description: 'La URL del overlay ha sido copiada al portapapeles',
    });

    setTimeout(() => setCopiedId(null), 2000);
  };

  const openOverlay = (raceId: string) => {
    window.open(getOverlayUrl(raceId), '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Control de Streaming</h1>
          <p className="text-muted-foreground">
            Gestiona los overlays para transmisión en vivo de tus carreras
          </p>
        </div>

        <Card className="p-6 mb-8 bg-primary/5 border-primary/20">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Cómo usar los overlays
          </h2>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. Selecciona la carrera que quieres transmitir</li>
            <li>2. Copia la URL del overlay o ábrelo en una nueva ventana</li>
            <li>3. En OBS Studio u otro software de streaming, añade una fuente "Navegador"</li>
            <li>4. Pega la URL del overlay en la configuración de la fuente</li>
            <li>5. Ajusta el tamaño y posición del overlay en tu escena</li>
            <li>6. Los datos se actualizarán automáticamente en tiempo real</li>
          </ol>
        </Card>

        <div className="grid gap-4">
          {races.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground mb-4">No hay carreras disponibles</p>
              <Button onClick={() => navigate('/admin')}>
                Ir al panel de administración
              </Button>
            </Card>
          ) : (
            races.map((race) => (
              <Card key={race.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">{race.name}</h3>
                    <p className="text-sm text-muted-foreground mb-1">
                      {new Date(race.date).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      {race.location}
                    </p>
                    {race.gps_tracking_enabled && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-medium">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        GPS habilitado
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyOverlayUrl(race.id)}
                      className="gap-2"
                    >
                      {copiedId === race.id ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copiar URL
                        </>
                      )}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => openOverlay(race.id)}
                      className="gap-2"
                    >
                      <Monitor className="h-4 w-4" />
                      Abrir Overlay
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default StreamingControl;
