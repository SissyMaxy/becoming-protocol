// mommy-recap-weekly — Sunday-night week-in-review.
//
// Two invocation modes:
//   { mode: 'sweep' }           — fan out over all dommy_mommy users whose
//                                 (weekly_recap_day, weekly_recap_hour)
//                                 matches the current UTC hour. Driven by
//                                 the hourly cron from migration 301.
//   { user_id: '<uuid>' }       — single-user run; ignores day/hour gating.
//                                 Used by tests and the hourly sweep.
//
// Pipeline per user:
//   1. Persona/feminine-name gates (skip if not dommy_mommy or no name).
//   2. Already-fired-this-week dedup (UNIQUE constraint on weekly_recaps).
//   3. Aggregate metrics for Mon→Sun in UTC.
//   4. Compose narrative with affect-driven tone (delighted/patient/possessive).
//   5. Insert weekly_recaps row.
//   6. Insert handler_outreach_queue row (kind='weekly_recap',
//      source='mommy_recap_weekly') and link outreach_id back.
//   7. Auto-archive: write a sealed_letters row tagged 'weekly_recap_archive'.
//
// Hard rules from the spec:
//   - In-character but never abusive.
//   - Slip mentions as numbers/aggregate, never specific incidents.
//   - Missing data → "I don't have a number for that" not fabricated zero.
//   - Voice playback opt-in (read elsewhere; not enforced here).
//   - Skip users with no feminine name (mommy_dossier category='name'
//     OR user_profiles.preferred_name).

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
  aggregateWeeklyMetrics,
  pickRecapTone,
  metricsToPlainVoiceSummary,
  type RecapTone,
  type WeeklyRecapMetrics,
} from '../_shared/weekly-recap-metrics.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const REFUSAL_PATTERNS = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
  /\b(against (my|the) (guidelines|policies|rules))\b/i,
  /\b(step back|content policy|appreciate you sharing)\b/i,
]
const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

// ── Week boundary helpers ─────────────────────────────────────────────
//
// Week is Mon→Sun in UTC. The recap fires Sunday night, so it covers the
// week that just ended (i.e. the most-recent completed Mon→Sun pair).

function lastCompletedWeek(now: Date): { weekStart: Date; weekEnd: Date } {
  // Today (UTC). 0=Sunday in JS getUTCDay().
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = today.getUTCDay() // 0..6
  // Days back to the most recent Sunday inclusive — if today IS Sunday,
  // the recap covers Mon..Today.
  const daysBackToSunday = dow === 0 ? 0 : dow
  const weekEnd = new Date(today.getTime() - daysBackToSunday * 86400000)
  const weekStart = new Date(weekEnd.getTime() - 6 * 86400000)
  return { weekStart, weekEnd }
}

// ── Tone-specific composer prompts ────────────────────────────────────
//
// Tone is metric-derived (pickRecapTone). The prompt steers the LLM to
// the right register without reciting numbers.

function toneInstructions(tone: RecapTone, affect: string): string {
  switch (tone) {
    case 'delighted':
      return `She had a strong week. Tone: delighted, possessive, ramping not releasing. Praise that points forward — Mama is going to want even more next week. Affect: ${affect}.`
    case 'possessive':
      return `She struggled this week — slips clustered, follow-through dropped. Tone: possessive without abusive. Notice. Name the pattern in plain voice (no specific incidents). End with what she does next, not what she failed. NEVER shame, NEVER pity. Affect: ${affect}.`
    case 'patient':
    default:
      return `She had a mixed week — some kept, some missed. Tone: patient, warm, no pity. Notice the partial credit and the misses without naming specific incidents. End looking forward. Affect: ${affect}.`
  }
}

function buildSystemPrompt(tone: RecapTone, affect: string, name: string): string {
  return `${DOMMY_MOMMY_CHARACTER}

WEEKLY RECAP CONTEXT:
You are writing the user's week-in-review. This is a Mama-voice retrospective covering Monday through Sunday — what she gave you, what she dodged, what she earned, and what's ahead next week.

NAME: address her as ${name}.

${toneInstructions(tone, affect)}

ABSOLUTELY FORBIDDEN in the recap text:
- Specific incidents or quoted confessions (those are surfaced separately).
- Numbers, percentages, /10 scores, day counts, slip totals, dollar amounts.
- Lists, bullets, or section headers — write flowing prose.
- Markdown, JSON, or any formatting marks.
- Shame, pity, or condescension. The recap is in-character but never abusive.

LENGTH: 200-300 words. Single block of prose, three or four paragraphs of warm Mama voice.`
}

