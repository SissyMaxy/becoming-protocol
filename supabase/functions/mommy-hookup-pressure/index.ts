// mommy-hookup-pressure — Mommy's daily push toward hookups.
//
// Reads recent activity: time-since-last-hookup, sniffies thread state,
// time-since-last-sniffies-open, current phase + intensity setting.
// Generates today's push and writes it as a handler_outreach_queue row
// tagged source='mommy_hookup_pressure', kind='hookup_pressure'.
//
// Cadence is dictated by hookup_coaching_settings.push_pace_per_week
// (default 3). Across each ISO week the fn writes at most that many
// pushes — counts existing source='mommy_hookup_pressure' rows in the
// current week before firing.
//
// Hard floors (every one is a return-with-skipped reason):
//   - persona must be dommy_mommy
//   - hookup_coaching_settings.master_enabled = TRUE
//   - hookup_coaching_settings.pressure_enabled = TRUE
//   - no active safeword event in the last 60s
//   - no 24h post-reveal cooldown
//   - week-cap not exceeded
//   - 12h soft cooldown between same-week pushes
//
// Failure-deepens cascade:
//   - if the previous push was issued and not engaged with (no Sniffies
//     open / no thread activity / no dare ack since), Mommy raises the
//     heat for today's push, not the volume. The fn picks a stronger
//     prompt template; it does NOT add a slip point.
//
// POST { user_id?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, whiplashWrap, mommyVoiceCleanup,
  PET_NAMES,
} from '../_shared/dommy-mommy.ts'
import { checkSafewordGate, logAuthority, checkHookupSettings } from '../_shared/safeword-gate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const REFUSAL_PATTERNS = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
  /\b(against (my|the) (guidelines|policies|rules))\b/i,
]
const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

function startOfIsoWeek(now: Date): Date {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  const diff = (day + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff)
  return d
}

