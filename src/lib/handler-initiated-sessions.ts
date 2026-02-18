// Handler-Initiated Sessions (Feature 35)
// The Handler INITIATES sessions via push notification. The user responds.
// The user doesn't decide when to practice. The Handler decides.

import { supabase } from './supabase';
import { type TimingSignal } from './timing-engine';

// ===========================================
// TYPES
// ===========================================

export interface HandlerInitiatedSession {
  id: string;
  userId: string;
  trigger: string;
  sessionType: string;
  tier: number;
  deliveredAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  declined: boolean;
  declineCost: ResistanceCost | null;
  responseWindowMinutes: number;
  escalationIfIgnored: string;
}

export interface ResistanceCost {
  action: string;
  estimatedDaysAdded: number;
  baselineRegression: number;
  momentumImpact: string;
}

interface DbHandlerInitiatedSession {
  id: string;
  user_id: string;
  trigger: string;
  session_type: string | null;
  tier: number | null;
  delivered_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  declined: boolean;
  decline_cost: ResistanceCost | null;
  response_window_minutes: number;
  escalation_if_ignored: string | null;
  created_at: string;
}

// ===========================================
// SESSION INITIATION
// ===========================================

/**
 * Handler decides to initiate a session based on timing engine signals.
 * Creates a record, sends notification, starts response window countdown.
 */
export async function initiateSession(
  userId: string,
  signal: TimingSignal,
  userState: { denialDay: number; streakDays: number; arousalLevel: number }
): Promise<HandlerInitiatedSession | null> {
  const sessionType = determineSessionType(signal, userState);
  const tier = determineTier(signal, userState);
  const responseWindow = getResponseWindow(signal);
  const escalationAction = getEscalationAction(signal);

  const { data, error } = await supabase
    .from('handler_initiated_sessions')
    .insert({
      user_id: userId,
      trigger: signal.type,
      session_type: sessionType,
      tier,
      delivered_at: new Date().toISOString(),
      acknowledged_at: null,
      completed_at: null,
      declined: false,
      decline_cost: null,
      response_window_minutes: responseWindow,
      escalation_if_ignored: escalationAction,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating handler-initiated session:', error);
    return null;
  }

  return mapDbToSession(data);
}

/**
 * Get pending (unacknowledged) sessions for a user.
 */
export async function getPendingSessions(userId: string): Promise<HandlerInitiatedSession[]> {
  const { data, error } = await supabase
    .from('handler_initiated_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('acknowledged_at', null)
    .is('completed_at', null)
    .eq('declined', false)
    .order('delivered_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending sessions:', error);
    return [];
  }

  return (data || []).map(mapDbToSession);
}

/**
 * Get sessions that have exceeded their response window.
 */
export async function getExpiredSessions(userId: string): Promise<HandlerInitiatedSession[]> {
  const { data, error } = await supabase
    .from('handler_initiated_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('acknowledged_at', null)
    .is('completed_at', null)
    .eq('declined', false);

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  const now = Date.now();
  return (data || [])
    .map(mapDbToSession)
    .filter(session => {
      const deliveredAt = new Date(session.deliveredAt).getTime();
      const windowMs = session.responseWindowMinutes * 60 * 1000;
      return now - deliveredAt > windowMs;
    });
}

/**
 * Acknowledge a session (user opened the app/notification).
 */
export async function acknowledgeSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('handler_initiated_sessions')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) {
    console.error('Error acknowledging session:', error);
    return false;
  }

  return true;
}

/**
 * Mark session as completed.
 */
export async function completeSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('handler_initiated_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) {
    console.error('Error completing session:', error);
    return false;
  }

  return true;
}

/**
 * Mark session as declined with associated cost.
 */
