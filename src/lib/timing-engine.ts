// Timing Engine (Feature 2)
// Detects optimal timing signals for Handler interventions
// The coach should reach out at the RIGHT moment — not on a fixed schedule.

// ===========================================
// TYPES
// ===========================================

export interface TimingSignal {
  type: TimingSignalType;
  priority: 'high' | 'medium' | 'low';
  suggestedAction: SuggestedAction;
  context: Record<string, unknown>;
  expiresAt?: Date;        // Signal validity window
}

export type TimingSignalType =
  | 'peak_receptivity'     // High arousal + denial + evening + alone
  | 'integration_window'   // Morning after session
  | 'avoidance_pattern'    // 3+ days avoiding a domain
  | 'streak_risk'          // Streak about to break
  | 'momentum'             // Post-completion, high engagement
  | 'support_needed'       // Low mood + evening alone
  | 'post_session';        // Just completed session

export type SuggestedAction =
  | 'initiate_focused_session'
  | 'morning_reflection'
  | 'confront_avoidance'
  | 'streak_urgency'
  | 'escalate_or_affirm'
  | 'gentle_checkin'
  | 'capture_reflection';

export interface TimingUserState {
  userId: string;
  arousalLevel: number;                    // 0-10
  denialDay: number;
  streakDays: number;
  mood: number;                            // 1-10
  ginaPresent: boolean;
  completedToday: boolean;
  justCompletedTask: string | null;
  justCompletedSession: boolean;
  lastSessionCompletedAt: string | null;
  lastSessionType: string | null;
  domainLastCompleted: Record<string, string>;  // domain -> ISO date
  engagementRating: number;                // 1-10
}

// ===========================================
// TIMING EVALUATION
// ===========================================

/**
 * Evaluate all timing signals based on current user state.
 * Returns signals sorted by priority (high first).
 */
