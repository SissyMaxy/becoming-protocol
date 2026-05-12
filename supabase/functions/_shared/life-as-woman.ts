// Shared helpers for the "life as a woman" edge fns (sniffies outbound,
// hypno trance, gooning, content editor). Every edge fn in the wave reads
// from life_as_woman_settings + checks safeword + persona, and writes to
// mommy_authority_log on success. Centralized here so the gate logic
// stays consistent across surfaces.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type SystemKey =
  | 'sniffies_outbound'
  | 'hypno_trance'
  | 'gooning'
  | 'chastity_v2'
  | 'kink_curriculum'
  | 'content_editor'
  | 'content_prompter'
  | 'cross_platform'

export interface SystemActiveRow {
  user_id: string
  master_enabled: boolean
  sniffies_outbound_active: boolean
  hypno_trance_active: boolean
  gooning_active: boolean
  chastity_v2_active: boolean
  kink_curriculum_active: boolean
  content_editor_active: boolean
  cross_platform_active: boolean
  sniffies_outbound_intensity: number
  hypno_trance_intensity: number
  gooning_intensity: number
  kink_curriculum_intensity: number
  content_editor_intensity: number
  hypno_visual_enabled: boolean
  hypno_wake_bridge_enabled: boolean
}

export interface GateResult {
  ok: boolean
  reason?: string
  system?: SystemActiveRow
  intensity?: number
}

/**
 * Run the standard gate stack for life-as-woman edge fns.
 *   1. persona = 'dommy_mommy'
 *   2. life_as_woman_settings.master_enabled = true
 *   3. life_as_woman_settings.<system>_enabled = true
 *   4. is_safeword_active(uid, 60) = false
 * Returns { ok: true, system, intensity } on pass; { ok: false, reason } otherwise.
 */
export async function gateLifeAsWoman(
  supabase: SupabaseClient,
  userId: string,
  system: SystemKey,
  opts?: { force?: boolean },
): Promise<GateResult> {
  // 1. Persona
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona')
    .eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return { ok: false, reason: 'persona_not_dommy_mommy' }
  }

  // 2 + 3. Settings via view
  const { data: row } = await supabase.from('life_as_woman_system_active')
    .select('*')
    .eq('user_id', userId).maybeSingle()
  const systemRow = row as SystemActiveRow | null
  if (!systemRow) return { ok: false, reason: 'no_settings_row' }
  if (!systemRow.master_enabled && !opts?.force) {
    return { ok: false, reason: 'master_off' }
  }
  const activeKey = `${system}_active` as keyof SystemActiveRow
  if (!systemRow[activeKey] && !opts?.force) {
    return { ok: false, reason: `${system}_off` }
  }

  // 4. Safeword — non-bypassable, even by force
  const { data: sw } = await supabase.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
  if (sw === true) return { ok: false, reason: 'safeword_active' }

  const intensityKey = `${system}_intensity` as keyof SystemActiveRow
  const intensity = (systemRow[intensityKey] as number) ?? 2
  return { ok: true, system: systemRow, intensity }
}

/**
 * Log a Mommy action to mommy_authority_log. Best-effort; logging failures
 * never block the action.
 *
 * Populates BOTH the legacy NOT NULL columns (action_kind, source_system,
 * action_summary, action_payload from mig 400) AND the life-as-woman short-
 * name aliases (surface, action, target_table, target_id, summary, payload,
 * autonomous added by mig 378 + 384). Otherwise the insert would fail the
 * NOT NULL constraints on the legacy columns.
 */
export async function logAuthority(
  supabase: SupabaseClient,
  args: {
    user_id: string
    surface: string
    action: string
    target_table?: string
    target_id?: string
    summary?: string
    payload?: Record<string, unknown>
    autonomous?: boolean
  },
): Promise<void> {
  try {
    const summary = args.summary ?? `${args.surface}:${args.action}`
    const payload = args.payload ?? {}
    await supabase.from('mommy_authority_log').insert({
      user_id: args.user_id,
      // ── Legacy mig-400 columns (NOT NULL) — derive from new fields. ──
      action_kind: args.action,
      source_system: args.surface,
      action_summary: summary,
      action_payload: payload,
      // ── New life-as-woman short-name columns (mig 378 + 384) ────────
      surface: args.surface,
      action: args.action,
      target_table: args.target_table ?? null,
      target_id: args.target_id ?? null,
      system: args.surface,
      summary,
      payload,
      autonomous: args.autonomous ?? true,
    })
  } catch (_) { /* log failures are non-fatal */ }
}

/**
 * Standard CORS + JSON helpers for edge fns.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function makeClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

/** Refusal-pattern detector — copied from mommy-prescribe for consistency. */
export function isRefusal(t: string): boolean {
  const REFUSAL_PATTERNS = [
    /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
    /\b(against (my|the) (guidelines|policies|rules))\b/i,
  ]
  return REFUSAL_PATTERNS.some(p => p.test(t))
}

/** Forbidden-phrase scrub — voice anchor for the wave. */
const FORBIDDEN_VOICE_PATTERNS: RegExp[] = [
  /\brole[\s\-]?play\b/i,
  /\bsimulation\b/i,
  /\bthis is fiction\b/i,
  /\bnot medical advice\b/i,
  /\bdisclaimer\b/i,
  /\bfor entertainment\b/i,
  /\bconsent to (the )?fantasy\b/i,
  /\byou may use this to terminate\b/i,
  /\bquestionnaire\b/i,
  /\bintake\b/i,
]

export function hasForbiddenVoice(t: string): boolean {
  return FORBIDDEN_VOICE_PATTERNS.some(p => p.test(t))
}
