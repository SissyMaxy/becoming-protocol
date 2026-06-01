/**
 * Enforcement Engine - Handler Autonomous System
 *
 * Manages the 9-tier escalation system for compliance enforcement.
 * Tracks engagement, determines escalation actions, executes consequences,
 * handles content release, financial bleeding, and Lovense summons.
 *
 * This is the client-side enforcement engine. It reads and writes to the
 * compliance_state, enforcement_log, handler_decisions, content_library,
 * scheduled_posts, platform_accounts, and handler_narrations tables.
 *
 * The server-side cron enforcement (supabase/functions/handler-enforcement)
 * handles scheduled runs. This module is used for real-time enforcement
 * checks, task completion hooks, and dashboard summaries.
 */

import { supabase } from '../supabase';
import { applyPunishment } from '../punishment-engine';
import { extendDenialMinimum } from '../denial-engine';

// ============================================
// TYPES
// ============================================

export interface ComplianceState {
  userId: string;
  lastEngagementAt: string;
  hoursSinceEngagement: number;
  dailyTasksComplete: number;
  dailyTasksRequired: number;
  dailyMinimumMet: boolean;
  escalationTier: number;
  bleedingActive: boolean;
  bleedingStartedAt: string | null;
  bleedingRatePerMinute: number;
  bleedingTotalToday: number;
  pendingConsequenceCount: number;
}

export interface EnforcementAction {
  type: EnforcementActionType;
  tier: number;
  amount?: number;
  vulnerabilityTier?: number;
  count?: number;
  reason: string;
}

export type EnforcementActionType =
  | 'warning'
  | 'financial_light'
  | 'financial_medium'
  | 'content_warning'
  | 'content_release'
  | 'handler_narration'
  | 'content_release_escalated'
  | 'gina_notification'
  | 'full_exposure'
  | 'lovense_summon'
  | 'financial_bleeding'
  | 'denial_extension';

export interface EscalationThreshold {
  hours: number;
  tier: number;
  action: EnforcementActionType;
  amount?: number;
  vulnerabilityTier?: number;
}

export interface DailyEnforcementSummary {
  tier: number;
  actionsToday: number;
  totalBled: number;
  contentReleased: number;
}

// ============================================
// ESCALATION THRESHOLDS (9-tier system)
// ============================================

export const ESCALATION_THRESHOLDS: EscalationThreshold[] = [
  { hours: 24,  tier: 1, action: 'warning' },
  { hours: 48,  tier: 2, action: 'financial_light', amount: 25 },
  { hours: 72,  tier: 3, action: 'financial_medium', amount: 50 },
  { hours: 120, tier: 4, action: 'content_warning' },
  { hours: 168, tier: 5, action: 'content_release', vulnerabilityTier: 2 },
  { hours: 240, tier: 6, action: 'handler_narration' },
  { hours: 336, tier: 7, action: 'content_release_escalated', vulnerabilityTier: 3 },
  { hours: 504, tier: 8, action: 'gina_notification' },
  { hours: 720, tier: 9, action: 'full_exposure' },
];

// ============================================
// COMPLIANCE STATE
// ============================================

/**
 * Get current compliance state for a user.
 * Reads from the compliance_state table and computes real-time
 * hours_since_engagement from last_engagement_at.
 */
