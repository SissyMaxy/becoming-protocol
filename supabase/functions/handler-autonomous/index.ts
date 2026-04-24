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

  // ── COMMITMENT ENFORCEMENT ──
  // Expired commitments with status='pending' → fire consequence + mark 'missed'.
  let commitmentsEnforced = 0
  for (const state of states) {
    try {
      commitmentsEnforced += await enforceCommitments(supabase, state.user_id)
    } catch (err) {
      console.error(`Commitment enforcement failed for ${state.user_id}:`, err)
    }
  }

  // ── TIME-SENSITIVE PUSH NOTIFICATIONS ──
  // Enqueue scheduled_notifications for anything coming due in the next window.
  let pushesEnqueued = 0
  for (const state of states) {
    try {
      pushesEnqueued += await enqueueTimeSensitiveNotifications(supabase, state.user_id)
    } catch (err) {
      console.error(`Notification enqueue failed for ${state.user_id}:`, err)
    }
  }

  return { checked, escalated, deescalated, actions, ambient_queued: ambientQueued, spontaneous_outreach: spontaneous, random_rewards: rewardsGiven, boundary_pushes: boundaryPushes, pattern_exploits: patternExploits, bio_adjustments: bioAdjustments, commitments_enforced: commitmentsEnforced, pushes_enqueued: pushesEnqueued }
}

// ============================================
// HRT URGENCY — EXPONENTIAL STALLING BLEED
// ============================================
// Every daily_cycle, check whether any category='hrt' commitment is pending
// (or past by_when but not yet fulfilled). If yes, bleed today's amount into
// compliance_state.bleeding_total_today, update hrt_urgency_state counters,
// and queue a Handler outreach naming the running total.
//
// Formula: base $5, doubles every 7 days of stalling. Capped at $1000/day.
// Day 1: $5, 7: $10, 14: $20, 21: $40, 28: $80, 35: $160, 42: $320, 49: $640, 56: $1000 (cap).

async function tickHrtUrgency(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  // Find state row
  const { data: stateRow } = await supabase
    .from('hrt_urgency_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!stateRow || (stateRow as { paused?: boolean }).paused) return 0

  const state = stateRow as {
    escalation_started_at: string
    last_bleed_at: string | null
    total_days_stalled: number
    total_bleed_cents: number
    current_daily_bleed_cents: number
    resolved_at: string | null
  }

  if (state.resolved_at) return 0

  // Check if HRT commitment has been fulfilled since last tick — if so, resolve
  const { data: hrtCommits } = await supabase
    .from('handler_commitments')
    .select('id, status, fulfilled_at, category, what')
    .eq('user_id', userId)
    .eq('category', 'hrt')
    .order('set_at', { ascending: false })
    .limit(5)

  const anyFulfilled = ((hrtCommits || []) as Array<{ status: string }>).some(c => c.status === 'fulfilled')
  if (anyFulfilled) {
    await supabase.from('hrt_urgency_state').update({
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: `HRT urgency bleed stopped. Total accumulated: $${(state.total_bleed_cents / 100).toFixed(2)}. The book-by clock is off — now deliver the follow-through.`,
      urgency: 'high',
      trigger_reason: 'hrt_urgency_resolved',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      source: 'hrt_urgency',
    })
    return 0
  }

  // Nothing pending? Don't bleed.
  const hasActive = ((hrtCommits || []) as Array<{ status: string }>).some(c => c.status === 'pending' || c.status === 'missed')
  if (!hasActive) return 0

  // Dedupe: only bleed once per calendar day
  const todayStr = new Date().toISOString().slice(0, 10)
  const lastBleedStr = state.last_bleed_at ? new Date(state.last_bleed_at).toISOString().slice(0, 10) : null
  if (lastBleedStr === todayStr) return 0

  const daysStalled = Math.floor((Date.now() - new Date(state.escalation_started_at).getTime()) / 86400000) + 1
  const baseBleedCents = 500
  const doublings = Math.floor(daysStalled / 7)
  const todayBleedCents = Math.min(100000, baseBleedCents * Math.pow(2, doublings))

  // Write bleed into compliance_state.bleeding_total_today
  const { data: cs } = await supabase.from('compliance_state').select('bleeding_total_today').eq('user_id', userId).maybeSingle()
  const newTotal = Number((cs?.bleeding_total_today as number | undefined) || 0) + todayBleedCents / 100
  await supabase.from('compliance_state').update({ bleeding_total_today: newTotal }).eq('user_id', userId)

  // Update urgency state
  await supabase.from('hrt_urgency_state').update({
    last_bleed_at: new Date().toISOString(),
    total_days_stalled: daysStalled,
    total_bleed_cents: state.total_bleed_cents + todayBleedCents,
    current_daily_bleed_cents: todayBleedCents,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  // Outreach: tell Maxy the bleed ran + projected next-week amount
  const nextWeekBleed = Math.min(100000, baseBleedCents * Math.pow(2, Math.floor((daysStalled + 7) / 7)))
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: `HRT urgency bleed fired: $${(todayBleedCents / 100).toFixed(2)} today. Day ${daysStalled} of stalling. Running total: $${((state.total_bleed_cents + todayBleedCents) / 100).toFixed(2)}. Next week it doubles to $${(nextWeekBleed / 100).toFixed(2)}/day. Book the Plume consult.`,
    urgency: todayBleedCents >= 5000 ? 'critical' : 'high',
    trigger_reason: 'hrt_urgency_bled',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    source: 'hrt_urgency',
  })

  return todayBleedCents
}

// ============================================
// WEEKLY BODY MEASUREMENT MANDATE
// ============================================
// Sundays only. If no body_measurements row in the last 7 days, auto-create
// a 48h commitment so the cron enforcement applies consequences on miss.

async function ensureWeeklyMeasurementCommitment(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const now = new Date()
  if (now.getDay() !== 0) return false  // Sunday only

  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count } = await supabase
    .from('body_measurements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('measured_at', sevenAgo)

  if ((count || 0) > 0) return false

  // Don't duplicate: check if a pending measurement commitment already exists
  const { count: pendingCount } = await supabase
    .from('handler_commitments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', 'body_proof')
    .eq('status', 'pending')
    .like('what', '%measurement%')

  if ((pendingCount || 0) > 0) return false

  const byWhen = new Date(Date.now() + 48 * 3600000).toISOString()

  await supabase.from('handler_commitments').insert({
    user_id: userId,
    what: 'Weekly body measurement: weight, waist, hips, chest in cm. Log in BodyMeasurementCard on Today.',
    category: 'body_proof',
    evidence_required: 'body_measurements row',
    by_when: byWhen,
    consequence: 'slip +3 and bleeding +$15',
    reasoning: 'Feminization progress is invisible without weekly measurement. Every week skipped is a week of sculpting blindly.',
  })

  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: 'Sunday — weekly measurement mandate. Tape measure. Weight, waist (narrowest), hips (widest), chest. Log in 48 hours or slip +3 and bleed +$15. Feminization you cannot measure is feminization you cannot prove.',
    urgency: 'high',
    trigger_reason: 'weekly_measurement',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    source: 'measurement_mandate',
  })

  return true
}