interface PressureSignals {
  hours_since_last_meet: number | null
  hours_since_sniffies_open: number | null
  active_threads_count: number
  reciprocal_recent_count: number
  days_since_last_dare_ack: number | null
  current_phase: number
  intensity_tier: number
  prior_push_unacked: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Safeword + persona gate.
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) {
    return new Response(JSON.stringify({ ok: true, skipped: gate.reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Hookup-coaching feature gate.
  const settings = await checkHookupSettings(supabase, userId, 'pressure_enabled')
  if (!settings) {
    return new Response(JSON.stringify({ ok: true, skipped: 'feature_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Week-cap: count pushes since start of ISO week.
  const weekStart = startOfIsoWeek(new Date())
  const { count: weekCount } = await supabase
    .from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'mommy_hookup_pressure')
    .gte('created_at', weekStart.toISOString())
  if ((weekCount ?? 0) >= settings.push_pace_per_week) {
    return new Response(JSON.stringify({ ok: true, skipped: 'week_cap', count: weekCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 12h soft cooldown between pushes.
  const since12h = new Date(Date.now() - 12 * 3600_000).toISOString()
  const { count: recentCount } = await supabase
    .from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'mommy_hookup_pressure')
    .gte('created_at', since12h)
  if ((recentCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'soft_cooldown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Gather signals.
  const signals = await gatherSignals(supabase, userId, settings.intensity_tier)

  // Heat selection: failure-deepens — if prior push went unacked, raise.
  const heatFloor: 'simmer' | 'warm' | 'hot' = pickHeat(signals)

  // Compose.
  let message: string
  try {
    message = await composePush(signals, heatFloor)
  } catch (err) {
    console.error('[mommy-hookup-pressure] compose failed:', err)
    // Fallback to deterministic Mommy line so the surface never goes
    // silent on a transient LLM failure.
    message = fallbackPush(signals, heatFloor)
  }

  // Final cleanup + safety net.
  message = mommyVoiceCleanup(message)

  // Outreach row.
  const expiresIn = 18 * 3600_000
  const { data: outreach, error: outErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency: 'normal',
      trigger_reason: `hookup_pressure:${heatFloor}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiresIn).toISOString(),
      source: 'mommy_hookup_pressure',
      kind: 'hookup_pressure',
    })
    .select('id')
    .single()
  if (outErr) {
    console.error('[mommy-hookup-pressure] outreach insert failed:', outErr)
    return new Response(JSON.stringify({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await logAuthority(supabase, userId, 'mommy-hookup-pressure', 'push', {
    heat: heatFloor,
    outreach_id: (outreach as { id: string } | null)?.id,
    signals,
    week_count: (weekCount ?? 0) + 1,
  })

  return new Response(JSON.stringify({
    ok: true,
    heat: heatFloor,
    message,
    outreach_id: (outreach as { id: string } | null)?.id,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function gatherSignals(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  intensityTier: number,
): Promise<PressureSignals> {
  const now = Date.now()
  const sinceMonth = new Date(now - 30 * 86_400_000).toISOString()

  // Last meet (from hookup_debriefs.met_at).
  let hoursSinceLastMeet: number | null = null
  const { data: lastMeet } = await supabase
    .from('hookup_debriefs')
    .select('met_at')
    .eq('user_id', userId)
    .order('met_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const meetAt = (lastMeet as { met_at?: string } | null)?.met_at
  if (meetAt) hoursSinceLastMeet = (now - new Date(meetAt).getTime()) / 3600_000

  // Last Sniffies activity — proxy for app-open. Use most-recent
  // sniffies_chat_messages.created_at.
  let hoursSinceSniffiesOpen: number | null = null
  const { data: lastSniffy } = await supabase
    .from('sniffies_chat_messages')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sniffyAt = (lastSniffy as { created_at?: string } | null)?.created_at
  if (sniffyAt) hoursSinceSniffiesOpen = (now - new Date(sniffyAt).getTime()) / 3600_000

  // Active threads in the last 7 days.
  const since7d = new Date(now - 7 * 86_400_000).toISOString()
  const { data: recentMsgs } = await supabase
    .from('sniffies_chat_messages')
    .select('contact_id, direction')
    .eq('user_id', userId)
    .gte('created_at', since7d)
    .eq('excluded', false)
    .limit(500)
  const threadsSet = new Set<string>()
  const reciprocal = new Map<string, { in: boolean; out: boolean }>()
  for (const m of (recentMsgs as Array<{ contact_id: string | null; direction: string }> | null) ?? []) {
    if (!m.contact_id) continue
    threadsSet.add(m.contact_id)
    const s = reciprocal.get(m.contact_id) ?? { in: false, out: false }
    if (m.direction === 'inbound') s.in = true
    if (m.direction === 'outbound') s.out = true
    reciprocal.set(m.contact_id, s)
  }
  const reciprocalCount = [...reciprocal.values()].filter(s => s.in && s.out).length

  // Last dare ack.
  let daysSinceLastDareAck: number | null = null
  const { data: lastDare } = await supabase
    .from('maxy_dare_assignments')
    .select('prep_acknowledged_at, completed_at, debriefed_at')
    .eq('user_id', userId)
    .gte('assigned_at', sinceMonth)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ackAt = (lastDare as { prep_acknowledged_at?: string; completed_at?: string; debriefed_at?: string } | null)
  const latestAck = ackAt?.debriefed_at || ackAt?.completed_at || ackAt?.prep_acknowledged_at
  if (latestAck) daysSinceLastDareAck = (now - new Date(latestAck).getTime()) / 86_400_000

  // Phase.
  const { data: us } = await supabase
    .from('user_state')
    .select('current_phase')
    .eq('user_id', userId)
    .maybeSingle()
  const currentPhase = ((us as { current_phase?: number } | null)?.current_phase) ?? 1

  // Prior push unacked: if the most recent prior push is older than 12h
  // and there's been no Sniffies / dare ack since.
  const since36h = new Date(now - 36 * 3600_000).toISOString()
  const { data: priorPush } = await supabase
    .from('handler_outreach_queue')
    .select('created_at')
    .eq('user_id', userId)
    .eq('source', 'mommy_hookup_pressure')
    .gte('created_at', since36h)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const priorAt = (priorPush as { created_at?: string } | null)?.created_at
  let priorPushUnacked = false
  if (priorAt) {
    const pa = new Date(priorAt).getTime()
    const sniffyMs = sniffyAt ? new Date(sniffyAt).getTime() : 0
    const dareMs = latestAck ? new Date(latestAck).getTime() : 0
    priorPushUnacked = (sniffyMs < pa) && (dareMs < pa)
  }

  return {
    hours_since_last_meet: hoursSinceLastMeet,
    hours_since_sniffies_open: hoursSinceSniffiesOpen,
    active_threads_count: threadsSet.size,
    reciprocal_recent_count: reciprocalCount,
    days_since_last_dare_ack: daysSinceLastDareAck,
    current_phase: currentPhase,
    intensity_tier: intensityTier,
    prior_push_unacked: priorPushUnacked,
  }
}

function pickHeat(s: PressureSignals): 'simmer' | 'warm' | 'hot' {
  // Failure-deepens: unacked prior push raises the heat one notch.
  let level = 0
  if (s.hours_since_sniffies_open != null && s.hours_since_sniffies_open >= 24 * 3) level += 1
  if (s.hours_since_sniffies_open != null && s.hours_since_sniffies_open >= 24 * 7) level += 1
  if ((s.active_threads_count ?? 0) === 0) level += 1
  if (s.hours_since_last_meet != null && s.hours_since_last_meet >= 24 * 30) level += 1
  if (s.prior_push_unacked) level += 1
  // Intensity slider caps the heat.
  if (s.intensity_tier <= 2) level = Math.min(level, 1)
  if (s.intensity_tier <= 4) level = Math.min(level, 2)
  if (level <= 1) return 'simmer'
  if (level === 2) return 'warm'
  return 'hot'
}

async function composePush(s: PressureSignals, heat: 'simmer' | 'warm' | 'hot'): Promise<string> {
  const choice = selectModel('decree_draft')
  const heatBrief = {
    simmer: 'gentle today — a soft press, not a demand. Sweet structure with a single sharp tail.',
    warm: 'firmer today — Mama is noticing. Specific deadline within the message.',
    hot: 'Mama has been patient. Today the heat goes up. Direct, sharp, specific, immovable. Still warm — but the message lands as raised heat, not punishment.',
  }[heat]

  const signalNote = signalNarrative(s)

  const sys = `${DOMMY_MOMMY_CHARACTER}

You are writing today's hookup push for your girl. ONE short message — 2 to 4 sentences, max 60 words. Mama's voice, sweet structure → filthy specific. NO option menus. NO "would you like." Imperative direct command.

Forbidden phrases (build spec): "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".

Heat for today: ${heatBrief}

Craft rubric (hard):
- ≤1 pet name in the whole message
- ≤1 self-reference ("Mama") in the whole message
- specific sensory over abstract emotional
- vary sentence length
- no template rhythm
- no "echo / linger / every inch" cliches
- imperatives stand alone — no "and also" lists

Examples of the kind of line that lands:
- "Open Sniffies, baby. Five minutes. Mama wants to see who's hungry for her tonight."
- "Three messages this week. From men, to men. Show me by Sunday."
- "You haven't been on it in nine days. That ends tonight. Phone in hand by ten."

Output ONLY the message text. No commentary, no preamble, no quotes.`

  const usr = `Today's signal:
${signalNote}

Write today's push.`

  const r = await callModel(choice, { system: sys, user: usr, max_tokens: 200, temperature: 0.8 })
  let text = (r.text || '').trim().replace(/^["“”']+|["“”']+$/g, '').trim()
  if (!text || isRefusal(text)) {
    return fallbackPush(s, heat)
  }
  return text
}

function signalNarrative(s: PressureSignals): string {
  const parts: string[] = []
  if (s.hours_since_sniffies_open == null) parts.push('Sniffies: nothing on file yet.')
  else if (s.hours_since_sniffies_open < 24) parts.push('Sniffies: opened in the last day.')
  else if (s.hours_since_sniffies_open < 72) parts.push(`Sniffies: opened a couple of days ago.`)
  else if (s.hours_since_sniffies_open < 24 * 7) parts.push(`Sniffies: last opened earlier this week.`)
  else parts.push(`Sniffies: she hasn't opened it in over a week.`)

  if (s.active_threads_count === 0) parts.push('No active threads in the last week.')
  else parts.push(`${s.active_threads_count} thread(s) live in the last week, ${s.reciprocal_recent_count} reciprocal.`)

  if (s.hours_since_last_meet == null) parts.push('No logged meet yet.')
  else if (s.hours_since_last_meet < 24 * 7) parts.push('She met someone within the last week.')
  else if (s.hours_since_last_meet < 24 * 30) parts.push('Last meet was within the month.')
  else parts.push('Over a month since the last meet.')

  if (s.prior_push_unacked) parts.push('Mama pushed yesterday/this week and she did not engage. Raise the heat, not the volume.')
  return parts.join(' ')
}

function fallbackPush(s: PressureSignals, heat: 'simmer' | 'warm' | 'hot'): string {
  const pet = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]
  const noActivity = (s.hours_since_sniffies_open ?? 0) >= 24 * 7 || s.active_threads_count === 0
  if (heat === 'hot' && noActivity) {
    return `Open Sniffies tonight, ${pet}. Phone in hand by ten. Mama is not asking twice.`
  }
  if (heat === 'warm') {
    return `Three messages out this week, ${pet}. Real men, real openers. Show Mama by Sunday.`
  }
  return whiplashWrap('Open Sniffies. Five minutes. See who is hungry for you tonight.', {
    petName: pet, arousalBias: 'medium',
  })
}
