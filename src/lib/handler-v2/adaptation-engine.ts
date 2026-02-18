/**
 * Adaptation Engine
 *
 * Part of the Handler Autonomous System. Learns user patterns from
 * historical data and adjusts strategy to preempt resistance.
 *
 * Responsibilities:
 * - Analyze compliance, content, and arousal patterns over time
 * - Predict tomorrow's compliance probability and risk windows
 * - Generate strategy recommendations (scheduling, preemption, content, resistance counters, rewards)
 * - Apply recommendations to handler_strategy
 * - Run weekly full-cycle adaptation
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface PatternAnalysis {
  compliancePatterns: {
    bestDays: string[];
    worstDays: string[];
    bestTimes: string[];
    worstTimes: string[];
    triggersBefore: string[];
    resistanceTypes: string[];
  };
  contentPatterns: {
    preferredTypes: string[];
    avoidedTypes: string[];
    bestPerforming: string[];
  };
  arousalPatterns: {
    peakTimes: string[];
    avgSessionDuration: number;
  };
  predictionAccuracy: number;
}

export interface DayPrediction {
  date: string;
  expectedCompliance: number; // 0-1
  riskWindows: Array<{ start: string; end: string; riskLevel: number }>;
  preemptiveMeasures: Array<{ type: string; timing: string; reason: string }>;
}

export interface AdaptationRecommendation {
  type: 'scheduling' | 'preemption' | 'content_strategy' | 'resistance_counter' | 'reward_adjustment';
  action: string;
  details: Record<string, unknown>;
}

// ============================================
// INTERNAL HELPERS
// ============================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOUR_LABELS: Record<number, string> = {
  6: '06:00', 7: '07:00', 8: '08:00', 9: '09:00', 10: '10:00', 11: '11:00',
  12: '12:00', 13: '13:00', 14: '14:00', 15: '15:00', 16: '16:00', 17: '17:00',
  18: '18:00', 19: '19:00', 20: '20:00', 21: '21:00', 22: '22:00', 23: '23:00',
  0: '00:00', 1: '01:00', 2: '02:00', 3: '03:00', 4: '04:00', 5: '05:00',
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function tomorrowDayOfWeek(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getDay();
}

/** Group rows by a derived key, counting occurrences. */
function countByKey<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/** Return keys sorted by value descending. */
function sortedKeys(counts: Record<string, number>, ascending = false): string[] {
  return Object.entries(counts)
    .sort((a, b) => ascending ? a[1] - b[1] : b[1] - a[1])
    .map(([k]) => k);
}

// ============================================
// analyzePatterns
// ============================================

/**
 * Analyze the last N days of user data to extract compliance, content,
 * and arousal patterns. Also calculates prediction accuracy by comparing
 * past predictions stored in handler_decisions against actual outcomes.
 */
