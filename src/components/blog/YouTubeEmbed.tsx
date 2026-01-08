import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Clock } from "lucide-react";

interface YouTubeEmbedProps {
  videoId: string;
  timestamps?: { time: string; label: string }[] | null;
}

export default function YouTubeEmbed({ videoId, timestamps }: YouTubeEmbedProps) {
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  // Convertir timestamp string (ej: "2:30" o "1:15:30") a segundos
  const parseTimestamp = (time: string): number => {
    const parts = time.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  const handleTimestampClick = (time: string) => {
    const seconds = parseTimestamp(time);
    setCurrentTime(seconds);
  };

  // URL del video con parámetros
  const videoUrl = currentTime !== null
    ? `https://www.youtube.com/embed/${videoId}?start=${currentTime}&autoplay=1`
    : `https://www.youtube.com/embed/${videoId}`;

  return (
    <div className="space-y-4">
      {/* Video container - 16:9 aspect ratio */}
      <div className="relative w-full pb-[56.25%] bg-black rounded-lg overflow-hidden">
        <iframe
          key={currentTime} // Force reload when timestamp changes
          className="absolute inset-0 w-full h-full"
          src={videoUrl}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* Timestamps/Chapters */}
      {timestamps && timestamps.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Capítulos del video
          </h4>
          <div className="space-y-2">
            {timestamps.map((ts, index) => (
              <button
                key={index}
                onClick={() => handleTimestampClick(ts.time)}
                className="flex items-center gap-3 w-full text-left hover:bg-muted rounded-md p-2 -mx-2 transition-colors"
              >
                <span className="font-mono text-sm text-primary bg-primary/10 px-2 py-1 rounded">
                  {ts.time}
                </span>
                <span className="text-sm">{ts.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
