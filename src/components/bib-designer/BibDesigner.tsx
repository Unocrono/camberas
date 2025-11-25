import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, Rect, IText, FabricImage } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Type, 
  Image, 
  Square, 
  Download, 
  Save, 
  Trash2, 
  Copy,
  Palette,
  ZoomIn,
  ZoomOut,
  Undo,
  Redo
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";

interface BibDesignerProps {
  raceId: string;
  raceName: string;
  designId?: string;
  onSave?: (designId: string) => void;
}

// Canvas dimensions in pixels (20x15cm at 96 DPI ≈ 756x567px, scaled for display)
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 450;
const WIDTH_CM = 20;
const HEIGHT_CM = 15;

export const BibDesigner = ({ raceId, raceName, designId, onSave }: BibDesignerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [designName, setDesignName] = useState("Diseño sin nombre");
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: backgroundColor,
      selection: true,
    });

    setFabricCanvas(canvas);

    // Save initial state
    setTimeout(() => {
      saveToHistory(canvas);
    }, 100);

    return () => {
      canvas.dispose();
    };
  }, []);

  // Load existing design
  useEffect(() => {
    if (!fabricCanvas || !designId) return;

    const loadDesign = async () => {
      const { data, error } = await supabase
        .from("bib_designs")
        .select("*")
        .eq("id", designId)
        .single();

      if (error) {
        console.error("Error loading design:", error);
        return;
      }

      if (data) {
        setDesignName(data.name);
        setBackgroundColor(data.background_color || "#FFFFFF");
        
        if (data.canvas_json && Object.keys(data.canvas_json).length > 0) {
          fabricCanvas.loadFromJSON(data.canvas_json as object).then(() => {
            fabricCanvas.renderAll();
          });
        }
      }
    };

    loadDesign();
  }, [fabricCanvas, designId]);

  // Update background color
  useEffect(() => {
    if (fabricCanvas) {
      fabricCanvas.backgroundColor = backgroundColor;
      fabricCanvas.renderAll();
    }
  }, [backgroundColor, fabricCanvas]);

  const saveToHistory = useCallback((canvas: FabricCanvas) => {
    const json = JSON.stringify(canvas.toJSON());
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, json];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (!fabricCanvas || historyIndex <= 0) return;
    
    const newIndex = historyIndex - 1;
    fabricCanvas.loadFromJSON(JSON.parse(history[newIndex])).then(() => {
      fabricCanvas.renderAll();
      setHistoryIndex(newIndex);
    });
  }, [fabricCanvas, history, historyIndex]);

  const redo = useCallback(() => {
    if (!fabricCanvas || historyIndex >= history.length - 1) return;
    
    const newIndex = historyIndex + 1;
    fabricCanvas.loadFromJSON(JSON.parse(history[newIndex])).then(() => {
      fabricCanvas.renderAll();
      setHistoryIndex(newIndex);
    });
  }, [fabricCanvas, history, historyIndex]);

  const addText = (text: string, fontSize: number, options?: { fontWeight?: string }) => {
    if (!fabricCanvas) return;

    const textObj = new IText(text, {
      left: CANVAS_WIDTH / 2,
      top: CANVAS_HEIGHT / 2,
      fontSize,
      fill: selectedColor,
      fontFamily: "Arial",
      fontWeight: options?.fontWeight || "normal",
      originX: "center",
      originY: "center",
    });

    fabricCanvas.add(textObj);
    fabricCanvas.setActiveObject(textObj);
    fabricCanvas.renderAll();
    saveToHistory(fabricCanvas);
  };

  const addBibNumber = () => {
    addText("001", 120, { fontWeight: "bold" });
  };

  const addParticipantName = () => {
    addText("NOMBRE", 32, { fontWeight: "bold" });
  };

  const addRaceTitle = () => {
    addText(raceName.toUpperCase(), 28, { fontWeight: "bold" });
  };

  const addCustomText = () => {
    addText("Texto", 24);
  };

  const addRectangle = () => {
    if (!fabricCanvas) return;

    const rect = new Rect({
      left: CANVAS_WIDTH / 2,
      top: CANVAS_HEIGHT / 2,
      width: 200,
      height: 80,
      fill: selectedColor,
      originX: "center",
      originY: "center",
    });

    fabricCanvas.add(rect);
    fabricCanvas.setActiveObject(rect);
    fabricCanvas.renderAll();
    saveToHistory(fabricCanvas);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!fabricCanvas || !e.target.files?.[0]) return;

    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      
      FabricImage.fromURL(dataUrl).then((img) => {
        // Scale image to fit nicely
        const maxWidth = 150;
        const maxHeight = 100;
        const scale = Math.min(maxWidth / (img.width || 150), maxHeight / (img.height || 100));
        
        img.scale(scale);
        img.set({
          left: CANVAS_WIDTH / 2,
          top: CANVAS_HEIGHT / 2,
          originX: "center",
          originY: "center",
        });

        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
        fabricCanvas.renderAll();
        saveToHistory(fabricCanvas);
      });
    };

    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const deleteSelected = () => {
    if (!fabricCanvas) return;
    
    const activeObjects = fabricCanvas.getActiveObjects();
    if (activeObjects.length > 0) {
      activeObjects.forEach((obj) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.renderAll();
      saveToHistory(fabricCanvas);
    }
  };

  const duplicateSelected = () => {
    if (!fabricCanvas) return;
    
    const activeObject = fabricCanvas.getActiveObject();
    if (!activeObject) return;

    activeObject.clone().then((cloned: any) => {
      cloned.set({
        left: (activeObject.left || 0) + 20,
        top: (activeObject.top || 0) + 20,
      });
      fabricCanvas.add(cloned);
      fabricCanvas.setActiveObject(cloned);
      fabricCanvas.renderAll();
      saveToHistory(fabricCanvas);
    });
  };

  const changeSelectedColor = (color: string) => {
    if (!fabricCanvas) return;
    
    const activeObject = fabricCanvas.getActiveObject();
    if (activeObject) {
      if (activeObject.type === "i-text") {
        activeObject.set("fill", color);
      } else {
        activeObject.set("fill", color);
      }
      fabricCanvas.renderAll();
      saveToHistory(fabricCanvas);
    }
    setSelectedColor(color);
  };

  const saveDesign = async () => {
    if (!fabricCanvas) return;
    
    setIsSaving(true);
    try {
      const canvasJson = fabricCanvas.toJSON();
      
      const designData = {
        race_id: raceId,
        name: designName,
        canvas_json: canvasJson,
        width_cm: WIDTH_CM,
        height_cm: HEIGHT_CM,
        background_color: backgroundColor,
      };

      let result;
      if (designId) {
        result = await supabase
          .from("bib_designs")
          .update(designData)
          .eq("id", designId)
          .select()
          .single();
      } else {
        result = await supabase
          .from("bib_designs")
          .insert(designData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      toast.success("Diseño guardado correctamente");
      onSave?.(result.data.id);
    } catch (error) {
      console.error("Error saving design:", error);
      toast.error("Error al guardar el diseño");
    } finally {
      setIsSaving(false);
    }
  };

  const exportAsPNG = () => {
    if (!fabricCanvas) return;
    
    const dataUrl = fabricCanvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2, // Higher resolution
    });
    
    const link = document.createElement("a");
    link.download = `${designName.replace(/\s+/g, "_")}.png`;
    link.href = dataUrl;
    link.click();
    
    toast.success("Imagen PNG exportada");
  };

  const exportAsPDF = () => {
    if (!fabricCanvas) return;
    
    const dataUrl = fabricCanvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2,
    });
    
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "cm",
      format: [WIDTH_CM, HEIGHT_CM],
    });
    
    pdf.addImage(dataUrl, "PNG", 0, 0, WIDTH_CM, HEIGHT_CM);
    pdf.save(`${designName.replace(/\s+/g, "_")}.pdf`);
    
    toast.success("PDF exportado");
  };

  const presetColors = [
    "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF",
    "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080",
    "#008000", "#000080", "#800000", "#808080", "#C0C0C0"
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Toolbar Panel */}
      <Card className="lg:w-80 shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Herramientas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Design Name */}
          <div className="space-y-2">
            <Label htmlFor="designName">Nombre del diseño</Label>
            <Input
              id="designName"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder="Nombre del diseño"
            />
          </div>

          <Tabs defaultValue="elements" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="elements">Elementos</TabsTrigger>
              <TabsTrigger value="colors">Colores</TabsTrigger>
              <TabsTrigger value="export">Exportar</TabsTrigger>
            </TabsList>

            <TabsContent value="elements" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Texto</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addBibNumber}
                    className="justify-start"
                  >
                    <Type className="h-4 w-4 mr-2" />
                    Número
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addParticipantName}
                    className="justify-start"
                  >
                    <Type className="h-4 w-4 mr-2" />
                    Nombre
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addRaceTitle}
                    className="justify-start"
                  >
                    <Type className="h-4 w-4 mr-2" />
                    Título
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addCustomText}
                    className="justify-start"
                  >
                    <Type className="h-4 w-4 mr-2" />
                    Texto
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Formas</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={addRectangle}
                  className="w-full justify-start"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Rectángulo
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Imágenes</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    asChild
                    className="w-full justify-start cursor-pointer"
                  >
                    <label htmlFor="image-upload">
                      <Image className="h-4 w-4 mr-2" />
                      Subir logo/imagen
                    </label>
                  </Button>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-medium">Acciones</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={duplicateSelected}
                    className="justify-start"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={deleteSelected}
                    className="justify-start"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="colors" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Color de fondo</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Color del elemento</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => changeSelectedColor(e.target.value)}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={selectedColor}
                    onChange={(e) => changeSelectedColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Colores predefinidos</Label>
                <div className="grid grid-cols-5 gap-1">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      className="w-8 h-8 rounded border border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => changeSelectedColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="export" className="space-y-3 pt-3">
              <Button 
                onClick={saveDesign} 
                className="w-full"
                disabled={isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Guardando..." : "Guardar diseño"}
              </Button>

              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-medium">Descargar</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={exportAsPNG}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PNG
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={exportAsPDF}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* History Controls */}
          <div className="flex gap-2 pt-2 border-t">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={undo}
              disabled={historyIndex <= 0}
              className="flex-1"
            >
              <Undo className="h-4 w-4 mr-1" />
              Deshacer
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="flex-1"
            >
              <Redo className="h-4 w-4 mr-1" />
              Rehacer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Canvas Area */}
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Vista previa del dorsal ({WIDTH_CM}x{HEIGHT_CM}cm)</span>
            <span className="text-sm font-normal text-muted-foreground">
              Haz doble clic en el texto para editarlo
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <div 
              className="border-2 border-dashed border-border rounded-lg p-2 inline-block"
              style={{ backgroundColor: "#f0f0f0" }}
            >
              <canvas 
                ref={canvasRef} 
                className="rounded shadow-lg"
                style={{ display: "block" }}
              />
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Arrastra y redimensiona los elementos. Usa Delete para eliminar el elemento seleccionado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
