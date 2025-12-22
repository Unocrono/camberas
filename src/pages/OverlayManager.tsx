import { useState, useEffect } from "react";
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
  ExternalLink
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface Race {
  id: string;
  name: string;
  slug: string | null;
  date: string;
}

interface Moto {
  id: string;
  name: string;
  name_tv: string | null;
  color: string;
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
  distance_font: string;
  distance_size: number;
  distance_color: string;
  distance_bg_color: string;
  distance_visible: boolean;
  distance_manual_mode: boolean;
  distance_manual_value: string | null;
  gaps_font: string;
  gaps_size: number;
  gaps_color: string;
  gaps_bg_color: string;
  gaps_visible: boolean;
  gaps_manual_mode: boolean;
  gaps_manual_value: string | null;
  selected_moto_id: string | null;
  compare_moto_id: string | null;
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
  distance_font: "Roboto Condensed",
  distance_size: 48,
  distance_color: "#FFFFFF",
  distance_bg_color: "#1a1a1a",
  distance_visible: true,
  distance_manual_mode: false,
  distance_manual_value: null,
  gaps_font: "Barlow Semi Condensed",
  gaps_size: 36,
  gaps_color: "#00FF00",
  gaps_bg_color: "#000000",
  gaps_visible: true,
  gaps_manual_mode: false,
  gaps_manual_value: null,
  selected_moto_id: null,
  compare_moto_id: null,
};

const OverlayManager = () => {
  const [races, setRaces] = useState<Race[]>([]);
  const [motos, setMotos] = useState<Moto[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<OverlayConfig | null>(null);

  const baseUrl = window.location.origin;

  useEffect(() => {
    fetchRaces();
  }, []);

  useEffect(() => {
    if (selectedRace) {
      fetchMotos();
      fetchConfig();
    }
  }, [selectedRace]);

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select("id, name, slug, date")
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
        .select("id, name, name_tv, color")
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
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setConfig(data as unknown as OverlayConfig);
      } else {
        setConfig({ ...defaultConfig, race_id: selectedRace });
      }
    } catch (error) {
      console.error("Error fetching config:", error);
      setConfig({ ...defaultConfig, race_id: selectedRace });
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(overlayUrl);
    toast.success("URL copiada al portapapeles");
  };

  const openPreview = () => {
    window.open(`/overlay/moto/${selectedRaceData?.slug || selectedRace}`, "_blank", "width=1920,height=1080");
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
              label={prefix === "speed" ? "145 km/h" : prefix === "distance" ? "32.5 km" : "+0:15"}
            />
          </div>
        </CardContent>
      </Card>
    );
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
                        {motos.map((moto) => (
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
                      value={config.compare_moto_id || ""} 
                      onValueChange={(v) => updateConfig("compare_moto_id", v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin comparación" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Sin comparación</SelectItem>
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

            {/* Styles Tab */}
            <TabsContent value="styles" className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <ElementStyleEditor prefix="speed" label="Velocidad" config={config} />
                <ElementStyleEditor prefix="distance" label="Distancia" config={config} />
                <ElementStyleEditor prefix="gaps" label="Gaps" config={config} />
              </div>
            </TabsContent>

            {/* Output Tab */}
            <TabsContent value="output" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>URL del Overlay para vMix</CardTitle>
                  <CardDescription>
                    Usa esta URL como fuente Browser en vMix/OBS con resolución 1920x1080
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input 
                      value={overlayUrl} 
                      readOnly 
                      className="font-mono text-sm"
                    />
                    <Button variant="outline" onClick={copyToClipboard}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button onClick={openPreview}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir
                    </Button>
                  </div>

                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <p className="text-sm font-medium">💡 Configuración en vMix</p>
                    <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                      <li>Añade un input <strong>Web Browser</strong></li>
                      <li>Pega la URL y configura <strong>1920x1080</strong></li>
                      <li>El fondo es transparente (canal Alpha)</li>
                      <li>Ajusta el delay según el retardo de tu vídeo</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>
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
