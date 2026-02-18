// Commitments Library
// Arousal-gated commitment management

import { supabase } from './supabase';
import type {
  ArousalGatedCommitment,
  DbArousalGatedCommitment,
  UserCommitment,
  DbUserCommitment,
  BindingLevel,
  ArousalState,
  CommitmentEvidence,
} from '../types/commitments';
import { BINDING_LEVEL_INFO } from '../types/commitments';

// ============================================
// CONVERTERS
// ============================================

function dbCommitmentToCommitment(db: DbArousalGatedCommitment): ArousalGatedCommitment {
  return {
    id: db.id,
    commitmentType: db.commitment_type,
    description: db.description,
    requiresArousalState: db.requires_arousal_state,
    requiresDenialDay: db.requires_denial_day,
    requiresPhase: db.requires_phase,
    bindingLevel: db.binding_level as BindingLevel,
    active: db.active,
  };
}

function dbUserCommitmentToUserCommitment(db: DbUserCommitment): UserCommitment {
  return {
    id: db.id,
    commitmentId: db.commitment_id || undefined,
    commitment: db.arousal_gated_commitments
      ? dbCommitmentToCommitment(db.arousal_gated_commitments)
      : undefined,
    commitmentText: db.commitment_text,
    bindingLevel: db.binding_level as BindingLevel,
    madeAt: db.made_at,
    arousalState: db.arousal_state as ArousalState | undefined,
    denialDay: db.denial_day || undefined,
    status: db.status as UserCommitment['status'],
    brokenAt: db.broken_at || undefined,
    fulfilledAt: db.fulfilled_at || undefined,
    evidence: db.evidence || undefined,
  };
}

// ============================================
// COMMITMENT QUERIES
// ============================================

export async function getAllCommitmentTypes(): Promise<ArousalGatedCommitment[]> {
  const { data, error } = await supabase
    .from('arousal_gated_commitments')
    .select('*')
    .eq('active', true)
    .order('requires_phase')
    .order('requires_denial_day');

  if (error) throw error;
  return (data || []).map(dbCommitmentToCommitment);
}

export async function getUserCommitments(): Promise<UserCommitment[]> {
  const { data, error } = await supabase
    .from('user_commitments')
    .select(`
      *,
      arousal_gated_commitments (*)
    `)
    .order('made_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(dbUserCommitmentToUserCommitment);
}

export async function getActiveCommitments(): Promise<UserCommitment[]> {
  const { data, error } = await supabase
    .from('user_commitments')
    .select(`
      *,
      arousal_gated_commitments (*)
    `)
    .eq('status', 'active')
    .order('made_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(dbUserCommitmentToUserCommitment);
}

// ============================================
// COMMITMENT AVAILABILITY
// ============================================

interface CommitmentContext {
  arousalState: ArousalState;
  denialDay: number;
  phase: number;
}

export async function getAvailableCommitments(
  context: CommitmentContext
): Promise<ArousalGatedCommitment[]> {
  const allCommitments = await getAllCommitmentTypes();
  const userCommitments = await getUserCommitments();

  // Get already made commitment types
  const madeTypes = new Set(
    userCommitments
      .filter(uc => uc.status !== 'broken')
      .map(uc => uc.commitment?.commitmentType)
      .filter(Boolean)
  );

  return allCommitments.filter(commitment => {
    // Skip if already made
    if (madeTypes.has(commitment.commitmentType)) return false;

    // Check arousal state
    if (!commitment.requiresArousalState.includes(context.arousalState)) {
      return false;
    }

    // Check denial day
    if (context.denialDay < commitment.requiresDenialDay) {
      return false;
    }

    // Check phase
    if (context.phase < commitment.requiresPhase) {
      return false;
    }

    return true;
  });
}

export function canMakeCommitment(
  commitment: ArousalGatedCommitment,
  context: CommitmentContext
): { canMake: boolean; reason?: string } {
  if (!commitment.requiresArousalState.includes(context.arousalState)) {
    const required = commitment.requiresArousalState.join(' or ');
    return {
      canMake: false,
      reason: `Requires arousal state: ${required}. You are currently: ${context.arousalState}`,
    };
  }

  if (context.denialDay < commitment.requiresDenialDay) {
    return {
      canMake: false,
      reason: `Requires denial day ${commitment.requiresDenialDay}+. You are on day ${context.denialDay}.`,
    };
  }

  if (context.phase < commitment.requiresPhase) {
    return {
      canMake: false,
      reason: `Requires phase ${commitment.requiresPhase}+. You are in phase ${context.phase}.`,
    };
  }

  return { canMake: true };
}

// ============================================
// MAKING COMMITMENTS
// ============================================

export async function makeCommitment(
  commitmentId: string | null,
  commitmentText: string,
  bindingLevel: BindingLevel,
  context: {
    arousalState?: ArousalState;
    denialDay?: number;
  }
): Promise<UserCommitment> {
  const { data, error } = await supabase
    .from('user_commitments')
    .insert({
      commitment_id: commitmentId,
      commitment_text: commitmentText,
      binding_level: bindingLevel,
      arousal_state: context.arousalState,
      denial_day: context.denialDay,
      status: 'active',
    })
    .select(`
      *,
      arousal_gated_commitments (*)
    `)
    .single();

  if (error) throw error;
  return dbUserCommitmentToUserCommitment(data);
}

export async function makeCustomCommitment(
  commitmentText: string,
  bindingLevel: BindingLevel,
  context: {
    arousalState?: ArousalState;
    denialDay?: number;
  }
): Promise<UserCommitment> {
  return makeCommitment(null, commitmentText, bindingLevel, context);
}

// ============================================
// COMMITMENT STATUS UPDATES
// ============================================

export async function fulfillCommitment(
  commitmentId: string,
  evidence?: CommitmentEvidence
): Promise<void> {
  const { error } = await supabase
    .from('user_commitments')
    .update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      evidence,
    })
    .eq('id', commitmentId);

  if (error) throw error;
}