export async function analyzePatterns(userId: string, days: number = 30): Promise<PatternAnalysis> {
  const cutoff = daysAgo(days);

  // Fetch content briefs within the window
  const { data: briefs } = await supabase
    .from('content_briefs')
    .select('id, status, content_type, difficulty, vulnerability_tier, deadline, submitted_at, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  const allBriefs = briefs || [];

  // Fetch compliance state history from enforcement_log
  const { data: enforcementRows } = await supabase
    .from('enforcement_log')
    .select('id, enforcement_type, tier, trigger_reason, action_taken, details, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  const enforcementLogs = enforcementRows || [];

  // Fetch past adaptation decisions for prediction accuracy
  const { data: decisionRows } = await supabase
    .from('handler_decisions')
    .select('id, decision_type, decision_data, outcome, created_at')
    .eq('user_id', userId)
    .eq('decision_type', 'adaptation')
    .gte('created_at', cutoff);

  const pastDecisions = decisionRows || [];

  // ------------------------------------------------------------------
  // 1. Compliance patterns
  // ------------------------------------------------------------------

  // Group completed briefs by day of week
  const completedBriefs = allBriefs.filter(b => b.status === 'submitted' || b.status === 'processed');
  const declinedOrExpired = allBriefs.filter(b => b.status === 'declined' || b.status === 'expired');

  const completionsByDay = countByKey(completedBriefs, b => {
    const d = new Date(b.submitted_at || b.created_at);
    return DAY_NAMES[d.getDay()];
  });

  const skipsByDay = countByKey(declinedOrExpired, b => {
    const d = new Date(b.deadline || b.created_at);
    return DAY_NAMES[d.getDay()];
  });

  // Compute completion rate per day
  const dayRates: Record<string, number> = {};
  for (const day of DAY_NAMES) {
    const completed = completionsByDay[day] || 0;
    const skipped = skipsByDay[day] || 0;
    const total = completed + skipped;
    dayRates[day] = total > 0 ? completed / total : 0.5; // default to 0.5 if no data
  }

  const bestDays = sortedKeys(dayRates).slice(0, 3);
  const worstDays = sortedKeys(dayRates, true).slice(0, 3);

  // Group completions by hour of day
  const completionsByHour = countByKey(completedBriefs, b => {
    const d = new Date(b.submitted_at || b.created_at);
    return String(d.getHours());
  });

  const skipsByHour = countByKey(declinedOrExpired, b => {
    const d = new Date(b.deadline || b.created_at);
    return String(d.getHours());
  });

  const hourRates: Record<string, number> = {};
  for (let h = 0; h < 24; h++) {
    const key = String(h);
    const completed = completionsByHour[key] || 0;
    const skipped = skipsByHour[key] || 0;
    const total = completed + skipped;
    if (total > 0) {
      hourRates[HOUR_LABELS[h]] = completed / total;
    }
  }

  const bestTimes = sortedKeys(hourRates).slice(0, 3);
  const worstTimes = sortedKeys(hourRates, true).slice(0, 3);

  // Resistance analysis from enforcement logs
  const triggersBefore = Array.from(
    new Set(enforcementLogs.map(e => e.trigger_reason).filter(Boolean))
  ).slice(0, 10);

  const resistanceTypes = Array.from(
    new Set(
      declinedOrExpired.map(b => {
        if (b.status === 'declined') return 'explicit_decline';
        if (b.status === 'expired') return 'passive_avoidance';
        return 'unknown';
      })
    )
  );

  // ------------------------------------------------------------------
  // 2. Content patterns
  // ------------------------------------------------------------------

  const completedByType = countByKey(completedBriefs, b => b.content_type);
  const declinedByType = countByKey(declinedOrExpired, b => b.content_type);

  const preferredTypes = sortedKeys(completedByType).slice(0, 5);

  // Avoided types: high decline rate relative to assignment
  const allByType = countByKey(allBriefs, b => b.content_type);
  const avoidedTypes: string[] = [];
  for (const [contentType, total] of Object.entries(allByType)) {
    const declined = declinedByType[contentType] || 0;
    if (total >= 2 && declined / total >= 0.5) {
      avoidedTypes.push(contentType);
    }
  }

  // Best performing: completed briefs that led to content in the library with good performance
  // Approximation: highest completion rate among types with sufficient data
  const typeRates: Record<string, number> = {};
  for (const [contentType, total] of Object.entries(allByType)) {
    const completed = completedByType[contentType] || 0;
    if (total >= 2) {
      typeRates[contentType] = completed / total;
    }
  }
  const bestPerforming = sortedKeys(typeRates).slice(0, 3);

  // ------------------------------------------------------------------
  // 3. Arousal patterns
  // ------------------------------------------------------------------

  // Fetch completed tasks tagged as sessions
  const { data: sessionTasks } = await supabase
    .from('daily_tasks')
    .select('id, completed_at, created_at, domain')
    .eq('user_id', userId)
    .in('domain', ['edge', 'goon', 'hypno', 'conditioning', 'intimate'])
    .eq('status', 'completed')
    .gte('created_at', cutoff);

  const sessions = sessionTasks || [];

  const sessionsByHour = countByKey(sessions, s => {
    const d = new Date(s.completed_at || s.created_at);
    return HOUR_LABELS[d.getHours()] || String(d.getHours());
  });

  const peakTimes = sortedKeys(sessionsByHour).slice(0, 3);

  // Estimate average session duration: difference between created_at and completed_at
  let totalDurationMinutes = 0;
  let durationCount = 0;
  for (const s of sessions) {
    if (s.completed_at && s.created_at) {
      const diffMs = new Date(s.completed_at).getTime() - new Date(s.created_at).getTime();
      if (diffMs > 0 && diffMs < 4 * 60 * 60 * 1000) { // cap at 4 hours
        totalDurationMinutes += diffMs / (1000 * 60);
        durationCount++;
      }
    }
  }

  const avgSessionDuration = durationCount > 0 ? Math.round(totalDurationMinutes / durationCount) : 0;

  // ------------------------------------------------------------------
  // 4. Prediction accuracy
  // ------------------------------------------------------------------

  let correctPredictions = 0;
  let totalPredictions = 0;

  for (const decision of pastDecisions) {
    const data = decision.decision_data as Record<string, unknown> | null;
    const outcome = decision.outcome as Record<string, unknown> | null;
    if (data && outcome && typeof data.expectedCompliance === 'number' && typeof outcome.actualCompliance === 'number') {
      totalPredictions++;
      const predicted = data.expectedCompliance as number;
      const actual = outcome.actualCompliance as number;
      // Count as correct if prediction was within 0.2 of actual
      if (Math.abs(predicted - actual) <= 0.2) {
        correctPredictions++;
      }
    }
  }

  const predictionAccuracy = totalPredictions > 0
    ? correctPredictions / totalPredictions
    : 0;

  return {
    compliancePatterns: {
      bestDays,
      worstDays,
      bestTimes,
      worstTimes,
      triggersBefore,
      resistanceTypes,
    },
    contentPatterns: {
      preferredTypes,
      avoidedTypes,
      bestPerforming,
    },
    arousalPatterns: {
      peakTimes,
      avgSessionDuration,
    },
    predictionAccuracy,
  };
}

// ============================================
// predictTomorrow
// ============================================

/**
 * Generate a prediction for tomorrow based on historical patterns.
 * Computes an expected compliance probability and identifies risk windows
 * where the user historically skips or declines. If predicted compliance
 * is below 0.7, preemptive measures are appended.
 */
export async function predictTomorrow(userId: string): Promise<DayPrediction> {
  const patterns = await analyzePatterns(userId, 30);

  const date = tomorrowDate();
  const dayOfWeek = tomorrowDayOfWeek();
  const dayName = DAY_NAMES[dayOfWeek];

  // ------------------------------------------------------------------
  // Expected compliance
  // ------------------------------------------------------------------

  // Base compliance from day-of-week history
  let expectedCompliance = 0.5;

  if (patterns.compliancePatterns.bestDays.includes(dayName)) {
    const rank = patterns.compliancePatterns.bestDays.indexOf(dayName);
    expectedCompliance += 0.15 - rank * 0.03;
  }
  if (patterns.compliancePatterns.worstDays.includes(dayName)) {
    const rank = patterns.compliancePatterns.worstDays.indexOf(dayName);
    expectedCompliance -= 0.15 - rank * 0.03;
  }

  // Weekend penalty
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    expectedCompliance -= 0.05;
  }

  // Adjust for resistance types prevalence
  if (patterns.compliancePatterns.resistanceTypes.includes('passive_avoidance')) {
    expectedCompliance -= 0.05;
  }

  // Positive adjustment if prediction accuracy is high (model has track record)
  if (patterns.predictionAccuracy > 0.7) {
    // Confidence boost -- lean into the pattern data more
    expectedCompliance = expectedCompliance * 0.8 + patterns.predictionAccuracy * 0.2;
  }

  // Clamp to [0, 1]
  expectedCompliance = Math.max(0, Math.min(1, expectedCompliance));

  // ------------------------------------------------------------------
  // Risk windows
  // ------------------------------------------------------------------

  const riskWindows: DayPrediction['riskWindows'] = [];

  // Convert worst times to risk windows (extend each hour to a 2-hour block)
  for (const time of patterns.compliancePatterns.worstTimes) {
    const hour = parseInt(time.split(':')[0], 10);
    const endHour = (hour + 2) % 24;
    const start = `${String(hour).padStart(2, '0')}:00`;
    const end = `${String(endHour).padStart(2, '0')}:00`;
    riskWindows.push({
      start,
      end,
      riskLevel: 0.7 + (patterns.compliancePatterns.worstTimes.indexOf(time) === 0 ? 0.2 : 0),
    });
  }

  // If no data-driven risk windows, add defaults
  if (riskWindows.length === 0) {
    riskWindows.push(
      { start: '14:00', end: '16:00', riskLevel: 0.5 },
      { start: '22:00', end: '00:00', riskLevel: 0.6 },
    );
  }

  // ------------------------------------------------------------------
  // Preemptive measures
  // ------------------------------------------------------------------

  const preemptiveMeasures: DayPrediction['preemptiveMeasures'] = [];

  if (expectedCompliance < 0.7) {
    preemptiveMeasures.push({
      type: 'morning_activation',
      timing: '08:00',
      reason: `Predicted compliance for ${dayName} is low (${(expectedCompliance * 100).toFixed(0)}%). Morning activation increases engagement by front-loading momentum.`,
    });

    preemptiveMeasures.push({
      type: 'simplified_tasks',
      timing: 'all_day',
      reason: `Historically difficult day. Reduce task difficulty to maintain streak and avoid complete disengagement.`,
    });

    preemptiveMeasures.push({
      type: 'increased_rewards',
      timing: 'all_day',
      reason: `Reward multiplier to offset predicted resistance on ${dayName}.`,
    });
  }

  // Add preemption for individual risk windows regardless of overall compliance
  for (const window of riskWindows) {
    if (window.riskLevel >= 0.7) {
      preemptiveMeasures.push({
        type: 'window_intervention',
        timing: window.start,
        reason: `High-risk window ${window.start}-${window.end}. Proactive check-in or session prompt to maintain engagement.`,
      });
    }
  }

  return {
    date,
    expectedCompliance,
    riskWindows,
    preemptiveMeasures,
  };
}

// ============================================
// generateRecommendations
// ============================================

/**
 * Produce a set of strategy recommendations based on current pattern
 * analysis. Each recommendation targets a specific dimension:
 * scheduling, preemption, content strategy, resistance counter, or
 * reward adjustment.
 */
export async function generateRecommendations(userId: string): Promise<AdaptationRecommendation[]> {
  const patterns = await analyzePatterns(userId, 30);
  const prediction = await predictTomorrow(userId);
  const recommendations: AdaptationRecommendation[] = [];

  // ------------------------------------------------------------------
  // 1. Scheduling: shift difficult tasks to best times
  // ------------------------------------------------------------------

  if (patterns.compliancePatterns.bestTimes.length > 0 && patterns.compliancePatterns.worstTimes.length > 0) {
    recommendations.push({
      type: 'scheduling',
      action: 'Shift high-difficulty tasks to optimal completion windows',
      details: {
        targetTimes: patterns.compliancePatterns.bestTimes,
        avoidTimes: patterns.compliancePatterns.worstTimes,
        rationale: `Completion rates are highest at ${patterns.compliancePatterns.bestTimes.join(', ')} and lowest at ${patterns.compliancePatterns.worstTimes.join(', ')}.`,
      },
    });
  }

  if (patterns.compliancePatterns.bestDays.length > 0) {
    recommendations.push({
      type: 'scheduling',
      action: 'Front-load challenging briefs on high-compliance days',
      details: {
        bestDays: patterns.compliancePatterns.bestDays,
        worstDays: patterns.compliancePatterns.worstDays,
        rationale: `Best compliance on ${patterns.compliancePatterns.bestDays.join(', ')}; worst on ${patterns.compliancePatterns.worstDays.join(', ')}.`,
      },
    });
  }

  // ------------------------------------------------------------------
  // 2. Preemption: intervene before known triggers
  // ------------------------------------------------------------------

  if (patterns.compliancePatterns.triggersBefore.length > 0) {
    recommendations.push({
      type: 'preemption',
      action: 'Deploy early interventions before known resistance triggers',
      details: {
        identifiedTriggers: patterns.compliancePatterns.triggersBefore,
        suggestedLeadTime: '30 minutes before historically problematic windows',
        interventionTypes: ['check_in', 'simplified_task_offer', 'streak_reminder'],
      },
    });
  }

  if (prediction.riskWindows.some(w => w.riskLevel >= 0.7)) {
    const highRiskWindows = prediction.riskWindows.filter(w => w.riskLevel >= 0.7);
    recommendations.push({
      type: 'preemption',
      action: 'Schedule proactive engagement before high-risk windows',
      details: {
        windows: highRiskWindows.map(w => ({ start: w.start, end: w.end, risk: w.riskLevel })),
        strategy: 'Send motivational prompt or easy task 30 minutes before window opens.',
      },
    });
  }

  // ------------------------------------------------------------------
  // 3. Content strategy: address avoided types with gradual exposure
  // ------------------------------------------------------------------

  if (patterns.contentPatterns.avoidedTypes.length > 0) {
    recommendations.push({
      type: 'content_strategy',
      action: 'Introduce avoided content types via gradual exposure',
      details: {
        avoidedTypes: patterns.contentPatterns.avoidedTypes,
        preferredTypes: patterns.contentPatterns.preferredTypes,
        approach: 'Pair one avoided-type brief with two preferred-type briefs. Start at lowest difficulty and vulnerability tier.',
        exposureSchedule: patterns.contentPatterns.avoidedTypes.map(avoidedType => ({
          type: avoidedType,
          startDifficulty: 1,
          startVulnerabilityTier: 1,
          pairWith: patterns.contentPatterns.preferredTypes[0] || null,
        })),
      },
    });
  }

  if (patterns.contentPatterns.bestPerforming.length > 0) {
    recommendations.push({
      type: 'content_strategy',
      action: 'Increase frequency of best-performing content types',
      details: {
        bestPerforming: patterns.contentPatterns.bestPerforming,
        rationale: 'These types have the highest completion rate and should form the backbone of the content calendar.',
      },
    });
  }

  // ------------------------------------------------------------------
  // 4. Resistance counter: specific strategies per resistance type
  // ------------------------------------------------------------------

  for (const resistanceType of patterns.compliancePatterns.resistanceTypes) {
    switch (resistanceType) {
      case 'explicit_decline':
        recommendations.push({
          type: 'resistance_counter',
          action: 'Counter explicit declines with commitment recall and guilt leverage',
          details: {
            resistanceType: 'explicit_decline',
            counterStrategies: [
              'Reference past commitments made during high arousal',
              'Show investment/streak statistics before presenting brief',
              'Reduce brief difficulty by one level and re-present',
            ],
          },
        });
        break;

      case 'passive_avoidance':
        recommendations.push({
          type: 'resistance_counter',
          action: 'Counter passive avoidance with escalating check-ins and urgency',
          details: {
            resistanceType: 'passive_avoidance',
            counterStrategies: [
              'Send reminder at 50% deadline elapsed',
              'Manufacture urgency at 75% deadline elapsed',
              'Reduce brief scope at 90% deadline to salvage partial completion',
            ],
            escalationInterval: '2 hours between check-ins',
          },
        });
        break;

      default:
        recommendations.push({
          type: 'resistance_counter',
          action: `Address unclassified resistance pattern: ${resistanceType}`,
          details: {
            resistanceType,
            counterStrategies: [
              'Increase monitoring frequency',
              'Add gentle accountability check-ins',
              'Gather more data to classify resistance type',
            ],
          },
        });
    }
  }

  // ------------------------------------------------------------------
  // 5. Reward adjustment: boost rewards on predicted difficult days
  // ------------------------------------------------------------------

  if (prediction.expectedCompliance < 0.7) {
    recommendations.push({
      type: 'reward_adjustment',
      action: 'Increase reward multiplier for predicted low-compliance day',
      details: {
        targetDate: prediction.date,
        expectedCompliance: prediction.expectedCompliance,
        rewardMultiplier: prediction.expectedCompliance < 0.5 ? 2.0 : 1.5,
        bonusEdgeCredits: prediction.expectedCompliance < 0.5 ? 3 : 1,
        rationale: `Predicted ${(prediction.expectedCompliance * 100).toFixed(0)}% compliance. Elevated rewards to incentivize engagement.`,
      },
    });
  }

  if (patterns.compliancePatterns.worstDays.length > 0) {
    recommendations.push({
      type: 'reward_adjustment',
      action: 'Apply standing reward boost on historically weak days',
      details: {
        targetDays: patterns.compliancePatterns.worstDays,
        rewardMultiplier: 1.5,
        rationale: `${patterns.compliancePatterns.worstDays.join(', ')} consistently show lower compliance. Permanent reward uplift for these days.`,
      },
    });
  }

  return recommendations;
}

// ============================================
// applyRecommendation
// ============================================

/**
 * Apply a single recommendation by updating the handler_strategy table.
 * Also logs the decision to handler_decisions for audit trail.
 */
export async function applyRecommendation(
  userId: string,
  rec: AdaptationRecommendation
): Promise<void> {
  // Fetch current strategy
  const { data: strategy } = await supabase
    .from('handler_strategy')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!strategy) {
    // Initialize if missing
    await supabase.from('handler_strategy').insert({ user_id: userId });
  }

  const currentAdaptation = (strategy?.adaptation_data as Record<string, unknown>) || {};
  const currentResistance = (strategy?.resistance_patterns as Record<string, unknown>) || {};

  // Build update payload depending on recommendation type
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  switch (rec.type) {
    case 'scheduling': {
      const existing = (currentAdaptation.scheduling as Record<string, unknown>) || {};
      updates.adaptation_data = {
        ...currentAdaptation,
        scheduling: {
          ...existing,
          bestTimes: rec.details.targetTimes || rec.details.bestDays || existing.bestTimes,
          avoidTimes: rec.details.avoidTimes || existing.avoidTimes,
          bestDays: rec.details.bestDays || existing.bestDays,
          worstDays: rec.details.worstDays || existing.worstDays,
          lastUpdated: new Date().toISOString(),
        },
      };
      break;
    }

    case 'preemption': {
      const existing = (currentAdaptation.preemption as Record<string, unknown>) || {};
      updates.adaptation_data = {
        ...currentAdaptation,
        preemption: {
          ...existing,
          triggers: rec.details.identifiedTriggers || rec.details.windows || existing.triggers,
          strategy: rec.details.strategy || existing.strategy,
          lastUpdated: new Date().toISOString(),
        },
      };
      break;
    }

    case 'content_strategy': {
      const currentFocus = (strategy?.content_focus as Record<string, unknown>) || {};
      updates.content_focus = {
        ...currentFocus,
        avoidedTypesExposure: rec.details.exposureSchedule || currentFocus.avoidedTypesExposure,
        bestPerforming: rec.details.bestPerforming || currentFocus.bestPerforming,
        lastAdapted: new Date().toISOString(),
      };
      break;
    }

    case 'resistance_counter': {
      const existingTypes = (currentResistance.types as string[]) || [];
      const existingCountermeasures = (currentResistance.countermeasures as unknown[]) || [];
      const resistanceType = rec.details.resistanceType as string;

      updates.resistance_patterns = {
        ...currentResistance,
        types: Array.from(new Set([...existingTypes, resistanceType])),
        countermeasures: [
          ...existingCountermeasures,
          {
            type: resistanceType,
            strategies: rec.details.counterStrategies,
            addedAt: new Date().toISOString(),
          },
        ],
        lastUpdated: new Date().toISOString(),
      };
      break;
    }

    case 'reward_adjustment': {
      const existing = (currentAdaptation.rewards as Record<string, unknown>) || {};
      updates.adaptation_data = {
        ...currentAdaptation,
        rewards: {
          ...existing,
          multiplier: rec.details.rewardMultiplier || existing.multiplier,
          bonusEdgeCredits: rec.details.bonusEdgeCredits || existing.bonusEdgeCredits,
          targetDays: rec.details.targetDays || existing.targetDays,
          targetDate: rec.details.targetDate || existing.targetDate,
          lastUpdated: new Date().toISOString(),
        },
      };
      break;
    }
  }

  // Apply update to handler_strategy
  await supabase
    .from('handler_strategy')
    .update(updates)
    .eq('user_id', userId);

  // Log the decision for audit trail
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'adaptation',
    decision_data: {
      recommendationType: rec.type,
      action: rec.action,
      details: rec.details,
    },
    reasoning: `Adaptation engine applied ${rec.type} recommendation: ${rec.action}`,
    executed: true,
    executed_at: new Date().toISOString(),
  });
}

