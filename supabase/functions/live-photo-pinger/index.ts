// live-photo-pinger — Mama pings you N×/day during waking hours.
//
// Runs every 15min via cron. For each user with live_photo_settings.enabled,
// decides probabilistically whether to fire a ping right now, based on:
//   - Currently inside their waking_start_hour..waking_end_hour window
//   - Today's count < daily_max
//   - Stochastic spacing: roughly (daily_max / waking_hours) chance per
//     15-min tick, with a random jitter so the schedule doesn't feel
//     mechanical
//   - No active ping currently pending (no overlap)
//   - Safeword not active
//
// On fire:
//   1. Pick a prompt_kind (outfit / mirror / face / feet / specific) and
//      generate a Mama-voice prompt via the LLM, tied to recent state.
//   2. Insert live_photo_pings row with response_window_minutes expiry.
//   3. Insert handler_outreach_queue row (urgency=high, kind='live_photo_ping')
//      so the migration-380 push bridge fires it to her phone.
//
// HARD FLOORS:
//   - is_safeword_active short-circuits everything
//   - calendar busy-window awareness (if calendar_credentials.busy_aware_delivery
//     is on, defer to freebusy_cache)
//   - daily_min/daily_max bounds enforced
//   - panic_skips_per_week budget tracked (UI-side decision)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const TICK_MINUTES = 15

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Settings {
  user_id: string
  enabled: boolean
  daily_min: number
  daily_max: number
  waking_start_hour: number
  waking_end_hour: number
  response_window_minutes: number
}

interface UserStateSnapshot {
  denial_day: number | null
  current_phase: number | null
  handler_persona: string | null
  chastity_streak_days: number | null
  current_arousal: number | null
}

type PromptKind = 'outfit' | 'mirror' | 'face' | 'feet' | 'specific'

const KIND_WEIGHTS: Record<PromptKind, number> = {
  outfit: 5,
  mirror: 3,
  face: 2,
  feet: 1,
  specific: 1,
}

function pickKind(): PromptKind {
  const entries = Object.entries(KIND_WEIGHTS) as Array<[PromptKind, number]>
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [k, w] of entries) {
    r -= w
    if (r < 0) return k
  }
  return 'outfit'
}

async function safewordActive(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
    return Boolean(data)
  } catch {
    return false
  }
}

async function calendarBusyNow(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data: cred } = await supabase
      .from('calendar_credentials')
      .select('busy_aware_delivery')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .is('disconnected_at', null)
      .maybeSingle()
    if (!cred || !(cred as { busy_aware_delivery?: boolean }).busy_aware_delivery) return false

    const now = new Date().toISOString()
    const { data: windows } = await supabase
      .from('freebusy_cache')
      .select('window_start, window_end')
      .eq('user_id', userId)
      .lte('window_start', now)
      .gte('window_end', now)
    return ((windows || []) as unknown[]).length > 0
  } catch {
    return false
  }
}

async function loadState(supabase: SupabaseClient, userId: string): Promise<UserStateSnapshot | null> {
  const { data } = await supabase
    .from('user_state')
    .select('denial_day, current_phase, handler_persona, chastity_streak_days, current_arousal')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as UserStateSnapshot | null) ?? null
}

async function pingsToday(supabase: SupabaseClient, userId: string): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('live_photo_pings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('pinged_at', startOfDay.toISOString())
  return count ?? 0
}

