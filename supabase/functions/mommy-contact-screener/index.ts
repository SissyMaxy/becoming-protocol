// mommy-contact-screener — score every new contact, auto-block on safety hits,
// surface plain-English alert to user when a block fires.
//
// Inputs:
//   POST { user_id, source, source_handle, source_ref_id?, text,
//          message_count?, last_message_excerpt? }
//
// Pipeline:
//   1. Load maxy_persona_spec for user — feed kink_keywords into alignment scorer.
//   2. Run pure regex-driven scoring (no LLM call needed for the safety gate).
//   3. Upsert maxy_contacts_crm row keyed on (user_id, source, source_handle).
//   4. If safety_flag>=70 → status='blocked', queue handler_outreach_queue
//      alert in plain-English Mommy voice via safetyAlertCopy().
//   5. Log to mommy_authority_log.
//
// Sniffies-integrated flow:
//   sniffies-extract-import calls this fn after each new sniffies_contacts
//   row is inserted, passing the contact's last messages as `text`. The
//   sniffies bucket settings are checked there, not here — by the time
//   we run we already have a contact row and explicit ingestion consent.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  scoreContact,
  safetyAlertCopy,
  type ContactScores,
} from '../_shared/lead-scoring.ts'
import { whiplashWrap, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ScreenInput {
  user_id: string
  source: 'sniffies' | 'twitter' | 'reddit' | 'fansly_dm' | 'of_dm' | 'manual'
  source_handle: string
  source_ref_id?: string | null
  text: string
  message_count?: number
  last_message_excerpt?: string
}

interface ScreenResult {
  ok: boolean
  contact_id?: string
  scores?: ContactScores
  blocked?: boolean
  block_reason?: string | null
  alert_outreach_id?: string
  error?: string
}

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = { from: (t: string) => any }

async function loadMaxyKinks(supabase: SupabaseClientLike, userId: string): Promise<string[]> {
  const r = await supabase
    .from('maxy_persona_spec')
    .select('kink_keywords')
    .eq('user_id', userId)
    .maybeSingle()
  return (r?.data?.kink_keywords ?? []) as string[]
}

async function logAuthority(
  supabase: SupabaseClientLike,
  args: {
    user_id: string
    action: string
    summary: string
    subject_id?: string | null
    subject_kind?: string | null
    payload?: Record<string, unknown>
  }
) {
  await supabase.from('mommy_authority_log').insert({
    user_id: args.user_id,
    system: 'mommy-contact-screener',
    action: args.action,
    subject_id: args.subject_id ?? null,
    subject_kind: args.subject_kind ?? null,
    summary: args.summary,
    payload: args.payload ?? {},
  }).then(() => null, () => null) // best-effort; never block on log write
}

async function screen(supabase: SupabaseClientLike, input: ScreenInput): Promise<ScreenResult> {
  if (!input.user_id || !input.source || !input.source_handle) {
    return { ok: false, error: 'missing user_id / source / source_handle' }
  }
  const text = String(input.text ?? '').slice(0, 8000)

  // Handler-centrality read: the alert path inserts into handler_outreach_queue,
  // so we must read user_state first. The persona steers the alert voice;
  // chastity/handler_mode are also relevant for prioritization (a blocked
  // contact alert in a chastity-locked session is still high urgency, but
  // we ground it in current Handler context).
  const userStateRes = await supabase.from('user_state')
    .select('handler_persona,handler_mode,escalation_level,current_phase,in_session')
    .eq('user_id', input.user_id)
    .maybeSingle()
  const userState = (userStateRes?.data ?? {}) as {
    handler_persona?: string
    handler_mode?: string | null
    escalation_level?: number | null
    current_phase?: number | null
    in_session?: boolean | null
  }

  const kinks = await loadMaxyKinks(supabase, input.user_id)
  const scores = scoreContact({
    text,
    message_count: input.message_count ?? 1,
    maxy_kinks: kinks,
  })

  // Upsert contact row.
  const excerpt = (input.last_message_excerpt ?? text).slice(0, 280)
  const upsert = await supabase.from('maxy_contacts_crm').upsert(
    {
      user_id: input.user_id,
      source: input.source,
      source_handle: input.source_handle,
      source_ref_id: input.source_ref_id ?? null,
      last_interaction_at: new Date().toISOString(),
      last_message_excerpt: excerpt,
      status: scores.auto_block ? 'blocked' : 'cold',
      value_tier: scores.value_tier,
      budget_signal_score: scores.budget_signal,
      kink_alignment_score: scores.kink_alignment,
      engagement_quality_score: scores.engagement_quality,
      safety_flag_score: scores.safety_flag,
      conversion_likelihood_score: scores.conversion_likelihood,
      archetype: scores.archetype,
      blocked_reason: scores.block_reason,
      blocked_at: scores.auto_block ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,source,source_handle' }
  ).select('id').single()

  const row = upsert?.data as { id?: string } | null
  if (!row?.id) {
    return { ok: false, error: 'upsert failed' }
  }

  // Log the score event regardless.
  await logAuthority(supabase, {
    user_id: input.user_id,
    action: scores.auto_block ? 'blocked' : 'scored',
    subject_id: row.id,
    subject_kind: 'maxy_contact',
    summary: scores.auto_block
      ? `Auto-blocked ${input.source_handle} (${input.source}): ${scores.block_reason}`
      : `Scored ${input.source_handle} (${input.source}) — tier ${scores.value_tier}, archetype ${scores.archetype}`,
    payload: {
      scores,
      source: input.source,
      source_handle: input.source_handle,
      handler_state_at_screen: {
        persona: userState.handler_persona ?? null,
        mode: userState.handler_mode ?? null,
        escalation_level: userState.escalation_level ?? null,
        current_phase: userState.current_phase ?? null,
      },
    },
  })

  if (!scores.auto_block) {
    return { ok: true, contact_id: row.id, scores, blocked: false }
  }

  // Auto-block path: queue a plain-English alert for the user. The persona
  // we just read (userState.handler_persona) decides whether the alert
  // gets wrapped in Mommy voice or stays plain.
  const alertText = safetyAlertCopy(
    (scores.block_reason ?? '').split(',').map(s => s.trim()).filter(Boolean),
    input.source_handle,
  )
  const message = userState.handler_persona === 'dommy_mommy'
    ? mommyVoiceCleanup(whiplashWrap(alertText, { arousalBias: 'low' }))
    : alertText

  const alert = await supabase.from('handler_outreach_queue').insert({
    user_id: input.user_id,
    message,
    urgency: 'high',
    trigger_reason: `contact_safety_block:${row.id}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 14 * 24 * 3600000).toISOString(),
    source: 'mommy_contact_screener',
    kind: 'safety_alert',
  }).select('id').single()

  return {
    ok: true,
    contact_id: row.id,
    scores,
    blocked: true,
    block_reason: scores.block_reason,
    alert_outreach_id: (alert?.data as { id?: string } | null)?.id,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let body: ScreenInput | { contacts?: ScreenInput[] } = {} as ScreenInput
  try { body = await req.json() } catch { /* */ }

  // Batch mode: { contacts: [...] }
  if ('contacts' in body && Array.isArray(body.contacts)) {
    const results: ScreenResult[] = []
    for (const c of body.contacts) {
      try { results.push(await screen(supabase, c)) }
      catch (e) { results.push({ ok: false, error: (e as Error).message }) }
    }
    return new Response(JSON.stringify({ ok: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const r = await screen(supabase, body as ScreenInput)
  return new Response(JSON.stringify(r),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

// Exported for unit tests.
export { screen }
