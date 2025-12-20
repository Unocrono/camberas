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
  Bike
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

interface ClockConfig {
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
  
  // Clock overlay config
  const [clockConfig, setClockConfig] = useState<ClockConfig>({
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

  // Build clock URL with config params
  const buildClockUrl = () => {
    if (!selectedRace) return "";
    
    const params = new URLSearchParams();
    params.set("theme", clockConfig.theme);
    params.set("bg", clockConfig.bgColor);
    params.set("text", clockConfig.textColor);
    params.set("accent", clockConfig.accentColor);
    if (clockConfig.delay !== 0) params.set("delay", clockConfig.delay.toString());
    params.set("layout", clockConfig.layout);
    params.set("size", clockConfig.size);
    if (!clockConfig.showHeader) params.set("header", "false");
    if (clockConfig.selectedWaves.length > 0) {
      params.set("waves", clockConfig.selectedWaves.join(","));
    }
    
    return `/overlay/clock/${raceIdentifier}?${params.toString()}`;
  };

  const overlays = [
    {
      id: "clock",
      name: "Reloj de Carrera",
      description: "Reloj con tiempo transcurrido desde la salida de cada evento",
      icon: Clock,
      color: "bg-orange-500/10 text-orange-600",
      path: buildClockUrl(),
      hasConfig: true
    },
    {
      id: "leaderboard",
      name: "Clasificación en Vivo",
      description: "Tabla con posiciones, dorsales, nombres y tiempos actualizados en tiempo real",
      icon: Trophy,
      color: "bg-yellow-500/10 text-yellow-600",
      path: `/overlay/leaderboard/${raceIdentifier}`,
      hasConfig: false
    },
    {
      id: "lower-third",
      name: "Lower Third",
      description: "Gráfico de corredor individual con nombre, dorsal, posición y tiempo",
      icon: User,
      color: "bg-blue-500/10 text-blue-600",
      path: `/overlay/lower-third/${raceIdentifier}`,
      hasConfig: false
    },
    {
      id: "map",
      name: "Mapa GPS",
      description: "Overlay de mapa con posiciones de corredores en tiempo real",
      icon: Map,
      color: "bg-green-500/10 text-green-600",
      path: `/overlay/map/${raceIdentifier}`,
      hasConfig: false
    },
    {
      id: "moto",
      name: "Motos GPS",
      description: "Distancia a meta, velocidad y diferencias entre motos de carrera",
      icon: Bike,
      color: "bg-purple-500/10 text-purple-600",
      path: `/overlay/moto/${raceIdentifier}`,
      hasConfig: false
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
    setClockConfig(prev => ({
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

        {/* Clock Overlay Configuration */}
        {selectedRace && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                Configuración del Reloj
              </CardTitle>
              <CardDescription>
                Personaliza la apariencia del overlay de reloj
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
                      value={clockConfig.theme} 
                      onValueChange={(v: "dark" | "light") => {
                        setClockConfig(prev => ({
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
                        value={clockConfig.bgColor}
                        onChange={(e) => setClockConfig(prev => ({ ...prev, bgColor: e.target.value }))}
                        className="w-12 h-9 p-1 cursor-pointer"
                      />
                      <Input 
                        value={clockConfig.bgColor}
                        onChange={(e) => setClockConfig(prev => ({ ...prev, bgColor: e.target.value }))}
                        className="flex-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Texto</Label>
                    <div className="flex gap-2">
                      <Input 
                        type="color" 
                        value={clockConfig.textColor}
                        onChange={(e) => setClockConfig(prev => ({ ...prev, textColor: e.target.value }))}
                        className="w-12 h-9 p-1 cursor-pointer"
                      />
                      <Input 
                        value={clockConfig.textColor}
                        onChange={(e) => setClockConfig(prev => ({ ...prev, textColor: e.target.value }))}
                        className="flex-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Acento</Label>
                    <div className="flex gap-2">
                      <Input 
                        type="color" 
                        value={clockConfig.accentColor}
                        onChange={(e) => setClockConfig(prev => ({ ...prev, accentColor: e.target.value }))}
                        className="w-12 h-9 p-1 cursor-pointer"
                      />
                      <Input 
                        value={clockConfig.accentColor}
                        onChange={(e) => setClockConfig(prev => ({ ...prev, accentColor: e.target.value }))}
                        className="flex-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Layout & Size */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Layout</Label>
                  <Select 
                    value={clockConfig.layout} 
                    onValueChange={(v: "vertical" | "horizontal" | "grid") => 
                      setClockConfig(prev => ({ ...prev, layout: v }))
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
                    value={clockConfig.size} 
                    onValueChange={(v: "sm" | "md" | "lg" | "xl" | "2xl") => 
                      setClockConfig(prev => ({ ...prev, size: v }))
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
                    value={clockConfig.delay}
                    onChange={(e) => setClockConfig(prev => ({ ...prev, delay: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Mostrar cabecera</Label>
                  <div className="flex items-center h-9">
                    <Switch
                      checked={clockConfig.showHeader}
                      onCheckedChange={(checked) => 
                        setClockConfig(prev => ({ ...prev, showHeader: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Wave Selection */}
              <div>
                <Label className="text-xs mb-3 block">Eventos a mostrar (vacío = todos)</Label>
                <div className="flex flex-wrap gap-2">
                  {waves.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay eventos con hora de salida configurada</p>
                  ) : (
                    waves.map((wave) => (
                      <Badge
                        key={wave.id}
                        variant={clockConfig.selectedWaves.includes(wave.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleWaveSelection(wave.id)}
                      >
                        {wave.distance_name || wave.wave_name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <Separator />

              {/* Generated URL */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">URL Generada</Label>
                <div className="flex gap-2">
                  <Input 
                    readOnly 
                    value={`${baseUrl}${buildClockUrl()}`}
                    className="text-xs font-mono"
                  />
                  <Button 
                    size="icon" 
                    variant="outline"
                    onClick={() => copyToClipboard(buildClockUrl())}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="outline"
                    onClick={() => openPreview(buildClockUrl())}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overlays Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {overlays.map((overlay) => {
            const isDisabled = !selectedRace;
            const Icon = overlay.icon;
            
            return (
              <Card 
                key={overlay.id} 
                className={`transition-all ${isDisabled ? 'opacity-50' : 'hover:shadow-lg'}`}
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
                  <div className="flex gap-2">
                    <Button 
                      className="flex-1" 
                      size="sm"
                      variant="outline"
                      onClick={() => openPreview(overlay.path)}
                      disabled={isDisabled}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Ver
                    </Button>
                    <Button 
                      className="flex-1"
                      size="sm"
                      onClick={() => copyToClipboard(overlay.path)}
                      disabled={isDisabled}
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
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Cómo usar en OBS Studio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Selecciona la carrera y configura el overlay</li>
              <li>Copia la URL generada</li>
              <li>En OBS, añade una fuente <strong>"Navegador" (Browser)</strong></li>
              <li>Pega la URL y configura <strong>1920x1080</strong></li>
              <li>Activa <strong>"Actualizar navegador cuando la escena se active"</strong></li>
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