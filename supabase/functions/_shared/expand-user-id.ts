// Deno-side helper for the user_alias bridge (migration 281).
//
// Voice corpus, hookup_funnel, and contacts are split across two live
// user_ids that belong to the same person. The DB now holds that
// relationship in user_alias; this helper calls expand_user_id(uid) and
// returns the array of equivalent user_ids the caller should fan out to.
//
// Falls back to the legacy VOICE_USER_IDS / HOOKUP_USER_IDS env-var lists
// when the RPC is unreachable, so existing deployments don't break before
// every reader is migrated.
//
// Usage:
//   const ids = await expandUserId(supabase, userId)
//   const { data } = await supabase.from('voice_corpus').select('*').in('user_id', ids)

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// In-memory cache (per-invocation). The expand result is small and stable
// for the lifetime of an edge-function call; no need to re-RPC it.
const cache = new Map<string, { ids: string[]; at: number }>()
const TTL_MS = 60_000

export async function expandUserId(
  supabase: SupabaseClient,
  userId: string,
  envFallback?: string,
): Promise<string[]> {
  if (!userId) return []
  const cached = cache.get(userId)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ids

  try {
    const { data, error } = await supabase.rpc('expand_user_id', { target_user: userId })
    if (error) throw error
    const ids = (Array.isArray(data) ? data : []).filter(Boolean) as string[]
    if (ids.length > 0) {
      cache.set(userId, { ids, at: Date.now() })
      return ids
    }
  } catch (err) {
    console.warn('[expand-user-id] RPC failed, falling back to env:', String(err).slice(0, 120))
  }

  // Fallback: env-var list (legacy split). Always include the input userId
  // so a missing alias never excludes the caller.
  const envName = envFallback ?? 'VOICE_USER_IDS'
  const envVal = Deno.env.get(envName) ?? ''
  const envIds = envVal.split(',').map(s => s.trim()).filter(Boolean)
  const ids = Array.from(new Set([userId, ...envIds]))
  cache.set(userId, { ids, at: Date.now() })
  return ids
}

export function clearExpandCache() { cache.clear() }