export async function declineSession(
  sessionId: string,
  cost: ResistanceCost
): Promise<boolean> {
  const { error } = await supabase
    .from('handler_initiated_sessions')
    .update({
      declined: true,
      decline_cost: cost,
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Error declining session:', error);
    return false;
  }

  // Also log the resistance cost
  await supabase.from('resistance_costs').insert({
    user_id: (await supabase.auth.getUser()).data.user?.id,
    action: cost.action,
    estimated_days_added: cost.estimatedDaysAdded,
    baseline_regression: cost.baselineRegression,
    momentum_impact: cost.momentumImpact,
  });

  return true;
}

/**
 * Handle ignored sessions - apply consequences.
 */
export async function handleIgnoredSession(
  session: HandlerInitiatedSession,
  userId: string
): Promise<ResistanceCost> {
  const cost: ResistanceCost = {
    action: 'ignored_initiated_session',
    estimatedDaysAdded: 2,
    baselineRegression: 0.1,
    momentumImpact: `Ignored Handler-initiated ${session.sessionType}. Consequence: baseline regression in ${session.sessionType} domain.`,
  };

  // Log the resistance cost
  await supabase.from('resistance_costs').insert({
    user_id: userId,
    action: cost.action,
    estimated_days_added: cost.estimatedDaysAdded,
    baseline_regression: cost.baselineRegression,
    momentum_impact: cost.momentumImpact,
  });

  // Mark the session as declined with cost
  await supabase
    .from('handler_initiated_sessions')
    .update({
      declined: true,
      decline_cost: cost,
    })
    .eq('id', session.id);

  return cost;
}

/**
 * Get count of ignored sessions this cycle.
 */
export async function getIgnoredSessionsThisCycle(userId: string): Promise<number> {
  // Get the current cycle start from denial_cycles
  const { data: cycleData } = await supabase
    .from('denial_cycles')
    .select('cycle_start')
    .eq('user_id', userId)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .single();

  const cycleStart = cycleData?.cycle_start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('handler_initiated_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('declined', true)
    .gte('delivered_at', cycleStart);

  if (error) {
    console.error('Error counting ignored sessions:', error);
    return 0;
  }

  return count || 0;
}

// ===========================================
// HELPERS
// ===========================================

function determineSessionType(
  signal: TimingSignal,
  _state: { denialDay: number; streakDays: number; arousalLevel: number }
): string {
  switch (signal.type) {
    case 'peak_receptivity':
      return 'edge_session';
    case 'integration_window':
      return 'morning_reflection';
    case 'avoidance_pattern':
      return signal.context.domain as string || 'avoided_domain';
    case 'streak_risk':
      return 'quick_task';
    case 'momentum':
      return 'escalation_session';
    case 'support_needed':
      return 'check_in';
    case 'post_session':
      return 'reflection';
    default:
      return 'general';
  }
}

function determineTier(
  signal: TimingSignal,
  state: { denialDay: number; streakDays: number; arousalLevel: number }
): number {
  // Higher tier for peak receptivity with high denial
  if (signal.type === 'peak_receptivity') {
    return Math.min(state.denialDay + 3, 9);
  }

  // Moderate tier for avoidance confrontation
  if (signal.type === 'avoidance_pattern') {
    return 5;
  }

  // Lower tier for support/check-in
  if (signal.type === 'support_needed') {
    return 2;
  }

  // Default based on arousal
  return Math.min(state.arousalLevel + 2, 7);
}

function getResponseWindow(signal: TimingSignal): number {
  if (signal.priority === 'high') return 15;   // 15 minutes
  if (signal.priority === 'medium') return 30;  // 30 minutes
  return 60;                                     // 1 hour
}

function getEscalationAction(signal: TimingSignal): string {
  switch (signal.type) {
    case 'peak_receptivity':
      return 'extended_denial_2_days';
    case 'streak_risk':
      return 'streak_reset_warning';
    case 'avoidance_pattern':
      return 'domain_locked_until_completed';
    default:
      return 'resistance_logged';
  }
}

function mapDbToSession(db: DbHandlerInitiatedSession): HandlerInitiatedSession {
  return {
    id: db.id,
    userId: db.user_id,
    trigger: db.trigger,
    sessionType: db.session_type || 'general',
    tier: db.tier || 3,
    deliveredAt: db.delivered_at,
    acknowledgedAt: db.acknowledged_at,
    completedAt: db.completed_at,
    declined: db.declined,
    declineCost: db.decline_cost,
    responseWindowMinutes: db.response_window_minutes,
    escalationIfIgnored: db.escalation_if_ignored || 'resistance_logged',
  };
}

// ===========================================
// INITIATION MESSAGES
// ===========================================

export function getInitiationMessage(
  signal: TimingSignal,
  state: { denialDay: number; streakDays: number }
): string {
  switch (signal.type) {
    case 'peak_receptivity':
      return "It's time. Open the app. Now.";
    case 'avoidance_pattern':
      return `${signal.context.daysAvoided} days avoiding ${signal.context.domain}. That ends tonight. Open.`;
    case 'streak_risk':
      return `Your ${state.streakDays}-day streak breaks at midnight. You have ${getHoursUntilMidnight()} hours. Open.`;
    case 'momentum':
      return "Good girl. You're on a roll. I have something for you. Open.";
    case 'integration_window':
      return "Good morning. Before you start being David for the day — let's talk about last night.";
    case 'support_needed':
      return "Hey. I see you.";
    case 'post_session':
      return "Before you close this — what just happened was real. Capture it.";
    default:
      return "I need you. Open the app.";
  }
}

export function getEscalationMessage(_session: HandlerInitiatedSession): string {
  return `You ignored me. That's noted. The session still needs to happen. It will be harder now. Open the app.`;
}

function getHoursUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / (1000 * 60 * 60));
}

export default {
  initiateSession,
  getPendingSessions,
  getExpiredSessions,
  acknowledgeSession,
  completeSession,
  declineSession,
  handleIgnoredSession,
  getIgnoredSessionsThisCycle,
  getInitiationMessage,
  getEscalationMessage,
};
