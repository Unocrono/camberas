import type { ComponentType } from "react";
import { AlertTriangle, Bath, Camera, CircleDot, Clock, Coffee, Droplet, Flag, GlassWater, Home, MapPin, Mountain, Shirt, SquareParking, Star, Timer, Trophy, Utensils, WheatOff, type LucideProps } from "lucide-react";

/**
 * Iconos de los tipos de ítem del rutómetro (roadbook_item_types.icon): la
 * misma lista cerrada que ofrece el panel en «Tipos de Ítem de Rutómetro».
 * Importados uno a uno (el mapa `icons` de lucide metería 1.500 en el bundle).
 * Los usan el perfil y el mapa de la web propia, y el rutómetro público.
 */
export const ICONOS_RUTOMETRO: Record<string, ComponentType<LucideProps>> = {
  Flag,
  MapPin,
  Droplet,
  GlassWater,
  AlertTriangle,
  Camera,
  Trophy,
  Mountain,
  Coffee,
  Utensils,
  Home,
  Star,
  CircleDot,
  Timer,
  Clock,
  WheatOff,
  SquareParking,
  Shirt,
  Bath,
};

/** Icono por tipo de punto cuando el ítem no tiene tipo con icono (o viene de puntos de control) */
const POR_TIPO: Record<string, string> = {
  start: "Flag",
  salida: "Flag",
  finish: "Trophy",
  meta: "Trophy",
  aid_station: "Utensils",
  completo: "Utensils",
  aid_gluten_free: "WheatOff",
  sin_gluten: "WheatOff",
  parking: "SquareParking",
  refreshment: "Droplet",
  liquido: "Droplet",
  standard: "Droplet",
  checkpoint: "Timer",
  control: "Timer",
  medical: "AlertTriangle",
  sanitario: "AlertTriangle",
  poi: "Camera",
  technical: "AlertTriangle",
  uphill: "Mountain",
  downhill: "Mountain",
  bike_wash: "Droplet",
};

export function iconoRutometro(icono: string | undefined, tipo?: string): ComponentType<LucideProps> {
  if (icono && ICONOS_RUTOMETRO[icono]) return ICONOS_RUTOMETRO[icono];
  const porTipo = tipo ? POR_TIPO[tipo.toLowerCase()] : undefined;
  return (porTipo && ICONOS_RUTOMETRO[porTipo]) || MapPin;
}
