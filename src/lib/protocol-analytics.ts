/**
 * Protocol Analytics — "Is the protocol working?"
 *
 * Queries Supabase for real usage data across three dimensions:
 * 1. Activity & consistency (showing up)
 * 2. Behavioral change (domain progress, mood, goals)
 * 3. Transformation signals (feminization metrics)
 */

import { supabase } from './supabase';
import {
  getStreakData,
  getDomainLevels,
  getCommitmentStatus,
  getSessionStats,
  type StreakData,
  type DomainLevel,
  type CommitmentStatus,
  type SessionStats,
} from './dashboard-analytics';

// ============================================
// TYPES
// ============================================

export interface ActivityMetrics {
  streak: StreakData;
  activeDays7: number;
  activeDays14: number;
  activeDays30: number;
  tasksThisWeek: number;
  tasksLastWeek: number;
  taskCompletionRate: number; // 0-100
  gateComplianceRate: number; // 0-100
  gateCompletionsLast7: number;
  gateExpectedLast7: number;
}

export interface BehaviorMetrics {
  domains: DomainLevel[];
  domainTaskCounts: Record<string, number>; // last 30d
  moodAvg30: number | null;
  moodAvgPrior30: number | null;
  femAlignAvg30: number | null;
  femAlignAvgPrior30: number | null;
  goalsActive: number;
  goalsGraduated: number;
  goalsAbandoned: number;
  goalAvgConsecutiveDays: number;
  commitments: CommitmentStatus;
}

export interface TransformationMetrics {
  femStateAvg7: number | null;
  femStateAvg14: number | null;
  femStateAvg30: number | null;
  pronounRatio: number | null; // feminine / (feminine + masculine)
  pronounTrend: 'up' | 'down' | 'stable' | null;
  patternsActive: number;
  patternsImproving: number;
  patternsResolved: number;
  conditioningEstablished: number;
  conditioningInProgress: number;
  avgAutomaticity: number | null;
  serviceStage: string | null;
  ginaStage: string | null;
  denialCurrentDay: number;
  denialTotalDays: number;
  escalationEventsLast30: number;
  sessions: SessionStats;
}

export interface ProtocolAnalyticsData {
  activity: ActivityMetrics;
  behavior: BehaviorMetrics;
  transformation: TransformationMetrics;
}

// ============================================
// HELPER: date N days ago as YYYY-MM-DD
// ============================================

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ============================================
// SECTION 1: ACTIVITY & CONSISTENCY
// ============================================

