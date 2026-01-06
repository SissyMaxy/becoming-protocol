// System Triggers Library
// Cross-system integration for unified conditioning

import { checkAndTriggerEscalations, getImminentEscalations } from './escalations';
import { checkCeremonyAvailability } from './ceremonies';
import { getAvailableCommitments } from './commitments';
import type { ArousalState } from '../types/arousal';
import type { ArousalState as CommitmentsArousalState } from '../types/commitments';

// ============================================
// TRIGGER TYPES
// ============================================

export type SystemEvent =
  // Task events
  | 'task_completed'
  | 'task_skipped'
  | 'all_tasks_completed'
  // Edge events
  | 'edge_reached'
  | 'edge_session_completed'
  | 'denial_day_incremented'
  // Hypno events
  | 'hypno_completed'
  | 'sleep_hypno_completed'
  // Identity events
  | 'affirmation_spoken'
  | 'name_used'
  | 'deadname_detected'
  // Investment events
  | 'investment_made'
  | 'item_purchased'
  // Ceremony events
  | 'ceremony_available'
  | 'ceremony_completed'
  // Commitment events
  | 'commitment_made'
  | 'commitment_fulfilled'
  | 'commitment_broken'
  // Guy mode events
  | 'guy_mode_entered'
  | 'guy_mode_exited'
  // Escalation events
  | 'escalation_triggered'
  | 'escalation_warning';

export type SystemTarget =
  | 'haptic'
  | 'points'
  | 'hypno'
  | 'evidence'
  | 'identity'
  | 'task'
  | 'conditioning'
  | 'affirmation'
  | 'notification'
  | 'trigger'
  | 'content';

export interface SystemAction {
  target: SystemTarget;
  action: string;
  params?: Record<string, unknown>;
}

export interface TriggerResult {
  executed: SystemAction[];
  failed: { action: SystemAction; error: string }[];
}

// ============================================
// TRIGGER DEFINITIONS
// ============================================

