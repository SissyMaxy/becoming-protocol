/**
 * Protein tracking types — simple 5-checkbox daily tracker.
 */

export interface DailyProtein {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  shakePostWorkout: boolean;
  breakfastProtein: boolean;
  lunchProtein: boolean;
  dinnerProtein: boolean;
  snackProtein: boolean;
  notes: string | null;
  createdAt: string;
}

export interface ProteinSource {
  key: keyof Pick<DailyProtein, 'shakePostWorkout' | 'breakfastProtein' | 'lunchProtein' | 'dinnerProtein' | 'snackProtein'>;
  label: string;
  estimatedGrams: number;
}

export const PROTEIN_SOURCES: ProteinSource[] = [
  { key: 'shakePostWorkout', label: 'Post-workout shake', estimatedGrams: 30 },
  { key: 'breakfastProtein', label: 'Breakfast protein', estimatedGrams: 20 },
  { key: 'lunchProtein', label: 'Lunch protein', estimatedGrams: 30 },
  { key: 'dinnerProtein', label: 'Dinner protein', estimatedGrams: 30 },
  { key: 'snackProtein', label: 'Protein snack', estimatedGrams: 15 },
];

export type ProteinRating = 'great' | 'ok' | 'poor';

export function getProteinRating(count: number): { rating: ProteinRating; label: string; color: string } {
  if (count >= 4) return { rating: 'great', label: "She's building", color: 'text-green-400' };
  if (count === 3) return { rating: 'ok', label: 'Close enough', color: 'text-yellow-400' };
  return { rating: 'poor', label: 'Her glutes got nothing today', color: 'text-red-400' };
}

export function estimateGrams(protein: DailyProtein): number {
  return PROTEIN_SOURCES.reduce((sum, src) => {
    return sum + (protein[src.key] ? src.estimatedGrams : 0);
  }, 0);
}

export function countSources(protein: DailyProtein): number {
  return PROTEIN_SOURCES.filter(src => protein[src.key]).length;
}
