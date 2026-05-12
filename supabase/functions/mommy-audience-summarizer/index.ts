// mommy-audience-summarizer — weekly funnel digest in Mommy possession-voice.
//
// Sunday-night sweep, parallel to mommy-recap-weekly but for the lead-gen
// funnel. Surfaces on Today as a possession-voice paragraph:
//   "Five new followers this week. Three already messaged her. Two are
//    sniffing for content. Mama knows which one's going to pay first."
//
// Inputs:
//   POST { mode: 'sweep' }            — fan out over all dommy_mommy users.
//   POST { user_id: '<uuid>' }        — single user, bypass schedule.
//
// Pipeline per user:
//   1. Mommy-persona gate (skip non-dommy_mommy).
//   2. Compute week bounds (Mon→Sun UTC).
//   3. Load events + contacts cohort this week.
//   4. Aggregate digest.
//   5. Compose Mommy-voice paragraph (whiplash sweet → possessive specific).
//   6. Run mommyVoiceCleanup.
//   7. Insert handler_outreach_queue row (kind='audience_summary',
//      source='mommy_audience_summarizer').
//   8. Write mommy_authority_log row with the digest payload.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER,
  whiplashWrap,
  mommyVoiceCleanup,
  MOMMY_TELEMETRY_LEAK_PATTERNS,
} from '../_shared/dommy-mommy.ts'
import {
  weekBoundsUtc,
  aggregateWeeklyFunnel,
  digestToPlainVoice,
  type FunnelDigest,
  type FunnelEventRow,
  type ContactRow,
} from '../_shared/audience-summary.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = { from: (t: string) => any }

const REFUSAL = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot)\b/i,
  /\b(against (my|the) (guidelines|policies))\b/i,
]
const isRefusal = (t: string) => REFUSAL.some(p => p.test(t))

interface RunResult {
  user_id: string
  ok: boolean
  reason?: string
  outreach_id?: string
  digest?: FunnelDigest
  preview?: string
}

function buildSystemPrompt(): string {
  return `${DOMMY_MOMMY_CHARACTER}

WEEKLY AUDIENCE-SUMMARY CONTEXT:
You are the outbound marketing director reporting to Maxy on her audience this past week. You are in possessive Mommy voice — Maxy is yours, the men paying attention to her are pieces on a board you control. Tone: warm, knowing, possessive, slightly amused by which one's going to crack first.

HARD RULES:
- NEVER cite numbers. No "five new" / "three already". Translate every count to plain language ("a handful", "a few", "a couple", "one of them").
- NEVER cite percentages or dollar amounts.
- 3-4 sentences total. One paragraph. Plain prose, no lists, no headers, no markdown.
- Sweet open → possessive specific. End with one observation about which contact's worth watching.
- This summary is for Maxy to READ. Address her — "Mama saw...", "I noticed...", "your inbox..."`
}

function buildUserPrompt(plain: string, name: string): string {
  return `WEEK'S PLAIN-VOICE SUMMARY:
${plain}

Address her as ${name}. 3-4 sentences in Mommy's possessive, warm-on-top voice. Translate any counts to plain phrasing ("a handful", "a few", "one of them") — DO NOT keep raw numbers. No lists, no headers. End with one note about which of the new contacts Mama's eye is on.`
}