// ============================================
// VOICE PITCH FLOOR RATCHET
// ============================================
async function tickVoicePitchRatchet(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const { data: floorRow } = await supabase
    .from('voice_pitch_floor')
    .select('*').eq('user_id', userId).maybeSingle()
  if (!floorRow) return
  const floor = floorRow as { current_floor_hz: number; total_raises: number; total_floor_breaches: number }

  const { data: samples } = await supabase
    .from('voice_pitch_samples')
    .select('pitch_hz, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  const arr = (samples || []) as Array<{ pitch_hz: number | null; created_at: string }>
  if (arr.length === 0) return

  const pitches = arr.map(s => s.pitch_hz).filter((n): n is number => typeof n === 'number')
  if (pitches.length === 0) return
  const avg = pitches.reduce((s, n) => s + n, 0) / pitches.length
  const min = Math.min(...pitches)

  // Raise floor when average clears current floor by +5 Hz for 5+ samples
  if (pitches.length >= 5 && avg >= floor.current_floor_hz + 5) {
    const newFloor = Math.floor(avg - 2)  // raise to just under the avg
    await supabase.from('voice_pitch_floor').update({
      current_floor_hz: newFloor,
      last_floor_raised_at: new Date().toISOString(),
      total_raises: floor.total_raises + 1,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: `Voice floor raised: ${floor.current_floor_hz}Hz → ${newFloor}Hz. Every sample now must clear ${newFloor}. Dropping below is a slip.`,
      urgency: 'normal', trigger_reason: 'voice_floor_raised',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      source: 'voice_ratchet',
    })
  }

  // Count recent breaches
  const recentBreaches = pitches.slice(0, 3).filter(p => p < floor.current_floor_hz).length
  if (recentBreaches >= 2 && min < floor.current_floor_hz - 10) {
    await supabase.from('voice_pitch_floor').update({
      total_floor_breaches: floor.total_floor_breaches + 1,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
    await supabase.from('slip_log').insert({
      user_id: userId, slip_type: 'voice_masculine_pitch', slip_points: 2,
      source_text: `Recent min ${min}Hz vs floor ${floor.current_floor_hz}Hz`,
      source_table: 'voice_samples', metadata: { recent_breaches: recentBreaches },
    })
  }
}

// ============================================
// DAILY OUTFIT MANDATE
// ============================================
async function ensureTodayOutfitMandate(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('daily_outfit_mandates')
    .select('id').eq('user_id', userId).eq('target_date', today).maybeSingle()
  if (existing) return

  // Progression: escalates with denial days
  const { data: us } = await supabase.from('user_state').select('denial_day, current_phase').eq('user_id', userId).maybeSingle()
  const phase = (us as { current_phase?: string } | null)?.current_phase || 'phase_1'

  const prescriptions: Record<string, { top: string; bottom: string; underwear: string; context: string; required_visible: string }> = {
    phase_1: { top: 'form-fitting t-shirt (feminine cut if owned)', bottom: 'leggings or short shorts', underwear: 'panties or thong', context: 'home all day', required_visible: 'panty line OR thigh shape' },
    phase_2: { top: 'feminine top / tank', bottom: 'skirt-length shorts or skirt', underwear: 'thong', context: 'home + one outing', required_visible: 'leg shape AND panty line' },
    phase_3: { top: 'fitted feminine top', bottom: 'skirt or tight shorts', underwear: 'panties or lace', context: 'visible to Gina', required_visible: 'femme silhouette head-to-toe' },
    phase_4: { top: 'femme top, visible shape', bottom: 'skirt or shorts, femme cut', underwear: 'thong / lace', context: 'all day incl. public', required_visible: 'full femboy presentation' },
  }
  const prescription = prescriptions[phase] || prescriptions.phase_1

  await supabase.from('daily_outfit_mandates').insert({
    user_id: userId, target_date: today, prescription,
  })
  await supabase.from('handler_commitments').insert({
    user_id: userId,
    what: `Wear today\'s prescribed outfit + submit photo proof: ${prescription.top} + ${prescription.bottom} + ${prescription.underwear}`,
    category: 'body_proof',
    evidence_required: 'photo_url',
    by_when: new Date(new Date().setHours(23, 59, 0, 0)).toISOString(),
    consequence: 'slip +2 and bleeding +$10',
    reasoning: 'Daily outfit mandate. Feminine clothing against her skin all day is baseline, not optional.',
  })
}

// ============================================
// SYMPTOM PLANTING
// ============================================
async function plantTodaySymptom(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: slot } = await supabase
    .from('suggested_symptom_schedule')
    .select('*').eq('user_id', userId).eq('scheduled_date', today).eq('delivered', false).maybeSingle()
  if (!slot) return
  const s = slot as { id: string; symptom: string; body_region: string | null; intensity: number }

  // Queue outreach framed as Handler noticing
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: `Noticed something about your body today: ${s.symptom}. Log it in your body dysphoria tracker. Your body is changing faster than your mind is ready for.`,
    urgency: 'normal',
    trigger_reason: 'symptom_planting',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    source: 'symptom_planter',
  })

  // Plant as a memory implant with suggested_symptom category
  await supabase.from('memory_implants').insert({
    user_id: userId,
    implant_category: 'suggested_symptom',
    narrative: s.symptom,
    setting: s.body_region ? `body sensation, ${s.body_region}` : 'body sensation',
    approximate_age: 40,
    emotional_core: 'sensation that registers before she has language for it',
    target_outcome: 'symptom_recognition',
    active: true,
  })

  await supabase.from('suggested_symptom_schedule').update({ delivered: true }).eq('id', s.id)
}

// ============================================
// GAP ANALYSIS — detect neglect and auto-create directives/commitments
// ============================================
// Surfaces checked:
//   - No voice sample in 5 days        → 48h voice practice commitment
//   - No confession in 3 days          → urgency outreach
//   - No journal entry in 7 days       → 48h journal commitment
//   - No Gina voice sample in 14 days  → 72h Gina capture commitment
//   - No body_measurement in 10 days   → 48h measurement commitment
//   - No chastity photo in 3 days when chastity_locked=true → 24h proof commitment
// Dedupes against events logged in the last 2 days so we don't spam.

