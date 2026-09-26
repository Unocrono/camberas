import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Route, 
  Users, 
  Maximize2, 
  ZoomIn, 
  ZoomOut, 
  Layers, 
  LocateFixed,
  Map,
  Satellite
} from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MapControlsProps {
  onCenterRoute: () => void;
  onCenterRunners: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFullscreen: () => void;
  onChangeStyle: (style: 'outdoors' | 'satellite' | 'streets' | 'light' | 'dark') => void;
  onFollowRunner: () => void;
  isFollowing?: boolean;
  hasRoute?: boolean;
  hasRunners?: boolean;
  currentStyle?: string;
  /** En una barra horizontal fuera del mapa, en vez de flotando encima */
  enBarra?: boolean;
}

const MAP_STYLES = [
  { id: 'outdoors', label: 'Exterior', icon: Map },
  { id: 'satellite', label: 'Satélite', icon: Satellite },
  { id: 'streets', label: 'Calles', icon: Map },
  { id: 'light', label: 'Claro', icon: Map },
  { id: 'dark', label: 'Oscuro', icon: Map },
] as const;

export function MapControls({
  onCenterRoute,
  onCenterRunners,
  onZoomIn,
  onZoomOut,
  onToggleFullscreen,
  onChangeStyle,
  onFollowRunner,
  isFollowing = false,
  hasRoute = false,
  hasRunners = false,
  currentStyle = 'outdoors',
  enBarra = false,
}: MapControlsProps) {
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  // En barra, los avisos y el menú se abren hacia abajo y los separadores son verticales
  const lado = enBarra ? 'bottom' : 'left';
  // (en el móvil la barra va sin separadores para que quepa en una fila)
  const separador = enBarra ? 'hidden sm:block w-px h-6 bg-border mx-1' : 'h-px bg-border my-1';

  return (
    <div
      className={
        enBarra
          ? 'flex flex-wrap items-center gap-1 sm:gap-1.5'
          : 'absolute top-4 right-14 z-10 flex flex-col gap-1'
      }
    >
      {/* Center on Route */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2 justify-start bg-white shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs"
            onClick={onCenterRoute}
            disabled={!hasRoute}
          >
            <Route className={enBarra ? "h-4 w-4 sm:mr-1" : "h-4 w-4 mr-1"} />
            {/* En la barra del móvil, solo el icono: así cabe todo en una fila */}
            <span className={enBarra ? "sr-only sm:not-sr-only" : undefined}>Recorrido</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side={lado}>
          <p>Centrar en el recorrido</p>
        </TooltipContent>
      </Tooltip>

      {/* Center on Runners */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2 justify-start bg-white shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs"
            onClick={onCenterRunners}
            disabled={!hasRunners}
          >
            <Users className={enBarra ? "h-4 w-4 sm:mr-1" : "h-4 w-4 mr-1"} />
            <span className={enBarra ? "sr-only sm:not-sr-only" : undefined}>Grupo</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side={lado}>
          <p>Centrar en los participantes</p>
        </TooltipContent>
      </Tooltip>

      {/* Follow Runner */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={isFollowing ? "default" : "secondary"}
            className={`h-8 w-8 shadow-md border ${isFollowing ? 'bg-primary text-primary-foreground' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            onClick={onFollowRunner}
            disabled={!hasRunners}
          >
            <LocateFixed className={`h-4 w-4 ${isFollowing ? 'animate-pulse' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={lado}>
          <p>{isFollowing ? 'Dejar de seguir' : 'Seguir corredor seleccionado'}</p>
        </TooltipContent>
      </Tooltip>

      {/* Divider */}
      <div className={separador} />

      {/* Zoom In */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-white shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={onZoomIn}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={lado}>
          <p>Acercar</p>
        </TooltipContent>
      </Tooltip>

      {/* Zoom Out */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-white shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={onZoomOut}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={lado}>
          <p>Alejar</p>
        </TooltipContent>
      </Tooltip>

      {/* Divider */}
      <div className={separador} />

      {/* Map Style */}
      <DropdownMenu open={isStyleMenuOpen} onOpenChange={setIsStyleMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-white shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                <Layers className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side={lado}>
            <p>Estilo del mapa</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side={lado} align="start">
          {MAP_STYLES.map((style) => (
            <DropdownMenuItem
              key={style.id}
              onClick={() => onChangeStyle(style.id)}
              className={currentStyle === style.id ? 'bg-accent' : ''}
            >
              <style.icon className="h-4 w-4 mr-2" />
              {style.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Fullscreen */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-white shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={onToggleFullscreen}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={lado}>
          <p>Pantalla completa</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
