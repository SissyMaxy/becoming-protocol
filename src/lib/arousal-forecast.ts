/**
 * Arousal Forecasting
 *
 * Predictive analytics for arousal state transitions, slip risk,
 * and optimal activity timing based on historical patterns.
 */

import { supabase } from './supabase';
import type {
  ArousalState,
  DbArousalStateEntry,
  DbOrgasmEntry,
} from '../types/arousal';

// ============================================
// TYPES
// ============================================

export interface ArousalForecast {
  userId: string;
  generatedAt: string;
  currentState: ArousalState;
  currentStreakDay: number;

  // State predictions
  predictions: StatePrediction[];

  // Risk analysis
  riskAnalysis: RiskAnalysis;

  // Optimal windows
  optimalWindows: OptimalWindow[];

  // Cycle predictions
  cycleForecast: CycleForecast;

  // Recommendations
  recommendations: ForecastRecommendation[];
}

export interface StatePrediction {
  day: number; // days from now
  date: string;
  predictedState: ArousalState;
  confidence: number; // 0-100
  alternativeState?: ArousalState;
  alternativeConfidence?: number;
  factors: string[];
}

export interface RiskAnalysis {
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  slipProbability: number; // 0-100
  riskFactors: RiskFactor[];
  peakRiskDay: number;
  safetyBuffer: number; // days until high risk
  historicalSlipDay: number | null;
}

export interface RiskFactor {
  factor: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  mitigation?: string;
}

export interface OptimalWindow {
  type: 'conditioning' | 'breakthrough' | 'commitment' | 'rest' | 'edge';
  startDay: number;
  endDay: number;
  quality: 'excellent' | 'good' | 'fair';
  reasoning: string;
  predictedState: ArousalState;
}

export interface CycleForecast {
  predictedCycleLength: number;
  daysUntilSweetSpot: number;
  daysUntilOverload: number;
  optimalReleaseWindow: { start: number; end: number } | null;
  nextPlateauDate: string | null;
  historicalAccuracy: number;
}

export interface ForecastRecommendation {
  priority: 'high' | 'medium' | 'low';
  type: 'warning' | 'opportunity' | 'guidance';
  title: string;
  description: string;
  actionableDay?: number;
}

// ============================================
// MAIN FORECAST FUNCTION
// ============================================

