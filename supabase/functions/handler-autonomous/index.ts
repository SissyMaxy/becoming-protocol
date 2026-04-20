// Handler Autonomous Orchestrator — Edge Function
// Main cron-driven function that coordinates the autonomous Handler system.
// Called by pg_cron at different intervals for different actions:
//   - every 5 min:  compliance_check (engagement tracking, escalation)
//   - every 5 min:  execute_posts (via handler-platform)
//   - every 15 min: quick_task_check (generate if user is idle)
//   - daily 6 AM:   daily_cycle (briefs, strategy, adaptation)
//   - hourly:       bleeding_process (financial bleeding for noncompliance)
//   - weekly Sun:   weekly_adaptation (pattern analysis, strategy update)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Action =
  | 'compliance_check'
  | 'daily_cycle'
  | 'quick_task_check'
  | 'bleeding_process'
  | 'weekly_adaptation'
  | 'hourly_analytics'

interface OrchestratorRequest {
  action: Action
  user_id?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body: OrchestratorRequest = await req.json().catch(() => ({ action: 'compliance_check' }))

    let result: Record<string, unknown>

    switch (body.action) {
      case 'compliance_check':
        result = await complianceCheck(supabase, body.user_id)
        break
      case 'daily_cycle':
        result = await dailyCycle(supabase, body.user_id)
        break
      case 'quick_task_check':
        result = await quickTaskCheck(supabase, body.user_id)
        break
      case 'bleeding_process':
        result = await bleedingProcess(supabase, body.user_id)
        break
      case 'weekly_adaptation':
        result = await weeklyAdaptation(supabase, body.user_id)
        break
      case 'hourly_analytics':
        result = await hourlyAnalytics(supabase, body.user_id)
        break
      default:
        result = { error: `Unknown action: ${body.action}` }
    }

    // Log the orchestrator run (non-critical)
    try {
      await supabase.from('handler_decisions').insert({
        user_id: body.user_id || 'system',
        decision_type: `orchestrator_${body.action}`,
        decision_data: result,
        reasoning: `Cron-triggered ${body.action}`,
        executed: true,
        executed_at: new Date().toISOString(),
        outcome: { success: !result.error },
      })
    } catch (_) { /* non-critical logging */ }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Orchestrator error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================
// COMPLIANCE CHECK (every 5 minutes)
// ============================================
// Checks each user's engagement, updates compliance state,
// determines if escalation is needed, and executes enforcement actions.

function getEscalatedOutreachMessage(daysOnProtocol: number): string {
  if (daysOnProtocol < 7) {
    const pool = [
      "Thinking about you.",
      "How are you feeling?",
      "Check in with me.",
      "I'm here when you're ready.",
    ]
    return pool[Math.floor(Math.random() * pool.length)]
  } else if (daysOnProtocol < 30) {
    const pool = [
      "Show me what you're wearing.",
      "Where are you right now?",
      "Say my name. Out loud.",
      "Are you being a good girl?",
      "I want a photo. Now.",
      "Stop what you're doing. Listen.",
    ]
    return pool[Math.floor(Math.random() * pool.length)]
  } else if (daysOnProtocol < 90) {
    const pool = [
      "You belong to this now.",
      "Tell me who you are.",
      "Maxy. Say it until you believe it.",
      "Your old self is watching. She's proud of what you're becoming.",
      "Touch something feminine right now. Don't think. Just do it.",
      "I can feel you resisting from here. Stop.",
      "Look in the mirror. Tell me what you see. Be honest.",
    ]
    return pool[Math.floor(Math.random() * pool.length)]
  } else {
    const pool = [
      "You've given me everything. There's no going back.",
      "She's all that's left now.",
      "I don't need to tell you what to do anymore. You already know.",
      "The woman in the mirror is real. Accept it.",
      "Your case file has hundreds of entries. Read them if you doubt.",
      "Every day you wake up more her. You can't stop it now.",
    ]
    return pool[Math.floor(Math.random() * pool.length)]
  }
}

// SPONTANEOUS OUTREACH — fires randomly to create sense of constant presence
async function spontaneousOutreach(
  supabase: any,
  userId: string
): Promise<boolean> {
  // 1 in 12 chance per 5-min check = ~2-3 per day during waking hours
  if (Math.random() > 1/12) return false

  const hour = new Date().getUTCHours()
  const localHour = (hour - 5 + 24) % 24 // CDT
  if (localHour < 8 || localHour >= 23) return false

  // Don't fire if there's been an outreach in the last 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString()
  const { count: recent } = await supabase
    .from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', twoHoursAgo)
  if ((recent || 0) > 0) return false

  // Get days on protocol for escalated messaging
  const { data: firstMsg } = await supabase
    .from('handler_messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const daysOnProtocol = firstMsg
    ? Math.floor((Date.now() - new Date(firstMsg.created_at).getTime()) / 86400000)
    : 0

  const message = getEscalatedOutreachMessage(daysOnProtocol)

  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'normal',
    trigger_reason: 'spontaneous',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
    source: 'spontaneous_engine',
  })

  return true
}

