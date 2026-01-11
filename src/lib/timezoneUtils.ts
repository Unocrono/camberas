/**
 * Timezone utilities for calculating UTC offset for Spanish races
 * 
 * Spain uses:
 * - CET (Central European Time): UTC+1 during winter
 * - CEST (Central European Summer Time): UTC+2 during summer (DST)
 * 
 * DST rules for Spain:
 * - Starts: Last Sunday of March at 02:00 → 03:00
 * - Ends: Last Sunday of October at 03:00 → 02:00
 */

/**
 * Gets the last Sunday of a given month in a given year
 */
function getLastSundayOfMonth(year: number, month: number): Date {
  // month is 0-indexed (0 = January, 2 = March, 9 = October)
  // Start from the last day of the month and go backwards
  const date = new Date(year, month + 1, 0); // Last day of the month
  
  // Find the last Sunday
  const dayOfWeek = date.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 0 : dayOfWeek;
  date.setDate(date.getDate() - daysToSubtract);
  
  return date;
}

/**
 * Checks if a date is in Spanish DST (summer time)
 * @param date The date to check
 * @returns true if the date is during CEST (summer time), false for CET (winter time)
 */
export function isSpanishDST(date: Date): boolean {
  const year = date.getFullYear();
  
  // DST starts: Last Sunday of March at 02:00
  const dstStart = getLastSundayOfMonth(year, 2); // March = 2
  dstStart.setHours(2, 0, 0, 0);
  
  // DST ends: Last Sunday of October at 03:00
  const dstEnd = getLastSundayOfMonth(year, 9); // October = 9
  dstEnd.setHours(3, 0, 0, 0);
  
  // Check if date is within DST period
  return date >= dstStart && date < dstEnd;
}

/**
 * Calculates the UTC offset in minutes for a date in Spain
 * @param date The date to calculate the offset for
 * @returns Offset in minutes (60 for CET/winter, 120 for CEST/summer)
 */
export function calculateSpainUtcOffset(date: Date): number {
  return isSpanishDST(date) ? 120 : 60;
}

/**
 * Calculates the UTC offset in minutes for a race date string
 * @param dateString Date string in YYYY-MM-DD format
 * @returns Offset in minutes (60 for CET/winter, 120 for CEST/summer)
 */
export function calculateUtcOffsetFromDateString(dateString: string): number {
  if (!dateString) return 60; // Default to CET if no date
  
  // Parse the date string
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid edge cases
  
  return calculateSpainUtcOffset(date);
}

/**
 * Formats the UTC offset for display
 * @param offsetMinutes Offset in minutes
 * @returns Formatted string like "+1:00" or "+2:00"
 */
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  
  return `${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Parses a formatted offset string back to minutes
 * @param offsetString String like "+1:00", "+2:00", "-5:00"
 * @returns Offset in minutes
 */
export function parseUtcOffset(offsetString: string): number {
  const match = offsetString.match(/^([+-])(\d+):(\d{2})$/);
  if (!match) return 60; // Default to CET if invalid
  
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  
  return sign * (hours * 60 + minutes);
}

/**
 * Converts a UTC timestamp to local race time by applying the offset
 * @param utcTimestamp ISO timestamp string (UTC)
 * @param offsetMinutes Offset in minutes to add
 * @returns New Date object with offset applied
 */
export function applyUtcOffset(utcTimestamp: string, offsetMinutes: number): Date {
  const date = new Date(utcTimestamp);
  date.setMinutes(date.getMinutes() + offsetMinutes);
  return date;
}

/**
 * Formats a Date to ISO string without timezone (for storing as local time)
 * @param date The date to format
 * @returns String in format "YYYY-MM-DDTHH:mm:ss"
 */
export function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}
