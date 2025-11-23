import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface ImageCropperProps {
  open: boolean;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob, filename: string) => void;
  imageFile: File | null;
  imageType: "race" | "distance" | "logo" | "cover" | "poster";
}

const ASPECT_RATIOS = {
  race: { ratio: 4 / 3, label: "Carrera (4:3)" },
  distance: { ratio: 5 / 3, label: "Distancia (5:3)" },
  logo: { ratio: 1, label: "Logo (1:1)" },
  cover: { ratio: 2.4, label: "Portada (2.4:1)" },
  poster: { ratio: 2 / 3, label: "Cartel (2:3)" },
};

export function ImageCropper({ open, onClose, onCropComplete, imageFile, imageType }: ImageCropperProps) {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [processing, setProcessing] = useState(false);
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
    if (!completedCrop || !imgRef.current) return;

    setProcessing(true);
    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setProcessing(false);
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          setProcessing(false);
          resolve(blob);
        },
        "image/jpeg",
        0.95
      );
    });
  }, [completedCrop]);

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
