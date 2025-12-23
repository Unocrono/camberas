import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Play, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideToStartProps {
  onStart: (timestamp: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

const SLIDE_THRESHOLD = 0.85; // 85% del recorrido
const TRACK_WIDTH = 280;
const HANDLE_SIZE = 56;

export function SlideToStart({ 
  onStart, 
  disabled = false, 
  label = "Desliza para dar salida",
  className 
}: SlideToStartProps) {
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const capturedTimestamp = useRef<number | null>(null);
  const x = useMotionValue(0);
  
  const maxSlide = TRACK_WIDTH - HANDLE_SIZE - 8;
  const progress = useTransform(x, [0, maxSlide], [0, 1]);
  const backgroundColor = useTransform(
    progress,
    [0, 0.5, 1],
    ['hsl(var(--muted))', 'hsl(150 45% 35%)', 'hsl(150 45% 25%)']
  );
  const handleScale = useTransform(progress, [0, 0.5, 1], [1, 1.05, 1.1]);

  // Reset después de completar
  useEffect(() => {
    if (isCompleted) {
      const timer = setTimeout(() => {
        setIsCompleted(false);
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, x]);

  const handleDragStart = useCallback(() => {
    if (disabled || isCompleted) return;
    
    // ⚡ CAPTURAR TIMESTAMP EN EL MOMENTO DEL TOQUE
    // Esto es crítico para precisión: capturamos cuando el dedo toca, no cuando suelta
    capturedTimestamp.current = Date.now();
    setIsDragging(true);
    
    // Vibración inicial
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, [disabled, isCompleted]);

  const handleDrag = useCallback(() => {
    const currentProgress = progress.get();
    
    // Vibración de progreso
    if (currentProgress > 0.5 && currentProgress < 0.55) {
      if ('vibrate' in navigator) {
        navigator.vibrate(5);
      }
    }
  }, [progress]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    
    if (disabled || isCompleted) return;
    
    const currentProgress = progress.get();
    
    if (currentProgress >= SLIDE_THRESHOLD && capturedTimestamp.current) {
      // ✅ CONFIRMADO - Usar el timestamp capturado al inicio del toque
      setIsCompleted(true);
      
      // Vibración de confirmación
      if ('vibrate' in navigator) {
        navigator.vibrate([50, 30, 100]);
      }
      
      // Animar al final
      animate(x, maxSlide, { type: 'spring', stiffness: 500, damping: 30 });
      
      // Llamar callback con el timestamp preciso
      onStart(capturedTimestamp.current);
      capturedTimestamp.current = null;
    } else {
      // Cancelado - volver al inicio
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
      capturedTimestamp.current = null;
    }
  }, [disabled, isCompleted, maxSlide, onStart, progress, x]);

  return (
    <div className={cn("relative", className)}>
      {/* Track */}
      <motion.div
        className={cn(
          "relative h-16 rounded-full overflow-hidden transition-opacity",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        style={{ 
          width: TRACK_WIDTH,
          backgroundColor 
        }}
      >
        {/* Texto guía */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.span 
            className="text-primary-foreground/80 font-medium text-sm select-none"
            style={{ opacity: useTransform(progress, [0, 0.3], [1, 0]) }}
          >
            {isCompleted ? '¡Salida dada!' : label}
          </motion.span>
        </div>

        {/* Flechas animadas */}
        <div className="absolute inset-y-0 left-16 right-16 flex items-center justify-center gap-1 pointer-events-none">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.3, x: -5 }}
              animate={{ 
                opacity: [0.3, 0.7, 0.3], 
                x: [-5, 5, -5] 
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut"
              }}
              style={{ opacity: useTransform(progress, [0, 0.2], [1, 0]) }}
            >
              <ChevronRight className="h-5 w-5 text-primary-foreground/40" />
            </motion.div>
          ))}
        </div>

        {/* Handle deslizable */}
        <motion.div
          className={cn(
            "absolute top-1 left-1 flex items-center justify-center rounded-full cursor-grab active:cursor-grabbing touch-none",
            "bg-card shadow-lg border-2 border-primary/20",
            isCompleted && "bg-green-500 border-green-400"
          )}
          style={{ 
            width: HANDLE_SIZE, 
            height: HANDLE_SIZE,
            x,
            scale: handleScale
          }}
          drag={!disabled && !isCompleted ? "x" : false}
          dragConstraints={{ left: 0, right: maxSlide }}
          dragElastic={0}
          dragMomentum={false}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          whileTap={{ scale: disabled ? 1 : 1.05 }}
        >
          {isCompleted ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              <Check className="h-6 w-6 text-white" />
            </motion.div>
          ) : (
            <Play className="h-6 w-6 text-primary fill-primary" />
          )}
        </motion.div>
      </motion.div>

      {/* Estado de arrastre */}
      {isDragging && (
        <motion.div
          className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card px-3 py-1 rounded-full shadow-md text-xs font-mono"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {capturedTimestamp.current 
            ? (() => {
                const d = new Date(capturedTimestamp.current);
                return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0').slice(0,2)}`;
              })()
            : '--:--:--'
          }
        </motion.div>
      )}
    </div>
  );
}