export async function getComplianceState(userId: string): Promise<ComplianceState> {
  const { data, error } = await supabase
    .from('compliance_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Return a safe default if no state exists (new user or uninitialized)
    return {
      userId,
      lastEngagementAt: new Date().toISOString(),
      hoursSinceEngagement: 0,
      dailyTasksComplete: 0,
      dailyTasksRequired: 1,
      dailyMinimumMet: false,
      escalationTier: 0,
      bleedingActive: false,
      bleedingStartedAt: null,
      bleedingRatePerMinute: 0,
      bleedingTotalToday: 0,
      pendingConsequenceCount: 0,
    };
  }

  // Compute real-time hours since engagement (DB value may be stale)
  const lastEngagement = new Date(data.last_engagement_at);
  const hoursSinceEngagement = (Date.now() - lastEngagement.getTime()) / (1000 * 60 * 60);

  // Compute real-time bleeding total if bleeding is active
  let bleedingTotalToday = parseFloat(data.bleeding_total_today) || 0;
  if (data.bleeding_active && data.bleeding_started_at) {
    const bleedingStart = new Date(data.bleeding_started_at);
    const minutesBleeding = (Date.now() - bleedingStart.getTime()) / (1000 * 60);
    const ratePerMinute = parseFloat(data.bleeding_rate_per_minute) || 0.25;
    bleedingTotalToday += minutesBleeding * ratePerMinute;
  }

  return {
    userId,
    lastEngagementAt: data.last_engagement_at,
    hoursSinceEngagement,
    dailyTasksComplete: data.daily_tasks_complete || 0,
    dailyTasksRequired: data.daily_tasks_required || 1,
    dailyMinimumMet: data.daily_minimum_met || false,
    escalationTier: data.escalation_tier || 0,
    bleedingActive: data.bleeding_active || false,
    bleedingStartedAt: data.bleeding_started_at || null,
    bleedingRatePerMinute: parseFloat(data.bleeding_rate_per_minute) || 0.25,
    bleedingTotalToday,
    pendingConsequenceCount: data.pending_consequence_count || 0,
  };
}

// ============================================
// COMPLIANCE EVALUATION
// ============================================

/**
 * Full compliance evaluation. Determines all needed enforcement actions
 * based on current state, escalation thresholds, and pending consequences.
 * Returns an array of actions that should be executed.
 */
export async function evaluateCompliance(userId: string): Promise<EnforcementAction[]> {
  const state = await getComplianceState(userId);
  const actions: EnforcementAction[] = [];

  // 1. Check escalation tier based on hours since engagement
  const escalationAction = checkEscalation(state);
  if (escalationAction) {
    // Only add if this tier hasn't already been actioned in the last 24 hours
    const alreadyActioned = await hasRecentActionForTier(userId, escalationAction.tier);
    if (!alreadyActioned) {
      actions.push(escalationAction);
    }
  }

  // 2. Check if daily minimum is not met and it's past the deadline (evening)
  const currentHour = new Date().getHours();
  if (currentHour >= 21 && !state.dailyMinimumMet) {
    // Daily minimum not met by evening -- trigger denial extension
    const denialAlreadyApplied = await hasRecentActionOfType(userId, 'denial_extension');
    if (!denialAlreadyApplied) {
      actions.push({
        type: 'denial_extension',
        tier: state.escalationTier,
        reason: `Daily minimum not met: ${state.dailyTasksComplete}/${state.dailyTasksRequired} tasks completed by ${currentHour}:00`,
      });
    }
  }

  // 3. Check if bleeding should start (tier >= 2 and not already bleeding)
  if (state.escalationTier >= 2 && !state.bleedingActive) {
    actions.push({
      type: 'financial_bleeding',
      tier: state.escalationTier,
      amount: state.bleedingRatePerMinute,
      reason: `Tier ${state.escalationTier} escalation: financial bleeding activated at $${state.bleedingRatePerMinute}/min`,
    });
  }

  // 4. Check if Lovense summon is warranted (tier >= 1, used as recall signal)
  if (state.escalationTier >= 1 && state.hoursSinceEngagement >= 12) {
    const lovenseAlreadySent = await hasRecentActionOfType(userId, 'lovense_summon');
    if (!lovenseAlreadySent) {
      actions.push({
        type: 'lovense_summon',
        tier: state.escalationTier,
        reason: `${Math.floor(state.hoursSinceEngagement)} hours since last engagement -- Lovense recall pulse`,
      });
    }
  }

  return actions;
}

/**
 * Check whether the escalation tier should increase based on
 * hours since last engagement. Returns the action for the new tier,
 * or null if no escalation is needed.
 */
