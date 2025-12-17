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
}: MapControlsProps) {
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);

  return (
    <div className="absolute top-4 right-14 z-10 flex flex-col gap-1">
      {/* Center on Route */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-card shadow-md border"
            onClick={onCenterRoute}
            disabled={!hasRoute}
          >
            <Route className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Centrar en recorrido</p>
        </TooltipContent>
      </Tooltip>

      {/* Center on Runners */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-card shadow-md border"
            onClick={onCenterRunners}
            disabled={!hasRunners}
          >
            <Users className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Centrar en participantes</p>
        </TooltipContent>
      </Tooltip>

      {/* Follow Runner */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={isFollowing ? "default" : "secondary"}
            className={`h-8 w-8 shadow-md border ${isFollowing ? '' : 'bg-card'}`}
            onClick={onFollowRunner}
            disabled={!hasRunners}
          >
            <LocateFixed className={`h-4 w-4 ${isFollowing ? 'animate-pulse' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{isFollowing ? 'Dejar de seguir' : 'Seguir corredor seleccionado'}</p>
        </TooltipContent>
      </Tooltip>

      {/* Divider */}
      <div className="h-px bg-border my-1" />

      {/* Zoom In */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-card shadow-md border"
            onClick={onZoomIn}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Acercar</p>
        </TooltipContent>
      </Tooltip>

      {/* Zoom Out */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-card shadow-md border"
            onClick={onZoomOut}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Alejar</p>
        </TooltipContent>
      </Tooltip>

      {/* Divider */}
      <div className="h-px bg-border my-1" />

      {/* Map Style */}
      <DropdownMenu open={isStyleMenuOpen} onOpenChange={setIsStyleMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-card shadow-md border"
              >
                <Layers className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Estilo del mapa</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="left" align="start">
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
            className="h-8 w-8 bg-card shadow-md border"
            onClick={onToggleFullscreen}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Pantalla completa</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
