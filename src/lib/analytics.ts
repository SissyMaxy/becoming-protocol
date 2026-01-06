import { DailyEntry, Domain, UserProgress, Intensity } from '../types';

// Domain decay thresholds based on level
export const DECAY_THRESHOLDS: Record<string, { alert: number; urgent: number }> = {
  'level_1_2': { alert: 3, urgent: 5 },
  'level_3_4': { alert: 2, urgent: 4 },
  'level_5_plus': { alert: 1, urgent: 3 }
};

// Baseline establishment threshold
export const BASELINE_THRESHOLD_DAYS = 14;

// Level lock duration
export const LEVEL_LOCK_DAYS = 7;

export interface DomainStats {
  domain: Domain;
  level: number;
  daysAtLevel: number;
  completionRate14d: number;
  completionRate7d: number;
  daysSincePracticed: number;
  consecutiveDays: number;
  isBaseline: boolean;
  readyToLevelUp: boolean;
  atRiskOfDecay: boolean;
  decayUrgency: 'none' | 'alert' | 'urgent';
  isLevelLocked: boolean;
  levelLockedUntil?: string;
}

export interface TimeBlockStats {
  morning: number;
  day: number;
  evening: number;
}

export interface DayTypeStats {
  spacious: number;
  normal: number;
  crazy: number;
}

export interface WeekdayStats {
  [key: number]: number; // 0-6, Sunday-Saturday
}

export interface AlignmentAnalysis {
  trend: 'rising' | 'stable' | 'falling';
  avg7d: number;
  avg14d: number;
  highDays: string[]; // dates with alignment >= 8
  lowDays: string[]; // dates with alignment <= 4
}

export interface PatternAnalysis {
  skipPatterns: {
    domains: Domain[];
    timeBlocks: string[];
    weekdays: number[];
    triggers: string[];
  };
  euphoriaCorrelations: {
    domains: Domain[];
    activities: string[];
    conditions: string[];
  };
  dysphoriaCorrelations: {
    domains: Domain[];
    situations: string[];
    triggers: string[];
  };
}

export interface UserAnalytics {
  // Mode determination
  recommendedMode: 'build' | 'protect' | 'recover';
  modeReasoning: string;

  // Streak status
  currentStreak: number;
  streakStatus: 'stable' | 'at_risk' | 'broken';
  longestStreak: number;

  // Completion patterns
  overallCompletion14d: number;
  completionByDomain: Record<Domain, number>;
  completionByTimeBlock: TimeBlockStats;
  completionByDayType: DayTypeStats;
  completionByWeekday: WeekdayStats;

  // Alignment
  alignment: AlignmentAnalysis;

  // Domain health
  domainStats: DomainStats[];
  strongDomains: Domain[];
  neglectedDomains: Domain[];
  baselineDomains: Domain[];
  domainsAtRisk: Domain[];

  // Patterns
  patterns: PatternAnalysis;

  // Recent context
  recentEuphoria: string[];
  recentDysphoria: string[];
  recentInsights: string[];
  yesterdayCompletion: number;
  yesterdayAlignment: number;
}

// Calculate completion rate for a set of entries
function calculateCompletionRate(entries: DailyEntry[]): number {
  if (entries.length === 0) return 0;

  let totalTasks = 0;
  let completedTasks = 0;

  entries.forEach(entry => {
    totalTasks += entry.tasks.length;
    completedTasks += entry.tasks.filter(t => t.completed).length;
  });

  return totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
}

// Calculate domain-specific completion rate
function calculateDomainCompletion(entries: DailyEntry[], domain: Domain): number {
  let totalTasks = 0;
  let completedTasks = 0;

  entries.forEach(entry => {
    const domainTasks = entry.tasks.filter(t => t.domain === domain);
    totalTasks += domainTasks.length;
    completedTasks += domainTasks.filter(t => t.completed).length;
  });

  return totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
}

// Calculate time block completion rate
function calculateTimeBlockCompletion(entries: DailyEntry[]): TimeBlockStats {
  const stats: TimeBlockStats = { morning: 0, day: 0, evening: 0 };
  const counts = { morning: { total: 0, completed: 0 }, day: { total: 0, completed: 0 }, evening: { total: 0, completed: 0 } };

  entries.forEach(entry => {
    entry.tasks.forEach(task => {
      counts[task.timeBlock].total++;
      if (task.completed) counts[task.timeBlock].completed++;
    });
  });

  Object.keys(stats).forEach(block => {
    const b = block as keyof TimeBlockStats;
    stats[b] = counts[b].total > 0 ? (counts[b].completed / counts[b].total) * 100 : 0;
  });

  return stats;
}

