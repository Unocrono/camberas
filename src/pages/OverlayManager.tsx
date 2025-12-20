import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Tv2, 
  Trophy, 
  User, 
  Map, 
  Copy, 
  ExternalLink, 
  Plus,
  Settings,
  Eye,
  Clock
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface Race {
  id: string;
  name: string;
  date: string;
  race_distances: {
    id: string;
    name: string;
  }[];
}

const OverlayManager = () => {
  const navigate = useNavigate();
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const baseUrl = window.location.origin;

  useEffect(() => {
    fetchRaces();
  }, []);

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select(`
          id,
          name,
          date,
          race_distances (
            id,
            name
          )
        `)
        .order("date", { ascending: false });

      if (error) throw error;
      setRaces(data || []);
    } catch (error) {
      console.error("Error fetching races:", error);
      toast.error("Error al cargar las carreras");
    } finally {
      setLoading(false);
    }
  };

  const selectedRaceData = races.find(r => r.id === selectedRace);

  const overlays = [
    {
      id: "clock",
      name: "Reloj de Carrera",
      description: "Reloj con tiempo transcurrido desde la salida de cada evento. Configurable con delay.",
      icon: Clock,
      color: "bg-orange-500/10 text-orange-600",
      path: `/overlay/clock/${selectedRace}`
    },
    {
      id: "leaderboard",
      name: "Clasificación en Vivo",
      description: "Tabla con posiciones, dorsales, nombres y tiempos actualizados en tiempo real",
      icon: Trophy,
      color: "bg-yellow-500/10 text-yellow-600",
      path: `/overlay/leaderboard/${selectedRace}`
    },
    {
      id: "lower-third",
      name: "Lower Third",
      description: "Gráfico de corredor individual con nombre, dorsal, posición y tiempo",
      icon: User,
      color: "bg-blue-500/10 text-blue-600",
      path: `/overlay/lower-third/${selectedRace}`
    },
    {
      id: "map",
      name: "Mapa GPS",
      description: "Overlay de mapa con posiciones de corredores en tiempo real",
      icon: Map,
      color: "bg-green-500/10 text-green-600",
      path: `/overlay/map/${selectedRace}`
    }
  ];

  const copyToClipboard = (path: string) => {
    const fullUrl = `${baseUrl}${path}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success("URL copiada al portapapeles");
  };

  const openPreview = (path: string) => {
    window.open(path, "_blank", "width=1920,height=1080");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-primary/10">
            <Tv2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Overlay Manager</h1>
            <p className="text-muted-foreground">
              Crea y gestiona gráficos en tiempo real para transmisiones en vivo
            </p>
          </div>
        </div>

        {/* Race Selection */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuración
            </CardTitle>
            <CardDescription>
              Selecciona la carrera para generar las URLs de los overlays
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Carrera</Label>
              <Select value={selectedRace} onValueChange={setSelectedRace}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una carrera" />
                </SelectTrigger>
                <SelectContent>
                  {races.map((race) => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRaceData && selectedRaceData.race_distances.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Eventos disponibles: {selectedRaceData.race_distances.map(d => d.name).join(", ")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Overlays Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {overlays.map((overlay) => {
            const isDisabled = !selectedRace;
            const Icon = overlay.icon;
            
            return (
              <Card 
                key={overlay.id} 
                className={`transition-all ${isDisabled ? 'opacity-50' : 'hover:shadow-lg'}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-xl ${overlay.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant="outline">Browser Source</Badge>
                  </div>
                  <CardTitle className="mt-4">{overlay.name}</CardTitle>
                  <CardDescription>{overlay.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRace && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">URL para OBS</Label>
                      <div className="flex gap-2">
                        <Input 
                          readOnly 
                          value={`${baseUrl}${overlay.path}`}
                          className="text-xs font-mono"
                        />
                        <Button 
                          size="icon" 
                          variant="outline"
                          onClick={() => copyToClipboard(overlay.path)}
                          disabled={isDisabled}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button 
                      className="flex-1" 
                      variant="outline"
                      onClick={() => openPreview(overlay.path)}
                      disabled={isDisabled}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button 
                      className="flex-1"
                      onClick={() => copyToClipboard(overlay.path)}
                      disabled={isDisabled}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar URL
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Instructions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Cómo usar en OBS Studio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Selecciona la carrera y distancia para generar las URLs</li>
              <li>Copia la URL del overlay que necesitas</li>
              <li>En OBS, añade una nueva fuente de tipo <strong>"Navegador" (Browser)</strong></li>
              <li>Pega la URL copiada en el campo correspondiente</li>
              <li>Configura el ancho a <strong>1920px</strong> y alto a <strong>1080px</strong></li>
              <li>Marca la opción <strong>"Actualizar navegador cuando la escena se active"</strong></li>
            </ol>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">💡 Consejo</p>
              <p className="text-sm text-muted-foreground">
                Los overlays tienen fondo transparente. Colócalos sobre tu fuente de vídeo principal.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default OverlayManager;
