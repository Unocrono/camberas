import { supabase } from "@/integrations/supabase/client";
import { getGenderPrefix as getGenderPrefixFromId, getGenderCode, resolveGenderId } from "./genderUtils";

export interface RaceCategory {
  id: string;
  name: string;
  short_name: string | null;
  min_age: number | null;
  max_age: number | null;
  age_dependent: boolean;
  age_calculation_date: string | null;
  display_order: number;
  race_distance_id: string | null;
  category_number?: number | null;
}

/**
 * Calculates age at a specific date
 */
export function calculateAge(birthDate: string, referenceDate: string): number {
  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);
  
  let age = reference.getFullYear() - birth.getFullYear();
  const monthDiff = reference.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Gets the gender prefix for category display using gender_id
 * @param genderId - The gender_id from genders table (1=M, 2=F, 3=X)
 * @returns 'M-', 'F-', or 'X-'
 */
export function getGenderPrefix(genderId: number | null | undefined): string {
  return getGenderPrefixFromId(genderId);
}

/**
 * Legacy: Gets the gender prefix from text (for backward compatibility)
 * @deprecated Use getGenderPrefix with gender_id instead
 */
export function getGenderPrefixFromText(gender: string | null | undefined): string {
  if (!gender) return 'X-';
  
  const normalizedGender = gender.toLowerCase().trim();
  
  if (normalizedGender === 'male' || normalizedGender === 'masculino' || normalizedGender === 'm' || normalizedGender === 'hombre' || normalizedGender === 'h') {
    return 'M-';
  }
  if (normalizedGender === 'female' || normalizedGender === 'femenino' || normalizedGender === 'f' || normalizedGender === 'mujer') {
    return 'F-';
  }
  
  return 'X-';
}

/**
 * Formats a category name with gender prefix
 * Accepts both gender_id (number) and legacy gender text (string)
 * @param categoryName - Base category name (e.g., "Senior", "Junior")
 * @param genderOrGenderId - Gender ID (1, 2, 3) or gender text ('male', 'Masculino', etc.)
 * @returns Category with prefix (e.g., "M-Senior", "F-Junior")
 */
export function formatCategoryWithGender(
  categoryName: string, 
  genderOrGenderId: number | string | null | undefined
): string {
  // If it's a number, use gender_id lookup
  if (typeof genderOrGenderId === 'number') {
    const prefix = getGenderPrefix(genderOrGenderId);
    return `${prefix}${categoryName}`;
  }
  
  // If it's a string, use legacy text-based lookup
  const prefix = getGenderPrefixFromText(genderOrGenderId);
  return `${prefix}${categoryName}`;
}

/**
 * Calculates the category for a participant based on their age
 * @param birthDate - Participant's birth date (YYYY-MM-DD)
 * @param categories - Available categories for the event
 * @param raceDate - Race date for age calculation (YYYY-MM-DD)
 * @returns The matching category or null if none found
 */
export function calculateCategoryByAge(
  birthDate: string,
  categories: RaceCategory[],
  raceDate: string
): RaceCategory | null {
  // Filter only age-dependent categories
  const ageDependentCategories = categories.filter(c => c.age_dependent);
  
  if (ageDependentCategories.length === 0) return null;
  
  // Sort by display_order to ensure consistent matching
  const sortedCategories = [...ageDependentCategories].sort((a, b) => a.display_order - b.display_order);
  
  for (const category of sortedCategories) {
    const referenceDate = category.age_calculation_date || raceDate;
    const age = calculateAge(birthDate, referenceDate);
    
    const minAge = category.min_age ?? 0;
    const maxAge = category.max_age ?? 999;
    
    if (age >= minAge && age <= maxAge) {
      return category;
    }
  }
  
  return null;
}

export interface CategoryResult {
  id: string | null;
  name: string | null;
}

/**
 * Gets or creates a category for a participant and returns the category ID and name
 * Implements hybrid logic (Option 3):
 * 1. If CSV provides category name → use/create that category (age_dependent=false)
 * 2. If no CSV category AND age_dependent categories exist → calculate by age/gender
 * 3. If neither → use "UNICA" default category
 * 
 * @returns Object with category ID (UUID) and name
 */
