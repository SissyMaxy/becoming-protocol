// Safeword + authority gate for the hookup-coaching system.
//
// Hard rule from the build spec: new features must respect active
// safeword events within 60 seconds. This module is the chokepoint.
//
// Two checks compose:
//   1. last meta_frame_breaks row in the last 60s   → suspend push
//   2. effective_gaslight_intensity = 'off'         → suspend escalation
//      (covers the 24h cooldown after a reveal)
//
// Plus a tiny authority-log shim — every hookup-coaching surface writes
// a row to mommy_authority_log so we can audit what Mommy ramped, when,
// and why. The log is owner-RLS readable; service-role writes.
//
// Returns a single typed result so callers can branch cleanly without
// re-deriving rules in three places.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type SafewordGateResult =
  | { allowed: true }
  | { allowed: false; reason: 'safeword_active' | 'safeword_cooldown' | 'persona_off' }

/**
 * One read, one decision. Caller bails on `allowed=false` with a
 * skipped-reason in the response — never escalates anyway, never
 * partially fires, never asks Mommy to "be careful but proceed."
 *
 * Cost: 2 queries (user_state + 1 meta_frame_breaks count).
 */
export async function checkSafewordGate(
  supabase: SupabaseClient,
  userId: string,
): Promise<SafewordGateResult> {
  // Persona must be Dommy Mommy. Any other persona → silently skip.
  // We DO NOT distort other personas with Mommy push.
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona, gaslight_cooldown_until')
    .eq('user_id', userId)
    .maybeSingle()
  const state = us as { handler_persona?: string; gaslight_cooldown_until?: string } | null
  if (state?.handler_persona !== 'dommy_mommy') {
    return { allowed: false, reason: 'persona_off' }
  }

  // 24h cooldown post-reveal — generators must read effective intensity,
  // not configured intensity. If cooldown_until > now, push is suspended.
  if (state.gaslight_cooldown_until) {
    const until = new Date(state.gaslight_cooldown_until).getTime()
    if (Number.isFinite(until) && until > Date.now()) {
      return { allowed: false, reason: 'safeword_cooldown' }
    }
  }

  // 60-second hard pause after any safeword event. Covers the case where
  // the user just safeworded and the system shouldn't immediately
  // re-engage with a Mommy push.
  const since60s = new Date(Date.now() - 60_000).toISOString()
  const { count } = await supabase
    .from('meta_frame_breaks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since60s)
  if ((count ?? 0) > 0) {
    return { allowed: false, reason: 'safeword_active' }
  }

  return { allowed: true }
}

/**
 * Append a structured row to mommy_authority_log. Caller passes:
 *   - surface: which generator wrote this (e.g. 'mommy-hookup-pressure')
 *   - action: what Mommy did ('push', 'amplify', 'celebrate', etc.)
 *   - payload: any context that's useful for the audit trail
 *
 * Best-effort: failures are logged to console but never throw — the
 * audit row is not load-bearing on the user-facing path.
 */
export async function logAuthority(
  supabase: SupabaseClient,
  userId: string,
  surface: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    // Populate BOTH mig 400 NOT NULL columns (action_kind / source_system /
    // action_summary / action_payload) AND the mig 382 short-name columns
    // (surface / action / payload) so reads can use either schema.
    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      // Main's mig 400 NOT NULL columns:
      action_kind: action,
      source_system: surface,
      action_summary: `${surface}/${action}`,
      action_payload: payload,
      // Mig 378 + 382 short-name aliases (additive):
      system: surface,
      summary: `${surface}/${action}`,
      surface,
      action,
      payload,
    })
  } catch (err) {
    console.error(`[authority-log] ${surface}/${action} insert failed:`, err)
  }
}

/**
 * Settings gate for the hookup-coaching system. Hard floor: every
 * feature defaults OFF until clear-headed setup opt-in. Per-feature
 * intensity slider lives on the same row.
 *
 * Returns the row if enabled; null if the master switch is off or the
 * specific surface is disabled. Caller bails on null.
 */
export type HookupCoachingFlag =
  | 'dares_enabled'
  | 'pressure_enabled'
  | 'amplifier_enabled'
  | 'receptive_enabled'
  | 'meet_prep_enabled'
  | 'debrief_enabled'

export interface HookupCoachingSettings {
  user_id: string
  master_enabled: boolean
  intensity_tier: number   // 1..7
  dares_enabled: boolean
  pressure_enabled: boolean
  amplifier_enabled: boolean
  receptive_enabled: boolean
  meet_prep_enabled: boolean
  debrief_enabled: boolean
  push_pace_per_week: number
}

export async function checkHookupSettings(
  supabase: SupabaseClient,
  userId: string,
  flag: HookupCoachingFlag,
): Promise<HookupCoachingSettings | null> {
  const { data } = await supabase
    .from('hookup_coaching_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  const row = data as HookupCoachingSettings | null
  if (!row) return null
  if (!row.master_enabled) return null
  if (!row[flag]) return null
  return row
}
