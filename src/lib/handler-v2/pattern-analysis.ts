/**
 * Failure Mode Pattern Analysis
 *
 * Implements monthly effectiveness reporting:
 * - Tracks failure mode frequency and resolution
 * - Identifies patterns and correlations
 * - Generates actionable insights
 */

import { supabase } from '../supabase';
import type { FailureMode } from './types';

// ============================================
// TYPES
// ============================================

export interface FailureModeStats {
  failureMode: FailureMode;
  count: number;
  averageResolutionHours: number;
  averageEffectivenessScore: number;
  trend: 'improving' | 'stable' | 'worsening';
  mostEffectiveIntervention: string | null;
}

export interface MonthlyReport {
  userId: string;
  reportMonth: string; // YYYY-MM
  generatedAt: Date;

  // Summary stats
  totalEvents: number;
  mostCommonMode: FailureMode | null;
  averageResolutionHours: number;
  daysWithoutFailure: number;

  // Per-mode breakdown
  modeStats: FailureModeStats[];

  // Correlations
  correlations: {
    trigger: string;
    correlatedMode: FailureMode;
    frequency: number;
  }[];

  // Insights
  insights: string[];

  // Safety flags
  safetyFlags: {
    depressionIncreasing: boolean;
    crisisIncreasing: boolean;
    prolongedCollapse: boolean;
  };

  // Recommendations
  recommendations: string[];
}

// ============================================
// DATA GATHERING
// ============================================

async function getFailureModeEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  id: string;
  failureMode: FailureMode;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolutionHours: number | null;
  effectivenessScore: number | null;
  interventionType: string;
  detectionSignals: Record<string, unknown>;
}[]> {
  const { data } = await supabase
    .from('failure_mode_events')
    .select('*')
    .eq('user_id', userId)
    .gte('detected_at', startDate.toISOString())
    .lte('detected_at', endDate.toISOString())
    .order('detected_at', { ascending: true });

  return (data || []).map(row => ({
    id: row.id,
    failureMode: row.failure_mode as FailureMode,
    detectedAt: new Date(row.detected_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    resolutionHours: row.resolved_at
      ? (new Date(row.resolved_at).getTime() - new Date(row.detected_at).getTime()) / (1000 * 60 * 60)
      : null,
    effectivenessScore: row.effectiveness_score,
    interventionType: row.intervention_type,
    detectionSignals: row.detection_signals || {},
  }));
}

// ============================================
// ANALYSIS
// ============================================

function analyzeModeTrend(
  currentPeriodEvents: { failureMode: FailureMode }[],
  previousPeriodEvents: { failureMode: FailureMode }[],
  mode: FailureMode
): 'improving' | 'stable' | 'worsening' {
  const currentCount = currentPeriodEvents.filter(e => e.failureMode === mode).length;
  const previousCount = previousPeriodEvents.filter(e => e.failureMode === mode).length;

  if (previousCount === 0 && currentCount === 0) return 'stable';
  if (previousCount === 0) return 'worsening';
  if (currentCount === 0) return 'improving';

  const change = (currentCount - previousCount) / previousCount;

  if (change <= -0.2) return 'improving';
  if (change >= 0.2) return 'worsening';
  return 'stable';
}

function findMostEffectiveIntervention(
  events: { failureMode: FailureMode; interventionType: string; effectivenessScore: number | null }[],
  mode: FailureMode
): string | null {
  const modeEvents = events.filter(e => e.failureMode === mode && e.effectivenessScore !== null);

  if (modeEvents.length === 0) return null;

  const interventionScores: Record<string, { sum: number; count: number }> = {};

  for (const event of modeEvents) {
    if (!interventionScores[event.interventionType]) {
      interventionScores[event.interventionType] = { sum: 0, count: 0 };
    }
    interventionScores[event.interventionType].sum += event.effectivenessScore!;
    interventionScores[event.interventionType].count += 1;
  }

  let bestIntervention: string | null = null;
  let bestAvg = 0;

  for (const [intervention, data] of Object.entries(interventionScores)) {
    const avg = data.sum / data.count;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestIntervention = intervention;
    }
  }

  return bestIntervention;
}

