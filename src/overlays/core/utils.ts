// src/overlays/core/utils.ts

/**
 * CAMBERAS OVERLAY SYSTEM - UTILITIES
 * Funciones helper reutilizables para el sistema de overlays
 */

import type { OverlayConfig, OverlayConfigDB, DisplayMode } from './types';

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Convierte color hex a rgba con alpha
 */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(0, 0, 0, ${alpha})`;
  
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Genera variaciones de color para temas
 */
export function generateColorVariants(baseColor: string) {
  // Simplificado - en producción usar una librería como tinycolor2
  return {
    base: baseColor,
    light: baseColor + 'CC', // 80% opacity
    dark: baseColor + '66',   // 40% opacity
  };
}

// ============================================================================
// FONT UTILITIES
// ============================================================================

export const AVAILABLE_FONTS = [
  { value: "Bebas Neue", label: "Bebas Neue", class: "font-bebas" },
  { value: "Archivo Black", label: "Archivo Black", class: "font-archivo" },
  { value: "Roboto Condensed", label: "Roboto Condensed", class: "font-roboto-condensed" },
  { value: "Barlow Semi Condensed", label: "Barlow Semi Condensed", class: "font-barlow" },
] as const;

/**
 * Obtiene la familia de fuente CSS
 */
export function getFontFamily(fontName: string): string {
  const fontMap: Record<string, string> = {
    "Bebas Neue": '"Bebas Neue", cursive',
    "Archivo Black": '"Archivo Black", sans-serif',
    "Roboto Condensed": '"Roboto Condensed", sans-serif',
    "Barlow Semi Condensed": '"Barlow Semi Condensed", sans-serif',
  };
  
  return fontMap[fontName] || 'sans-serif';
}

/**
 * Obtiene la clase CSS de Tailwind para la fuente
 */
export function getFontClass(fontName: string): string {
  const font = AVAILABLE_FONTS.find(f => f.value === fontName);
  return font?.class || '';
}

// ============================================================================
// DATA CONVERSION UTILITIES
// ============================================================================

/**
 * Convierte velocidad de m/s a km/h
 */
export function convertSpeedToKmh(speedMs: number): number {
  return Math.round(speedMs * 3.6);
}

/**
 * Convierte velocidad a ritmo (min/km)
 */
export function convertSpeedToPace(speedKmh: number): string {
  if (speedKmh <= 0) return '--:--';
  
  const paceMinutes = 60 / speedKmh;
  const mins = Math.floor(paceMinutes);
  const secs = Math.round((paceMinutes - mins) * 60);
  
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formatea velocidad según el tipo de display
 */
export function formatSpeed(
  speedMs: number, 
  displayType: DisplayMode = 'speed'
): string {
  const speedKmh = convertSpeedToKmh(speedMs);
  
  if (displayType === 'pace') {
    return convertSpeedToPace(speedKmh);
  }
  
  return `${speedKmh}`;
}

/**
 * Convierte metros a kilómetros formateados
 */
export function metersToKm(meters: number, decimals: number = 1): string {
  return (meters / 1000).toFixed(decimals);
}

/**
 * Calcula el gap entre dos motos
 */
export function calculateGap(
  moto1Distance: number, 
  moto2Distance: number
): string {
  const diffMeters = moto1Distance - moto2Distance;
  const diffKm = diffMeters / 1000;
  const sign = diffKm >= 0 ? '+' : '';
  
  return `${sign}${diffKm.toFixed(2)} km`;
}

/**
 * Parsea un valor numérico de un string
 */
export function parseNumericValue(value: string): number {
  const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Calcula tiempo transcurrido desde el inicio
 */
export function getElapsedTime(startTime: Date | null): string {
  if (!startTime) return '--:--:--';
  
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();
  
  if (diff < 0) return '--:--:--'; // Race hasn't started
  
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formatea timestamp para display
 */
export function formatTimestamp(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// ============================================================================
// BUFFER MANAGEMENT
// ============================================================================

/**
 * Gestiona buffer de datos con delay
 */
export class DataBuffer<T extends { timestamp: number }> {
  private buffer: T[] = [];
  private maxAge: number;
  
  constructor(maxAgeMs: number = 60000) {
    this.maxAge = maxAgeMs;
  }
  
  add(data: T): void {
    this.buffer.push(data);
    this.cleanup();
  }
  
  getDelayed(delayMs: number): T | null {
    const targetTime = Date.now() - delayMs;
    
    if (this.buffer.length === 0) return null;
    
    // Find closest data point to target time
    return this.buffer.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.timestamp - targetTime);
      const currDiff = Math.abs(curr.timestamp - targetTime);
      return currDiff < prevDiff ? curr : prev;
    });
  }
  
  private cleanup(): void {
    const cutoff = Date.now() - this.maxAge;
    this.buffer = this.buffer.filter(d => d.timestamp > cutoff);
  }
  
  clear(): void {
    this.buffer = [];
  }
}

// ============================================================================
// DATABASE MAPPING
// ============================================================================

/**
 * Convierte config de DB flat a estructura anidada
 */
export function dbToOverlayConfig(dbConfig: OverlayConfigDB): OverlayConfig {
  return {
    id: dbConfig.id,
    race_id: dbConfig.race_id,
    delay_seconds: dbConfig.delay_seconds,
    layout: dbConfig.layout as OverlayConfig['layout'],
    
    speed: {
      type: 'speed',
      visible: dbConfig.speed_visible,
      font: dbConfig.speed_font,
      size: dbConfig.speed_size,
      color: dbConfig.speed_color,
      bgColor: dbConfig.speed_bg_color,
      bgOpacity: dbConfig.speed_bg_opacity,
      posX: dbConfig.speed_pos_x,
      posY: dbConfig.speed_pos_y,
      scale: dbConfig.speed_scale,
      manualMode: dbConfig.speed_manual_mode,
      manualValue: dbConfig.speed_manual_value,
      displayType: dbConfig.speed_display_type as DisplayMode,
    },
    
    distance: {
      type: 'distance',
      visible: dbConfig.distance_visible,
      font: dbConfig.distance_font,
      size: dbConfig.distance_size,
      color: dbConfig.distance_color,
      bgColor: dbConfig.distance_bg_color,
      bgOpacity: dbConfig.distance_bg_opacity,
      posX: dbConfig.distance_pos_x,
      posY: dbConfig.distance_pos_y,
      scale: dbConfig.distance_scale,
      manualMode: dbConfig.distance_manual_mode,
      manualValue: dbConfig.distance_manual_value,
    },
    
    gaps: {
      type: 'gaps',
      visible: dbConfig.gaps_visible,
      font: dbConfig.gaps_font,
      size: dbConfig.gaps_size,
      color: dbConfig.gaps_color,
      bgColor: dbConfig.gaps_bg_color,
      bgOpacity: dbConfig.gaps_bg_opacity,
      posX: dbConfig.gaps_pos_x,
      posY: dbConfig.gaps_pos_y,
      scale: dbConfig.gaps_scale,
      manualMode: dbConfig.gaps_manual_mode,
      manualValue: dbConfig.gaps_manual_value,
    },
    
    clock: {
      type: 'clock',
      visible: dbConfig.clock_visible,
      font: dbConfig.clock_font,
      size: dbConfig.clock_size,
      color: dbConfig.clock_color,
      bgColor: dbConfig.clock_bg_color,
      bgOpacity: dbConfig.clock_bg_opacity,
      posX: dbConfig.clock_pos_x,
      posY: dbConfig.clock_pos_y,
      scale: dbConfig.clock_scale,
      manualMode: false,
      manualValue: null,
    },
    
    checkpoint: {
      type: 'checkpoint',
      visible: dbConfig.checkpoint_visible,
      font: dbConfig.checkpoint_font,
      size: dbConfig.checkpoint_size,
      color: dbConfig.checkpoint_color,
      bgColor: dbConfig.checkpoint_bg_color,
      bgOpacity: dbConfig.checkpoint_bg_opacity,
      posX: dbConfig.checkpoint_pos_x,
      posY: dbConfig.checkpoint_pos_y,
      scale: dbConfig.checkpoint_scale,
      manualMode: dbConfig.checkpoint_manual_mode,
      manualValue: dbConfig.checkpoint_manual_value,
    },
    
    selected_moto_id: dbConfig.selected_moto_id,
    compare_moto_id: dbConfig.compare_moto_id,
    selected_distance_id: dbConfig.selected_distance_id,
    
    route_map: {
      visible: dbConfig.route_map_visible,
      lineColor: dbConfig.route_map_line_color,
      lineWidth: dbConfig.route_map_line_width,
      motoLabelSize: dbConfig.route_map_moto_label_size,
      motoLabelColor: dbConfig.route_map_moto_label_color,
      motoLabelBgColor: dbConfig.route_map_moto_label_bg_color,
    },
    
    elevation: {
      visible: dbConfig.elevation_visible,
      lineColor: dbConfig.elevation_line_color,
      fillOpacity: dbConfig.elevation_fill_opacity,
      motoMarkerSize: dbConfig.elevation_moto_marker_size,
    },
    
    map_overlay_moto_ids: dbConfig.map_overlay_moto_ids,
  };
}

/**
 * Convierte config anidada a formato DB flat
 */
export function overlayConfigToDb(config: OverlayConfig): OverlayConfigDB {
  return {
    id: config.id,
    race_id: config.race_id,
    delay_seconds: config.delay_seconds,
    layout: config.layout,
    
    speed_font: config.speed.font,
    speed_size: config.speed.size,
    speed_color: config.speed.color,
    speed_bg_color: config.speed.bgColor,
    speed_visible: config.speed.visible,
    speed_manual_mode: config.speed.manualMode,
    speed_manual_value: config.speed.manualValue,
    speed_bg_opacity: config.speed.bgOpacity,
    speed_pos_x: config.speed.posX,
    speed_pos_y: config.speed.posY,
    speed_scale: config.speed.scale,
    speed_display_type: config.speed.displayType,
    
    distance_font: config.distance.font,
    distance_size: config.distance.size,
    distance_color: config.distance.color,
    distance_bg_color: config.distance.bgColor,
    distance_visible: config.distance.visible,
    distance_manual_mode: config.distance.manualMode,
    distance_manual_value: config.distance.manualValue,
    distance_bg_opacity: config.distance.bgOpacity,
    distance_pos_x: config.distance.posX,
    distance_pos_y: config.distance.posY,
    distance_scale: config.distance.scale,
    
    gaps_font: config.gaps.font,
    gaps_size: config.gaps.size,
    gaps_color: config.gaps.color,
    gaps_bg_color: config.gaps.bgColor,
    gaps_visible: config.gaps.visible,
    gaps_manual_mode: config.gaps.manualMode,
    gaps_manual_value: config.gaps.manualValue,
    gaps_bg_opacity: config.gaps.bgOpacity,
    gaps_pos_x: config.gaps.posX,
    gaps_pos_y: config.gaps.posY,
    gaps_scale: config.gaps.scale,
    
    clock_font: config.clock.font,
    clock_size: config.clock.size,
    clock_color: config.clock.color,
    clock_bg_color: config.clock.bgColor,
    clock_visible: config.clock.visible,
    clock_bg_opacity: config.clock.bgOpacity,
    clock_pos_x: config.clock.posX,
    clock_pos_y: config.clock.posY,
    clock_scale: config.clock.scale,
    
    checkpoint_font: config.checkpoint.font,
    checkpoint_size: config.checkpoint.size,
    checkpoint_color: config.checkpoint.color,
    checkpoint_bg_color: config.checkpoint.bgColor,
    checkpoint_visible: config.checkpoint.visible,
    checkpoint_manual_mode: config.checkpoint.manualMode,
    checkpoint_manual_value: config.checkpoint.manualValue,
    checkpoint_bg_opacity: config.checkpoint.bgOpacity,
    checkpoint_pos_x: config.checkpoint.posX,
    checkpoint_pos_y: config.checkpoint.posY,
    checkpoint_scale: config.checkpoint.scale,
    
    selected_moto_id: config.selected_moto_id,
    compare_moto_id: config.compare_moto_id,
    selected_distance_id: config.selected_distance_id,
    
    route_map_visible: config.route_map.visible,
    route_map_line_color: config.route_map.lineColor,
    route_map_line_width: config.route_map.lineWidth,
    route_map_moto_label_size: config.route_map.motoLabelSize,
    route_map_moto_label_color: config.route_map.motoLabelColor,
    route_map_moto_label_bg_color: config.route_map.motoLabelBgColor,
    
    elevation_visible: config.elevation.visible,
    elevation_line_color: config.elevation.lineColor,
    elevation_fill_opacity: config.elevation.fillOpacity,
    elevation_moto_marker_size: config.elevation.motoMarkerSize,
    
    map_overlay_moto_ids: config.map_overlay_moto_ids,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Valida que una configuración sea válida
 */
export function validateConfig(config: Partial<OverlayConfig>): string[] {
  const errors: string[] = [];
  
  if (!config.race_id) {
    errors.push('race_id es requerido');
  }
  
  if (config.delay_seconds !== undefined && config.delay_seconds < 0) {
    errors.push('delay_seconds debe ser >= 0');
  }
  
  // Validar rangos de valores para un elemento
  const validateElement = (
    element: { posX?: number; posY?: number; scale?: number; size?: number } | undefined, 
    name: string
  ) => {
    if (!element) return;
    
    if (element.posX !== undefined && (element.posX < 0 || element.posX > 100)) {
      errors.push(`${name}.posX debe estar entre 0 y 100`);
    }
    if (element.posY !== undefined && (element.posY < 0 || element.posY > 100)) {
      errors.push(`${name}.posY debe estar entre 0 y 100`);
    }
    if (element.scale !== undefined && (element.scale < 0.1 || element.scale > 3)) {
      errors.push(`${name}.scale debe estar entre 0.1 y 3`);
    }
    if (element.size !== undefined && (element.size < 12 || element.size > 200)) {
      errors.push(`${name}.size debe estar entre 12 y 200`);
    }
  };
  
  validateElement(config.speed, 'speed');
  validateElement(config.distance, 'distance');
  validateElement(config.gaps, 'gaps');
  validateElement(config.clock, 'clock');
  validateElement(config.checkpoint, 'checkpoint');
  
  return errors;
}

// ============================================================================
// URL UTILITIES
// ============================================================================

/**
 * Valida si un raceId es UUID o slug
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Genera URL del overlay
 */
export function generateOverlayUrl(
  baseUrl: string, 
  overlayType: 'moto' | 'route-map' | 'elevation',
  raceSlugOrId: string
): string {
  return `${baseUrl}/overlay/${overlayType}/${raceSlugOrId}`;
}
