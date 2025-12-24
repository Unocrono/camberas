import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HoldToStartProps {
  onStart: (timestamp: number) => void;
  disabled?: boolean;
  className?: string;
}

const HOLD_DURATION = 2000; // 2 segundos

export function HoldToStart({ 
  onStart, 
  disabled = false, 
  className 
}: HoldToStartProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [progress, setProgress] = useState(0);
  const capturedTimestamp = useRef<number | null>(null);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  // Limpiar timers
  const clearTimers = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  }, []);

  // Sonido al tocar (inicio)
  const playTouchSound = useCallback(() => {
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContext.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(440, ctx.currentTime); // La nota A4
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.log('Audio not available');
    }
  }, []);

  // Sonido doble de confirmación (al completar)
  const playDoubleConfirmSound = useCallback(() => {
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContext.current;
      
      // Primer sonido
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);
      
      // Segundo sonido (más agudo, después de 150ms)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.01, ctx.currentTime);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.27);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.27);
    } catch (e) {
      console.log('Audio not available');
    }
  }, []);

  // Reset después de completar
  useEffect(() => {
    if (isCompleted) {
      const timer = setTimeout(() => {
        setIsCompleted(false);
        setProgress(0);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCompleted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handlePressStart = useCallback(() => {
    if (disabled || isCompleted) return;
    
    // ⚡ CAPTURAR TIMESTAMP EN EL MOMENTO DEL TOQUE
    capturedTimestamp.current = Date.now();
    setIsHolding(true);
    setProgress(0);
    
    // Sonido al tocar
    playTouchSound();
    
    // Vibración inicial
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    
    // Actualizar progreso cada 50ms
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(elapsed / HOLD_DURATION, 1);
      setProgress(newProgress);
    }, 50);
    
    // Timer para completar
    holdTimer.current = setTimeout(() => {
      if (capturedTimestamp.current) {
        setIsCompleted(true);
        setIsHolding(false);
        setProgress(1);
        clearTimers();
        
        // Sonido doble y vibración de 300ms al completar
        playDoubleConfirmSound();
        if ('vibrate' in navigator) {
          navigator.vibrate(300);
        }
        
        onStart(capturedTimestamp.current);
        capturedTimestamp.current = null;
      }
    }, HOLD_DURATION);
  }, [disabled, isCompleted, clearTimers, playTouchSound, playDoubleConfirmSound, onStart]);

  const handlePressEnd = useCallback(() => {
    if (!isCompleted) {
      setIsHolding(false);
      setProgress(0);
      capturedTimestamp.current = null;
      clearTimers();
    }
  }, [isCompleted, clearTimers]);

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      {/* Timestamp mientras se mantiene pulsado */}
      {isHolding && capturedTimestamp.current && (
        <motion.div
          className="absolute -top-12 bg-card px-4 py-2 rounded-full shadow-lg text-sm font-mono border"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {(() => {
            const d = new Date(capturedTimestamp.current);
            return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0').slice(0,2)}`;
          })()}
        </motion.div>
      )}

      {/* Botón principal */}
      <motion.button
        className={cn(
          "relative w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1",
          "touch-none select-none cursor-pointer",
          "transition-colors duration-200",
          disabled && "opacity-50 cursor-not-allowed",
          isCompleted 
            ? "bg-green-500 text-white" 
            : isHolding 
              ? "bg-primary/90 text-primary-foreground" 
              : "bg-muted text-foreground border-2 border-primary/30"
        )}
        style={{
          background: !isCompleted && isHolding 
            ? `conic-gradient(hsl(var(--primary)) ${progress * 360}deg, hsl(var(--muted)) ${progress * 360}deg)` 
            : undefined
        }}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handlePressEnd}
        whileTap={{ scale: disabled ? 1 : 0.95 }}
        disabled={disabled}
      >
        {/* Círculo interior */}
        <div className={cn(
          "absolute inset-2 rounded-full flex flex-col items-center justify-center gap-1",
          isCompleted 
            ? "bg-green-500" 
            : "bg-card"
        )}>
          {isCompleted ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              <Check className="h-10 w-10 text-white" />
            </motion.div>
          ) : (
            <>
              <span className={cn(
                "text-xs font-bold uppercase tracking-wider",
                isHolding ? "text-primary" : "text-muted-foreground"
              )}>
                START
              </span>
              <Play className={cn(
                "h-10 w-10",
                isHolding ? "text-primary fill-primary" : "text-primary/70 fill-primary/70"
              )} />
            </>
          )}
        </div>
      </motion.button>

      {/* Instrucción */}
      <p className="mt-3 text-xs text-muted-foreground">
        {isCompleted ? '¡Salida dada!' : 'Mantén pulsado 2 segundos'}
      </p>
    </div>
  );
}
