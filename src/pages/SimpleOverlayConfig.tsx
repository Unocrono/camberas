// src/pages/SimpleOverlayConfig.tsx

/**
 * CONFIGURADOR VISUAL SIMPLE DE OVERLAYS
 * Interfaz simplificada para configurar overlays sin tocar Supabase
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Save, Eye, RotateCcw, Copy, ExternalLink } from 'lucide-react';
import { useOverlayConfig } from '@/overlays/core/useOverlayConfig';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface Race {
  id: string;
  name: string;
  slug: string;
}

const FONTS = [
  { value: "Bebas Neue", label: "Bebas Neue" },
  { value: "Archivo Black", label: "Archivo Black" },
  { value: "Roboto Condensed", label: "Roboto Condensed" },
  { value: "Barlow Semi Condensed", label: "Barlow Semi Condensed" },
];

const SimpleOverlayConfig = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  const raceIdFromUrl = searchParams.get('race') || '';

  const {
    config,
    saving,
    updateElement,
    updateConfig,
    saveConfig,
    resetConfig,
  } = useOverlayConfig({
    raceId: selectedRaceId || raceIdFromUrl,
    autoSubscribe: true,
  });

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Debes iniciar sesión para acceder a esta página");
        navigate("/auth");
        return;
      }
      setAuthChecked(true);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fetch races
  useEffect(() => {
    if (!authChecked) return;

    const fetchRaces = async () => {
      const { data, error } = await supabase
        .from('races')
        .select('id, name, slug')
        .order('date', { ascending: false });

      if (!error && data) {
        setRaces(data);
        if (data.length > 0 && !selectedRaceId && !raceIdFromUrl) {
          setSelectedRaceId(data[0].id);
          setSearchParams({ race: data[0].id });
        } else if (raceIdFromUrl) {
          setSelectedRaceId(raceIdFromUrl);
        }
      }
      setLoading(false);
    };

    fetchRaces();
  }, [authChecked]);

  useEffect(() => {
    if (raceIdFromUrl && raceIdFromUrl !== selectedRaceId) {
      setSelectedRaceId(raceIdFromUrl);
    }
  }, [raceIdFromUrl]);

  const handleRaceChange = (raceId: string) => {
    setSelectedRaceId(raceId);
    setSearchParams({ race: raceId });
  };

  const selectedRace = races.find(r => r.id === selectedRaceId);
  const overlayUrl = selectedRace 
    ? `https://camberas.com/overlay/moto/${selectedRace.slug}` 
    : '';

  const copyUrl = () => {
    navigator.clipboard.writeText(overlayUrl);
    toast.success('URL copiada al portapapeles');
  };

  const openPreview = () => {
    if (selectedRace) {
      window.open(`/overlay/moto/${selectedRace.slug}`, '_blank', 'width=1920,height=1080');
    }
  };

  const handleSave = async () => {
    try {
      await saveConfig();
      toast.success('Configuración guardada correctamente');
    } catch (error) {
      toast.error('Error al guardar la configuración');
    }
  };

  const handleReset = () => {
    if (confirm('¿Estás seguro de restaurar la configuración por defecto?')) {
      resetConfig();
      toast.info('Configuración restaurada');
    }
  };

  if (loading || !authChecked) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">
              {!authChecked ? "Verificando acceso..." : "Cargando..."}
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-muted-foreground">Selecciona una carrera para configurar</p>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">⚙️ Configurador Simple de Overlays</h1>
          <p className="text-muted-foreground">
            Configura tus overlays de forma visual sin tocar la base de datos
          </p>
        </div>

        {/* Race Selector */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Seleccionar Carrera</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedRaceId} onValueChange={handleRaceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una carrera" />
              </SelectTrigger>
              <SelectContent>
                {races.map(race => (
                  <SelectItem key={race.id} value={race.id}>
                    {race.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Main Config */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Preview Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Vista Previa
              </CardTitle>
              <CardDescription>URL del overlay para OBS/vMix</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={overlayUrl} readOnly className="font-mono text-sm" />
                <Button variant="outline" onClick={copyUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button onClick={openPreview}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir
                </Button>
              </div>
              
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  💡 <strong>Tip:</strong> Deja esta ventana abierta y abre el overlay en otra pestaña. 
                  Los cambios se verán en tiempo real sin recargar.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Delay Control */}
          <Card>
            <CardHeader>
              <CardTitle>⏱️ Control de Delay</CardTitle>
              <CardDescription>Sincroniza con el retardo del vídeo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Delay: {config.delay_seconds} segundos</Label>
                  <Slider
                    value={[config.delay_seconds]}
                    onValueChange={([v]) => updateConfig({ delay_seconds: v })}
                    min={0}
                    max={30}
                    step={1}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Elements Configuration */}
        <Tabs defaultValue="speed" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="speed">Velocidad</TabsTrigger>
            <TabsTrigger value="distance">Distancia</TabsTrigger>
            <TabsTrigger value="checkpoint">Checkpoint</TabsTrigger>
            <TabsTrigger value="gaps">Gaps</TabsTrigger>
            <TabsTrigger value="clock">Reloj</TabsTrigger>
          </TabsList>

          {/* Speed Tab */}
          <TabsContent value="speed">
            <Card>
              <CardHeader>
                <CardTitle>🚀 Velocidad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Visibility */}
                <div className="flex items-center justify-between">
                  <Label>Mostrar Velocidad</Label>
                  <Switch
                    checked={config.speed.visible}
                    onCheckedChange={(v) => updateElement('speed', { visible: v })}
                  />
                </div>

                {config.speed.visible && (
                  <>
                    {/* Manual Mode */}
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label>Modo Manual</Label>
                        <Switch
                          checked={config.speed.manualMode}
                          onCheckedChange={(v) => updateElement('speed', { manualMode: v })}
                        />
                      </div>
                      {config.speed.manualMode && (
                        <Input
                          placeholder="Ej: 145"
                          value={config.speed.manualValue || ''}
                          onChange={(e) => updateElement('speed', { manualValue: e.target.value })}
                        />
                      )}
                    </div>

                    {/* Font */}
                    <div className="space-y-2">
                      <Label>Fuente</Label>
                      <Select
                        value={config.speed.font}
                        onValueChange={(v) => updateElement('speed', { font: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONTS.map(font => (
                            <SelectItem key={font.value} value={font.value}>
                              {font.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Size */}
                    <div className="space-y-2">
                      <Label>Tamaño: {config.speed.size}px</Label>
                      <Slider
                        value={[config.speed.size]}
                        onValueChange={([v]) => updateElement('speed', { size: v })}
                        min={24}
                        max={120}
                        step={2}
                      />
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Color Texto</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={config.speed.color}
                            onChange={(e) => updateElement('speed', { color: e.target.value })}
                            className="w-14 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={config.speed.color}
                            onChange={(e) => updateElement('speed', { color: e.target.value })}
                            className="flex-1 font-mono text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Color Fondo</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={config.speed.bgColor}
                            onChange={(e) => updateElement('speed', { bgColor: e.target.value })}
                            className="w-14 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={config.speed.bgColor}
                            onChange={(e) => updateElement('speed', { bgColor: e.target.value })}
                            className="flex-1 font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Position */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Posición X: {config.speed.posX}%</Label>
                        <Slider
                          value={[config.speed.posX]}
                          onValueChange={([v]) => updateElement('speed', { posX: v })}
                          min={0}
                          max={100}
                          step={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Posición Y: {config.speed.posY}%</Label>
                        <Slider
                          value={[config.speed.posY]}
                          onValueChange={([v]) => updateElement('speed', { posY: v })}
                          min={0}
                          max={100}
                          step={1}
                        />
                      </div>
                    </div>

                    {/* Scale */}
                    <div className="space-y-2">
                      <Label>Escala: {config.speed.scale.toFixed(1)}x</Label>
                      <Slider
                        value={[config.speed.scale * 100]}
                        onValueChange={([v]) => updateElement('speed', { scale: v / 100 })}
                        min={50}
                        max={200}
                        step={5}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Distance Tab */}
          <TabsContent value="distance">
            <Card>
              <CardHeader>
                <CardTitle>📏 Distancia a Meta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label>Mostrar Distancia</Label>
                  <Switch
                    checked={config.distance.visible}
                    onCheckedChange={(v) => updateElement('distance', { visible: v })}
                  />
                </div>

                {config.distance.visible && (
                  <>
                    {/* Manual Mode */}
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label>Modo Manual</Label>
                        <Switch
                          checked={config.distance.manualMode}
                          onCheckedChange={(v) => updateElement('distance', { manualMode: v })}
                        />
                      </div>
                      {config.distance.manualMode && (
                        <Input
                          placeholder="Ej: 12.5 km"
                          value={config.distance.manualValue || ''}
                          onChange={(e) => updateElement('distance', { manualValue: e.target.value })}
                        />
                      )}
                    </div>

                    {/* Size */}
                    <div className="space-y-2">
                      <Label>Tamaño: {config.distance.size}px</Label>
                      <Slider
                        value={[config.distance.size]}
                        onValueChange={([v]) => updateElement('distance', { size: v })}
                        min={24}
                        max={120}
                        step={2}
                      />
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Color Texto</Label>
                        <Input
                          type="color"
                          value={config.distance.color}
                          onChange={(e) => updateElement('distance', { color: e.target.value })}
                          className="w-full h-10 cursor-pointer"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Color Fondo</Label>
                        <Input
                          type="color"
                          value={config.distance.bgColor}
                          onChange={(e) => updateElement('distance', { bgColor: e.target.value })}
                          className="w-full h-10 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Position */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Posición X: {config.distance.posX}%</Label>
                        <Slider
                          value={[config.distance.posX]}
                          onValueChange={([v]) => updateElement('distance', { posX: v })}
                          min={0}
                          max={100}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Posición Y: {config.distance.posY}%</Label>
                        <Slider
                          value={[config.distance.posY]}
                          onValueChange={([v]) => updateElement('distance', { posY: v })}
                          min={0}
                          max={100}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Checkpoint Tab */}
          <TabsContent value="checkpoint">
            <Card>
              <CardHeader>
                <CardTitle>🎯 Próximo Checkpoint</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label>Mostrar Checkpoint</Label>
                  <Switch
                    checked={config.checkpoint.visible}
                    onCheckedChange={(v) => updateElement('checkpoint', { visible: v })}
                  />
                </div>

                {config.checkpoint.visible && (
                  <>
                    <div className="space-y-2">
                      <Label>Tamaño: {config.checkpoint.size}px</Label>
                      <Slider
                        value={[config.checkpoint.size]}
                        onValueChange={([v]) => updateElement('checkpoint', { size: v })}
                        min={24}
                        max={120}
                        step={2}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Posición X: {config.checkpoint.posX}%</Label>
                        <Slider
                          value={[config.checkpoint.posX]}
                          onValueChange={([v]) => updateElement('checkpoint', { posX: v })}
                          min={0}
                          max={100}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Posición Y: {config.checkpoint.posY}%</Label>
                        <Slider
                          value={[config.checkpoint.posY]}
                          onValueChange={([v]) => updateElement('checkpoint', { posY: v })}
                          min={0}
                          max={100}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Gaps Tab */}
          <TabsContent value="gaps">
            <Card>
              <CardHeader>
                <CardTitle>📊 Gaps entre Motos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label>Mostrar Gaps</Label>
                  <Switch
                    checked={config.gaps.visible}
                    onCheckedChange={(v) => updateElement('gaps', { visible: v })}
                  />
                </div>

                {config.gaps.visible && (
                  <>
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label>Modo Manual</Label>
                        <Switch
                          checked={config.gaps.manualMode}
                          onCheckedChange={(v) => updateElement('gaps', { manualMode: v })}
                        />
                      </div>
                      {config.gaps.manualMode && (
                        <Input
                          placeholder="Ej: +2.5 km"
                          value={config.gaps.manualValue || ''}
                          onChange={(e) => updateElement('gaps', { manualValue: e.target.value })}
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Tamaño: {config.gaps.size}px</Label>
                      <Slider
                        value={[config.gaps.size]}
                        onValueChange={([v]) => updateElement('gaps', { size: v })}
                        min={24}
                        max={120}
                        step={2}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Color</Label>
                        <Input
                          type="color"
                          value={config.gaps.color}
                          onChange={(e) => updateElement('gaps', { color: e.target.value })}
                          className="w-full h-10 cursor-pointer"
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clock Tab */}
          <TabsContent value="clock">
            <Card>
              <CardHeader>
                <CardTitle>⏰ Reloj de Carrera</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label>Mostrar Reloj</Label>
                  <Switch
                    checked={config.clock.visible}
                    onCheckedChange={(v) => updateElement('clock', { visible: v })}
                  />
                </div>

                {config.clock.visible && (
                  <>
                    <div className="space-y-2">
                      <Label>Tamaño: {config.clock.size}px</Label>
                      <Slider
                        value={[config.clock.size]}
                        onValueChange={([v]) => updateElement('clock', { size: v })}
                        min={24}
                        max={120}
                        step={2}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Posición X: {config.clock.posX}%</Label>
                        <Slider
                          value={[config.clock.posX]}
                          onValueChange={([v]) => updateElement('clock', { posX: v })}
                          min={0}
                          max={100}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Posición Y: {config.clock.posY}%</Label>
                        <Slider
                          value={[config.clock.posY]}
                          onValueChange={([v]) => updateElement('clock', { posY: v })}
                          min={0}
                          max={100}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end mt-6">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SimpleOverlayConfig;