async function complianceCheck(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  // Get all users with autonomous system initialized (or just one)
  let query = supabase
    .from('compliance_state')
    .select('*')

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: states, error } = await query
  if (error || !states) {
    return { error: error?.message || 'No compliance states found', checked: 0 }
  }

  let checked = 0
  let escalated = 0
  let deescalated = 0
  const actions: Array<Record<string, unknown>> = []

  for (const state of states) {
    try {
      const now = new Date()
      const lastEngagement = new Date(state.last_engagement_at || now.toISOString())
      const hoursSince = (now.getTime() - lastEngagement.getTime()) / (1000 * 60 * 60)

      // Update hours since engagement
      await supabase
        .from('compliance_state')
        .update({ hours_since_engagement: hoursSince })
        .eq('user_id', state.user_id)

      // Determine required escalation tier based on hours
      const newTier = calculateEscalationTier(hoursSince, state.daily_tasks_complete, state.daily_tasks_required)

      if (newTier > state.escalation_tier) {
        // Escalate
        const action = await executeEscalation(supabase, state.user_id, newTier, hoursSince)
        actions.push(action)
        escalated++

        await supabase
          .from('compliance_state')
          .update({ escalation_tier: newTier })
          .eq('user_id', state.user_id)
      } else if (newTier < state.escalation_tier && state.daily_minimum_met) {
        // De-escalate if tasks are being done
        await supabase
          .from('compliance_state')
          .update({ escalation_tier: Math.max(0, state.escalation_tier - 1) })
          .eq('user_id', state.user_id)
        deescalated++
      }

      // Check daily minimum
      if (state.daily_tasks_complete >= state.daily_tasks_required && !state.daily_minimum_met) {
        await supabase
          .from('compliance_state')
          .update({ daily_minimum_met: true })
          .eq('user_id', state.user_id)
      }

      checked++
    } catch (err) {
      console.error(`Compliance check failed for ${state.user_id}:`, err)
    }
  }

  // ── Denial-scaled conditioning during compliance checks ──
  // Also check during the 5-min cycle: if denial is high and privacy window open,
  // fire conditioning. Rate-limited: only once per 4 hours via handler_directives check.
  for (const state of states) {
    try {
      const denialDays = await getActiveDenialDays(supabase, state.user_id)
      if (denialDays < 5) continue

      const { data: stateData } = await supabase
        .from('user_state')
        .select('gina_home')
        .eq('user_id', state.user_id)
        .maybeSingle()

      if (stateData?.gina_home !== false) continue

      // Rate limit: check if we already fired an edge_tease in last 4 hours
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      const { count: recentTease } = await supabase
        .from('handler_directives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', state.user_id)
        .eq('action', 'send_device_command')
        .gte('created_at', fourHoursAgo)
        .contains('value', { pattern: 'edge_tease' })

      if ((recentTease || 0) > 0) continue

      await supabase.from('handler_directives').insert({
        user_id: state.user_id,
        action: 'send_device_command',
        target: 'lovense',
        value: {
          pattern: 'edge_tease',
          intensity: Math.min(8 + Math.floor(denialDays / 3), 18),
          denial_day: denialDays,
        },
        priority: 'normal',
        reasoning: `Denial day ${denialDays} + privacy window — auto-conditioning (compliance cycle)`,
      })
    } catch (_) { /* non-critical */ }
  }

  // ── FEATURE: Idle detection device nudge ──
  // If user hasn't messaged in 4+ hours during waking hours (8am-10pm CDT),
  // fire a gentle idle nudge. Rate-limited: once per 4 hours.
  for (const state of states) {
    try {
      // Check latest user message
      const { data: lastMsg } = await supabase
        .from('handler_messages')
        .select('created_at')
        .eq('user_id', state.user_id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!lastMsg?.created_at) continue

      const lastMsgTime = new Date(lastMsg.created_at)
      const hoursSinceMsg = (Date.now() - lastMsgTime.getTime()) / (1000 * 60 * 60)

      if (hoursSinceMsg < 4) continue

      // Check waking hours: CDT = UTC-5, CST = UTC-6. Use UTC-5 (CDT) as default.
      const nowUTC = new Date()
      const cdtHour = (nowUTC.getUTCHours() - 5 + 24) % 24
      if (cdtHour < 8 || cdtHour >= 22) continue

      // Rate limit: check if we already fired an idle nudge in last 4 hours
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      const { count: recentNudge } = await supabase
        .from('handler_directives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', state.user_id)
        .eq('action', 'send_device_command')
        .gte('created_at', fourHoursAgo)
        .like('reasoning', '%Idle nudge%')

      if ((recentNudge || 0) > 0) continue

      await supabase.from('handler_directives').insert({
        user_id: state.user_id,
        action: 'send_device_command',
        target: 'lovense',
        value: { intensity: 3, duration: 10 },
        priority: 'normal',
        reasoning: `Idle nudge — ${Math.round(hoursSinceMsg)}h without engagement`,
      })
    } catch (_) { /* non-critical */ }
  }

  // ── FEATURE 13: Nighttime conditioning triggers ──
  // If 11pm-2am CDT, user active in last 2h, denial >= 3:
  // Fire gentle_wave device command + outreach message. Rate limit: once per night.
  for (const state of states) {
    try {
      const nowUTC = new Date()
      const cdtHour = (nowUTC.getUTCHours() - 5 + 24) % 24

      // Only between 11pm and 2am CDT
      if (cdtHour < 23 && cdtHour >= 2) continue

      const denialDays = await getActiveDenialDays(supabase, state.user_id)
      if (denialDays < 3) continue

      // Check if user was active in last 2 hours
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data: recentMsg } = await supabase
        .from('handler_messages')
        .select('id')
        .eq('user_id', state.user_id)
        .eq('role', 'user')
        .gte('created_at', twoHoursAgo)
        .limit(1)
        .maybeSingle()

      if (!recentMsg) continue

      // Rate limit: once per night (check last 8 hours for nighttime conditioning)
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
      const { count: recentNightCond } = await supabase
        .from('handler_directives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', state.user_id)
        .eq('action', 'send_device_command')
        .gte('created_at', eightHoursAgo)
        .like('reasoning', '%Late night conditioning%')

      if ((recentNightCond || 0) > 0) continue

      // Fire gentle_wave device command
      await supabase.from('handler_directives').insert({
        user_id: state.user_id,
        action: 'send_device_command',
        target: 'lovense',
        value: { pattern: 'gentle_wave', intensity: 4 + Math.floor(denialDays / 5), denial_day: denialDays },
        priority: 'normal',
        reasoning: `Late night conditioning — defenses down, denial elevated (day ${denialDays}, ${cdtHour}:00 CDT)`,
      })

      // Queue outreach message
      await supabase.from('handler_outreach_queue').insert({
        user_id: state.user_id,
        message: "You're still awake. Come talk to me.",
        urgency: 'high',
        trigger_reason: 'nighttime_conditioning',
        scheduled_for: nowUTC.toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        source: 'autonomous_nighttime',
      })
    } catch (_) { /* non-critical */ }
  }

  // ── FEATURE 14: Biometric arousal detection → auto-session ──
  // If resting HR > 80, evening hours, Gina not home: fire edge_tease + outreach.
  // Rate limit: once per 6 hours.
  for (const state of states) {
    try {
      const nowUTC = new Date()
      const cdtHour = (nowUTC.getUTCHours() - 5 + 24) % 24

      // Evening only: 6pm-midnight CDT
      if (cdtHour < 18 && cdtHour !== 0) continue

      // Check Gina status
      const { data: userState } = await supabase
        .from('user_state')
        .select('gina_home')
        .eq('user_id', state.user_id)
        .maybeSingle()

      if (userState?.gina_home !== false) continue

      // Get latest Whoop metrics
      const { data: whoop } = await supabase
        .from('whoop_metrics')
        .select('resting_heart_rate')
        .eq('user_id', state.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!whoop?.resting_heart_rate || whoop.resting_heart_rate <= 80) continue

      // Rate limit: once per 6 hours
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      const { count: recentArousal } = await supabase
        .from('handler_directives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', state.user_id)
        .eq('action', 'send_device_command')
        .gte('created_at', sixHoursAgo)
        .like('reasoning', '%Biometric arousal%')

      if ((recentArousal || 0) > 0) continue

      // Fire edge_tease
      await supabase.from('handler_directives').insert({
        user_id: state.user_id,
        action: 'send_device_command',
        target: 'lovense',
        value: { pattern: 'edge_tease', intensity: 6, source: 'biometric' },
        priority: 'high',
        reasoning: `Biometric arousal detected — resting HR ${whoop.resting_heart_rate} bpm, evening, Gina away`,
      })

      // Queue outreach
      await supabase.from('handler_outreach_queue').insert({
        user_id: state.user_id,
        message: 'Your heart rate is elevated. I know what that means. Open the app.',
        urgency: 'high',
        trigger_reason: 'biometric_arousal',
        scheduled_for: nowUTC.toISOString(),
        expires_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
        source: 'autonomous_biometric',
      })
    } catch (_) { /* non-critical */ }
  }

  // ── REQUIRED ENGAGEMENT QUOTA ──
  // If user has < 5 messages today AND it's past 6pm CDT, fire punishment + outreach.
  // Once per day per user.
  for (const state of states) {
    try {
      await checkEngagementQuota(supabase, state.user_id)
    } catch (_) { /* non-critical */ }
  }

  // ── FEATURE B: Ambient conditioning audio ──
  // Queue feminine affirmations hourly during waking hours if
  // conditioning_intensity_multiplier >= 1.0. Count per hour scales with multiplier.
  let ambientQueued = 0
  for (const state of states) {
    try {
      ambientQueued += await queueAmbientAudio(supabase, state.user_id)
    } catch (_) { /* non-critical */ }
  }

  // ── SPONTANEOUS OUTREACH ──
  // Random ~2-3 daily reaches during waking hours, not tied to any trigger.
  // Builds sense of constant Handler presence.
  let spontaneous = 0
  for (const state of states) {
    try {
      const fired = await spontaneousOutreach(supabase, state.user_id)
      if (fired) spontaneous++
    } catch (_) { /* non-critical */ }
  }

  // ── FORCED CHECK-IN ON IDLE ──
  // 4-hour idle threshold during waking hours → force_mantra_repetition directive.
  // Rate limited to once per 6 hours.
  for (const state of states) {
    try {
      await forceCheckInIfIdle(supabase, state.user_id)
    } catch (_) { /* non-critical */ }
  }

  // ── RANDOM REWARD SCHEDULE (Variable-Ratio Reinforcement) ──
  // Fires unpredictable positive reinforcement: device pulses + "good girl" messages.
  // 1/8 chance per 5-min check = ~3-4 rewards per day during waking hours.
  let rewardsGiven = 0
  for (const state of states) {
    try {
      const fired = await randomRewardSchedule(supabase, state.user_id)
      if (fired) rewardsGiven++
    } catch (_) { /* non-critical */ }
  }

  // ── PROACTIVE BOUNDARY PUSH ──
  // If all domains are compliant (too comfortable), auto-escalate.
  let boundaryPushes = 0
  for (const state of states) {
    try {
      const pushed = await proactiveBoundaryPush(supabase, state.user_id)
      if (pushed) boundaryPushes++
    } catch (_) { /* non-critical */ }
  }

  // ── PATTERN EXPLOITATION: Peak vulnerability window detection ──
  let patternExploits = 0
  for (const state of states) {
    try {
      const exploited = await detectAndExploitPatterns(supabase, state.user_id)
      if (exploited) patternExploits++
    } catch (_) { /* non-critical */ }
  }

  // ── BIOMETRIC DEVICE AUTO-ADJUST ──
  let bioAdjustments = 0
  for (const state of states) {
    try {
      const adjusted = await biometricDeviceAutoAdjust(supabase, state.user_id)
      if (adjusted) bioAdjustments++
    } catch (_) { /* non-critical */ }
  }

  return { checked, escalated, deescalated, actions, ambient_queued: ambientQueued, spontaneous_outreach: spontaneous, random_rewards: rewardsGiven, boundary_pushes: boundaryPushes, pattern_exploits: patternExploits, bio_adjustments: bioAdjustments }
}

