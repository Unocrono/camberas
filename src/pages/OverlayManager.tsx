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
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { 
  Tv2, 
  Settings,
  Eye,
  Palette,
  Bike,
  Sliders,
  Save,
  RotateCcw,
  Play,
  Copy,
  ExternalLink,
  Clock
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import OverlayVisualEditor from "@/components/admin/OverlayVisualEditor";

interface Race {
  id: string;
  name: string;
  slug: string | null;
  date: string;
  race_type: string;
}

interface Moto {
  id: string;
  name: string;
  name_tv: string | null;
  color: string;
  race_distance_id: string | null;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface OverlayConfig {
  id?: string;
  race_id: string;
  delay_seconds: number;
  layout: "horizontal" | "vertical" | "square";
  speed_font: string;
  speed_size: number;
  speed_color: string;
  speed_bg_color: string;
  speed_visible: boolean;
  speed_manual_mode: boolean;
  speed_manual_value: string | null;
  speed_bg_opacity: number;
  speed_pos_x: number;
  speed_pos_y: number;
  speed_scale: number;
  speed_display_type: "speed" | "pace";
  distance_font: string;
  distance_size: number;
  distance_color: string;
  distance_bg_color: string;
  distance_visible: boolean;
  distance_manual_mode: boolean;
  distance_manual_value: string | null;
  distance_bg_opacity: number;
  distance_pos_x: number;
  distance_pos_y: number;
  distance_scale: number;
  gaps_font: string;
  gaps_size: number;
  gaps_color: string;
  gaps_bg_color: string;
  gaps_visible: boolean;
  gaps_manual_mode: boolean;
  gaps_manual_value: string | null;
  gaps_bg_opacity: number;
  gaps_pos_x: number;
  gaps_pos_y: number;
  gaps_scale: number;
  clock_font: string;
  clock_size: number;
  clock_color: string;
  clock_bg_color: string;
  clock_visible: boolean;
  clock_bg_opacity: number;
  clock_pos_x: number;
  clock_pos_y: number;
  clock_scale: number;
  // Checkpoint element
  checkpoint_font: string;
  checkpoint_size: number;
  checkpoint_color: string;
  checkpoint_bg_color: string;
  checkpoint_visible: boolean;
  checkpoint_manual_mode: boolean;
  checkpoint_manual_value: string | null;
  checkpoint_bg_opacity: number;
  checkpoint_pos_x: number;
  checkpoint_pos_y: number;
  checkpoint_scale: number;
  active_wave_ids: string[];
  selected_moto_id: string | null;
  compare_moto_id: string | null;
  // Route Map Overlay
  route_map_visible: boolean;
  route_map_line_color: string;
  route_map_line_width: number;
  route_map_moto_label_size: number;
  route_map_moto_label_color: string;
  route_map_moto_label_bg_color: string;
  // Elevation Overlay
  elevation_visible: boolean;
  elevation_line_color: string;
  elevation_fill_opacity: number;
  elevation_moto_marker_size: number;
  // Shared config for map/elevation overlays
  map_overlay_moto_ids: string[];
  selected_distance_id: string | null;
}

const FONTS = [
  { value: "Bebas Neue", label: "Bebas Neue", class: "font-bebas" },
  { value: "Archivo Black", label: "Archivo Black", class: "font-archivo" },
  { value: "Roboto Condensed", label: "Roboto Condensed", class: "font-roboto-condensed" },
  { value: "Barlow Semi Condensed", label: "Barlow Semi Condensed", class: "font-barlow" },
];

const LAYOUTS = [
  { value: "horizontal", label: "Horizontal (inferior)" },
  { value: "vertical", label: "Vertical (lateral)" },
  { value: "square", label: "Cuadrado (esquina)" },
];

const defaultConfig: Omit<OverlayConfig, "id" | "race_id"> = {
  delay_seconds: 0,
  layout: "horizontal",
  speed_font: "Bebas Neue",
  speed_size: 72,
  speed_color: "#FFFFFF",
  speed_bg_color: "#000000",
  speed_visible: true,
  speed_manual_mode: false,
  speed_manual_value: null,
  speed_bg_opacity: 0.7,
  speed_pos_x: 50,
  speed_pos_y: 85,
  speed_scale: 1.0,
  speed_display_type: "speed",
  distance_font: "Roboto Condensed",
  distance_size: 48,
  distance_color: "#FFFFFF",
  distance_bg_color: "#1a1a1a",
  distance_visible: true,
  distance_manual_mode: false,
  distance_manual_value: null,
  distance_bg_opacity: 0.7,
  distance_pos_x: 25,
  distance_pos_y: 85,
  distance_scale: 1.0,
  gaps_font: "Barlow Semi Condensed",
  gaps_size: 36,
  gaps_color: "#00FF00",
  gaps_bg_color: "#000000",
  gaps_visible: true,
  gaps_manual_mode: false,
  gaps_manual_value: null,
  gaps_bg_opacity: 0.7,
  gaps_pos_x: 75,
  gaps_pos_y: 85,
  gaps_scale: 1.0,
  clock_font: "Bebas Neue",
  clock_size: 72,
  clock_color: "#FFFFFF",
  clock_bg_color: "#000000",
  clock_visible: true,
  clock_bg_opacity: 0.7,
  clock_pos_x: 50,
  clock_pos_y: 10,
  clock_scale: 1.0,
  checkpoint_font: "Roboto Condensed",
  checkpoint_size: 36,
  checkpoint_color: "#FFFFFF",
  checkpoint_bg_color: "#1a1a1a",
  checkpoint_visible: true,
  checkpoint_manual_mode: false,
  checkpoint_manual_value: null,
  checkpoint_bg_opacity: 0.7,
  checkpoint_pos_x: 90,
  checkpoint_pos_y: 85,
  checkpoint_scale: 1.0,
  active_wave_ids: [],
  selected_moto_id: null,
  compare_moto_id: null,
  // Route Map Overlay defaults
  route_map_visible: true,
  route_map_line_color: "#FF0000",
  route_map_line_width: 4,
  route_map_moto_label_size: 16,
  route_map_moto_label_color: "#FFFFFF",
  route_map_moto_label_bg_color: "#000000",
  // Elevation Overlay defaults
  elevation_visible: true,
  elevation_line_color: "#00FF00",
  elevation_fill_opacity: 0.3,
  elevation_moto_marker_size: 10,
  // Shared config
  map_overlay_moto_ids: [],
  selected_distance_id: null,
};

const OverlayManager = () => {
  const navigate = useNavigate();
  const [races, setRaces] = useState<Race[]>([]);
  const [raceDistances, setRaceDistances] = useState<RaceDistance[]>([]);
  const [motos, setMotos] = useState<Moto[]>([]);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  
  const [selectedRace, setSelectedRace] = useState<string>("");
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<OverlayConfig | null>(null);

  const baseUrl = window.location.origin;

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Debes iniciar sesión para acceder a esta página");
        navigate("/auth");
        return;
      }
      setUser(session.user);
      setAuthChecked(true);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (authChecked) {
      fetchRaces();
    }
  }, [authChecked]);

  useEffect(() => {
    if (selectedRace) {
      fetchRaceDistances();
      fetchMotos();
      fetchConfig();
    }
  }, [selectedRace]);

  // Auto-select first distance when distances are loaded and none is selected
  useEffect(() => {
    if (raceDistances.length > 0) {
      // If config has a valid distance, use it; otherwise use the first one
      const configDistanceId = config?.selected_distance_id;
      const configDistanceExists = configDistanceId && raceDistances.some(d => d.id === configDistanceId);
      
      if (configDistanceExists) {
        setSelectedDistanceId(configDistanceId);
      } else if (!selectedDistanceId || !raceDistances.some(d => d.id === selectedDistanceId)) {
        // Auto-select first distance by display order (already ordered)
        setSelectedDistanceId(raceDistances[0].id);
      }
    }
  }, [raceDistances, config?.selected_distance_id]);

  // Sync selectedDistanceId to config when it changes
  useEffect(() => {
    if (selectedDistanceId && config && config.selected_distance_id !== selectedDistanceId) {
      updateConfig("selected_distance_id", selectedDistanceId);
    }
  }, [selectedDistanceId]);

  const fetchRaceDistances = async () => {
    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", selectedRace)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setRaceDistances(data || []);
    } catch (error) {
      console.error("Error fetching race distances:", error);
    }
  };

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select("id, name, slug, date, race_type")
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

  const fetchMotos = async () => {
    try {
      const { data, error } = await supabase
        .from("race_motos")
        .select("id, name, name_tv, color, race_distance_id")
        .eq("race_id", selectedRace)
        .eq("is_active", true)
        .order("moto_order");

      if (error) throw error;
      setMotos(data || []);
    } catch (error) {
      console.error("Error fetching motos:", error);
    }
  };


  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("overlay_config")
        .select("*")
        .eq("race_id", selectedRace)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data as unknown as OverlayConfig);
      } else {
        // Set default speed_display_type based on race_type
        const race = races.find(r => r.id === selectedRace);
        const defaultDisplayType = race?.race_type === 'mtb' ? 'speed' : 'pace';
        setConfig({ 
          ...defaultConfig, 
          race_id: selectedRace,
          speed_display_type: defaultDisplayType
        });
      }
    } catch (error) {
      console.error("Error fetching config:", error);
      const race = races.find(r => r.id === selectedRace);
      const defaultDisplayType = race?.race_type === 'mtb' ? 'speed' : 'pace';
      setConfig({ 
        ...defaultConfig, 
        race_id: selectedRace,
        speed_display_type: defaultDisplayType
      });
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("overlay_config")
        .upsert({
          ...config,
          race_id: selectedRace,
        }, { onConflict: "race_id" });

      if (error) throw error;
      toast.success("Configuración guardada");
      fetchConfig();
    } catch (error) {
      console.error("Error saving config:", error);
      toast.error("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const resetConfig = () => {
    setConfig({ ...defaultConfig, race_id: selectedRace });
  };

  const updateConfig = <K extends keyof OverlayConfig>(key: K, value: OverlayConfig[K]) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : null);
  };

  const selectedRaceData = races.find(r => r.id === selectedRace);
  const overlayUrl = selectedRace ? `${baseUrl}/overlay/moto/${selectedRaceData?.slug || selectedRace}` : "";
  const routeMapUrl = selectedRace ? `${baseUrl}/overlay/route-map/${selectedRaceData?.slug || selectedRace}` : "";
  const elevationUrl = selectedRace ? `${baseUrl}/overlay/elevation/${selectedRaceData?.slug || selectedRace}` : "";

  const copyToClipboard = (url: string = overlayUrl) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copiada al portapapeles");
  };

  const openPreview = (url: string = `/overlay/moto/${selectedRaceData?.slug || selectedRace}`) => {
    window.open(url, "_blank", "width=1920,height=1080");
  };

  const toggleMapOverlayMoto = (motoId: string) => {
    const currentIds = config?.map_overlay_moto_ids || [];
    const newIds = currentIds.includes(motoId)
      ? currentIds.filter(id => id !== motoId)
      : [...currentIds, motoId];
    updateConfig("map_overlay_moto_ids", newIds);
  };

  const FontPreview = ({ fontName, size, color, bgColor, label }: { fontName: string; size: number; color: string; bgColor: string; label: string }) => {
    const getFontClass = () => {
      switch (fontName) {
        case "Bebas Neue": return "font-bebas";
        case "Archivo Black": return "font-archivo";
        case "Roboto Condensed": return "font-roboto-condensed";
        case "Barlow Semi Condensed": return "font-barlow";
        default: return "";
      }
    };

    return (
      <div 
        className={`px-4 py-2 rounded ${getFontClass()}`}
        style={{ 
          backgroundColor: bgColor, 
          color: color,
          fontSize: `${Math.min(size, 48)}px`
        }}
      >
        {label}
      </div>
    );
  };

  const ElementStyleEditor = ({ 
    prefix, 
    label, 
    config: cfg 
  }: { 
    prefix: "speed" | "distance" | "gaps"; 
    label: string;
    config: OverlayConfig;
  }) => {
    const fontKey = `${prefix}_font` as keyof OverlayConfig;
    const sizeKey = `${prefix}_size` as keyof OverlayConfig;
    const colorKey = `${prefix}_color` as keyof OverlayConfig;
    const bgColorKey = `${prefix}_bg_color` as keyof OverlayConfig;
    const visibleKey = `${prefix}_visible` as keyof OverlayConfig;
    const manualModeKey = `${prefix}_manual_mode` as keyof OverlayConfig;
    const manualValueKey = `${prefix}_manual_value` as keyof OverlayConfig;
    const bgOpacityKey = `${prefix}_bg_opacity` as keyof OverlayConfig;
    const posXKey = `${prefix}_pos_x` as keyof OverlayConfig;
    const posYKey = `${prefix}_pos_y` as keyof OverlayConfig;

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{label}</CardTitle>
            <div className="flex items-center gap-2">
              <Switch
                checked={cfg[visibleKey] as boolean}
                onCheckedChange={(v) => updateConfig(visibleKey, v)}
              />
              <Label className="text-xs text-muted-foreground">Visible</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Speed Display Type Selector */}
          {prefix === "speed" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Mostrar como</Label>
              <Select 
                value={cfg.speed_display_type || "speed"} 
                onValueChange={(v) => updateConfig("speed_display_type", v as "speed" | "pace")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="speed">Velocidad (km/h)</SelectItem>
                  <SelectItem value="pace">Ritmo (min/km)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Font Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fuente</Label>
              <Select 
                value={cfg[fontKey] as string} 
                onValueChange={(v) => updateConfig(fontKey, v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map(font => (
                    <SelectItem key={font.value} value={font.value} className={font.class}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tamaño: {cfg[sizeKey]}px</Label>
              <Slider
                value={[cfg[sizeKey] as number]}
                onValueChange={([v]) => updateConfig(sizeKey, v)}
                min={24}
                max={120}
                step={2}
                className="mt-2"
              />
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Color texto</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={cfg[colorKey] as string}
                  onChange={(e) => updateConfig(colorKey, e.target.value)}
                  className="w-10 h-9 p-1 cursor-pointer"
                />
                <Input 
                  value={cfg[colorKey] as string}
                  onChange={(e) => updateConfig(colorKey, e.target.value)}
                  className="flex-1 font-mono text-xs h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Color fondo</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={cfg[bgColorKey] as string}
                  onChange={(e) => updateConfig(bgColorKey, e.target.value)}
                  className="w-10 h-9 p-1 cursor-pointer"
                />
                <Input 
                  value={cfg[bgColorKey] as string}
                  onChange={(e) => updateConfig(bgColorKey, e.target.value)}
                  className="flex-1 font-mono text-xs h-9"
                />
              </div>
            </div>
          </div>

          {/* Background Opacity */}
          <div className="space-y-1.5">
            <Label className="text-xs">Transparencia fondo: {Math.round((cfg[bgOpacityKey] as number || 0.7) * 100)}%</Label>
            <Slider
              value={[(cfg[bgOpacityKey] as number || 0.7) * 100]}
              onValueChange={([v]) => updateConfig(bgOpacityKey, v / 100)}
              min={0}
              max={100}
              step={5}
            />
          </div>

          {/* Position Controls */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Posición X: {cfg[posXKey] as number || 50}%</Label>
              <Slider
                value={[cfg[posXKey] as number || 50]}
                onValueChange={([v]) => updateConfig(posXKey, v)}
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Posición Y: {cfg[posYKey] as number || 90}%</Label>
              <Slider
                value={[cfg[posYKey] as number || 90]}
                onValueChange={([v]) => updateConfig(posYKey, v)}
                min={0}
                max={100}
                step={1}
              />
            </div>
          </div>

          {/* Manual Mode */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={cfg[manualModeKey] as boolean}
                onCheckedChange={(v) => updateConfig(manualModeKey, v)}
              />
              <Label className="text-xs">Modo Manual</Label>
            </div>
            {cfg[manualModeKey] && (
              <Input
                placeholder="Valor manual..."
                value={(cfg[manualValueKey] as string) || ""}
                onChange={(e) => updateConfig(manualValueKey, e.target.value)}
                className="h-9"
              />
            )}
          </div>

          {/* Preview */}
          <div className="pt-2">
            <Label className="text-xs text-muted-foreground mb-2 block">Vista previa</Label>
            <FontPreview 
              fontName={cfg[fontKey] as string}
              size={cfg[sizeKey] as number}
              color={cfg[colorKey] as string}
              bgColor={cfg[bgColorKey] as string}
              label={prefix === "speed" ? (cfg.speed_display_type === "pace" ? "5:30 min/km" : "145 km/h") : prefix === "distance" ? "32.5 km" : "+0:15"}
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Verificando acceso...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-primary/10">
            <Tv2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Sistema de Gráficos PRO</h1>
            <p className="text-muted-foreground">
              Overlays profesionales para vMix/OBS con estilos personalizables
            </p>
          </div>
        </div>

        {/* Race Selection */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5" />
              Selección de Carrera
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedRace} onValueChange={setSelectedRace}>
              <SelectTrigger className="max-w-md">
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
          </CardContent>
        </Card>

        {selectedRace && config && (
          <Tabs defaultValue="control" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-lg">
              <TabsTrigger value="control" className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Control Vivo
              </TabsTrigger>
              <TabsTrigger value="styles" className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Diseño
              </TabsTrigger>
              <TabsTrigger value="output" className="flex items-center gap-2">
                <Tv2 className="h-4 w-4" />
                Salida
              </TabsTrigger>
            </TabsList>

            {/* Control Tab */}
            <TabsContent value="control" className="space-y-6">
              {/* Event/Distance Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sliders className="h-5 w-5" />
                    Evento / Distancia
                  </CardTitle>
                  <CardDescription>
                    Selecciona el evento para calcular distancias correctamente
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select 
                    value={selectedDistanceId} 
                    onValueChange={(v) => {
                      setSelectedDistanceId(v);
                      updateConfig("selected_distance_id", v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un evento" />
                    </SelectTrigger>
                    <SelectContent>
                      {raceDistances.map((distance) => (
                        <SelectItem key={distance.id} value={distance.id}>
                          {distance.name} ({distance.distance_km} km)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Speed Display Type Selector */}
                  <div className="pt-2 border-t">
                    <Label className="text-sm font-medium mb-2 block">Mostrar velocidad como</Label>
                    <Select 
                      value={config.speed_display_type || "speed"} 
                      onValueChange={(v) => updateConfig("speed_display_type", v as "speed" | "pace")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="speed">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs bg-muted px-1 rounded">km/h</span>
                            Velocidad
                          </div>
                        </SelectItem>
                        <SelectItem value="pace">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs bg-muted px-1 rounded">min/km</span>
                            Ritmo
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {races.find(r => r.id === selectedRace)?.race_type === 'mtb' 
                        ? 'MTB: se recomienda velocidad (km/h)' 
                        : 'Trail/Running: se recomienda ritmo (min/km)'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Moto Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bike className="h-5 w-5" />
                      Moto Principal
                    </CardTitle>
                    <CardDescription>
                      Selecciona la moto a mostrar en el overlay
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select 
                      value={config.selected_moto_id || ""} 
                      onValueChange={(v) => updateConfig("selected_moto_id", v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Ninguna moto seleccionada" />
                      </SelectTrigger>
                      <SelectContent>
                        {motos
                          .filter(moto => !selectedDistanceId || moto.race_distance_id === selectedDistanceId || !moto.race_distance_id)
                          .map((moto) => (
                          <SelectItem key={moto.id} value={moto.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: moto.color }}
                              />
                              {moto.name_tv || moto.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {/* Compare Moto */}
                <Card>
                  <CardHeader>
                    <CardTitle>Moto de Comparación</CardTitle>
                    <CardDescription>
                      Para mostrar gaps entre motos
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select 
                      value={config.compare_moto_id || "none"} 
                      onValueChange={(v) => updateConfig("compare_moto_id", v === "none" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin comparación" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin comparación</SelectItem>
                        {motos.filter(m => m.id !== config.selected_moto_id).map((moto) => (
                          <SelectItem key={moto.id} value={moto.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: moto.color }}
                              />
                              {moto.name_tv || moto.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              </div>

              {/* Delay Control */}
              <Card>
                <CardHeader>
                  <CardTitle>Control de Delay</CardTitle>
                  <CardDescription>
                    Retrasa los datos para sincronizar con el retardo del vídeo en vMix
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-sm mb-2 block">
                        Delay: {config.delay_seconds} segundos
                      </Label>
                      <Slider
                        value={[config.delay_seconds]}
                        onValueChange={([v]) => updateConfig("delay_seconds", v)}
                        min={0}
                        max={30}
                        step={1}
                      />
                    </div>
                    <Input
                      type="number"
                      value={config.delay_seconds}
                      onChange={(e) => updateConfig("delay_seconds", parseInt(e.target.value) || 0)}
                      className="w-20"
                      min={0}
                      max={30}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Layout Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Layout del Overlay</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    {LAYOUTS.map(layout => (
                      <Button
                        key={layout.value}
                        variant={config.layout === layout.value ? "default" : "outline"}
                        onClick={() => updateConfig("layout", layout.value as OverlayConfig["layout"])}
                        className="flex-1"
                      >
                        {layout.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </TabsContent>

            <TabsContent value="styles" className="space-y-6">
              <OverlayVisualEditor
                speedConfig={{
                  visible: config.speed_visible,
                  font: config.speed_font,
                  size: config.speed_size,
                  color: config.speed_color,
                  bgColor: config.speed_bg_color,
                  bgOpacity: config.speed_bg_opacity,
                  posX: config.speed_pos_x,
                  posY: config.speed_pos_y,
                  scale: config.speed_scale || 1,
                }}
                distanceConfig={{
                  visible: config.distance_visible,
                  font: config.distance_font,
                  size: config.distance_size,
                  color: config.distance_color,
                  bgColor: config.distance_bg_color,
                  bgOpacity: config.distance_bg_opacity,
                  posX: config.distance_pos_x,
                  posY: config.distance_pos_y,
                  scale: config.distance_scale || 1,
                }}
                gapsConfig={{
                  visible: config.gaps_visible,
                  font: config.gaps_font,
                  size: config.gaps_size,
                  color: config.gaps_color,
                  bgColor: config.gaps_bg_color,
                  bgOpacity: config.gaps_bg_opacity,
                  posX: config.gaps_pos_x,
                  posY: config.gaps_pos_y,
                  scale: config.gaps_scale || 1,
                }}
                clockConfig={{
                  visible: config.clock_visible,
                  font: config.clock_font,
                  size: config.clock_size,
                  color: config.clock_color,
                  bgColor: config.clock_bg_color,
                  bgOpacity: config.clock_bg_opacity,
                  posX: config.clock_pos_x,
                  posY: config.clock_pos_y,
                  scale: config.clock_scale || 1,
                }}
                checkpointConfig={{
                  visible: config.checkpoint_visible ?? true,
                  font: config.checkpoint_font ?? "Roboto Condensed",
                  size: config.checkpoint_size ?? 36,
                  color: config.checkpoint_color ?? "#FFFFFF",
                  bgColor: config.checkpoint_bg_color ?? "#1a1a1a",
                  bgOpacity: config.checkpoint_bg_opacity ?? 0.7,
                  posX: config.checkpoint_pos_x ?? 90,
                  posY: config.checkpoint_pos_y ?? 85,
                  scale: config.checkpoint_scale ?? 1,
                }}
                onSpeedChange={(updates) => {
                  if (updates.visible !== undefined) updateConfig("speed_visible", updates.visible);
                  if (updates.font !== undefined) updateConfig("speed_font", updates.font);
                  if (updates.color !== undefined) updateConfig("speed_color", updates.color);
                  if (updates.bgColor !== undefined) updateConfig("speed_bg_color", updates.bgColor);
                  if (updates.bgOpacity !== undefined) updateConfig("speed_bg_opacity", updates.bgOpacity);
                  if (updates.posX !== undefined) updateConfig("speed_pos_x", updates.posX);
                  if (updates.posY !== undefined) updateConfig("speed_pos_y", updates.posY);
                  if (updates.scale !== undefined) updateConfig("speed_scale", updates.scale);
                }}
                onDistanceChange={(updates) => {
                  if (updates.visible !== undefined) updateConfig("distance_visible", updates.visible);
                  if (updates.font !== undefined) updateConfig("distance_font", updates.font);
                  if (updates.color !== undefined) updateConfig("distance_color", updates.color);
                  if (updates.bgColor !== undefined) updateConfig("distance_bg_color", updates.bgColor);
                  if (updates.bgOpacity !== undefined) updateConfig("distance_bg_opacity", updates.bgOpacity);
                  if (updates.posX !== undefined) updateConfig("distance_pos_x", updates.posX);
                  if (updates.posY !== undefined) updateConfig("distance_pos_y", updates.posY);
                  if (updates.scale !== undefined) updateConfig("distance_scale", updates.scale);
                }}
                onGapsChange={(updates) => {
                  if (updates.visible !== undefined) updateConfig("gaps_visible", updates.visible);
                  if (updates.font !== undefined) updateConfig("gaps_font", updates.font);
                  if (updates.color !== undefined) updateConfig("gaps_color", updates.color);
                  if (updates.bgColor !== undefined) updateConfig("gaps_bg_color", updates.bgColor);
                  if (updates.bgOpacity !== undefined) updateConfig("gaps_bg_opacity", updates.bgOpacity);
                  if (updates.posX !== undefined) updateConfig("gaps_pos_x", updates.posX);
                  if (updates.posY !== undefined) updateConfig("gaps_pos_y", updates.posY);
                  if (updates.scale !== undefined) updateConfig("gaps_scale", updates.scale);
                }}
                onClockChange={(updates) => {
                  if (updates.visible !== undefined) updateConfig("clock_visible", updates.visible);
                  if (updates.font !== undefined) updateConfig("clock_font", updates.font);
                  if (updates.color !== undefined) updateConfig("clock_color", updates.color);
                  if (updates.bgColor !== undefined) updateConfig("clock_bg_color", updates.bgColor);
                  if (updates.bgOpacity !== undefined) updateConfig("clock_bg_opacity", updates.bgOpacity);
                  if (updates.posX !== undefined) updateConfig("clock_pos_x", updates.posX);
                  if (updates.posY !== undefined) updateConfig("clock_pos_y", updates.posY);
                  if (updates.scale !== undefined) updateConfig("clock_scale", updates.scale);
                }}
                onCheckpointChange={(updates) => {
                  if (updates.visible !== undefined) updateConfig("checkpoint_visible", updates.visible);
                  if (updates.font !== undefined) updateConfig("checkpoint_font", updates.font);
                  if (updates.color !== undefined) updateConfig("checkpoint_color", updates.color);
                  if (updates.bgColor !== undefined) updateConfig("checkpoint_bg_color", updates.bgColor);
                  if (updates.bgOpacity !== undefined) updateConfig("checkpoint_bg_opacity", updates.bgOpacity);
                  if (updates.posX !== undefined) updateConfig("checkpoint_pos_x", updates.posX);
                  if (updates.posY !== undefined) updateConfig("checkpoint_pos_y", updates.posY);
                  if (updates.scale !== undefined) updateConfig("checkpoint_scale", updates.scale);
                }}
                onSave={saveConfig}
                saving={saving}
              />
            </TabsContent>

            {/* Output Tab */}
            <TabsContent value="output" className="space-y-6">
              {/* Moto Overlay URL */}
              <Card>
                <CardHeader>
                  <CardTitle>Overlay de Datos (Moto)</CardTitle>
                  <CardDescription>Velocidad, distancia, gaps, cronómetro</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input value={overlayUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" onClick={() => copyToClipboard(overlayUrl)}><Copy className="h-4 w-4" /></Button>
                    <Button onClick={() => openPreview(`/overlay/moto/${selectedRaceData?.slug || selectedRace}`)}><ExternalLink className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>

              {/* Route Map Overlay URL */}
              <Card>
                <CardHeader>
                  <CardTitle>Overlay de Mapa de Ruta</CardTitle>
                  <CardDescription>Track GPX con posición de motos (fondo transparente)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input value={routeMapUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" onClick={() => copyToClipboard(routeMapUrl)}><Copy className="h-4 w-4" /></Button>
                    <Button onClick={() => openPreview(`/overlay/route-map/${selectedRaceData?.slug || selectedRace}`)}><ExternalLink className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Motos a mostrar en Mapa/Perfil:</Label>
                    <div className="flex flex-wrap gap-2">
                      {motos.filter(m => !selectedDistanceId || m.race_distance_id === selectedDistanceId || !m.race_distance_id).map(moto => (
                        <Badge
                          key={moto.id}
                          variant={(config.map_overlay_moto_ids || []).includes(moto.id) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleMapOverlayMoto(moto.id)}
                        >
                          <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: moto.color }} />
                          {moto.name_tv || moto.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Elevation Overlay URL */}
              <Card>
                <CardHeader>
                  <CardTitle>Overlay de Perfil de Elevación</CardTitle>
                  <CardDescription>Perfil altimétrico con posición de motos (fondo transparente)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input value={elevationUrl} readOnly className="font-mono text-sm" />
                    <Button variant="outline" onClick={() => copyToClipboard(elevationUrl)}><Copy className="h-4 w-4" /></Button>
                    <Button onClick={() => openPreview(`/overlay/elevation/${selectedRaceData?.slug || selectedRace}`)}><ExternalLink className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>

              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">💡 Configuración en vMix</p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                  <li>Añade un input <strong>Web Browser</strong></li>
                  <li>Pega la URL y configura <strong>1920x1080</strong></li>
                  <li>El fondo es transparente (canal Alpha)</li>
                  <li>Ajusta el delay según el retardo de tu vídeo</li>
                </ol>
              </div>
            </TabsContent>

            {/* Save Actions */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={resetConfig}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar
              </Button>
              <Button onClick={saveConfig} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Guardando..." : "Guardar Configuración"}
              </Button>
            </div>
          </Tabs>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default OverlayManager;
