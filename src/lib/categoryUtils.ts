import { supabase } from "@/integrations/supabase/client";

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
 * Gets the gender prefix for category display
 * @param gender - 'male', 'female', 'Masculino', 'Femenino', 'M', 'F'
 * @returns 'M-', 'F-', or 'X-' if unknown
 */
export function getGenderPrefix(gender: string | null | undefined): string {
  if (!gender) return 'X-';
  
  const normalizedGender = gender.toLowerCase().trim();
  
  if (normalizedGender === 'male' || normalizedGender === 'masculino' || normalizedGender === 'm') {
    return 'M-';
  }
  if (normalizedGender === 'female' || normalizedGender === 'femenino' || normalizedGender === 'f') {
    return 'F-';
  }
  
  return 'X-';
}

/**
 * Formats a category name with gender prefix
 * @param categoryName - Base category name (e.g., "Senior", "Junior")
 * @param gender - Gender of the participant
 * @returns Category with prefix (e.g., "M-Senior", "F-Junior")
 */
export function formatCategoryWithGender(categoryName: string, gender: string | null | undefined): string {
  const prefix = getGenderPrefix(gender);
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

/**
 * Gets or creates a category for a participant
 * If the category is age-dependent and we have birth date, calculate it
 * Otherwise, use the provided category name
 */
export async function getOrCreateCategory(
  raceId: string,
  distanceId: string,
  categoryName: string | null,
  birthDate: string | null,
  gender: string | null,
  raceDate: string
): Promise<string | null> {
  // Get existing categories for this event
  const { data: categories } = await supabase
    .from("race_categories")
    .select("*")
    .eq("race_distance_id", distanceId)
    .order("display_order");
  
  if (!categories || categories.length === 0) {
    // No categories defined - if we have a category name from import, create it
    if (categoryName) {
      await createCategoryIfNotExists(raceId, distanceId, categoryName);
      return categoryName;
    }
    return null;
  }
  
  // Check if we should auto-calculate based on age
  const hasAgeDependentCategories = categories.some(c => c.age_dependent);
  
  if (hasAgeDependentCategories && birthDate) {
    const matchedCategory = calculateCategoryByAge(birthDate, categories as RaceCategory[], raceDate);
    if (matchedCategory) {
      // Return category name with gender prefix for display
      const displayName = formatCategoryWithGender(matchedCategory.short_name || matchedCategory.name, gender);
      return displayName;
    }
  }
  
  // If we have a category name from import, use it and ensure it exists
  if (categoryName) {
    await createCategoryIfNotExists(raceId, distanceId, categoryName);
    return categoryName;
  }
  
  return null;
}

/**
 * Creates a category if it doesn't already exist
 * Categories created this way are NOT age-dependent
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