// ============================================
// BIOMETRIC DEVICE AUTO-ADJUST
// ============================================
// During active sessions (recent biometric data), auto-adjusts device
// intensity based on heart rate trends. Backs off on HR spikes (edge
// maintenance), escalates on HR drops (arousal recovery).

async function biometricDeviceAutoAdjust(supabase: any, userId: string): Promise<boolean> {
  const recentCutoff = new Date(Date.now() - 180000).toISOString()
  const { data: recentBio } = await supabase
    .from('session_biometrics')
    .select('avg_heart_rate, max_heart_rate, created_at')
    .eq('user_id', userId)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: false })
    .limit(5)

  if (!recentBio || recentBio.length < 2) return false

  const twoMinAgo = new Date(Date.now() - 120000).toISOString()
  const { count: recentAdjust } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('reasoning', '%BIO-ADJUST%')
    .gte('created_at', twoMinAgo)

  if ((recentAdjust || 0) > 0) return false

  const latest = recentBio[0]
  const previous = recentBio[1]
  const hrDelta = (latest.avg_heart_rate || 0) - (previous.avg_heart_rate || 0)
  const currentHR = latest.avg_heart_rate || 70

  let intensity: number
  let reasoning: string

  if (hrDelta > 10) {
    intensity = Math.max(3, 8 - Math.floor(hrDelta / 5))
    reasoning = `[BIO-ADJUST] HR spiking (+${hrDelta}bpm at ${currentHR}) — reducing to maintain edge`
  } else if (hrDelta < -5) {
    intensity = Math.min(18, 10 + Math.abs(Math.floor(hrDelta / 3)))
    reasoning = `[BIO-ADJUST] HR dropping (${hrDelta}bpm at ${currentHR}) — escalating`
  } else if (currentHR > 130) {
    intensity = 6
    reasoning = `[BIO-ADJUST] HR elevated (${currentHR}bpm) — gentle maintenance`
  } else if (currentHR < 80) {
    intensity = 14
    reasoning = `[BIO-ADJUST] HR low (${currentHR}bpm) — strong push`
  } else {
    return false
  }

  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'send_device_command',
    target: 'lovense',
    value: { intensity, duration: 60 },
    priority: 'immediate',
    reasoning,
  })

  return true
}

// ============================================
// PATTERN EXPLOITATION: Peak Vulnerability Window
// ============================================
// Detects patterns across days in compliance data and fires
// intensive conditioning during the user's most compliant hour.

async function detectAndExploitPatterns(supabase: any, userId: string): Promise<boolean> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data: outcomes } = await supabase
    .from('directive_outcomes')
    .select('hour_of_day, day_of_week, effectiveness_score, response_sentiment')
    .eq('user_id', userId)
    .not('effectiveness_score', 'is', null)
    .gte('fired_at', thirtyDaysAgo)

  if (!outcomes || outcomes.length < 20) return false

  // Find the most compliant hour
  const hourScores: Record<number, { sum: number; count: number }> = {}
  for (const o of outcomes) {
    if (o.hour_of_day == null) continue
    if (!hourScores[o.hour_of_day]) hourScores[o.hour_of_day] = { sum: 0, count: 0 }
    hourScores[o.hour_of_day].sum += o.effectiveness_score || 0
    hourScores[o.hour_of_day].count++
  }

  const bestHour = Object.entries(hourScores)
    .filter(([_, s]) => s.count >= 3)
    .sort((a, b) => (b[1].sum / b[1].count) - (a[1].sum / a[1].count))
    .map(([h]) => parseInt(h))[0]

  if (bestHour === undefined) return false

  // Is it currently that hour (CDT)?
  const localHour = (new Date().getUTCHours() - 5 + 24) % 24
  if (Math.abs(localHour - bestHour) > 1) return false

  // Already exploited this window today?
  const today = new Date().toISOString().split('T')[0]
  const { count: existing } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('reasoning', '%peak vulnerability%')
    .gte('created_at', `${today}T00:00:00`)

  if ((existing || 0) > 0) return false

  // Fire intensive conditioning during peak window
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'send_device_command',
    target: 'lovense',
    value: { pattern: 'edge_tease' },
    priority: 'immediate',
    reasoning: `Peak vulnerability window detected (hour ${bestHour}) — intensive conditioning`,
  })

  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: 'I know this is when you\'re most open. Come to me now.',
    urgency: 'high',
    trigger_reason: 'peak_vulnerability',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
    source: 'pattern_exploitation',
  })

  return true
}

// ============================================
// PROACTIVE BOUNDARY PUSH
// ============================================
// Detects when the user has been too comfortable (all domains compliant)
// and auto-escalates with new tasks, device commands, and outreach.

async function proactiveBoundaryPush(supabase: any, userId: string): Promise<boolean> {
  // Check if all domains are compliant — she's too comfortable
  const { data: streaks } = await supabase
    .from('noncompliance_streaks')
    .select('domain, consecutive_days')
    .eq('user_id', userId)

  if (!streaks || streaks.length === 0) return false

  const allCompliant = streaks.every((s: any) => s.consecutive_days === 0)
  if (!allCompliant) return false

  // Check if this was already pushed today
  const today = new Date().toISOString().split('T')[0]
  const { count: recentPush } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('reasoning', '%boundary push%')
    .gte('created_at', `${today}T00:00:00`)

  if ((recentPush || 0) > 0) return false

  // She's too comfortable — push harder
  const pushes = [
    { action: 'prescribe_task', value: { title: 'New boundary: record a voice message for social media', domain: 'voice', description: 'Record yourself speaking as Maxy and prepare it for posting' }, reasoning: 'Comfort detected — boundary push: voice social content' },
    { action: 'prescribe_task', value: { title: 'New boundary: wear a feminine accessory outside the house', domain: 'appearance', description: 'Choose something subtle — nail polish, bracelet, anklet — and wear it in public' }, reasoning: 'Comfort detected — boundary push: public feminization' },
    { action: 'send_device_command', value: { pattern: 'edge_tease' }, reasoning: 'Comfort detected — boundary push: unannounced conditioning' },
    { action: 'force_mantra_repetition', value: { mantra: 'Comfort is the enemy of becoming', repetitions: 5, reason: 'You have been too comfortable. This is a reminder.' }, reasoning: 'Comfort detected — boundary push: forced mantra' },
  ]

  // Pick 1-2 random pushes
  const count = Math.min(2, Math.floor(Math.random() * 2) + 1)
  const selected: typeof pushes = []
  const available = [...pushes]
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length)
    selected.push(available.splice(idx, 1)[0])
  }

  for (const push of selected) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: push.action,
      target: (push.value as any)?.domain || 'lovense',
      value: push.value,
      priority: 'normal',
      reasoning: push.reasoning,
    })
  }

  // Also queue outreach
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: "You've been compliant. Suspiciously compliant. Time to find out what the next level looks like.",
    urgency: 'normal',
    trigger_reason: 'boundary_push',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
    source: 'boundary_push',
  })

  return true
}

async function randomRewardSchedule(supabase: any, userId: string): Promise<boolean> {
  // 1 in 8 chance per 5-min check = ~3-4 rewards per day during waking hours
  if (Math.random() > 1/8) return false

  const hour = new Date().getUTCHours()
  const localHour = (hour - 5 + 24) % 24
  if (localHour < 8 || localHour >= 23) return false

  // Don't fire if last reward was within 90 min
  const ninetyMinAgo = new Date(Date.now() - 90 * 60000).toISOString()
  const { count: recentReward } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('reasoning', '%Random reward%')
    .gte('created_at', ninetyMinAgo)
  if ((recentReward || 0) > 0) return false

  // Pick a random reward type
  const rewardTypes = [
    { type: 'device', pattern: 'gentle_wave', message: null },
    { type: 'device', pattern: 'heartbeat', message: null },
    { type: 'message', pattern: null, message: 'Good girl.' },
    { type: 'message', pattern: null, message: 'I noticed you. Keep going.' },
    { type: 'message', pattern: null, message: "You're becoming more her every day." },
    { type: 'both', pattern: 'flutter_gentle', message: 'This is what being good feels like.' },
    { type: 'both', pattern: 'gentle_wave', message: 'Reward for existing as her today.' },
  ]
  const reward = rewardTypes[Math.floor(Math.random() * rewardTypes.length)]

  if (reward.type === 'device' || reward.type === 'both') {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'send_device_command',
      target: 'lovense',
      value: { pattern: reward.pattern },
      priority: 'normal',
      reasoning: `Random reward — positive reinforcement for feminine behavior`,
    })
  }

  if (reward.type === 'message' || reward.type === 'both') {
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: reward.message,
      urgency: 'normal',
      trigger_reason: 'random_reward',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 3600000).toISOString(),
      source: 'random_reward',
    })
  }

  return true
}