// Calculate day type completion rate
function calculateDayTypeCompletion(entries: DailyEntry[]): DayTypeStats {
  const stats: DayTypeStats = { spacious: 0, normal: 0, crazy: 0 };
  const counts: Record<Intensity, { total: number; completed: number }> = {
    spacious: { total: 0, completed: 0 },
    normal: { total: 0, completed: 0 },
    crazy: { total: 0, completed: 0 }
  };

  entries.forEach(entry => {
    entry.tasks.forEach(task => {
      counts[entry.intensity].total++;
      if (task.completed) counts[entry.intensity].completed++;
    });
  });

  Object.keys(stats).forEach(type => {
    const t = type as Intensity;
    stats[t] = counts[t].total > 0 ? (counts[t].completed / counts[t].total) * 100 : 0;
  });

  return stats;
}

// Calculate weekday completion rate
function calculateWeekdayCompletion(entries: DailyEntry[]): WeekdayStats {
  const stats: WeekdayStats = {};
  const counts: Record<number, { total: number; completed: number }> = {};

  for (let i = 0; i < 7; i++) {
    counts[i] = { total: 0, completed: 0 };
  }

  entries.forEach(entry => {
    const dayOfWeek = new Date(entry.date).getDay();
    entry.tasks.forEach(task => {
      counts[dayOfWeek].total++;
      if (task.completed) counts[dayOfWeek].completed++;
    });
  });

  for (let i = 0; i < 7; i++) {
    stats[i] = counts[i].total > 0 ? (counts[i].completed / counts[i].total) * 100 : 0;
  }

  return stats;
}

// Analyze alignment trends
function analyzeAlignment(entries: DailyEntry[]): AlignmentAnalysis {
  const entriesWithJournal = entries.filter(e => e.journal?.alignmentScore);

  if (entriesWithJournal.length === 0) {
    return { trend: 'stable', avg7d: 0, avg14d: 0, highDays: [], lowDays: [] };
  }

  // Sort by date descending
  const sorted = [...entriesWithJournal].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const last7 = sorted.slice(0, 7);
  const last14 = sorted.slice(0, 14);

  const avg7d = last7.reduce((sum, e) => sum + (e.journal?.alignmentScore || 0), 0) / last7.length;
  const avg14d = last14.reduce((sum, e) => sum + (e.journal?.alignmentScore || 0), 0) / last14.length;

  // Determine trend
  let trend: 'rising' | 'stable' | 'falling' = 'stable';
  if (last7.length >= 3 && last14.length >= 7) {
    const firstHalf = last14.slice(7);
    const firstHalfAvg = firstHalf.reduce((sum, e) => sum + (e.journal?.alignmentScore || 0), 0) / firstHalf.length;

    if (avg7d > firstHalfAvg + 0.5) trend = 'rising';
    else if (avg7d < firstHalfAvg - 0.5) trend = 'falling';
  }

  // Find high and low days
  const highDays = entriesWithJournal.filter(e => (e.journal?.alignmentScore || 0) >= 8).map(e => e.date);
  const lowDays = entriesWithJournal.filter(e => (e.journal?.alignmentScore || 0) <= 4).map(e => e.date);

  return { trend, avg7d, avg14d, highDays, lowDays };
}

// Calculate days since domain was practiced
function daysSincePracticed(entries: DailyEntry[], domain: Domain): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sort entries by date descending
  const sorted = [...entries].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const entry of sorted) {
    const hasDomainTask = entry.tasks.some(t => t.domain === domain && t.completed);
    if (hasDomainTask) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);
      const diffTime = today.getTime() - entryDate.getTime();
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }
  }

  return entries.length > 0 ? 999 : 0; // Return high number if never practiced
}

