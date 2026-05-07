/**
 * Node-side helper for the user_alias bridge (migration 281).
 *
 * Mirrors supabase/functions/_shared/expand-user-id.ts but for Node
 * scripts (auto-poster, scripts/mommy/*). Falls back to env-var lists
 * when the RPC is unreachable so existing deployments don't break before
 * every reader is migrated.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const cache = new Map<string, { ids: string[]; at: number }>();
const TTL_MS = 60_000;

export async function expandUserId(
  supabase: SupabaseClient,
  userId: string,
  envFallbackName: string = 'VOICE_USER_IDS',
): Promise<string[]> {
  if (!userId) return [];
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ids;

  try {
    const { data, error } = await supabase.rpc('expand_user_id', { target_user: userId });
    if (error) throw error;
    const ids = (Array.isArray(data) ? data : []).filter(Boolean) as string[];
    if (ids.length > 0) {
      cache.set(userId, { ids, at: Date.now() });
      return ids;
    }
  } catch (err) {
    console.warn('[expand-user-id] RPC failed, falling back to env:', String(err).slice(0, 120));
  }

  const envVal = process.env[envFallbackName] ?? '';
  const envIds = envVal.split(',').map(s => s.trim()).filter(Boolean);
  const ids = Array.from(new Set([userId, ...envIds]));
  cache.set(userId, { ids, at: Date.now() });
  return ids;
}

export function clearExpandCache() { cache.clear(); }
