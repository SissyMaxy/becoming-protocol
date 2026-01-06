/**
 * Infractions System
 *
 * Records accountability infractions when users skip tasks, miss days,
 * or deviate from protocol. These are visible to accountability partners.
 */

import { supabase } from './supabase';

export type InfractionType =
  | 'task_skip'       // Skipping a required task
  | 'day_incomplete'  // Closing app without completing protocol
  | 'journal_skip'    // Skipping evening reflection
  | 'streak_break'    // Missing a full day
  | 'pattern_skip'    // Repeatedly skipping same domain
  | 'gaming_detected'; // Black box detects going through motions

export type InfractionSeverity = 'low' | 'medium' | 'high';

export interface Infraction {
  type: InfractionType;
  severity: InfractionSeverity;
  domain?: string;
  taskId?: string;
  taskTitle?: string;
  reason?: string;
  aiNotes?: string;
  patternContext?: Record<string, unknown>;
}

export interface InfractionRecord extends Infraction {
  id: string;
  userId: string;
  date: string;
  visibleToPartner: boolean;
  partnerViewedAt?: string;
  createdAt: string;
}

export interface InfractionsSummary {
  total: number;
  byType: Record<InfractionType, number>;
  bySeverity: Record<InfractionSeverity, number>;
  recentReasons: string[];
  last7Days: number;
  last30Days: number;
}

/**
 * Record a new infraction
 */
export async function recordInfraction(
  userId: string,
  infraction: Infraction
): Promise<void> {
  const { error } = await supabase
    .from('infractions')
    .insert({
      user_id: userId,
      type: infraction.type,
      severity: infraction.severity,
      date: new Date().toISOString().split('T')[0],
      domain: infraction.domain || null,
      task_id: infraction.taskId || null,
      task_title: infraction.taskTitle || null,
      reason: infraction.reason || null,
      ai_notes: infraction.aiNotes || null,
      pattern_context: infraction.patternContext || null,
      visible_to_partner: true,
    });

  if (error) {
    console.error('Error recording infraction:', error);
    throw error;
  }
}

/**
 * Get infractions summary for a user
 */
export async function getInfractionsSummary(
  userId: string,
  days: number = 30
): Promise<InfractionsSummary> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('infractions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since.toISOString().split('T')[0])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching infractions:', error);
    throw error;
  }

  // Initialize counts
  const byType: Record<InfractionType, number> = {
    task_skip: 0,
    day_incomplete: 0,
    journal_skip: 0,
    streak_break: 0,
    pattern_skip: 0,
    gaming_detected: 0,
  };

  const bySeverity: Record<InfractionSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  const recentReasons: string[] = [];
  let last7Days = 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  data?.forEach(inf => {
    byType[inf.type as InfractionType] = (byType[inf.type as InfractionType] || 0) + 1;
    bySeverity[inf.severity as InfractionSeverity] = (bySeverity[inf.severity as InfractionSeverity] || 0) + 1;

    if (inf.reason && recentReasons.length < 5) {
      recentReasons.push(inf.reason);
    }

    if (new Date(inf.date) >= sevenDaysAgo) {
      last7Days++;
    }
  });

  return {
    total: data?.length || 0,
    byType,
    bySeverity,
    recentReasons,
    last7Days,
    last30Days: data?.length || 0,
  };
}

/**
 * Get recent infractions for display
 */
export async function getRecentInfractions(
  userId: string,
  limit: number = 10
): Promise<InfractionRecord[]> {
  const { data, error } = await supabase
    .from('infractions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent infractions:', error);
    return [];
  }

  return (data || []).map(inf => ({
    id: inf.id,
    userId: inf.user_id,
    type: inf.type as InfractionType,
    severity: inf.severity as InfractionSeverity,
    date: inf.date,
    domain: inf.domain,
    taskId: inf.task_id,
    taskTitle: inf.task_title,
    reason: inf.reason,
    aiNotes: inf.ai_notes,
    patternContext: inf.pattern_context,
    visibleToPartner: inf.visible_to_partner,
    partnerViewedAt: inf.partner_viewed_at,
    createdAt: inf.created_at,
  }));
}

/**
 * Get infractions for partner view (Gina)
 * Returns sanitized data suitable for accountability partner
 */
export async function getInfractionsForPartner(
  userId: string,
  days: number = 30
): Promise<{
  summary: InfractionsSummary;
  recentInfractions: Array<{
    type: InfractionType;
    severity: InfractionSeverity;
    date: string;
    reason?: string;
  }>;
}> {
  const summary = await getInfractionsSummary(userId, days);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('infractions')
    .select('type, severity, date, reason')
    .eq('user_id', userId)
    .eq('visible_to_partner', true)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching partner infractions:', error);
  }

  return {
    summary,
    recentInfractions: (data || []).map(inf => ({
      type: inf.type as InfractionType,
      severity: inf.severity as InfractionSeverity,
      date: inf.date,
      reason: inf.reason,
    })),
  };
}

/**
 * Check if user has pattern of skipping a specific domain
 */
