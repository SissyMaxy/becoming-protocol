/**
 * Resistance Classifier
 * Diagnosis Weaponization (#4)
 *
 * Classifies resistance events by diagnosis factor,
 * recommends exploitation strategies based on historical effectiveness,
 * and logs events for continuous optimization.
 */

import { supabase } from './supabase';
import type {
  ResistanceType,
  DiagnosisFactor,
  ExploitationStrategy,
  ResistanceOutcome,
  ResistanceEffectiveness,
  ResistancePatterns,
} from '../types/resistance';

// ============================================
// TYPES
// ============================================

export interface ClassifyInput {
  userId: string;
  taskDomain?: string;
  taskId?: string;
  resistanceType: ResistanceType;
  currentArousal: number;
  denialDay: number;
  timeOfDay: string;
  handlerMode: string;
}

export interface ClassifyResult {
  diagnosisFactor: DiagnosisFactor;
  confidence: 'high' | 'medium' | 'low';
  recommendedStrategy: ExploitationStrategy;
  reasoning: string;
}

export interface LogEventInput {
  userId: string;
  resistanceType: ResistanceType;
  diagnosisFactor: DiagnosisFactor;
  taskDomain?: string;
  taskId?: string;
  arousalAtEvent: number;
  denialDayAtEvent: number;
  timeOfDay: string;
  exploitationStrategyUsed: ExploitationStrategy;
  outcome: ResistanceOutcome;
  escalationLevelReached?: number;
  handlerModeAtEvent?: string;
  resolutionSeconds?: number;
  notes?: string;
}

// ============================================
// DEFAULT STRATEGIES PER DIAGNOSIS ROOT
// ============================================

const DEFAULT_STRATEGIES: Record<string, ExploitationStrategy> = {
  adhd: 'friction_removal',
  anxiety: 'manufactured_urgency',
  depression: 'arousal_maintenance',
  shame: 'shame_eroticize',
  genuine_boundary: 'none',
  unknown: 'identity_reframing',
};

function getDefaultStrategy(factor: DiagnosisFactor): ExploitationStrategy {
  const root = factor.split('_')[0];
  return DEFAULT_STRATEGIES[root] || DEFAULT_STRATEGIES[factor] || 'identity_reframing';
}

// ============================================
// CLASSIFY RESISTANCE
// ============================================

export async function classifyResistance(input: ClassifyInput): Promise<ClassifyResult> {
  const {
    userId,
    taskDomain,
    resistanceType,
    currentArousal,
    denialDay,
    timeOfDay,
    handlerMode: _handlerMode,
  } = input;

  let diagnosisFactor: DiagnosisFactor = 'unknown';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let reasoning = '';

  // Classification rules (ordered by specificity)

  if (
    (resistanceType === 'decline' || resistanceType === 'session_skip') &&
    timeOfDay === 'morning' &&
    currentArousal < 2
  ) {
    diagnosisFactor = 'adhd_initiation';
    confidence = 'high';
    reasoning = 'Morning decline/skip with low arousal — classic ADHD initiation failure';
  } else if (resistanceType === 'delay' && taskDomain) {
    // Check if domain has been avoided 3+ days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: avoidance } = await supabase
      .from('task_resistance')
      .select('id')
      .eq('user_id', userId)
      .gte('detected_at', weekAgo.toISOString());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avoidCount = (avoidance || []).length;

    if (avoidCount >= 3) {
      diagnosisFactor = 'anxiety_avoidance';
      confidence = 'high';
      reasoning = `Domain delayed with ${avoidCount} resistance events in past 7 days — anxiety avoidance pattern`;
    } else {
      diagnosisFactor = 'adhd_time_perception';
      confidence = 'low';
      reasoning = 'Delay without sustained avoidance — possibly ADHD time perception';
    }
  } else if (resistanceType === 'ignore' && denialDay < 2 && currentArousal < 2) {
    diagnosisFactor = 'depression_anhedonia';
    confidence = 'medium';
    reasoning = 'Ignoring tasks with low denial + low arousal — anhedonia pattern';
  } else if (
    resistanceType === 'domain_avoidance' &&
    taskDomain &&
    ['social', 'content', 'service'].includes(taskDomain)
  ) {
    diagnosisFactor = 'shame_exposure_fear';
    confidence = 'medium';
    reasoning = `Avoiding ${taskDomain} domain — exposure-linked shame`;
  } else if (
    resistanceType === 'exit_attempt' &&
    currentArousal < 2 &&
    timeOfDay === 'late_night'
  ) {
    diagnosisFactor = 'depression_withdrawal';
    confidence = 'medium';
    reasoning = 'Late-night exit attempt with low arousal — depressive withdrawal';
  } else if (resistanceType === 'commitment_break' && currentArousal >= 5) {
    // Commitment was extracted during high arousal, now broken
    diagnosisFactor = 'shame_post_arousal';
    confidence = 'high';
    reasoning = 'Commitment break on arousal-extracted promise — post-arousal shame';
  } else if (resistanceType === 'partial') {
    diagnosisFactor = 'adhd_attention';
    confidence = 'low';
    reasoning = 'Partial completion — possible ADHD attention drift';
  }

  // Look up best strategy from historical data
  const recommendedStrategy = await getBestStrategy(userId, diagnosisFactor);

  return {
    diagnosisFactor,
    confidence,
    recommendedStrategy,
    reasoning,
  };
}