export async function getOrCreateCategoryId(
  raceId: string,
  distanceId: string,
  importedCategoryName: string | null,
  birthDate: string | null,
  gender: string | null,
  raceDate: string
): Promise<CategoryResult> {
  // Get existing categories for this event
  const { data: categories } = await supabase
    .from("race_categories")
    .select("*")
    .eq("race_distance_id", distanceId)
    .order("display_order");
  
  const typedCategories = (categories || []) as RaceCategory[];
  
  // Scenario 1: CSV provides category name → use or create it
  if (importedCategoryName && importedCategoryName.trim()) {
    const result = await findOrCreateCategoryByName(raceId, distanceId, importedCategoryName.trim(), typedCategories);
    return result;
  }
  
  // Scenario 2: No CSV category, check for age_dependent categories
  const hasAgeDependentCategories = typedCategories.some(c => c.age_dependent);
  
  if (hasAgeDependentCategories && birthDate) {
    const matchedCategory = calculateCategoryByAge(birthDate, typedCategories, raceDate);
    if (matchedCategory) {
      return { id: matchedCategory.id, name: matchedCategory.name };
    }
  }
  
  // Scenario 3: No CSV category, no age match → use "UNICA" default
  const unicaCategory = typedCategories.find(c => c.name === 'UNICA');
  if (unicaCategory) {
    return { id: unicaCategory.id, name: unicaCategory.name };
  }
  
  // If "UNICA" doesn't exist (shouldn't happen due to trigger), create it
  const { data: newUnica } = await supabase
    .from("race_categories")
    .insert({
      race_id: raceId,
      race_distance_id: distanceId,
      name: 'UNICA',
      short_name: 'UNICA',
      age_dependent: false,
      display_order: 1,
    })
    .select("id")
    .single();
  
  return { id: newUnica?.id || null, name: 'UNICA' };
}

/**
 * Finds a category by name or creates a new one if it doesn't exist
 * New categories are created with age_dependent=false (imported categories)
 */
async function findOrCreateCategoryByName(
  raceId: string,
  distanceId: string,
  categoryName: string,
  existingCategories: RaceCategory[]
): Promise<CategoryResult> {
  // Check if category already exists (by name or short_name)
  const existing = existingCategories.find(
    c => c.name.toLowerCase() === categoryName.toLowerCase() || 
         c.short_name?.toLowerCase() === categoryName.toLowerCase()
  );
  
  if (existing) {
    return { id: existing.id, name: existing.name };
  }
  
  // Create new category (not age-dependent since it's from import)
  const maxOrder = existingCategories.reduce((max, c) => Math.max(max, c.display_order), 0);
  
  const { data: newCategory } = await supabase
    .from("race_categories")
    .insert({
      race_id: raceId,
      race_distance_id: distanceId,
      name: categoryName,
      short_name: categoryName.substring(0, 10).toUpperCase(),
      age_dependent: false,
      display_order: maxOrder + 1,
    })
    .select("id, name")
    .single();
  
  return { id: newCategory?.id || null, name: newCategory?.name || categoryName };
}

/**
 * Legacy function - Creates a category if it doesn't already exist
 * @deprecated Use getOrCreateCategoryId instead
 */
export async function createCategoryIfNotExists(
  raceId: string,
  distanceId: string,
  categoryName: string
): Promise<void> {
  // Check if category already exists
  const { data: existing } = await supabase
    .from("race_categories")
    .select("id")
    .eq("race_distance_id", distanceId)
    .or(`name.eq.${categoryName},short_name.eq.${categoryName}`)
    .maybeSingle();
  
  if (!existing) {
    // Get max display_order
    const { data: maxOrderData } = await supabase
      .from("race_categories")
      .select("display_order")
      .eq("race_distance_id", distanceId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const nextOrder = (maxOrderData?.display_order ?? 0) + 1;
    
    // Create new category (not age-dependent since it's from import)
    await supabase.from("race_categories").insert({
      race_id: raceId,
      race_distance_id: distanceId,
      name: categoryName,
      short_name: categoryName.substring(0, 10).toUpperCase(),
      age_dependent: false,
      display_order: nextOrder,
    });
  }
}

/**
 * Normalizes gender value to standard format
 */
export function normalizeGender(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  
  if (normalized === 'm' || normalized === 'male' || normalized === 'masculino' || normalized === 'hombre' || normalized === 'h') {
    return 'male';
  }
  if (normalized === 'f' || normalized === 'female' || normalized === 'femenino' || normalized === 'mujer') {
    return 'female';
  }
  
  return null;
}
