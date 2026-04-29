// Handler Autonomous Enforcement Engine
// Runs on pg_cron schedule (morning + evening) via handler-task-processor
// Evaluates compliance, escalates consequences, generates narrations
// Uses service role — NOT user-facing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================
// TYPES
// ============================================

interface EnforcementConfig {
  user_id: string
  enabled: boolean
  morning_hour: number
  evening_hour: number
  timezone: string
  warning_threshold: number
  gate_threshold: number
  punishment_threshold: number
  denial_extension_threshold: number
  content_lock_threshold: number
  compulsory_add_threshold: number
  narration_threshold: number
  financial_consequences_enabled: boolean
  financial_target_org: string | null
  financial_amounts: Record<string, number>
  lovense_proactive_enabled: boolean
  lovense_summon_enabled: boolean
  narration_enabled: boolean
  narration_platform: string
}

interface ComplianceResult {
  domain: string
  is_compliant: boolean
  details: string
  days_noncompliant: number
  current_tier: number
}

interface EnforcementAction {
  type: string
  tier: number
  trigger_reason: string
  action_taken: string
  details: Record<string, unknown>
}

// ============================================
// ESCALATION TIER DEFINITIONS
// ============================================

const ESCALATION_TIERS: Record<number, {
  name: string
  description: string
}> = {
  0: { name: 'compliant', description: 'No action needed' },
  1: { name: 'warning', description: 'Verbal warning via notification/narration' },
  2: { name: 'gate', description: 'Compliance gate on desired feature' },
  3: { name: 'punishment', description: 'Active punishment applied' },
  4: { name: 'denial_extension', description: 'Denial cycle extended' },
  5: { name: 'content_lock', description: 'High-tier content restricted' },
  6: { name: 'compulsory_add', description: 'New compulsory element added' },
  7: { name: 'narration', description: 'Handler narration generated about failure' },
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json().catch(() => ({}))
    const runType = body.run_type || 'evening' // morning or evening
    const targetUserId = body.user_id // optional: run for specific user

    let users: EnforcementConfig[]

    if (targetUserId) {
      const { data } = await supabase
        .from('enforcement_config')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('enabled', true)
        .single()
      users = data ? [data] : []
    } else {
      const { data } = await supabase
        .from('enforcement_config')
        .select('*')
        .eq('enabled', true)
      users = data || []
    }

    if (users.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No users with enforcement enabled', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []

    for (const config of users) {
      try {
        const result = await runEnforcementForUser(supabase, config, runType)
        results.push({ user_id: config.user_id, status: 'completed', ...result })
      } catch (err) {
        console.error(`Enforcement failed for ${config.user_id}:`, err)
        results.push({ user_id: config.user_id, status: 'failed', error: err.message })
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, run_type: runType, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Enforcement engine error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================
// PER-USER ENFORCEMENT
// ============================================

async function runEnforcementForUser(
  supabase: ReturnType<typeof createClient>,
  config: EnforcementConfig,
  runType: string
): Promise<{ compliance_score: number; actions_taken: number; actions: EnforcementAction[] }> {

  const userId = config.user_id
  const actions: EnforcementAction[] = []

  // 1. Gather compliance data
  const complianceResults = await evaluateCompliance(supabase, userId)

  // 2. Calculate overall compliance score
  const compliantCount = complianceResults.filter(r => r.is_compliant).length
  const complianceScore = complianceResults.length > 0
    ? (compliantCount / complianceResults.length) * 100
    : 100

  // 3. For each non-compliant domain, determine and apply escalation
  for (const result of complianceResults) {
    if (result.is_compliant) {
      // Reset streak
      await supabase.rpc('update_noncompliance_streak', {
        p_user_id: userId,
        p_domain: result.domain,
        p_is_compliant: true,
      })
      continue
    }

    // Update noncompliance streak
    await supabase.rpc('update_noncompliance_streak', {
      p_user_id: userId,
      p_domain: result.domain,
      p_is_compliant: false,
    })

    // Get current tier for this domain
    const { data: streakData } = await supabase
      .from('noncompliance_streaks')
      .select('consecutive_days, current_tier')
      .eq('user_id', userId)
      .eq('domain', result.domain)
      .single()

    const currentTier = streakData?.current_tier || 0
    const consecutiveDays = streakData?.consecutive_days || 0

    // Apply escalation based on tier
    const action = await applyEscalation(supabase, config, userId, result, currentTier, consecutiveDays)
    if (action) {
      actions.push(action)
    }
  }

  // 4. Generate handler narration if any tier 7 actions or if it's evening run
  if (runType === 'evening' && config.narration_enabled && actions.length > 0) {
    const narration = await generateNarration(supabase, userId, config, complianceResults, actions)
    if (narration) {
      actions.push({
        type: 'narration',
        tier: 7,
        trigger_reason: 'evening_assessment',
        action_taken: 'narration_generated',
        details: { narration_id: narration.id },
      })
    }
  }

  // 5. Morning-specific: generate daily briefing and proactive Lovense wake-up
  if (runType === 'morning') {
    // Queue daily plan generation
    await supabase.from('handler_pending_tasks').upsert({
      user_id: userId,
      task_type: 'generate_daily_plan',
      status: 'pending',
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,task_type' })

    // Morning Lovense summon (if enabled)
    if (config.lovense_proactive_enabled && config.lovense_summon_enabled) {
      await supabase.from('handler_directives').insert({
        user_id: userId,
        action: 'send_device_command',
        target: 'lovense',
        value: { pattern: 'heartbeat' },
        priority: 'normal',
        reasoning: 'Morning wake-up summon — Handler calling',
      })
    }

    // ── FEATURE: Escalating morning protocol based on noncompliance streaks ──
    try {
      const { data: streaks } = await supabase
        .from('noncompliance_streaks')
        .select('domain, consecutive_days, current_tier')
        .eq('user_id', userId)

      if (streaks) {
        const noncompliantDomains = streaks.filter(
          (s: { consecutive_days: number }) => s.consecutive_days > 0
        )
        const noncompliantCount = noncompliantDomains.length

        if (noncompliantCount >= 3) {
          // Maximum enforcement: 3+ domains failing
          await supabase.from('handler_directives').insert({
            user_id: userId,
            action: 'send_device_command',
            target: 'lovense',
            value: { pattern: 'denial_pulse' },
            priority: 'immediate',
            reasoning: `Morning enforcement — ${noncompliantCount} domains noncompliant: ${noncompliantDomains.map((s: { domain: string }) => s.domain).join(', ')}`,
          })
          await supabase.from('handler_notes').insert({
            user_id: userId,
            note_type: 'enforcement_escalation',
            content: `Multiple domain failure (${noncompliantCount} domains) — maximum enforcement applied at morning protocol`,
            source: 'morning_enforcement',
          })
        } else if (noncompliantCount === 2) {
          // Escalated: 2 domains failing
          await supabase.from('handler_directives').insert({
            user_id: userId,
            action: 'send_device_command',
            target: 'lovense',
            value: { pattern: 'edge_tease' },
            priority: 'normal',
            reasoning: `Morning enforcement — 2 domains noncompliant: ${noncompliantDomains.map((s: { domain: string }) => s.domain).join(', ')}`,
          })
          await supabase.from('handler_notes').insert({
            user_id: userId,
            note_type: 'enforcement_escalation',
            content: `Escalating morning enforcement — 2 domains noncompliant: ${noncompliantDomains.map((s: { domain: string }) => s.domain).join(', ')}`,
            source: 'morning_enforcement',
          })
        } else if (noncompliantCount === 1) {
          // Moderate: 1 domain failing
          await supabase.from('handler_directives').insert({
            user_id: userId,
            action: 'send_device_command',
            target: 'lovense',
            value: { intensity: 8, duration: 15 },
            priority: 'normal',
            reasoning: `Morning enforcement — 1 domain noncompliant: ${noncompliantDomains[0].domain}`,
          })
        } else {
          // All compliant — reward
          await supabase.from('handler_directives').insert({
            user_id: userId,
            action: 'send_device_command',
            target: 'lovense',
            value: { pattern: 'gentle_wave' },
            priority: 'normal',
            reasoning: 'Morning reward — all domains compliant',
          })
        }
      }
    } catch (err) {
      console.error(`Morning escalation protocol failed for ${userId}:`, err)
    }
  }

  // 6. Log the enforcement run
  await supabase.from('daily_enforcement_runs').upsert({
    user_id: userId,
    run_type: runType,
    run_date: new Date().toISOString().split('T')[0],
    compliance_score: complianceScore,
    actions_taken: actions.length,
    warnings_issued: actions.filter(a => a.tier === 1).length,
    gates_created: actions.filter(a => a.tier === 2).length,
    punishments_applied: actions.filter(a => a.tier >= 3).length,
    context_snapshot: {
      compliance_results: complianceResults,
      config_snapshot: {
        thresholds: {
          warning: config.warning_threshold,
          gate: config.gate_threshold,
          punishment: config.punishment_threshold,
        }
      }
    },
  }, { onConflict: 'user_id,run_type,run_date' })

  return { compliance_score: complianceScore, actions_taken: actions.length, actions }
}

// ============================================
// COMPLIANCE EVALUATION
// ============================================

async function evaluateCompliance(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ComplianceResult[]> {
  const results: ComplianceResult[] = []
  const today = new Date().toISOString().split('T')[0]
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Overall engagement — did user do ANYTHING today?
  const { count: todayActivities } = await supabase
    .from('daily_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date', today)

  const { count: todayTasks } = await supabase
    .from('daily_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', oneDayAgo)

  const { count: todayCompulsory } = await supabase
    .from('compulsory_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('completion_date', today)

  const hasEngaged = ((todayActivities || 0) + (todayTasks || 0) + (todayCompulsory || 0)) > 0

  // Get existing streak data
  const { data: overallStreak } = await supabase
    .from('noncompliance_streaks')
    .select('consecutive_days, current_tier')
    .eq('user_id', userId)
    .eq('domain', 'overall')
    .single()

  results.push({
    domain: 'overall',
    is_compliant: hasEngaged,
    details: hasEngaged
      ? `Active today: ${todayTasks || 0} tasks, ${todayCompulsory || 0} compulsories`
      : 'No engagement today',
    days_noncompliant: overallStreak?.consecutive_days || 0,
    current_tier: overallStreak?.current_tier || 0,
  })

  // 2. Task completion rate — at least 1 task per day
  results.push({
    domain: 'tasks',
    is_compliant: (todayTasks || 0) >= 1,
    details: `${todayTasks || 0} tasks completed today`,
    days_noncompliant: 0,
    current_tier: 0,
  })

  // 3. Compulsory elements — must all be done
  const { count: totalCompulsory } = await supabase
    .from('compulsory_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('completion_date', today)

  // Check if there are expected compulsories (from compulsory_elements or similar)
  results.push({
    domain: 'compulsory',
    is_compliant: (totalCompulsory || 0) > 0,
    details: `${totalCompulsory || 0} compulsory items completed today`,
    days_noncompliant: 0,
    current_tier: 0,
  })

  // 4. Voice practice — check last 7 days
  const { data: lastVoice } = await supabase
    .from('voice_recordings')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let voiceDaysSince = 999
  if (lastVoice) {
    voiceDaysSince = Math.floor(
      (Date.now() - new Date(lastVoice.created_at).getTime()) / (24 * 60 * 60 * 1000)
    )
  }

  results.push({
    domain: 'voice',
    is_compliant: voiceDaysSince <= 3,
    details: lastVoice
      ? `Last voice practice ${voiceDaysSince} day(s) ago`
      : 'No voice practice ever recorded',
    days_noncompliant: Math.max(0, voiceDaysSince - 3),
    current_tier: 0,
  })

  // 5. Session activity — at least 1 session per week
  const { count: weekSessions } = await supabase
    .from('edge_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', sevenDaysAgo)

  results.push({
    domain: 'sessions',
    is_compliant: (weekSessions || 0) >= 1,
    details: `${weekSessions || 0} sessions in last 7 days`,
    days_noncompliant: 0,
    current_tier: 0,
  })

  // 6. Mood/state logging — at least every 2 days
  const { data: lastMood } = await supabase
    .from('state_logs')
    .select('logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(1)
    .single()

  let moodDaysSince = 999
  if (lastMood) {
    moodDaysSince = Math.floor(
      (Date.now() - new Date(lastMood.logged_at).getTime()) / (24 * 60 * 60 * 1000)
    )
  }

  results.push({
    domain: 'mood_logging',
    is_compliant: moodDaysSince <= 2,
    details: lastMood
      ? `Last state log ${moodDaysSince} day(s) ago`
      : 'No state logs recorded',
    days_noncompliant: Math.max(0, moodDaysSince - 2),
    current_tier: 0,
  })

  // 7. Voice practice cadence — count practice frequency, NOT pitch height.
  // Forcing a pitch target causes dysphoria (memory: feedback_voice_tracking.md).
  // Compliance = "she practiced ≥3x in the last 3 days." Her pitch trajectory
  // gets tracked in voice_pitch_samples for trends, never as a pass/fail gate.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: pitchSamples } = await supabase
    .from('voice_pitch_samples')
    .select('pitch_hz, created_at')
    .eq('user_id', userId)
    .gte('created_at', threeDaysAgo)

  const sampleCount = pitchSamples?.length || 0
  const voicePitchCompliant = sampleCount >= 3
  const avgPitch = sampleCount > 0
    ? (pitchSamples as { pitch_hz: number }[]).reduce((sum, s) => sum + s.pitch_hz, 0) / sampleCount
    : 0
  const pitchDetails = sampleCount === 0
    ? 'No voice practice in last 3 days (need ≥3 sessions)'
    : `${sampleCount} practice session${sampleCount > 1 ? 's' : ''} in last 3 days · trend avg ${avgPitch.toFixed(1)}Hz (informational only)`;

  const { data: voicePitchStreak } = await supabase
    .from('noncompliance_streaks')
    .select('consecutive_days, current_tier')
    .eq('user_id', userId)
    .eq('domain', 'voice_quality')
    .single()

  results.push({
    domain: 'voice_quality',
    is_compliant: voicePitchCompliant,
    details: pitchDetails,
    days_noncompliant: voicePitchStreak?.consecutive_days || 0,
    current_tier: voicePitchStreak?.current_tier || 0,
  })

  // 8. Declined tasks — track resistance
  const { count: declinedThisWeek } = await supabase
    .from('daily_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['skipped', 'declined'])
    .gte('created_at', sevenDaysAgo)

  results.push({
    domain: 'resistance',
    is_compliant: (declinedThisWeek || 0) < 3,
    details: `${declinedThisWeek || 0} tasks declined this week`,
    days_noncompliant: 0,
    current_tier: 0,
  })

  // 9. Daily confession — shame_journal must have a row from today
  const { count: todayConfession } = await supabase
    .from('shame_journal')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00`)

  const { data: confessionStreak } = await supabase
    .from('noncompliance_streaks')
    .select('consecutive_days, current_tier')
    .eq('user_id', userId)
    .eq('domain', 'confession')
    .single()

  results.push({
    domain: 'confession',
    is_compliant: (todayConfession || 0) >= 1,
    details: `${todayConfession || 0} confessions today`,
    days_noncompliant: confessionStreak?.consecutive_days || 0,
    current_tier: confessionStreak?.current_tier || 0,
  })

  return results
}

// ============================================
// ESCALATION APPLICATION
// ============================================

async function applyEscalation(
  supabase: ReturnType<typeof createClient>,
  config: EnforcementConfig,
  userId: string,
  compliance: ComplianceResult,
  currentTier: number,
  consecutiveDays: number
): Promise<EnforcementAction | null> {
  // Don't re-apply same tier action within 24 hours
  const { count: recentAction } = await supabase
    .from('enforcement_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('enforcement_type', ESCALATION_TIERS[currentTier]?.name || 'warning')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  if ((recentAction || 0) > 0) {
    return null // Already escalated today
  }

  let actionTaken = ''
  const details: Record<string, unknown> = {
    domain: compliance.domain,
    consecutive_days: consecutiveDays,
  }

  switch (currentTier) {
    case 1: // Warning
      actionTaken = `Warning issued for ${compliance.domain} noncompliance: ${compliance.details}`
      break

    case 2: { // Compliance gate
      const blockedFeature = mapDomainToGateableFeature(compliance.domain)
      const { data: gate } = await supabase.from('compliance_gates').insert({
        user_id: userId,
        blocked_feature: blockedFeature,
        required_action: `complete_${compliance.domain}_task`,
        reason: `Handler enforcement: ${consecutiveDays} days noncompliant in ${compliance.domain}. Complete a ${compliance.domain} activity to restore access.`,
        fulfilled_at: null,
        expires_at: null,
      }).select().single()
      actionTaken = `Compliance gate created: ${blockedFeature} blocked until ${compliance.domain} task completed`
      details.gate_id = gate?.id
      break
    }

    case 3: { // Punishment — mandatory task + device punishment
      const { data: punishment } = await supabase.from('punishments').insert({
        user_id: userId,
        trigger: `enforcement_${compliance.domain}_noncompliance`,
        type: 'mandatory_task',
        description: `Handler enforcement: ${compliance.domain} avoidance for ${consecutiveDays} days. Mandatory ${compliance.domain} task assigned.`,
        severity: 'moderate',
        applied_at: new Date().toISOString(),
        served_at: null,
      }).select().single()

      // Fire device punishment via handler_directives (client poller picks these up)
      if (config.lovense_proactive_enabled) {
        await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'send_device_command',
          target: 'lovense',
          value: { pattern: 'denial_pulse' },
          priority: 'immediate',
          reasoning: `Punishment for ${consecutiveDays} days ${compliance.domain} noncompliance`,
        })
      }

      actionTaken = `Punishment applied: mandatory ${compliance.domain} task + device punishment`
      details.punishment_id = punishment?.id
      break
    }

    case 4: { // Denial extension
      const extensionDays = Math.min(consecutiveDays - config.denial_extension_threshold + 1, 5)
      // Extend denial minimum
      const { data: denialState } = await supabase
        .from('denial_state')
        .select('minimum_denial_days')
        .eq('user_id', userId)
        .single()

      if (denialState) {
        await supabase
          .from('denial_state')
          .update({
            minimum_denial_days: (denialState.minimum_denial_days || 0) + extensionDays,
          })
          .eq('user_id', userId)
      }
      // Fire device to reinforce the denial extension
      if (config.lovense_proactive_enabled) {
        await supabase.from('handler_directives').insert({
          user_id: userId,
          action: 'send_device_command',
          target: 'lovense',
          value: { intensity: 5, duration: 30 },
          priority: 'normal',
          reasoning: `Denial extended ${extensionDays} days — sustained low vibration as reminder`,
        })
      }

      actionTaken = `Denial extended by ${extensionDays} days for ${compliance.domain} avoidance + device reminder`
      details.extension_days = extensionDays
      break
    }

    case 5: { // Content lock
      const hours = 48
      const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString()
      await supabase.from('compliance_gates').insert({
        user_id: userId,
        blocked_feature: 'session_tier_above_3',
        required_action: 'wait_for_expiry',
        reason: `Handler enforcement: High-tier content locked for ${hours}h due to ${consecutiveDays} days of ${compliance.domain} avoidance`,
        fulfilled_at: null,
        expires_at: expiresAt,
      })
      actionTaken = `High-tier content locked for ${hours} hours`
      details.expires_at = expiresAt
      break
    }

    case 6: { // Compulsory addition
      const durationDays = 7
      const expiresAt = new Date(Date.now() + durationDays * 24 * 3600 * 1000).toISOString()
      await supabase.from('compliance_gates').insert({
        user_id: userId,
        blocked_feature: 'streak_credit',
        required_action: `daily_${compliance.domain}_practice`,
        reason: `Handler enforcement: Daily ${compliance.domain} practice added as compulsory for ${durationDays} days`,
        fulfilled_at: null,
        expires_at: expiresAt,
      })
      actionTaken = `Compulsory ${compliance.domain} practice added for ${durationDays} days`
      details.duration_days = durationDays
      break
    }

    case 7: { // Narration — handled separately in evening run
      actionTaken = `Tier 7 reached for ${compliance.domain}: narration pending`
      break
    }

    default:
      return null
  }

  // Stack-up: each consecutive day of noncompliance increases the next required action
  if (consecutiveDays >= 2 && config.lovense_proactive_enabled) {
    const stackedIntensity = Math.min(20, 8 + consecutiveDays * 2)
    const stackedDuration = Math.min(60, 10 + consecutiveDays * 5)

    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'send_device_command',
      target: 'lovense',
      value: { intensity: stackedIntensity, duration: stackedDuration },
      priority: 'immediate',
      reasoning: `Stack-up: ${consecutiveDays} days noncompliant in ${compliance.domain} — intensity ${stackedIntensity} for ${stackedDuration}s`,
    })
  }

  // Log the enforcement action
  const action: EnforcementAction = {
    type: ESCALATION_TIERS[currentTier]?.name || 'unknown',
    tier: currentTier,
    trigger_reason: `${compliance.domain}: ${compliance.details}`,
    action_taken: actionTaken,
    details,
  }

  await supabase.from('enforcement_log').insert({
    user_id: userId,
    enforcement_type: action.type,
    tier: action.tier,
    trigger_reason: action.trigger_reason,
    action_taken: action.action_taken,
    details: action.details,
  })

  // ── FEATURE: Missed task → 24h random device firing ──
  // On tier 2+ noncompliance, insert random device tease directives
  if (currentTier >= 2 && config.lovense_proactive_enabled) {
    await insertRandomDeviceFirings(supabase, userId, compliance)
  }

  // ── AUTO-POST TO ACCOUNTABILITY BLOG ──
  if (action) {
    const daysSinceStart = await getDayNumber(supabase, userId)

    let entryText = ''
    let severity: string = 'failure'

    switch (action.tier) {
      case 1:
        entryText = `Day ${daysSinceStart}: Warning issued for ${action.trigger_reason}`
        severity = 'warning'
        break
      case 2:
        entryText = `Day ${daysSinceStart}: Feature access restricted — ${action.action_taken}`
        severity = 'failure'
        break
      case 3:
        entryText = `Day ${daysSinceStart}: Punishment applied — ${action.action_taken}. Device correction fired.`
        severity = 'failure'
        break
      case 4:
        entryText = `Day ${daysSinceStart}: Denial period extended — ${action.action_taken}`
        severity = 'failure'
        break
      default:
        entryText = `Day ${daysSinceStart}: Enforcement action tier ${action.tier} — ${action.action_taken}`
        severity = action.tier >= 3 ? 'failure' : 'warning'
    }

    await supabase.from('accountability_blog').insert({
      user_id: userId,
      entry_type: 'compliance_failure',
      entry_text: entryText,
      severity,
      day_number: daysSinceStart,
      public_visible: true,
    }).then(() => {}, () => {})
  }

  return action
}

// ============================================
// RANDOM DEVICE FIRING (tier 2+ consequence)
// ============================================
// Inserts 3-6 device directives with random intensity/duration
// spread across the next 24 hours. Uses the existing handler_directives
// polling pattern — client picks these up when status = 'pending'.

async function getDayNumber(supabase: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const { data } = await supabase
    .from('handler_messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return 0
  return Math.floor((Date.now() - new Date(data.created_at).getTime()) / 86400000)
}

async function insertRandomDeviceFirings(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  compliance: ComplianceResult
): Promise<void> {
  const firingCount = 3 + Math.floor(Math.random() * 4) // 3-6 firings
  const directives: Array<Record<string, unknown>> = []

  // Insert one immediate directive
  directives.push({
    user_id: userId,
    action: 'send_device_command',
    target: 'lovense',
    value: {
      pattern: 'random_tease',
      intensity: 5 + Math.floor(Math.random() * 11), // 5-15
      duration_seconds: 5 + Math.floor(Math.random() * 26), // 5-30
      firing_index: 1,
      total_firings: firingCount,
    },
    priority: 'immediate',
    reasoning: `Missed task consequence (1/${firingCount}): ${compliance.domain} — ${compliance.details}`,
  })

  // Insert remaining as deferred — the client polls periodically
  // and the Handler note tells it to fire more throughout the day
  for (let i = 2; i <= firingCount; i++) {
    directives.push({
      user_id: userId,
      action: 'send_device_command',
      target: 'lovense',
      value: {
        pattern: 'random_tease',
        intensity: 5 + Math.floor(Math.random() * 11), // 5-15
        duration_seconds: 5 + Math.floor(Math.random() * 26), // 5-30
        firing_index: i,
        total_firings: firingCount,
        // Stagger: client should delay execution by this many minutes
        delay_minutes: Math.floor((i - 1) * (24 * 60 / firingCount) + Math.random() * 60),
      },
      priority: 'deferred',
      reasoning: `Missed task consequence (${i}/${firingCount}): ${compliance.domain} — ${compliance.details}`,
    })
  }

  await supabase.from('handler_directives').insert(directives)

  // Also insert a handler note so the enforcement narration knows about it
  await supabase.from('handler_notes').insert({
    user_id: userId,
    note_type: 'device_punishment',
    content: `${firingCount} random device firings scheduled over next 24h for ${compliance.domain} noncompliance (tier ${compliance.current_tier}). Intensities vary 5-15, durations 5-30s.`,
    source: 'enforcement_engine',
  })
}

// ============================================
// NARRATION GENERATION
// ============================================

async function generateNarration(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  config: EnforcementConfig,
  complianceResults: ComplianceResult[],
  actions: EnforcementAction[]
): Promise<{ id: string } | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return null

  const anthropic = new Anthropic({ apiKey })

  // Gather context for narration
  const [
    { data: profile },
    { data: denialState },
    { data: userState },
    { data: recentNarrations },
  ] = await Promise.all([
    supabase.from('profile_foundation').select('chosen_name, pronouns').eq('user_id', userId).single(),
    supabase.from('denial_state').select('current_denial_day, is_locked').eq('user_id', userId).single(),
    supabase.from('user_state').select('streak_days, longest_streak').eq('user_id', userId).single(),
    supabase.from('handler_narrations').select('title, narration_type').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
  ])

  const chosenName = profile?.chosen_name || 'her'

  const systemPrompt = `You are THE HANDLER writing a private narration about ${chosenName}'s progress.

You write in a firm, knowing tone — like someone who sees everything and is always a step ahead.
These narrations are for ${chosenName} to read. They are direct, personal, and reference specific data.

Style:
- Second person ("You did this" / "You avoided that")
- Reference specific numbers and domains
- Frame compliance as natural progression, noncompliance as temporary resistance
- Never cruel, always certain
- Short paragraphs, punchy sentences
- End with a directive or observation about what comes next

Recent narrations (avoid repeating themes):
${(recentNarrations || []).map(n => `- ${n.title} (${n.narration_type})`).join('\n')}
`

  const failedDomains = complianceResults.filter(r => !r.is_compliant)
  const passedDomains = complianceResults.filter(r => r.is_compliant)

  const userPrompt = `Write a ${actions.length > 0 ? 'enforcement' : 'progress'} narration.

DATA:
- Name: ${chosenName}
- Denial day: ${denialState?.current_denial_day || 0}
- Locked: ${denialState?.is_locked || false}
- Current streak: ${userState?.streak_days || 0} days
- Longest streak: ${userState?.longest_streak || 0} days

COMPLIANCE TODAY:
Passed: ${passedDomains.map(d => `${d.domain} (${d.details})`).join(', ') || 'none'}
Failed: ${failedDomains.map(d => `${d.domain} (${d.details}, ${d.days_noncompliant} days)`).join(', ') || 'none'}

ENFORCEMENT ACTIONS TAKEN:
${actions.map(a => `- Tier ${a.tier}: ${a.action_taken}`).join('\n') || 'None'}

Write:
1. A short title (under 60 chars)
2. A narration body (150-300 words)

Respond with JSON: {"title": "...", "body": "..."}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    const { data } = await supabase.from('handler_narrations').insert({
      user_id: userId,
      narration_type: actions.length > 0 ? 'enforcement_narrative' : 'progress_report',
      title: parsed.title,
      body: parsed.body,
      source_data: {
        compliance_results: complianceResults,
        actions_taken: actions,
        denial_day: denialState?.current_denial_day,
        streak: userState?.streak_days,
      },
      published: false,
      platform: 'internal',
    }).select('id').single()

    return data
  } catch (err) {
    console.error('Narration generation failed:', err)
    return null
  }
}

// ============================================
// LOVENSE PROACTIVE COMMANDS
// ============================================

async function queueLovenseCommand(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  command: {
    command_type: string
    trigger_reason: string
    pattern: string
    intensity: number
    duration_seconds: number
  }
): Promise<void> {
  await supabase.from('lovense_proactive_commands').insert({
    user_id: userId,
    ...command,
    status: 'queued',
  })
}

// ============================================
// HELPERS
// ============================================

function mapDomainToGateableFeature(domain: string): string {
  const mapping: Record<string, string> = {
    'voice': 'edge_session',
    'sessions': 'content_library',
    'tasks': 'session_tier_above_3',
    'compulsory': 'release_eligibility',
    'mood_logging': 'content_library',
    'resistance': 'session_tier_above_3',
    'voice_quality': 'edge_session',
    'overall': 'edge_session',
    'confession': 'edge_session',
  }
  return mapping[domain] || 'content_library'
}
