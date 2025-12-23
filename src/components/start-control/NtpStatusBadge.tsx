import { motion } from 'framer-motion';
import { Clock, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface NtpStatusBadgeProps {
  offset: number;
  lastSync: Date | null;
  isCalculating: boolean;
  error: string | null;
  onRecalculate: () => void;
  className?: string;
}

export function NtpStatusBadge({
  offset,
  lastSync,
  isCalculating,
  error,
  onRecalculate,
  className
}: NtpStatusBadgeProps) {
  const absOffset = Math.abs(offset);
  const isAccurate = absOffset < 100; // Menos de 100ms de diferencia
  const isWarning = absOffset >= 100 && absOffset < 1000; // Entre 100ms y 1s
  const isCritical = absOffset >= 1000; // Más de 1 segundo

  const getStatusColor = () => {
    if (error) return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200';
    if (isCritical) return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200';
    if (isWarning) return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200';
    return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200';
  };

  const getStatusIcon = () => {
    if (isCalculating) {
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </motion.div>
      );
    }
    if (error || isCritical) return <AlertTriangle className="h-3.5 w-3.5" />;
    if (isAccurate) return <Check className="h-3.5 w-3.5" />;
    return <Clock className="h-3.5 w-3.5" />;
  };

  const formatOffset = () => {
    if (isCalculating) return 'Calculando...';
    if (error) return 'Error NTP';
    
    const sign = offset >= 0 ? '+' : '';
    if (absOffset < 1000) {
      return `${sign}${offset.toFixed(0)}ms`;
    } else {
      return `${sign}${(offset / 1000).toFixed(1)}s`;
    }
  };

  const getTooltipText = () => {
    if (error) return `Error: ${error}`;
    if (isCalculating) return 'Sincronizando hora con el servidor...';
    
    const direction = offset >= 0 ? 'adelantado' : 'atrasado';
    return `Tu dispositivo está ${direction} ${Math.abs(offset).toFixed(0)}ms respecto al servidor.\n${
      lastSync 
        ? `Última sincronización: ${lastSync.toLocaleTimeString('es-ES')}`
        : 'Sin sincronización previa'
    }`;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline"
            className={cn(
              "flex items-center gap-1.5 py-1 px-2.5 text-xs font-mono cursor-help",
              getStatusColor()
            )}
          >
            {getStatusIcon()}
            <span>NTP: {formatOffset()}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="whitespace-pre-line">{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>

      {/* Botón de recalcular */}
      {!isCalculating && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRecalculate}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Recalcular offset NTP</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
