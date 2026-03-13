/**
 * CamberasTrackLive — Página pública de seguimiento GPS en tiempo real
 * URL: /race/:id/live  o  /:slug/live
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CamberasTrackMap } from '@/components/CamberasTrackMap';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Radio } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const isValidUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const CamberasTrackLive = () => {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [race, setRace] = useState<{ id: string; name: string; date: string; location: string; slug: string | null } | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const param = slug || id;
      if (!param) return;

      let raceId = param;

      // Resolver slug → UUID
      if (!isValidUUID(param)) {
        const { data } = await supabase.from('races').select('id').eq('slug', param).maybeSingle();
        if (!data) {
          toast({ title: 'Carrera no encontrada', variant: 'destructive' });
          navigate('/races');
          return;
        }
        raceId = data.id;
      }

      // Cargar datos de la carrera
      const { data: raceData, error } = await supabase
        .from('races')
        .select('id, name, date, location, slug')
        .eq('id', raceId)
        .single();

      if (error || !raceData) {
        toast({ title: 'Error cargando la carrera', variant: 'destructive' });
        return;
      }
      setRace(raceData);

      // Cargar token de Mapbox
      const { data: tokenData } = await supabase.functions.invoke('get-mapbox-token');
      setMapboxToken(tokenData?.token || '');
      setLoading(false);
    };

    load();
  }, [id, slug, navigate, toast]);

  const getRaceUrl = () => race?.slug ? `/${race.slug}` : `/race/${race?.id}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24 text-center text-muted-foreground">
          Cargando mapa...
        </div>
        <Footer />
      </div>
    );
  }

  if (!race || !mapboxToken) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24 text-center text-muted-foreground">
          No se pudo cargar el mapa.
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8 pt-24">
        {/* Cabecera */}
        <div className="flex items-center justify-between mb-6">
          <Button asChild variant="outline" size="sm">
            <Link to={getRaceUrl()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-green-500">
            <Radio className="h-4 w-4 animate-pulse" />
            <span className="font-semibold text-sm">SEGUIMIENTO EN VIVO</span>
          </div>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold">{race.name}</h1>
          <p className="text-muted-foreground text-sm">
            {race.location} · {new Date(race.date).toLocaleDateString('es-ES')}
          </p>
        </div>

        {/* Mapa */}
        <CamberasTrackMap
          mapboxToken={mapboxToken}
          showSOSPanel={false}
          height="70vh"
        />
      </div>

      <Footer />
    </div>
  );
};

export default CamberasTrackLive;
