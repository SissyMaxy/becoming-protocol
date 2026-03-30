/**
 * Service Advancement — P5.5
 *
 * Evaluates weekly metrics to determine if a user should advance to the
 * next service progression stage. Queries task completion, conditioning
 * sessions, compliance rate, trance depth, and denial streak length.
 *
 * Builds Handler context showing current stage, progress toward next,
 * and compliance metrics.
 */

import { supabase } from '../supabase';
import {
  SERVICE_STAGES,
  SERVICE_STAGE_LABELS,
  type ServiceStage,
} from '../../types/escalation';

// ============================================
// TYPES
// ============================================

export interface AdvancementMetrics {
  taskCompletionRate: number;
  conditioningSessionCount: number;
  complianceRate: number;
  avgTranceDepth: number;
  denialStreakDays: number;
  daysMet: number;
}

export interface AdvancementEvaluation {
  shouldAdvance: boolean;
  currentStage: ServiceStage;
  nextStage?: ServiceStage;
  metrics: AdvancementMetrics;
  reason: string;
}

interface StageCriteria {
  minCompliance: number;
  minDaysMet: number;
  minSessions: number;
  minTranceDepth: number;
}

// ============================================
// ADVANCEMENT CRITERIA
// ============================================

const STAGE_CRITERIA: Record<string, StageCriteria> = {
  // Stage 0→1: fantasy → content_consumption
  '0': { minCompliance: 0.70, minDaysMet: 7, minSessions: 2, minTranceDepth: 0 },
  // Stage 1→2: content_consumption → online_interaction
  '1': { minCompliance: 0.80, minDaysMet: 14, minSessions: 5, minTranceDepth: 3 },
  // Stage 2→3: online_interaction → first_encounter
  '2': { minCompliance: 0.85, minDaysMet: 21, minSessions: 10, minTranceDepth: 5 },
  // Stage 3→4: first_encounter → regular_service
  '3': { minCompliance: 0.85, minDaysMet: 21, minSessions: 10, minTranceDepth: 5 },
  // Stage 4→5: regular_service → organized_availability
  '4': { minCompliance: 0.90, minDaysMet: 30, minSessions: 15, minTranceDepth: 7 },
  // Stage 5→6: organized_availability → gina_directed
  '5': { minCompliance: 0.90, minDaysMet: 30, minSessions: 15, minTranceDepth: 7 },
};

// ============================================
// EVALUATE SERVICE ADVANCEMENT
// ============================================

/**
 * Run weekly. Queries task completion, conditioning session count,
 * compliance rate, trance depth progression, and denial streak length
 * to determine if user should advance to the next service stage.
 */
export async function evaluateServiceAdvancement(
  userId: string,
): Promise<AdvancementEvaluation> {
  // Get current service progression
  const { data: progression } = await supabase
    .from('service_progression')
    .select('stage, entered_at')
    .eq('user_id', userId)
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentStage: ServiceStage = (progression?.stage as ServiceStage) ?? 'fantasy';
  const currentIndex = SERVICE_STAGES.indexOf(currentStage);
  const enteredAt = progression?.entered_at ?? new Date().toISOString();

  // Days in current stage
  const daysInStage = Math.floor(
    (Date.now() - new Date(enteredAt).getTime()) / 86400000,
  );

  // Already at max stage
  if (currentIndex >= SERVICE_STAGES.length - 1) {
    const metrics = await gatherMetrics(userId);
    return {
      shouldAdvance: false,
      currentStage,
      metrics,
      reason: 'Already at maximum stage (gina_directed)',
    };
  }

  const nextStage = SERVICE_STAGES[currentIndex + 1];
  const criteria = STAGE_CRITERIA[String(currentIndex)] ?? STAGE_CRITERIA['0'];
  const metrics = await gatherMetrics(userId);

  // Check all criteria
  const complianceMet = metrics.complianceRate >= criteria.minCompliance;
  const daysMet = daysInStage >= criteria.minDaysMet;
  const sessionsMet = metrics.conditioningSessionCount >= criteria.minSessions;
  const tranceMet = metrics.avgTranceDepth >= criteria.minTranceDepth;

  const shouldAdvance = complianceMet && daysMet && sessionsMet && tranceMet;

  const failReasons: string[] = [];
  if (!complianceMet)
    failReasons.push(
      `compliance ${(metrics.complianceRate * 100).toFixed(0)}% < ${(criteria.minCompliance * 100).toFixed(0)}%`,
    );
  if (!daysMet) failReasons.push(`${daysInStage}d in stage < ${criteria.minDaysMet}d required`);
  if (!sessionsMet)
    failReasons.push(
      `${metrics.conditioningSessionCount} sessions < ${criteria.minSessions} required`,
    );
  if (!tranceMet)
    failReasons.push(
      `avg trance ${metrics.avgTranceDepth.toFixed(1)} < ${criteria.minTranceDepth} required`,
    );

  return {
    shouldAdvance,
    currentStage,
    nextStage,
    metrics,
    reason: shouldAdvance
      ? `All criteria met for advancement to ${SERVICE_STAGE_LABELS[nextStage]}`
      : `Not ready: ${failReasons.join(', ')}`,
  };
}

// ============================================
// GATHER METRICS
// ============================================

