/**
 * Arousal Controller - Handler Autonomous System
 *
 * Manages Lovense integration, denial tracking, and arousal-based rewards.
 * Part of the Handler v2 autonomous subsystem that controls arousal state
 * as a lever for compliance and behavioral shaping.
 *
 * Key responsibilities:
 * - Summoning user via Lovense activation when engagement lapses
 * - Delivering calibrated arousal rewards for task completion
 * - Enforcing denial cycles and scheduling frustration activations
 * - Tracking edge counts toward release thresholds
 */

import { supabase } from '../supabase';
import {
  smartVibrate,
  sendTaskCompleteBuzz,
} from '../lovense';

// ============================================
// TYPES
// ============================================

export interface ArousalState {
  userId: string;
  denialDays: number;
  edgeCount: number;
  releaseThreshold: number;
  lastRelease: string | null;
  isLocked: boolean;
  earnedSessionMinutes: number;
  currentLovenseMode: string | null;
  scheduledActivations: ScheduledActivation[];
}

export interface ScheduledActivation {
  id: string;
  scheduledFor: string;
  commandType: string;
  pattern: string;
  intensity: number;
  durationSeconds: number;
  executed: boolean;
}

export interface LovensePattern {
  type: string;
  intensity: number;
  durationMs?: number;
  intervalMs?: number;
  minIntensity?: number;
  maxIntensity?: number;
}

export type ArousalRewardType = 'pulse' | 'session' | 'edge_credit' | 'release_consideration';

export interface ArousalReward {
  type: ArousalRewardType;
  intensity?: number;
  duration?: number;
  minutes?: number;
  count?: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Default edge threshold before release consideration becomes possible */
const DEFAULT_RELEASE_THRESHOLD = 15;

/** Maximum frustration activations that can be scheduled per day */
const MAX_FRUSTRATION_ACTIVATIONS = 8;

/** Window in hours over which frustration activations are spread */
const FRUSTRATION_WINDOW_HOURS = 12;

/** Minimum gap in minutes between scheduled frustration activations */
const MIN_FRUSTRATION_GAP_MINUTES = 30;

// ============================================
// AROUSAL STATE
// ============================================

/**
 * Get the current arousal state for a user.
 * Combines data from denial_state, daily_arousal_plans, and lovense_proactive_commands.
 */
export async function getArousalState(userId: string): Promise<ArousalState> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch denial state and today's arousal plan in parallel
  const [denialResult, arousalPlanResult, scheduledResult] = await Promise.all([
    supabase
      .from('denial_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('daily_arousal_plans')
      .select('current_arousal_level, edge_count, total_target_duration_minutes')
      .eq('user_id', userId)
      .eq('plan_date', today)
      .maybeSingle(),
    supabase
      .from('lovense_proactive_commands')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true }),
  ]);

  const denial = denialResult.data;
  const arousalPlan = arousalPlanResult.data;
  const scheduled = scheduledResult.data || [];

  // Map scheduled commands to ScheduledActivation
  const scheduledActivations: ScheduledActivation[] = scheduled.map(
    (cmd: Record<string, unknown>) => ({
      id: cmd.id as string,
      scheduledFor: cmd.created_at as string,
      commandType: cmd.command_type as string,
      pattern: (cmd.pattern as string) || 'pulse',
      intensity: (cmd.intensity as number) || 10,
      durationSeconds: (cmd.duration_seconds as number) || 5,
      executed: cmd.status !== 'queued',
    })
  );

  // Determine current Lovense mode from most recent active command
  const activeCommand = scheduled.find(
    (cmd: Record<string, unknown>) => cmd.status === 'sent'
  );

  return {
    userId,
    denialDays: denial?.current_denial_day || 0,
    edgeCount: arousalPlan?.edge_count || 0,
    releaseThreshold: DEFAULT_RELEASE_THRESHOLD,
    lastRelease: denial?.last_release_at || null,
    isLocked: denial?.is_locked || false,
    earnedSessionMinutes: arousalPlan?.total_target_duration_minutes || 0,
    currentLovenseMode: activeCommand
      ? (activeCommand as Record<string, unknown>).command_type as string
      : null,
    scheduledActivations,
  };
}

