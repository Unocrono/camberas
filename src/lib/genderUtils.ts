import { supabase } from "@/integrations/supabase/client";

export interface Gender {
  gender_id: number;
  gender_code: string;
  gender_name: string;
  gender_code2: string | null;
  gender_name2: string | null;
  gender_code3: string | null;
  gender_name3: string | null;
}

// Cache for genders table
let gendersCache: Gender[] | null = null;

/**
 * Fetches all genders from the database (with caching)
 */
export async function fetchGenders(): Promise<Gender[]> {
  if (gendersCache) return gendersCache;
  
  const { data, error } = await supabase
    .from("genders")
    .select("*")
    .order("gender_id");
  
  if (error) {
    console.error("Error fetching genders:", error);
    return [];
  }
  
  gendersCache = data || [];
  return gendersCache;
}

/**
 * Clears the genders cache (call this if genders table is updated)
 */
export function clearGendersCache(): void {
  gendersCache = null;
}

/**
 * Gets gender_id from a text value (any format: M, Masculino, Male, Hombre, etc.)
 */
export function getGenderIdFromText(value: string | null | undefined): number | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  
  // Masculino = 1
  if (['m', 'male', 'masculino', 'hombre', 'h'].includes(normalized)) {
    return 1;
  }
  // Femenino = 2
  if (['f', 'female', 'femenino', 'mujer'].includes(normalized)) {
    return 2;
  }
  // Mixto = 3
  if (['x', 'mixto', 'mixte'].includes(normalized)) {
    return 3;
  }
  
  return null;
}

/**
 * Gets the gender code (M/F/X) from gender_id
 */
export function getGenderCode(genderId: number | null | undefined): string {
  switch (genderId) {
    case 1: return 'M';
    case 2: return 'F';
    case 3: return 'X';
    default: return 'X';
  }
}

/**
 * Gets the gender name (Masculino/Femenino/Mixto) from gender_id
 */
export function getGenderName(genderId: number | null | undefined): string {
  switch (genderId) {
    case 1: return 'Masculino';
    case 2: return 'Femenino';
    case 3: return 'Mixto';
    default: return 'Sin especificar';
  }
}

/**
 * Gets the gender name2 (Hombre/Mujer/Mixto) from gender_id
 */
export function getGenderName2(genderId: number | null | undefined): string {
  switch (genderId) {
    case 1: return 'Hombre';
    case 2: return 'Mujer';
    case 3: return 'Mixto';
    default: return 'Sin especificar';
  }
}

/**
 * Gets the gender prefix for category display (M-/F-/X-)
 */
export function getGenderPrefix(genderId: number | null | undefined): string {
  return getGenderCode(genderId) + '-';
}

/**
 * Legacy: Gets gender_id from the old text-based gender field
 * Supports both new gender_id and legacy text format
 */
export function resolveGenderId(
  genderId: number | null | undefined,
  genderText: string | null | undefined
): number | null {
  // If gender_id is already set, use it
  if (genderId !== null && genderId !== undefined) {
    return genderId;
  }
  
  // Otherwise, try to derive from text
  return getGenderIdFromText(genderText);
}

/**
 * Normalizes gender value to standard 'male'/'female' format
 * @deprecated Use getGenderIdFromText instead
 */
export function normalizeGenderToText(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  
  if (['m', 'male', 'masculino', 'hombre', 'h'].includes(normalized)) {
    return 'male';
  }
  if (['f', 'female', 'femenino', 'mujer'].includes(normalized)) {
    return 'female';
  }
  
  return null;
}
