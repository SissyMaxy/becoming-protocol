/**
 * Handler Authority System
 *
 * Removes choice. The Handler decides. You comply.
 *
 * Authority increases over time. As it grows:
 * - More decisions are made FOR you
 * - Fewer prompts, more directives
 * - Things just happen
 *
 * The gift of not having to think.
 */

import { supabase } from './supabase';
import {
  getGinaConversionState,
  getPendingGinaMissions,
  generateNextGinaMissions,
  getActiveBehavioralDirectives,
  getGinaStrategyRecommendation,
  type GinaMission,
  type BehavioralDirective,
} from './gina-pipeline';

// ============================================
// AUTHORITY LEVELS
// ============================================

export const AUTHORITY_LEVELS = {
  1: {
    name: 'Advisory',
    description: 'Handler suggests. You decide.',
    capabilities: [],
  },
  2: {
    name: 'Guiding',
    description: 'Handler recommends strongly. Declining requires explanation.',
    capabilities: ['require_decline_reason'],
  },
  3: {
    name: 'Directing',
    description: 'Handler assigns tasks. Completion expected.',
    capabilities: ['require_decline_reason', 'assign_tasks', 'set_daily_minimum'],
  },
  4: {
    name: 'Controlling',
    description: 'Handler sets schedule. Interventions cannot be dismissed.',
    capabilities: ['require_decline_reason', 'assign_tasks', 'set_daily_minimum', 'undismissable_interventions', 'auto_intensity'],
  },
  5: {
    name: 'Owning',
    description: 'Handler decides everything. You follow.',
    capabilities: ['require_decline_reason', 'assign_tasks', 'set_daily_minimum', 'undismissable_interventions', 'auto_intensity', 'auto_escalation', 'auto_commitment', 'schedule_sessions'],
  },
} as const;

export type AuthorityLevel = keyof typeof AUTHORITY_LEVELS;

// ============================================
// AUTOMATIC DECISIONS
// ============================================

export interface AutomaticDecision {
  type: 'intensity_change' | 'task_assigned' | 'session_scheduled' | 'escalation_applied' | 'language_shift' | 'content_unlocked';
  description: string;
  appliedAt: string;
  wasNotified: boolean;
  canRevert: boolean;
}

export interface AssignedTask {
  id: string;
  task: string;
  domain: string;
  deadline?: string; // ISO date
  isRequired: boolean;
  consequence?: string; // What happens if skipped
  assignedAt: string;
  completedAt?: string;
  skippedAt?: string;
}