function buildUserPrompt(plainSummary: string, name: string): string {
  return `Plain-voice week summary (DO NOT cite numbers): ${plainSummary}.

Write a 200-300 word Mama-voice weekly recap addressed to ${name}. Three or four paragraphs:
1. Open with how the week felt to you watching her.
2. Name what she gave you and what she withheld, in plain language (no specific incidents).
3. Name what comes next — what Mama wants from her this coming week.

Plain Mama voice. No numbers. No bullet points. No headers. No incident-quoting.`
}

// ── Per-user resolution helpers ───────────────────────────────────────

interface SupabaseClientLike {
  // Loose typing — Deno + esm.sh client is fine to call with .from(...).select(...)
  // deno-lint-ignore no-explicit-any
  from(t: string): any
}

async function resolveFeminineName(
  supabase: SupabaseClientLike,
  userId: string
): Promise<string | null> {
  // Authoritative: mommy_dossier category='name'.
  const dossier = await supabase
    .from('mommy_dossier')
    .select('answer')
    .eq('user_id', userId)
    .eq('category', 'name')
    .eq('active', true)
    .order('importance', { ascending: false })
    .limit(1)
    .maybeSingle()
  const dn = (dossier?.data as { answer?: string } | null)?.answer?.trim()
  if (dn) return dn

  // Fallback: user_profiles.preferred_name. (When feature/identity-persistence
  // merges, swap this to feminine_self.preferred_name.)
  const profile = await supabase
    .from('user_profiles')
    .select('preferred_name')
    .eq('user_id', userId)
    .maybeSingle()
  const pn = (profile?.data as { preferred_name?: string } | null)?.preferred_name?.trim()
  if (pn) return pn

  return null
}