const TRIGGER_MAP: Record<SystemEvent, SystemAction[]> = {
  // Task events
  task_completed: [
    { target: 'haptic', action: 'reward_pulse' },
    { target: 'points', action: 'add_points', params: { source: 'task' } },
    { target: 'evidence', action: 'log_completion' },
    { target: 'identity', action: 'increment_she_counter' },
    { target: 'affirmation', action: 'show_completion_affirmation' },
  ],
  task_skipped: [
    { target: 'points', action: 'deduct_points', params: { amount: 15 } },
    { target: 'evidence', action: 'log_skip' },
    { target: 'task', action: 'schedule_for_tomorrow' },
    { target: 'conditioning', action: 'flag_resistance' },
  ],
  all_tasks_completed: [
    { target: 'haptic', action: 'celebration_pattern' },
    { target: 'points', action: 'add_bonus', params: { amount: 25 } },
    { target: 'affirmation', action: 'show_perfect_day' },
    { target: 'evidence', action: 'log_perfect_day' },
    { target: 'notification', action: 'schedule_celebration' },
  ],

  // Edge events
  edge_reached: [
    { target: 'haptic', action: 'edge_pattern' },
    { target: 'task', action: 'check_edge_task_progress' },
    { target: 'affirmation', action: 'show_edge_affirmation' },
    { target: 'conditioning', action: 'strengthen_arousal_identity_link' },
    { target: 'evidence', action: 'log_edge' },
  ],
  edge_session_completed: [
    { target: 'haptic', action: 'session_complete_pattern' },
    { target: 'points', action: 'add_points', params: { source: 'edge_session' } },
    { target: 'evidence', action: 'log_session' },
    { target: 'conditioning', action: 'increment_session_count' },
  ],
  denial_day_incremented: [
    { target: 'task', action: 'unlock_denial_gated_tasks' },
    { target: 'content', action: 'unlock_denial_gated_content' },
    { target: 'hypno', action: 'recommend_deeper_files' },
    { target: 'notification', action: 'increase_tease_frequency' },
    { target: 'haptic', action: 'enable_random_pulses' },
    { target: 'evidence', action: 'log_denial_milestone' },
  ],

  // Hypno events
  hypno_completed: [
    { target: 'task', action: 'mark_hypno_task_done' },
    { target: 'conditioning', action: 'increment_conditioning_hours' },
    { target: 'haptic', action: 'completion_reward' },
    { target: 'evidence', action: 'log_hypno_session' },
    { target: 'trigger', action: 'strengthen_installed_triggers' },
  ],
  sleep_hypno_completed: [
    { target: 'conditioning', action: 'increment_sleep_conditioning' },
    { target: 'evidence', action: 'log_sleep_session' },
    { target: 'notification', action: 'morning_dream_check' },
  ],

  // Identity events
  affirmation_spoken: [
    { target: 'evidence', action: 'log_affirmation' },
    { target: 'identity', action: 'increment_affirmation_count' },
    { target: 'conditioning', action: 'strengthen_identity' },
  ],
  name_used: [
    { target: 'evidence', action: 'log_name_use' },
    { target: 'identity', action: 'increment_name_use' },
  ],
  deadname_detected: [
    { target: 'affirmation', action: 'show_correction' },
    { target: 'evidence', action: 'log_deadname_use' },
    { target: 'conditioning', action: 'flag_identity_slip' },
  ],

  // Investment events
  investment_made: [
    { target: 'evidence', action: 'log_investment' },
    { target: 'points', action: 'add_points', params: { source: 'investment' } },
    { target: 'task', action: 'generate_use_tasks' },
    { target: 'haptic', action: 'investment_celebration' },
  ],
  item_purchased: [
    { target: 'evidence', action: 'log_purchase' },
    { target: 'task', action: 'add_item_to_owned' },
    { target: 'affirmation', action: 'show_purchase_affirmation' },
  ],

  // Ceremony events
  ceremony_available: [
    { target: 'notification', action: 'ceremony_available_notification' },
    { target: 'haptic', action: 'ceremony_ready_pattern' },
  ],
  ceremony_completed: [
    { target: 'evidence', action: 'log_ceremony' },
    { target: 'haptic', action: 'ceremony_complete_celebration' },
    { target: 'points', action: 'add_ceremony_points' },
    { target: 'identity', action: 'apply_irreversible_marker' },
    { target: 'notification', action: 'ceremony_complete_notification' },
  ],

  // Commitment events
  commitment_made: [
    { target: 'evidence', action: 'log_commitment' },
    { target: 'haptic', action: 'commitment_pattern' },
    { target: 'affirmation', action: 'show_commitment_affirmation' },
    { target: 'notification', action: 'schedule_commitment_reminder' },
  ],
  commitment_fulfilled: [
    { target: 'evidence', action: 'log_fulfillment' },
    { target: 'points', action: 'add_fulfillment_bonus' },
    { target: 'haptic', action: 'fulfillment_celebration' },
    { target: 'affirmation', action: 'show_fulfillment_praise' },
  ],
  commitment_broken: [
    { target: 'evidence', action: 'log_broken_commitment' },
    { target: 'points', action: 'apply_break_penalty' },
    { target: 'conditioning', action: 'flag_commitment_break' },
    { target: 'affirmation', action: 'show_break_consequence' },
  ],

  // Guy mode events
  guy_mode_entered: [
    { target: 'evidence', action: 'log_guy_mode_start' },
    { target: 'conditioning', action: 'start_guy_mode_timer' },
    { target: 'affirmation', action: 'show_costume_mode_reminder' },
  ],
  guy_mode_exited: [
    { target: 'evidence', action: 'log_guy_mode_end' },
    { target: 'conditioning', action: 'calculate_guy_mode_duration' },
    { target: 'affirmation', action: 'show_welcome_back' },
    { target: 'haptic', action: 'welcome_back_pattern' },
  ],

  // Escalation events
  escalation_triggered: [
    { target: 'evidence', action: 'log_escalation' },
    { target: 'notification', action: 'escalation_notification' },
    { target: 'haptic', action: 'escalation_pattern' },
    { target: 'conditioning', action: 'apply_escalation_effect' },
  ],
  escalation_warning: [
    { target: 'notification', action: 'escalation_warning_notification' },
    { target: 'affirmation', action: 'show_escalation_countdown' },
  ],
};