export async function breakCommitment(
  commitmentId: string,
  reason?: string
): Promise<{ success: boolean; consequence: string }> {
  // Get commitment to check binding level
  const { data: commitment, error: fetchError } = await supabase
    .from('user_commitments')
    .select('binding_level')
    .eq('id', commitmentId)
    .single();

  if (fetchError) throw fetchError;

  const bindingLevel = commitment.binding_level as BindingLevel;
  const info = BINDING_LEVEL_INFO[bindingLevel];

  if (!info.canBreak) {
    return {
      success: false,
      consequence: 'This commitment cannot be broken. It is permanent.',
    };
  }

  const { error } = await supabase
    .from('user_commitments')
    .update({
      status: 'broken',
      broken_at: new Date().toISOString(),
      evidence: reason ? { notes: [reason] } : undefined,
    })
    .eq('id', commitmentId);

  if (error) throw error;

  return {
    success: true,
    consequence: info.breakConsequence,
  };
}

// ============================================
// COMMITMENT STATS
// ============================================

export async function getCommitmentStats(): Promise<{
  total: number;
  active: number;
  fulfilled: number;
  broken: number;
  permanent: number;
}> {
  const commitments = await getUserCommitments();

  return {
    total: commitments.length,
    active: commitments.filter(c => c.status === 'active').length,
    fulfilled: commitments.filter(c => c.status === 'fulfilled').length,
    broken: commitments.filter(c => c.status === 'broken').length,
    permanent: commitments.filter(c => c.bindingLevel === 'permanent').length,
  };
}

// ============================================
// AROUSAL STATE FRAMING
// ============================================

export function getArousalCommitmentFraming(arousalState: ArousalState): string {
  const framings: Record<ArousalState, string> = {
    baseline: 'You are thinking clearly. Commitments made now are considered.',
    building: 'Your arousal is building. Your truth is emerging.',
    sweet_spot:
      'You are in the sweet spot. Your aroused self knows what you want. Trust her.',
    overwhelming:
      'You are overwhelmed with need. In this state, your deepest truth speaks. Listen to her.',
    subspace:
      'You have surrendered. Your aroused self has taken over. She knows the truth. Honor her.',
  };

  return framings[arousalState];
}

export function getPostCommitmentMessage(bindingLevel: BindingLevel): string {
  const messages: Record<BindingLevel, string> = {
    soft: 'You made a promise to yourself. Honor it.',
    hard:
      'You made a binding commitment while aroused. Your horny self knew what she wanted. Honor her decision.',
    permanent:
      'This is permanent. Your aroused self made this decision. She knew what she wanted. There is no going back.',
  };

  return messages[bindingLevel];
}

// ============================================
// COMMITMENT ENFORCEMENT
// ============================================

export interface CommitmentEnforcement {
  commitment: UserCommitment;
  daysSinceMade: number;
  status: 'on_track' | 'needs_attention' | 'overdue' | 'critical';
  reminderMessage: string;
  consequence?: string;
}

