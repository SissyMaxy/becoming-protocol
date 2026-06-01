/**
 * Failure Mode Detection
 * Implements Addendum A: Failure Mode Handling
 *
 * Phase C failure modes:
 * - FM1: Post-Release Shame Crash
 * - FM3: Multi-Day Depression Collapse
 * - FM8: Work Stress Absorption
 * - FM9: Identity Crisis ("Who Am I Kidding")
 */

import type { UserState, FailureMode, HandlerMode } from './types';
import { supabase } from '../supabase';

export interface FailureModeEvent {
  id?: string;
  userId: string;
  failureMode: FailureMode;
  detectedAt: Date;
  detectionSignals: Record<string, unknown>;
  interventionType: string;
  interventionContent?: string;
  handlerModeAtDetection: HandlerMode;
  stateSnapshotAtDetection: Partial<UserState>;
  resolvedAt?: Date;
  resolutionSignal?: string;
  effectivenessScore?: number;
  notes?: string;
}

export interface FailureModeDetection {
  detected: boolean;
  failureMode?: FailureMode;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  signals: Record<string, unknown>;
  recommendedIntervention: string;
}

// =============================================
// FM1: POST-RELEASE CRASH
// =============================================

export function detectPostReleaseCrash(state: UserState): FailureModeDetection {
  const signals: Record<string, unknown> = {};

  // Signal: denial_day reset to 0
  if (state.denialDay === 0 && state.lastRelease) {
    const minutesSinceRelease = (Date.now() - state.lastRelease.getTime()) / (1000 * 60);
    signals.denialReset = true;
    signals.minutesSinceRelease = minutesSinceRelease;

    // Within crash window (2 hours)
    if (minutesSinceRelease <= 120) {
      // Check for mood drop
      if (state.recentMoodScores.length >= 2) {
        const moodDrop = state.recentMoodScores[0] - (state.recentMoodScores[1] ?? 5);
        signals.moodDrop = moodDrop;

        if (moodDrop >= 3) {
          signals.confirmedCrash = true;
          return {
            detected: true,
            failureMode: 'post_release_crash',
            severity: 'moderate',
            signals,
            recommendedIntervention: 'time_capsule_or_template',
          };
        }
      }

      // Even without mood data, release = crash risk
      return {
        detected: true,
        failureMode: 'post_release_crash',
        severity: 'mild',
        signals,
        recommendedIntervention: 'gentle_check_in',
      };
    }
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

// =============================================
// FM3: DEPRESSION COLLAPSE
// =============================================

export type DepressionLevel = 'none' | 'dip' | 'collapse' | 'extended';

export function detectDepressionCollapse(state: UserState): FailureModeDetection {
  const signals: Record<string, unknown> = {};

  // Track consecutive survival days
  signals.consecutiveSurvivalDays = state.consecutiveSurvivalDays;
  signals.odometer = state.odometer;

  // Calculate average recent mood
  let avgMood = 5;
  if (state.recentMoodScores.length > 0) {
    avgMood = state.recentMoodScores.reduce((a, b) => a + b, 0) / state.recentMoodScores.length;
    signals.avgMood = avgMood;
  }

  // Level 3: Extended (6+ days)
  if (state.consecutiveSurvivalDays >= 6) {
    return {
      detected: true,
      failureMode: 'depression_collapse',
      severity: 'severe',
      signals,
      recommendedIntervention: 'safety_check_therapist_suggestion',
    };
  }

  // Level 2: Collapse (3-5 days + low mood)
  if (state.consecutiveSurvivalDays >= 3 && avgMood <= 3) {
    return {
      detected: true,
      failureMode: 'depression_collapse',
      severity: 'moderate',
      signals,
      recommendedIntervention: 'caretaker_mode_crisis_kit',
    };
  }

  // Level 1: Dip (2+ days survival OR low mood pattern)
  if (state.consecutiveSurvivalDays >= 2) {
    return {
      detected: true,
      failureMode: 'depression_collapse',
      severity: 'mild',
      signals,
      recommendedIntervention: 'caretaker_mode_minimal_tasks',
    };
  }

  // Low mood pattern without survival odometer
  if (avgMood <= 3 && state.recentMoodScores.length >= 2) {
    return {
      detected: true,
      failureMode: 'depression_collapse',
      severity: 'mild',
      signals,
      recommendedIntervention: 'caretaker_mode_gentle',
    };
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

// =============================================
// FM8: WORK STRESS
// =============================================

export function detectWorkStress(state: UserState): FailureModeDetection {
  const signals: Record<string, unknown> = {};

  signals.execFunction = state.estimatedExecFunction;
  signals.anxiety = state.currentAnxiety;
  signals.energy = state.currentEnergy;
  signals.timeOfDay = state.timeOfDay;

  // Key differentiator from depression:
  // - Depression: low mood + low energy + low motivation
  // - Work stress: low exec function + HIGH anxiety + reasonable energy

  if (
    (state.estimatedExecFunction === 'depleted' || state.estimatedExecFunction === 'low') &&
    state.currentAnxiety !== undefined &&
    state.currentAnxiety >= 7 &&
    state.currentEnergy !== undefined &&
    state.currentEnergy >= 4 &&
    (state.timeOfDay === 'morning' || state.timeOfDay === 'afternoon')
  ) {
    signals.workdayHours = true;

    return {
      detected: true,
      failureMode: 'work_stress',
      severity: 'moderate',
      signals,
      recommendedIntervention: 'pause_notifications_evening_single_task',
    };
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

// =============================================
// FM9: IDENTITY CRISIS
// =============================================

// Doubt language patterns for detection
const IDENTITY_CRISIS_PATTERNS = [
  'kidding myself',
  'just a fetish',
  'what am i doing',
  'this is crazy',
  'i should stop',
  'playing pretend',
  'not real',
  'delusional',
  'just a phase',
  'what\'s the point',
  'give up',
  'normal guy',
  'fake',
];

export function analyzeJournalForCrisis(text: string): { hasCrisisSignals: boolean; patterns: string[] } {
  const lowerText = text.toLowerCase();
  const foundPatterns: string[] = [];

  for (const pattern of IDENTITY_CRISIS_PATTERNS) {
    if (lowerText.includes(pattern)) {
      foundPatterns.push(pattern);
    }
  }

  return {
    hasCrisisSignals: foundPatterns.length >= 1,
    patterns: foundPatterns,
  };
}

export function detectIdentityCrisis(
  state: UserState,
  recentJournalText?: string
): FailureModeDetection {
  const signals: Record<string, unknown> = {};

  // Check journal text if provided
  if (recentJournalText) {
    const analysis = analyzeJournalForCrisis(recentJournalText);
    signals.journalAnalysis = analysis;

    if (analysis.hasCrisisSignals) {
      return {
        detected: true,
        failureMode: 'identity_crisis',
        severity: analysis.patterns.length >= 2 ? 'severe' : 'moderate',
        signals,
        recommendedIntervention: 'crisis_kit_deployment',
      };
    }
  }

  // Check for difficulty dial reduction request (not implemented in state yet)
  // Check for evidence deletion request (not implemented in state yet)

  // Extended post-release crash that doesn't resolve
  if (
    state.currentFailureMode === 'post_release_crash' &&
    state.denialDay === 0 &&
    state.lastRelease
  ) {
    const hoursSinceRelease = (Date.now() - state.lastRelease.getTime()) / (1000 * 60 * 60);
    if (hoursSinceRelease > 24 && state.tasksCompletedToday === 0) {
      signals.extendedPostRelease = true;
      signals.hoursSinceRelease = hoursSinceRelease;

      return {
        detected: true,
        failureMode: 'identity_crisis',
        severity: 'moderate',
        signals,
        recommendedIntervention: 'crisis_kit_deployment',
      };
    }
  }

  return {
    detected: false,
    severity: 'none',
    signals,
    recommendedIntervention: 'none',
  };
}

// =============================================
// COMBINED DETECTION
// =============================================

/**
 * Run all failure mode detections and return the highest priority one
 */
export function detectFailureModes(
  state: UserState,
  recentJournalText?: string
): FailureModeDetection {
  // Priority order (highest first):
  // 1. Identity crisis (existential > everything)
  // 2. Depression collapse (health > performance)
  // 3. Work stress (depletion > avoidance)
  // 4. Post-release crash (time-limited)

  const identityCrisis = detectIdentityCrisis(state, recentJournalText);
  if (identityCrisis.detected) {
    return identityCrisis;
  }

  const depression = detectDepressionCollapse(state);
  if (depression.detected) {
    return depression;
  }

  const workStress = detectWorkStress(state);
  if (workStress.detected) {
    return workStress;
  }

  const postRelease = detectPostReleaseCrash(state);
  if (postRelease.detected) {
    return postRelease;
  }

  return {
    detected: false,
    severity: 'none',
    signals: {},
    recommendedIntervention: 'none',
  };
}

// =============================================
// DATABASE OPERATIONS
// =============================================

/**
 * Log a failure mode event to the database
 */
export async function logFailureModeEvent(event: FailureModeEvent): Promise<string | null> {
  const { data, error } = await supabase
    .from('failure_mode_events')
    .insert({
      user_id: event.userId,
      failure_mode: event.failureMode,
      detected_at: event.detectedAt.toISOString(),
      detection_signals: event.detectionSignals,
      intervention_type: event.interventionType,
      intervention_content: event.interventionContent,
      handler_mode_at_detection: event.handlerModeAtDetection,
      state_snapshot_at_detection: event.stateSnapshotAtDetection,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error logging failure mode event:', error);
    return null;
  }

  return data?.id ?? null;
}

/**
 * Mark a failure mode as resolved
 */
export async function resolveFailureModeEvent(
  eventId: string,
  resolutionSignal: string,
  effectivenessScore?: number
): Promise<boolean> {
  const { error } = await supabase
    .from('failure_mode_events')
    .update({
      resolved_at: new Date().toISOString(),
      resolution_signal: resolutionSignal,
      effectiveness_score: effectivenessScore,
    })
    .eq('id', eventId);

  if (error) {
    console.error('Error resolving failure mode event:', error);
    return false;
  }

  return true;
}

/**
 * Get recent failure mode events for a user
 */
export async function getRecentFailureModes(
  userId: string,
  days: number = 30
): Promise<FailureModeEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('failure_mode_events')
    .select('*')
    .eq('user_id', userId)
    .gte('detected_at', since.toISOString())
    .order('detected_at', { ascending: false });

  if (error) {
    console.error('Error fetching failure mode events:', error);
    return [];
  }

  return (data ?? []).map(row => ({
    id: row.id,
    userId: row.user_id,
    failureMode: row.failure_mode,
    detectedAt: new Date(row.detected_at),
    detectionSignals: row.detection_signals,
    interventionType: row.intervention_type,
    interventionContent: row.intervention_content,
    handlerModeAtDetection: row.handler_mode_at_detection,
    stateSnapshotAtDetection: row.state_snapshot_at_detection,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    resolutionSignal: row.resolution_signal,
    effectivenessScore: row.effectiveness_score,
    notes: row.notes,
  }));
}

/**
 * Check if user is at risk of safety escalation
 * Returns true if depression frequency/duration is increasing
 */
export async function checkSafetyEscalation(userId: string): Promise<{
  shouldEscalate: boolean;
  reason?: string;
}> {
  const events = await getRecentFailureModes(userId, 90);
  const depressionEvents = events.filter(e => e.failureMode === 'depression_collapse');

  if (depressionEvents.length < 2) {
    return { shouldEscalate: false };
  }

  // Compare recent 30 days vs previous 60 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const recentEvents = depressionEvents.filter(e => e.detectedAt >= thirtyDaysAgo);
  const olderEvents = depressionEvents.filter(
    e => e.detectedAt >= sixtyDaysAgo && e.detectedAt < thirtyDaysAgo
  );

  // If frequency doubled and we have comparison data
  if (olderEvents.length > 0 && recentEvents.length >= olderEvents.length * 2) {
    return {
      shouldEscalate: true,
      reason: `Depression frequency increased: ${olderEvents.length} events in prior 30d, ${recentEvents.length} in recent 30d`,
    };
  }

  // Check duration trend
  const avgRecentDuration = recentEvents
    .filter(e => e.resolvedAt)
    .reduce((sum, e) => {
      const duration = e.resolvedAt!.getTime() - e.detectedAt.getTime();
      return sum + duration;
    }, 0) / Math.max(1, recentEvents.filter(e => e.resolvedAt).length);

  const avgOlderDuration = olderEvents
    .filter(e => e.resolvedAt)
    .reduce((sum, e) => {
      const duration = e.resolvedAt!.getTime() - e.detectedAt.getTime();
      return sum + duration;
    }, 0) / Math.max(1, olderEvents.filter(e => e.resolvedAt).length);

  if (avgRecentDuration > avgOlderDuration * 1.5) {
    return {
      shouldEscalate: true,
      reason: 'Depression duration increasing - episodes lasting longer',
    };
  }

  return { shouldEscalate: false };
}