// ============================================
// runWeeklyAdaptation
// ============================================

/**
 * Execute a full weekly adaptation cycle:
 * 1. Analyze patterns over the last 30 days
 * 2. Predict tomorrow
 * 3. Generate recommendations
 * 4. Apply all recommendations to handler_strategy
 * 5. Record the prediction with its expected compliance as an
 *    adaptation decision so future runs can evaluate accuracy.
 */
export async function runWeeklyAdaptation(userId: string): Promise<{
  patterns: PatternAnalysis;
  predictions: DayPrediction;
  recommendations: AdaptationRecommendation[];
}> {
  const patterns = await analyzePatterns(userId, 30);
  const predictions = await predictTomorrow(userId);
  const recommendations = await generateRecommendations(userId);

  // Apply all recommendations
  for (const rec of recommendations) {
    await applyRecommendation(userId, rec);
  }

  // Store the prediction as a decision so we can later measure accuracy
  // by comparing expectedCompliance with actual compliance for that date
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'adaptation',
    decision_data: {
      type: 'weekly_prediction',
      date: predictions.date,
      expectedCompliance: predictions.expectedCompliance,
      riskWindows: predictions.riskWindows,
      preemptiveMeasures: predictions.preemptiveMeasures,
      patternsSnapshot: {
        bestDays: patterns.compliancePatterns.bestDays,
        worstDays: patterns.compliancePatterns.worstDays,
        resistanceTypes: patterns.compliancePatterns.resistanceTypes,
        avoidedContentTypes: patterns.contentPatterns.avoidedTypes,
        predictionAccuracy: patterns.predictionAccuracy,
      },
      recommendationCount: recommendations.length,
    },
    reasoning: `Weekly adaptation cycle. Predicted ${(predictions.expectedCompliance * 100).toFixed(0)}% compliance for ${predictions.date}. Generated ${recommendations.length} recommendations.`,
    executed: true,
    executed_at: new Date().toISOString(),
  });

  // Log to enforcement_log for visibility
  await supabase.from('enforcement_log').insert({
    user_id: userId,
    enforcement_type: 'adaptation_cycle',
    tier: 0,
    trigger_reason: 'Scheduled weekly adaptation run',
    action_taken: `Analyzed 30-day patterns. Predicted ${(predictions.expectedCompliance * 100).toFixed(0)}% compliance for ${predictions.date}. Applied ${recommendations.length} recommendations.`,
    details: {
      predictionAccuracy: patterns.predictionAccuracy,
      expectedCompliance: predictions.expectedCompliance,
      riskWindowCount: predictions.riskWindows.length,
      preemptiveMeasureCount: predictions.preemptiveMeasures.length,
      recommendationTypes: recommendations.map(r => r.type),
    },
  });

  return { patterns, predictions, recommendations };
}