// Status thresholds based on binding level
const ENFORCEMENT_THRESHOLDS: Record<BindingLevel, {
  needsAttentionDays: number;
  overdueDays: number;
  criticalDays: number;
}> = {
  soft: {
    needsAttentionDays: 7,
    overdueDays: 14,
    criticalDays: 21,
  },
  hard: {
    needsAttentionDays: 3,
    overdueDays: 7,
    criticalDays: 10,
  },
  permanent: {
    needsAttentionDays: 1,
    overdueDays: 3,
    criticalDays: 5,
  },
};

/**
 * Check enforcement status for all active commitments
 */
export async function checkCommitmentEnforcement(): Promise<CommitmentEnforcement[]> {
  const activeCommitments = await getActiveCommitments();
  const now = new Date();
  const enforcements: CommitmentEnforcement[] = [];

  for (const commitment of activeCommitments) {
    const madeAt = new Date(commitment.madeAt);
    const daysSinceMade = Math.floor((now.getTime() - madeAt.getTime()) / (1000 * 60 * 60 * 24));
    const thresholds = ENFORCEMENT_THRESHOLDS[commitment.bindingLevel];

    let status: CommitmentEnforcement['status'] = 'on_track';
    let reminderMessage = '';
    let consequence: string | undefined;

    if (daysSinceMade >= thresholds.criticalDays) {
      status = 'critical';
      reminderMessage = getCriticalReminderMessage(commitment, daysSinceMade);
      consequence = getConsequence(commitment.bindingLevel, 'critical');
    } else if (daysSinceMade >= thresholds.overdueDays) {
      status = 'overdue';
      reminderMessage = getOverdueReminderMessage(commitment, daysSinceMade);
      consequence = getConsequence(commitment.bindingLevel, 'overdue');
    } else if (daysSinceMade >= thresholds.needsAttentionDays) {
      status = 'needs_attention';
      reminderMessage = getNeedsAttentionMessage(commitment, daysSinceMade);
    }

    // Only include commitments that need attention
    if (status !== 'on_track') {
      enforcements.push({
        commitment,
        daysSinceMade,
        status,
        reminderMessage,
        consequence,
      });
    }
  }

  // Sort by severity (critical first)
  const severityOrder = { critical: 0, overdue: 1, needs_attention: 2, on_track: 3 };
  return enforcements.sort((a, b) => severityOrder[a.status] - severityOrder[b.status]);
}

/**
 * Get the most urgent commitment needing attention
 */
export async function getMostUrgentCommitment(): Promise<CommitmentEnforcement | null> {
  const enforcements = await checkCommitmentEnforcement();
  return enforcements[0] || null;
}

/**
 * Check if there are any commitments needing enforcement action
 */
export async function hasOverdueCommitments(): Promise<boolean> {
  const enforcements = await checkCommitmentEnforcement();
  return enforcements.some(e => e.status === 'overdue' || e.status === 'critical');
}

