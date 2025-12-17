import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  FastForward,
  Clock,
  Gauge,
  Mountain
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TrackPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  altitude: number | null;
}

interface TrackPlaybackControlsProps {
  trackPoints: TrackPoint[];
  onPositionChange: (index: number, point: TrackPoint) => void;
  runnerName: string;
  bibNumber: number | null;
}

export function TrackPlaybackControls({
  trackPoints,
  onPositionChange,
  runnerName,
  bibNumber,
}: TrackPlaybackControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPoint = trackPoints[currentIndex];
  const totalPoints = trackPoints.length;

  // Calculate actual time interval between points (average ~30 seconds)
  const baseInterval = 500; // Base animation interval in ms

  const startPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= totalPoints) {
          setIsPlaying(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          return prev;
        }
        return next;
      });
    }, baseInterval / playbackSpeed);
  }, [playbackSpeed, totalPoints]);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startPlayback();
    } else {
      stopPlayback();
    }
    return () => stopPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  useEffect(() => {
    if (currentPoint) {
      onPositionChange(currentIndex, currentPoint);
    }
  }, [currentIndex, currentPoint, onPositionChange]);

  // Reset when track changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [trackPoints]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSliderChange = (value: number[]) => {
    setCurrentIndex(value[0]);
  };

  const handleSkipBack = () => {
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  const handleSkipForward = () => {
    setCurrentIndex(totalPoints - 1);
    setIsPlaying(false);
  };

  const handleSpeedChange = (speed: string) => {
    setPlaybackSpeed(parseFloat(speed));
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatSpeed = (speed: number | null) => {
    if (speed === null) return '--';
    // Convert m/s to km/h
    const kmh = speed * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  };

  const formatAltitude = (altitude: number | null) => {
    if (altitude === null) return '--';
    return `${Math.round(altitude)} m`;
  };

  const progress = totalPoints > 1 ? (currentIndex / (totalPoints - 1)) * 100 : 0;

  if (totalPoints === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-800">
            {runnerName} {bibNumber && `#${bibNumber}`}
          </h4>
          <p className="text-xs text-gray-500">Modo reproducción</p>
        </div>
        <div className="flex items-center gap-2">
          <FastForward className="h-4 w-4 text-gray-500" />
          <Select value={playbackSpeed.toString()} onValueChange={handleSpeedChange}>
            <SelectTrigger className="w-20 h-8 text-sm bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="4">4x</SelectItem>
              <SelectItem value="8">8x</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Current Point Info */}
      {currentPoint && (
        <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-2">
          <div className="flex items-center gap-1.5 text-gray-700">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">{formatTime(currentPoint.timestamp)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-700">
            <Gauge className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">{formatSpeed(currentPoint.speed)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-700">
            <Mountain className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium">{formatAltitude(currentPoint.altitude)}</span>
          </div>
        </div>
      )}

      {/* Progress Slider */}
      <div className="space-y-1">
        <Slider
          value={[currentIndex]}
          max={totalPoints - 1}
          step={1}
          onValueChange={handleSliderChange}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Punto {currentIndex + 1} de {totalPoints}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handleSkipBack}
          className="h-9 w-9 bg-white text-gray-700 hover:bg-gray-100"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="default"
          size="icon"
          onClick={handlePlayPause}
          className="h-11 w-11 rounded-full"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSkipForward}
          className="h-9 w-9 bg-white text-gray-700 hover:bg-gray-100"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Time Range */}
      {trackPoints.length > 1 && (
        <div className="flex justify-between text-xs text-gray-500 pt-1 border-t">
          <span>Inicio: {formatTime(trackPoints[0].timestamp)}</span>
          <span>Fin: {formatTime(trackPoints[totalPoints - 1].timestamp)}</span>
        </div>
      )}
    </div>
  );
}