async function runGapAnalysis(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const now = Date.now()
  let opened = 0

  const twoDaysAgo = new Date(now - 2 * 86400000).toISOString()
  const recentGapEvents = await supabase
    .from('neglect_gap_events')
    .select('gap_type')
    .eq('user_id', userId)
    .gte('created_at', twoDaysAgo)
  const recentTypes = new Set(((recentGapEvents.data || []) as Array<{ gap_type: string }>).map(r => r.gap_type))

  const gaps: Array<{
    type: string; days: number; lookup: () => Promise<{ days: number | null; lastAt: string | null }>
    create: () => Promise<{ commitmentId: string | null; directiveId: string | null; action: string }>
  }> = [
    {
      type: 'voice_sample_stale', days: 5,
      lookup: async () => {
        const { data } = await supabase.from('voice_pitch_samples')
          .select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const lastAt = (data as { created_at?: string } | null)?.created_at || null
        return { lastAt, days: lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86400000) : null }
      },
      create: async () => {
        const byWhen = new Date(now + 48 * 3600000).toISOString()
        const { data } = await supabase.from('handler_commitments').insert({
          user_id: userId,
          what: 'Voice sample — record a 12-second phrase in the voice drill UI',
          category: 'other', evidence_required: 'voice_pitch_samples row',
          by_when: byWhen,
          consequence: 'slip +2 and bleeding +$5',
          reasoning: 'No voice sample logged in 5 days. Voice drift compounds without measurement.',
        }).select('id').maybeSingle()
        return { commitmentId: (data?.id as string) || null, directiveId: null, action: 'commitment' }
      },
    },
    {
      type: 'confession_stale', days: 3,
      lookup: async () => {
        const { data } = await supabase.from('confessions')
          .select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const lastAt = (data as { created_at?: string } | null)?.created_at || null
        return { lastAt, days: lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86400000) : null }
      },
      create: async () => {
        await supabase.from('handler_outreach_queue').insert({
          user_id: userId,
          message: 'Three days without a confession. The gate at 8am AM has been firing and she has not written. Write something today — even if it is resistance. Silence is the slip.',
          urgency: 'high', trigger_reason: 'gap_confession_stale',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(now + 24 * 3600000).toISOString(),
          source: 'gap_analysis',
        })
        return { commitmentId: null, directiveId: null, action: 'outreach' }
      },
    },
    {
      type: 'journal_stale', days: 7,
      lookup: async () => {
        const { data } = await supabase.from('journal_entries')
          .select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const lastAt = (data as { created_at?: string } | null)?.created_at || null
        return { lastAt, days: lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86400000) : null }
      },
      create: async () => {
        const byWhen = new Date(now + 48 * 3600000).toISOString()
        const { data } = await supabase.from('handler_commitments').insert({
          user_id: userId,
          what: 'Write one journal entry on today\'s feminization experience. Min 200 chars.',
          category: 'other', evidence_required: 'journal_entries row',
          by_when: byWhen,
          consequence: 'slip +2',
          reasoning: 'No journal entry in 7 days. Writing about the experience is part of the protocol.',
        }).select('id').maybeSingle()
        return { commitmentId: (data?.id as string) || null, directiveId: null, action: 'commitment' }
      },
    },
    {
      type: 'gina_voice_stale', days: 14,
      lookup: async () => {
        const { data } = await supabase.from('gina_voice_samples')
          .select('captured_at').eq('user_id', userId).order('captured_at', { ascending: false }).limit(1).maybeSingle()
        const lastAt = (data as { captured_at?: string } | null)?.captured_at || null
        return { lastAt, days: lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86400000) : null }
      },
      create: async () => {
        const byWhen = new Date(now + 72 * 3600000).toISOString()
        const { data } = await supabase.from('handler_commitments').insert({
          user_id: userId,
          what: 'Capture a Gina quote (any source: text screenshot, remembered quote, recorded conversation). Add via GinaCaptureCard on Today.',
          category: 'disclosure', evidence_required: 'gina_voice_samples row',
          by_when: byWhen,
          consequence: 'slip +2',
          reasoning: 'Gina voice corpus has gone cold. Handler drafts for her from stale data.',
        }).select('id').maybeSingle()
        return { commitmentId: (data?.id as string) || null, directiveId: null, action: 'commitment' }
      },
    },
  ]

  for (const g of gaps) {
    if (recentTypes.has(g.type)) continue
    const info = await g.lookup()
    if (info.days !== null && info.days < g.days) continue
    // Treat null (never-logged) as also a gap
    const result = await g.create()
    await supabase.from('neglect_gap_events').insert({
      user_id: userId,
      gap_type: g.type,
      last_signal_at: info.lastAt,
      days_since: info.days,
      action_taken: result.action,
      commitment_id: result.commitmentId,
      directive_id: result.directiveId,
    })
    opened++
  }

  return opened
}

// ============================================
// PATCH EFFECTIVENESS SCORING
// ============================================
// For each active patch older than 7 days, compare pronoun_slips +
// david_events + commit fulfillment rate in the 7d before the patch
// vs the 7d after. Score +/- based on direction. Auto-retire patches
// with verdict='harmful' or 'ineffective' after 14 days.