// ============================================
// TRIGGER EXECUTION
// ============================================

export async function executeSystemTriggers(
  event: SystemEvent,
  context?: Record<string, unknown>
): Promise<TriggerResult> {
  const actions = TRIGGER_MAP[event] || [];
  const results: TriggerResult = {
    executed: [],
    failed: [],
  };

  for (const action of actions) {
    try {
      await executeAction(action, context);
      results.executed.push(action);
    } catch (error) {
      results.failed.push({
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Log the trigger execution
  await logTriggerExecution(event, results);

  return results;
}

async function executeAction(
  action: SystemAction,
  context?: Record<string, unknown>
): Promise<void> {
  // This would dispatch to the appropriate subsystem
  // For now, we log the action
  console.log(`[SystemTrigger] ${action.target}.${action.action}`, {
    params: action.params,
    context,
  });

  // Here you would call the actual handlers:
  // switch (action.target) {
  //   case 'haptic': return hapticService.execute(action.action, action.params);
  //   case 'points': return pointsService.execute(action.action, action.params);
  //   case 'evidence': return evidenceService.execute(action.action, action.params);
  //   // etc.
  // }
}

async function logTriggerExecution(
  event: SystemEvent,
  result: TriggerResult
): Promise<void> {
  // Log to a trigger_executions table for debugging/analytics
  // This is optional but helpful for understanding system behavior
  console.log(`[SystemTrigger] Event: ${event}`, {
    executed: result.executed.length,
    failed: result.failed.length,
  });
}

// ============================================
// COMPOUND SESSIONS
// ============================================

export interface CompoundSession {
  name: string;
  components: {
    type: 'wear' | 'hypno' | 'edge' | 'affirmation' | 'haptic';
    config: Record<string, unknown>;
  }[];
  duration: number; // minutes
  events: SystemEvent[];
}

export const COMPOUND_SESSIONS: Record<string, CompoundSession> = {
  deep_feminization: {
    name: 'Deep Feminization',
    components: [
      { type: 'wear', config: { items: ['panties', 'cage'] } },
      { type: 'hypno', config: { file: 'bambi_identity' } },
      { type: 'edge', config: { aiControlled: true, minEdges: 5 } },
      { type: 'affirmation', config: { overlay: true } },
      { type: 'haptic', config: { syncToAudio: true } },
    ],
    duration: 45,
    events: [
      'hypno_completed',
      'edge_session_completed',
      'affirmation_spoken',
    ],
  },
  morning_conditioning: {
    name: 'Morning Conditioning',
    components: [
      { type: 'wear', config: { items: ['panties'] } },
      { type: 'hypno', config: { file: 'morning_wake' } },
      { type: 'affirmation', config: { count: 3 } },
    ],
    duration: 15,
    events: ['hypno_completed', 'affirmation_spoken'],
  },
  sleep_programming: {
    name: 'Sleep Programming',
    components: [
      { type: 'wear', config: { items: ['nightgown'] } },
      { type: 'hypno', config: { file: 'sleep_identity', overnight: true } },
    ],
    duration: 480, // 8 hours
    events: ['sleep_hypno_completed'],
  },
};

export async function startCompoundSession(
  sessionName: string
): Promise<{ sessionId: string }> {
  const session = COMPOUND_SESSIONS[sessionName];
  if (!session) throw new Error(`Unknown session: ${sessionName}`);

  // Generate session ID
  const sessionId = `session_${Date.now()}`;

  // Log session start
  console.log(`[CompoundSession] Starting: ${session.name}`, {
    sessionId,
    components: session.components.length,
    duration: session.duration,
  });

  return { sessionId };
}

export async function completeCompoundSession(
  sessionId: string,
  sessionName: string
): Promise<TriggerResult[]> {
  const session = COMPOUND_SESSIONS[sessionName];
  if (!session) throw new Error(`Unknown session: ${sessionName}`);

  const results: TriggerResult[] = [];

  // Execute all events for this session
  for (const event of session.events) {
    const result = await executeSystemTriggers(event, { sessionId });
    results.push(result);
  }

  return results;
}

// ============================================
// DAILY TRIGGER CHECK
// ============================================

export interface DailyTriggerContext {
  day: number;
  streak: number;
  phase: number;
  denialDay: number;
  arousalState?: ArousalState;
  events?: string[];
}

export interface DailyTriggerResult {
  escalationsTriggered: number;
  escalationIds: string[];
  ceremoniesAvailable: number;
  ceremonyIds: string[];
  commitmentsAvailable: number;
  commitmentIds: string[];
  warnings: string[];
}

/**
 * Run daily trigger checks to:
 * - Trigger scheduled escalations
 * - Mark ceremonies as available
 * - Check for available commitments
 * - Send warnings for imminent escalations
 */
export async function runDailyTriggerChecks(
  context: DailyTriggerContext
): Promise<DailyTriggerResult> {
  const result: DailyTriggerResult = {
    escalationsTriggered: 0,
    escalationIds: [],
    ceremoniesAvailable: 0,
    ceremonyIds: [],
    commitmentsAvailable: 0,
    commitmentIds: [],
    warnings: [],
  };

  try {
    // 1. Check and trigger escalations (takes current day number)
    const triggeredEscalations = await checkAndTriggerEscalations(context.day);
    result.escalationsTriggered = triggeredEscalations.length;
    result.escalationIds = triggeredEscalations.map(e => e.id);

    // Fire events for each triggered escalation
    for (const escalation of triggeredEscalations) {
      await executeSystemTriggers('escalation_triggered', {
        escalationId: escalation.id,
        escalationType: escalation.escalationType,
        description: escalation.description,
      });
    }

    // 2. Check for imminent escalations (warnings)
    const imminentEscalations = await getImminentEscalations(context.day);
    for (const item of imminentEscalations) {
      result.warnings.push(
        `Escalation "${item.escalation.description}" in ${item.daysUntil} day(s)`
      );

      // Fire warning event if within 1 day
      if (item.daysUntil <= 1) {
        await executeSystemTriggers('escalation_warning', {
          escalationId: item.escalation.id,
          daysUntil: item.daysUntil,
        });
      }
    }

    // 3. Check ceremony availability
    const ceremonyContext = {
      day: context.day,
      streak: context.streak,
      phase: context.phase,
      events: context.events || [],
    };

    const availableCeremonies = await checkCeremonyAvailability(ceremonyContext);
    result.ceremoniesAvailable = availableCeremonies.length;
    result.ceremonyIds = availableCeremonies.map(c => c.id);

    // Fire events for newly available ceremonies
    for (const ceremony of availableCeremonies) {
      await executeSystemTriggers('ceremony_available', {
        ceremonyId: ceremony.id,
        ceremonyName: ceremony.name,
      });
    }

    // 4. Check available commitments
    // Map arousal state to commitments-compatible state (shared values)
    const commitmentArousalState: CommitmentsArousalState =
      (context.arousalState === 'baseline' ||
       context.arousalState === 'building' ||
       context.arousalState === 'sweet_spot')
        ? context.arousalState
        : 'baseline';

    const availableCommitments = await getAvailableCommitments({
      arousalState: commitmentArousalState,
      denialDay: context.denialDay,
      phase: context.phase,
    });
    result.commitmentsAvailable = availableCommitments.length;
    result.commitmentIds = availableCommitments.map(c => c.id);

  } catch (error) {
    console.error('[DailyTriggerCheck] Error:', error);
    result.warnings.push(
      `Error during daily checks: ${error instanceof Error ? error.message : 'Unknown'}`
    );
  }

  return result;
}
