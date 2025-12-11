import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type QualityLevel = "high" | "medium" | "low";

const QUALITY_OPTIONS: Record<QualityLevel, { value: number; label: string; description: string }> = {
  high: { value: 1.0, label: "Alta", description: "Máxima calidad, archivo más grande" },
  medium: { value: 0.85, label: "Media", description: "Buen balance calidad/tamaño" },
  low: { value: 0.6, label: "Baja", description: "Archivo pequeño, menor calidad" },
};

interface ImageCropperProps {
  open: boolean;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob, filename: string) => void;
  imageFile: File | null;
  imageType: "race" | "distance" | "logo" | "cover" | "poster";
}

const ASPECT_RATIOS = {
  race: { ratio: 16 / 9, label: "Carrera (16:9)" },
  distance: { ratio: 5 / 3, label: "Recorrido (5:3)" },
  logo: { ratio: 1, label: "Logo (1:1)" },
  cover: { ratio: 2.4, label: "Portada (2.4:1)" },
  poster: { ratio: 2 / 3, label: "Cartel (2:3)" },
};

export function ImageCropper({ open, onClose, onCropComplete, imageFile, imageType }: ImageCropperProps) {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [processing, setProcessing] = useState(false);
  const [quality, setQuality] = useState<QualityLevel>("high");
  const imgRef = useRef<HTMLImageElement>(null);

  const aspectRatio = ASPECT_RATIOS[imageType].ratio;

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    
    // Inicializar el crop centrado
    const cropWidth = width * 0.8;
    const cropHeight = cropWidth / aspectRatio;
    
    setCrop({
      unit: "%",
      width: 80,
      height: (cropHeight / height) * 100,
      x: 10,
      y: ((height - cropHeight) / 2 / height) * 100,
    });
  }, [aspectRatio]);

  const handleFileChange = useCallback(() => {
    if (!imageFile) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageSrc(reader.result?.toString() || "");
    });
    reader.readAsDataURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    if (imageFile && open) {
      handleFileChange();
    }
  }, [imageFile, open, handleFileChange]);

  const getCroppedImg = useCallback(async () => {
    if (!completedCrop || !imgRef.current || !imageFile) return;

    setProcessing(true);
    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { 
      alpha: true,
      willReadFrequently: false 
    });

    if (!ctx) {
      setProcessing(false);
      return;
    }

    // Usar devicePixelRatio para mejor calidad en pantallas de alta densidad
    const pixelRatio = window.devicePixelRatio || 1;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // Calcular dimensiones finales usando la resolución natural
    const cropWidth = Math.round(completedCrop.width * scaleX);
    const cropHeight = Math.round(completedCrop.height * scaleY);

    // Establecer el tamaño del canvas a la resolución final deseada
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Configurar el contexto para máxima calidad
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Dibujar la imagen recortada
    ctx.drawImage(
      image,
      Math.round(completedCrop.x * scaleX),
      Math.round(completedCrop.y * scaleY),
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    // Determinar el formato de salida basado en el archivo original
    const originalExtension = imageFile.name.split(".").pop()?.toLowerCase();
    const isPng = originalExtension === "png";
    const mimeType = isPng ? "image/png" : "image/jpeg";
    const qualityValue = isPng ? undefined : QUALITY_OPTIONS[quality].value;

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          setProcessing(false);
          resolve(blob);
        },
        mimeType,
        qualityValue
      );
    });
  }, [completedCrop, imageFile, quality]);

  const handleSave = async () => {
    const croppedBlob = await getCroppedImg();
    if (croppedBlob && imageFile) {
      const extension = imageFile.name.split(".").pop();
      const filename = imageFile.name.replace(`.${extension}`, `_cropped.${extension}`);
      onCropComplete(croppedBlob, filename);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recortar Imagen - {ASPECT_RATIOS[imageType].label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-center items-center bg-muted rounded-lg p-4">
            {imageSrc && (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspectRatio}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Imagen a recortar"
                  onLoad={onImageLoad}
                  className="max-h-[60vh] object-contain"
                />
              </ReactCrop>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="quality-select">Calidad JPEG:</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Solo aplica a imágenes JPEG. Los PNG mantienen calidad sin pérdida.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select value={quality} onValueChange={(value: QualityLevel) => setQuality(value)}>
              <SelectTrigger id="quality-select" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(QUALITY_OPTIONS).map(([key, option]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Arrastra los bordes del área seleccionada para ajustar el recorte.</p>
            <p>La proporción se mantiene automáticamente en {ASPECT_RATIOS[imageType].label}.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processing}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!completedCrop || processing}>
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Recorte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