function detectCorrelations(
  events: { failureMode: FailureMode; detectionSignals: Record<string, unknown> }[]
): { trigger: string; correlatedMode: FailureMode; frequency: number }[] {
  const correlations: { trigger: string; correlatedMode: FailureMode; frequency: number }[] = [];

  // Common triggers to look for
  const triggers = [
    'post_release',
    'weekend',
    'work_stress',
    'low_sleep',
    'social_event',
    'streak_milestone',
    'gina_home',
  ];

  for (const trigger of triggers) {
    const modeCount: Record<string, number> = {};

    for (const event of events) {
      const signals = event.detectionSignals;

      // Check if this trigger appears in signals
      const hasTrigger = Object.keys(signals).some(key =>
        key.toLowerCase().includes(trigger) ||
        String(signals[key]).toLowerCase().includes(trigger)
      );

      if (hasTrigger) {
        if (!modeCount[event.failureMode]) {
          modeCount[event.failureMode] = 0;
        }
        modeCount[event.failureMode]++;
      }
    }

    // Add correlations where frequency is significant
    for (const [mode, count] of Object.entries(modeCount)) {
      if (count >= 2) {
        correlations.push({
          trigger,
          correlatedMode: mode as FailureMode,
          frequency: count,
        });
      }
    }
  }

  // Sort by frequency
  return correlations.sort((a, b) => b.frequency - a.frequency);
}

function generateInsights(
  stats: FailureModeStats[],
  correlations: { trigger: string; correlatedMode: FailureMode; frequency: number }[]
): string[] {
  const insights: string[] = [];

  // Most common failure mode
  const sorted = [...stats].sort((a, b) => b.count - a.count);
  if (sorted.length > 0 && sorted[0].count >= 2) {
    insights.push(`Most frequent challenge: ${formatFailureMode(sorted[0].failureMode)} (${sorted[0].count} times)`);
  }

  // Improving modes
  const improving = stats.filter(s => s.trend === 'improving');
  if (improving.length > 0) {
    insights.push(`Getting better at handling: ${improving.map(s => formatFailureMode(s.failureMode)).join(', ')}`);
  }

  // Worsening modes
  const worsening = stats.filter(s => s.trend === 'worsening');
  if (worsening.length > 0) {
    insights.push(`Needs attention: ${worsening.map(s => formatFailureMode(s.failureMode)).join(', ')}`);
  }

  // Top correlation
  if (correlations.length > 0) {
    const top = correlations[0];
    insights.push(`Pattern detected: ${top.trigger} often leads to ${formatFailureMode(top.correlatedMode)}`);
  }

  // Resolution time insights
  const slowResolution = stats.filter(s => s.averageResolutionHours > 24);
  if (slowResolution.length > 0) {
    insights.push(`Taking longer to recover from: ${slowResolution.map(s => formatFailureMode(s.failureMode)).join(', ')}`);
  }

  return insights;
}

function generateRecommendations(
  stats: FailureModeStats[],
  correlations: { trigger: string; correlatedMode: FailureMode; frequency: number }[],
  safetyFlags: { depressionIncreasing: boolean; crisisIncreasing: boolean; prolongedCollapse: boolean }
): string[] {
  const recommendations: string[] = [];

  // Safety-first recommendations
  if (safetyFlags.depressionIncreasing) {
    recommendations.push('PRIORITY: Depression frequency is increasing. Consider discussing this pattern with a therapist.');
  }

  if (safetyFlags.crisisIncreasing) {
    recommendations.push('PRIORITY: Identity crises becoming more frequent. The crisis kit may need updating with fresh content.');
  }

  if (safetyFlags.prolongedCollapse) {
    recommendations.push('PRIORITY: Recent collapse lasted longer than usual. May need to adjust recovery protocols.');
  }

  // Pattern-based recommendations
  for (const correlation of correlations.slice(0, 2)) {
    switch (correlation.trigger) {
      case 'post_release':
        recommendations.push('Time capsules may need refreshing - post-release crashes are common.');
        break;
      case 'weekend':
        recommendations.push('Weekend mode may need strengthening - engagement dropping on weekends.');
        break;
      case 'work_stress':
        recommendations.push('Consider reducing protocol intensity during work stress periods.');
        break;
    }
  }

  // Mode-specific recommendations
  for (const stat of stats) {
    if (stat.trend === 'worsening' && stat.count >= 3) {
      switch (stat.failureMode) {
        case 'voice_avoidance':
          recommendations.push('Voice avoidance increasing - try pairing with rewards more consistently.');
          break;
        case 'build_not_do':
          recommendations.push('Builder mode trap recurring - enforce practice-before-building rule.');
          break;
        case 'everything_at_once':
          recommendations.push('Binge-crash pattern emerging - stricter daily caps recommended.');
          break;
      }
    }
  }

  return recommendations;
}

