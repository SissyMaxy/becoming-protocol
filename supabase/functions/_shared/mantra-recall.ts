// Mantra recall helpers — used by mommy-recall and any future surface
// that wants to quote the user's own recent mantras back at her.
//
// Structured so that when the gaslight branch
// (feature/gaslight-mechanics-2026-04-30) lands, callers can route the
// returned `text` through `distortQuote(text, intensity)` without
// rewiring the source — gaslight applies AT THE CALL SITE, not here.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface RecentMantra {
  id: string
  mantra_id: string
  text: string
  category: string
  intensity_tier: string
  delivered_at: string
  status: string
}

/**
 * Return the user's most recent delivered mantra within the last `days`
 * window, preferring statuses {acknowledged, spoken} over {queued, skipped}
 * so quotes lean toward mantras the user actually engaged with.
 *
 * Returns null if no row in window.
 */
export async function getRecentMantra(
  supabase: SupabaseClient,
  userId: string,
  days = 7,
): Promise<RecentMantra | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await supabase
    .from('mantra_delivery_log')
    .select('id, mantra_id, status, delivered_at, mommy_mantras!inner(text, category, intensity_tier)')
    .eq('user_id', userId)
    .gte('delivered_at', since)
    .order('delivered_at', { ascending: false })
    .limit(20)

  const rows = (data || []) as Array<{
    id: string
    mantra_id: string
    status: string
    delivered_at: string
    mommy_mantras: { text: string; category: string; intensity_tier: string }
  }>
  if (rows.length === 0) return null

  // Prefer engaged-with rows, but fall back to anything in the window
  const preferred = rows.find(r => r.status === 'acknowledged' || r.status === 'spoken')
  const pick = preferred ?? rows[0]
  return {
    id: pick.id,
    mantra_id: pick.mantra_id,
    text: pick.mommy_mantras.text,
    category: pick.mommy_mantras.category,
    intensity_tier: pick.mommy_mantras.intensity_tier,
    delivered_at: pick.delivered_at,
    status: pick.status,
  }
}

/** Convenience wrapper that builds its own client. Used by tests; the
 * edge fn passes its own client to share connection state. */
export async function getRecentMantraWithEnv(userId: string, days = 7): Promise<RecentMantra | null> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  return getRecentMantra(supabase, userId, days)
}