async function gatherMetrics(userId: string): Promise<AdvancementMetrics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [tasksResult, sessionsResult, tranceResult, streakResult] =
    await Promise.allSettled([
      // Task completion in last 7 days
      supabase
        .from('daily_tasks')
        .select('id, completed', { count: 'exact' })
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo),
      // Conditioning sessions in last 7 days
      supabase
        .from('conditioning_sessions_v2')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('completed', true)
        .gte('started_at', sevenDaysAgo),
      // Trance depth from recent sessions
      supabase
        .from('conditioning_sessions_v2')
        .select('trance_depth_estimated')
        .eq('user_id', userId)
        .eq('completed', true)
        .not('trance_depth_estimated', 'is', null)
        .order('started_at', { ascending: false })
        .limit(10),
      // Current denial streak
      supabase
        .from('user_state')
        .select('denial_day, streak_days')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  // Task completion rate
  let taskCompletionRate = 0;
  let complianceRate = 0;
  if (tasksResult.status === 'fulfilled' && tasksResult.value.data) {
    const tasks = tasksResult.value.data;
    const total = tasks.length;
    const completed = tasks.filter(
      (t: { completed: boolean }) => t.completed,
    ).length;
    taskCompletionRate = total > 0 ? completed / total : 0;
    complianceRate = taskCompletionRate;
  }

  // Conditioning session count
  const conditioningSessionCount =
    sessionsResult.status === 'fulfilled'
      ? sessionsResult.value.count ?? 0
      : 0;

  // Average trance depth
  let avgTranceDepth = 0;
  if (tranceResult.status === 'fulfilled' && tranceResult.value.data) {
    const depths = tranceResult.value.data
      .map((r: { trance_depth_estimated: number | null }) => r.trance_depth_estimated)
      .filter((d: number | null): d is number => d !== null);
    if (depths.length > 0) {
      avgTranceDepth = depths.reduce((a: number, b: number) => a + b, 0) / depths.length;
    }
  }

  // Denial streak
  const denialStreakDays =
    streakResult.status === 'fulfilled' && streakResult.value.data
      ? streakResult.value.data.denial_day ?? streakResult.value.data.streak_days ?? 0
      : 0;

  return {
    taskCompletionRate,
    conditioningSessionCount,
    complianceRate,
    avgTranceDepth,
    denialStreakDays,
    daysMet: 0, // Calculated in evaluateServiceAdvancement from daysInStage
  };
}

// ============================================
// ADVANCE SERVICE STAGE
// ============================================

/**
 * Updates service_progression and logs an escalation event.
 */
export async function advanceServiceStage(
  userId: string,
  newStage: ServiceStage,
): Promise<boolean> {
  try {
    // Get current stage for the log
    const { data: current } = await supabase
      .from('service_progression')
      .select('stage')
      .eq('user_id', userId)
      .order('entered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousStage = current?.stage ?? 'fantasy';
    const previousIndex = SERVICE_STAGES.indexOf(previousStage as ServiceStage);
    const newIndex = SERVICE_STAGES.indexOf(newStage);

    // Insert new progression record
    const { error: insertError } = await supabase
      .from('service_progression')
      .insert({
        user_id: userId,
        stage: newStage,
        entered_at: new Date().toISOString(),
        activities: [],
        comfort_level: 1,
        arousal_association: 1,
        notes: `Auto-advanced from ${previousStage} based on weekly evaluation`,
      });

    if (insertError) {
      console.error('[service-advancement] Failed to insert progression:', insertError.message);
      return false;
    }

    // Log escalation event
    await supabase.from('escalation_events').insert({
      user_id: userId,
      domain: 'submission',
      from_level: previousIndex,
      to_level: newIndex,
      description: `Service: Auto-advanced from ${SERVICE_STAGE_LABELS[previousStage as ServiceStage] ?? previousStage} to ${SERVICE_STAGE_LABELS[newStage]}`,
      trigger_method: 'automated_evaluation',
      resistance_encountered: false,
    });

    return true;
  } catch (err) {
    console.error('[service-advancement] advanceServiceStage error:', err);
    return false;
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Handler context showing current stage, progress toward next,
 * compliance rate, session count.
 */
export async function buildServiceAdvancementContext(
  userId: string,
): Promise<string> {
  try {
    const evaluation = await evaluateServiceAdvancement(userId);

    const parts: string[] = [];

    parts.push(
      `SERVICE PROGRESSION: ${SERVICE_STAGE_LABELS[evaluation.currentStage]} (stage ${SERVICE_STAGES.indexOf(evaluation.currentStage) + 1}/${SERVICE_STAGES.length})`,
    );

    parts.push(
      `  compliance: ${(evaluation.metrics.complianceRate * 100).toFixed(0)}%, sessions (7d): ${evaluation.metrics.conditioningSessionCount}, avg trance depth: ${evaluation.metrics.avgTranceDepth.toFixed(1)}, denial streak: ${evaluation.metrics.denialStreakDays}d`,
    );

    if (evaluation.nextStage) {
      if (evaluation.shouldAdvance) {
        parts.push(
          `  READY TO ADVANCE: ${SERVICE_STAGE_LABELS[evaluation.nextStage]} — all criteria met`,
        );
      } else {
        parts.push(
          `  next stage: ${SERVICE_STAGE_LABELS[evaluation.nextStage]} — ${evaluation.reason}`,
        );
      }
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[service-advancement] buildServiceAdvancementContext error:', err);
    return '';
  }
}