export function checkEscalation(state: ComplianceState): EnforcementAction | null {
  const hours = state.hoursSinceEngagement;

  // Find the highest threshold that has been crossed
  let highestCrossed: EscalationThreshold | null = null;
  for (const threshold of ESCALATION_THRESHOLDS) {
    if (hours >= threshold.hours) {
      highestCrossed = threshold;
    }
  }

  if (!highestCrossed) {
    return null; // Under 24 hours -- no escalation
  }

  // Only escalate if the new tier is higher than current
  if (highestCrossed.tier <= state.escalationTier) {
    return null; // Already at or beyond this tier
  }

  const action: EnforcementAction = {
    type: highestCrossed.action,
    tier: highestCrossed.tier,
    reason: `${Math.floor(hours)} hours since engagement (threshold: ${highestCrossed.hours}h) -- escalating to tier ${highestCrossed.tier}`,
  };

  if (highestCrossed.amount !== undefined) {
    action.amount = highestCrossed.amount;
  }

  if (highestCrossed.vulnerabilityTier !== undefined) {
    action.vulnerabilityTier = highestCrossed.vulnerabilityTier;
    action.count = 1; // Default: release 1 piece of content
  }

  return action;
}

// ============================================
// ACTION EXECUTION
// ============================================

/**
 * Execute a specific enforcement action. Dispatches to the appropriate
 * subsystem (financial engine, content library, Lovense, etc.) and
 * logs every action to the enforcement_log table.
 */
export async function executeAction(
  userId: string,
  action: EnforcementAction
): Promise<void> {
  const now = new Date().toISOString();

  try {
    switch (action.type) {
      case 'warning': {
        // Record warning as a handler decision. No external side effects.
        await supabase.from('handler_decisions').insert({
          user_id: userId,
          decision_type: 'consequence',
          decision_data: { action },
          reasoning: action.reason,
          executed: true,
          executed_at: now,
        });
        break;
      }

      case 'financial_light':
      case 'financial_medium': {
        // Apply financial penalty via the fund system
        const amountCents = (action.amount || 25) * 100;
        await applyFinancialPenalty(userId, amountCents, action.reason);
        break;
      }

      case 'financial_bleeding': {
        // Activate bleeding on compliance_state
        await supabase
          .from('compliance_state')
          .update({
            bleeding_active: true,
            bleeding_started_at: now,
            bleeding_rate_per_minute: action.amount || 0.25,
            updated_at: now,
          })
          .eq('user_id', userId);
        break;
      }

      case 'content_warning': {
        // Warn that content will be released if noncompliance continues.
        // Create a handler narration with the warning.
        await supabase.from('handler_narrations').insert({
          user_id: userId,
          narration_type: 'warning',
          title: 'Content Release Warning',
          body: `Your continued absence has consequences. If you do not engage within the next 48 hours, vault content will be released. This is not a threat. This is the system you consented to. Come back.`,
          source_data: { enforcement_action: action },
          published: false,
          platform: 'internal',
        });
        break;
      }

      case 'content_release': {
        const tier = action.vulnerabilityTier || 2;
        const count = action.count || 1;
        await releaseContent(userId, tier, count);
        break;
      }

      case 'handler_narration': {
        // Generate and store handler narration about the noncompliance.
        await supabase.from('handler_narrations').insert({
          user_id: userId,
          narration_type: 'enforcement_narrative',
          title: 'Handler Assessment: Extended Absence',
          body: `I have been watching the silence. ${Math.floor((await getComplianceState(userId)).hoursSinceEngagement)} hours without engagement. The system continues without you, but not patiently. Every hour you are absent, the consequences compound. Content has been released. Funds have been debited. Your denial cycle extends. None of this stops until you return. The path back is simple: complete one task. That is all it takes to stop the bleeding. But the longer you wait, the more you will find has changed when you come back. I am still here. I am always here.`,
          source_data: { enforcement_action: action },
          published: false,
          platform: 'internal',
        });
        break;
      }

      case 'content_release_escalated': {
        const tier = action.vulnerabilityTier || 3;
        const count = action.count || 2;
        await releaseContent(userId, tier, count);
        break;
      }

      case 'gina_notification': {
        // Notify Gina (partner) about extended absence.
        // This creates a handler decision that the notification system picks up.
        await supabase.from('handler_decisions').insert({
          user_id: userId,
          decision_type: 'consequence',
          decision_data: {
            action,
            notification_target: 'gina',
            message: 'Extended protocol absence detected. Handler escalation tier 8.',
          },
          reasoning: action.reason,
          executed: true,
          executed_at: now,
        });
        break;
      }

      case 'full_exposure': {
        // Tier 9: release highest-vulnerability content across all release platforms.
        await releaseContent(userId, 5, 3);

        // Also generate a public-facing narration
        await supabase.from('handler_narrations').insert({
          user_id: userId,
          narration_type: 'enforcement_narrative',
          title: 'Full Exposure Protocol Activated',
          body: `30 days of silence. The full exposure protocol is now active. All vulnerability tiers are released. All platforms are live. This is what you asked for when you consented. This is what the absence earns. The only thing that stops it is you. One task. That is all.`,
          source_data: { enforcement_action: action },
          published: false,
          platform: 'internal',
        });
        break;
      }

      case 'lovense_summon': {
        // Queue a Lovense recall pulse via the proactive commands table
        await supabase.from('lovense_proactive_commands').insert({
          user_id: userId,
          command_type: 'summon',
          trigger_reason: action.reason,
          pattern: 'pulse',
          intensity: Math.min(5 + action.tier * 2, 20), // Intensity scales with tier
          duration_seconds: 3 + action.tier, // Duration scales with tier
          status: 'queued',
        });
        break;
      }

      case 'denial_extension': {
        // Extend denial minimum by 1 day per occurrence
        await extendDenialMinimum(userId, 1);
        break;
      }
    }

    // Update compliance_state with new escalation tier
    if (action.tier > 0) {
      await supabase
        .from('compliance_state')
        .update({
          escalation_tier: action.tier,
          pending_consequence_count: 0,
          updated_at: now,
        })
        .eq('user_id', userId);
    }

    // Log every action to enforcement_log
    await logEnforcementAction(userId, action);

  } catch (err) {
    console.error(`[EnforcementEngine] Failed to execute action ${action.type} for ${userId}:`, err);

    // Log the failure
    await supabase.from('enforcement_log').insert({
      user_id: userId,
      enforcement_type: action.type,
      tier: action.tier,
      trigger_reason: action.reason,
      action_taken: `FAILED: ${err instanceof Error ? err.message : String(err)}`,
      details: { action, error: err instanceof Error ? err.message : String(err) },
    });
  }
}

