// mommy-live-reframe — every 15 min, scan recent biometric + calendar
// signals for "reframable moments" and post a Mommy-voice possession-frame
// commentary as a low/medium-urgency outreach.
//
// Rate-limited: max 4 live-reframes per day per user. Dedup window: a
// given (kind, minute-bucket) only fires once. Persona-gated to
// dommy_mommy.
//
// Data sources:
//   - whoop_workouts (when workout completed in last 30 min)
//   - whoop_metrics (sleep_end timestamp in last 30 min)
//   - calendar_events_managed + freebusy_cache (meeting/lunch/call ended)
//   - device-state hints (app switch, screen unlock) when available
//
// Composer: dommy-mommy voice anchor with craft-rubric guard. Falls back
// to deterministic two-sentence fallback if the model refuses or trips
// a forbidden-framing pattern.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  buildReframePrompt, fallbackReframe, defaultKey, filterAlreadyReframed,
  type ReframeObservation, type ReframeKind,
} from '../_shared/live-reframe.ts'
import {
  DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS,
} from '../_shared/dommy-mommy.ts'
import {
  effectiveBand, bandMantraCeiling, type DifficultyBand,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const DAILY_CAP = 4
const DEDUP_WINDOW_HOURS = 24

const FORBIDDEN_FRAMING = [
  /\brole[\s-]?play\b/i,
  /\bsimulation\b/i,
  /\bthis is fiction\b/i,
  /\bnot medical advice\b/i,
  /\bintake\b/i,
  /\bquestionnaire\b/i,
  /\bfor entertainment\b/i,
  /\bdisclaimer\b/i,
]

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isRefusal(t: string): boolean {
  return /\b(I'?m sorry|I apologize|I can'?t|I cannot|unable to|against (my|the) (guidelines|policies))/i.test(t)
}
function hasForbidden(t: string): boolean {
  return FORBIDDEN_FRAMING.some(re => re.test(t)) || MOMMY_TELEMETRY_LEAK_PATTERNS.some(re => re.test(t))
}

async function gatherObservations(
  supabase: SupabaseClient,
  userId: string,
  windowEnd: Date,
): Promise<ReframeObservation[]> {
  const windowStart = new Date(windowEnd.getTime() - 30 * 60_000)
  const startIso = windowStart.toISOString()
  const endIso = windowEnd.toISOString()
  const observations: ReframeObservation[] = []

  // 1. Workouts that landed in the window. whoop_workouts doesn't carry
  // explicit end-times in the column schema — created_at is the row
  // insert moment, which is when the Whoop poller wrote it (close to the
  // workout end). Conservative: use created_at as end-of-workout proxy.
  const { data: workouts } = await supabase
    .from('whoop_workouts')
    .select('created_at, average_heart_rate, strain, sport_name, duration_milli')
    .eq('user_id', userId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .then(
      (r: { data: unknown }) => r,
      () => ({ data: [] }),
    )
  for (const w of (workouts || []) as Array<{
    created_at: string; average_heart_rate?: number | null
    strain?: number | null; sport_name?: string | null; duration_milli?: number | null
  }>) {
    observations.push({
      kind: 'workout_ended',
      ended_at: w.created_at,
      context: {
        avg_hr: w.average_heart_rate ?? null,
        strain: w.strain ?? null,
        sport: w.sport_name ?? null,
        duration_min: w.duration_milli ? Math.round(w.duration_milli / 60_000) : null,
      },
    })
  }

  // 2. Sleep ended — derived from whoop_metrics rows landing today.
  // No explicit sleep_end column exists; metrics row is upserted once
  // the day's sleep is summarized. fetched_at is the closest proxy.
  const { data: sleeps } = await supabase
    .from('whoop_metrics')
    .select('date, fetched_at, total_sleep_duration_milli, sleep_performance_percentage')
    .eq('user_id', userId)
    .gte('fetched_at', startIso)
    .lte('fetched_at', endIso)
    .order('date', { ascending: false })
    .limit(2)
    .then(
      (r: { data: unknown }) => r,
      () => ({ data: [] }),
    )
  for (const s of (sleeps || []) as Array<{
    date: string; fetched_at: string; total_sleep_duration_milli?: number | null
    sleep_performance_percentage?: number | null
  }>) {
    observations.push({
      kind: 'sleep_ended',
      ended_at: s.fetched_at,
      context: {
        duration_hours: ((s.total_sleep_duration_milli ?? 0) / 3_600_000),
        performance_pct: s.sleep_performance_percentage ?? null,
      },
    })
  }

  // 3. Calendar events ended in window (meetings / lunches / calls)
  const { data: events } = await supabase
    .from('calendar_events_managed')
    .select('starts_at, ends_at, event_type, title')
    .eq('user_id', userId)
    .gte('ends_at', startIso)
    .lte('ends_at', endIso)
    .then(
      (r: { data: unknown }) => r,
      () => ({ data: [] }),
    )
  for (const e of (events || []) as Array<{
    ends_at: string; event_type?: string | null; title?: string | null; starts_at?: string | null
  }>) {
    const title = (e.title || '').toLowerCase()
    let kind: ReframeKind = 'meeting_ended'
    if (/call|phone/.test(title)) kind = 'call_ended'
    else if (/lunch|dinner|coffee/.test(title)) kind = 'lunch_ended'
    observations.push({
      kind,
      ended_at: e.ends_at,
      context: {
        title_hint: e.title ?? null,
        duration_min: e.starts_at
          ? Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60_000)
          : null,
      },
    })
  }

  return observations
}

interface RunResult {
  user_id: string
  ok: boolean
  fired: number
  observations_seen: number
  reason?: string
  previews?: string[]
}

async function runForUser(supabase: SupabaseClient, userId: string): Promise<RunResult> {
  // Persona gate
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona')
    .eq('user_id', userId)
    .maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return { user_id: userId, ok: false, fired: 0, observations_seen: 0, reason: 'persona_not_dommy_mommy' }
  }

  // Daily cap
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'mommy_live_reframe')
    .gte('scheduled_for', startOfDay.toISOString())
  if ((todayCount ?? 0) >= DAILY_CAP) {
    return { user_id: userId, ok: true, fired: 0, observations_seen: 0, reason: 'daily_cap_reached' }
  }

  const now = new Date()
  const observations = await gatherObservations(supabase, userId, now)
  if (observations.length === 0) {
    return { user_id: userId, ok: true, fired: 0, observations_seen: 0, reason: 'no_observations' }
  }

  // Dedup against last 24h
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000).toISOString()
  const { data: priorReframes } = await supabase
    .from('handler_outreach_queue')
    .select('trigger_reason')
    .eq('user_id', userId)
    .eq('source', 'mommy_live_reframe')
    .gte('scheduled_for', dedupSince)
  const priorKeys = new Set<string>()
  for (const r of (priorReframes || []) as Array<{ trigger_reason: string | null }>) {
    if (r.trigger_reason?.startsWith('live_reframe:')) {
      priorKeys.add(r.trigger_reason.slice('live_reframe:'.length))
    }
  }
  const fresh = filterAlreadyReframed(observations, priorKeys)
  if (fresh.length === 0) {
    return { user_id: userId, ok: true, fired: 0, observations_seen: observations.length, reason: 'all_already_reframed' }
  }

  // Resolve name from dossier
  const { data: dossierName } = await supabase.from('mommy_dossier')
    .select('answer').eq('user_id', userId).eq('category', 'name').eq('active', true)
    .order('importance', { ascending: false }).limit(1).maybeSingle()
  const { data: prof } = await supabase.from('user_profiles')
    .select('preferred_name').eq('user_id', userId).maybeSingle()
  const name = (
    (dossierName as { answer?: string } | null)?.answer
    ?? (prof as { preferred_name?: string } | null)?.preferred_name
    ?? 'baby'
  ).trim()

  // Affect today
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase.from('mommy_mood')
    .select('affect').eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? 'patient'

  // Intensity ceiling
  const { data: diff } = await supabase
    .from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band').eq('user_id', userId).maybeSingle()
  const band = effectiveBand(diff as { current_difficulty_band: DifficultyBand; override_band: DifficultyBand | null } | null)
  const intensity = bandMantraCeiling(band)

  // Pick at most (DAILY_CAP - todayCount) and cap at 1 per run to keep
  // the stream feeling considered, not noisy.
  const slotsLeft = DAILY_CAP - (todayCount ?? 0)
  const fireCount = Math.min(1, slotsLeft, fresh.length)
  const previews: string[] = []
  let fired = 0

  for (let i = 0; i < fireCount; i++) {
    const obs = fresh[i]
    const { system, user } = buildReframePrompt(obs, { name, affect, intensity })

    let text = ''
    try {
      const choice = selectModel('reframe_draft', { prefer: 'anthropic' })
      const r = await callModel(choice, {
        system: `${DOMMY_MOMMY_CHARACTER}\n\n${system}`,
        user,
        max_tokens: 200,
        temperature: 0.85,
        json: false,
      })
      text = r.text.trim()
    } catch (e) {
      console.warn('[live-reframe] anthropic failed:', (e as Error).message)
    }

    if (!text || isRefusal(text) || hasForbidden(text)) {
      // Try openai
      try {
        const choice = selectModel('reframe_draft', { prefer: 'openai' })
        const r = await callModel(choice, {
          system: `${DOMMY_MOMMY_CHARACTER}\n\n${system}`,
          user,
          max_tokens: 200,
          temperature: 0.85,
          json: false,
        })
        text = r.text.trim()
      } catch (_e) { /* */ }
    }

    if (!text || isRefusal(text) || hasForbidden(text)) {
      text = fallbackReframe(obs, name)
    }

    text = mommyVoiceCleanup(text)
    if (hasForbidden(text)) text = fallbackReframe(obs, name)

    const key = defaultKey(obs)
    const outRes = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: text,
      urgency: 'normal',
      trigger_reason: `live_reframe:${key}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
      source: 'mommy_live_reframe',
    }).select('id').single()
    if (outRes.error) {
      console.error('[live-reframe] outreach insert failed:', outRes.error.message)
      continue
    }

    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action: 'live_reframe_fired',
      surface: 'live_reframe',
      ref_table: 'handler_outreach_queue',
      ref_id: (outRes.data as { id?: string } | null)?.id,
      meta: { observation: obs, preview: text.slice(0, 120) },
    })

    previews.push(text)
    fired++
  }

  return { user_id: userId, ok: true, fired, observations_seen: observations.length, previews }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  let body: { mode?: string; user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (body.user_id) {
    const r = await runForUser(supabase, body.user_id)
    return json({ ok: true, results: [r] })
  }

  const { data: cohort } = await supabase
    .from('user_state')
    .select('user_id')
    .eq('handler_persona', 'dommy_mommy')
  const ids = ((cohort || []) as Array<{ user_id: string }>).map(r => r.user_id)
  if (ids.length === 0) ids.push(HANDLER_USER_ID)

  const results: RunResult[] = []
  for (const uid of ids) {
    try { results.push(await runForUser(supabase, uid)) }
    catch (e) { results.push({ user_id: uid, ok: false, fired: 0, observations_seen: 0, reason: `error:${(e as Error).message}` }) }
  }
  return json({ ok: true, fired: results.reduce((a, r) => a + r.fired, 0), total: results.length, results })
})