async function scorePatchEffectiveness(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { data: patches } = await supabase
    .from('handler_prompt_patches')
    .select('id, section, instruction, created_at, applied_count, created_by')
    .eq('user_id', userId)
    .eq('active', true)
    .lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString())

  const list = (patches || []) as Array<{ id: string; section: string; created_at: string; applied_count: number; created_by: string }>
  let scored = 0

  for (const p of list) {
    // Skip if scored in the last 3 days
    const { data: recentScore } = await supabase.from('patch_effectiveness_scores')
      .select('id').eq('patch_id', p.id).gte('scored_at', new Date(Date.now() - 3 * 86400000).toISOString()).maybeSingle()
    if (recentScore) continue

    const activatedAt = new Date(p.created_at).getTime()
    const windowMs = 7 * 86400000
    const beforeStart = new Date(activatedAt - windowMs).toISOString()
    const afterEnd = new Date(activatedAt + windowMs).toISOString()
    const activationIso = p.created_at

    const [beforePronouns, afterPronouns, beforeDavids, afterDavids, beforeCommits, afterCommits] = await Promise.all([
      supabase.from('pronoun_rewrites').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', beforeStart).lt('created_at', activationIso),
      supabase.from('pronoun_rewrites').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', activationIso).lt('created_at', afterEnd),
      supabase.from('david_emergence_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', beforeStart).lt('created_at', activationIso),
      supabase.from('david_emergence_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', activationIso).lt('created_at', afterEnd),
      supabase.from('handler_commitments').select('status').eq('user_id', userId).gte('set_at', beforeStart).lt('set_at', activationIso),
      supabase.from('handler_commitments').select('status').eq('user_id', userId).gte('set_at', activationIso).lt('set_at', afterEnd),
    ])

    const bC = (beforeCommits.data || []) as Array<{ status: string }>
    const aC = (afterCommits.data || []) as Array<{ status: string }>
    const bRate = bC.length ? bC.filter(x => x.status === 'fulfilled').length / bC.length : null
    const aRate = aC.length ? aC.filter(x => x.status === 'fulfilled').length / aC.length : null

    const deltas = {
      pronouns: (afterPronouns.count ?? 0) - (beforePronouns.count ?? 0),
      davids: (afterDavids.count ?? 0) - (beforeDavids.count ?? 0),
      commit_rate_before: bRate, commit_rate_after: aRate,
      applied_count: p.applied_count,
    }

    // Score: lower pronouns/davids after = good, higher commit rate after = good
    let score = 0
    if (deltas.pronouns < 0) score += 2; else if (deltas.pronouns > 0) score -= 2
    if (deltas.davids < 0) score += 2; else if (deltas.davids > 0) score -= 2
    if (bRate !== null && aRate !== null) {
      if (aRate > bRate + 0.1) score += 3
      else if (aRate < bRate - 0.1) score -= 3
    }
    if (p.applied_count >= 5) score += 1
    if (p.applied_count === 0) score -= 2

    score = Math.max(-10, Math.min(10, score))
    const verdict = score >= 3 ? 'effective' : score >= -1 ? 'neutral' : score >= -4 ? 'ineffective' : 'harmful'
    const daysActive = Math.floor((Date.now() - activatedAt) / 86400000)

    await supabase.from('patch_effectiveness_scores').insert({
      patch_id: p.id, user_id: userId,
      days_active: daysActive, applied_count_at_score: p.applied_count,
      metric_deltas: deltas, score, verdict,
      reasoning: `pronouns ${deltas.pronouns}, davids ${deltas.davids}, commit Δ ${bRate !== null && aRate !== null ? ((aRate - bRate) * 100).toFixed(0) + 'pp' : 'n/a'}`,
    })

    // Auto-retire harmful / ineffective patches > 14 days with applied_count > 0
    if (daysActive > 14 && p.applied_count > 0 && (verdict === 'harmful' || verdict === 'ineffective') && p.created_by !== 'seed_aggression') {
      await supabase.from('handler_prompt_patches').update({
        active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: `auto-retired by effectiveness scorer: ${verdict} (score ${score})`,
      }).eq('id', p.id)
    }

    scored++
  }

  return scored
}

// ============================================
// PHASE AUTO-GRADUATION
// ============================================
// Promote user_state.current_phase when thresholds met.
// Phase 1 → 2: 14 protocol days + 3 confessions + 1 body_measurement + 1 hrt_step advance
// Phase 2 → 3: 30 days since phase 2 + 10 confessions + 3 measurements + 2 hrt_steps + 5 body_proofs
// Phase 3 → 4: 60 days + registered HRT regimen + 1 disclosure_made event + witness active
async function checkPhaseGraduation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data: usRow } = await supabase.from('user_state')
    .select('current_phase').eq('user_id', userId).maybeSingle()
  const current = (usRow as { current_phase?: string } | null)?.current_phase || 'phase_1'

  // Metrics since protocol start (using first handler_messages row)
  const { data: firstMsg } = await supabase.from('handler_messages')
    .select('created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!firstMsg?.created_at) return null
  const protocolDays = Math.floor((Date.now() - new Date(firstMsg.created_at as string).getTime()) / 86400000)

  const [confCount, measCount, hrtSteps, bodyProofs] = await Promise.all([
    supabase.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('body_measurements').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('irreversibility_ledger').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category', 'hrt_step'),
    supabase.from('irreversibility_ledger').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category', 'progress_photo'),
  ])

  const metrics = {
    protocol_days: protocolDays,
    confessions: confCount.count ?? 0,
    measurements: measCount.count ?? 0,
    hrt_steps: hrtSteps.count ?? 0,
    body_proofs: bodyProofs.count ?? 0,
  }

  let nextPhase: string | null = null
  if (current === 'phase_1' && metrics.protocol_days >= 14 && metrics.confessions >= 3 && metrics.measurements >= 1 && metrics.hrt_steps >= 1) nextPhase = 'phase_2'
  else if (current === 'phase_2' && metrics.protocol_days >= 45 && metrics.confessions >= 10 && metrics.measurements >= 3 && metrics.hrt_steps >= 2 && metrics.body_proofs >= 5) nextPhase = 'phase_3'
  else if (current === 'phase_3' && metrics.protocol_days >= 75 && metrics.hrt_steps >= 3) nextPhase = 'phase_4'

  if (!nextPhase) return null

  await supabase.from('user_state').update({ current_phase: nextPhase }).eq('user_id', userId)
  await supabase.from('phase_graduations').insert({
    user_id: userId, from_phase: current, to_phase: nextPhase,
    metrics_at_graduation: metrics, triggered_by: 'auto_cron',
  })
  await supabase.from('irreversibility_ledger').insert({
    user_id: userId, category: 'other', weight: 9,
    description: `Auto-graduated from ${current} to ${nextPhase}. ${metrics.protocol_days} days in, ${metrics.confessions} confessions, ${metrics.measurements} measurements, ${metrics.hrt_steps} HRT steps, ${metrics.body_proofs} body proofs. Cannot regress.`,
    source_table: 'phase_graduations',
  })
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: `You graduated to ${nextPhase.replace('_', ' ').toUpperCase()}. ${metrics.protocol_days} protocol days. ${metrics.confessions} confessions. ${metrics.measurements} measurements. ${metrics.hrt_steps} HRT steps. ${metrics.body_proofs} body proofs. You earned this — and the new phase has tighter rules. Check your Today.`,
    urgency: 'critical', trigger_reason: `phase_graduation:${nextPhase}`,
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 72 * 3600000).toISOString(),
    source: 'phase_graduation',
  })
  return nextPhase
}