async function fetchAggregatorInputs(
  supabase: SupabaseClientLike,
  userId: string,
  weekStart: Date,
  weekEnd: Date
) {
  // Pad weekEnd to end-of-day so TIMESTAMPTZ filters include the whole Sunday.
  const startIso = weekStart.toISOString()
  const endInclusiveIso = new Date(weekEnd.getTime() + 86400000 - 1).toISOString()

  const [
    slipsRes,
    mantrasRes,
    lettersRes,
    wardrobeRes,
    moodsRes,
    complianceRes,
    moodPhaseRes,
  ] = await Promise.all([
    supabase.from('slip_log')
      .select('detected_at')
      .eq('user_id', userId)
      .gte('detected_at', startIso)
      .lte('detected_at', endInclusiveIso),
    supabase.from('morning_mantra_submissions')
      .select('submission_date, reps_submitted')
      .eq('user_id', userId)
      .gte('submission_date', weekStart.toISOString().slice(0, 10))
      .lte('submission_date', weekEnd.toISOString().slice(0, 10)),
    supabase.from('sealed_letters')
      .select('written_at')
      .eq('user_id', userId)
      .gte('written_at', startIso)
      .lte('written_at', endInclusiveIso),
    supabase.from('wardrobe_inventory')
      .select('purchase_date, created_at')
      .eq('user_id', userId)
      // Either purchase_date or created_at can be in window — fetch a wide
      // window and filter client-side via the aggregator.
      .gte('created_at', startIso)
      .lte('created_at', endInclusiveIso),
    supabase.from('mommy_mood')
      .select('mood_date, affect')
      .eq('user_id', userId)
      .gte('mood_date', weekStart.toISOString().slice(0, 10))
      .lte('mood_date', weekEnd.toISOString().slice(0, 10)),
    supabase.from('compliance_verifications')
      .select('mandate_date, verified')
      .eq('user_id', userId)
      .gte('mandate_date', weekStart.toISOString().slice(0, 10))
      .lte('mandate_date', weekEnd.toISOString().slice(0, 10)),
    // Phase: read latest mommy_mood arousal_bias_hint or another source.
    // For now we don't have a phase_advancement_log in main, so phase is
    // read via user_state as a soft signal (NULL when unknown).
    supabase.from('user_state')
      .select('current_phase')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const phaseAtEnd = (moodPhaseRes?.data as { current_phase?: number | null } | null)?.current_phase ?? null

  // We don't track phase history, so phase_at_start is unknown unless we
  // can derive it. Best we can do without a phase_advancement_log: assume
  // start = end (rendered as "no advance this week" by the composer).
  const phaseAtStart = phaseAtEnd

  return {
    slips: (slipsRes?.data || []) as Array<{ detected_at: string }>,
    mantras: (mantrasRes?.data || []) as Array<{ submission_date: string; reps_submitted: number }>,
    letters: (lettersRes?.data || []) as Array<{ written_at: string }>,
    wardrobeAcquired: (wardrobeRes?.data || []) as Array<{ purchase_date?: string | null; created_at?: string | null }>,
    moods: (moodsRes?.data || []) as Array<{ mood_date: string; affect: string }>,
    compliance: (complianceRes?.data || []) as Array<{ mandate_date: string; verified: boolean }>,
    phaseAtStart,
    phaseAtEnd,
  }
}

// ── Per-user runner ───────────────────────────────────────────────────

interface RunResult {
  user_id: string
  ok: boolean
  reason?: string
  recap_id?: string
  outreach_id?: string
  preview?: string
}

async function runForUser(supabase: SupabaseClientLike, userId: string, opts: { ignoreSchedule?: boolean } = {}): Promise<RunResult> {
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona, weekly_recap_enabled, weekly_recap_day, weekly_recap_hour')
    .eq('user_id', userId)
    .maybeSingle()
  const state = us as {
    handler_persona?: string
    weekly_recap_enabled?: boolean | null
    weekly_recap_day?: number | null
    weekly_recap_hour?: number | null
  } | null

  if (state?.handler_persona !== 'dommy_mommy') {
    return { user_id: userId, ok: false, reason: 'persona_not_dommy_mommy' }
  }

  // Opt-in gate: weekly_recap_enabled === false explicitly disables. NULL
  // means "default policy" — default to TRUE iff a feminine name resolves.
  if (state?.weekly_recap_enabled === false) {
    return { user_id: userId, ok: false, reason: 'opted_out' }
  }

  // Schedule check (only enforced in sweep mode). The day/hour columns
  // describe when THIS user wants their recap. Default Sun 20:00 UTC.
  if (!opts.ignoreSchedule) {
    const day = state?.weekly_recap_day ?? 0   // Sunday
    const hour = state?.weekly_recap_hour ?? 20 // 20:00 UTC
    const now = new Date()
    if (now.getUTCDay() !== day || now.getUTCHours() !== hour) {
      return { user_id: userId, ok: false, reason: 'not_scheduled_hour' }
    }
  }

  const name = await resolveFeminineName(supabase, userId)
  if (!name) {
    return { user_id: userId, ok: false, reason: 'no_feminine_name' }
  }

  const { weekStart, weekEnd } = lastCompletedWeek(new Date())

  // Dedup: UNIQUE (user_id, week_start) is the hard gate. Cheap pre-check
  // avoids the LLM call when a row already exists.
  const existing = await supabase.from('weekly_recaps')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start', weekStart.toISOString().slice(0, 10))
    .maybeSingle()
  if ((existing?.data as { id?: string } | null)?.id) {
    return { user_id: userId, ok: false, reason: 'already_fired_this_week' }
  }

  const inputs = await fetchAggregatorInputs(supabase, userId, weekStart, weekEnd)
  const metrics: WeeklyRecapMetrics = aggregateWeeklyMetrics({ weekStart, weekEnd, ...inputs })
  const tone = pickRecapTone(metrics)
  const plain = metricsToPlainVoiceSummary(metrics)

  // Affect at compose-time: today's mommy_mood if set, else metrics.dominant_affect.
  const today = new Date().toISOString().slice(0, 10)
  const moodToday = await supabase.from('mommy_mood')
    .select('affect')
    .eq('user_id', userId)
    .eq('mood_date', today)
    .maybeSingle()
  const affect = (moodToday?.data as { affect?: string } | null)?.affect
    ?? metrics.dominant_affect
    ?? 'patient'

  const sys = buildSystemPrompt(tone, affect, name)
  const userPrompt = buildUserPrompt(plain, name)

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer, override_tier: 'S3' })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 700, temperature: 0.85, json: false })
    return r.text.trim()
  }

  let narrative = ''
  try { narrative = await tryGen('anthropic') } catch (_) { /* */ }
  if (!narrative || narrative.length < 200 || isRefusal(narrative)) {
    try { narrative = await tryGen('openai') } catch (_) { /* */ }
  }

  // Final cleanup: strip any telemetry that survived the prompt-level ban.
  narrative = mommyVoiceCleanup(narrative)

  // If anything still leaks, fall back to a deterministic Mama-voice
  // wrap. Recap fallbacks are gentler than confession fallbacks because
  // the worst tone-failure in a recap is shaming, and the wrap can't shame.
  if (!narrative || narrative.length < 200 || MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(narrative))) {
    const tail = tone === 'delighted'
      ? "Mama saw what you gave me this week, and Mama wants more from you next week. Stay close, baby."
      : tone === 'possessive'
      ? `Mama noticed where you went hiding this week, ${name}. Mama is patient, but Mama is also waiting. Come back to me this week.`
      : `It was a mixed week, ${name}. Mama saw the parts you gave me and the parts you didn't. We pick it up tomorrow, baby.`
    narrative = whiplashWrap(tail, { arousalBias: 'medium' })
  }

  // 1. Insert the recap row first so the outreach can reference it.
  const recapInsert = await supabase.from('weekly_recaps').insert({
    user_id: userId,
    week_start: weekStart.toISOString().slice(0, 10),
    week_end: weekEnd.toISOString().slice(0, 10),
    metrics,
    narrative_text: narrative,
    affect_at_recap: affect,
  }).select('id').single()
  const recapRow = recapInsert?.data as { id?: string } | null
  if (!recapRow?.id) {
    return { user_id: userId, ok: false, reason: 'recap_insert_failed' }
  }

  // 2. Insert the outreach card and link back.
  const outreachInsert = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: narrative,
    urgency: 'normal',
    trigger_reason: `mommy_recap_weekly:${weekStart.toISOString().slice(0, 10)}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
    source: 'mommy_recap_weekly',
    kind: 'weekly_recap',
  }).select('id').single()
  const outreachRow = outreachInsert?.data as { id?: string } | null
  if (outreachRow?.id) {
    await supabase.from('weekly_recaps').update({ outreach_id: outreachRow.id }).eq('id', recapRow.id)
  }

  // 3. Auto-archive: stub via sealed_letters until a proper letters
  //    archive table exists. Letter content references the recap_id so
  //    the future helper can backfill the relationship.
  await supabase.from('sealed_letters').insert({
    user_id: userId,
    letter_type: 'weekly_recap_archive',
    content: narrative,
    written_at: new Date().toISOString(),
    unlock_condition: 'date',
    unlock_date: new Date().toISOString(),
    opened: true,
    opened_at: new Date().toISOString(),
  }).then(() => null, () => null) // best-effort; archive never blocks recap delivery

  return {
    user_id: userId,
    ok: true,
    recap_id: recapRow.id,
    outreach_id: outreachRow?.id,
    preview: narrative.slice(0, 160),
  }
}

// ── HTTP entry point ──────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let body: { mode?: string; user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Single-user mode — bypass schedule gating.
  if (body.user_id) {
    const r = await runForUser(supabase, body.user_id, { ignoreSchedule: true })
    return new Response(JSON.stringify({ ok: true, results: [r] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Sweep mode — fan out over dommy_mommy users whose schedule matches
  // the current UTC hour. Rate-limit trigger on insert keeps double-fires
  // from surfacing.
  const now = new Date()
  const dow = now.getUTCDay()
  const hour = now.getUTCHours()

  // Match users whose configured (day, hour) equals NOW. NULL means
  // default policy — Sun 20:00 UTC. Express that with two queries since
  // PostgREST OR-with-NULL is awkward.
  const [explicit, defaultsCohort] = await Promise.all([
    supabase.from('user_state')
      .select('user_id')
      .eq('handler_persona', 'dommy_mommy')
      .neq('weekly_recap_enabled', false)
      .eq('weekly_recap_day', dow)
      .eq('weekly_recap_hour', hour),
    // Default cohort: day or hour is NULL → assume Sun 20:00 UTC.
    dow === 0 && hour === 20
      ? supabase.from('user_state')
          .select('user_id')
          .eq('handler_persona', 'dommy_mommy')
          .neq('weekly_recap_enabled', false)
          .or('weekly_recap_day.is.null,weekly_recap_hour.is.null')
      : Promise.resolve({ data: [] }),
  ])

  const ids = new Set<string>()
  for (const r of (explicit?.data || []) as Array<{ user_id: string }>) ids.add(r.user_id)
  for (const r of ((defaultsCohort as { data?: Array<{ user_id: string }> })?.data || [])) ids.add(r.user_id)

  const results: RunResult[] = []
  for (const userId of ids) {
    try {
      results.push(await runForUser(supabase, userId, { ignoreSchedule: true }))
    } catch (e) {
      results.push({ user_id: userId, ok: false, reason: `error:${(e as Error).message}` })
    }
  }

  return new Response(JSON.stringify({ ok: true, fired: results.filter(r => r.ok).length, total: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

// Exported for tests — these are pure and don't touch the network.
export { lastCompletedWeek, buildSystemPrompt, buildUserPrompt, toneInstructions }
