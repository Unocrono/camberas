// src/overlays/core/types.ts

/**
 * CAMBERAS OVERLAY SYSTEM - CORE TYPES
 * Sistema modular para overlays de streaming profesional
 */

// ============================================================================
// BASE TYPES
// ============================================================================

export type OverlayElementType = 
  | 'speed' 
  | 'distance' 
  | 'gaps' 
  | 'clock' 
  | 'checkpoint'
  | 'custom';

export type DisplayMode = 'speed' | 'pace';
export type LayoutMode = 'horizontal' | 'vertical' | 'square' | 'custom';

// ============================================================================
// ELEMENT CONFIGURATION
// ============================================================================

export interface ElementStyleConfig {
  visible: boolean;
  font: string;
  size: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  posX: number;  // 0-100 percentage
  posY: number;  // 0-100 percentage
  scale: number; // 0.5-2.0
}

export interface ElementDataConfig {
  manualMode: boolean;
  manualValue: string | null;
}

export interface OverlayElementConfig extends ElementStyleConfig, ElementDataConfig {
  type: OverlayElementType;
  label?: string;
}

// ============================================================================
// COMPLETE OVERLAY CONFIG
// ============================================================================

export interface OverlayConfig {
  id?: string;
  race_id: string;
  
  // Global settings
  delay_seconds: number;
  layout: LayoutMode;
  
  // Element-specific configs
  speed: OverlayElementConfig & { displayType: DisplayMode };
  distance: OverlayElementConfig;
  gaps: OverlayElementConfig;
  clock: OverlayElementConfig;
  checkpoint: OverlayElementConfig;
  
  // Moto selection
  selected_moto_id: string | null;
  compare_moto_id: string | null;
  selected_distance_id: string | null;
  
  // Map/Elevation specific
  route_map: {
    visible: boolean;
    lineColor: string;
    lineWidth: number;
    motoLabelSize: number;
    motoLabelColor: string;
    motoLabelBgColor: string;
  };
  
  elevation: {
    visible: boolean;
    lineColor: string;
    fillOpacity: number;
    motoMarkerSize: number;
  };
  
  map_overlay_moto_ids: string[];
}

// ============================================================================
// RUNTIME DATA
// ============================================================================

export interface MotoData {
  id: string;
  name: string;
  name_tv: string | null;
  color: string;
  speed: number; // m/s
  distance_from_start: number; // meters
  distance_to_finish: number | null; // km
  distance_to_next_checkpoint: number | null; // km
  next_checkpoint_name: string | null;
  latitude?: number;
  longitude?: number;
  timestamp: string;
}

export interface DisplayData {
  speed: string;
  distance: string;
  distanceToFinish: string;
  distanceToNextCheckpoint: string;
  nextCheckpointName: string;
  gap: string;
  timestamp: number;
  isManualSpeed: boolean;
  isManualDistance: boolean;
  isManualGap: boolean;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface OverlayElementProps {
  config: OverlayElementConfig;
  value: string | number;
  isManual?: boolean;
  showBadge?: boolean;
  animated?: boolean;
  onUpdate?: (updates: Partial<OverlayElementConfig>) => void;
}

export interface DataDisplayProps {
  label?: string;
  value: string | number;
  suffix?: string;
  config: ElementStyleConfig;
  isManual?: boolean;
  animated?: boolean;
  showGlow?: boolean;
}

// ============================================================================
// DATABASE MAPPING (for Supabase compatibility)
// ============================================================================

export interface OverlayConfigDB {
  id?: string;
  race_id: string;
  delay_seconds: number;
  layout: string;
  
  // Speed element
  speed_font: string;
  speed_size: number;
  speed_color: string;
  speed_bg_color: string;
  speed_visible: boolean;
  speed_manual_mode: boolean;
  speed_manual_value: string | null;
  speed_bg_opacity: number;
  speed_pos_x: number;
  speed_pos_y: number;
  speed_scale: number;
  speed_display_type: string;
  
  // Distance element
  distance_font: string;
  distance_size: number;
  distance_color: string;
  distance_bg_color: string;
  distance_visible: boolean;
  distance_manual_mode: boolean;
  distance_manual_value: string | null;
  distance_bg_opacity: number;
  distance_pos_x: number;
  distance_pos_y: number;
  distance_scale: number;
  
  // Gaps element
  gaps_font: string;
  gaps_size: number;
  gaps_color: string;
  gaps_bg_color: string;
  gaps_visible: boolean;
  gaps_manual_mode: boolean;
  gaps_manual_value: string | null;
  gaps_bg_opacity: number;
  gaps_pos_x: number;
  gaps_pos_y: number;
  gaps_scale: number;
  
  // Clock element
  clock_font: string;
  clock_size: number;
  clock_color: string;
  clock_bg_color: string;
  clock_visible: boolean;
  clock_bg_opacity: number;
  clock_pos_x: number;
  clock_pos_y: number;
  clock_scale: number;
  
  // Checkpoint element
  checkpoint_font: string;
  checkpoint_size: number;
  checkpoint_color: string;
  checkpoint_bg_color: string;
  checkpoint_visible: boolean;
  checkpoint_manual_mode: boolean;
  checkpoint_manual_value: string | null;
  checkpoint_bg_opacity: number;
  checkpoint_pos_x: number;
  checkpoint_pos_y: number;
  checkpoint_scale: number;
  
  // Motos
  selected_moto_id: string | null;
  compare_moto_id: string | null;
  selected_distance_id: string | null;
  
  // Map overlay
  route_map_visible: boolean;
  route_map_line_color: string;
  route_map_line_width: number;
  route_map_moto_label_size: number;
  route_map_moto_label_color: string;
  route_map_moto_label_bg_color: string;
  
  // Elevation overlay
  elevation_visible: boolean;
  elevation_line_color: string;
  elevation_fill_opacity: number;
  elevation_moto_marker_size: number;
  
  map_overlay_moto_ids: string[];
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface FontOption {
  value: string;
  label: string;
  class: string;
}

export interface PresetConfig {
  id: string;
  name: string;
  description: string;
  config: Partial<OverlayConfig>;
}