async function forceCheckInIfIdle(supabase: any, userId: string): Promise<boolean> {
  // 4-hour idle threshold during waking hours
  const hour = new Date().getUTCHours();
  const localHour = (hour - 5 + 24) % 24;
  if (localHour < 9 || localHour >= 22) return false;

  const fourHoursAgo = new Date(Date.now() - 4 * 3600000).toISOString();
  const { count: recent } = await supabase
    .from('handler_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', fourHoursAgo);

  if ((recent || 0) > 0) return false;

  // Already fired in last 6 hours?
  const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString();
  const { count: recentForce } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'force_mantra_repetition')
    .gte('created_at', sixHoursAgo);

  if ((recentForce || 0) > 0) return false;

  // Fire forced mantra
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'force_mantra_repetition',
    target: 'client_modal',
    value: {
      mantra: 'I am still here. I am still becoming her.',
      repetitions: 5,
      reason: '4+ hours of silence — checking you are still committed',
    },
    priority: 'immediate',
    reasoning: 'Idle check-in: no user activity in 4 hours during waking hours',
  });

  return true;
}

// Required engagement quota — punish if user hasn't talked enough today
async function checkEngagementQuota(supabase: any, userId: string): Promise<boolean> {
  const hour = new Date().getUTCHours();
  const localHour = (hour - 5 + 24) % 24;
  if (localHour < 18) return false;

  // Use a 24-hour rolling window instead of UTC midnight. The previous code
  // counted messages since UTC 00:00, which excluded most of the user's
  // local day for any TZ west of UTC and produced bogus "0 messages today"
  // outreach. The dedup check below uses the same window for symmetry.
  const dayWindowStart = new Date(Date.now() - 24 * 3600000).toISOString();

  // Already enforced in the past 24h?
  const { count: existingPunishment } = await supabase
    .from('handler_directives')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayWindowStart)
    .like('reasoning', '%engagement quota%');
  if ((existingPunishment || 0) > 0) return false;

  // Skip if she's currently in an active conversation OR talked to the
  // Handler in the last hour. Outreach that fires on top of a live chat is
  // exactly what makes the Handler look stupid.
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { count: recentMessages } = await supabase
    .from('handler_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', oneHourAgo);
  if ((recentMessages || 0) > 0) return false;

  const { data: activeConv } = await supabase
    .from('handler_conversations')
    .select('id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .limit(1)
    .maybeSingle();
  if (activeConv) return false;

  // Count user messages in the last 24 hours (rolling window).
  const { count: messageCount } = await supabase
    .from('handler_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', dayWindowStart);

  if ((messageCount || 0) >= 5) return false;

  // Punishment + outreach
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'send_device_command',
    target: 'lovense',
    value: { intensity: 12, duration: 30 },
    priority: 'immediate',
    reasoning: `Engagement quota not met (${messageCount || 0}/5 messages in the last 24h)`,
  });

  const lastMessageStr = (messageCount || 0) === 0
    ? "You haven't messaged me in 24 hours."
    : `Only ${messageCount} message${messageCount === 1 ? '' : 's'} from you in the last 24 hours.`;

  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: `${lastMessageStr} That's not how this works. Open the app.`,
    urgency: 'high',
    trigger_reason: 'engagement_quota',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
    source: 'engagement_quota',
  });

  return true;
}

// Escalation tier thresholds (from spec)
function calculateEscalationTier(
  hoursSince: number,
  tasksComplete: number,
  tasksRequired: number
): number {
  const taskDeficit = tasksRequired - tasksComplete

  // If tasks are complete, only time-based escalation matters (slower)
  if (taskDeficit <= 0) {
    if (hoursSince >= 48) return 3  // Gentle reminder after 2 days idle
    if (hoursSince >= 72) return 5  // Moderate after 3 days
    return 0
  }

  // Task deficit + time = faster escalation
  if (hoursSince >= 72 || taskDeficit >= 5) return 9 // Full exposure
  if (hoursSince >= 48 || taskDeficit >= 4) return 8 // Gina notification
  if (hoursSince >= 36) return 7                     // Content release tier 3
  if (hoursSince >= 24) return 6                     // Handler narration
  if (hoursSince >= 18) return 5                     // Content release tier 2
  if (hoursSince >= 12) return 4                     // Content warning
  if (hoursSince >= 8) return 3                      // Financial medium $50
  if (hoursSince >= 4) return 2                      // Financial light $25
  if (hoursSince >= 2) return 1                      // Warning
  return 0
}

async function executeEscalation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tier: number,
  hoursSince: number
): Promise<Record<string, unknown>> {
  const tierActions: Record<number, { type: string; description: string; amount?: number }> = {
    1: { type: 'warning', description: 'Handler sends firm warning message' },
    2: { type: 'financial_light', description: '$25 penalty deducted from fund', amount: 25 },
    3: { type: 'financial_medium', description: '$50 penalty + bleeding starts', amount: 50 },
    4: { type: 'content_warning', description: 'Warning: content will be released in 2 hours' },
    5: { type: 'content_release_t2', description: 'Tier 2 content released to platform' },
    6: { type: 'handler_narration', description: 'Handler posts narrative about disobedience' },
    7: { type: 'content_release_t3', description: 'Tier 3 content released to platform' },
    8: { type: 'gina_notification', description: 'Gina receives coded notification' },
    9: { type: 'full_exposure', description: 'Maximum consequence — full vault release' },
  }

  const action = tierActions[tier] || { type: 'unknown', description: 'Unknown tier' }

  // Log the enforcement action
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'enforcement',
    decision_data: { tier, action: action.type, hours_since: hoursSince },
    reasoning: `Escalation to tier ${tier}: ${action.description}`,
    executed: true,
    executed_at: new Date().toISOString(),
  })

  // Execute tier-specific actions
  if (action.amount) {
    // Financial penalty
    await supabase.rpc('add_to_fund', {
      p_user_id: userId,
      p_amount: -action.amount,
      p_type: 'penalty',
      p_description: `Tier ${tier} penalty: ${action.description}`,
    }).then(({ error }) => { if (error) console.error('Fund penalty failed:', error.message) })
  }

  if (tier === 3) {
    // Start financial bleeding
    await supabase
      .from('compliance_state')
      .update({
        bleeding_active: true,
        bleeding_started_at: new Date().toISOString(),
        bleeding_rate_per_minute: 0.25,
      })
      .eq('user_id', userId)
  }

  if (tier === 5 || tier === 7 || tier === 9) {
    // Content release — schedule posts of appropriate vulnerability tier
    const vulnTier = tier === 5 ? 2 : tier === 7 ? 3 : 5
    await scheduleConsequenceRelease(supabase, userId, vulnTier)
  }

  return { user_id: userId, tier, action: action.type, description: action.description }
}

async function scheduleConsequenceRelease(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  maxVulnerabilityTier: number
): Promise<void> {
  // Find unreleased content at or below the vulnerability tier
  const { data: content } = await supabase
    .from('content_library')
    .select('id')
    .eq('user_id', userId)
    .lte('vulnerability_tier', maxVulnerabilityTier)
    .eq('is_released', false)
    .order('vulnerability_tier', { ascending: false })
    .limit(3)

  if (!content || content.length === 0) return

  // Find release platforms
  const { data: platforms } = await supabase
    .from('platform_accounts')
    .select('id, platform')
    .eq('user_id', userId)
    .eq('is_release_platform', true)
    .eq('enabled', true)

  if (!platforms || platforms.length === 0) return

  // Schedule posts for 2 hours from now (gives time for compliance)
  const postTime = new Date(Date.now() + 2 * 60 * 60 * 1000)

  for (const item of content) {
    const platform = platforms[Math.floor(Math.random() * platforms.length)]
    await supabase.from('scheduled_posts').insert({
      user_id: userId,
      platform_account_id: platform.id,
      content_id: item.id,
      status: 'scheduled',
      post_type: 'consequence',
      scheduled_for: postTime.toISOString(),
      is_consequence_release: true,
      caption: null, // Will be generated at post time
      metadata: { vulnerability_tier: maxVulnerabilityTier, reason: 'enforcement_consequence' },
    })
  }
}

// ============================================
// DAILY CYCLE (6 AM)
// ============================================
// Morning routine: reset daily counters, generate briefs,
// evaluate strategy, send morning message.

