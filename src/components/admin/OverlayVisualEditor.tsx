import { useState, useRef, useCallback } from "react";
import { Rnd } from "react-rnd";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Grid3X3, Save, Eye, EyeOff } from "lucide-react";

const FONTS = [
  { value: "Bebas Neue", label: "Bebas Neue", class: "font-bebas" },
  { value: "Archivo Black", label: "Archivo Black", class: "font-archivo" },
  { value: "Roboto Condensed", label: "Roboto Condensed", class: "font-roboto-condensed" },
  { value: "Barlow Semi Condensed", label: "Barlow Semi Condensed", class: "font-barlow" },
];

interface ElementConfig {
  visible: boolean;
  font: string;
  size: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  posX: number;
  posY: number;
  scale: number;
}

interface OverlayVisualEditorProps {
  speedConfig: ElementConfig;
  distanceConfig: ElementConfig;
  gapsConfig: ElementConfig;
  clockConfig: ElementConfig;
  checkpointConfig: ElementConfig;
  onSpeedChange: (updates: Partial<ElementConfig>) => void;
  onDistanceChange: (updates: Partial<ElementConfig>) => void;
  onGapsChange: (updates: Partial<ElementConfig>) => void;
  onClockChange: (updates: Partial<ElementConfig>) => void;
  onCheckpointChange: (updates: Partial<ElementConfig>) => void;
  onSave: () => void;
  saving?: boolean;
}

const CANVAS_WIDTH = 960; // Half of 1920 for the editor
const CANVAS_HEIGHT = 540; // Half of 1080 for the editor