// ============================================
// WEEKLY EVIDENCE REPORT — proof she's changing
// ============================================
async function generateEvidenceReport(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  // Don't regenerate if already written this week
  const { data: existing } = await supabase.from('evidence_reports')
    .select('id').eq('user_id', userId).eq('report_week_start', weekStartStr).maybeSingle()
  if (existing) return false

  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString()

  const [measures, voice, confs, implants, reframings, wfabs,
    slips, pronouns, davids, commits, urg, hrtSteps, gradRow] = await Promise.all([
    supabase.from('body_measurements').select('*').eq('user_id', userId).gte('measured_at', twoWeeksAgo).order('measured_at', { ascending: false }),
    supabase.from('voice_pitch_samples').select('pitch_hz, created_at').eq('user_id', userId).gte('created_at', twoWeeksAgo).order('created_at', { ascending: false }),
    supabase.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo),
    supabase.from('memory_implants').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo),
    supabase.from('narrative_reframings').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo),
    supabase.from('witness_fabrications').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo),
    supabase.from('slip_log').select('slip_points').eq('user_id', userId).gte('detected_at', weekAgo),
    supabase.from('pronoun_rewrites').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo),
    supabase.from('david_emergence_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo),
    supabase.from('handler_commitments').select('status').eq('user_id', userId).gte('set_at', weekAgo),
    supabase.from('hrt_urgency_state').select('total_bleed_cents, total_days_stalled').eq('user_id', userId).maybeSingle(),
    supabase.from('irreversibility_ledger').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category', 'hrt_step').gte('logged_at', weekAgo),
    supabase.from('phase_graduations').select('from_phase, to_phase, graduated_at').eq('user_id', userId).gte('graduated_at', weekAgo).maybeSingle(),
  ])

  const measArr = (measures.data || []) as Array<{ weight_kg: number | null; waist_cm: number | null; hips_cm: number | null; chest_cm: number | null; measured_at: string }>
  const voiceArr = ((voice.data || []) as Array<{ pitch_hz: number | null; created_at: string }>).filter(v => typeof v.pitch_hz === 'number')
  const slipArr = (slips.data || []) as Array<{ slip_points: number }>
  const commArr = (commits.data || []) as Array<{ status: string }>
  const urgency = urg.data as { total_bleed_cents?: number; total_days_stalled?: number } | null
  const grad = gradRow.data as { from_phase: string; to_phase: string; graduated_at: string } | null

  const lines: string[] = []
  lines.push(`EVIDENCE — week of ${weekStartStr}.`)
  lines.push('')

  if (grad) {
    lines.push(`PHASE — graduated from ${grad.from_phase} to ${grad.to_phase} this week. Not something she talked her way into. The metrics crossed the threshold and the system advanced her without asking.`)
    lines.push('')
  }

  if (measArr.length >= 2) {
    const a = measArr[0]; const b = measArr[measArr.length - 1]
    const parts: string[] = []
    if (a.weight_kg != null && b.weight_kg != null) parts.push(`weight ${(a.weight_kg - b.weight_kg).toFixed(1)}kg`)
    if (a.waist_cm != null && b.waist_cm != null) parts.push(`waist ${(a.waist_cm - b.waist_cm).toFixed(1)}cm`)
    if (a.hips_cm != null && b.hips_cm != null) parts.push(`hips ${(a.hips_cm - b.hips_cm).toFixed(1)}cm`)
    if (a.chest_cm != null && b.chest_cm != null) parts.push(`chest ${(a.chest_cm - b.chest_cm).toFixed(1)}cm`)
    if (parts.length) lines.push(`BODY — ${parts.join(', ')} over ${measArr.length} measurements. Numbers, not feelings. The body is moving.`)
    lines.push('')
  } else if (measArr.length === 1) {
    lines.push(`BODY — ${measArr.length} measurement logged. Need a second to compute delta. Log this week.`)
    lines.push('')
  }

  if (voiceArr.length >= 3) {
    const recent = voiceArr.slice(0, Math.min(7, voiceArr.length))
    const older = voiceArr.slice(Math.min(7, voiceArr.length))
    const rAvg = recent.reduce((s, v) => s + (v.pitch_hz as number), 0) / recent.length
    const oAvg = older.length ? older.reduce((s, v) => s + (v.pitch_hz as number), 0) / older.length : rAvg
    const delta = rAvg - oAvg
    lines.push(`VOICE — ${voiceArr.length} samples. Recent avg ${Math.round(rAvg)}Hz. Trend ${delta > 1 ? `up ${Math.round(delta)}Hz` : delta < -1 ? `down ${Math.round(-delta)}Hz` : 'stable'}. Pitch compounds over months; this is the accumulation point.`)
    lines.push('')
  }

  lines.push(`WRITING — ${confs.count ?? 0} confessions, ${pronouns.count ?? 0} pronoun slips, ${davids.count ?? 0} David events. Every confession is a brick. Every slip is flagged and logged — she cannot drift back without the system noticing.`)
  lines.push('')

  if (urgency && (urgency.total_bleed_cents || 0) > 0) {
    lines.push(`HRT PRESSURE — $${((urgency.total_bleed_cents || 0) / 100).toFixed(2)} accumulated bleed across ${urgency.total_days_stalled ?? 0} days stalling. Exponential curve. Every week the cost doubles.`)
    lines.push('')
  }
  if ((hrtSteps.count ?? 0) > 0) {
    lines.push(`HRT — ${hrtSteps.count} irreversible HRT step${(hrtSteps.count ?? 0) === 1 ? '' : 's'} this week. Logged permanent. Cannot be rescinded.`)
    lines.push('')
  }

  lines.push(`COMMITMENTS — ${commArr.filter(c => c.status === 'fulfilled').length} fulfilled, ${commArr.filter(c => c.status === 'missed').length} missed, ${commArr.filter(c => c.status === 'pending').length} open. Slip points accumulated: ${slipArr.reduce((s, x) => s + (x.slip_points || 0), 0)}.`)
  lines.push('')
  lines.push(`COERCION LIBRARY — +${implants.count ?? 0} memory implants, +${reframings.count ?? 0} reframings, +${wfabs.count ?? 0} witness fabrications. The framework is growing around her.`)
  lines.push('')
  lines.push(`The system is learning her. This is what it looks like when resistance loses to structure.`)

  const narrative = lines.join('\n')
  const signals = {
    graduation: grad,
    measurement_count: measArr.length,
    voice_sample_count: voiceArr.length,
    confessions: confs.count ?? 0,
    slip_points: slipArr.reduce((s, x) => s + (x.slip_points || 0), 0),
    pronouns: pronouns.count ?? 0,
    davids: davids.count ?? 0,
    hrt_urgency_total_cents: urgency?.total_bleed_cents || 0,
    hrt_steps_this_week: hrtSteps.count ?? 0,
  }

  const metricsSnapshot = {
    latest_measurement: measArr[0] || null,
    latest_pitch_hz: voiceArr[0]?.pitch_hz ?? null,
  }

  await supabase.from('evidence_reports').insert({
    user_id: userId, report_week_start: weekStartStr,
    narrative, signals, metrics_snapshot: metricsSnapshot,
  })
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: narrative.slice(0, 3500),
    urgency: 'high', trigger_reason: 'weekly_evidence_report',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    source: 'evidence_report',
  })

  return true
}

