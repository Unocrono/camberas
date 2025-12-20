import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Tv2, 
  Trophy, 
  User, 
  Map, 
  Copy, 
  ExternalLink, 
  Settings,
  Eye,
  Clock,
  Palette,
  Bike,
  Sliders
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface Race {
  id: string;
  name: string;
  slug: string | null;
  date: string;
  race_distances: {
    id: string;
    name: string;
  }[];
}

interface Wave {
  id: string;
  wave_name: string;
  distance_name: string;
}

interface OverlayConfig {
  theme: "dark" | "light";
  bgColor: string;
  textColor: string;
  accentColor: string;
  delay: number;
  layout: "vertical" | "horizontal" | "grid";
  size: "sm" | "md" | "lg" | "xl" | "2xl";
  showHeader: boolean;
  selectedWaves: string[];
}

const OverlayManager = () => {
  const navigate = useNavigate();
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [waves, setWaves] = useState<Wave[]>([]);
  
  // Shared overlay config (applied to all overlays)
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({
    theme: "dark",
    bgColor: "#000000",
    textColor: "#ffffff",
    accentColor: "#f59e0b",
    delay: 0,
    layout: "vertical",
    size: "xl",
    showHeader: true,
    selectedWaves: []
  });

  const baseUrl = window.location.origin;

  useEffect(() => {
    fetchRaces();
  }, []);

  useEffect(() => {
    if (selectedRace) {
      fetchWaves();
    }
  }, [selectedRace]);

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select(`
          id,
          name,
          slug,
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

  const fetchWaves = async () => {
    try {
      const { data, error } = await supabase
        .from("race_waves")
        .select(`
          id,
          wave_name,
          race_distances!inner (
            name
          )
        `)
        .eq("race_id", selectedRace)
        .order("start_time", { ascending: true });

      if (error) throw error;
      
      setWaves((data || []).map((w: any) => ({
        id: w.id,
        wave_name: w.wave_name,
        distance_name: w.race_distances?.name || ""
      })));
    } catch (error) {
      console.error("Error fetching waves:", error);
    }
  };

  const selectedRaceData = races.find(r => r.id === selectedRace);
  const raceIdentifier = selectedRaceData?.slug || selectedRace;

  // Build URL with shared config params
  const buildOverlayUrl = (basePath: string) => {
    if (!selectedRace) return "";
    
    const params = new URLSearchParams();
    params.set("theme", overlayConfig.theme);
    params.set("bg", overlayConfig.bgColor);
    params.set("text", overlayConfig.textColor);
    params.set("accent", overlayConfig.accentColor);
    if (overlayConfig.delay !== 0) params.set("delay", overlayConfig.delay.toString());
    params.set("layout", overlayConfig.layout);
    params.set("size", overlayConfig.size);
    if (!overlayConfig.showHeader) params.set("header", "false");
    if (overlayConfig.selectedWaves.length > 0) {
      params.set("waves", overlayConfig.selectedWaves.join(","));
    }
    
    return `${basePath}?${params.toString()}`;
  };

  const overlays = [
    {
      id: "clock",
      name: "Reloj de Carrera",
      description: "Reloj con tiempo transcurrido desde la salida de cada evento",
      icon: Clock,
      color: "bg-orange-500/10 text-orange-600",
      basePath: `/overlay/clock/${raceIdentifier}`
    },
    {
      id: "leaderboard",
      name: "Clasificación en Vivo",
      description: "Tabla con posiciones, dorsales, nombres y tiempos actualizados en tiempo real",
      icon: Trophy,
      color: "bg-yellow-500/10 text-yellow-600",
      basePath: `/overlay/leaderboard/${raceIdentifier}`
    },
    {
      id: "lower-third",
      name: "Lower Third",
      description: "Gráfico de corredor individual con nombre, dorsal, posición y tiempo",
      icon: User,
      color: "bg-blue-500/10 text-blue-600",
      basePath: `/overlay/lower-third/${raceIdentifier}`
    },
    {
      id: "map",
      name: "Mapa GPS",
      description: "Overlay de mapa con posiciones de corredores en tiempo real",
      icon: Map,
      color: "bg-green-500/10 text-green-600",
      basePath: `/overlay/map/${raceIdentifier}`
    },
    {
      id: "moto",
      name: "Motos GPS",
      description: "Distancia a meta, velocidad y diferencias entre motos de carrera",
      icon: Bike,
      color: "bg-purple-500/10 text-purple-600",
      basePath: `/overlay/moto/${raceIdentifier}`
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

  const toggleWaveSelection = (waveId: string) => {
    setOverlayConfig(prev => ({
      ...prev,
      selectedWaves: prev.selectedWaves.includes(waveId)
        ? prev.selectedWaves.filter(id => id !== waveId)
        : [...prev.selectedWaves, waveId]
    }));
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
              Selección de Carrera
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

        {selectedRace && (
          <Tabs defaultValue="overlays" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="overlays" className="flex items-center gap-2">
                <Tv2 className="h-4 w-4" />
                Overlays
              </TabsTrigger>
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Sliders className="h-4 w-4" />
                Configuración Visual
              </TabsTrigger>
            </TabsList>

            {/* Overlays Tab */}
            <TabsContent value="overlays" className="space-y-6">
              {/* Overlays Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {overlays.map((overlay) => {
                  const Icon = overlay.icon;
                  const overlayUrl = buildOverlayUrl(overlay.basePath);
                  
                  return (
                    <Card 
                      key={overlay.id} 
                      className="transition-all hover:shadow-lg"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className={`p-3 rounded-xl ${overlay.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <Badge variant="outline" className="text-xs">Browser</Badge>
                        </div>
                        <CardTitle className="text-lg mt-3">{overlay.name}</CardTitle>
                        <CardDescription className="text-xs">{overlay.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* URL Preview */}
                        <div className="text-xs font-mono text-muted-foreground truncate bg-muted/50 px-2 py-1 rounded">
                          {overlayUrl}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            className="flex-1" 
                            size="sm"
                            variant="outline"
                            onClick={() => openPreview(overlayUrl)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Ver
                          </Button>
                          <Button 
                            className="flex-1"
                            size="sm"
                            onClick={() => copyToClipboard(overlayUrl)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copiar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle>Cómo usar en OBS Studio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Configura la apariencia visual en la pestaña <strong>"Configuración Visual"</strong></li>
                    <li>Copia la URL del overlay que necesites</li>
                    <li>En OBS, añade una fuente <strong>"Navegador" (Browser)</strong></li>
                    <li>Pega la URL y configura <strong>1920x1080</strong></li>
                    <li>Activa <strong>"Actualizar navegador cuando la escena se active"</strong></li>
                  </ol>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium">💡 Consejo</p>
                    <p className="text-sm text-muted-foreground">
                      Los overlays tienen fondo transparente. Colócalos sobre tu fuente de vídeo principal.
                      La configuración visual se aplica a todos los overlays automáticamente.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Configuration Tab */}
            <TabsContent value="config" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Configuración Visual de Overlays
                  </CardTitle>
                  <CardDescription>
                    Estos ajustes se aplican a todos los overlays generados
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme & Colors */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Colores</Label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Tema</Label>
                        <Select 
                          value={overlayConfig.theme} 
                          onValueChange={(v: "dark" | "light") => {
                            setOverlayConfig(prev => ({
                              ...prev,
                              theme: v,
                              bgColor: v === "dark" ? "#000000" : "#ffffff",
                              textColor: v === "dark" ? "#ffffff" : "#000000"
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dark">Oscuro</SelectItem>
                            <SelectItem value="light">Claro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Fondo</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            value={overlayConfig.bgColor}
                            onChange={(e) => setOverlayConfig(prev => ({ ...prev, bgColor: e.target.value }))}
                            className="w-12 h-9 p-1 cursor-pointer"
                          />
                          <Input 
                            value={overlayConfig.bgColor}
                            onChange={(e) => setOverlayConfig(prev => ({ ...prev, bgColor: e.target.value }))}
                            className="flex-1 font-mono text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Texto</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            value={overlayConfig.textColor}
                            onChange={(e) => setOverlayConfig(prev => ({ ...prev, textColor: e.target.value }))}
                            className="w-12 h-9 p-1 cursor-pointer"
                          />
                          <Input 
                            value={overlayConfig.textColor}
                            onChange={(e) => setOverlayConfig(prev => ({ ...prev, textColor: e.target.value }))}
                            className="flex-1 font-mono text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Acento</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            value={overlayConfig.accentColor}
                            onChange={(e) => setOverlayConfig(prev => ({ ...prev, accentColor: e.target.value }))}
                            className="w-12 h-9 p-1 cursor-pointer"
                          />
                          <Input 
                            value={overlayConfig.accentColor}
                            onChange={(e) => setOverlayConfig(prev => ({ ...prev, accentColor: e.target.value }))}
                            className="flex-1 font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Layout & Size */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sliders className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Disposición y Tamaño</Label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Layout</Label>
                        <Select 
                          value={overlayConfig.layout} 
                          onValueChange={(v: "vertical" | "horizontal" | "grid") => 
                            setOverlayConfig(prev => ({ ...prev, layout: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vertical">Vertical</SelectItem>
                            <SelectItem value="horizontal">Horizontal</SelectItem>
                            <SelectItem value="grid">Cuadrícula</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Tamaño fuente</Label>
                        <Select 
                          value={overlayConfig.size} 
                          onValueChange={(v: "sm" | "md" | "lg" | "xl" | "2xl") => 
                            setOverlayConfig(prev => ({ ...prev, size: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sm">Pequeño</SelectItem>
                            <SelectItem value="md">Mediano</SelectItem>
                            <SelectItem value="lg">Grande</SelectItem>
                            <SelectItem value="xl">Extra Grande</SelectItem>
                            <SelectItem value="2xl">Máximo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Delay (seg)</Label>
                        <Input 
                          type="number"
                          value={overlayConfig.delay}
                          onChange={(e) => setOverlayConfig(prev => ({ ...prev, delay: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Mostrar cabecera</Label>
                        <div className="flex items-center h-9">
                          <Switch
                            checked={overlayConfig.showHeader}
                            onCheckedChange={(checked) => 
                              setOverlayConfig(prev => ({ ...prev, showHeader: checked }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Wave Selection */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Eventos a mostrar</Label>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Selecciona los eventos específicos o deja vacío para mostrar todos
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {waves.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No hay eventos con hora de salida configurada</p>
                      ) : (
                        waves.map((wave) => (
                          <Badge
                            key={wave.id}
                            variant={overlayConfig.selectedWaves.includes(wave.id) ? "default" : "outline"}
                            className="cursor-pointer transition-colors"
                            onClick={() => toggleWaveSelection(wave.id)}
                          >
                            {wave.distance_name || wave.wave_name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Preview Box */}
                  <div>
                    <Label className="font-medium mb-3 block">Vista previa de colores</Label>
                    <div 
                      className="p-6 rounded-lg border transition-colors"
                      style={{ backgroundColor: overlayConfig.bgColor }}
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold"
                          style={{ backgroundColor: overlayConfig.accentColor, color: overlayConfig.bgColor }}
                        >
                          01
                        </div>
                        <div>
                          <p 
                            className="font-bold text-lg"
                            style={{ color: overlayConfig.textColor }}
                          >
                            Ejemplo de Texto
                          </p>
                          <p 
                            className="text-sm opacity-70"
                            style={{ color: overlayConfig.textColor }}
                          >
                            Tiempo: 01:23:45
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {!selectedRace && (
          <div className="text-center py-12 text-muted-foreground">
            <Tv2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>Selecciona una carrera para ver los overlays disponibles</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default OverlayManager;