// ============================================
// STRATEGY LOOKUP
// ============================================

async function getBestStrategy(
  userId: string,
  diagnosisFactor: DiagnosisFactor
): Promise<ExploitationStrategy> {
  const { data } = await supabase
    .from('resistance_effectiveness')
    .select('*')
    .eq('user_id', userId)
    .eq('diagnosis_factor', diagnosisFactor)
    .order('compliance_rate', { ascending: false })
    .limit(1);

  if (data && data.length > 0 && data[0].compliance_rate > 0) {
    return data[0].exploitation_strategy_used as ExploitationStrategy;
  }

  return getDefaultStrategy(diagnosisFactor);
}

// ============================================
// LOG RESISTANCE EVENT
// ============================================

export function logResistanceEvent(event: LogEventInput): void {
  // Fire and forget — don't block the caller
  supabase
    .from('resistance_events')
    .insert({
      user_id: event.userId,
      resistance_type: event.resistanceType,
      diagnosis_factor: event.diagnosisFactor,
      task_domain: event.taskDomain || null,
      task_id: event.taskId || null,
      arousal_at_event: event.arousalAtEvent,
      denial_day_at_event: event.denialDayAtEvent,
      time_of_day: event.timeOfDay,
      exploitation_strategy_used: event.exploitationStrategyUsed,
      outcome: event.outcome,
      escalation_level_reached: event.escalationLevelReached || 0,
      handler_mode_at_event: event.handlerModeAtEvent || null,
      resolution_seconds: event.resolutionSeconds || null,
      notes: event.notes || null,
    })
    .then(({ error }) => {
      if (error) {
        console.warn('[ResistanceClassifier] Failed to log event:', error.message);
      }
    });
}

// ============================================
// EFFECTIVENESS QUERIES
// ============================================

export async function getResistanceEffectiveness(
  userId: string,
  diagnosisFactor?: DiagnosisFactor
): Promise<ResistanceEffectiveness[]> {
  let query = supabase
    .from('resistance_effectiveness')
    .select('*')
    .eq('user_id', userId)
    .order('compliance_rate', { ascending: false });

  if (diagnosisFactor) {
    query = query.eq('diagnosis_factor', diagnosisFactor);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[ResistanceClassifier] Failed to query effectiveness:', error.message);
    return [];
  }

  return (data || []) as ResistanceEffectiveness[];
}

// ============================================
// RESISTANCE PATTERNS
// ============================================

export async function getResistancePatterns(
  userId: string,
  days = 30
): Promise<ResistancePatterns> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data: events, error } = await supabase
    .from('resistance_events')
    .select('*')
    .eq('user_id', userId)
    .gte('event_timestamp', cutoff.toISOString());

  if (error || !events || events.length === 0) {
    return {
      totalEvents: 0,
      byDiagnosis: {},
      byOutcome: {},
      byDomain: {},
      averageResolutionSeconds: null,
      mostEffectiveStrategy: null,
      leastEffectiveStrategy: null,
    };
  }

  const byDiagnosis: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  let totalResolution = 0;
  let resolutionCount = 0;

  for (const e of events) {
    if (e.diagnosis_factor) {
      byDiagnosis[e.diagnosis_factor] = (byDiagnosis[e.diagnosis_factor] || 0) + 1;
    }
    byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + 1;
    if (e.task_domain) {
      byDomain[e.task_domain] = (byDomain[e.task_domain] || 0) + 1;
    }
    if (e.resolution_seconds != null) {
      totalResolution += e.resolution_seconds;
      resolutionCount++;
    }
  }

  // Get effectiveness data for strategy ranking
  const effectiveness = await getResistanceEffectiveness(userId);
  const sorted = effectiveness.filter(e => e.total_events >= 3);

  return {
    totalEvents: events.length,
    byDiagnosis,
    byOutcome,
    byDomain,
    averageResolutionSeconds: resolutionCount > 0
      ? Math.round(totalResolution / resolutionCount)
      : null,
    mostEffectiveStrategy: sorted.length > 0
      ? sorted[0].exploitation_strategy_used
      : null,
    leastEffectiveStrategy: sorted.length > 0
      ? sorted[sorted.length - 1].exploitation_strategy_used
      : null,
  };
}