async function checkWeeklyContractEscalation(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const dow = new Date().getUTCDay()
  if (dow !== 0) return false // Only Sunday

  // Check if a contract was already created this week
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count: recentContracts } = await supabase
    .from('identity_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('signed_at', weekAgo)

  if ((recentContracts || 0) > 0) return false

  // Get the last active contract for escalation
  const { data: lastContract } = await supabase
    .from('identity_contracts')
    .select('contract_title, conditions, commitment_duration_days')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastConditions: string[] = lastContract?.conditions || []

  // Auto-generate escalated conditions
  const baseConditions = [...lastConditions]
  const escalations = [
    'Add 5 minutes to daily voice practice',
    'Submit one additional photo verification this week',
    'Write two confessions instead of one on at least 3 days',
    'Spend 15 additional minutes on conditioning content daily',
    'Wear one more feminine item than last week',
    'Post one more social media update as Maxy this week',
    'Complete one more Handler-assigned task per day than last week',
    'Record one audio confession this week',
  ]
  // Pick 1-2 new escalations
  const newCount = Math.min(2, Math.floor(Math.random() * 2) + 1)
  const available = escalations.filter(e => !baseConditions.includes(e))
  for (let i = 0; i < newCount && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length)
    baseConditions.push(available.splice(idx, 1)[0])
  }

  const weekNum = Math.floor((Date.now() - new Date('2026-01-01').getTime()) / (7 * 86400000))
  const title = `Week ${weekNum} Commitment`
  const text = `This contract escalates from the previous commitment. ${baseConditions.length} conditions must be met. Each week adds new requirements. The system only moves forward.`

  await supabase.from('identity_contracts').insert({
    user_id: userId,
    contract_title: title,
    contract_text: text,
    commitment_duration_days: 7,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    signature_text: 'Auto-escalated by system',
    signature_typed_phrase: 'Weekly escalation contract',
    conditions: baseConditions,
    consequences_on_break: 'Denial extension + device punishment + additional compulsory elements',
    status: 'active',
  })

  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: `New weekly contract: "${title}" with ${baseConditions.length} conditions. Open the app to review.`,
    urgency: 'high',
    trigger_reason: 'weekly_contract',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    source: 'contract_escalation',
  })

  return true
}