// ============================================
// getAdaptationSummary
// ============================================

/**
 * Return a lightweight summary suitable for the dashboard:
 * - Current prediction accuracy
 * - When the last analysis was performed
 * - How many active recommendations exist in handler_strategy
 */
export async function getAdaptationSummary(userId: string): Promise<{
  predictionAccuracy: number;
  lastAnalysis: string | null;
  activeRecommendations: number;
}> {
  // Get the most recent adaptation decision for timing and accuracy
  const { data: latestDecision } = await supabase
    .from('handler_decisions')
    .select('id, decision_data, created_at')
    .eq('user_id', userId)
    .eq('decision_type', 'adaptation')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const lastAnalysis = latestDecision?.created_at
    ? new Date(latestDecision.created_at).toISOString()
    : null;

  // Compute prediction accuracy from the last 90 days of adaptation decisions
  const cutoff90 = daysAgo(90);
  const { data: adaptationDecisions } = await supabase
    .from('handler_decisions')
    .select('decision_data, outcome')
    .eq('user_id', userId)
    .eq('decision_type', 'adaptation')
    .gte('created_at', cutoff90);

  let correct = 0;
  let total = 0;
  for (const d of adaptationDecisions || []) {
    const data = d.decision_data as Record<string, unknown> | null;
    const outcome = d.outcome as Record<string, unknown> | null;
    if (
      data &&
      outcome &&
      typeof data.expectedCompliance === 'number' &&
      typeof outcome.actualCompliance === 'number'
    ) {
      total++;
      if (Math.abs((data.expectedCompliance as number) - (outcome.actualCompliance as number)) <= 0.2) {
        correct++;
      }
    }
  }

  const predictionAccuracy = total > 0 ? correct / total : 0;

  // Count active recommendations by inspecting handler_strategy.adaptation_data
  const { data: strategy } = await supabase
    .from('handler_strategy')
    .select('adaptation_data, resistance_patterns, content_focus')
    .eq('user_id', userId)
    .single();

  let activeRecommendations = 0;

  if (strategy) {
    const adaptationData = (strategy.adaptation_data as Record<string, unknown>) || {};
    const resistancePatterns = (strategy.resistance_patterns as Record<string, unknown>) || {};
    const contentFocus = (strategy.content_focus as Record<string, unknown>) || {};

    // Count non-empty sub-keys as active recommendations
    if (adaptationData.scheduling) activeRecommendations++;
    if (adaptationData.preemption) activeRecommendations++;
    if (adaptationData.rewards) activeRecommendations++;
    if (contentFocus.avoidedTypesExposure) activeRecommendations++;
    if (contentFocus.bestPerforming) activeRecommendations++;

    const countermeasures = (resistancePatterns.countermeasures as unknown[]) || [];
    activeRecommendations += countermeasures.length;
  }

  return {
    predictionAccuracy,
    lastAnalysis,
    activeRecommendations,
  };
}