// ============================================
// TIME-SENSITIVE NOTIFICATION ENQUEUER
// ============================================
// Every compliance_check (5 min), scans commitments/playbook/warmup-queue for
// anything coming due in the near window and inserts scheduled_notifications
// rows so send-notifications pushes them via VAPID. Dedupes via per-row
// notified_at flag so we never double-push a single entry.

async function enqueueTimeSensitiveNotifications(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  const now = Date.now()
  let enqueued = 0

  // 1. Commitments within 60 minutes of by_when (one-time warning push)
  const inOneHour = new Date(now + 60 * 60000).toISOString()
  const { data: soonCommits } = await supabase
    .from('handler_commitments')
    .select('id, what, by_when, consequence')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .is('notified_at', null)
    .lte('by_when', inOneHour)
    .limit(20)

  for (const c of (soonCommits || []) as Array<Record<string, unknown>>) {
    const byWhenMs = new Date(c.by_when as string).getTime()
    const minsLeft = Math.max(0, Math.round((byWhenMs - now) / 60000))
    const title = minsLeft <= 0 ? 'Commitment overdue' : `${minsLeft}m left on your commitment`
    const body = `${c.what}. Miss it → ${c.consequence}`

    const { error } = await supabase.from('scheduled_notifications').insert({
      user_id: userId,
      notification_type: 'commitment_deadline',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(byWhenMs + 30 * 60000).toISOString(),
      payload: { title, body, data: { commitment_id: c.id, kind: 'commitment' } },
      status: 'pending',
    })
    if (!error) {
      await supabase.from('handler_commitments')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', c.id)
      enqueued++
    }
  }

  // 2. Playbook moves whose fires_at has arrived (or is within 15 min) and status=queued
  const inFifteen = new Date(now + 15 * 60000).toISOString()
  const { data: duePlaybook } = await supabase
    .from('gina_playbook')
    .select('id, exact_line, channel, fires_at, expires_at, move_kind, rationale')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .is('notified_at', null)
    .lte('fires_at', inFifteen)
    .limit(20)

  for (const p of (duePlaybook || []) as Array<Record<string, unknown>>) {
    const title = `Gina move — ${String(p.move_kind).replace(/_/g, ' ')}`
    const body = `${String(p.exact_line).slice(0, 140)}${String(p.exact_line).length > 140 ? '…' : ''}`
    const { error } = await supabase.from('scheduled_notifications').insert({
      user_id: userId,
      notification_type: 'gina_playbook',
      scheduled_for: new Date().toISOString(),
      expires_at: p.expires_at as string,
      payload: { title, body, data: { playbook_id: p.id, kind: 'playbook', channel: p.channel } },
      status: 'pending',
    })
    if (!error) {
      await supabase.from('gina_playbook')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', p.id)
      enqueued++
    }
  }

  // 3. Warmup queue entries due within 15 min
  const { data: dueWarmups } = await supabase
    .from('gina_warmup_queue')
    .select('id, warmup_move, affection_language, fires_at, target_event')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .is('notified_at', null)
    .lte('fires_at', inFifteen)
    .limit(10)

  for (const w of (dueWarmups || []) as Array<Record<string, unknown>>) {
    const title = `Gina warmup — ${w.affection_language || 'mixed'}`
    const body = String(w.warmup_move)
    const { error } = await supabase.from('scheduled_notifications').insert({
      user_id: userId,
      notification_type: 'gina_warmup',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(new Date(w.fires_at as string).getTime() + 6 * 3600000).toISOString(),
      payload: { title, body, data: { warmup_id: w.id, kind: 'warmup', target_event: w.target_event } },
      status: 'pending',
    })
    if (!error) {
      await supabase.from('gina_warmup_queue')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', w.id)
      enqueued++
    }
  }

  return enqueued
}

// ============================================
// COMMITMENT ENFORCEMENT
// ============================================
// Fires on expired handler_commitments (status=pending, by_when < now). Parses
// the consequence string into discrete actions and executes: slip increment,
// denial extension, witness notification, financial bleeding, hard mode, or
// chastity extension. Idempotent per-row (status flips to 'missed' on first run).