// Calculate consecutive days for a domain
function consecutiveDomainDays(entries: DailyEntry[], domain: Domain): number {
  // Sort entries by date descending
  const sorted = [...entries].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let consecutive = 0;
  let lastDate: Date | null = null;

  for (const entry of sorted) {
    const hasDomainTask = entry.tasks.some(t => t.domain === domain && t.completed);

    if (!hasDomainTask) break;

    const entryDate = new Date(entry.date);

    if (lastDate) {
      const diffDays = Math.floor((lastDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays !== 1) break;
    }

    consecutive++;
    lastDate = entryDate;
  }

  return consecutive;
}

// Get decay urgency for a domain
function getDecayUrgency(level: number, daysSince: number): 'none' | 'alert' | 'urgent' {
  let thresholdKey: string;
  if (level <= 2) thresholdKey = 'level_1_2';
  else if (level <= 4) thresholdKey = 'level_3_4';
  else thresholdKey = 'level_5_plus';

  const thresholds = DECAY_THRESHOLDS[thresholdKey];

  if (daysSince >= thresholds.urgent) return 'urgent';
  if (daysSince >= thresholds.alert) return 'alert';
  return 'none';
}

// Check if domain is ready to level up
function checkReadyToLevelUp(
  _domain: Domain,
  _level: number,
  daysAtLevel: number,
  completionRate14d: number,
  consecutiveDays: number
): boolean {
  return (
    completionRate14d >= 80 &&
    daysAtLevel >= 10 &&
    consecutiveDays >= 5
  );
}

// Analyze domain health
function analyzeDomainStats(
  progress: UserProgress,
  entries: DailyEntry[],
  levelLocks: Record<string, string> = {}
): DomainStats[] {
  const last14Days = entries.slice(0, 14);
  const last7Days = entries.slice(0, 7);
  const today = new Date().toISOString().split('T')[0];

  return progress.domainProgress.map(dp => {
    const daysSince = daysSincePracticed(entries, dp.domain);
    const consecutive = consecutiveDomainDays(entries, dp.domain);
    const completion14d = calculateDomainCompletion(last14Days, dp.domain);
    const completion7d = calculateDomainCompletion(last7Days, dp.domain);
    const decayUrgency = getDecayUrgency(dp.level, daysSince);
    const isBaseline = consecutive >= BASELINE_THRESHOLD_DAYS;
    const lockDate = levelLocks[dp.domain];
    const isLevelLocked = lockDate ? new Date(lockDate) > new Date(today) : false;

    return {
      domain: dp.domain,
      level: dp.level,
      daysAtLevel: dp.totalDays, // Simplified - would need actual tracking
      completionRate14d: completion14d,
      completionRate7d: completion7d,
      daysSincePracticed: daysSince,
      consecutiveDays: consecutive,
      isBaseline,
      readyToLevelUp: checkReadyToLevelUp(dp.domain, dp.level, dp.totalDays, completion14d, consecutive),
      atRiskOfDecay: decayUrgency !== 'none',
      decayUrgency,
      isLevelLocked,
      levelLockedUntil: lockDate
    };
  });
}

// Determine AI mode based on user state
function determineMode(
  streak: number,
  entries: DailyEntry[],
  alignment: AlignmentAnalysis
): { mode: 'build' | 'protect' | 'recover'; reasoning: string } {
  const last3Days = entries.slice(0, 3);
  const missedDays = last3Days.filter(e => {
    const completion = e.tasks.length > 0
      ? e.tasks.filter(t => t.completed).length / e.tasks.length
      : 0;
    return completion < 0.3;
  }).length;

  // RECOVER mode triggers
  if (streak === 0) {
    return {
      mode: 'recover',
      reasoning: 'Streak is broken. Focus on gentle re-entry with quick wins.'
    };
  }

  if (missedDays >= 2) {
    return {
      mode: 'recover',
      reasoning: `Missed ${missedDays} of last 3 days. Time to rebuild momentum.`
    };
  }

  // PROTECT mode triggers
  const yesterdayCompletion = entries[0]?.tasks.length > 0
    ? (entries[0].tasks.filter(t => t.completed).length / entries[0].tasks.length) * 100
    : 100;

  if (streak > 7 && yesterdayCompletion < 50) {
    return {
      mode: 'protect',
      reasoning: `${streak}-day streak at risk. Yesterday was ${Math.round(yesterdayCompletion)}% completion. Protect what you've built.`
    };
  }

  if (alignment.trend === 'falling' && alignment.avg7d < 5) {
    return {
      mode: 'protect',
      reasoning: 'Alignment trending down. Focus on essentials and self-compassion.'
    };
  }

  if (missedDays === 1 && streak > 3) {
    return {
      mode: 'protect',
      reasoning: 'One rough day recently. Lighter load to maintain momentum.'
    };
  }

  // BUILD mode (default)
  const buildReasons: string[] = [];

  if (streak >= 14) buildReasons.push(`${streak}-day streak shows strong momentum`);
  if (alignment.trend === 'rising') buildReasons.push('alignment is rising');
  if (alignment.avg7d >= 7) buildReasons.push('high alignment this week');

  return {
    mode: 'build',
    reasoning: buildReasons.length > 0
      ? `Ready to grow: ${buildReasons.join(', ')}.`
      : 'Stable state. Time to push edges and grow.'
  };
}

// Extract recent journal content
function extractRecentJournalContent(entries: DailyEntry[]): {
  euphoria: string[];
  dysphoria: string[];
  insights: string[];
} {
  const entriesWithJournal = entries.filter(e => e.journal).slice(0, 7);

  return {
    euphoria: entriesWithJournal
      .filter(e => e.journal?.euphoriaNote)
      .map(e => e.journal!.euphoriaNote!)
      .slice(0, 3),
    dysphoria: entriesWithJournal
      .filter(e => e.journal?.dysphoriaNote)
      .map(e => e.journal!.dysphoriaNote!)
      .slice(0, 3),
    insights: entriesWithJournal
      .filter(e => e.journal?.insights)
      .map(e => e.journal!.insights!)
      .slice(0, 3)
  };
}

// Detect skip patterns
function detectSkipPatterns(entries: DailyEntry[]): PatternAnalysis['skipPatterns'] {
  const skippedDomains: Record<Domain, number> = {} as Record<Domain, number>;
  const skippedTimeBlocks: Record<string, number> = {};
  const skippedWeekdays: Record<number, number> = {};

  entries.forEach(entry => {
    const weekday = new Date(entry.date).getDay();

    entry.tasks.filter(t => !t.completed).forEach(task => {
      skippedDomains[task.domain] = (skippedDomains[task.domain] || 0) + 1;
      skippedTimeBlocks[task.timeBlock] = (skippedTimeBlocks[task.timeBlock] || 0) + 1;
      skippedWeekdays[weekday] = (skippedWeekdays[weekday] || 0) + 1;
    });
  });

  // Sort and get top patterns
  const topDomains = Object.entries(skippedDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d as Domain);

  const topTimeBlocks = Object.entries(skippedTimeBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t);

  const topWeekdays = Object.entries(skippedWeekdays)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([d]) => parseInt(d));

  return {
    domains: topDomains,
    timeBlocks: topTimeBlocks,
    weekdays: topWeekdays,
    triggers: [] // Would need NLP analysis of journal entries
  };
}

