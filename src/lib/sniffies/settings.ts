import { supabase } from '../supabase';
import { DEFAULT_SNIFFIES_SETTINGS, SniffiesSettings } from './types';

export async function loadSniffiesSettings(userId: string): Promise<SniffiesSettings> {
  const { data, error } = await supabase
    .from('sniffies_settings')
    .select('sniffies_integration_enabled, persona_use_enabled, dares_use_enabled, slip_use_enabled, auto_react_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[sniffies] loadSniffiesSettings failed:', error);
    return { ...DEFAULT_SNIFFIES_SETTINGS };
  }
  if (!data) return { ...DEFAULT_SNIFFIES_SETTINGS };
  const row = data as Record<string, unknown>;
  return {
    sniffies_integration_enabled: !!row.sniffies_integration_enabled,
    persona_use_enabled: !!row.persona_use_enabled,
    dares_use_enabled: !!row.dares_use_enabled,
    slip_use_enabled: !!row.slip_use_enabled,
    // Default TRUE when the column is missing/null (legacy rows + migration 367 backfill).
    auto_react_enabled: row.auto_react_enabled === null || row.auto_react_enabled === undefined
      ? true
      : !!row.auto_react_enabled,
  };
}

export async function saveSniffiesSettings(
  userId: string,
  patch: Partial<SniffiesSettings>,
): Promise<SniffiesSettings> {
  const current = await loadSniffiesSettings(userId);
  const next: SniffiesSettings = { ...current, ...patch };

  // Master switch enforcement: when sniffies_integration_enabled goes
  // false, the granular flags don't matter, but we keep the user's
  // previous granular preferences so re-enabling doesn't reset them.
  // The persona surfaces always re-check the master switch first.

  const { error } = await supabase
    .from('sniffies_settings')
    .upsert(
      { user_id: userId, ...next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    throw new Error(`saveSniffiesSettings: ${error.message}`);
  }
  return next;
}