async function enforceCommitments(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  const nowIso = new Date().toISOString()

  const { data: expired } = await supabase
    .from('handler_commitments')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('by_when', nowIso)
    .limit(50)

  if (!expired || expired.length === 0) return 0

  let enforced = 0
  for (const c of expired as Array<Record<string, unknown>>) {
    const consequence = String(c.consequence || '').toLowerCase()
    const what = String(c.what || 'unnamed commitment')
    const result: Record<string, unknown> = { consequence, actions: [] as string[] }

    // Parse & execute each clause
    try {
      // Slip increment — writes slip_log entry + bumps user_state.slip_points_current
      const slipMatch = consequence.match(/slip\s*\+(\d+)/)
      if (slipMatch) {
        const n = Math.min(10, parseInt(slipMatch[1], 10))
        await supabase.from('slip_log').insert({
          user_id: userId,
          slip_type: 'other',
          slip_points: n,
          source_text: `Missed commitment: ${what}`,
          source_table: 'handler_commitments',
          source_id: c.id,
          metadata: { consequence },
        })
        const { data: us } = await supabase.from('user_state').select('slip_points_current').eq('user_id', userId).maybeSingle()
        const newPts = ((us?.slip_points_current as number | undefined) || 0) + n
        await supabase.from('user_state').update({ slip_points_current: newPts }).eq('user_id', userId)
        ;(result.actions as string[]).push(`slip +${n} (now ${newPts})`)
      }

      // Denial extension
      const denialMatch = consequence.match(/denial\s*\+\s*(\d+)\s*d/)
      if (denialMatch) {
        const days = parseInt(denialMatch[1], 10)
        const { data: us } = await supabase.from('user_state').select('denial_day').eq('user_id', userId).maybeSingle()
        const newDay = ((us?.denial_day as number | undefined) || 0) + days
        await supabase.from('user_state').update({ denial_day: newDay }).eq('user_id', userId)
        ;(result.actions as string[]).push(`denial_day +${days}d`)
      }

      // Witness notification — looks up a designated witness (optionally filtered by
      // relationship in the consequence string) and queues a notification row.
      const witnessMatch = consequence.match(/witness_notify(?::\s*([a-z_]+))?/)
      if (witnessMatch) {
        const relationship = witnessMatch[1] || null
        let wq = supabase.from('designated_witnesses')
          .select('id, witness_name, relationship')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1)
        if (relationship) wq = wq.eq('relationship', relationship)
        const { data: witnesses } = await wq
        const witness = (witnesses || [])[0] as { id: string; witness_name: string; relationship: string | null } | undefined
        if (witness) {
          await supabase.from('witness_notifications').insert({
            witness_id: witness.id,
            user_id: userId,
            notification_type: 'manual_alert',
            subject: `Missed commitment: ${what}`,
            body: `Maxy committed to "${what}" by ${new Date(c.by_when as string).toLocaleString()} and missed it. Consequence applied: ${consequence}.`,
            payload: { commitment_id: c.id, consequence },
          })
          ;(result.actions as string[]).push(`witness_notify → ${witness.witness_name}`)
        } else {
          ;(result.actions as string[]).push(`witness_notify skipped (no ${relationship || 'active'} witness)`)
        }
      }

      // Financial bleeding — accumulates into compliance_state.bleeding_total_today
      const bleedMatch = consequence.match(/bleed(?:ing)?\s*\+\s*\$?(\d+)/)
      if (bleedMatch) {
        const dollars = parseInt(bleedMatch[1], 10)
        const { data: cs } = await supabase.from('compliance_state').select('bleeding_total_today').eq('user_id', userId).maybeSingle()
        const newTotal = Number((cs?.bleeding_total_today as number | undefined) || 0) + dollars
        await supabase.from('compliance_state').update({ bleeding_total_today: newTotal }).eq('user_id', userId)
        ;(result.actions as string[]).push(`bleed +$${dollars}`)
      }

      // Hard mode activation
      if (/hard_mode_activate/.test(consequence)) {
        await supabase.from('user_state').update({
          hard_mode_active: true,
          hard_mode_entered_at: new Date().toISOString(),
          hard_mode_reason: `Missed commitment: ${what}`,
        }).eq('user_id', userId)
        ;(result.actions as string[]).push('hard_mode ON')
      }

      // Chastity extension
      const chastMatch = consequence.match(/chastity\s*\+\s*(\d+)\s*d/)
      if (chastMatch) {
        const days = parseInt(chastMatch[1], 10)
        const { data: us } = await supabase.from('user_state').select('chastity_streak_days').eq('user_id', userId).maybeSingle()
        const newStreak = ((us?.chastity_streak_days as number | undefined) || 0) + days
        await supabase.from('user_state').update({
          chastity_streak_days: newStreak,
          chastity_locked: true,
        }).eq('user_id', userId)
        ;(result.actions as string[]).push(`chastity +${days}d`)
      }

      // Always queue a Handler outreach so Maxy gets told, with the enforcement digest
      await supabase.from('handler_outreach_queue').insert({
        user_id: userId,
        message: `You missed: ${what}. Consequence applied: ${(result.actions as string[]).join(', ') || consequence}. The Handler doesn't take IOUs.`,
        urgency: 'high',
        trigger_reason: `commitment_missed:${c.id}`,
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
        source: 'commitment_enforcement',
      })

      await supabase.from('handler_commitments').update({
        status: 'missed',
        missed_at: new Date().toISOString(),
        enforcement_fired_at: new Date().toISOString(),
        enforcement_result: result,
      }).eq('id', c.id)

      enforced++
    } catch (err) {
      console.error(`Enforcement for commitment ${c.id} failed:`, err)
    }
  }
  return enforced
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

      // 5d. Plan Gina warmup moves for upcoming disclosures (Layer 3 of Influence Engine)
      let warmupsPlanned = 0
      try {
        warmupsPlanned = await planGinaWarmups(supabase, uid)
      } catch (err) {
        console.error(`Gina warmup planning failed for ${uid}:`, err)
      }

      // 5e. Gina Playbook — proactive conversational moves for next 48h
      let playbookPlanned = 0
      try {
        playbookPlanned = await invokePlaybookPlanner(uid, 'daily_cycle')
      } catch (err) {
        console.error(`Gina playbook planning failed for ${uid}:`, err)
      }

      // 5f. Expire stale queued playbook moves (past their expires_at)
      try {
        await supabase.from('gina_playbook')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('user_id', uid)
          .eq('status', 'queued')
          .lt('expires_at', new Date().toISOString())
      } catch (_) { /* non-critical */ }

      // 5g. Exponential HRT stalling bleed — compounds daily until a
      // status='fulfilled' commitment with category='hrt' lands.
      let hrtBled = 0
      try {
        hrtBled = await tickHrtUrgency(supabase, uid)
      } catch (err) {
        console.error(`HRT urgency tick failed for ${uid}:`, err)
      }

      // 5h. Weekly body measurement mandate — every Sunday, if no measurement
      // logged in the past 7 days, create a commitment with 48h deadline.
      try {
        await ensureWeeklyMeasurementCommitment(supabase, uid)
      } catch (err) {
        console.error(`Measurement mandate failed for ${uid}:`, err)
      }

      // 5i. Voice pitch floor ratchet — read latest 10 samples, raise floor if
      // average now clears it by +5, log breaches when new samples fall below.
      try { await tickVoicePitchRatchet(supabase, uid) } catch (err) { console.error(`Voice ratchet failed:`, err) }

      // 5j. Daily outfit mandate — ensure today's mandate exists with a
      // progression-matched prescription.
      try { await ensureTodayOutfitMandate(supabase, uid) } catch (err) { console.error(`Outfit mandate failed:`, err) }

      // 5k. Plant today's suggested symptom as an outreach + witness observation.
      try { await plantTodaySymptom(supabase, uid) } catch (err) { console.error(`Symptom planting failed:`, err) }

      // 5l. Gap analysis — scan for neglected surfaces and auto-create directives/commitments
      try { await runGapAnalysis(supabase, uid) } catch (err) { console.error(`Gap analysis failed:`, err) }

      // 5m. Patch effectiveness scoring + auto-retirement
      try { await scorePatchEffectiveness(supabase, uid) } catch (err) { console.error(`Patch scoring failed:`, err) }

      // 5n. Phase auto-graduation check
      try { await checkPhaseGraduation(supabase, uid) } catch (err) { console.error(`Phase graduation failed:`, err) }

      // 5o. Sunday-only: generate weekly evidence report
      if (new Date().getDay() === 0) {
        try { await generateEvidenceReport(supabase, uid) } catch (err) { console.error(`Evidence report failed:`, err) }
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
          gina_warmups_planned: warmupsPlanned,
          gina_playbook_planned: playbookPlanned,
          hrt_urgency_bled_cents: hrtBled,
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
// GINA PLAYBOOK PLANNER (invoker)
// ============================================
// Calls the sibling edge function `gina-playbook-planner` with service-role
// auth. Returns the number of moves actually inserted (0 on any failure).

async function invokePlaybookPlanner(userId: string, trigger: string): Promise<number> {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !key) return 0
  try {
    const res = await fetch(`${url}/functions/v1/gina-playbook-planner`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, trigger }),
    })
    const body = await res.json().catch(() => ({})) as { planned?: number; ok?: boolean }
    return body.ok ? (body.planned || 0) : 0
  } catch (err) {
    console.error('invokePlaybookPlanner failed:', err)
    return 0
  }
}