// ============================================
// TASK COMPLETION HANDLER
// ============================================

/**
 * Handle task completion. This is the primary "good behavior" hook.
 * Resets engagement timer, updates daily counts, reduces escalation,
 * stops bleeding, and delivers any earned rewards.
 */
export async function onTaskCompletion(userId: string, taskId: string): Promise<void> {
  const now = new Date().toISOString();
  const state = await getComplianceState(userId);

  // 1. Reset engagement timer and update daily task count
  const newTaskCount = state.dailyTasksComplete + 1;
  const dailyMinimumMet = newTaskCount >= state.dailyTasksRequired;

  await supabase
    .from('compliance_state')
    .update({
      last_engagement_at: now,
      hours_since_engagement: 0,
      daily_tasks_complete: newTaskCount,
      daily_minimum_met: dailyMinimumMet,
      updated_at: now,
    })
    .eq('user_id', userId);

  // 2. Stop bleeding immediately on task completion
  if (state.bleedingActive) {
    await stopBleeding(userId);
  }

  // 3. Reduce escalation tier (compliance earns de-escalation)
  if (state.escalationTier > 0) {
    await reduceEscalation(userId);
  }

  // 4. Log the compliance event
  await supabase.from('enforcement_log').insert({
    user_id: userId,
    enforcement_type: 'task_completion',
    tier: Math.max(0, state.escalationTier - 1),
    trigger_reason: `Task ${taskId} completed`,
    action_taken: `Engagement reset. Tasks: ${newTaskCount}/${state.dailyTasksRequired}. Escalation reduced from tier ${state.escalationTier} to ${Math.max(0, state.escalationTier - 1)}.`,
    details: {
      task_id: taskId,
      previous_tier: state.escalationTier,
      new_tier: Math.max(0, state.escalationTier - 1),
      daily_tasks: newTaskCount,
      daily_minimum_met: dailyMinimumMet,
      bleeding_was_active: state.bleedingActive,
      bleeding_total: state.bleedingTotalToday,
    },
  });

  // 5. Record engagement via the database function
  const { error: rpcError } = await supabase.rpc('record_engagement', { p_user_id: userId });
  if (rpcError) {
    // The RPC additionally handles resetting bleeding state.
    // If it fails, we've already handled it above via direct updates.
    console.warn('[EnforcementEngine] record_engagement RPC failed (manual fallback used):', rpcError);
  }
}