function formatFailureMode(mode: FailureMode): string {
  const names: Record<string, string> = {
    post_release_crash: 'Post-Release Crash',
    build_not_do: 'Builder Mode',
    depression_collapse: 'Depression',
    voice_avoidance: 'Voice Avoidance',
    everything_at_once: 'Burnout Risk',
    weekend_regression: 'Weekend Regression',
    streak_catastrophize: 'Streak Break',
    work_stress: 'Work Stress',
    identity_crisis: 'Identity Crisis',
  };
  return names[mode] || mode;
}

// ============================================
// MAIN REPORT GENERATION
// ============================================

export async function generateMonthlyReport(
  userId: string,
  month?: string // YYYY-MM format, defaults to current month
): Promise<MonthlyReport> {
  const reportMonth = month || new Date().toISOString().slice(0, 7);
  const [year, monthNum] = reportMonth.split('-').map(Number);

  // Current period
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59);

  // Previous period for comparison
  const prevStartDate = new Date(year, monthNum - 2, 1);
  const prevEndDate = new Date(year, monthNum - 1, 0, 23, 59, 59);

  // Get events
  const currentEvents = await getFailureModeEvents(userId, startDate, endDate);
  const previousEvents = await getFailureModeEvents(userId, prevStartDate, prevEndDate);

  // Calculate days without failure
  const daysInMonth = endDate.getDate();
  const daysWithEvents = new Set(
    currentEvents.map(e => e.detectedAt.toISOString().split('T')[0])
  ).size;
  const daysWithoutFailure = daysInMonth - daysWithEvents;

  // Build per-mode stats
  const allModes: FailureMode[] = [
    'post_release_crash',
    'build_not_do',
    'depression_collapse',
    'voice_avoidance',
    'everything_at_once',
    'weekend_regression',
    'streak_catastrophize',
    'work_stress',
    'identity_crisis',
  ];

  const modeStats: FailureModeStats[] = [];

  for (const mode of allModes) {
    const modeEvents = currentEvents.filter(e => e.failureMode === mode);

    if (modeEvents.length === 0) continue;

    const resolved = modeEvents.filter(e => e.resolutionHours !== null);
    const rated = modeEvents.filter(e => e.effectivenessScore !== null);

    modeStats.push({
      failureMode: mode,
      count: modeEvents.length,
      averageResolutionHours: resolved.length > 0
        ? resolved.reduce((sum, e) => sum + e.resolutionHours!, 0) / resolved.length
        : 0,
      averageEffectivenessScore: rated.length > 0
        ? rated.reduce((sum, e) => sum + e.effectivenessScore!, 0) / rated.length
        : 0,
      trend: analyzeModeTrend(currentEvents, previousEvents, mode),
      mostEffectiveIntervention: findMostEffectiveIntervention(currentEvents, mode),
    });
  }

  // Find correlations
  const correlations = detectCorrelations(currentEvents);

  // Safety flags
  const depressionStats = modeStats.find(s => s.failureMode === 'depression_collapse');
  const crisisStats = modeStats.find(s => s.failureMode === 'identity_crisis');

  const safetyFlags = {
    depressionIncreasing: depressionStats?.trend === 'worsening' || false,
    crisisIncreasing: crisisStats?.trend === 'worsening' || false,
    prolongedCollapse: (depressionStats?.averageResolutionHours || 0) > 72,
  };

  // Generate insights and recommendations
  const insights = generateInsights(modeStats, correlations);
  const recommendations = generateRecommendations(modeStats, correlations, safetyFlags);

  // Find most common mode
  const mostCommonMode = modeStats.length > 0
    ? modeStats.sort((a, b) => b.count - a.count)[0].failureMode
    : null;

  const report: MonthlyReport = {
    userId,
    reportMonth,
    generatedAt: new Date(),
    totalEvents: currentEvents.length,
    mostCommonMode,
    averageResolutionHours: currentEvents.filter(e => e.resolutionHours !== null).length > 0
      ? currentEvents
          .filter(e => e.resolutionHours !== null)
          .reduce((sum, e) => sum + e.resolutionHours!, 0) / currentEvents.filter(e => e.resolutionHours !== null).length
      : 0,
    daysWithoutFailure,
    modeStats,
    correlations,
    insights,
    safetyFlags,
    recommendations,
  };

  // Save report
  await saveMonthlyReport(userId, report);

  return report;
}

