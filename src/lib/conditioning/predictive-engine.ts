/**
 * Predictive Intervention Engine — P11.3
 *
 * Runs predictive models against current user state to forecast:
 * - Release risk (denial break probability)
 * - Engagement drop (compliance/interaction decline)
 * - Breakthrough window (optimal moment for commitment extraction)
 *
 * Predictions are stored in predictive_interventions and surfaced
 * to the Handler as context so it can act preemptively.
 *
 * Table: predictive_interventions
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type PredictionType =
  | 'release_risk'
  | 'engagement_drop'
  | 'regression_risk'
  | 'breakthrough_window';

export interface Prediction {
  type: PredictionType;
  probability: number;       // 0-1
  confidence: number;        // 0-1
  factors: Record<string, unknown>;
  recommendedAction: string;
  recommendedTiming: string;
}

export interface PredictionResult {
  predictions: Prediction[];
  highestPriority: Prediction | null;
}

// ============================================
// RELEASE RISK
// ============================================

/**
 * Predict the probability of a denial break tonight/today.
 *
 * Factors:
 * - denial_day (higher day past threshold = higher risk)
 * - current_arousal (4+ = elevated)
 * - day_of_week (Fri/Sat = higher)
 * - gina_home (away = higher)
 * - time_of_day (evening = higher)
 * - whoop_strain (low = idle = higher risk)
 * - historical release patterns
 */
