/**
 * Protein tracking types — 5-checkbox daily tracker with gram adjustments,
 * supplements, time-gating, and handler messages.
 */

// ============================================
// CORE TYPES
// ============================================

export type GramLevel = 'low' | 'medium' | 'high';

export interface DailyProtein {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  shakePostWorkout: boolean;
  breakfastProtein: boolean;
  lunchProtein: boolean;
  dinnerProtein: boolean;
  snackProtein: boolean;
  gramAdjustments: Record<string, GramLevel>;
  supplementProtein: boolean;
  supplementCreatine: boolean;
  supplementCollagen: boolean;
  notes: string | null;
  createdAt: string;
}

export type ProteinSourceKey = 'shakePostWorkout' | 'breakfastProtein' | 'lunchProtein' | 'dinnerProtein' | 'snackProtein';

export interface ProteinSource {
  key: ProteinSourceKey;
  label: string;
  estimatedGrams: number;
  /** Time of day (hour, 0-23) when this source becomes visible */
  visibleFromHour: number;
}

export type SupplementKey = 'supplementProtein' | 'supplementCreatine' | 'supplementCollagen';

export interface SupplementItem {
  key: SupplementKey;
  label: string;
}

// ============================================
// CONSTANTS
// ============================================

export const PROTEIN_TARGET = 130;

export const PROTEIN_SOURCES: ProteinSource[] = [
  { key: 'shakePostWorkout', label: 'Post-workout shake', estimatedGrams: 30, visibleFromHour: 0 },
  { key: 'breakfastProtein', label: 'Breakfast protein', estimatedGrams: 20, visibleFromHour: 0 },
  { key: 'lunchProtein', label: 'Lunch protein', estimatedGrams: 30, visibleFromHour: 11 },
  { key: 'dinnerProtein', label: 'Dinner protein', estimatedGrams: 30, visibleFromHour: 18 },
  { key: 'snackProtein', label: 'Protein snack', estimatedGrams: 15, visibleFromHour: 15 },
];

/** Per-source gram estimates at each adjustment level */
export const GRAM_ESTIMATES: Record<ProteinSourceKey, Record<GramLevel, number>> = {
  shakePostWorkout: { low: 30, medium: 30, high: 30 },       // fixed by recipe
  breakfastProtein: { low: 10, medium: 20, high: 30 },
  lunchProtein:     { low: 15, medium: 30, high: 45 },
  dinnerProtein:    { low: 15, medium: 30, high: 45 },
  snackProtein:     { low: 10, medium: 15, high: 25 },
};

export const SUPPLEMENT_ITEMS: SupplementItem[] = [
  { key: 'supplementProtein', label: 'Protein' },
  { key: 'supplementCreatine', label: 'Creatine' },
  { key: 'supplementCollagen', label: 'Collagen' },
];

// ============================================
// RATING & HANDLER MESSAGES
// ============================================

export type ProteinRating = 'great' | 'ok' | 'poor';

export function getProteinRating(count: number): { rating: ProteinRating; label: string; color: string } {
  if (count >= 4) return { rating: 'great', label: "She's building", color: 'text-green-400' };
  if (count === 3) return { rating: 'ok', label: 'Close enough', color: 'text-yellow-400' };
  return { rating: 'poor', label: 'Her glutes got nothing today', color: 'text-red-400' };
}

export function getGramsRating(grams: number): { label: string; color: string; barColor: string } {
  if (grams >= PROTEIN_TARGET) return { label: 'Full', color: 'text-green-400', barColor: 'bg-green-400' };
  if (grams >= 81) return { label: 'Almost there', color: 'text-green-500', barColor: 'bg-green-500' };
  if (grams >= 41) return { label: 'Getting there', color: 'text-yellow-500', barColor: 'bg-yellow-500' };
  return { label: 'Feed the build', color: 'text-red-400', barColor: 'bg-red-400' };
}

const HANDLER_MESSAGES: Record<ProteinRating, string[]> = {
  poor: [
    "Her glutes can't grow on air.",
    "The build needs fuel. She hasn't started.",
  ],
  ok: [
    'Getting there. Feed the build.',
    'More protein days than not. Tighten it up.',
  ],
  great: [
    'She fed the body she\'s building.',
    'Protein dialed. The growth is fueled.',
  ],
};

export function getHandlerMessage(rating: ProteinRating): string {
  const pool = HANDLER_MESSAGES[rating];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================
// PURE FUNCTIONS
// ============================================

/** Estimate grams from checked sources, respecting per-source gram adjustments. */
export function estimateGrams(protein: DailyProtein): number {
  return PROTEIN_SOURCES.reduce((sum, src) => {
    if (!protein[src.key]) return sum;
    const level = (protein.gramAdjustments?.[src.key] as GramLevel) || 'medium';
    const grams = GRAM_ESTIMATES[src.key][level];
    return sum + grams;
  }, 0);
}

/** Count checked protein sources. */
export function countSources(protein: DailyProtein): number {
  return PROTEIN_SOURCES.filter(src => protein[src.key]).length;
}

/** Get sources visible at the given hour. Already-checked sources always included. */
export function getVisibleSources(hour: number, protein: DailyProtein | null): ProteinSource[] {
  return PROTEIN_SOURCES.filter(src => {
    // Always show if already checked
    if (protein && protein[src.key]) return true;
    return hour >= src.visibleFromHour;
  });
}

/** Check if a grocery nudge should fire: 2+ of the last N days have ≤2 sources. */
export function shouldShowGroceryNudge(history: DailyProtein[]): boolean {
  if (history.length < 2) return false;
  const recent = history.slice(-3); // last 3 days
  const lowDays = recent.filter(d => countSources(d) <= 2).length;
  return lowDays >= 2;
}