async function saveMonthlyReport(userId: string, report: MonthlyReport): Promise<void> {
  await supabase.from('failure_mode_reports').upsert({
    user_id: userId,
    report_month: report.reportMonth,
    generated_at: report.generatedAt.toISOString(),
    total_events: report.totalEvents,
    most_common_mode: report.mostCommonMode,
    average_resolution_hours: report.averageResolutionHours,
    days_without_failure: report.daysWithoutFailure,
    mode_stats: report.modeStats,
    correlations: report.correlations,
    insights: report.insights,
    safety_flags: report.safetyFlags,
    recommendations: report.recommendations,
  }, { onConflict: 'user_id,report_month' });
}

// ============================================
// CROSS-MODE ANALYSIS
// ============================================

export async function getFailureModeHistory(
  userId: string,
  months: number = 6
): Promise<{ month: string; stats: FailureModeStats[] }[]> {
  const history: { month: string; stats: FailureModeStats[] }[] = [];

  for (let i = 0; i < months; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const month = date.toISOString().slice(0, 7);

    const { data } = await supabase
      .from('failure_mode_reports')
      .select('mode_stats')
      .eq('user_id', userId)
      .eq('report_month', month)
      .single();

    if (data?.mode_stats) {
      history.push({
        month,
        stats: data.mode_stats as FailureModeStats[],
      });
    }
  }

  return history;
}

export async function getOverallHealthScore(userId: string): Promise<{
  score: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  factors: { factor: string; impact: 'positive' | 'negative' | 'neutral' }[];
}> {
  const history = await getFailureModeHistory(userId, 3);

  if (history.length < 2) {
    return {
      score: 50,
      trend: 'stable',
      factors: [{ factor: 'Insufficient data', impact: 'neutral' }],
    };
  }

  const recent = history[0]?.stats || [];
  const older = history[1]?.stats || [];

  // Calculate score based on:
  // - Total failure events (fewer = better)
  // - Resolution time (faster = better)
  // - Trend direction (improving = better)

  let score = 70; // Start at baseline
  const factors: { factor: string; impact: 'positive' | 'negative' | 'neutral' }[] = [];

  // Adjust for total events
  const recentTotal = recent.reduce((sum, s) => sum + s.count, 0);
  const olderTotal = older.reduce((sum, s) => sum + s.count, 0);

  if (recentTotal < olderTotal) {
    score += 10;
    factors.push({ factor: 'Fewer failure events', impact: 'positive' });
  } else if (recentTotal > olderTotal) {
    score -= 10;
    factors.push({ factor: 'More failure events', impact: 'negative' });
  }

  // Adjust for resolution time
  const recentAvgResolution = recent.length > 0
    ? recent.reduce((sum, s) => sum + s.averageResolutionHours, 0) / recent.length
    : 0;

  if (recentAvgResolution < 12) {
    score += 10;
    factors.push({ factor: 'Quick recovery times', impact: 'positive' });
  } else if (recentAvgResolution > 48) {
    score -= 15;
    factors.push({ factor: 'Slow recovery times', impact: 'negative' });
  }

  // Adjust for improving modes
  const improvingCount = recent.filter(s => s.trend === 'improving').length;
  const worseningCount = recent.filter(s => s.trend === 'worsening').length;

  score += improvingCount * 5;
  score -= worseningCount * 5;

  if (improvingCount > worseningCount) {
    factors.push({ factor: 'Multiple areas improving', impact: 'positive' });
  } else if (worseningCount > improvingCount) {
    factors.push({ factor: 'Multiple areas declining', impact: 'negative' });
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentTotal < olderTotal && improvingCount > worseningCount) {
    trend = 'improving';
  } else if (recentTotal > olderTotal && worseningCount > improvingCount) {
    trend = 'declining';
  }

  return { score, trend, factors };
}