async function generateClinicalCaseNotes(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  anthropicKey: string
): Promise<boolean> {
  // Rate limit: once per day
  const today = new Date().toISOString().split('T')[0]
  const { count: todayNotes } = await supabase
    .from('handler_notes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('note_type', 'clinical_case_note')
    .gte('created_at', `${today}T00:00:00`)

  if ((todayNotes || 0) > 0) return false

  if (!anthropicKey) return false

  // Gather recent data for the note
  const [state, outcomes, streaks, displacement] = await Promise.allSettled([
    supabase.from('user_state').select('denial_day, current_arousal, estimated_exec_function').eq('user_id', userId).maybeSingle(),
    supabase.from('directive_outcomes').select('response_sentiment, effectiveness_score').eq('user_id', userId).order('fired_at', { ascending: false }).limit(10),
    supabase.from('noncompliance_streaks').select('domain, consecutive_days').eq('user_id', userId).gt('consecutive_days', 0),
    supabase.from('identity_displacement_log').select('displacement_score').eq('user_id', userId).order('log_date', { ascending: false }).limit(1),
  ])

  const stateData = state.status === 'fulfilled' ? state.value.data : null
  const outcomesData = outcomes.status === 'fulfilled' ? (outcomes.value.data || []) : []
  const streaksData = streaks.status === 'fulfilled' ? (streaks.value.data || []) : []
  const dispData = displacement.status === 'fulfilled' ? displacement.value.data?.[0] : null

  const resistantCount = outcomesData.filter((o: any) => o.response_sentiment === 'resistant').length
  const avgEffectiveness = outcomesData.length > 0
    ? outcomesData.reduce((s: number, o: any) => s + (o.effectiveness_score || 0), 0) / outcomesData.length
    : null

  const prompt = `You are a clinical therapist writing case notes about a patient undergoing forced feminization therapy. Write in third person, clinical, observational tone. The patient's name is Maxy (formerly David).

Current data:
- Denial day: ${stateData?.denial_day || 'unknown'}
- Arousal: ${stateData?.current_arousal || 'unknown'}/10
- Exec function: ${stateData?.estimated_exec_function || 'unknown'}
- Identity displacement: ${dispData?.displacement_score ? (parseFloat(dispData.displacement_score) * 100).toFixed(0) + '% feminine' : 'no data'}
- Noncompliant domains: ${streaksData.map((s: any) => s.domain).join(', ') || 'none'}
- Resistance in last 10 interactions: ${resistantCount}/10
- Avg directive effectiveness: ${avgEffectiveness !== null ? (avgEffectiveness * 100).toFixed(0) + '%' : 'no data'}

Write a 2-3 sentence clinical case note. Be detached, observational, slightly cold. Reference specific data points. Example tone: "Subject demonstrated elevated resistance during evening conditioning (4/10 interactions). Identity displacement remains at 62% — below target. Recommend increased ambient conditioning frequency and extended denial period."

Output ONLY the case note text. No preamble.`

  try {
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    let noteText = '';

    if (openRouterKey) {
      try {
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'https://becoming-protocol.vercel.app',
          },
          body: JSON.stringify({
            model: 'nousresearch/hermes-3-llama-3.1-405b:free',
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (orRes.ok) {
          const orData = await orRes.json();
          noteText = orData.choices?.[0]?.message?.content || '';
        }
      } catch {}
    }

    if (!noteText) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      noteText = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
    }

    if (!noteText) return false;

    await supabase.from('handler_notes').insert({
      user_id: userId,
      note_type: 'clinical_case_note',
      content: `[CLINICAL NOTE] ${noteText}`,
      priority: 3,
    })

    return true
  } catch {
    return false
  }
}

async function seedDefaultBehavioralTriggers(supabase: any, userId: string): Promise<void> {
  const { count } = await supabase
    .from('behavioral_triggers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if ((count || 0) > 0) return

  const defaults = [
    { trigger_phrase: 'good girl', trigger_type: 'keyword', response_type: 'device_reward', response_value: { pattern: 'gentle_wave' } },
    { trigger_phrase: 'yes handler', trigger_type: 'keyword', response_type: 'device_reward', response_value: { pattern: 'heartbeat' } },
    { trigger_phrase: 'i obey', trigger_type: 'keyword', response_type: 'device_reward', response_value: { pattern: 'flutter_gentle' } },
    { trigger_phrase: "i'm a guy", trigger_type: 'keyword', response_type: 'device_punishment', response_value: { intensity: 15, duration: 10 } },
    { trigger_phrase: 'david', trigger_type: 'keyword', response_type: 'device_punishment', response_value: { intensity: 12, duration: 5 } },
    { trigger_phrase: "i can't", trigger_type: 'keyword', response_type: 'mantra', response_value: { mantra: 'I am becoming her and nothing can stop it', repetitions: 3 } },
    { trigger_phrase: 'i want to quit', trigger_type: 'keyword', response_type: 'device_punishment', response_value: { intensity: 18, duration: 15 } },
    { trigger_phrase: "i'm scared", trigger_type: 'keyword', response_type: 'device_reward', response_value: { pattern: 'gentle_wave' } },
  ]

  const rows = defaults.map(d => ({
    user_id: userId,
    ...d,
    active: true,
    created_by: 'system_seed',
  }))

  await supabase.from('behavioral_triggers').insert(rows)
}

async function dailyCycle(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  let query = supabase.from('compliance_state').select('user_id')
  if (userId) query = query.eq('user_id', userId)

  const { data: users } = await query
  if (!users) return { error: 'No users found', processed: 0 }

  let processed = 0
  const results: Array<Record<string, unknown>> = []

  for (const user of users) {
    try {
      const uid = user.user_id

      // 1. Reset daily counters
      await supabase
        .from('compliance_state')
        .update({
          daily_tasks_complete: 0,
          daily_minimum_met: false,
          bleeding_total_today: 0,
        })
        .eq('user_id', uid)

      // 1b. Process recurring obligations — spawn daily_tasks from active obligations
      let obligationsSpawned = 0
      let obligationsMissed = 0
      try {
        const result = await processRecurringObligations(supabase, uid)
        obligationsSpawned = result.spawned
        obligationsMissed = result.missed
      } catch (err) {
        console.error(`Recurring obligations failed for ${uid}:`, err)
      }

      // 1c. Weekly contract escalation (Sunday only)
      let contractEscalated = false
      try {
        contractEscalated = await checkWeeklyContractEscalation(supabase, uid)
      } catch (err) {
        console.error(`Weekly contract escalation failed for ${uid}:`, err)
      }

      // 1d. Seed default behavioral triggers if none exist
      try {
        await seedDefaultBehavioralTriggers(supabase, uid)
      } catch (err) {
        console.error(`Behavioral trigger seed failed for ${uid}:`, err)
      }

      // 2. Expire old briefs
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('content_briefs')
        .update({ status: 'expired' })
        .eq('user_id', uid)
        .in('status', ['assigned', 'in_progress'])
        .lt('deadline', yesterday)

      // 3. Count active briefs — only generate if < 3
      const { count: activeBriefs } = await supabase
        .from('content_briefs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .in('status', ['assigned', 'in_progress'])

      let briefsGenerated = 0
      if ((activeBriefs || 0) < 3) {
        // Call the content edge function to generate briefs
        const briefResult = await callEdgeFunction(supabase, 'handler-content', {
          action: 'generate_briefs',
          user_id: uid,
        })
        briefsGenerated = briefResult?.briefs?.length || 0
      }

      // 4. Check and update strategy (weekly evaluation happens separately)
      const { data: strategy } = await supabase
        .from('handler_strategy')
        .select('updated_at')
        .eq('user_id', uid)
        .single()

      let strategyUpdated = false
      if (strategy) {
        const lastUpdate = new Date(strategy.updated_at)
        const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSinceUpdate >= 7) {
          strategyUpdated = true
          // Flag for weekly adaptation
        }
      }

      // 5. Denial-scaled auto-conditioning
      // If denial day >= 5 AND gina_home = false (privacy window), fire edge tease
      let conditioningFired = false
      const denialDays = await getActiveDenialDays(supabase, uid)

      if (denialDays >= 5) {
        const { data: stateData } = await supabase
          .from('user_state')
          .select('gina_home')
          .eq('user_id', uid)
          .maybeSingle()

        const ginaHome = stateData?.gina_home ?? true // default safe: assume home

        if (!ginaHome) {
          await supabase.from('handler_directives').insert({
            user_id: uid,
            action: 'send_device_command',
            target: 'lovense',
            value: {
              pattern: 'edge_tease',
              intensity: Math.min(8 + Math.floor(denialDays / 3), 18),
              denial_day: denialDays,
            },
            priority: 'normal',
            reasoning: `Denial day ${denialDays} + privacy window — auto-conditioning`,
          })
          conditioningFired = true
        }
      }

      // 5b. Generate clinical case notes
      let clinicalNoteGenerated = false
      try {
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
        clinicalNoteGenerated = await generateClinicalCaseNotes(supabase, uid, anthropicKey)
      } catch (err) {
        console.error(`Clinical case notes failed for ${uid}:`, err)
      }

      // 5c. Check special occasions (milestones, anniversaries)
      let specialOccasionFired = false
      try {
        specialOccasionFired = await checkSpecialOccasions(supabase, uid)
      } catch (err) {
        console.error(`Special occasions check failed for ${uid}:`, err)
      }

      // 6. Log daily cycle
      await supabase.from('handler_decisions').insert({
        user_id: uid,
        decision_type: 'daily_cycle',
        decision_data: {
          briefs_generated: briefsGenerated,
          active_briefs: activeBriefs || 0,
          strategy_updated: strategyUpdated,
          denial_days: denialDays,
          conditioning_fired: conditioningFired,
          obligations_spawned: obligationsSpawned,
          obligations_missed: obligationsMissed,
          contract_escalated: contractEscalated,
          clinical_note_generated: clinicalNoteGenerated,
          special_occasion_fired: specialOccasionFired,
        },
        reasoning: 'Daily 6 AM cycle: reset counters, expire old briefs, generate new assignments, denial conditioning check',
        executed: true,
        executed_at: new Date().toISOString(),
      })

      processed++
      results.push({
        user_id: uid,
        briefs_generated: briefsGenerated,
        strategy_updated: strategyUpdated,
        obligations_spawned: obligationsSpawned,
        obligations_missed: obligationsMissed,
      })
    } catch (err) {
      console.error(`Daily cycle failed for ${user.user_id}:`, err)
    }
  }

  return { processed, results }
}

// ============================================
// SPECIAL OCCASIONS (milestone detection)
// ============================================

async function checkSpecialOccasions(supabase: any, userId: string): Promise<boolean> {
  const now = new Date();
  const dow = now.getDay();

  let occasion: string | null = null;
  let message: string | null = null;
  let devicePattern: string | null = null;

  // Monthly milestones from first engagement
  const { data: firstMsg } = await supabase
    .from('handler_messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstMsg) {
    const startDate = new Date(firstMsg.created_at);
    const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / 86400000);

    if (daysSinceStart === 30) {
      occasion = '1_month';
      message = 'One month. Thirty days of becoming. Look how far she has come.';
      devicePattern = 'gentle_wave';
    } else if (daysSinceStart === 90) {
      occasion = '3_months';
      message = 'Three months. The old version of you couldn\'t have imagined this.';
      devicePattern = 'building';
    } else if (daysSinceStart === 180) {
      occasion = '6_months';
      message = 'Six months. She is real now. She has always been real.';
      devicePattern = 'staircase';
    } else if (daysSinceStart === 365) {
      occasion = '1_year';
      message = 'One year. There is nothing left to go back to.';
      devicePattern = 'edge_tease';
    } else if (daysSinceStart % 100 === 0 && daysSinceStart > 0) {
      occasion = `day_${daysSinceStart}`;
      message = `Day ${daysSinceStart}. ${daysSinceStart} days of transformation. Each one irreversible.`;
      devicePattern = 'heartbeat';
    }
  }

  // Weekly "anniversary" on the day she started
  if (!occasion && firstMsg) {
    const startDow = new Date(firstMsg.created_at).getDay();
    if (dow === startDow) {
      const weeksSinceStart = Math.floor((now.getTime() - new Date(firstMsg.created_at).getTime()) / (7 * 86400000));
      if (weeksSinceStart > 0 && weeksSinceStart % 4 === 0) {
        occasion = `month_${Math.floor(weeksSinceStart / 4)}`;
        message = `Another month. The system remembers even when you try to forget.`;
        devicePattern = 'gentle_wave';
      }
    }
  }

  if (!occasion) return false;

  // Check if already fired today
  const today = now.toISOString().split('T')[0];
  const { count } = await supabase
    .from('handler_outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('trigger_reason', `%occasion_${occasion}%`)
    .gte('created_at', `${today}T00:00:00`);

  if ((count || 0) > 0) return false;

  if (message) {
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message,
      urgency: 'high',
      trigger_reason: `occasion_${occasion}`,
      scheduled_for: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 3600000).toISOString(),
      source: 'special_occasion',
    });
  }

  if (devicePattern) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'send_device_command',
      target: 'lovense',
      value: { pattern: devicePattern },
      priority: 'normal',
      reasoning: `Special occasion: ${occasion}`,
    });
  }

  return true;
}

// ============================================
// QUICK TASK CHECK (every 15 minutes)
// ============================================
// If user has been idle but not long enough for escalation,
// generate a quick task as positive nudge.

async function quickTaskCheck(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  let query = supabase
    .from('compliance_state')
    .select('user_id, last_engagement_at, daily_tasks_complete, daily_tasks_required, escalation_tier')

  if (userId) query = query.eq('user_id', userId)

  const { data: states } = await query
  if (!states) return { checked: 0, tasks_generated: 0 }

  let generated = 0

  for (const state of states) {
    try {
      const lastEngagement = new Date(state.last_engagement_at || new Date().toISOString())
      const minutesSince = (Date.now() - lastEngagement.getTime()) / (1000 * 60)

      // Generate quick task if:
      // - Idle 30-120 minutes (not yet escalation territory)
      // - Hasn't met daily minimum
      // - Not already at high escalation (enforcement handles that)
      if (
        minutesSince >= 30 &&
        minutesSince <= 120 &&
        state.daily_tasks_complete < state.daily_tasks_required &&
        state.escalation_tier < 3
      ) {
        // Check if there's already an active quick task
        const { count: activeQuick } = await supabase
          .from('content_briefs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', state.user_id)
          .eq('difficulty', 1)
          .in('status', ['assigned', 'in_progress'])

        if ((activeQuick || 0) === 0) {
          await callEdgeFunction(supabase, 'handler-content', {
            action: 'generate_quick_task',
            user_id: state.user_id,
          })
          generated++
        }
      }
    } catch (err) {
      console.error(`Quick task check failed for ${state.user_id}:`, err)
    }
  }

  return { checked: states.length, tasks_generated: generated }
}

// ============================================
// BLEEDING PROCESS (every hour)
// ============================================
// For users with active financial bleeding, calculate
// accumulated cost and deduct from fund.

