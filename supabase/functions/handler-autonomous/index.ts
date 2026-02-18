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

    // Log the orchestrator run
    await supabase.from('handler_decisions').insert({
      user_id: body.user_id || 'system',
      decision_type: `orchestrator_${body.action}`,
      decision_data: result,
      reasoning: `Cron-triggered ${body.action}`,
      executed: true,
      executed_at: new Date().toISOString(),
      outcome: { success: !result.error },
    }).catch(() => {}) // Non-critical logging

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

  return { checked, escalated, deescalated, actions }
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
    }).catch(err => console.error('Fund penalty failed:', err))
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

      // 5. Log daily cycle
      await supabase.from('handler_decisions').insert({
        user_id: uid,
        decision_type: 'daily_cycle',
        decision_data: {
          briefs_generated: briefsGenerated,
          active_briefs: activeBriefs || 0,
          strategy_updated: strategyUpdated,
        },
        reasoning: 'Daily 6 AM cycle: reset counters, expire old briefs, generate new assignments',
        executed: true,
        executed_at: new Date().toISOString(),
      })

      processed++
      results.push({
        user_id: uid,
        briefs_generated: briefsGenerated,
        strategy_updated: strategyUpdated,
      })
    } catch (err) {
      console.error(`Daily cycle failed for ${user.user_id}:`, err)
    }
  }

  return { processed, results }
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
        }).catch(err => console.error('Bleeding deduction failed:', err))

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
