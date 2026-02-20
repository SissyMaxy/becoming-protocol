/**
 * Protein tracking — DB operations for daily protein checkboxes.
 */

import { supabase } from './supabase';
import type { DailyProtein } from '../types/protein';

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
  fields: Partial<Pick<DailyProtein, 'shakePostWorkout' | 'breakfastProtein' | 'lunchProtein' | 'dinnerProtein' | 'snackProtein' | 'notes'>>
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
  key: 'shakePostWorkout' | 'breakfastProtein' | 'lunchProtein' | 'dinnerProtein' | 'snackProtein',
  value: boolean
): Promise<DailyProtein | null> {
  return saveProtein(userId, { [key]: value });
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