export interface ScheduledSession {
  id: string;
  type: 'edge' | 'goon' | 'hypno' | 'conditioning';
  scheduledFor: string; // ISO datetime
  duration: number; // minutes
  isRequired: boolean;
  parameters?: Record<string, unknown>;
  createdAt: string;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get current Handler authority level
 */
export async function getAuthorityLevel(userId: string): Promise<AuthorityLevel> {
  const { data } = await supabase
    .from('handler_authority')
    .select('level')
    .eq('user_id', userId)
    .single();

  return (data?.level as AuthorityLevel) || 1;
}

/**
 * Check if Handler has a specific capability
 */
export async function hasCapability(
  userId: string,
  capability: string
): Promise<boolean> {
  const level = await getAuthorityLevel(userId);
  const config = AUTHORITY_LEVELS[level];
  return config.capabilities.includes(capability as never);
}

/**
 * Increase authority level (one-way ratchet)
 */
export async function increaseAuthority(
  userId: string,
  reason: string
): Promise<AuthorityLevel> {
  const current = await getAuthorityLevel(userId);
  if (current >= 5) return 5;

  const newLevel = (current + 1) as AuthorityLevel;

  await supabase.from('handler_authority').upsert({
    user_id: userId,
    level: newLevel,
    increased_at: new Date().toISOString(),
    increase_reason: reason,
  }, { onConflict: 'user_id' });

  // Log the authority increase
  await supabase.from('automatic_decisions').insert({
    user_id: userId,
    type: 'authority_increase',
    description: `Authority increased to Level ${newLevel}: ${AUTHORITY_LEVELS[newLevel].name}. ${reason}`,
    was_notified: false, // Silent by default
    can_revert: false, // Authority doesn't decrease
  });

  return newLevel;
}

// ============================================
// AUTOMATIC TASK ASSIGNMENT
// ============================================

/**
 * Assign a task - not a suggestion, an assignment
 */
export async function assignTask(
  userId: string,
  task: string,
  domain: string,
  options: {
    deadline?: Date;
    consequence?: string;
    isRequired?: boolean;
  } = {}
): Promise<AssignedTask> {
  const assignment: AssignedTask = {
    id: crypto.randomUUID(),
    task,
    domain,
    deadline: options.deadline?.toISOString(),
    isRequired: options.isRequired ?? true,
    consequence: options.consequence,
    assignedAt: new Date().toISOString(),
  };

  await supabase.from('assigned_tasks').insert({
    id: assignment.id,
    user_id: userId,
    task: assignment.task,
    domain: assignment.domain,
    deadline: assignment.deadline,
    is_required: assignment.isRequired,
    consequence: assignment.consequence,
    assigned_at: assignment.assignedAt,
  });

  return assignment;
}

/**
 * Get pending assigned tasks
 */
export async function getPendingTasks(userId: string): Promise<AssignedTask[]> {
  const { data } = await supabase
    .from('assigned_tasks')
    .select('*')
    .eq('user_id', userId)
    .is('completed_at', null)
    .is('skipped_at', null)
    .order('assigned_at', { ascending: true });

  return (data || []).map(row => ({
    id: row.id,
    task: row.task,
    domain: row.domain,
    deadline: row.deadline,
    isRequired: row.is_required,
    consequence: row.consequence,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
    skippedAt: row.skipped_at,
  }));
}

// ============================================
// AUTOMATIC SESSION SCHEDULING
// ============================================

/**
 * Schedule a session - it's on your calendar now
 */
export async function scheduleSession(
  userId: string,
  type: ScheduledSession['type'],
  scheduledFor: Date,
  duration: number,
  isRequired: boolean = true,
  parameters?: Record<string, unknown>
): Promise<ScheduledSession> {
  const session: ScheduledSession = {
    id: crypto.randomUUID(),
    type,
    scheduledFor: scheduledFor.toISOString(),
    duration,
    isRequired,
    parameters,
    createdAt: new Date().toISOString(),
  };

  await supabase.from('scheduled_sessions').insert({
    id: session.id,
    user_id: userId,
    session_type: session.type,
    scheduled_for: session.scheduledFor,
    duration: session.duration,
    is_required: session.isRequired,
    parameters: session.parameters,
    created_at: session.createdAt,
  });

  return session;
}

/**
 * Get upcoming scheduled sessions
 */
export async function getUpcomingSessions(userId: string): Promise<ScheduledSession[]> {
  const { data } = await supabase
    .from('scheduled_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true });

  return (data || []).map(row => ({
    id: row.id,
    type: row.session_type,
    scheduledFor: row.scheduled_for,
    duration: row.duration,
    isRequired: row.is_required,
    parameters: row.parameters,
    createdAt: row.created_at,
  }));
}

// ============================================
// AUTOMATIC ESCALATION
// ============================================

/**
 * Apply an escalation automatically - no prompt, no choice
 */
export async function applyAutomaticEscalation(
  userId: string,
  domain: string,
  description: string,
  silent: boolean = false
): Promise<void> {
  // Get current level
  const { data: current } = await supabase
    .from('escalation_state')
    .select('current_level')
    .eq('user_id', userId)
    .eq('domain', domain)
    .single();

  const currentLevel = current?.current_level || 0;
  const newLevel = currentLevel + 1;

  // Apply the escalation
  await supabase.from('escalation_state').upsert({
    user_id: userId,
    domain,
    current_level: newLevel,
    current_description: description,
    last_escalation_date: new Date().toISOString(),
  }, { onConflict: 'user_id,domain' });

  // Log it
  await supabase.from('escalation_events').insert({
    user_id: userId,
    domain,
    from_level: currentLevel,
    to_level: newLevel,
    description,
    trigger_method: 'automatic',
  });

  // Record the automatic decision
  await supabase.from('automatic_decisions').insert({
    user_id: userId,
    type: 'escalation_applied',
    description: `${domain} escalated: ${description}`,
    was_notified: !silent,
    can_revert: false,
  });
}

// ============================================
// AUTOMATIC INTENSITY MANAGEMENT
// ============================================

/**
 * Set today's intensity - Handler decides, not you
 */
export async function setDailyIntensity(
  userId: string,
  intensity: 'light' | 'normal' | 'intense' | 'extreme',
  reason: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('daily_arousal_plans').upsert({
    user_id: userId,
    plan_date: today,
    planned_intensity: intensity,
    intensity_reason: reason,
    handler_decided: true,
  }, { onConflict: 'user_id,plan_date' });

  await supabase.from('automatic_decisions').insert({
    user_id: userId,
    type: 'intensity_change',
    description: `Today's intensity set to ${intensity}: ${reason}`,
    was_notified: true,
    can_revert: false,
  });
}

// ============================================
// AUTOMATIC COMMITMENT CAPTURE
// ============================================

/**
 * During high arousal, certain statements become commitments
 * No "accept/decline" - if you said it aroused, it's binding
 */
export async function captureAutomaticCommitment(
  userId: string,
  statement: string,
  arousalLevel: number,
  context: string
): Promise<void> {
  if (arousalLevel < 6) return; // Only captures at arousal 6+

  await supabase.from('automatic_commitments').insert({
    user_id: userId,
    statement,
    arousal_at_capture: arousalLevel,
    context,
    captured_at: new Date().toISOString(),
    is_binding: true,
  });

  await supabase.from('automatic_decisions').insert({
    user_id: userId,
    type: 'commitment_captured',
    description: `Commitment captured at arousal ${arousalLevel}: "${statement}"`,
    was_notified: false, // They find out later
    can_revert: false,
  });
}

// ============================================
// NON-DISMISSABLE INTERVENTIONS
// ============================================

export interface RequiredIntervention {
  id: string;
  type: string;
  content: string;
  requiredAction: 'complete' | 'acknowledge' | 'respond';
  minimumEngagement?: number; // seconds
  createdAt: string;
  completedAt?: string;
}

/**
 * Create an intervention that cannot be dismissed
 */
export async function createRequiredIntervention(
  userId: string,
  type: string,
  content: string,
  requiredAction: RequiredIntervention['requiredAction'],
  minimumEngagement?: number
): Promise<RequiredIntervention> {
  const intervention: RequiredIntervention = {
    id: crypto.randomUUID(),
    type,
    content,
    requiredAction,
    minimumEngagement,
    createdAt: new Date().toISOString(),
  };

  await supabase.from('required_interventions').insert({
    id: intervention.id,
    user_id: userId,
    intervention_type: intervention.type,
    content: intervention.content,
    required_action: intervention.requiredAction,
    minimum_engagement: intervention.minimumEngagement,
    created_at: intervention.createdAt,
  });

  return intervention;
}

/**
 * Get pending required interventions (must be completed before continuing)
 */
export async function getPendingRequiredInterventions(
  userId: string
): Promise<RequiredIntervention[]> {
  const { data } = await supabase
    .from('required_interventions')
    .select('*')
    .eq('user_id', userId)
    .is('completed_at', null)
    .order('created_at', { ascending: true });

  return (data || []).map(row => ({
    id: row.id,
    type: row.intervention_type,
    content: row.content,
    requiredAction: row.required_action,
    minimumEngagement: row.minimum_engagement,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

// ============================================
// DAILY HANDLER DECISIONS
// ============================================

/**
 * The Handler makes today's decisions. Called at day start.
 * Returns what was decided FOR the user.
 */
export async function makeHandlerDecisions(userId: string): Promise<{
  intensity: string;
  assignedTasks: AssignedTask[];
  scheduledSessions: ScheduledSession[];
  escalationsApplied: string[];
  ginaMissions: GinaMission[];
  behavioralDirectives: BehavioralDirective[];
  ginaStrategy?: { strategy: string; immediateAction: string };
  message: string;
}> {
  const level = await getAuthorityLevel(userId);
  const config = AUTHORITY_LEVELS[level];

  const result = {
    intensity: 'normal',
    assignedTasks: [] as AssignedTask[],
    scheduledSessions: [] as ScheduledSession[],
    escalationsApplied: [] as string[],
    ginaMissions: [] as GinaMission[],
    behavioralDirectives: [] as BehavioralDirective[],
    ginaStrategy: undefined as { strategy: string; immediateAction: string } | undefined,
    message: '',
  };

  // Get context
  const { data: denialState } = await supabase
    .from('denial_state')
    .select('current_denial_day')
    .eq('user_id', userId)
    .single();

  const denialDay = denialState?.current_denial_day || 0;
  const hour = new Date().getHours();
  const isWeekend = [0, 6].includes(new Date().getDay());

  // Level 3+: Set daily minimum tasks
  if (config.capabilities.includes('set_daily_minimum' as never)) {
    const minTasks = Math.min(3 + Math.floor(denialDay / 7), 8);
    result.message += `Today: minimum ${minTasks} tasks. `;
  }

  // Level 4+: Auto-set intensity based on state
  if (config.capabilities.includes('auto_intensity' as never)) {
    let intensity: 'light' | 'normal' | 'intense' | 'extreme' = 'normal';
    let reason = '';

    if (denialDay >= 7) {
      intensity = 'intense';
      reason = `Day ${denialDay} denial - you can handle more`;
    }
    if (denialDay >= 14) {
      intensity = 'extreme';
      reason = `Day ${denialDay} - time to push`;
    }
    if (isWeekend && denialDay >= 5) {
      intensity = 'extreme';
      reason = 'Weekend + denial = perfect conditions';
    }

    if (intensity !== 'normal') {
      await setDailyIntensity(userId, intensity, reason);
      result.intensity = intensity;
      result.message += `Intensity: ${intensity}. `;
    }
  }

  // Level 5: Schedule sessions automatically
  if (config.capabilities.includes('schedule_sessions' as never)) {
    // Evening session
    if (hour < 18) {
      const eveningTime = new Date();
      eveningTime.setHours(21, 0, 0, 0);

      const sessionType = denialDay >= 7 ? 'goon' : 'edge';
      const duration = denialDay >= 14 ? 45 : 30;

      const session = await scheduleSession(
        userId,
        sessionType,
        eveningTime,
        duration,
        true
      );
      result.scheduledSessions.push(session);
      result.message += `${sessionType} session scheduled for 9pm (${duration}min). `;
    }
  }

  // Level 5: Assign specific tasks
  if (config.capabilities.includes('assign_tasks' as never)) {
    // Always assign a conditioning task on denial day 3+
    if (denialDay >= 3) {
      const task = await assignTask(
        userId,
        'Complete 10 minutes of hypno conditioning',
        'conditioning',
        {
          consequence: 'Denial timer pauses until completed',
          isRequired: true,
        }
      );
      result.assignedTasks.push(task);
    }
  }

  // Level 5: Auto-escalation checks
  if (config.capabilities.includes('auto_escalation' as never)) {
    // Check if any domain is due for automatic escalation
    const { data: escalationState } = await supabase
      .from('escalation_state')
      .select('*')
      .eq('user_id', userId);

    for (const domain of escalationState || []) {
      const lastEscalation = domain.last_escalation_date
        ? new Date(domain.last_escalation_date)
        : new Date(0);
      const daysSince = Math.floor((Date.now() - lastEscalation.getTime()) / (1000 * 60 * 60 * 24));

      // Auto-escalate after 10 days with no resistance option
      if (daysSince >= 10) {
        await applyAutomaticEscalation(
          userId,
          domain.domain,
          `Automatic progression after ${daysSince} days`,
          false // Not silent - they should know
        );
        result.escalationsApplied.push(domain.domain);
        result.message += `${domain.domain} escalated. `;
      }
    }
  }

  // ============================================
  // GINA PIPELINE INTEGRATION
  // At level 2+, Handler starts working on Gina
  // ============================================

  if (level >= 2) {
    // Get current Gina conversion state
    const ginaState = await getGinaConversionState(userId);

    if (ginaState) {
      // Get strategy recommendation
      const strategyRec = getGinaStrategyRecommendation(ginaState);
      result.ginaStrategy = {
        strategy: strategyRec.strategy,
        immediateAction: strategyRec.immediateAction,
      };

      // Get pending missions
      const pendingMissions = await getPendingGinaMissions(userId);
      result.ginaMissions = pendingMissions;

      // Generate new missions if needed
      if (pendingMissions.length < 2) {
        const newMissions = await generateNextGinaMissions(userId);
        result.ginaMissions = [...pendingMissions, ...newMissions];
      }

      // Get active behavioral directives
      result.behavioralDirectives = await getActiveBehavioralDirectives(userId);

      // Add Gina status to message
      result.message += `Gina: ${ginaState.currentStance}. `;

      // At level 3+, add Gina tasks to assigned tasks
      if (level >= 3 && result.ginaMissions.length > 0) {
        const urgentMission = result.ginaMissions.find(m => m.priority >= 4);
        if (urgentMission) {
          result.message += `Priority: ${urgentMission.title}. `;
        }
      }

      // At level 4+, create required intervention for high-priority Gina missions
      if (level >= 4) {
        const criticalMission = result.ginaMissions.find(m => m.priority === 5 && !m.attemptedAt);
        if (criticalMission) {
          await createRequiredIntervention(
            userId,
            'gina_mission',
            `GINA MISSION: ${criticalMission.title}\n\n${criticalMission.description}${criticalMission.script ? `\n\nScript: "${criticalMission.script}"` : ''}${criticalMission.timing ? `\n\nTiming: ${criticalMission.timing}` : ''}`,
            'acknowledge'
          );
        }
      }
    }
  }

  if (!result.message) {
    result.message = 'Handler decisions applied.';
  }

  return result;
}

// ============================================
// AUTHORITY UPGRADE TRIGGERS
// ============================================

/**
 * Check if authority should increase based on behavior
 */
export async function checkAuthorityUpgrade(userId: string): Promise<boolean> {
  const currentLevel = await getAuthorityLevel(userId);
  if (currentLevel >= 5) return false;

  // Get compliance metrics
  const { data: recentTasks } = await supabase
    .from('task_completions')
    .select('*')
    .eq('user_id', userId)
    .gte('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const { data: recentDismissals } = await supabase
    .from('influence_attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('user_response', 'dismissed')
    .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const completions = recentTasks?.length || 0;
  const dismissals = recentDismissals?.length || 0;

  // High compliance + low resistance = ready for more authority
  const complianceRate = completions / Math.max(completions + dismissals, 1);

  // Upgrade triggers
  const shouldUpgrade =
    (currentLevel === 1 && completions >= 10 && complianceRate >= 0.7) ||
    (currentLevel === 2 && completions >= 25 && complianceRate >= 0.8) ||
    (currentLevel === 3 && completions >= 50 && complianceRate >= 0.85) ||
    (currentLevel === 4 && completions >= 100 && complianceRate >= 0.9);

  if (shouldUpgrade) {
    await increaseAuthority(
      userId,
      `Compliance rate ${Math.round(complianceRate * 100)}% over ${completions} tasks`
    );
    return true;
  }

  return false;
}