export function evaluateTimingSignals(state: TimingUserState): TimingSignal[] {
  const signals: TimingSignal[] = [];
  const hour = new Date().getHours();

  // ===========================================
  // PEAK RECEPTIVITY
  // High arousal + denial + evening + alone
  // ===========================================
  if (
    state.arousalLevel >= 6 &&
    state.denialDay >= 3 &&
    hour >= 21 &&
    !state.ginaPresent
  ) {
    const recommendedTier = Math.min(state.denialDay + 3, 9);

    signals.push({
      type: 'peak_receptivity',
      priority: 'high',
      suggestedAction: 'initiate_focused_session',
      context: {
        denialDay: state.denialDay,
        arousal: state.arousalLevel,
        recommendedTier,
        reason: 'High arousal + denial + evening alone = peak receptivity',
      },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Valid for 2 hours
    });
  }

  // ===========================================
  // INTEGRATION WINDOW
  // Morning after session
  // ===========================================
  if (hour >= 6 && hour <= 9 && state.lastSessionCompletedAt) {
    const lastSession = new Date(state.lastSessionCompletedAt);
    const hoursSinceSession = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60);

    // Session was 5-14 hours ago (last night)
    if (hoursSinceSession > 5 && hoursSinceSession < 14) {
      signals.push({
        type: 'integration_window',
        priority: 'high',
        suggestedAction: 'morning_reflection',
        context: {
          sessionType: state.lastSessionType,
          hoursSince: Math.round(hoursSinceSession),
          reason: 'Morning after session = integration opportunity',
        },
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000), // Valid for 3 hours
      });
    }
  }

  // ===========================================
  // AVOIDANCE DETECTION
  // 3+ days avoiding a domain
  // ===========================================
  for (const [domain, lastCompleted] of Object.entries(state.domainLastCompleted || {})) {
    const lastDate = new Date(lastCompleted);
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince >= 3) {
      signals.push({
        type: 'avoidance_pattern',
        priority: daysSince >= 5 ? 'high' : 'medium',
        suggestedAction: 'confront_avoidance',
        context: {
          domain,
          daysAvoided: daysSince,
          reason: `${daysSince} days avoiding ${domain}`,
        },
      });
    }
  }

  // ===========================================
  // STREAK RISK
  // Streak about to break
  // ===========================================
  if (state.streakDays >= 3 && !state.completedToday && hour >= 20) {
    const hoursUntilMidnight = 24 - hour;

    signals.push({
      type: 'streak_risk',
      priority: 'high',
      suggestedAction: 'streak_urgency',
      context: {
        streak: state.streakDays,
        hoursRemaining: hoursUntilMidnight,
        reason: `${state.streakDays}-day streak at risk, ${hoursUntilMidnight}h until midnight`,
      },
      expiresAt: new Date(new Date().setHours(23, 59, 59, 999)),
    });
  }

  // ===========================================
  // POST-COMPLETION MOMENTUM
  // Just completed task + moderate arousal
  // ===========================================
  if (state.justCompletedTask && state.arousalLevel >= 5) {
    signals.push({
      type: 'momentum',
      priority: 'medium',
      suggestedAction: 'escalate_or_affirm',
      context: {
        completedTask: state.justCompletedTask,
        arousal: state.arousalLevel,
        reason: 'Completed task + moderate arousal = momentum window',
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Valid for 30 mins
    });
  }

  // ===========================================
  // POST-SESSION
  // Just completed session
  // ===========================================
  if (state.justCompletedSession) {
    signals.push({
      type: 'post_session',
      priority: 'high',
      suggestedAction: 'capture_reflection',
      context: {
        sessionType: state.lastSessionType,
        engagement: state.engagementRating,
        reason: 'Post-session reflection window',
      },
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Valid for 5 mins
    });
  }

  // ===========================================
  // SUPPORT NEEDED
  // Low mood + evening alone
  // ===========================================
  if (state.mood <= 3 && hour >= 18 && !state.ginaPresent) {
    signals.push({
      type: 'support_needed',
      priority: 'medium',
      suggestedAction: 'gentle_checkin',
      context: {
        mood: state.mood,
        reason: 'Low mood + evening alone = support needed',
      },
    });
  }

  // Sort by priority (high first)
  return signals.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// ===========================================
// SIGNAL TO REQUEST TYPE MAPPING
// ===========================================

export type RequestType = 'daily_briefing' | 'task_framing' | 'session_guidance' | 'reflection' | 'check_in';

export function mapSignalToRequestType(signal: TimingSignal): RequestType {
  switch (signal.suggestedAction) {
    case 'initiate_focused_session':
      return 'session_guidance';
    case 'morning_reflection':
      return 'daily_briefing';
    case 'confront_avoidance':
      return 'check_in';
    case 'streak_urgency':
      return 'check_in';
    case 'escalate_or_affirm':
      return 'task_framing';
    case 'gentle_checkin':
      return 'check_in';
    case 'capture_reflection':
      return 'reflection';
    default:
      return 'check_in';
  }
}

// ===========================================
// SIGNAL TO CONTEXT MAPPING
// ===========================================

export function mapSignalToContext(signal: TimingSignal): Record<string, unknown> {
  switch (signal.type) {
    case 'peak_receptivity':
      return {
        trigger: 'peak_receptivity',
        recommended_tier: signal.context.recommendedTier,
        arousal_level: signal.context.arousal,
        denial_day: signal.context.denialDay,
      };

    case 'integration_window':
      return {
        trigger: 'integration_window',
        had_session_last_night: true,
        last_session_type: signal.context.sessionType,
        hours_since_session: signal.context.hoursSince,
      };

    case 'avoidance_pattern':
      return {
        trigger: 'avoidance_pattern',
        domain: signal.context.domain,
        days_avoided: signal.context.daysAvoided,
      };

    case 'streak_risk':
      return {
        trigger: 'streak_risk',
        streak_days: signal.context.streak,
        hours_remaining: signal.context.hoursRemaining,
      };

    case 'momentum':
      return {
        trigger: 'momentum',
        completed_task: signal.context.completedTask,
        arousal_level: signal.context.arousal,
      };

    case 'support_needed':
      return {
        trigger: 'low_mood',
        mood_level: signal.context.mood,
      };

    case 'post_session':
      return {
        trigger: 'post_session',
        session_type: signal.context.sessionType,
        engagement: signal.context.engagement,
        window: 'post_release_clarity',
      };

    default:
      return signal.context;
  }
}

// ===========================================
// SIGNAL FILTERING
// ===========================================

/**
 * Filter signals to only valid (non-expired) ones
 */
export function filterValidSignals(signals: TimingSignal[]): TimingSignal[] {
  const now = Date.now();
  return signals.filter(s => !s.expiresAt || s.expiresAt.getTime() > now);
}

/**
 * Get the highest priority signal
 */
export function getTopSignal(signals: TimingSignal[]): TimingSignal | null {
  const valid = filterValidSignals(signals);
  return valid.length > 0 ? valid[0] : null;
}

/**
 * Check if any high-priority signals exist
 */
export function hasHighPrioritySignal(signals: TimingSignal[]): boolean {
  return filterValidSignals(signals).some(s => s.priority === 'high');
}

// ===========================================
// SIGNAL DEBOUNCING
// ===========================================

const signalHistory = new Map<string, number>();
const DEBOUNCE_MINUTES: Record<TimingSignalType, number> = {
  peak_receptivity: 60,      // Once per hour
  integration_window: 180,   // Once per 3 hours
  avoidance_pattern: 1440,   // Once per day
  streak_risk: 30,           // Every 30 mins when at risk
  momentum: 10,              // Every 10 mins
  support_needed: 60,        // Once per hour
  post_session: 0,           // No debounce
};

/**
 * Check if a signal should be suppressed due to recent delivery
 */
export function shouldDebounceSignal(signal: TimingSignal): boolean {
  const key = `${signal.type}:${JSON.stringify(signal.context)}`;
  const lastSent = signalHistory.get(key);

  if (!lastSent) return false;

  const debounceMs = DEBOUNCE_MINUTES[signal.type] * 60 * 1000;
  return Date.now() - lastSent < debounceMs;
}

/**
 * Record that a signal was sent
 */
export function recordSignalSent(signal: TimingSignal): void {
  const key = `${signal.type}:${JSON.stringify(signal.context)}`;
  signalHistory.set(key, Date.now());
}

/**
 * Get non-debounced signals
 */
export function filterDebouncedSignals(signals: TimingSignal[]): TimingSignal[] {
  return signals.filter(s => !shouldDebounceSignal(s));
}

export default {
  evaluateTimingSignals,
  mapSignalToRequestType,
  mapSignalToContext,
  filterValidSignals,
  getTopSignal,
  hasHighPrioritySignal,
  shouldDebounceSignal,
  recordSignalSent,
  filterDebouncedSignals,
};