// Main analysis function
export function analyzeUser(
  progress: UserProgress,
  entries: DailyEntry[],
  levelLocks: Record<string, string> = {}
): UserAnalytics {
  // Sort entries by date descending
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const last14Days = sortedEntries.slice(0, 14);

  // Analyze alignment
  const alignment = analyzeAlignment(sortedEntries);

  // Determine mode
  const { mode, reasoning } = determineMode(progress.overallStreak, sortedEntries, alignment);

  // Analyze domain stats
  const domainStats = analyzeDomainStats(progress, sortedEntries, levelLocks);

  // Categorize domains
  const strongDomains = domainStats
    .filter(d => d.completionRate14d >= 85 && d.consecutiveDays >= 7)
    .map(d => d.domain);

  const neglectedDomains = domainStats
    .filter(d => d.daysSincePracticed >= 3)
    .map(d => d.domain);

  const baselineDomains = domainStats
    .filter(d => d.isBaseline)
    .map(d => d.domain);

  const domainsAtRisk = domainStats
    .filter(d => d.atRiskOfDecay)
    .map(d => d.domain);

  // Calculate completion rates
  const completionByDomain: Record<Domain, number> = {} as Record<Domain, number>;
  progress.domainProgress.forEach(dp => {
    completionByDomain[dp.domain] = calculateDomainCompletion(last14Days, dp.domain);
  });

  // Get recent journal content
  const journalContent = extractRecentJournalContent(sortedEntries);

  // Yesterday's stats
  const yesterday = sortedEntries[0];
  const yesterdayCompletion = yesterday?.tasks.length > 0
    ? (yesterday.tasks.filter(t => t.completed).length / yesterday.tasks.length) * 100
    : 0;
  const yesterdayAlignment = yesterday?.journal?.alignmentScore || 0;

  // Detect patterns
  const skipPatterns = detectSkipPatterns(last14Days);

  return {
    recommendedMode: mode,
    modeReasoning: reasoning,
    currentStreak: progress.overallStreak,
    streakStatus: progress.overallStreak === 0 ? 'broken' :
      (yesterdayCompletion < 50 && progress.overallStreak > 3) ? 'at_risk' : 'stable',
    longestStreak: progress.longestStreak,
    overallCompletion14d: calculateCompletionRate(last14Days),
    completionByDomain,
    completionByTimeBlock: calculateTimeBlockCompletion(last14Days),
    completionByDayType: calculateDayTypeCompletion(last14Days),
    completionByWeekday: calculateWeekdayCompletion(last14Days),
    alignment,
    domainStats,
    strongDomains,
    neglectedDomains,
    baselineDomains,
    domainsAtRisk,
    patterns: {
      skipPatterns,
      euphoriaCorrelations: { domains: [], activities: [], conditions: [] },
      dysphoriaCorrelations: { domains: [], situations: [], triggers: [] }
    },
    recentEuphoria: journalContent.euphoria,
    recentDysphoria: journalContent.dysphoria,
    recentInsights: journalContent.insights,
    yesterdayCompletion,
    yesterdayAlignment
  };
}