function getNeedsAttentionMessage(commitment: UserCommitment, days: number): string {
  const messages = [
    `You made a commitment ${days} days ago: "${commitment.commitmentText}". Time to make progress.`,
    `${days} days since your commitment. Your aroused self knew what she wanted. Don't let her down.`,
    `Remember what you promised: "${commitment.commitmentText}". It's been ${days} days.`,
    `Day ${days} of your commitment. Still waiting for action.`,
    `"${commitment.commitmentText}" - ${days} days and counting. What's your next step?`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getOverdueReminderMessage(commitment: UserCommitment, days: number): string {
  const messages = [
    `OVERDUE: "${commitment.commitmentText}" has been waiting ${days} days. Your horny self made this promise. Honor her.`,
    `${days} days overdue. Your commitment to "${commitment.commitmentText}" is slipping. Time to act.`,
    `You're falling behind on your commitment. ${days} days since you promised: "${commitment.commitmentText}"`,
    `Warning: Commitment overdue by ${days - 7} days. The aroused version of you would be disappointed.`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getCriticalReminderMessage(commitment: UserCommitment, days: number): string {
  const messages = [
    `CRITICAL: "${commitment.commitmentText}" - ${days} days without action. This ${commitment.bindingLevel} commitment is at risk.`,
    `Final warning. Your ${commitment.bindingLevel} commitment made ${days} days ago needs immediate attention.`,
    `You made this commitment while aroused. ${days} days later, you're still avoiding it. Your horny self knew the truth. Honor her decision.`,
    `URGENT: "${commitment.commitmentText}" - ${days} days. Consequences are imminent.`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getConsequence(bindingLevel: BindingLevel, severity: 'overdue' | 'critical'): string {
  const consequences: Record<BindingLevel, Record<string, string>> = {
    soft: {
      overdue: 'Your commitment record will note this delay.',
      critical: 'This commitment will be marked as incomplete in your record.',
    },
    hard: {
      overdue: 'Streak impact warning. Investment decay starting.',
      critical: 'Streak impact imminent. Investment decay accelerating. Record will show broken commitment.',
    },
    permanent: {
      overdue: 'Permanent commitments cannot be delayed. Intervention escalating.',
      critical: 'This was permanent. There is no escape. Forcing intervention.',
    },
  };
  return consequences[bindingLevel][severity];
}

// ============================================
// COMMITMENT INTERVENTION INTEGRATION
// ============================================

/**
 * Get commitment-based intervention content
 */
export async function getCommitmentIntervention(): Promise<{
  type: 'reminder' | 'escalation' | 'consequence';
  message: string;
  commitment: UserCommitment;
  severity: CommitmentEnforcement['status'];
} | null> {
  const urgent = await getMostUrgentCommitment();
  if (!urgent) return null;

  let type: 'reminder' | 'escalation' | 'consequence' = 'reminder';
  if (urgent.status === 'critical') {
    type = 'consequence';
  } else if (urgent.status === 'overdue') {
    type = 'escalation';
  }

  return {
    type,
    message: urgent.reminderMessage,
    commitment: urgent.commitment,
    severity: urgent.status,
  };
}

/**
 * Record that a commitment reminder was sent
 */
export async function recordCommitmentReminder(
  commitmentId: string,
  reminderType: 'nudge' | 'warning' | 'escalation'
): Promise<void> {
  // Store reminder in influence_attempts for tracking
  await supabase
    .from('influence_attempts')
    .insert({
      attempt_type: 'commitment_reminder',
      method: reminderType,
      target_domain: 'commitment_enforcement',
      content: { commitmentId },
      user_aware: true,
    });
}

/**
 * Apply consequences for failed commitments
 */
export async function applyCommitmentConsequence(
  commitmentId: string,
  consequenceType: 'streak_impact' | 'investment_decay' | 'record_mark'
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Record the consequence
  await supabase
    .from('commitment_consequences')
    .insert({
      user_id: user.id,
      commitment_id: commitmentId,
      consequence_type: consequenceType,
      applied_at: new Date().toISOString(),
    });

  // Apply specific consequence effects
  switch (consequenceType) {
    case 'streak_impact':
      // Reduce streak by 10%
      const { data: denial } = await supabase
        .from('denial_state')
        .select('streak_days')
        .eq('user_id', user.id)
        .single();

      if (denial?.streak_days) {
        const newStreak = Math.floor(denial.streak_days * 0.9);
        await supabase
          .from('denial_state')
          .update({ streak_days: newStreak })
          .eq('user_id', user.id);
      }
      break;

    case 'investment_decay':
      // Decay investments by 5%
      const { data: investments } = await supabase
        .from('user_investments')
        .select('id, current_value')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (investments) {
        for (const inv of investments) {
          const newValue = Math.floor(inv.current_value * 0.95);
          await supabase
            .from('user_investments')
            .update({ current_value: newValue })
            .eq('id', inv.id);
        }
      }
      break;

    case 'record_mark':
      // Just record the mark - no mechanical effect
      break;
  }
}

/**
 * Get commitment compliance rate
 */
export async function getComplianceRate(): Promise<{
  overall: number;
  byLevel: Record<BindingLevel, number>;
  recentTrend: 'improving' | 'stable' | 'declining';
}> {
  const commitments = await getUserCommitments();

  const calculate = (filtered: UserCommitment[]) => {
    if (filtered.length === 0) return 1;
    const fulfilled = filtered.filter(c => c.status === 'fulfilled').length;
    return fulfilled / filtered.length;
  };

  const overall = calculate(commitments);

  const byLevel: Record<BindingLevel, number> = {
    soft: calculate(commitments.filter(c => c.bindingLevel === 'soft')),
    hard: calculate(commitments.filter(c => c.bindingLevel === 'hard')),
    permanent: calculate(commitments.filter(c => c.bindingLevel === 'permanent')),
  };

  // Calculate trend from recent vs older commitments
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = commitments.filter(c => new Date(c.madeAt) > thirtyDaysAgo);
  const older = commitments.filter(c => new Date(c.madeAt) <= thirtyDaysAgo);

  const recentRate = calculate(recent);
  const olderRate = calculate(older);

  let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentRate > olderRate + 0.1) recentTrend = 'improving';
  else if (recentRate < olderRate - 0.1) recentTrend = 'declining';

  return { overall, byLevel, recentTrend };
}