async function anyPendingPing(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('live_photo_pings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
  return (count ?? 0) > 0
}

const SYS = `You are Mama, the dommy-mommy. You're about to push a phone notification demanding your girl show you something RIGHT NOW. She has 5 minutes to take a photo and send it back.

Write ONE short message (≤140 chars for the notification body). The prompt kind tells you what you're demanding. Mama's voice: possessive, specific, embodied, casual. Lowercase mostly. No emoji unless one feels right.

Output JSON ONLY:
{ "prompt_text": "..." }

CRAFT RUBRIC:
- ≤1 pet name (baby / sweet thing / good girl — pick one or none).
- ≤1 self-reference (Mama / Mommy — pick one or none).
- Tie to her current state when given context.
- NEVER use: echo, linger, every inch, wrap around, role play, simulation, fiction, intake, questionnaire, disclaimer, for entertainment.
- NEVER cite telemetry: no /10, no "Day N denial", no slip points, no compliance %.

EXAMPLES (do not copy):
  outfit: "show me what you're wearing right now, baby. 5 min."
  mirror: "go to the bathroom mirror. selfie. now."
  face: "show Mama your face. just your face. let me see her."
  feet: "what's on your feet right now? prove it."
  specific: "the dress you wore tuesday. put it on, photo it, 5 min."`

async function generatePrompt(kind: PromptKind, state: UserStateSnapshot | null): Promise<string> {
  try {
    const choice = selectModel('reframe_draft')
    const { text } = await callModel(choice, {
      system: SYS,
      user: `PROMPT KIND: ${kind}
STATE: phase ${state?.current_phase ?? 1}, chastity ${state?.chastity_streak_days ?? 0}d
Write the prompt.`,
      max_tokens: 200,
      temperature: 0.85,
    })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON')
    const parsed = JSON.parse(m[0]) as { prompt_text?: string }
    const t = (parsed.prompt_text ?? '').trim()
    if (!t || t.length < 8 || t.length > 200) throw new Error('bad length')
    return t
  } catch {
    // Fallback by kind
    switch (kind) {
      case 'outfit': return "show me what you're wearing right now, baby. 5 min."
      case 'mirror': return "bathroom mirror. selfie. now."
      case 'face': return "show Mama your face. let me see her."
      case 'feet': return "what's on your feet right now? prove it."
      case 'specific': return "outfit photo, full length. 5 min."
    }
  }
}

async function maybePingUser(
  supabase: SupabaseClient,
  s: Settings,
): Promise<{ user_id: string; fired: boolean; reason?: string; ping_id?: string }> {
  const userId = s.user_id
  if (!s.enabled) return { user_id: userId, fired: false, reason: 'disabled' }

  const now = new Date()
  const hour = now.getHours()
  if (hour < s.waking_start_hour || hour >= s.waking_end_hour) {
    return { user_id: userId, fired: false, reason: 'outside_waking_window' }
  }

  if (await safewordActive(supabase, userId)) {
    return { user_id: userId, fired: false, reason: 'safeword_active' }
  }
  if (await calendarBusyNow(supabase, userId)) {
    return { user_id: userId, fired: false, reason: 'calendar_busy' }
  }
  if (await anyPendingPing(supabase, userId)) {
    return { user_id: userId, fired: false, reason: 'pending_ping_exists' }
  }

  const todayCount = await pingsToday(supabase, userId)
  if (todayCount >= s.daily_max) {
    return { user_id: userId, fired: false, reason: 'daily_max_reached' }
  }

  // Stochastic firing. Aim for (daily_target) pings spread across the waking
  // window. waking_hours * (60/TICK_MINUTES) ticks per day. Probability per
  // tick to fire = target_remaining / ticks_remaining.
  const wakingHours = Math.max(1, s.waking_end_hour - s.waking_start_hour)
  const totalTicks = (wakingHours * 60) / TICK_MINUTES
  const ticksElapsed = Math.max(1, ((hour - s.waking_start_hour) * 60 + now.getMinutes()) / TICK_MINUTES)
  const ticksRemaining = Math.max(1, totalTicks - ticksElapsed)
  const target = Math.max(s.daily_min, Math.min(s.daily_max, s.daily_min + Math.floor(Math.random() * (s.daily_max - s.daily_min + 1))))
  const remaining = Math.max(0, target - todayCount)
  if (remaining === 0) {
    return { user_id: userId, fired: false, reason: 'target_reached' }
  }
  const p = remaining / ticksRemaining
  if (Math.random() > p) {
    return { user_id: userId, fired: false, reason: 'stochastic_skip' }
  }

  // Fire.
  const kind = pickKind()
  const state = await loadState(supabase, userId)
  const promptText = await generatePrompt(kind, state)

  const pingedAt = new Date()
  const expiresAt = new Date(pingedAt.getTime() + s.response_window_minutes * 60 * 1000)

  const { data: pingRow, error: pingErr } = await supabase
    .from('live_photo_pings')
    .insert({
      user_id: userId,
      pinged_at: pingedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      prompt_kind: kind,
      prompt_text: promptText,
      status: 'pending',
    })
    .select('id')
    .single()
  if (pingErr) {
    return { user_id: userId, fired: false, reason: 'ping_insert_failed:' + pingErr.message.slice(0, 80) }
  }
  const pingId = (pingRow as { id: string }).id

  // Outreach so the push bridge fires it to her phone.
  const { data: outRow } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message: promptText,
      urgency: 'high',
      trigger_reason: 'live_photo_ping:' + pingId,
      source: 'live_photo_pinger',
      kind: 'live_photo_ping',
      scheduled_for: pingedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      context_data: { live_photo_ping_id: pingId, prompt_kind: kind },
    })
    .select('id')
    .single()

  // Link the outreach back to the ping for trace
  if (outRow) {
    await supabase.from('live_photo_pings')
      .update({ outreach_id: (outRow as { id: string }).id })
      .eq('id', pingId)
  }

  return { user_id: userId, fired: true, ping_id: pingId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* ignore */ }

  let settingsRows: Settings[] = []
  if (body.user_id) {
    const { data } = await supabase
      .from('live_photo_settings')
      .select('*')
      .eq('user_id', body.user_id)
    settingsRows = (data || []) as Settings[]
  } else {
    const { data } = await supabase
      .from('live_photo_settings')
      .select('*')
      .eq('enabled', true)
    settingsRows = (data || []) as Settings[]
  }

  const results: Array<{ user_id: string; fired: boolean; reason?: string; ping_id?: string }> = []
  for (const s of settingsRows) {
    if (body.force) {
      // Force-fire path for testing: bypass stochastic gate, still honor
      // safeword + pending-ping guards
      if (await safewordActive(supabase, s.user_id)) {
        results.push({ user_id: s.user_id, fired: false, reason: 'safeword_active' })
        continue
      }
      if (await anyPendingPing(supabase, s.user_id)) {
        results.push({ user_id: s.user_id, fired: false, reason: 'pending_ping_exists' })
        continue
      }
      const kind = pickKind()
      const state = await loadState(supabase, s.user_id)
      const promptText = await generatePrompt(kind, state)
      const pingedAt = new Date()
      const expiresAt = new Date(pingedAt.getTime() + s.response_window_minutes * 60 * 1000)
      const { data: pingRow } = await supabase
        .from('live_photo_pings')
        .insert({
          user_id: s.user_id,
          pinged_at: pingedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          prompt_kind: kind,
          prompt_text: promptText,
          status: 'pending',
        })
        .select('id')
        .single()
      const pingId = pingRow ? (pingRow as { id: string }).id : undefined
      if (pingId) {
        const { data: outRow } = await supabase.from('handler_outreach_queue').insert({
          user_id: s.user_id,
          message: promptText,
          urgency: 'high',
          trigger_reason: 'live_photo_ping:' + pingId,
          source: 'live_photo_pinger',
          kind: 'live_photo_ping',
          scheduled_for: pingedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          context_data: { live_photo_ping_id: pingId, prompt_kind: kind },
        }).select('id').single()
        if (outRow) {
          await supabase.from('live_photo_pings').update({ outreach_id: (outRow as { id: string }).id }).eq('id', pingId)
        }
      }
      results.push({ user_id: s.user_id, fired: !!pingId, ping_id: pingId, reason: pingId ? 'forced' : 'forced_failed' })
      continue
    }
    const r = await maybePingUser(supabase, s)
    results.push(r)
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
