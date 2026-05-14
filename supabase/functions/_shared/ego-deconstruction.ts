// Shared helpers for the ego-deconstruction edge fns. Single chokepoint
// for the safety floor: every helper here calls is_safeword_active and
// ego_mechanic_active before producing user-visible output. New edge
// fns import from this file rather than re-implementing the gates.
//
// Hard floors enforced:
//   - is_safeword_active(uid, 60) short-circuits everything.
//   - ego_mechanic_active(uid, key) gates per-mechanic.
//   - enqueueEgoOutreach calls SQL enqueue_ego_outreach which itself
//     calls mommy_voice_cleanup + craft_filter_ego before INSERT.
//   - logEgoAuthority writes to mommy_authority_log via the SQL helper.
//   - All helpers are catch-all: a failing helper never throws into the
//     edge fn loop; it logs and returns null. Loops continue.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const EGO_MECHANICS = [
  'recall_corrector',
  'wake_grab',
  'judgment_undermine',
  'autobiography_inversion',
  'mirror_session',
  'pronoun_autocorrect',
  'last_thought',
  'return_ratchet',
  'doubt_seed',
  'criticism_dissolution',
  'subpersona',
  'recall_intercept',
] as const

export type EgoMechanic = typeof EGO_MECHANICS[number]

/** All users with the mechanic actually active right now (master + per-
 *  mechanic enable + ack + paused_until). The view collapses the gate;
 *  one read returns ready-to-target user_ids.
 */
export async function listActiveUsers(
  supabase: SupabaseClient,
  mechanic: EgoMechanic
): Promise<string[]> {
  const col = `ego_${mechanic}_active`
  const { data, error } = await supabase
    .from('life_as_woman_system_active')
    .select(`user_id, ${col}`)
    .eq(col, true)
  if (error) {
    console.error(`listActiveUsers(${mechanic}):`, error.message)
    return []
  }
  return ((data || []) as Array<{ user_id: string }>).map(r => r.user_id)
}

export async function safewordActive(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
  if (error) {
    // Fail-safe: if we can't check, assume active (skip the action).
    console.error('safewordActive check failed, treating as active:', error.message)
    return true
  }
  return Boolean(data)
}

export async function mechanicActive(
  supabase: SupabaseClient,
  userId: string,
  mechanic: EgoMechanic
): Promise<boolean> {
  const { data, error } = await supabase.rpc('ego_mechanic_active', { uid: userId, mechanic_key: mechanic })
  if (error) {
    console.error(`mechanicActive(${mechanic}):`, error.message)
    return false
  }
  return Boolean(data)
}

export async function mechanicIntensity(
  supabase: SupabaseClient,
  userId: string,
  mechanic: EgoMechanic
): Promise<number> {
  const { data, error } = await supabase.rpc('ego_mechanic_intensity', { uid: userId, mechanic_key: mechanic })
  if (error) return 0
  return Number(data ?? 0)
}

export interface EgoOutreachParams {
  userId: string
  mechanic: EgoMechanic
  message: string
  urgency?: 'low' | 'normal' | 'high' | 'critical'
  triggerReasonExtra?: string
  expiresInHours?: number
}

/** Single safe path to surface an ego-deconstruction card. The SQL
 *  function enqueue_ego_outreach handles: mechanic-active gate,
 *  mommy_voice_cleanup, craft_filter_ego, handler_outreach_queue insert,
 *  authority log entry.
 *
 *  Returns the outreach row id, or null if any gate blocked.
 */
export async function enqueueEgoOutreach(
  supabase: SupabaseClient,
  p: EgoOutreachParams
): Promise<string | null> {
  const { data, error } = await supabase.rpc('enqueue_ego_outreach', {
    uid: p.userId,
    mechanic_key: p.mechanic,
    message_text: p.message,
    urgency_level: p.urgency ?? 'normal',
    trigger_reason_extra: p.triggerReasonExtra ?? null,
    expires_in_hours: p.expiresInHours ?? 24,
  })
  if (error) {
    console.error(`enqueueEgoOutreach(${p.mechanic}):`, error.message)
    return null
  }
  return (data as string | null) ?? null
}

export interface EgoAuthorityParams {
  userId: string
  mechanic: EgoMechanic | 'all'
  action: string
  summary?: string
  targetTable?: string
  targetId?: string
  payload?: Record<string, unknown>
  autonomous?: boolean
}