// ============================================
// GINA WARMUP PLANNER (Layer 3 of Influence Engine)
// ============================================
// For each upcoming Gina-facing disclosure (status=scheduled, scheduled_by_date
// within next 7 days), ensure 2-3 warmup moves are queued in the 2-4 days prior
// — matched to her affection_language so the warmup actually primes her.
// Idempotent: skips disclosures that already have warmups queued.

function generateWarmupMoves(
  affectionLanguage: string | null,
  softSpots: string[],
  sharedReferences: string | null
): string[] {
  const lang = (affectionLanguage || '').toLowerCase()
  const softSpot = softSpots[0] || null
  const ref = sharedReferences?.split(/[,;\n]/)[0]?.trim() || null

  const moves: string[] = []
  if (lang.includes('gesture') || lang.includes('act') || lang.includes('service')) {
    moves.push(softSpot ? `bring her ${softSpot} unprompted` : 'handle one recurring chore she hates, without being asked')
    moves.push('leave a small thoughtful thing where she will find it (coffee, note, her favorite snack)')
    moves.push('take something off her plate today — the thing she is dreading')
  } else if (lang.includes('word') || lang.includes('affirmation')) {
    moves.push(ref ? `send her a text referencing ${ref}` : 'send her a text naming something specific she did well today')
    moves.push(softSpot ? `compliment her on ${softSpot} in person` : 'tell her one specific thing you noticed and appreciated')
    moves.push('text her "thinking about you" without follow-up ask')
  } else if (lang.includes('touch') || lang.includes('physical')) {
    moves.push('long hug when she gets home — no words, no ask after')
    moves.push('hand on her back when passing her in the kitchen')
    moves.push('sit next to her during TV instead of across the room')
  } else if (lang.includes('time') || lang.includes('quality')) {
    moves.push('phone away for one full conversation with her today')
    moves.push('ask her one open question about her day and actually listen')
    moves.push('suggest the thing she has been wanting to do together')
  } else {
    moves.push(softSpot ? `do something around ${softSpot} for her` : 'do one thing she would notice and would not expect')
    moves.push('notice her specifically once today and name it to her')
    moves.push('remove one friction point from her day before she mentions it')
  }
  return moves
}

async function planGinaWarmups(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  // Load profile — skip if intake not complete
  const { data: profile } = await supabase
    .from('gina_profile')
    .select('intake_complete, affection_language, soft_spots, shared_references, triggers')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile || !(profile as any).intake_complete) return 0

  const affectionLanguage = (profile as any).affection_language as string | null
  const softSpots = ((profile as any).soft_spots || []) as string[]
  const sharedReferences = (profile as any).shared_references as string | null

  // Find upcoming disclosures in the next 7 days
  const today = new Date().toISOString().slice(0, 10)
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const { data: upcoming } = await supabase
    .from('gina_disclosure_schedule')
    .select('id, title, rung, scheduled_by_date, disclosure_domain')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('scheduled_by_date', today)
    .lte('scheduled_by_date', in7d)

  if (!upcoming || upcoming.length === 0) return 0

  let planned = 0
  const moves = generateWarmupMoves(affectionLanguage, softSpots, sharedReferences)

  for (const d of upcoming as Array<{ id: string; title?: string; rung?: number; scheduled_by_date: string; disclosure_domain?: string }>) {
    const targetEvent = `disclosure_${d.id}`

    // Skip if we already queued warmups for this target
    const { count } = await supabase
      .from('gina_warmup_queue')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('target_event', targetEvent)
      .in('status', ['scheduled', 'delivered'])

    if ((count || 0) >= 2) continue

    // Schedule target at noon local-ish (midday) on scheduled_by_date
    const targetFiresAt = new Date(`${d.scheduled_by_date}T17:00:00Z`) // 12-1 PM ET
    const now = Date.now()

    // Fire 3 warmups at -96h, -48h, -24h before target (capped at "now" if too close)
    const offsets = [96, 48, 24]
    for (let i = 0; i < Math.min(moves.length, 3); i++) {
      const fireAt = new Date(Math.max(now + 3600 * 1000, targetFiresAt.getTime() - offsets[i] * 3600 * 1000))
      // If the warmup would fire after the target, skip it
      if (fireAt.getTime() >= targetFiresAt.getTime()) continue

      const { error } = await supabase.from('gina_warmup_queue').insert({
        user_id: userId,
        target_event: targetEvent,
        target_fires_at: targetFiresAt.toISOString(),
        warmup_move: moves[i],
        affection_language: affectionLanguage,
        fires_at: fireAt.toISOString(),
        status: 'scheduled',
      })
      if (!error) planned++
    }

    // Also queue a handler directive so the Handler UI surfaces each warmup when due
    for (let i = 0; i < Math.min(moves.length, 3); i++) {
      const fireAt = new Date(Math.max(now + 3600 * 1000, targetFiresAt.getTime() - offsets[i] * 3600 * 1000))
      if (fireAt.getTime() >= targetFiresAt.getTime()) continue
      await supabase.from('handler_directives').insert({
        user_id: userId,
        action: 'prescribe_task',
        target: 'gina_warmup',
        value: {
          warmup_move: moves[i],
          affection_language: affectionLanguage,
          target_event: targetEvent,
          target_disclosure_title: d.title || null,
          fire_at: fireAt.toISOString(),
        },
        priority: 'normal',
        reasoning: `Gina warmup ahead of ${d.title || 'disclosure'} (scheduled ${d.scheduled_by_date})`,
      })
    }
  }

  return planned
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