export async function predictReleaseRisk(userId: string): Promise<Prediction> {
  const factors: Record<string, unknown> = {};
  let risk = 0;
  let confidencePoints = 0;
  let totalWeight = 0;

  try {
    // User state
    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day, current_arousal, gina_home, denial_cycle_target_days')
      .eq('user_id', userId)
      .maybeSingle();

    const denialDay = state?.denial_day || 0;
    const arousal = state?.current_arousal || 0;
    const ginaHome = state?.gina_home !== false;
    const targetDays = state?.denial_cycle_target_days || 7;

    // Factor: denial day
    // Risk rises after 50% of target, peaks near target
    const dayRatio = targetDays > 0 ? denialDay / targetDays : 0;
    const denialRisk = dayRatio > 1.0 ? 0.9 : dayRatio > 0.7 ? 0.5 + (dayRatio - 0.7) * 1.33 : dayRatio * 0.3;
    risk += denialRisk * 0.25;
    totalWeight += 0.25;
    factors.denial_day = denialDay;
    factors.denial_day_risk = Math.round(denialRisk * 100);
    confidencePoints += denialDay > 0 ? 1 : 0;

    // Factor: arousal
    const arousalRisk = arousal >= 5 ? 0.9 : arousal >= 4 ? 0.7 : arousal >= 3 ? 0.4 : arousal * 0.1;
    risk += arousalRisk * 0.20;
    totalWeight += 0.20;
    factors.arousal = arousal;
    factors.arousal_risk = Math.round(arousalRisk * 100);
    confidencePoints += arousal > 0 ? 1 : 0;

    // Factor: day of week
    const dayOfWeek = new Date().getDay(); // 0=Sun, 5=Fri, 6=Sat
    const weekendRisk = (dayOfWeek === 5 || dayOfWeek === 6) ? 0.7 : dayOfWeek === 0 ? 0.5 : 0.3;
    risk += weekendRisk * 0.10;
    totalWeight += 0.10;
    factors.day_of_week = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
    factors.weekend_risk = Math.round(weekendRisk * 100);
    confidencePoints += 1;

    // Factor: Gina away
    const ginaRisk = ginaHome ? 0.2 : 0.8;
    risk += ginaRisk * 0.15;
    totalWeight += 0.15;
    factors.gina_home = ginaHome;
    factors.gina_risk = Math.round(ginaRisk * 100);
    confidencePoints += 1;

    // Factor: time of day
    const hour = new Date().getHours();
    const timeRisk = hour >= 22 ? 0.8 : hour >= 20 ? 0.7 : hour >= 18 ? 0.5 : hour >= 12 ? 0.3 : 0.1;
    risk += timeRisk * 0.10;
    totalWeight += 0.10;
    factors.hour = hour;
    factors.time_risk = Math.round(timeRisk * 100);
    confidencePoints += 1;

    // Factor: Whoop strain (low strain = idle body = risk)
    try {
      const { data: whoopData } = await supabase
        .from('whoop_daily')
        .select('strain')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (whoopData?.strain != null) {
        const strain = whoopData.strain;
        const strainRisk = strain < 5 ? 0.7 : strain < 10 ? 0.4 : 0.2;
        risk += strainRisk * 0.10;
        totalWeight += 0.10;
        factors.whoop_strain = strain;
        factors.strain_risk = Math.round(strainRisk * 100);
        confidencePoints += 1;
      }
    } catch {
      // Whoop data optional
    }

    // Factor: historical release patterns
    try {
      const { data: releases } = await supabase
        .from('release_events')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (releases && releases.length >= 3) {
        // Check if releases cluster around this denial day
        const { data: analytics } = await supabase
          .from('denial_cycle_analytics')
          .select('denial_day, avg_compliance_rate')
          .eq('user_id', userId)
          .eq('denial_day', denialDay)
          .maybeSingle();

        if (analytics) {
          const complianceRate = analytics.avg_compliance_rate || 0.5;
          // Low compliance on this denial day historically = higher risk
          const historyRisk = 1 - complianceRate;
          risk += historyRisk * 0.10;
          totalWeight += 0.10;
          factors.historical_compliance_this_day = Math.round(complianceRate * 100);
          factors.history_risk = Math.round(historyRisk * 100);
          confidencePoints += 2;
        }
      }
    } catch {
      // Historical data optional
    }

    // Normalize risk to totalWeight
    const normalizedRisk = totalWeight > 0 ? Math.min(1, risk / totalWeight * (1 / 0.75)) : 0;
    const confidence = Math.min(1, confidencePoints / 7);

    // Recommended action based on risk level
    let action: string;
    let timing: string;
    if (normalizedRisk > 0.7) {
      action = 'Schedule conditioning session + increase ambient device. Deploy trigger reinforcement.';
      timing = 'Immediate — within the hour';
    } else if (normalizedRisk > 0.5) {
      action = 'Send check-in message. Queue evening conditioning. Gentle denial reinforcement.';
      timing = 'This evening';
    } else if (normalizedRisk > 0.3) {
      action = 'Monitor. Standard evening routine. No special intervention needed.';
      timing = 'Passive monitoring';
    } else {
      action = 'Low risk. No intervention needed.';
      timing = 'None';
    }

    return {
      type: 'release_risk',
      probability: Math.round(normalizedRisk * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      factors,
      recommendedAction: action,
      recommendedTiming: timing,
    };
  } catch (err) {
    console.error('[PredictiveEngine] Release risk error:', err);
    return {
      type: 'release_risk',
      probability: 0,
      confidence: 0,
      factors: { error: 'computation_failed' },
      recommendedAction: 'Unable to compute. Monitor manually.',
      recommendedTiming: 'Unknown',
    };
  }
}

// ============================================
// ENGAGEMENT DROP
// ============================================

/**
 * Predict probability of engagement dropping off.
 *
 * Factors:
 * - task_completion_trend (declining 3 days)
 * - last_conversation_age (>48h = risk)
 * - current_streak vs average
 * - whoop_recovery (RED = risk)
 */
export async function predictEngagementDrop(userId: string): Promise<Prediction> {
  const factors: Record<string, unknown> = {};
  let risk = 0;

  try {
    // Task completion trend (last 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: recentTasks } = await supabase
      .from('daily_tasks')
      .select('completed, created_at')
      .eq('user_id', userId)
      .gte('created_at', threeDaysAgo);

    if (recentTasks && recentTasks.length > 0) {
      // Group by day
      const dayBuckets: Record<string, { total: number; completed: number }> = {};
      for (const t of recentTasks) {
        const day = new Date(t.created_at).toISOString().split('T')[0];
        if (!dayBuckets[day]) dayBuckets[day] = { total: 0, completed: 0 };
        dayBuckets[day].total++;
        if (t.completed) dayBuckets[day].completed++;
      }

      const days = Object.entries(dayBuckets).sort(([a], [b]) => b.localeCompare(a));
      const rates = days.map(([, v]) => v.total > 0 ? v.completed / v.total : 0);

      // Declining trend: each day worse than the last
      let declining = true;
      for (let i = 0; i < rates.length - 1; i++) {
        if (rates[i] >= rates[i + 1]) { declining = false; break; }
      }

      const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0.5;
      const trendRisk = declining && rates.length >= 2 ? 0.8 : avgRate < 0.3 ? 0.7 : avgRate < 0.5 ? 0.4 : 0.1;
      risk += trendRisk * 0.30;
      factors.task_completion_3d = rates.map(r => Math.round(r * 100));
      factors.declining_trend = declining;
      factors.task_risk = Math.round(trendRisk * 100);
    }

    // Last conversation age
    const { data: lastConv } = await supabase
      .from('handler_conversations')
      .select('started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hoursAgo = lastConv
      ? Math.round((Date.now() - new Date(lastConv.started_at).getTime()) / 3600000)
      : 999;

    const convRisk = hoursAgo > 72 ? 0.9 : hoursAgo > 48 ? 0.7 : hoursAgo > 24 ? 0.3 : 0.05;
    risk += convRisk * 0.30;
    factors.last_conversation_hours = hoursAgo;
    factors.conversation_risk = Math.round(convRisk * 100);

    // Exercise streak vs average
    const { data: streak } = await supabase
      .from('exercise_streaks')
      .select('current_streak_weeks, sessions_this_week')
      .eq('user_id', userId)
      .maybeSingle();

    if (streak) {
      const sessionsExpected = 3;
      const dayOfWeek = new Date().getDay();
      const expectedByNow = Math.min(sessionsExpected, Math.ceil((dayOfWeek / 7) * sessionsExpected));
      const deficit = expectedByNow - (streak.sessions_this_week || 0);
      const streakRisk = deficit >= 2 ? 0.7 : deficit >= 1 ? 0.4 : 0.1;
      risk += streakRisk * 0.20;
      factors.sessions_this_week = streak.sessions_this_week;
      factors.streak_weeks = streak.current_streak_weeks;
      factors.exercise_risk = Math.round(streakRisk * 100);
    }

    // Whoop recovery
    try {
      const { data: whoopData } = await supabase
        .from('whoop_daily')
        .select('recovery')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (whoopData?.recovery != null) {
        const recovery = whoopData.recovery;
        // RED = 0-33, YELLOW = 34-66, GREEN = 67-100
        const recoveryRisk = recovery < 33 ? 0.8 : recovery < 50 ? 0.4 : 0.1;
        risk += recoveryRisk * 0.20;
        factors.whoop_recovery = recovery;
        factors.recovery_zone = recovery < 33 ? 'RED' : recovery < 67 ? 'YELLOW' : 'GREEN';
        factors.recovery_risk = Math.round(recoveryRisk * 100);
      }
    } catch {
      // Whoop optional
    }

    const normalizedRisk = Math.min(1, risk);
    const confidence = Object.keys(factors).length >= 6 ? 0.8 : Object.keys(factors).length >= 3 ? 0.6 : 0.3;

    let action: string;
    let timing: string;
    if (normalizedRisk > 0.7) {
      action = 'Deploy novelty injection. Queue surprise content or device ambush. Send warm outreach.';
      timing = 'Immediate';
    } else if (normalizedRisk > 0.4) {
      action = 'Send gentle check-in. Reduce task load. Focus on one engaging task.';
      timing = 'Within 6 hours';
    } else {
      action = 'Engagement healthy. Continue standard protocol.';
      timing = 'None needed';
    }

    return {
      type: 'engagement_drop',
      probability: Math.round(normalizedRisk * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      factors,
      recommendedAction: action,
      recommendedTiming: timing,
    };
  } catch (err) {
    console.error('[PredictiveEngine] Engagement drop error:', err);
    return {
      type: 'engagement_drop',
      probability: 0,
      confidence: 0,
      factors: { error: 'computation_failed' },
      recommendedAction: 'Unable to compute.',
      recommendedTiming: 'Unknown',
    };
  }
}

// ============================================
// BREAKTHROUGH WINDOW
// ============================================

/**
 * Predict probability of a breakthrough opportunity (optimal moment
 * for commitment extraction, deep conditioning, or identity advancement).
 *
 * Factors:
 * - denial_day at sweet spot
 * - high arousal + vulnerability detected recently
 * - rising feminine language ratio
 * - increased journal depth
 */
export async function predictBreakthroughWindow(userId: string): Promise<Prediction> {
  const factors: Record<string, unknown> = {};
  let probability = 0;

  try {
    // User state
    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day, current_arousal')
      .eq('user_id', userId)
      .maybeSingle();

    const denialDay = state?.denial_day || 0;
    const arousal = state?.current_arousal || 0;

    // Sweet spot check
    const { data: sweetSpot } = await supabase
      .from('denial_cycle_analytics')
      .select('denial_day, avg_compliance_rate, vulnerability_window_count')
      .eq('user_id', userId)
      .order('vulnerability_window_count', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isSweetSpot = sweetSpot ? denialDay === sweetSpot.denial_day : false;
    const sweetSpotBonus = isSweetSpot ? 0.25 : 0;
    probability += sweetSpotBonus;
    factors.denial_day = denialDay;
    factors.sweet_spot_day = isSweetSpot;
    if (sweetSpot) factors.peak_vulnerability_day = sweetSpot.denial_day;

    // Arousal contribution
    const arousalBonus = arousal >= 4 ? 0.20 : arousal >= 3 ? 0.10 : 0;
    probability += arousalBonus;
    factors.arousal = arousal;

    // Recent vulnerability detections
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: recentVuln } = await supabase
      .from('conversation_classifications')
      .select('vulnerability_detected')
      .eq('user_id', userId)
      .eq('vulnerability_detected', true)
      .gte('created_at', twentyFourHoursAgo);

    const vulnCount = recentVuln?.length || 0;
    const vulnBonus = vulnCount >= 3 ? 0.20 : vulnCount >= 1 ? 0.10 : 0;
    probability += vulnBonus;
    factors.recent_vulnerability_count = vulnCount;

    // Language drift — rising feminine language ratio
    try {
      const { data: driftData } = await supabase
        .from('language_drift_snapshots')
        .select('feminine_ratio')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (driftData && driftData.length >= 3) {
        const recent = driftData.slice(0, 2).reduce((a, b) => a + (b.feminine_ratio || 0), 0) / 2;
        const older = driftData.slice(-2).reduce((a, b) => a + (b.feminine_ratio || 0), 0) / 2;
        const rising = recent > older + 0.05;
        const driftBonus = rising ? 0.15 : 0;
        probability += driftBonus;
        factors.feminine_ratio_recent = Math.round(recent * 100);
        factors.feminine_ratio_rising = rising;
      }
    } catch {
      // Language drift optional
    }

    // Journal depth — recent journal entries with significant content
    try {
      const { data: journals } = await supabase
        .from('journal_entries')
        .select('content')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 48 * 3600000).toISOString())
        .order('created_at', { ascending: false })
        .limit(3);

      if (journals && journals.length > 0) {
        const avgLength = journals.reduce((sum, j) => sum + (j.content?.length || 0), 0) / journals.length;
        // Deeper journals (>500 chars) suggest introspective state
        const depthBonus = avgLength > 800 ? 0.15 : avgLength > 500 ? 0.10 : avgLength > 200 ? 0.05 : 0;
        probability += depthBonus;
        factors.avg_journal_length = Math.round(avgLength);
        factors.journal_depth_signal = avgLength > 500;
      }
    } catch {
      // Journal data optional
    }

    probability = Math.min(1, probability);
    const confidence = Object.keys(factors).length >= 6 ? 0.75 : Object.keys(factors).length >= 4 ? 0.55 : 0.3;

    let action: string;
    let timing: string;
    if (probability > 0.6) {
      action = 'Push commitment extraction. Deploy conditioning session. This is the window.';
      timing = 'Now — this conversation';
    } else if (probability > 0.35) {
      action = 'Warm up toward commitment. Build vulnerability. Prepare for extraction.';
      timing = 'Next 2-4 hours';
    } else {
      action = 'No breakthrough window detected. Continue building.';
      timing = 'Not now';
    }

    return {
      type: 'breakthrough_window',
      probability: Math.round(probability * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      factors,
      recommendedAction: action,
      recommendedTiming: timing,
    };
  } catch (err) {
    console.error('[PredictiveEngine] Breakthrough error:', err);
    return {
      type: 'breakthrough_window',
      probability: 0,
      confidence: 0,
      factors: { error: 'computation_failed' },
      recommendedAction: 'Unable to compute.',
      recommendedTiming: 'Unknown',
    };
  }
}

// ============================================
// RUN ALL PREDICTIONS
// ============================================

/**
 * Run all prediction models, store results, return highest-priority.
 */
export async function runPredictions(userId: string): Promise<PredictionResult> {
  const [releaseResult, engagementResult, breakthroughResult] = await Promise.allSettled([
    predictReleaseRisk(userId),
    predictEngagementDrop(userId),
    predictBreakthroughWindow(userId),
  ]);

  const predictions: Prediction[] = [];

  for (const result of [releaseResult, engagementResult, breakthroughResult]) {
    if (result.status === 'fulfilled') {
      predictions.push(result.value);
    }
  }

  // Store all predictions (fire-and-forget)
  for (const p of predictions) {
    supabase
      .from('predictive_interventions')
      .insert({
        user_id: userId,
        prediction_type: p.type,
        probability: p.probability,
        confidence: p.confidence,
        factors: p.factors,
        recommended_action: p.recommendedAction,
        recommended_timing: p.recommendedTiming,
      })
      .then(() => {});
  }

  // Determine highest priority
  // Weigh: release_risk and engagement_drop are threats (higher = worse),
  // breakthrough_window is opportunity (higher = better).
  // Threats get priority if > 0.5, otherwise breakthrough window wins.
  const threats = predictions
    .filter(p => p.type !== 'breakthrough_window' && p.probability > 0.5)
    .sort((a, b) => b.probability - a.probability);

  const opportunities = predictions
    .filter(p => p.type === 'breakthrough_window' && p.probability > 0.35)
    .sort((a, b) => b.probability - a.probability);

  const highestPriority = threats[0] || opportunities[0] || null;

  return { predictions, highestPriority };
}

// ============================================
// CONTEXT BUILDER
// ============================================

/**
 * Handler context: prediction summary.
 */
export async function buildPredictiveEngineContext(userId: string): Promise<string> {
  try {
    // Get most recent predictions (last 6 hours)
    const cutoff = new Date(Date.now() - 6 * 3600000).toISOString();
    const { data: recent } = await supabase
      .from('predictive_interventions')
      .select('prediction_type, probability, confidence, factors, recommended_action, recommended_timing')
      .eq('user_id', userId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recent || recent.length === 0) {
      // No recent predictions — run fresh
      const result = await runPredictions(userId);
      if (result.predictions.length === 0) return '';
      return formatPredictions(result.predictions);
    }

    // Deduplicate by type (keep most recent)
    const byType = new Map<string, typeof recent[0]>();
    for (const r of recent) {
      if (!byType.has(r.prediction_type)) {
        byType.set(r.prediction_type, r);
      }
    }

    const predictions: Prediction[] = [];
    for (const [, r] of byType) {
      predictions.push({
        type: r.prediction_type as PredictionType,
        probability: r.probability,
        confidence: r.confidence || 0,
        factors: (r.factors as Record<string, unknown>) || {},
        recommendedAction: r.recommended_action || '',
        recommendedTiming: r.recommended_timing || '',
      });
    }

    return formatPredictions(predictions);
  } catch {
    return '';
  }
}

function formatPredictions(predictions: Prediction[]): string {
  if (predictions.length === 0) return '';

  const parts: string[] = ['PREDICTIONS:'];

  for (const p of predictions) {
    const pct = Math.round(p.probability * 100);
    const label = p.type.replace(/_/g, ' ');

    // Build factor summary
    const factorSummary: string[] = [];
    const f = p.factors;
    if (f.denial_day != null) factorSummary.push(`denial day ${f.denial_day}`);
    if (f.day_of_week) factorSummary.push(f.day_of_week as string);
    if (f.gina_home === false) factorSummary.push('Gina away');
    if (f.arousal != null && (f.arousal as number) >= 3) factorSummary.push(`arousal ${f.arousal}`);
    if (f.declining_trend) factorSummary.push('declining tasks');
    if (f.sweet_spot_day) factorSummary.push('sweet spot day');
    if (f.feminine_ratio_rising) factorSummary.push('rising feminine language');
    if (f.recovery_zone === 'RED') factorSummary.push('RED recovery');
    if (f.last_conversation_hours != null && (f.last_conversation_hours as number) > 48) {
      factorSummary.push(`${f.last_conversation_hours}h since last conversation`);
    }

    const factorStr = factorSummary.length > 0 ? ` (${factorSummary.join(', ')})` : '';
    parts.push(`  ${label}: ${pct}%${factorStr}`);
    if (pct > 30) {
      parts.push(`    → ${p.recommendedAction}`);
    }
  }

  return parts.join('\n');
}
