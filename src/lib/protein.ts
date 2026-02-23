/**
 * Protein tracking — DB operations for daily protein checkboxes,
 * gram adjustments, and supplement tracking.
 */

import { supabase } from './supabase';
import type { DailyProtein, GramLevel, ProteinSourceKey, SupplementKey } from '../types/protein';

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function rowToProtein(row: Record<string, unknown>): DailyProtein {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    date: row.date as string,
    shakePostWorkout: row.shake_post_workout as boolean,
    breakfastProtein: row.breakfast_protein as boolean,
    lunchProtein: row.lunch_protein as boolean,
    dinnerProtein: row.dinner_protein as boolean,
    snackProtein: row.snack_protein as boolean,
    gramAdjustments: (row.gram_adjustments as Record<string, GramLevel>) || {},
    supplementProtein: (row.supplement_protein as boolean) || false,
    supplementCreatine: (row.supplement_creatine as boolean) || false,
    supplementCollagen: (row.supplement_collagen as boolean) || false,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
  };
}

/** Get today's protein entry, or null if none. */
export async function getTodayProtein(userId: string): Promise<DailyProtein | null> {
  const { data, error } = await supabase
    .from('daily_protein')
    .select('*')
    .eq('user_id', userId)
    .eq('date', getTodayStr())
    .maybeSingle();

  if (error || !data) return null;
  return rowToProtein(data);
}

/** Upsert today's protein entry. */
export async function saveProtein(
  userId: string,
  fields: Partial<Pick<DailyProtein,
    'shakePostWorkout' | 'breakfastProtein' | 'lunchProtein' | 'dinnerProtein' | 'snackProtein' |
    'gramAdjustments' | 'supplementProtein' | 'supplementCreatine' | 'supplementCollagen' | 'notes'
  >>
): Promise<DailyProtein | null> {
  const today = getTodayStr();

  const row: Record<string, unknown> = {
    user_id: userId,
    date: today,
  };
  if (fields.shakePostWorkout !== undefined) row.shake_post_workout = fields.shakePostWorkout;
  if (fields.breakfastProtein !== undefined) row.breakfast_protein = fields.breakfastProtein;
  if (fields.lunchProtein !== undefined) row.lunch_protein = fields.lunchProtein;
  if (fields.dinnerProtein !== undefined) row.dinner_protein = fields.dinnerProtein;
  if (fields.snackProtein !== undefined) row.snack_protein = fields.snackProtein;
  if (fields.gramAdjustments !== undefined) row.gram_adjustments = fields.gramAdjustments;
  if (fields.supplementProtein !== undefined) row.supplement_protein = fields.supplementProtein;
  if (fields.supplementCreatine !== undefined) row.supplement_creatine = fields.supplementCreatine;
  if (fields.supplementCollagen !== undefined) row.supplement_collagen = fields.supplementCollagen;
  if (fields.notes !== undefined) row.notes = fields.notes;

  const { data, error } = await supabase
    .from('daily_protein')
    .upsert(row, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error || !data) return null;
  return rowToProtein(data);
}

/** Toggle a single protein source for today. Creates entry if needed. */
export async function toggleProteinSource(
  userId: string,
  key: ProteinSourceKey,
  value: boolean
): Promise<DailyProtein | null> {
  return saveProtein(userId, { [key]: value });
}

/** Toggle a supplement checkbox for today. */
export async function toggleSupplement(
  userId: string,
  key: SupplementKey,
  value: boolean
): Promise<DailyProtein | null> {
  return saveProtein(userId, { [key]: value });
}

/** Set gram adjustment level for a protein source. */
export async function setGramLevel(
  userId: string,
  sourceKey: ProteinSourceKey,
  level: GramLevel
): Promise<DailyProtein | null> {
  // Read current adjustments, then merge
  const current = await getTodayProtein(userId);
  const adjustments = { ...(current?.gramAdjustments || {}), [sourceKey]: level };
  return saveProtein(userId, { gramAdjustments: adjustments });
}

/** Get last N days of protein data for trend chart. */
export async function getProteinHistory(userId: string, days: number = 7): Promise<DailyProtein[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));

  const { data, error } = await supabase
    .from('daily_protein')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate.toISOString().slice(0, 10))
    .order('date', { ascending: true });

  if (error || !data) return [];
  return data.map(rowToProtein);
}
