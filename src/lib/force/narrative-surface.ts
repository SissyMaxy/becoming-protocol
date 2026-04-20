/**
 * Narrative Surface Helpers
 *
 * UI components should call these to get "display text" for journal entries,
 * timeline events, photo captions, etc. When overwrite is active, returns the
 * Maxy reading; otherwise returns the original.
 */

import { supabase } from '../supabase';

export interface DisplayText {
  text: string;
  isReading: boolean;
  originalAvailable: boolean;
  readingId?: string;
  davidEra?: boolean;
}

let overwriteCache: { userId: string; active: boolean; checkedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000;

export async function isOverwriteActive(userId: string): Promise<boolean> {
  if (overwriteCache && overwriteCache.userId === userId && Date.now() - overwriteCache.checkedAt < CACHE_TTL_MS) {
    return overwriteCache.active;
  }
  const { data } = await supabase
    .from('user_state')
    .select('narrative_overwrite_active')
    .eq('user_id', userId)
    .maybeSingle();
  const active = Boolean(data?.narrative_overwrite_active);
  overwriteCache = { userId, active, checkedAt: Date.now() };
  return active;
}

export function invalidateOverwriteCache(): void {
  overwriteCache = null;
}

/**
 * Get display text for a single item. If overwrite is on and a reading exists,
 * returns the reading; otherwise returns the original.
 */
export async function getDisplayText(
  userId: string,
  sourceTable: string,
  sourceId: string,
  originalText: string,
): Promise<DisplayText> {
  const active = await isOverwriteActive(userId);
  if (!active) {
    return { text: originalText, isReading: false, originalAvailable: true };
  }

  const { data } = await supabase
    .from('maxy_readings')
    .select('id, maxy_reading, david_era')
    .eq('user_id', userId)
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .maybeSingle();

  if (!data?.maxy_reading) {
    return { text: originalText, isReading: false, originalAvailable: true };
  }

  return {
    text: data.maxy_reading as string,
    isReading: true,
    originalAvailable: true,
    readingId: data.id as string,
    davidEra: Boolean(data.david_era),
  };
}

/**
 * Batch version — one query for many items.
 */
export async function getDisplayTextBatch(
  userId: string,
  items: Array<{ sourceTable: string; sourceId: string; originalText: string }>,
): Promise<Map<string, DisplayText>> {
  const out = new Map<string, DisplayText>();
  const active = await isOverwriteActive(userId);

  if (!active) {
    for (const item of items) {
      out.set(`${item.sourceTable}:${item.sourceId}`, {
        text: item.originalText,
        isReading: false,
        originalAvailable: true,
      });
    }
    return out;
  }

  const ids = items.map(i => i.sourceId);
  const { data } = await supabase
    .from('maxy_readings')
    .select('id, source_table, source_id, maxy_reading, david_era')
    .eq('user_id', userId)
    .in('source_id', ids);

  const readings = new Map<string, Record<string, unknown>>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    readings.set(`${r.source_table}:${r.source_id}`, r);
  }

  for (const item of items) {
    const key = `${item.sourceTable}:${item.sourceId}`;
    const r = readings.get(key);
    if (r) {
      out.set(key, {
        text: r.maxy_reading as string,
        isReading: true,
        originalAvailable: true,
        readingId: r.id as string,
        davidEra: Boolean(r.david_era),
      });
    } else {
      out.set(key, {
        text: item.originalText,
        isReading: false,
        originalAvailable: true,
      });
    }
  }

  return out;
}