async function loadActivityMetrics(userId: string): Promise<ActivityMetrics> {
  const [streak, entries30, tasksWeek, tasksLastWeek, dailyTaskStats, gateStats] =
    await Promise.all([
      getStreakData(userId),
      // Active days: count daily_entries rows
      supabase
        .from('daily_entries')
        .select('date')
        .eq('user_id', userId)
        .gte('date', daysAgo(30)),
      // Tasks completed this week
      supabase
        .from('task_completions')
        .select('id')
        .eq('user_id', userId)
        .gte('completed_at', daysAgo(7)),
      // Tasks completed last week
      supabase
        .from('task_completions')
        .select('id')
        .eq('user_id', userId)
        .gte('completed_at', daysAgo(14))
        .lt('completed_at', daysAgo(7)),
      // Task completion rate: completed / total assigned last 14d
      supabase
        .from('daily_tasks')
        .select('status')
        .eq('user_id', userId)
        .gte('assigned_date', daysAgo(14)),
      // Gate compliance: compulsory completions last 7d
      supabase
        .from('compulsory_completions')
        .select('date')
        .eq('user_id', userId)
        .gte('date', daysAgo(7)),
    ]);

  const entryDates = (entries30.data || []).map(r => r.date);
  const uniqueDates = new Set(entryDates);

  // Count active days in windows
  const now = new Date();
  let active7 = 0, active14 = 0, active30 = 0;
  for (const dateStr of uniqueDates) {
    const diff = Math.floor((now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 7) active7++;
    if (diff <= 14) active14++;
    if (diff <= 30) active30++;
  }

  // Task completion rate
  const allTasks = dailyTaskStats.data || [];
  const completedTasks = allTasks.filter(t => t.status === 'completed').length;
  const taskCompletionRate = allTasks.length > 0
    ? Math.round((completedTasks / allTasks.length) * 100)
    : 0;

  // Gate compliance: 2 blocking elements per day (morning_checkin + physical_state_log)
  const gateCompletionsLast7 = (gateStats.data || []).length;
  const gateExpectedLast7 = 7 * 2; // 2 blocking elements per day
  const gateComplianceRate = gateExpectedLast7 > 0
    ? Math.round((gateCompletionsLast7 / gateExpectedLast7) * 100)
    : 0;

  return {
    streak,
    activeDays7: active7,
    activeDays14: active14,
    activeDays30: active30,
    tasksThisWeek: (tasksWeek.data || []).length,
    tasksLastWeek: (tasksLastWeek.data || []).length,
    taskCompletionRate,
    gateComplianceRate: Math.min(gateComplianceRate, 100),
    gateCompletionsLast7,
    gateExpectedLast7,
  };
}

// ============================================
// SECTION 2: BEHAVIORAL CHANGE
// ============================================

async function loadBehaviorMetrics(userId: string): Promise<BehaviorMetrics> {
  const [domains, tasksByDomain, mood30, moodPrior30, femAlign30, femAlignPrior30, goals, commitments] =
    await Promise.all([
      getDomainLevels(userId),
      // Tasks per domain last 30d
      supabase
        .from('task_completions')
        .select('task_id, task_bank!inner(domain)')
        .eq('user_id', userId)
        .gte('completed_at', daysAgo(30)),
      // Mood last 30d
      supabase
        .from('mood_checkins')
        .select('score')
        .eq('user_id', userId)
        .gte('recorded_at', daysAgo(30)),
      // Mood prior 30d (30-60d ago)
      supabase
        .from('mood_checkins')
        .select('score')
        .eq('user_id', userId)
        .gte('recorded_at', daysAgo(60))
        .lt('recorded_at', daysAgo(30)),
      // Feminine alignment last 30d
      supabase
        .from('mood_checkins')
        .select('feminine_alignment')
        .eq('user_id', userId)
        .gte('recorded_at', daysAgo(30))
        .not('feminine_alignment', 'is', null),
      // Feminine alignment prior 30d
      supabase
        .from('mood_checkins')
        .select('feminine_alignment')
        .eq('user_id', userId)
        .gte('recorded_at', daysAgo(60))
        .lt('recorded_at', daysAgo(30))
        .not('feminine_alignment', 'is', null),
      // Goals
      supabase
        .from('goals')
        .select('status, consecutive_days')
        .eq('user_id', userId),
      getCommitmentStatus(userId),
    ]);

  // Domain task counts
  const domainTaskCounts: Record<string, number> = {};
  for (const row of (tasksByDomain.data || []) as unknown as Array<{ task_bank: { domain: string } | { domain: string }[] }>) {
    const tb = row.task_bank;
    const domain = Array.isArray(tb) ? tb[0]?.domain : tb?.domain;
    if (domain) {
      domainTaskCounts[domain] = (domainTaskCounts[domain] || 0) + 1;
    }
  }

  // Averages
  const avg = (arr: Array<{ score?: number; feminine_alignment?: number }>, key: string) => {
    const vals = arr.map(r => (r as Record<string, number>)[key]).filter(v => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const goalData = goals.data || [];
  const activeGoals = goalData.filter(g => g.status === 'active').length;
  const graduatedGoals = goalData.filter(g => g.status === 'graduated').length;
  const abandonedGoals = goalData.filter(g => g.status === 'abandoned').length;
  const avgConsecutive = goalData.length > 0
    ? goalData.reduce((sum, g) => sum + (g.consecutive_days || 0), 0) / goalData.length
    : 0;

  return {
    domains,
    domainTaskCounts,
    moodAvg30: avg(mood30.data || [], 'score'),
    moodAvgPrior30: avg(moodPrior30.data || [], 'score'),
    femAlignAvg30: avg(femAlign30.data || [], 'feminine_alignment'),
    femAlignAvgPrior30: avg(femAlignPrior30.data || [], 'feminine_alignment'),
    goalsActive: activeGoals,
    goalsGraduated: graduatedGoals,
    goalsAbandoned: abandonedGoals,
    goalAvgConsecutiveDays: Math.round(avgConsecutive * 10) / 10,
    commitments,
  };
}

// ============================================
// SECTION 3: TRANSFORMATION SIGNALS
// ============================================

async function loadTransformationMetrics(userId: string): Promise<TransformationMetrics> {
  const [
    femState7, femState14, femState30,
    pronounRecent, pronounOlder,
    patterns, conditioning,
    service, gina, denial,
    escalations, sessions,
  ] = await Promise.all([
    // Feminine state logs
    supabase.from('feminine_state_logs').select('state_score').eq('user_id', userId).gte('timestamp', daysAgo(7)),
    supabase.from('feminine_state_logs').select('state_score').eq('user_id', userId).gte('timestamp', daysAgo(14)),
    supabase.from('feminine_state_logs').select('state_score').eq('user_id', userId).gte('timestamp', daysAgo(30)),
    // Pronoun stats last 7d
    supabase.from('pronoun_stats').select('feminine_uses, masculine_catches').eq('user_id', userId).gte('date', daysAgo(7)),
    // Pronoun stats prior 7d
    supabase.from('pronoun_stats').select('feminine_uses, masculine_catches').eq('user_id', userId).gte('date', daysAgo(14)).lt('date', daysAgo(7)),
    // Masculine patterns
    supabase.from('masculine_patterns').select('status').eq('user_id', userId),
    // Conditioning pairs
    supabase.from('conditioning_pairs').select('status, automaticity_score').eq('user_id', userId),
    // Service progression (latest stage)
    supabase.from('service_progression').select('stage').eq('user_id', userId).order('entered_at', { ascending: false }).limit(1),
    // Gina emergence (latest stage)
    supabase.from('gina_emergence').select('stage').eq('user_id', userId).order('entered_at', { ascending: false }).limit(1),
    // Denial state
    supabase.from('denial_state').select('current_denial_day, total_denial_days').eq('user_id', userId).single(),
    // Escalation events last 30d
    supabase.from('escalation_events').select('id').eq('user_id', userId).gte('created_at', daysAgo(30)),
    getSessionStats(userId),
  ]);

  // Feminine state averages
  const avgScore = (data: Array<{ state_score: number }> | null) => {
    if (!data || data.length === 0) return null;
    return data.reduce((s, r) => s + r.state_score, 0) / data.length;
  };

  // Pronoun ratio
  const recentPronouns = pronounRecent.data || [];
  const olderPronouns = pronounOlder.data || [];
  const sumFem = (arr: Array<{ feminine_uses: number; masculine_catches: number }>) =>
    arr.reduce((s, r) => s + (r.feminine_uses || 0), 0);
  const sumMasc = (arr: Array<{ feminine_uses: number; masculine_catches: number }>) =>
    arr.reduce((s, r) => s + (r.masculine_catches || 0), 0);

  const recentFem = sumFem(recentPronouns);
  const recentMasc = sumMasc(recentPronouns);
  const olderFem = sumFem(olderPronouns);
  const olderMasc = sumMasc(olderPronouns);

  const recentTotal = recentFem + recentMasc;
  const olderTotal = olderFem + olderMasc;
  const pronounRatio = recentTotal > 0 ? recentFem / recentTotal : null;
  const olderRatio = olderTotal > 0 ? olderFem / olderTotal : null;

  let pronounTrend: 'up' | 'down' | 'stable' | null = null;
  if (pronounRatio !== null && olderRatio !== null) {
    const diff = pronounRatio - olderRatio;
    pronounTrend = diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : 'stable';
  }

  // Patterns
  const patternData = patterns.data || [];
  const patternsActive = patternData.filter(p => p.status === 'active').length;
  const patternsImproving = patternData.filter(p => p.status === 'improving').length;
  const patternsResolved = patternData.filter(p => p.status === 'resolved').length;

  // Conditioning
  const condData = conditioning.data || [];
  const condEstablished = condData.filter(c => c.status === 'established' || c.status === 'maintenance').length;
  const condInProgress = condData.filter(c => c.status === 'conditioning').length;
  const autoScores = condData.map(c => c.automaticity_score).filter((s): s is number => s != null);
  const avgAutomaticity = autoScores.length > 0
    ? Math.round(autoScores.reduce((a, b) => a + b, 0) / autoScores.length)
    : null;

  return {
    femStateAvg7: avgScore(femState7.data),
    femStateAvg14: avgScore(femState14.data),
    femStateAvg30: avgScore(femState30.data),
    pronounRatio: pronounRatio !== null ? Math.round(pronounRatio * 100) : null,
    pronounTrend,
    patternsActive,
    patternsImproving,
    patternsResolved,
    conditioningEstablished: condEstablished,
    conditioningInProgress: condInProgress,
    avgAutomaticity,
    serviceStage: service.data?.[0]?.stage || null,
    ginaStage: gina.data?.[0]?.stage || null,
    denialCurrentDay: denial.data?.current_denial_day || 0,
    denialTotalDays: denial.data?.total_denial_days || 0,
    escalationEventsLast30: (escalations.data || []).length,
    sessions,
  };
}

// ============================================
// MAIN AGGREGATOR
// ============================================

export async function loadProtocolAnalytics(userId: string): Promise<ProtocolAnalyticsData> {
  const [activity, behavior, transformation] = await Promise.all([
    loadActivityMetrics(userId),
    loadBehaviorMetrics(userId),
    loadTransformationMetrics(userId),
  ]);

  return { activity, behavior, transformation };
}