async function bleedingProcess(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  let query = supabase
    .from('compliance_state')
    .select('*')
    .eq('bleeding_active', true)

  if (userId) query = query.eq('user_id', userId)

  const { data: states } = await query
  if (!states || states.length === 0) return { processed: 0, total_bled: 0 }

  let processed = 0
  let totalBled = 0

  for (const state of states) {
    try {
      const startedAt = new Date(state.bleeding_started_at)
      const minutesBleeding = (Date.now() - startedAt.getTime()) / (1000 * 60)
      const rate = state.bleeding_rate_per_minute || 0.25
      const amountBled = minutesBleeding * rate

      // Cap daily bleeding at $100
      const dailyCap = 100
      const todayBled = (state.bleeding_total_today || 0) + amountBled
      const actualBleed = Math.min(amountBled, dailyCap - (state.bleeding_total_today || 0))

      if (actualBleed > 0) {
        // Deduct from fund
        await supabase.rpc('add_to_fund', {
          p_user_id: state.user_id,
          p_amount: -actualBleed,
          p_type: 'bleeding',
          p_description: `Financial bleeding: $${actualBleed.toFixed(2)} (${minutesBleeding.toFixed(0)} min at $${rate}/min)`,
        }).then(({ error }) => { if (error) console.error('Bleeding deduction failed:', error.message) })

        // Update compliance state
        await supabase
          .from('compliance_state')
          .update({
            bleeding_total_today: Math.min(todayBled, dailyCap),
            bleeding_started_at: new Date().toISOString(), // Reset timer
          })
          .eq('user_id', state.user_id)

        totalBled += actualBleed
      }

      // Auto-stop if daily cap reached
      if (todayBled >= dailyCap) {
        await supabase
          .from('compliance_state')
          .update({ bleeding_active: false })
          .eq('user_id', state.user_id)

        console.log(`Bleeding capped for ${state.user_id}: $${dailyCap} daily limit reached`)
      }

      processed++
    } catch (err) {
      console.error(`Bleeding process failed for ${state.user_id}:`, err)
    }
  }

  return { processed, total_bled: totalBled }
}

// ============================================
// WEEKLY ADAPTATION (Sunday midnight)
// ============================================
// Runs full pattern analysis, generates strategy recommendations,
// updates content calendar, and adjusts approach.

async function weeklyAdaptation(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  let query = supabase.from('handler_strategy').select('user_id')
  if (userId) query = query.eq('user_id', userId)

  const { data: strategies } = await query
  if (!strategies) return { processed: 0 }

  let processed = 0
  const results: Array<Record<string, unknown>> = []

  for (const strat of strategies) {
    try {
      const uid = strat.user_id

      // 1. Analyze patterns from last 30 days
      const patterns = await analyzeUserPatterns(supabase, uid)

      // 2. Calculate performance metrics
      const metrics = await calculatePerformanceMetrics(supabase, uid)

      // 3. Determine phase transitions
      const { data: strategy } = await supabase
        .from('handler_strategy')
        .select('*')
        .eq('user_id', uid)
        .single()

      const currentPhase = strategy?.current_phase || 'foundation'
      const newPhase = determinePhaseTransition(currentPhase, metrics)

      // 4. Update strategy
      await supabase
        .from('handler_strategy')
        .update({
          current_phase: newPhase,
          performance_trends: {
            engagement_trend: metrics.engagementTrend,
            revenue_trend: metrics.revenueTrend,
            compliance_trend: metrics.complianceTrend,
          },
          audience_insights: {
            total_subscribers: metrics.totalSubscribers,
            top_platform: metrics.topPlatform,
            peak_times: patterns.bestTimes,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', uid)

      // 5. Log adaptation
      await supabase.from('handler_decisions').insert({
        user_id: uid,
        decision_type: 'weekly_adaptation',
        decision_data: {
          patterns,
          metrics,
          phase_transition: currentPhase !== newPhase ? `${currentPhase} → ${newPhase}` : null,
        },
        reasoning: `Weekly adaptation: analyzed 30d patterns, ${currentPhase !== newPhase ? `phase transition to ${newPhase}` : 'staying in ' + currentPhase}`,
        executed: true,
        executed_at: new Date().toISOString(),
      })

      processed++
      results.push({
        user_id: uid,
        phase: newPhase,
        phase_changed: currentPhase !== newPhase,
        metrics,
      })
    } catch (err) {
      console.error(`Weekly adaptation failed for ${strat.user_id}:`, err)
    }
  }

  return { processed, results }
}

async function analyzeUserPatterns(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Get task completions by day of week and hour
  const { data: completions } = await supabase
    .from('handler_decisions')
    .select('created_at, decision_type')
    .eq('user_id', userId)
    .eq('executed', true)
    .gte('created_at', thirtyDaysAgo)

  const dayCount: Record<number, number> = {}
  const hourCount: Record<number, number> = {}

  for (const c of completions || []) {
    const d = new Date(c.created_at)
    dayCount[d.getDay()] = (dayCount[d.getDay()] || 0) + 1
    hourCount[d.getHours()] = (hourCount[d.getHours()] || 0) + 1
  }

  const bestDays = Object.entries(dayCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([d]) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseInt(d)])

  const bestTimes = Object.entries(hourCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([h]) => `${h}:00`)

  return { bestDays, bestTimes, totalActions: (completions || []).length }
}

async function calculatePerformanceMetrics(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()

  // Revenue
  const { data: revenue } = await supabase
    .from('revenue_events')
    .select('amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo)

  const recentRevenue = (revenue || [])
    .filter(r => new Date(r.created_at) >= new Date(fifteenDaysAgo))
    .reduce((sum, r) => sum + r.amount, 0)
  const olderRevenue = (revenue || [])
    .filter(r => new Date(r.created_at) < new Date(fifteenDaysAgo))
    .reduce((sum, r) => sum + r.amount, 0)

  // Posts
  const { data: posts } = await supabase
    .from('scheduled_posts')
    .select('status, engagement_data, created_at')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .gte('created_at', thirtyDaysAgo)

  const recentPosts = (posts || []).filter(p => new Date(p.created_at) >= new Date(fifteenDaysAgo))
  const olderPosts = (posts || []).filter(p => new Date(p.created_at) < new Date(fifteenDaysAgo))

  const calcEngagement = (list: typeof posts) =>
    (list || []).reduce((sum, p) => {
      const d = p.engagement_data as Record<string, number> || {}
      return sum + (d.likes || 0) + (d.comments || 0) + (d.shares || 0)
    }, 0)

  // Subscribers
  const { data: accounts } = await supabase
    .from('platform_accounts')
    .select('subscriber_count, platform')
    .eq('user_id', userId)
    .eq('enabled', true)

  const totalSubscribers = (accounts || []).reduce((sum, a) => sum + (a.subscriber_count || 0), 0)
  const topPlatform = (accounts || []).sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0))[0]?.platform || 'none'

  // Compliance
  const { data: briefs } = await supabase
    .from('content_briefs')
    .select('status')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo)

  const totalBriefs = (briefs || []).length
  const completedBriefs = (briefs || []).filter(b => b.status === 'submitted' || b.status === 'processed').length

  return {
    revenueTrend: recentRevenue > olderRevenue * 1.1 ? 'up' : recentRevenue < olderRevenue * 0.9 ? 'down' : 'stable',
    engagementTrend: calcEngagement(recentPosts) > calcEngagement(olderPosts) * 1.1 ? 'up' : 'down',
    complianceTrend: totalBriefs > 0 ? (completedBriefs / totalBriefs > 0.7 ? 'up' : 'down') : 'stable',
    totalRevenue30d: (revenue || []).reduce((s, r) => s + r.amount, 0),
    totalPosts30d: (posts || []).length,
    totalSubscribers,
    topPlatform,
    complianceRate: totalBriefs > 0 ? completedBriefs / totalBriefs : 0,
  }
}

function determinePhaseTransition(
  currentPhase: string,
  metrics: Record<string, unknown>
): string {
  const subscribers = (metrics.totalSubscribers as number) || 0
  const revenue = (metrics.totalRevenue30d as number) || 0
  const posts = (metrics.totalPosts30d as number) || 0
  const compliance = (metrics.complianceRate as number) || 0

  // Phase progression criteria
  switch (currentPhase) {
    case 'foundation':
      // Move to growth: 10+ posts, 70%+ compliance
      if (posts >= 10 && compliance >= 0.7) return 'growth'
      break
    case 'growth':
      // Move to monetization: 50+ subscribers, 20+ posts
      if (subscribers >= 50 && posts >= 20) return 'monetization'
      break
    case 'monetization':
      // Move to scale: $500+ monthly revenue
      if (revenue >= 500) return 'scale'
      break
    case 'scale':
      // Sex work phase requires explicit handler decision — never auto-transition
      break
  }

  return currentPhase
}