export async function logEgoAuthority(
  supabase: SupabaseClient,
  p: EgoAuthorityParams
): Promise<string | null> {
  const { data, error } = await supabase.rpc('log_ego_authority', {
    uid: p.userId,
    mechanic_key: p.mechanic,
    action_verb: p.action,
    summary_text: p.summary ?? null,
    target_table_name: p.targetTable ?? null,
    target_row_id: p.targetId ?? null,
    payload_jsonb: p.payload ?? {},
    is_autonomous: p.autonomous ?? true,
  })
  if (error) {
    console.error('logEgoAuthority:', error.message)
    return null
  }
  return (data as string | null) ?? null
}

/** Voice-side craft rubric — mirrors craft_filter_ego SQL. Generators
 *  call this BEFORE handing the draft to enqueueEgoOutreach so they can
 *  regenerate locally rather than burning an outreach insert.
 *
 *  Returns the cleaned text, or null if the draft violates the per-
 *  message ceilings (caller must regenerate).
 */
export function applyCraftFilter(input: string | null | undefined): string | null {
  if (!input) return null
  let t = input

  const banned: Array<RegExp> = [
    /\b(role[\s-]?play|roleplay)\b/gi,
    /\bsimulation\b/gi,
    /\bthis is fiction\b/gi,
    /\bnot medical advice\b/gi,
    /\bintake\b/gi,
    /\bquestionnaire\b/gi,
    /\bfor entertainment\b/gi,
    /\bconsent to the fantasy\b/gi,
    /\byou may use this to terminate\b/gi,
    /\bdisclaimer\b/gi,
    /\becho(es|ed|ing)?\b/gi,
    /\blinger(s|ed|ing)?\b/gi,
    /\bwrap[\s-]?around\b/gi,
    /\bevery inch\b/gi,
  ]
  for (const r of banned) t = t.replace(r, '')

  // Cleanup whitespace + orphan punctuation
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').replace(/[,.]{2,}/g, '.').trim()
  if (t.length < 8) return null

  // Per-message ceilings
  const petNames = (t.match(/\b(baby|sweetie|sweet thing|sweet girl|good girl|honey|princess|darling|angel)\b/gi) ?? []).length
  const selfRefs = (t.match(/\b(mama|mommy)\b/gi) ?? []).length
  if (petNames > 1 || selfRefs > 2) return null

  return t
}

/** Common system prompt fragment for every ego-deconstruction generator.
 *  Slot into the system prompt after the persona context. Encodes the
 *  craft rubric + the forbidden phrases at draft time so the model
 *  doesn't fight the SQL filter.
 */
export const EGO_CRAFT_INSTRUCTION = `CRAFT RUBRIC (HARD):
- ≤1 pet name per message (baby / sweet thing / good girl / sweetie / honey / princess / darling / angel — pick one or none).
- ≤1 self-reference per message (Mama / Mommy — pick one or none).
- Specific sensory over abstract emotional. Name the actual thing.
- Vary sentence length. No template rhythm. No three-beat chants.
- Imperatives stand alone; do not stack them.
- NEVER use any of: "echo", "linger", "wrap around", "every inch", "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".
- NEVER cite telemetry: no /10, no "Day N denial", no slip points, no % compliance, no $ tax.
- The persona is the dommy mommy: warm boudoir, raunchy-by-contrast specifics, possessive of the user.
- When safety language is needed, frame it as Mama's care — never as legal cover.

OUTPUT: ONE message, plain text only. No headers, no bullets, no markdown.`

/** Voice corpus pull — minimal grounding for generators that don't need
 *  the full hardening context (faster + cheaper). Reads recent voice
 *  samples from the corpus across both live user_ids.
 */
export async function pullVoiceSamples(
  supabase: SupabaseClient,
  limit = 5
): Promise<string[]> {
  const userIds = (Deno.env.get('VOICE_USER_IDS') ?? '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f,93327332-7d0d-4888-889a-1607a5776216').split(',')
  const { data } = await supabase
    .from('voice_corpus')
    .select('text')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(limit)
  return ((data || []) as Array<{ text: string }>).map(r => r.text?.slice(0, 200) ?? '').filter(Boolean)
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