export async function checkDomainSkipPattern(
  userId: string,
  domain: string,
  threshold: number = 3
): Promise<boolean> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('infractions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'task_skip')
    .eq('domain', domain)
    .gte('date', sevenDaysAgo.toISOString().split('T')[0]);

  if (error) {
    console.error('Error checking domain skip pattern:', error);
    return false;
  }

  return (data?.length || 0) >= threshold;
}

/**
 * Get infraction type display info
 */
export function getInfractionTypeInfo(type: InfractionType): {
  label: string;
  description: string;
  icon: string;
} {
  const info: Record<InfractionType, { label: string; description: string; icon: string }> = {
    task_skip: {
      label: 'Task Skipped',
      description: 'A practice was skipped',
      icon: 'skip',
    },
    day_incomplete: {
      label: 'Day Incomplete',
      description: 'Protocol not fully completed',
      icon: 'incomplete',
    },
    journal_skip: {
      label: 'Journal Skipped',
      description: 'Evening reflection was skipped',
      icon: 'journal',
    },
    streak_break: {
      label: 'Streak Broken',
      description: 'A day was missed entirely',
      icon: 'broken',
    },
    pattern_skip: {
      label: 'Pattern Detected',
      description: 'Repeated skips in same area',
      icon: 'pattern',
    },
    gaming_detected: {
      label: 'Gaming Detected',
      description: 'Going through the motions',
      icon: 'gaming',
    },
  };

  return info[type];
}

/**
 * Get severity color class
 */
export function getSeverityColor(severity: InfractionSeverity): string {
  const colors: Record<InfractionSeverity, string> = {
    low: 'text-amber-400',
    medium: 'text-orange-400',
    high: 'text-red-400',
  };
  return colors[severity];
}

/**
 * Partner View Interface
 * What accountability partner (Gina) can see
 *
 * NOT visible to partner:
 * - Specific task details
 * - Journal content
 * - Black box observations
 * - Private notes
 */
export interface PartnerView {
  // Progress (positive)
  currentStreak: number;
  longestStreak: number;
  currentPhase: string;
  completionRateLast7Days: number;
  alignmentTrendLast7Days: 'rising' | 'stable' | 'falling';

  // Infractions (accountability)
  infractionsLast30Days: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    recentReasons: string[]; // Last 5
  };
}

/**
 * Get the full partner view for accountability partner (Gina)
 * Combines progress data with infractions summary
 */
export async function getPartnerView(userId: string): Promise<PartnerView> {
  // Get user progress
  const { data: progressData, error: progressError } = await supabase
    .from('user_progress')
    .select('overall_streak, longest_streak, phase')
    .eq('user_id', userId)
    .single();

  if (progressError) {
    console.error('Error fetching progress for partner view:', progressError);
  }

  // Get completion rate for last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: entriesData, error: entriesError } = await supabase
    .from('daily_entries')
    .select('tasks, journal')
    .eq('user_id', userId)
    .gte('date', sevenDaysAgo.toISOString().split('T')[0]);

  if (entriesError) {
    console.error('Error fetching entries for partner view:', entriesError);
  }

  // Calculate completion rate
  let totalTasks = 0;
  let completedTasks = 0;
  const alignmentScores: number[] = [];

  (entriesData || []).forEach(entry => {
    const tasks = entry.tasks as Array<{ completed: boolean }> || [];
    totalTasks += tasks.length;
    completedTasks += tasks.filter(t => t.completed).length;

    // Collect alignment scores for trend calculation
    const journal = entry.journal as { alignmentScore?: number } | null;
    if (journal?.alignmentScore) {
      alignmentScores.push(journal.alignmentScore);
    }
  });

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate alignment trend
  let alignmentTrend: 'rising' | 'stable' | 'falling' = 'stable';
  if (alignmentScores.length >= 3) {
    const recentAvg = alignmentScores.slice(0, Math.ceil(alignmentScores.length / 2))
      .reduce((a, b) => a + b, 0) / Math.ceil(alignmentScores.length / 2);
    const olderAvg = alignmentScores.slice(Math.ceil(alignmentScores.length / 2))
      .reduce((a, b) => a + b, 0) / Math.floor(alignmentScores.length / 2);

    if (recentAvg > olderAvg + 0.5) {
      alignmentTrend = 'rising';
    } else if (recentAvg < olderAvg - 0.5) {
      alignmentTrend = 'falling';
    }
  }

  // Get infractions summary
  const infractionsSummary = await getInfractionsSummary(userId, 30);

  // Get phase name
  const phase = progressData?.phase as { phaseName?: string } | null;
  const phaseName = phase?.phaseName || 'Foundation';

  return {
    currentStreak: progressData?.overall_streak || 0,
    longestStreak: progressData?.longest_streak || 0,
    currentPhase: phaseName,
    completionRateLast7Days: completionRate,
    alignmentTrendLast7Days: alignmentTrend,
    infractionsLast30Days: {
      total: infractionsSummary.total,
      byType: infractionsSummary.byType as Record<string, number>,
      bySeverity: infractionsSummary.bySeverity as Record<string, number>,
      recentReasons: infractionsSummary.recentReasons,
    },
  };
}
