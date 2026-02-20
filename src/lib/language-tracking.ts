/**
 * Language Tracking
 *
 * Persists daily masculine/feminine reference counts to Supabase.
 * Handler-internal — never shown to user directly.
 */

import { supabase } from './supabase';

export interface DailyLanguageStats {
  date: string;
  masculine_count: number;
  feminine_count: number;
  self_corrections: number;
  handler_corrections: number;
  feminine_ratio: number | null;
}

/** Get or create today's language tracking row */
export async function getTodayStats(userId: string): Promise<DailyLanguageStats> {
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('language_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (data) {
    return {
      date: data.date,
      masculine_count: data.masculine_count,
      feminine_count: data.feminine_count,
      self_corrections: data.self_corrections,
      handler_corrections: data.handler_corrections,
      feminine_ratio: data.feminine_ratio,
    };
  }

  // Create today's row
  const { data: created } = await supabase
    .from('language_tracking')
    .insert({ user_id: userId, date: today })
    .select()
    .single();

  return {
    date: today,
    masculine_count: created?.masculine_count ?? 0,
    feminine_count: created?.feminine_count ?? 0,
    self_corrections: created?.self_corrections ?? 0,
    handler_corrections: created?.handler_corrections ?? 0,
    feminine_ratio: null,
  };
}

/** Increment counts from a text submission analysis */
export async function recordLanguageUsage(
  userId: string,
  masculineCount: number,
  feminineCount: number,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const total = masculineCount + feminineCount;
  const ratio = total > 0 ? feminineCount / total : null;

  // Upsert: increment existing counts
  const { data: existing } = await supabase
    .from('language_tracking')
    .select('masculine_count, feminine_count')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    const newMasc = existing.masculine_count + masculineCount;
    const newFem = existing.feminine_count + feminineCount;
    const newTotal = newMasc + newFem;

    await supabase
      .from('language_tracking')
      .update({
        masculine_count: newMasc,
        feminine_count: newFem,
        feminine_ratio: newTotal > 0 ? newFem / newTotal : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('date', today);
  } else {
    await supabase.from('language_tracking').insert({
      user_id: userId,
      date: today,
      masculine_count: masculineCount,
      feminine_count: feminineCount,
      feminine_ratio: ratio,
    });
  }
}

/** Record a self-correction (user typed masculine then changed to feminine) */
export async function recordSelfCorrection(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('language_tracking')
    .select('self_corrections')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    await supabase
      .from('language_tracking')
      .update({
        self_corrections: existing.self_corrections + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('date', today);
  } else {
    await supabase.from('language_tracking').insert({
      user_id: userId,
      date: today,
      self_corrections: 1,
    });
  }
}

/** Record a Handler correction */
export async function recordHandlerCorrection(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('language_tracking')
    .select('handler_corrections')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    await supabase
      .from('language_tracking')
      .update({
        handler_corrections: existing.handler_corrections + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('date', today);
  } else {
    await supabase.from('language_tracking').insert({
      user_id: userId,
      date: today,
      handler_corrections: 1,
    });
  }
}

/** Get recent language stats (last N days) */
export async function getRecentStats(userId: string, days: number = 7): Promise<DailyLanguageStats[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('language_tracking')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false });

  return (data || []).map(row => ({
    date: row.date,
    masculine_count: row.masculine_count,
    feminine_count: row.feminine_count,
    self_corrections: row.self_corrections,
    handler_corrections: row.handler_corrections,
    feminine_ratio: row.feminine_ratio,
  }));
}