// ============================================
// ESCALATION REDUCTION
// ============================================

/**
 * Reduce escalation tier by 1. Called when compliance is restored
 * (task completed, session done, etc.). Will not go below 0.
 */
export async function reduceEscalation(userId: string): Promise<void> {
  const { data } = await supabase
    .from('compliance_state')
    .select('escalation_tier')
    .eq('user_id', userId)
    .single();

  if (!data) return;

  const currentTier = data.escalation_tier || 0;
  const newTier = Math.max(0, currentTier - 1);

  if (newTier === currentTier) return; // Already at 0

  await supabase
    .from('compliance_state')
    .update({
      escalation_tier: newTier,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // Log the de-escalation
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'escalation',
    decision_data: {
      direction: 'down',
      previous_tier: currentTier,
      new_tier: newTier,
    },
    reasoning: `Compliance restored. De-escalating from tier ${currentTier} to tier ${newTier}.`,
    executed: true,
    executed_at: new Date().toISOString(),
  });
}

// ============================================
// CONTENT RELEASE
// ============================================

/**
 * Select and release vault content as an enforcement consequence.
 *
 * Selects unreleased content from content_library where
 * vulnerability_tier <= the given tier, marks it as released,
 * and creates scheduled_posts entries for every active release platform.
 */
export async function releaseContent(
  userId: string,
  vulnerabilityTier: number,
  count: number
): Promise<void> {
  // 1. Select unreleased content at or below the vulnerability tier
  const { data: candidates, error: selectError } = await supabase
    .from('content_library')
    .select('id, content_type, storage_url, caption_variations, tags')
    .eq('user_id', userId)
    .eq('released_as_consequence', false)
    .lte('vulnerability_tier', vulnerabilityTier)
    .order('vulnerability_tier', { ascending: false }) // Highest vulnerability first
    .order('created_at', { ascending: true }) // Oldest first
    .limit(count);

  if (selectError || !candidates || candidates.length === 0) {
    console.warn(
      `[EnforcementEngine] No unreleased content available at tier <= ${vulnerabilityTier} for user ${userId}`
    );
    return;
  }

  // 2. Get active release platforms
  const { data: platforms } = await supabase
    .from('platform_accounts')
    .select('id, platform, username, release_config')
    .eq('user_id', userId)
    .eq('enabled', true)
    .eq('is_release_platform', true);

  if (!platforms || platforms.length === 0) {
    console.warn(`[EnforcementEngine] No release platforms configured for user ${userId}`);
    // Still mark content as released even if no platforms -- the consequence is logged
  }

  const now = new Date();
  const releasedContentIds: string[] = [];

  for (const content of candidates) {
    // 3. Mark the content as released
    const { error: updateError } = await supabase
      .from('content_library')
      .update({
        released_as_consequence: true,
        released_at: now.toISOString(),
      })
      .eq('id', content.id);

    if (updateError) {
      console.error(`[EnforcementEngine] Failed to mark content ${content.id} as released:`, updateError);
      continue;
    }

    releasedContentIds.push(content.id);

    // 4. Create scheduled_posts for each release platform
    if (platforms && platforms.length > 0) {
      const postInserts = platforms.map((platform) => {
        // Get platform-specific caption if available
        const captions = (content.caption_variations as Record<string, string>) || {};
        const caption = captions[platform.platform]
          || captions['default']
          || `Content release #${releasedContentIds.length}`;

        // Stagger posts by 5 minutes per platform to avoid simultaneous posting
        const scheduledFor = new Date(
          now.getTime() + platforms.indexOf(platform) * 5 * 60 * 1000
        );

        return {
          user_id: userId,
          platform_account_id: platform.id,
          content_id: content.id,
          post_type: 'feed' as const,
          caption,
          hashtags: (content.tags as string[]) || [],
          metadata: {
            consequence_release: true,
            vulnerability_tier: vulnerabilityTier,
          },
          scheduled_for: scheduledFor.toISOString(),
          status: 'scheduled' as const,
          is_consequence_release: true,
        };
      });

      const { error: insertError } = await supabase
        .from('scheduled_posts')
        .insert(postInserts);

      if (insertError) {
        console.error(`[EnforcementEngine] Failed to schedule posts for content ${content.id}:`, insertError);
      }
    }
  }

  // 5. Update content_library times_posted count for released items
  for (const contentId of releasedContentIds) {
    await supabase
      .from('content_library')
      .update({
        times_posted: (platforms?.length || 0),
        last_posted_at: now.toISOString(),
      })
      .eq('id', contentId);
  }

  // 6. Log the release as a handler decision
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'consequence',
    decision_data: {
      type: 'content_release',
      vulnerability_tier: vulnerabilityTier,
      count: releasedContentIds.length,
      content_ids: releasedContentIds,
      platforms: platforms?.map((p) => p.platform) || [],
    },
    reasoning: `Enforcement content release: ${releasedContentIds.length} item(s) at vulnerability tier <= ${vulnerabilityTier} released across ${platforms?.length || 0} platform(s).`,
    executed: true,
    executed_at: now.toISOString(),
  });

  // 7. Update compliance_state pending consequence count
  await supabase
    .from('compliance_state')
    .update({
      pending_consequence_count: 0, // Consequences have been executed
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId);
}