// ============================================
// SUMMONING
// ============================================

/**
 * Select the appropriate summons pattern based on how long the user
 * has been absent from the app.
 *
 * - < 6 hours: gentle pulse (reminder)
 * - < 24 hours: wave pattern (escalated reminder)
 * - > 24 hours: frustration pattern (urgent recall)
 */
export function selectSummonsPattern(hoursSinceEngagement: number): LovensePattern {
  if (hoursSinceEngagement < 6) {
    return {
      type: 'pulse',
      intensity: 8,
      durationMs: 3000,
      intervalMs: 1000,
      minIntensity: 4,
      maxIntensity: 8,
    };
  }

  if (hoursSinceEngagement < 24) {
    return {
      type: 'wave',
      intensity: 12,
      durationMs: 8000,
      intervalMs: 500,
      minIntensity: 5,
      maxIntensity: 14,
    };
  }

  // > 24 hours: aggressive frustration summon
  return {
    type: 'frustration',
    intensity: 16,
    durationMs: 15000,
    intervalMs: 300,
    minIntensity: 8,
    maxIntensity: 18,
  };
}

/**
 * Activate a Lovense summon pattern and queue the command for execution.
 * The actual device activation happens when the client polls for queued commands.
 */
export async function summonUser(userId: string, reason: string): Promise<void> {
  // Determine hours since last engagement
  const { data: lastActivity } = await supabase
    .from('task_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let hoursSinceEngagement = 12; // default assumption
  if (lastActivity?.completed_at) {
    const lastTime = new Date(lastActivity.completed_at).getTime();
    hoursSinceEngagement = (Date.now() - lastTime) / (1000 * 60 * 60);
  }

  const pattern = selectSummonsPattern(hoursSinceEngagement);

  // Queue the command in lovense_proactive_commands
  const { error } = await supabase
    .from('lovense_proactive_commands')
    .insert({
      user_id: userId,
      command_type: 'summon',
      trigger_reason: reason,
      pattern: pattern.type,
      intensity: pattern.intensity,
      duration_seconds: Math.ceil((pattern.durationMs || 5000) / 1000),
      status: 'queued',
    });

  if (error) {
    console.error('[ArousalController] Failed to queue summon command:', error);
  }
}

// ============================================
// REWARDS
// ============================================

/**
 * Calculate the appropriate arousal reward for a completed task.
 *
 * Reward escalation:
 * - difficulty 1-2 + low vulnerability: pulse (brief Lovense buzz)
 * - difficulty 3-4 OR vulnerability tier >= 2: session minutes
 * - difficulty 5+ AND vulnerability tier >= 2: edge credit
 * - difficulty 5+ AND vulnerability tier >= 3: release consideration
 */
export function calculateRewardForTask(
  difficulty: number,
  vulnerabilityTier: number
): ArousalReward {
  // Clamp inputs
  const diff = Math.max(1, Math.min(5, difficulty));
  const vuln = Math.max(0, Math.min(5, vulnerabilityTier));

  // Release consideration: hardest tasks during peak vulnerability
  if (diff >= 5 && vuln >= 3) {
    return {
      type: 'release_consideration',
      count: 1,
    };
  }

  // Edge credit: difficult tasks during vulnerability
  if (diff >= 5 && vuln >= 2) {
    return {
      type: 'edge_credit',
      count: 1,
    };
  }

  // Session minutes: moderate difficulty or moderate vulnerability
  if (diff >= 3 || vuln >= 2) {
    // Grant 3-8 minutes based on difficulty
    const minutes = Math.min(8, 2 + diff);
    return {
      type: 'session',
      minutes,
    };
  }

  // Default: pulse reward
  // Intensity scales with difficulty (5-12 on 0-20 scale)
  const intensity = Math.min(12, 4 + diff * 2);
  return {
    type: 'pulse',
    intensity,
    duration: 3, // seconds
  };
}

/**
 * Deliver an arousal reward to the user.
 *
 * - pulse: Queue a Lovense buzz command
 * - session: Grant earned session minutes
 * - edge_credit: Increment edge count toward release threshold
 * - release_consideration: Check if threshold is met (does NOT auto-release)
 */
export async function deliverReward(
  userId: string,
  reward: ArousalReward
): Promise<void> {
  switch (reward.type) {
    case 'pulse': {
      // Queue a reward buzz via proactive commands
      const { error } = await supabase
        .from('lovense_proactive_commands')
        .insert({
          user_id: userId,
          command_type: 'reward',
          trigger_reason: 'task_completion_reward',
          pattern: 'pulse',
          intensity: reward.intensity || 10,
          duration_seconds: reward.duration || 3,
          status: 'queued',
        });

      if (error) {
        console.error('[ArousalController] Failed to queue reward pulse:', error);
      }

      // Also fire the standard task complete buzz for immediate feedback
      await sendTaskCompleteBuzz().catch((err) => {
        console.warn('[ArousalController] sendTaskCompleteBuzz failed:', err);
      });
      break;
    }

    case 'session': {
      const minutesToGrant = reward.minutes || 5;
      const today = new Date().toISOString().split('T')[0];

      // Upsert today's arousal plan with additional earned minutes
      const { data: existing } = await supabase
        .from('daily_arousal_plans')
        .select('id, total_target_duration_minutes')
        .eq('user_id', userId)
        .eq('plan_date', today)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('daily_arousal_plans')
          .update({
            total_target_duration_minutes:
              (existing.total_target_duration_minutes || 0) + minutesToGrant,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('daily_arousal_plans').insert({
          user_id: userId,
          plan_date: today,
          arousal_state_at_generation: 'reward_granted',
          denial_day_at_generation: 0,
          plan_intensity: 'moderate',
          total_target_duration_minutes: minutesToGrant,
          status: 'active',
        });
      }
      break;
    }

    case 'edge_credit': {
      const creditsToAdd = reward.count || 1;
      const today = new Date().toISOString().split('T')[0];

      // Increment edge count in today's arousal plan
      const { data: existing } = await supabase
        .from('daily_arousal_plans')
        .select('id, edges_achieved')
        .eq('user_id', userId)
        .eq('plan_date', today)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('daily_arousal_plans')
          .update({
            edges_achieved: (existing.edges_achieved || 0) + creditsToAdd,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('daily_arousal_plans').insert({
          user_id: userId,
          plan_date: today,
          arousal_state_at_generation: 'edge_credit_earned',
          denial_day_at_generation: 0,
          plan_intensity: 'moderate',
          edges_achieved: creditsToAdd,
          status: 'active',
        });
      }

      // Note: We do NOT auto-release even if threshold is reached.
      // The Handler evaluates release eligibility separately.
      break;
    }

    case 'release_consideration': {
      // Check if the user has reached the release threshold
      const state = await getArousalState(userId);
      const totalEdges = state.edgeCount + (reward.count || 0);

      if (totalEdges >= state.releaseThreshold) {
        // Log that release consideration has been triggered
        // The Handler will evaluate separately - we just record the event
        await supabase.from('lovense_proactive_commands').insert({
          user_id: userId,
          command_type: 'release_consideration',
          trigger_reason: `Edge threshold reached: ${totalEdges}/${state.releaseThreshold}`,
          pattern: 'notification',
          intensity: 5,
          duration_seconds: 2,
          status: 'queued',
        });
      }
      break;
    }
  }
}

// ============================================
// DENIAL ENFORCEMENT
// ============================================

/**
 * Daily denial enforcement routine.
 * Increments the denial day counter and schedules frustration activations
 * when the user has been in denial for 3+ days.
 */
export async function enforceDenial(userId: string): Promise<void> {
  // Get current denial state
  const { data: denial, error: fetchError } = await supabase
    .from('denial_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[ArousalController] Failed to fetch denial state:', fetchError);
    return;
  }

  if (!denial) {
    // No denial state exists; initialize one
    await supabase.from('denial_state').insert({
      user_id: userId,
      current_denial_day: 1,
      is_locked: true,
      lock_started_at: new Date().toISOString(),
      total_denial_days: 1,
    });
    return;
  }

  const newDay = (denial.current_denial_day || 0) + 1;

  // Update denial state
  const { error: updateError } = await supabase
    .from('denial_state')
    .update({
      current_denial_day: newDay,
      total_denial_days: (denial.total_denial_days || 0) + 1,
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('[ArousalController] Failed to update denial state:', updateError);
    return;
  }

  // At 3+ days of denial, schedule frustration activations
  // Intensity scales with denial days
  if (newDay >= 3) {
    const activationCount = Math.min(
      MAX_FRUSTRATION_ACTIVATIONS,
      Math.floor(newDay / 2) + 1
    );
    await scheduleFrustrationActivations(userId, activationCount);
  }
}

/**
 * Extend the denial minimum by a specified number of days.
 * Used as a consequence for non-compliance or as part of behavioral shaping.
 */
export async function extendDenial(userId: string, days: number): Promise<void> {
  if (days <= 0) return;

  // Extend the minimum on the active denial cycle
  const { data: activeCycle, error: fetchError } = await supabase
    .from('denial_cycles')
    .select('id, minimum_days')
    .eq('user_id', userId)
    .is('actual_release_day', null)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error('[ArousalController] Failed to fetch active denial cycle:', fetchError);
    return;
  }

  if (activeCycle) {
    const newMinimum = (activeCycle.minimum_days || 3) + days;

    const { error: updateError } = await supabase
      .from('denial_cycles')
      .update({ minimum_days: newMinimum })
      .eq('id', activeCycle.id);

    if (updateError) {
      console.error('[ArousalController] Failed to extend denial minimum:', updateError);
    }
  }

  // Also schedule immediate frustration activation as reinforcement
  await supabase.from('lovense_proactive_commands').insert({
    user_id: userId,
    command_type: 'punishment_buzz',
    trigger_reason: `Denial extended by ${days} day(s)`,
    pattern: 'frustration',
    intensity: 14,
    duration_seconds: 10,
    status: 'queued',
  });
}

// ============================================
// FRUSTRATION SCHEDULING
// ============================================

/**
 * Schedule random frustration activations spread across the next 12 hours.
 * Creates `count` entries in lovense_proactive_commands with random timing.
 * Minimum gap between activations is enforced to prevent overwhelming clusters.
 */
export async function scheduleFrustrationActivations(
  userId: string,
  count: number
): Promise<void> {
  const safeCount = Math.min(count, MAX_FRUSTRATION_ACTIVATIONS);
  if (safeCount <= 0) return;

  const now = Date.now();
  const windowMs = FRUSTRATION_WINDOW_HOURS * 60 * 60 * 1000;
  const minGapMs = MIN_FRUSTRATION_GAP_MINUTES * 60 * 1000;

  // Generate random timestamps within the window, ensuring minimum gaps
  const timestamps: number[] = [];
  let attempts = 0;
  const maxAttempts = safeCount * 20; // prevent infinite loops

  while (timestamps.length < safeCount && attempts < maxAttempts) {
    attempts++;
    const candidate = now + Math.random() * windowMs;

    // Ensure minimum gap from all existing timestamps
    const tooClose = timestamps.some(
      (ts) => Math.abs(ts - candidate) < minGapMs
    );

    if (!tooClose) {
      timestamps.push(candidate);
    }
  }

  // Sort chronologically
  timestamps.sort((a, b) => a - b);

  // Get current denial day for intensity scaling
  const { data: denial } = await supabase
    .from('denial_state')
    .select('current_denial_day')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDays = denial?.current_denial_day || 3;

  // Create commands for each scheduled activation
  const commands = timestamps.map((ts) => {
    // Intensity scales with denial days: base 8, +1 per day, max 18
    const baseIntensity = Math.min(18, 8 + denialDays);
    // Add some randomness to each activation's intensity (+/- 3)
    const intensity = Math.max(
      5,
      Math.min(20, baseIntensity + Math.floor(Math.random() * 7) - 3)
    );
    // Duration: 3-10 seconds, longer with more denial days
    const durationSeconds = Math.min(10, 3 + Math.floor(denialDays / 2));

    return {
      user_id: userId,
      command_type: 'tease',
      trigger_reason: `Scheduled frustration activation (denial day ${denialDays})`,
      pattern: 'frustration',
      intensity,
      duration_seconds: durationSeconds,
      status: 'queued' as const,
      created_at: new Date(ts).toISOString(),
    };
  });

  if (commands.length > 0) {
    const { error } = await supabase
      .from('lovense_proactive_commands')
      .insert(commands);

    if (error) {
      console.error(
        '[ArousalController] Failed to schedule frustration activations:',
        error
      );
    }
  }
}

// ============================================
// SCHEDULED EXECUTION
// ============================================

/**
 * Execute any due scheduled activations for a user.
 * Returns the number of activations that were executed.
 *
 * This should be called periodically (e.g., on app foreground or via polling)
 * to process queued commands whose scheduled time has arrived.
 */
export async function executeScheduledActivations(userId: string): Promise<number> {
  const now = new Date().toISOString();

  // Fetch all queued commands whose created_at is in the past (i.e., due)
  const { data: dueCommands, error: fetchError } = await supabase
    .from('lovense_proactive_commands')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .lte('created_at', now)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error(
      '[ArousalController] Failed to fetch scheduled activations:',
      fetchError
    );
    return 0;
  }

  if (!dueCommands || dueCommands.length === 0) {
    return 0;
  }

  let executedCount = 0;

  for (const cmd of dueCommands) {
    try {
      const intensity = (cmd.intensity as number) || 10;
      const durationSec = (cmd.duration_seconds as number) || 5;
      const commandType = cmd.command_type as string;

      // Fire the Lovense command based on type
      switch (commandType) {
        case 'summon':
        case 'tease':
        case 'punishment_buzz':
        case 'anchor_reinforcement': {
          await smartVibrate(intensity, durationSec, commandType as 'manual');
          break;
        }
        case 'reward': {
          await sendTaskCompleteBuzz().catch(() => {
            // Fall back to manual vibrate if pattern fails
            return smartVibrate(intensity, durationSec, 'task_complete');
          });
          break;
        }
        case 'release_consideration': {
          // No Lovense action -- this is a notification-only event
          break;
        }
        default: {
          await smartVibrate(intensity, durationSec, 'manual');
          break;
        }
      }

      // Mark as sent
      await supabase
        .from('lovense_proactive_commands')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', cmd.id);

      executedCount++;
    } catch (err) {
      console.error(
        `[ArousalController] Failed to execute activation ${cmd.id}:`,
        err
      );

      // Mark as failed
      await supabase
        .from('lovense_proactive_commands')
        .update({
          status: 'failed',
          error_message:
            err instanceof Error ? err.message : 'Unknown execution error',
        })
        .eq('id', cmd.id);
    }

    // Brief pause between activations to avoid overwhelming the device
    await sleep(500);
  }

  return executedCount;
}

// ============================================
// DENIAL SUMMARY
// ============================================

/**
 * Get a summary of the user's denial state for dashboard display.
 */
export async function getDenialSummary(userId: string): Promise<{
  denialDays: number;
  edgeCount: number;
  releaseThreshold: number;
  edgesRemaining: number;
}> {
  const state = await getArousalState(userId);

  const edgesRemaining = Math.max(0, state.releaseThreshold - state.edgeCount);

  return {
    denialDays: state.denialDays,
    edgeCount: state.edgeCount,
    releaseThreshold: state.releaseThreshold,
    edgesRemaining,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Simple sleep utility for pacing Lovense commands.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