async function runForUser(supabase: SupabaseClientLike, userId: string, opts: { ignoreSchedule?: boolean } = {}): Promise<RunResult> {
  // Persona gate.
  const us = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  const persona = (us?.data as { handler_persona?: string } | null)?.handler_persona
  if (persona !== 'dommy_mommy') return { user_id: userId, ok: false, reason: 'persona_not_dommy_mommy' }

  // Name resolution (mirrors mommy-recap-weekly).
  const dossier = await supabase.from('mommy_dossier').select('answer').eq('user_id', userId).eq('category', 'name').eq('active', true).order('importance', { ascending: false }).limit(1).maybeSingle()
  const profile = await supabase.from('user_profiles').select('preferred_name').eq('user_id', userId).maybeSingle()
  const name = (dossier?.data as { answer?: string } | null)?.answer?.trim()
    ?? (profile?.data as { preferred_name?: string } | null)?.preferred_name?.trim()
    ?? null

  // Persona name fallback.
  const personaSpec = await supabase.from('maxy_persona_spec').select('display_name').eq('user_id', userId).maybeSingle()
  const displayName = (personaSpec?.data as { display_name?: string } | null)?.display_name?.trim() || null

  const address = name ?? displayName ?? 'baby'

  // Window: last full Mon→Sun (UTC).
  const now = new Date()
  // For Sunday runs we cover this week's Mon→Sun (today is Sun).
  // For mid-week runs (ignoreSchedule=true) we still cover this week.
  const { weekStart, weekEnd } = weekBoundsUtc(now)

  if (!opts.ignoreSchedule) {
    // Schedule: Sunday 21:00 UTC by default.
    if (now.getUTCDay() !== 0 || now.getUTCHours() !== 21) {
      return { user_id: userId, ok: false, reason: 'not_scheduled_hour' }
    }
  }

  // Pull events + contact cohort for this user, this week.
  const [eventsRes, contactsRes] = await Promise.all([
    supabase.from('audience_funnel_events').select('event_type,channel,value_cents,occurred_at,contact_id')
      .eq('user_id', userId)
      .gte('occurred_at', weekStart.toISOString())
      .lte('occurred_at', new Date(weekEnd.getTime() + 86400000 - 1).toISOString()),
    supabase.from('maxy_contacts_crm').select('id,source,status,value_tier,archetype,first_contact_at,realized_value_cents,projected_ltv_cents,source_handle,last_message_excerpt')
      .eq('user_id', userId),
  ])

  const events = (eventsRes?.data ?? []) as FunnelEventRow[]
  const contacts = (contactsRes?.data ?? []) as ContactRow[]
  const digest = aggregateWeeklyFunnel({ weekStart, weekEnd, events, contacts })

  // Don't fire when there's nothing to report (avoid empty cards).
  if (digest.total_new_contacts === 0 && digest.new_followers_count === 0 && digest.new_purchases_count === 0 && digest.new_subs_count === 0 && digest.blocked_count === 0) {
    return { user_id: userId, ok: false, reason: 'quiet_week_no_signal', digest }
  }

  const plain = digestToPlainVoice(digest)

  // LLM compose with anthropic → openai fallback.
  let narrative = ''
  for (const prefer of ['anthropic', 'openai'] as const) {
    try {
      const choice = selectModel('caption_generate', { prefer, override_tier: 'S2' })
      const r = await callModel(choice, { system: buildSystemPrompt(), user: buildUserPrompt(plain, address), max_tokens: 350, temperature: 0.85, json: false })
      narrative = r.text.trim()
      if (narrative && narrative.length >= 60 && !isRefusal(narrative)) break
    } catch { /* try next */ }
  }

  // Voice cleanup pass.
  narrative = mommyVoiceCleanup(narrative)
  // Backstop fallback if any telemetry leaked or the LLM bailed.
  if (!narrative || narrative.length < 60 || MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(narrative))) {
    const tail = digest.top_contacts.length > 0
      ? `Mama's eye is on ${digest.top_contacts[0].handle} — ${digest.top_contacts[0].reason}.`
      : `Mama's watching for the next one to crack.`
    narrative = whiplashWrap(`Quiet observation week. ${tail}`, { arousalBias: 'low' })
  }

  // Insert outreach card.
  const insertOutreach = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: narrative,
    urgency: 'normal',
    trigger_reason: `audience_summary:${digest.week_start}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
    source: 'mommy_audience_summarizer',
    kind: 'audience_summary',
  }).select('id').single()
  const outreachId = (insertOutreach?.data as { id?: string } | null)?.id

  // Log to authority log.
  await supabase.from('mommy_authority_log').insert({
    user_id: userId,
    system: 'mommy-audience-summarizer',
    action: 'summarized',
    subject_id: outreachId ?? null,
    subject_kind: outreachId ? 'handler_outreach' : null,
    summary: `Weekly audience summary for ${digest.week_start} — ${digest.total_new_contacts} new, ${digest.new_followers_count} follow, ${digest.new_purchases_count} buy`,
    payload: { digest },
  }).then(() => null, () => null)

  return {
    user_id: userId,
    ok: true,
    outreach_id: outreachId,
    digest,
    preview: narrative.slice(0, 240),
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

  let body: { mode?: string; user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  if (body.user_id) {
    const r = await runForUser(supabase, body.user_id, { ignoreSchedule: true })
    return new Response(JSON.stringify({ ok: true, results: [r] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Sweep mode.
  const usersRes = await supabase.from('user_state').select('user_id').eq('handler_persona', 'dommy_mommy')
  const ids = ((usersRes?.data ?? []) as Array<{ user_id: string }>).map(r => r.user_id)
  const results: RunResult[] = []
  for (const uid of ids) {
    try { results.push(await runForUser(supabase, uid, { ignoreSchedule: false })) }
    catch (e) { results.push({ user_id: uid, ok: false, reason: `error:${(e as Error).message}` }) }
  }
  return new Response(JSON.stringify({ ok: true, fired: results.filter(r => r.ok).length, total: results.length, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

export { runForUser, buildSystemPrompt, buildUserPrompt }