// Check level up criteria
export function checkLevelUpCriteria(domainStat: DomainStats): {
  eligible: boolean;
  criteria: { name: string; met: boolean; current: number; required: number }[];
} {
  const criteria = [
    {
      name: 'Completion Rate (14d)',
      met: domainStat.completionRate14d >= 80,
      current: Math.round(domainStat.completionRate14d),
      required: 80
    },
    {
      name: 'Days at Current Level',
      met: domainStat.daysAtLevel >= 10,
      current: domainStat.daysAtLevel,
      required: 10
    },
    {
      name: 'Consecutive Days',
      met: domainStat.consecutiveDays >= 5,
      current: domainStat.consecutiveDays,
      required: 5
    }
  ];

  return {
    eligible: criteria.every(c => c.met),
    criteria
  };
}

// Check phase advancement criteria
export function checkPhaseAdvancementCriteria(
  phase: number,
  progress: UserProgress,
  analytics: UserAnalytics
): {
  eligible: boolean;
  criteria: { name: string; met: boolean; current: number | string; required: number | string }[];
} {
  const phaseCriteria: Record<number, { name: string; check: () => boolean; current: () => number | string; required: number | string }[]> = {
    1: [
      { name: 'Minimum Streak', check: () => progress.overallStreak >= 14, current: () => progress.overallStreak, required: 14 },
      { name: 'Average Alignment', check: () => analytics.alignment.avg7d >= 5, current: () => analytics.alignment.avg7d.toFixed(1), required: '5.0' },
      { name: 'Domains at Level 2+', check: () => analytics.domainStats.filter(d => d.level >= 2).length >= 4, current: () => analytics.domainStats.filter(d => d.level >= 2).length, required: 4 },
      { name: 'Days in Phase', check: () => progress.phase.daysInPhase >= 14, current: () => progress.phase.daysInPhase, required: 14 }
    ],
    2: [
      { name: 'Minimum Streak', check: () => progress.overallStreak >= 21, current: () => progress.overallStreak, required: 21 },
      { name: 'Average Alignment', check: () => analytics.alignment.avg7d >= 6, current: () => analytics.alignment.avg7d.toFixed(1), required: '6.0' },
      { name: 'Domains at Level 3+', check: () => analytics.domainStats.filter(d => d.level >= 3).length >= 5, current: () => analytics.domainStats.filter(d => d.level >= 3).length, required: 5 },
      { name: 'Social Domain Level', check: () => (analytics.domainStats.find(d => d.domain === 'social')?.level || 0) >= 2, current: () => analytics.domainStats.find(d => d.domain === 'social')?.level || 0, required: 2 },
      { name: 'Days in Phase', check: () => progress.phase.daysInPhase >= 21, current: () => progress.phase.daysInPhase, required: 21 }
    ],
    3: [
      { name: 'Minimum Streak', check: () => progress.overallStreak >= 30, current: () => progress.overallStreak, required: 30 },
      { name: 'Average Alignment', check: () => analytics.alignment.avg7d >= 7, current: () => analytics.alignment.avg7d.toFixed(1), required: '7.0' },
      { name: 'Domains at Level 4+', check: () => analytics.domainStats.filter(d => d.level >= 4).length >= 6, current: () => analytics.domainStats.filter(d => d.level >= 4).length, required: 6 },
      { name: 'Social Domain Level', check: () => (analytics.domainStats.find(d => d.domain === 'social')?.level || 0) >= 3, current: () => analytics.domainStats.find(d => d.domain === 'social')?.level || 0, required: 3 },
      { name: 'Days in Phase', check: () => progress.phase.daysInPhase >= 28, current: () => progress.phase.daysInPhase, required: 28 }
    ]
  };

  const criteria = phaseCriteria[phase] || [];
  const mapped = criteria.map(c => ({
    name: c.name,
    met: c.check(),
    current: c.current(),
    required: c.required
  }));

  return {
    eligible: mapped.every(c => c.met),
    criteria: mapped
  };
}