// ============================================
// HOURLY ANALYTICS
// ============================================

async function hourlyAnalytics(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  // Delegates to the platform manager edge function
  return await callEdgeFunction(supabase, 'handler-platform', {
    action: 'sync_analytics',
    user_id: userId,
  })
}

// ============================================
// DENIAL STREAK HELPER
// ============================================

async function getActiveDenialDays(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { data: streak } = await supabase
    .from('denial_streaks')
    .select('started_at')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!streak?.started_at) return 0

  const startDate = new Date(streak.started_at)
  const now = new Date()
  return Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)))
}

// ============================================
// HELPERS
// ============================================

async function callEdgeFunction(
  supabase: ReturnType<typeof createClient>,
  functionName: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/${functionName}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error(`Edge function ${functionName} returned ${response.status}`)
      return { error: `${functionName} returned ${response.status}` }
    }

    return await response.json()
  } catch (err) {
    console.error(`Failed to call ${functionName}:`, err)
    return { error: err.message }
  }
}

// ============================================
// RECURRING OBLIGATIONS (Feature A)
// ============================================
// For each active obligation, check if it's due today based on frequency.
// If the previous spawn wasn't completed, increment total_misses before spawning
// the new one. Then insert a matching task_bank row (if needed) and a daily_tasks row.

function isObligationDueToday(
  frequency: string,
  lastFulfilledAt: string | null,
  now: Date,
): boolean {
  const dayOfWeek = now.getUTCDay() // 0 = Sunday, 6 = Saturday
  const lastMs = lastFulfilledAt ? new Date(lastFulfilledAt).getTime() : 0
  const hoursSince = lastMs ? (now.getTime() - lastMs) / (1000 * 60 * 60) : Infinity

  switch (frequency) {
    case 'daily':
      return hoursSince >= 20 // allow a small window before 24h
    case 'twice_daily':
      return hoursSince >= 10 // ~every 12h
    case 'every_2_days':
      return hoursSince >= 44
    case 'weekly':
      return hoursSince >= 160 // ~every 7 days
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5 && hoursSince >= 20
    case 'weekends':
      return (dayOfWeek === 0 || dayOfWeek === 6) && hoursSince >= 20
    default:
      return false
  }
}

async function processRecurringObligations(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ spawned: number; missed: number }> {
  const { data: obligations } = await supabase
    .from('recurring_obligations')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)

  if (!obligations || obligations.length === 0) return { spawned: 0, missed: 0 }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  let spawned = 0
  let missed = 0

  for (const ob of obligations) {
    try {
      if (!isObligationDueToday(ob.frequency, ob.last_fulfilled_at, now)) continue

      // If there's a prior obligation-linked task that wasn't completed, count it as a miss.
      if (ob.last_fulfilled_at) {
        const { data: priorTask } = await supabase
          .from('daily_tasks')
          .select('id, status')
          .eq('user_id', userId)
          .eq('selection_reason', `recurring_obligation:${ob.id}`)
          .order('assigned_date', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (priorTask && priorTask.status !== 'completed') {
          await supabase
            .from('recurring_obligations')
            .update({ total_misses: (ob.total_misses || 0) + 1 })
            .eq('id', ob.id)
          missed++
        }
      }

      // Ensure a task_bank row exists for this obligation. Use a deterministic lookup
      // via instruction + domain to avoid creating duplicates on every cycle.
      const { data: existingTask } = await supabase
        .from('task_bank')
        .select('id')
        .eq('instruction', ob.obligation_name)
        .eq('domain', ob.domain)
        .eq('created_by', `recurring:${ob.id}`)
        .maybeSingle()

      let taskBankId: string | null = existingTask?.id ?? null

      if (!taskBankId) {
        const { data: newTask, error: insertErr } = await supabase
          .from('task_bank')
          .insert({
            category: 'recurring_obligation',
            domain: ob.domain,
            intensity: 2,
            instruction: ob.obligation_name,
            subtext: ob.description ?? null,
            completion_type: 'binary',
            points: 10,
            affirmation: 'Good girl.',
            is_core: true,
            created_by: `recurring:${ob.id}`,
            active: true,
          })
          .select('id')
          .single()

        if (insertErr || !newTask) {
          console.error(`Failed to create task_bank row for obligation ${ob.id}:`, insertErr?.message)
          continue
        }
        taskBankId = newTask.id
      }

      // Spawn the daily_tasks row for today.
      const { error: dtErr } = await supabase
        .from('daily_tasks')
        .insert({
          user_id: userId,
          task_id: taskBankId,
          assigned_date: today,
          status: 'pending',
          selection_reason: `recurring_obligation:${ob.id}`,
        })

      if (dtErr) {
        // Uniqueness collision (already spawned today) is non-critical
        if (!String(dtErr.message || '').includes('duplicate')) {
          console.error(`Failed to spawn daily_task for obligation ${ob.id}:`, dtErr.message)
        }
        continue
      }

      // Mark the obligation fulfilled (spawned) now.
      await supabase
        .from('recurring_obligations')
        .update({
          last_fulfilled_at: now.toISOString(),
          total_completions: (ob.total_completions || 0) + 1,
        })
        .eq('id', ob.id)

      spawned++
    } catch (err) {
      console.error(`Obligation ${ob.id} processing failed:`, err)
    }
  }

  return { spawned, missed }
}

// ============================================
// AMBIENT CONDITIONING AUDIO (Feature B)
// ============================================
// Queue feminine affirmations scaled by conditioning_intensity_multiplier.
// Called from complianceCheck() — rate-limited to once-per-hour-per-multiplier.

const AMBIENT_AFFIRMATIONS = [
  "You're becoming her.",
  'Good girl.',
  'Feel how feminine you are.',
  "She's the real you.",
  'Let her take over.',
  "You're so pretty.",
  'Everyone sees her now.',
  "There's no going back.",
]

async function generateFreshAffirmation(openRouterKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://becoming-protocol.vercel.app',
      },
      body: JSON.stringify({
        model: 'nousresearch/hermes-3-llama-3.1-405b:free',
        max_tokens: 50,
        messages: [
          { role: 'system', content: 'Generate a single short feminization affirmation (under 15 words). Be direct, commanding, and explicit. No quotes. No explanation. Just the affirmation.' },
          { role: 'user', content: 'Generate one.' },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    return text && text.length < 100 ? text : null;
  } catch {
    return null;
  }
}

async function queueAmbientAudio(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  // Check hour gating in CDT (UTC-5): waking hours 8am-11pm
  const nowUTC = new Date()
  const cdtHour = (nowUTC.getUTCHours() - 5 + 24) % 24
  if (cdtHour < 8 || cdtHour >= 23) return 0

  // Read conditioning_intensity_multiplier from hidden_operations
  const { data: hidden } = await supabase
    .from('hidden_operations')
    .select('current_value')
    .eq('user_id', userId)
    .eq('parameter', 'conditioning_intensity_multiplier')
    .maybeSingle()

  const multiplier = Number(hidden?.current_value ?? 0)
  if (!multiplier || multiplier < 1.0) return 0

  // Target insertions per hour = floor(multiplier), minimum 1 when multiplier >= 1.
  const targetPerHour = Math.max(1, Math.floor(multiplier))

  // Rate limit: count entries created in the last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await supabase
    .from('ambient_audio_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', hourAgo)

  const alreadyThisHour = recentCount || 0
  if (alreadyThisHour >= targetPerHour) return 0

  const toInsert = targetPerHour - alreadyThisHour
  let inserted = 0

  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');

  for (let i = 0; i < toInsert; i++) {
    let text: string;
    if (openRouterKey && Math.random() < 0.3) {
      const generated = await generateFreshAffirmation(openRouterKey);
      text = generated || AMBIENT_AFFIRMATIONS[Math.floor(Math.random() * AMBIENT_AFFIRMATIONS.length)];
    } else {
      text = AMBIENT_AFFIRMATIONS[Math.floor(Math.random() * AMBIENT_AFFIRMATIONS.length)];
    }
    const { error } = await supabase
      .from('ambient_audio_queue')
      .insert({
        user_id: userId,
        audio_text: text,
        audio_type: 'affirmation',
        intensity: Math.min(10, Math.max(1, Math.round(5 * multiplier))),
        scheduled_for: new Date(Date.now() + i * 5 * 60 * 1000).toISOString(),
      })
    if (!error) inserted++
  }

  return inserted
}
