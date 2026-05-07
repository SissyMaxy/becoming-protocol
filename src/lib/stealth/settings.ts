import { supabase } from '../supabase';
import { DEFAULT_STEALTH_SETTINGS, StealthSettings } from './types';

export async function loadStealthSettings(userId: string): Promise<StealthSettings> {
  const { data, error } = await supabase
    .from('user_state')
    .select('stealth_settings')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[stealth] loadStealthSettings failed:', error);
    return { ...DEFAULT_STEALTH_SETTINGS };
  }
  const raw = (data as { stealth_settings?: Partial<StealthSettings> } | null)?.stealth_settings;
  return { ...DEFAULT_STEALTH_SETTINGS, ...(raw || {}) };
}

export async function saveStealthSettings(
  userId: string,
  patch: Partial<StealthSettings>,
): Promise<StealthSettings> {
  const current = await loadStealthSettings(userId);
  const next: StealthSettings = { ...current, ...patch };
  const { error } = await supabase
    .from('user_state')
    .update({ stealth_settings: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    throw new Error(`saveStealthSettings: ${error.message}`);
  }
  return next;
}