export async function generateArousalForecast(userId: string): Promise<ArousalForecast | null> {
  // Fetch historical data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [statesResult, orgasmsResult, streakResult, metricsResult] = await Promise.all([
    supabase
      .from('arousal_states')
      .select('*')
      .eq('user_id', userId)
      .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false }),

    supabase
      .from('orgasm_log')
      .select('*')
      .eq('user_id', userId)
      .gte('occurred_at', ninetyDaysAgo.toISOString())
      .order('occurred_at', { ascending: false }),

    supabase
      .from('denial_streaks')
      .select('started_at')
      .eq('user_id', userId)
      .is('ended_at', null)
      .limit(1),

    supabase
      .from('arousal_metrics')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const states = (statesResult.data || []) as DbArousalStateEntry[];
  const orgasms = (orgasmsResult.data || []) as DbOrgasmEntry[];
  const streakData = streakResult.data?.[0];
  const metrics = metricsResult.data;

  const currentState = (states[0]?.state || 'baseline') as ArousalState;
  const currentStreakDay = streakData
    ? Math.floor((Date.now() - new Date(streakData.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Generate forecast components
  const predictions = generateStatePredictions(states, currentState, currentStreakDay, metrics);
  const riskAnalysis = analyzeRisk(states, orgasms, currentStreakDay, metrics);
  const optimalWindows = identifyOptimalWindows(predictions, riskAnalysis, metrics);
  const cycleForecast = forecastCycle(states, orgasms, currentStreakDay, metrics);
  const recommendations = generateRecommendations(predictions, riskAnalysis, optimalWindows, cycleForecast);

  return {
    userId,
    generatedAt: new Date().toISOString(),
    currentState,
    currentStreakDay,
    predictions,
    riskAnalysis,
    optimalWindows,
    cycleForecast,
    recommendations,
  };
}

// ============================================
// STATE PREDICTIONS
// ============================================

function generateStatePredictions(
  states: DbArousalStateEntry[],
  currentState: ArousalState,
  currentDay: number,
  metrics: Record<string, unknown> | null
): StatePrediction[] {
  const predictions: StatePrediction[] = [];
  const now = new Date();

  // Get transition probabilities from historical data
  const transitions = calculateTransitionProbabilities(states);
  const avgSweetSpotEntry = (metrics?.average_sweet_spot_entry_day as number) || 3;
  const avgOverloadDay = (metrics?.average_overload_day as number) || 10;

  let predictedState = currentState;
  let daysSinceStateChange = calculateDaysSinceStateChange(states);

  for (let day = 1; day <= 14; day++) {
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + day);
    const futureDenialDay = currentDay + day;

    const prediction = predictStateForDay(
      predictedState,
      futureDenialDay,
      daysSinceStateChange + day,
      transitions,
      avgSweetSpotEntry,
      avgOverloadDay
    );

    predictions.push({
      day,
      date: futureDate.toISOString().split('T')[0],
      predictedState: prediction.state,
      confidence: prediction.confidence,
      alternativeState: prediction.alternative,
      alternativeConfidence: prediction.alternativeConfidence,
      factors: prediction.factors,
    });

    if (prediction.state !== predictedState) {
      daysSinceStateChange = 0;
    }
    predictedState = prediction.state;
  }

  return predictions;
}

function calculateTransitionProbabilities(states: DbArousalStateEntry[]): Map<string, Map<string, number>> {
  const transitions = new Map<string, Map<string, number>>();
  const counts = new Map<string, number>();

  for (let i = 1; i < states.length; i++) {
    const fromState = states[i].state;
    const toState = states[i - 1].state;

    if (!transitions.has(fromState)) {
      transitions.set(fromState, new Map());
    }
    const stateTransitions = transitions.get(fromState)!;
    stateTransitions.set(toState, (stateTransitions.get(toState) || 0) + 1);
    counts.set(fromState, (counts.get(fromState) || 0) + 1);
  }

  // Convert to probabilities
  for (const [fromState, stateTransitions] of transitions) {
    const total = counts.get(fromState) || 1;
    for (const [toState, count] of stateTransitions) {
      stateTransitions.set(toState, (count / total) * 100);
    }
  }

  return transitions;
}

function calculateDaysSinceStateChange(states: DbArousalStateEntry[]): number {
  if (states.length < 2) return 0;

  const currentState = states[0].state;
  let days = 1;

  for (let i = 1; i < states.length; i++) {
    if (states[i].state === currentState) {
      days++;
    } else {
      break;
    }
  }

  return days;
}

function predictStateForDay(
  currentState: ArousalState,
  denialDay: number,
  daysInState: number,
  transitions: Map<string, Map<string, number>>,
  avgSweetSpotEntry: number,
  avgOverloadDay: number
): { state: ArousalState; confidence: number; alternative?: ArousalState; alternativeConfidence?: number; factors: string[] } {
  const factors: string[] = [];
  let predictedState = currentState;
  let confidence = 70;

  // State-specific predictions
  switch (currentState) {
    case 'baseline':
    case 'recovery':
      if (denialDay >= avgSweetSpotEntry - 1) {
        predictedState = 'building';
        confidence = 75;
        factors.push(`Approaching sweet spot entry (avg day ${avgSweetSpotEntry})`);
      }
      break;

    case 'building':
      if (denialDay >= avgSweetSpotEntry) {
        predictedState = 'sweet_spot';
        confidence = 80;
        factors.push(`Entering sweet spot zone`);
      }
      break;

    case 'sweet_spot':
      if (denialDay >= avgOverloadDay - 1) {
        predictedState = 'overload';
        confidence = 70;
        factors.push(`Approaching overload threshold (avg day ${avgOverloadDay})`);
      } else if (daysInState > 5) {
        // May slip back or overload
        confidence = 60;
        factors.push(`Extended sweet spot - variable outcome`);
      }
      break;

    case 'overload':
      if (daysInState >= 2) {
        // High chance of release or cooldown
        confidence = 50;
        factors.push(`Overload state is unstable`);
      }
      break;

    case 'post_release':
      if (daysInState >= 1) {
        predictedState = 'recovery';
        confidence = 85;
        factors.push(`Transitioning to recovery`);
      }
      break;
  }

  // Apply transition probability adjustments
  const stateTransitions = transitions.get(currentState);
  if (stateTransitions) {
    const historicalProb = stateTransitions.get(predictedState) || 0;
    if (historicalProb > 0) {
      confidence = Math.round((confidence + historicalProb) / 2);
      factors.push(`Historical pattern: ${Math.round(historicalProb)}% likelihood`);
    }
  }

  // Find alternative prediction
  let alternative: ArousalState | undefined;
  let alternativeConfidence: number | undefined;

  if (stateTransitions) {
    for (const [state, prob] of stateTransitions) {
      if (state !== predictedState && prob > 20) {
        alternative = state as ArousalState;
        alternativeConfidence = Math.round(prob);
        break;
      }
    }
  }

  return { state: predictedState, confidence, alternative, alternativeConfidence, factors };
}

// ============================================
// RISK ANALYSIS
// ============================================

function analyzeRisk(
  states: DbArousalStateEntry[],
  orgasms: DbOrgasmEntry[],
  currentDay: number,
  metrics: Record<string, unknown> | null
): RiskAnalysis {
  const riskFactors: RiskFactor[] = [];
  let slipProbability = 20; // Base probability

  // Historical slip analysis
  const accidentOrgasms = orgasms.filter(o => o.release_type === 'accident');
  const slipDays = accidentOrgasms.map(o => o.days_since_last || 0).filter(d => d > 0);
  const historicalSlipDay = slipDays.length > 0
    ? Math.round(slipDays.reduce((a, b) => a + b, 0) / slipDays.length)
    : null;

  // Day-based risk
  const avgOverloadDay = (metrics?.average_overload_day as number) || 10;

  if (currentDay >= avgOverloadDay) {
    slipProbability += 30;
    riskFactors.push({
      factor: 'Extended denial',
      impact: 'high',
      description: `Day ${currentDay} exceeds typical overload threshold (day ${avgOverloadDay})`,
      mitigation: 'Consider planned release or intensive cooldown routine',
    });
  } else if (currentDay >= avgOverloadDay - 2) {
    slipProbability += 15;
    riskFactors.push({
      factor: 'Approaching threshold',
      impact: 'medium',
      description: `Nearing historical overload point`,
      mitigation: 'Increase mindfulness, reduce stimulation',
    });
  }

  // Historical slip pattern
  if (historicalSlipDay && currentDay >= historicalSlipDay - 1) {
    slipProbability += 20;
    riskFactors.push({
      factor: 'Historical slip pattern',
      impact: 'high',
      description: `Slips historically occur around day ${historicalSlipDay}`,
      mitigation: 'Extra vigilance, use anchors, avoid triggers',
    });
  }

  // Recent state volatility
  const recentStates = states.slice(0, 7);
  const uniqueStates = new Set(recentStates.map(s => s.state)).size;
  if (uniqueStates >= 4) {
    slipProbability += 10;
    riskFactors.push({
      factor: 'State volatility',
      impact: 'medium',
      description: 'Arousal state has been unstable',
      mitigation: 'Focus on stabilization routines',
    });
  }

  // Current state risk
  const currentState = states[0]?.state;
  if (currentState === 'overload') {
    slipProbability += 25;
    riskFactors.push({
      factor: 'Overload state',
      impact: 'high',
      description: 'Currently in high-risk overload state',
      mitigation: 'Immediate decision: planned release or cooldown',
    });
  } else if (currentState === 'sweet_spot' && currentDay > 7) {
    slipProbability += 10;
    riskFactors.push({
      factor: 'Extended sweet spot',
      impact: 'medium',
      description: 'Prolonged sweet spot can lead to overload',
    });
  }

  // Cap probability
  slipProbability = Math.min(95, slipProbability);

  // Determine overall risk level
  let overallRisk: RiskAnalysis['overallRisk'];
  if (slipProbability >= 70) overallRisk = 'critical';
  else if (slipProbability >= 50) overallRisk = 'high';
  else if (slipProbability >= 30) overallRisk = 'moderate';
  else overallRisk = 'low';

  // Calculate peak risk day
  const peakRiskDay = Math.max(0, (avgOverloadDay - currentDay) || 3);

  // Safety buffer
  const safetyBuffer = Math.max(0, (avgOverloadDay - 2) - currentDay);

  return {
    overallRisk,
    slipProbability,
    riskFactors,
    peakRiskDay,
    safetyBuffer,
    historicalSlipDay,
  };
}

// ============================================
// OPTIMAL WINDOWS
// ============================================

function identifyOptimalWindows(
  predictions: StatePrediction[],
  riskAnalysis: RiskAnalysis,
  _metrics: Record<string, unknown> | null
): OptimalWindow[] {
  const windows: OptimalWindow[] = [];

  // Find sweet spot windows
  const sweetSpotDays = predictions.filter(p => p.predictedState === 'sweet_spot');
  if (sweetSpotDays.length > 0) {
    const startDay = sweetSpotDays[0].day;
    const endDay = sweetSpotDays[sweetSpotDays.length - 1].day;
    const avgConfidence = sweetSpotDays.reduce((sum, p) => sum + p.confidence, 0) / sweetSpotDays.length;

    windows.push({
      type: 'conditioning',
      startDay,
      endDay,
      quality: avgConfidence >= 75 ? 'excellent' : avgConfidence >= 60 ? 'good' : 'fair',
      reasoning: 'Peak receptivity for conditioning and identity work',
      predictedState: 'sweet_spot',
    });

    windows.push({
      type: 'commitment',
      startDay,
      endDay,
      quality: avgConfidence >= 70 ? 'excellent' : 'good',
      reasoning: 'High arousal increases commitment acceptance',
      predictedState: 'sweet_spot',
    });
  }

  // Find breakthrough opportunity
  const buildingDays = predictions.filter(p => p.predictedState === 'building');
  if (buildingDays.length >= 2) {
    windows.push({
      type: 'breakthrough',
      startDay: buildingDays[0].day,
      endDay: buildingDays[buildingDays.length - 1].day,
      quality: 'good',
      reasoning: 'Building state is good for pushing boundaries',
      predictedState: 'building',
    });
  }

  // Find edge practice windows
  const safeEdgeDays = predictions.filter(p =>
    (p.predictedState === 'building' || p.predictedState === 'sweet_spot') &&
    p.day <= riskAnalysis.safetyBuffer + 2
  );
  if (safeEdgeDays.length > 0) {
    windows.push({
      type: 'edge',
      startDay: safeEdgeDays[0].day,
      endDay: safeEdgeDays[safeEdgeDays.length - 1].day,
      quality: riskAnalysis.overallRisk === 'low' ? 'excellent' : 'good',
      reasoning: 'Safe window for edge practice before risk increases',
      predictedState: safeEdgeDays[0].predictedState,
    });
  }

  // Find rest windows
  const recoveryDays = predictions.filter(p => p.predictedState === 'recovery' || p.predictedState === 'post_release');
  if (recoveryDays.length > 0) {
    windows.push({
      type: 'rest',
      startDay: recoveryDays[0].day,
      endDay: recoveryDays[recoveryDays.length - 1].day,
      quality: 'good',
      reasoning: 'Recovery period - light practice only',
      predictedState: recoveryDays[0].predictedState,
    });
  }

  return windows.sort((a, b) => a.startDay - b.startDay);
}

// ============================================
// CYCLE FORECAST
// ============================================

function forecastCycle(
  _states: DbArousalStateEntry[],
  orgasms: DbOrgasmEntry[],
  currentDay: number,
  metrics: Record<string, unknown> | null
): CycleForecast {
  const avgCycleLength = (metrics?.average_cycle_length as number) || 7;
  const avgSweetSpotEntry = (metrics?.average_sweet_spot_entry_day as number) || 3;
  const avgOverloadDay = (metrics?.average_overload_day as number) || 10;

  const daysUntilSweetSpot = Math.max(0, avgSweetSpotEntry - currentDay);
  const daysUntilOverload = Math.max(0, avgOverloadDay - currentDay);

  // Optimal release window (if applicable)
  let optimalReleaseWindow: { start: number; end: number } | null = null;
  if (currentDay >= avgOverloadDay - 2) {
    optimalReleaseWindow = {
      start: 0,
      end: 3,
    };
  } else if (avgCycleLength <= currentDay + 7) {
    optimalReleaseWindow = {
      start: Math.max(0, avgCycleLength - currentDay - 1),
      end: avgCycleLength - currentDay + 2,
    };
  }

  // Calculate historical accuracy
  const recentCycles = calculateRecentCycles(orgasms);
  const historicalAccuracy = recentCycles.length >= 3
    ? calculateForecastAccuracy(recentCycles, avgCycleLength)
    : 50;

  // Next plateau date
  const now = new Date();
  const plateauDate = new Date(now);
  plateauDate.setDate(plateauDate.getDate() + daysUntilOverload);

  return {
    predictedCycleLength: avgCycleLength,
    daysUntilSweetSpot,
    daysUntilOverload,
    optimalReleaseWindow,
    nextPlateauDate: plateauDate.toISOString().split('T')[0],
    historicalAccuracy,
  };
}

function calculateRecentCycles(orgasms: DbOrgasmEntry[]): number[] {
  const resetOrgasms = orgasms.filter(o =>
    ['full', 'ruined', 'accident', 'wet_dream'].includes(o.release_type)
  );

  const cycles: number[] = [];
  for (let i = 1; i < resetOrgasms.length && cycles.length < 5; i++) {
    const daysDiff = Math.floor(
      (new Date(resetOrgasms[i - 1].occurred_at).getTime() -
        new Date(resetOrgasms[i].occurred_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 0 && daysDiff < 60) {
      cycles.push(daysDiff);
    }
  }

  return cycles;
}

function calculateForecastAccuracy(cycles: number[], predicted: number): number {
  if (cycles.length === 0) return 50;

  const errors = cycles.map(c => Math.abs(c - predicted) / predicted);
  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

  return Math.round(Math.max(0, 100 - avgError * 100));
}

// ============================================
// RECOMMENDATIONS
// ============================================

function generateRecommendations(
  _predictions: StatePrediction[],
  riskAnalysis: RiskAnalysis,
  optimalWindows: OptimalWindow[],
  cycleForecast: CycleForecast
): ForecastRecommendation[] {
  const recommendations: ForecastRecommendation[] = [];

  // Risk-based warnings
  if (riskAnalysis.overallRisk === 'critical') {
    recommendations.push({
      priority: 'high',
      type: 'warning',
      title: 'Critical Slip Risk',
      description: `${riskAnalysis.slipProbability}% slip probability. Decision point: planned release or intensive cooldown.`,
      actionableDay: 0,
    });
  } else if (riskAnalysis.overallRisk === 'high') {
    recommendations.push({
      priority: 'high',
      type: 'warning',
      title: 'High Risk Period Approaching',
      description: `Risk increases significantly in ${riskAnalysis.peakRiskDay} days. Plan accordingly.`,
      actionableDay: riskAnalysis.peakRiskDay,
    });
  }

  // Optimal window opportunities
  const conditioningWindow = optimalWindows.find(w => w.type === 'conditioning');
  if (conditioningWindow && conditioningWindow.quality === 'excellent') {
    recommendations.push({
      priority: 'medium',
      type: 'opportunity',
      title: 'Prime Conditioning Window',
      description: `Days ${conditioningWindow.startDay}-${conditioningWindow.endDay} optimal for deep conditioning work.`,
      actionableDay: conditioningWindow.startDay,
    });
  }

  const commitmentWindow = optimalWindows.find(w => w.type === 'commitment');
  if (commitmentWindow) {
    recommendations.push({
      priority: 'medium',
      type: 'opportunity',
      title: 'Commitment Opportunity',
      description: `High arousal period ideal for making binding commitments.`,
      actionableDay: commitmentWindow.startDay,
    });
  }

  // Cycle guidance
  if (cycleForecast.daysUntilSweetSpot > 0 && cycleForecast.daysUntilSweetSpot <= 3) {
    recommendations.push({
      priority: 'low',
      type: 'guidance',
      title: 'Sweet Spot Approaching',
      description: `Entering peak receptivity in ${cycleForecast.daysUntilSweetSpot} days. Prepare conditioning materials.`,
      actionableDay: cycleForecast.daysUntilSweetSpot,
    });
  }

  if (cycleForecast.optimalReleaseWindow && riskAnalysis.overallRisk !== 'critical') {
    recommendations.push({
      priority: 'low',
      type: 'guidance',
      title: 'Optimal Release Window',
      description: `If planning release, days ${cycleForecast.optimalReleaseWindow.start}-${cycleForecast.optimalReleaseWindow.end} align with historical patterns.`,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations.slice(0, 5);
}

// ============================================
// QUICK FORECAST
// ============================================

/**
 * Get a quick forecast summary without full analysis
 */
export async function getQuickForecast(userId: string): Promise<{
  currentState: ArousalState;
  currentDay: number;
  riskLevel: RiskAnalysis['overallRisk'];
  daysUntilSweetSpot: number;
  daysUntilRisk: number;
  topRecommendation: string | null;
} | null> {
  const forecast = await generateArousalForecast(userId);
  if (!forecast) return null;

  return {
    currentState: forecast.currentState,
    currentDay: forecast.currentStreakDay,
    riskLevel: forecast.riskAnalysis.overallRisk,
    daysUntilSweetSpot: forecast.cycleForecast.daysUntilSweetSpot,
    daysUntilRisk: forecast.riskAnalysis.safetyBuffer,
    topRecommendation: forecast.recommendations[0]?.title || null,
  };
}
