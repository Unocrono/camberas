import { motion } from 'framer-motion';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SyncStatusBadgeProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAttempt: Date | null;
  onForceSync: () => void;
  className?: string;
}

export function SyncStatusBadge({
  isOnline,
  pendingCount,
  isSyncing,
  lastSyncAttempt,
  onForceSync,
  className
}: SyncStatusBadgeProps) {
  const getStatusColor = () => {
    if (!isOnline) return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200';
    if (pendingCount > 0) return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200';
    return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200';
  };

  const getStatusIcon = () => {
    if (isSyncing) {
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <RefreshCw className="h-4 w-4" />
        </motion.div>
      );
    }
    if (!isOnline) return <CloudOff className="h-4 w-4" />;
    if (pendingCount > 0) return <AlertTriangle className="h-4 w-4" />;
    return <Cloud className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (isSyncing) return 'Sincronizando...';
    if (!isOnline) return 'Sin conexión';
    if (pendingCount > 0) return `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}`;
    return 'Sincronizado';
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Badge 
        variant="outline"
        className={cn(
          "flex items-center gap-1.5 py-1 px-2.5 text-sm font-medium",
          getStatusColor()
        )}
      >
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </Badge>

      {/* Botón de sincronización manual */}
      {pendingCount > 0 && isOnline && !isSyncing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onForceSync}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Forzar sincronización</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Última sincronización */}
      {lastSyncAttempt && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Último intento: {lastSyncAttempt.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      )}
    </div>
  );
}