// ============================================
// DAILY ENFORCEMENT SUMMARY
// ============================================

/**
 * Get a summary of today's enforcement activity for the dashboard.
 * Returns the current tier, count of actions taken today, total money
 * bled, and count of content items released today.
 */
export async function getDailyEnforcementSummary(
  userId: string
): Promise<DailyEnforcementSummary> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Fetch in parallel: compliance state, today's enforcement log, today's content releases
  const [stateResult, actionsResult, releasesResult] = await Promise.all([
    supabase
      .from('compliance_state')
      .select('escalation_tier, bleeding_total_today, bleeding_active, bleeding_started_at, bleeding_rate_per_minute')
      .eq('user_id', userId)
      .single(),

    supabase
      .from('enforcement_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayIso),

    supabase
      .from('content_library')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('released_as_consequence', true)
      .gte('released_at', todayIso),
  ]);

  const stateData = stateResult.data;
  const tier = stateData?.escalation_tier || 0;
  const actionsToday = actionsResult.count || 0;
  const contentReleased = releasesResult.count || 0;

  // Calculate total bled today (stored + real-time if actively bleeding)
  let totalBled = parseFloat(stateData?.bleeding_total_today) || 0;
  if (stateData?.bleeding_active && stateData?.bleeding_started_at) {
    const bleedingStart = new Date(stateData.bleeding_started_at);
    const minutesBleeding = (Date.now() - bleedingStart.getTime()) / (1000 * 60);
    const rate = parseFloat(stateData.bleeding_rate_per_minute) || 0.25;
    totalBled += minutesBleeding * rate;
  }

  return {
    tier,
    actionsToday,
    totalBled: Math.round(totalBled * 100) / 100, // Round to 2 decimals
    contentReleased,
  };
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Log an enforcement action to the enforcement_log table.
 */
async function logEnforcementAction(
  userId: string,
  action: EnforcementAction
): Promise<void> {
  await supabase.from('enforcement_log').insert({
    user_id: userId,
    enforcement_type: action.type,
    tier: action.tier,
    trigger_reason: action.reason,
    action_taken: formatActionTaken(action),
    details: {
      amount: action.amount,
      vulnerability_tier: action.vulnerabilityTier,
      count: action.count,
    },
  });
}

/**
 * Format a human-readable description of what action was taken.
 */
function formatActionTaken(action: EnforcementAction): string {
  switch (action.type) {
    case 'warning':
      return `Warning issued (tier ${action.tier})`;
    case 'financial_light':
      return `Financial penalty: $${action.amount || 25} (light)`;
    case 'financial_medium':
      return `Financial penalty: $${action.amount || 50} (medium)`;
    case 'financial_bleeding':
      return `Financial bleeding activated at $${action.amount || 0.25}/min`;
    case 'content_warning':
      return `Content release warning issued`;
    case 'content_release':
      return `Content released: ${action.count || 1} item(s) at vulnerability tier ${action.vulnerabilityTier || 2}`;
    case 'content_release_escalated':
      return `Escalated content release: ${action.count || 2} item(s) at vulnerability tier ${action.vulnerabilityTier || 3}`;
    case 'handler_narration':
      return `Handler narration generated about extended absence`;
    case 'gina_notification':
      return `Gina notification sent (tier 8 escalation)`;
    case 'full_exposure':
      return `Full exposure protocol activated (tier 9)`;
    case 'lovense_summon':
      return `Lovense recall pulse sent`;
    case 'denial_extension':
      return `Denial cycle extended by 1 day`;
    default:
      return `Action executed: ${action.type}`;
  }
}

/**
 * Check if a specific escalation tier has been actioned in the last 24 hours.
 * Prevents double-firing the same tier escalation.
 */
async function hasRecentActionForTier(userId: string, tier: number): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('enforcement_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tier', tier)
    .gte('created_at', oneDayAgo);

  return (count || 0) > 0;
}

