import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  FastForward,
  Clock,
  Repeat,
  Users,
} from 'lucide-react';
import { formatLocalTime } from '@/lib/timezoneUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GroupPlaybackControlsProps {
  /** Inicio del reloj maestro (ms epoch): primer punto de todos los tracks */
  t0: number;
  /** Fin del reloj maestro (ms epoch): último punto de todos los tracks */
  t1: number;
  participantes: number;
  onTimeChange: (timeMs: number) => void;
}

/**
 * Reproductor de grupo: un único reloj maestro mueve a todos los
 * participantes a la vez, cada uno donde estaba en ese instante —
 * como las repeticiones de una etapa. Generaliza TrackPlaybackControls.
 */
export function GroupPlaybackControls({
  t0,
  t1,
  participantes,
  onTimeChange,
}: GroupPlaybackControlsProps) {
  const [timeMs, setTimeMs] = useState(t0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(30);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  // Reiniciar el reloj si cambia el rango (nueva carga de tracks)
  useEffect(() => {
    setTimeMs(t0);
  }, [t0, t1]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setTimeMs(prev => {
        const next = prev + 100 * speed;
        if (next >= t1) {
          if (loopRef.current) return t0;
          setIsPlaying(false);
          return t1;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [isPlaying, speed, t0, t1]);

  useEffect(() => {
    onTimeChange(timeMs);
  }, [timeMs, onTimeChange]);

  const progress = t1 > t0 ? ((timeMs - t0) / (t1 - t0)) * 100 : 0;
  const durationMin = Math.round((t1 - t0) / 60000);

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 space-y-3">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-800 flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Repetición del grupo
          </h4>
          <p className="text-xs text-gray-500">
            {participantes} participantes · {durationMin} min de salida
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FastForward className="h-4 w-4 text-gray-500" />
          <Select value={speed.toString()} onValueChange={v => setSpeed(parseInt(v))}>
            <SelectTrigger className="w-20 h-8 text-sm bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="5">x5</SelectItem>
              <SelectItem value="10">x10</SelectItem>
              <SelectItem value="30">x30</SelectItem>
              <SelectItem value="60">x60</SelectItem>
              <SelectItem value="120">x120</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Reloj de la salida */}
      <div className="flex items-center justify-center gap-2 bg-gray-50 rounded-lg p-2">
        <Clock className="h-4 w-4 text-blue-500" />
        <span className="text-lg font-bold tabular-nums text-gray-800">
          {formatLocalTime(new Date(timeMs).toISOString())}
        </span>
      </div>

      {/* Barra de tiempo */}
      <div className="space-y-1">
        <Slider
          value={[timeMs]}
          min={t0}
          max={t1}
          step={1000}
          onValueChange={value => setTimeMs(value[0])}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>{formatLocalTime(new Date(t0).toISOString())}</span>
          <span>{Math.round(progress)}%</span>
          <span>{formatLocalTime(new Date(t1).toISOString())}</span>
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setTimeMs(t0);
            setIsPlaying(false);
          }}
          className="h-9 w-9 bg-white text-gray-700 hover:bg-gray-100"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="default"
          size="icon"
          onClick={() => setIsPlaying(!isPlaying)}
          className="h-11 w-11 rounded-full"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setTimeMs(t1);
            setIsPlaying(false);
          }}
          className="h-9 w-9 bg-white text-gray-700 hover:bg-gray-100"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button
          variant={loop ? 'default' : 'outline'}
          size="icon"
          onClick={() => setLoop(!loop)}
          className={`h-9 w-9 ${loop ? '' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          title="Repetir en bucle"
        >
          <Repeat className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-[11px] text-gray-400 text-center pt-1 border-t">
        Toca un corredor en la lista para ocultarlo o mostrarlo en la repetición
      </p>
    </div>
  );
}
