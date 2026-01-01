import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, ExternalLink } from "lucide-react";

interface YouTubeVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  startSeconds: number;
  runnerName?: string;
  checkpointName?: string;
  formattedTime?: string;
  errorText?: string;
}

export function YouTubeVideoModal({
  isOpen,
  onClose,
  videoId,
  startSeconds,
  runnerName,
  checkpointName,
  formattedTime,
  errorText = "Video no disponible"
}: YouTubeVideoModalProps) {
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${Math.max(0, Math.floor(startSeconds))}`;
  const youtubeUrl = `https://youtu.be/${videoId}?t=${Math.max(0, Math.floor(startSeconds))}`;

  const formatDisplayTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!videoId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Video no disponible</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">{errorText}</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg">
                {runnerName && checkpointName 
                  ? `${runnerName} - ${checkpointName}`
                  : "Video de la carrera"
                }
              </DialogTitle>
              {formattedTime && (
                <p className="text-sm text-muted-foreground mt-1">
                  Aparece en el minuto {formatDisplayTime(startSeconds)} del video
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(youtubeUrl, '_blank')}
                className="gap-1"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir en YouTube
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="relative w-full aspect-video bg-black">
          <iframe
            src={embedUrl}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