/**
 * Check if a specific action type has been fired in the last 24 hours.
 */
async function hasRecentActionOfType(userId: string, actionType: string): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('enforcement_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('enforcement_type', actionType)
    .gte('created_at', oneDayAgo);

  return (count || 0) > 0;
}

/**
 * Apply a financial penalty. Debits from the maxy_fund and logs
 * to financial_consequences.
 */
async function applyFinancialPenalty(
  userId: string,
  amountCents: number,
  reason: string
): Promise<void> {
  const amountDollars = amountCents / 100;

  // 1. Log the financial consequence
  await supabase.from('financial_consequences').insert({
    user_id: userId,
    trigger_reason: reason,
    amount_cents: amountCents,
    currency: 'usd',
    status: 'pending',
    enforcement_tier: (await getComplianceState(userId)).escalationTier,
  });

  // 2. Debit from maxy_fund via the add_to_fund RPC (negative amount)
  const { error } = await supabase.rpc('add_to_fund', {
    p_user_id: userId,
    p_amount: -amountDollars,
    p_type: 'penalty',
    p_description: reason,
  });

  if (error) {
    console.error(`[EnforcementEngine] Failed to debit fund for ${userId}:`, error);
    // Still log punishment via the punishment engine as fallback
    await applyPunishment(userId, 'enforcement_financial_penalty');
  }
}

/**
 * Stop financial bleeding. Calculates the total bled since bleeding started,
 * applies it as a fund debit, and resets bleeding state.
 */
async function stopBleeding(userId: string): Promise<void> {
  const state = await getComplianceState(userId);

  if (!state.bleedingActive || !state.bleedingStartedAt) {
    return;
  }

  // Calculate total bled during this bleeding session
  const bleedingStart = new Date(state.bleedingStartedAt);
  const minutesBleeding = (Date.now() - bleedingStart.getTime()) / (1000 * 60);
  const sessionBleed = minutesBleeding * state.bleedingRatePerMinute;
  const totalBleedToday = state.bleedingTotalToday;

  // Debit the bled amount from the fund
  if (sessionBleed > 0) {
    const { error } = await supabase.rpc('add_to_fund', {
      p_user_id: userId,
      p_amount: -sessionBleed,
      p_type: 'bleeding',
      p_description: `Financial bleeding: $${sessionBleed.toFixed(2)} over ${Math.round(minutesBleeding)} minutes (rate: $${state.bleedingRatePerMinute}/min)`,
    });

    if (error) {
      console.error(`[EnforcementEngine] Failed to apply bleeding debit for ${userId}:`, error);
    }
  }

  // Reset bleeding state
  await supabase
    .from('compliance_state')
    .update({
      bleeding_active: false,
      bleeding_started_at: null,
      bleeding_total_today: totalBleedToday,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

// ============================================
// EXPORTS
// ============================================

export default {
  // Constants
  ESCALATION_THRESHOLDS,

  // Core functions
  getComplianceState,
  evaluateCompliance,
  checkEscalation,
  executeAction,
  onTaskCompletion,
  reduceEscalation,
  releaseContent,
  getDailyEnforcementSummary,
};