const OverlayVisualEditor = ({
  speedConfig,
  distanceConfig,
  gapsConfig,
  clockConfig,
  checkpointConfig,
  onSpeedChange,
  onDistanceChange,
  onGapsChange,
  onClockChange,
  onCheckpointChange,
  onSave,
  saving = false,
}: OverlayVisualEditorProps) => {
  const [showGrid, setShowGrid] = useState(true);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getFontClass = (fontName: string) => {
    switch (fontName) {
      case "Bebas Neue": return "font-bebas";
      case "Archivo Black": return "font-archivo";
      case "Roboto Condensed": return "font-roboto-condensed";
      case "Barlow Semi Condensed": return "font-barlow";
      default: return "";
    }
  };

  const percentToPixels = (percentX: number, percentY: number) => ({
    x: (percentX / 100) * CANVAS_WIDTH,
    y: (percentY / 100) * CANVAS_HEIGHT,
  });

  const pixelsToPercent = (x: number, y: number) => ({
    posX: Math.round((x / CANVAS_WIDTH) * 100),
    posY: Math.round((y / CANVAS_HEIGHT) * 100),
  });

  const renderElement = (
    id: string,
    config: ElementConfig,
    label: string,
    sampleValue: string,
    onChange: (updates: Partial<ElementConfig>) => void
  ) => {
    if (!config.visible) return null;

    const { x, y } = percentToPixels(config.posX, config.posY);
    const baseWidth = 150 * config.scale;
    const baseHeight = 60 * config.scale;

    return (
      <Rnd
        key={id}
        position={{ x: x - baseWidth / 2, y: y - baseHeight / 2 }}
        size={{ width: baseWidth, height: baseHeight }}
        onDragStop={(e, d) => {
          const centerX = d.x + baseWidth / 2;
          const centerY = d.y + baseHeight / 2;
          const { posX, posY } = pixelsToPercent(centerX, centerY);
          onChange({ posX, posY });
        }}
        onResizeStop={(e, direction, ref, delta, position) => {
          const newWidth = parseFloat(ref.style.width);
          const newScale = newWidth / 150;
          const centerX = position.x + newWidth / 2;
          const centerY = position.y + parseFloat(ref.style.height) / 2;
          const { posX, posY } = pixelsToPercent(centerX, centerY);
          onChange({ scale: Math.round(newScale * 10) / 10, posX, posY });
        }}
        bounds="parent"
        enableResizing={{
          bottomRight: true,
          topRight: true,
          bottomLeft: true,
          topLeft: true,
        }}
        lockAspectRatio={true}
        className={`cursor-move ${selectedElement === id ? "ring-2 ring-primary ring-offset-2" : ""}`}
        onClick={() => setSelectedElement(id)}
      >
        <Popover>
          <PopoverTrigger asChild>
            <div
              className={`w-full h-full flex items-center justify-center rounded-lg ${getFontClass(config.font)}`}
              style={{
                backgroundColor: `${config.bgColor}${Math.round(config.bgOpacity * 255).toString(16).padStart(2, '0')}`,
                color: config.color,
                fontSize: `${config.size * config.scale * 0.4}px`,
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {sampleValue}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">{label}</h4>
              
              {/* Font */}
              <div className="space-y-1.5">
                <Label className="text-xs">Fuente</Label>
                <Select value={config.font} onValueChange={(v) => onChange({ font: v })}>
                  <SelectTrigger className="h-8">
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

              {/* Colors */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Color texto</Label>
                  <Input
                    type="color"
                    value={config.color}
                    onChange={(e) => onChange({ color: e.target.value })}
                    className="w-full h-8 p-1 cursor-pointer"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color fondo</Label>
                  <Input
                    type="color"
                    value={config.bgColor}
                    onChange={(e) => onChange({ bgColor: e.target.value })}
                    className="w-full h-8 p-1 cursor-pointer"
                  />
                </div>
              </div>

              {/* Visibility */}
              <div className="flex items-center justify-between">
                <Label className="text-xs">Visible</Label>
                <Switch
                  checked={config.visible}
                  onCheckedChange={(v) => onChange({ visible: v })}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </Rnd>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant={showGrid ? "default" : "outline"}
            size="sm"
            onClick={() => setShowGrid(!showGrid)}
          >
            <Grid3X3 className="h-4 w-4 mr-1" />
            Cuadrícula
          </Button>
          
          <div className="flex items-center gap-2 ml-4">
            {[
              { id: "speed", config: speedConfig, onChange: onSpeedChange, label: "Velocidad" },
              { id: "distance", config: distanceConfig, onChange: onDistanceChange, label: "A Meta" },
              { id: "checkpoint", config: checkpointConfig, onChange: onCheckpointChange, label: "Checkpoint" },
              { id: "gaps", config: gapsConfig, onChange: onGapsChange, label: "Gaps" },
              { id: "clock", config: clockConfig, onChange: onClockChange, label: "Reloj" },
            ].map(({ id, config, onChange, label }) => (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                onClick={() => onChange({ visible: !config.visible })}
                className={config.visible ? "" : "opacity-50"}
              >
                {config.visible ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {label}
              </Button>
            ))}
          </div>
        </div>

        <Button onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Guardando..." : "Guardar Diseño"}
        </Button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative mx-auto rounded-lg overflow-hidden border-2 border-border"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          background: showGrid
            ? `
                linear-gradient(to right, hsl(var(--muted)) 1px, transparent 1px),
                linear-gradient(to bottom, hsl(var(--muted)) 1px, transparent 1px),
                hsl(var(--background))
              `
            : "hsl(var(--muted)/0.3)",
          backgroundSize: showGrid ? "48px 48px, 48px 48px" : undefined,
        }}
      >
        {/* Center guides */}
        {showGrid && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-primary/30"
              style={{ left: CANVAS_WIDTH / 2 }}
            />
            <div
              className="absolute left-0 right-0 h-px bg-primary/30"
              style={{ top: CANVAS_HEIGHT / 2 }}
            />
          </>
        )}

        {/* Safe area indicator */}
        <div
          className="absolute border border-dashed border-yellow-500/30 pointer-events-none"
          style={{
            left: CANVAS_WIDTH * 0.05,
            top: CANVAS_HEIGHT * 0.05,
            right: CANVAS_WIDTH * 0.05,
            bottom: CANVAS_HEIGHT * 0.05,
            width: CANVAS_WIDTH * 0.9,
            height: CANVAS_HEIGHT * 0.9,
          }}
        />

        {/* Draggable elements */}
        {renderElement("speed", speedConfig, "Velocidad", "45 km/h", onSpeedChange)}
        {renderElement("distance", distanceConfig, "Distancia a Meta", "32.5 km", onDistanceChange)}
        {renderElement("checkpoint", checkpointConfig, "Próximo Control", "→ KM 15", onCheckpointChange)}
        {renderElement("gaps", gapsConfig, "Gaps", "+0:15", onGapsChange)}
        {renderElement("clock", clockConfig, "Reloj", "01:23:45", onClockChange)}
      </div>

      {/* Coordinates display */}
      <div className="flex gap-4 text-xs text-muted-foreground justify-center flex-wrap">
        <span>Velocidad: {speedConfig.posX}%, {speedConfig.posY}%</span>
        <span>A Meta: {distanceConfig.posX}%, {distanceConfig.posY}%</span>
        <span>Checkpoint: {checkpointConfig.posX}%, {checkpointConfig.posY}%</span>
        <span>Gaps: {gapsConfig.posX}%, {gapsConfig.posY}%</span>
        <span>Reloj: {clockConfig.posX}%, {clockConfig.posY}%</span>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Arrastra los elementos para posicionarlos. Usa las esquinas para redimensionar. Doble clic para editar estilos.
      </p>
    </div>
  );
};

export default OverlayVisualEditor;