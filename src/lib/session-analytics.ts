/**
 * Session Analytics
 *
 * Provides insights and analytics for edge sessions.
 * Tracks patterns, trends, and recommendations.
 */

import { supabase } from './supabase';
import type {
  DbEdgeSession,
  EdgeSessionType,
} from '../types/edge-session';

// ============================================
// TYPES
// ============================================

export interface SessionAnalytics {
  overview: SessionOverview;
  patterns: SessionPatterns;
  performance: PerformanceMetrics;
  trends: SessionTrends;
  recommendations: SessionRecommendation[];
}

export interface SessionOverview {
  totalSessions: number;
  totalDurationMinutes: number;
  totalEdges: number;
  averageSessionLength: number; // minutes
  averageEdgesPerSession: number;
  completionRate: number; // % of sessions not abandoned
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  weekOverWeekChange: number; // percentage
}

export interface SessionPatterns {
  mostUsedType: EdgeSessionType | null;
  mostProductiveTime: TimeSlot | null;
  averageTimeOfDay: number; // hour (0-23)
  preferredDays: number[]; // 0-6 (Sun-Sat)
  averageDuration: number; // minutes
  peakEdgeCount: number;
  averagePeakIntensity: number;
  sessionTypeBreakdown: Record<string, number>;
  endReasonBreakdown: Record<string, number>;
}

export interface TimeSlot {
  label: string;
  hour: number;
  edgesPerSession: number;
  sessionsInSlot: number;
}

export interface PerformanceMetrics {
  edgeEfficiency: number; // edges per minute
  consistencyScore: number; // 0-100, based on regular sessions
  progressionRate: number; // improvement in edges over time
  enduranceScore: number; // based on session length trends
  commitmentRate: number; // % of sessions with commitments
  anchorUtilization: number; // % of sessions using anchors
}

export interface SessionTrends {
  edgesTrend: 'improving' | 'stable' | 'declining';
  durationTrend: 'improving' | 'stable' | 'declining';
  frequencyTrend: 'improving' | 'stable' | 'declining';
  intensityTrend: 'improving' | 'stable' | 'declining';
  lastSevenDays: DailyStats[];
  lastThirtyDays: WeeklyStats[];
}

export interface DailyStats {
  date: string;
  sessionCount: number;
  totalEdges: number;
  totalMinutes: number;
  averageIntensity: number;
}

export interface WeeklyStats {
  weekStart: string;
  sessionCount: number;
  totalEdges: number;
  totalMinutes: number;
  averageEdgesPerSession: number;
}

export interface SessionRecommendation {
  type: 'timing' | 'type' | 'duration' | 'goal' | 'pattern' | 'improvement';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionable?: string;
}

// ============================================
// MAIN ANALYTICS FUNCTION
// ============================================

/**
 * Get comprehensive session analytics
 */
export async function getSessionAnalytics(): Promise<SessionAnalytics | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch all completed sessions
  const { data: sessions, error } = await supabase
    .from('edge_sessions')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['completed', 'abandoned'])
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch sessions:', error);
    return null;
  }

  if (!sessions || sessions.length === 0) {
    return createEmptyAnalytics();
  }

  const overview = calculateOverview(sessions);
  const patterns = calculatePatterns(sessions);
  const performance = calculatePerformance(sessions);
  const trends = calculateTrends(sessions);
  const recommendations = generateRecommendations(overview, patterns, performance, trends);

  return {
    overview,
    patterns,
    performance,
    trends,
    recommendations,
  };
}

// ============================================
// OVERVIEW CALCULATIONS
// ============================================

function calculateOverview(sessions: DbEdgeSession[]): SessionOverview {
  const totalSessions = sessions.length;
  const totalDurationMinutes = sessions.reduce((sum, s) => sum + (s.total_duration_sec / 60), 0);
  const totalEdges = sessions.reduce((sum, s) => sum + s.edge_count, 0);

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const completionRate = totalSessions > 0 ? (completedSessions.length / totalSessions) : 0;

  // Sessions this week vs last week
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const sessionsThisWeek = sessions.filter(s =>
    s.started_at && new Date(s.started_at) >= oneWeekAgo
  ).length;

  const sessionsLastWeek = sessions.filter(s =>
    s.started_at &&
    new Date(s.started_at) >= twoWeeksAgo &&
    new Date(s.started_at) < oneWeekAgo
  ).length;

  const weekOverWeekChange = sessionsLastWeek > 0
    ? ((sessionsThisWeek - sessionsLastWeek) / sessionsLastWeek) * 100
    : sessionsThisWeek > 0 ? 100 : 0;

  return {
    totalSessions,
    totalDurationMinutes: Math.round(totalDurationMinutes),
    totalEdges,
    averageSessionLength: totalSessions > 0 ? Math.round(totalDurationMinutes / totalSessions) : 0,
    averageEdgesPerSession: totalSessions > 0 ? Math.round(totalEdges / totalSessions * 10) / 10 : 0,
    completionRate: Math.round(completionRate * 100),
    sessionsThisWeek,
    sessionsLastWeek,
    weekOverWeekChange: Math.round(weekOverWeekChange),
  };
}

// ============================================
// PATTERN CALCULATIONS
// ============================================

function calculatePatterns(sessions: DbEdgeSession[]): SessionPatterns {
  // Session type breakdown
  const typeCount: Record<string, number> = {};
  sessions.forEach(s => {
    typeCount[s.session_type] = (typeCount[s.session_type] || 0) + 1;
  });

  const mostUsedType = Object.entries(typeCount).length > 0
    ? Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0][0] as EdgeSessionType
    : null;

  // End reason breakdown
  const endReasonCount: Record<string, number> = {};
  sessions.forEach(s => {
    if (s.end_reason) {
      endReasonCount[s.end_reason] = (endReasonCount[s.end_reason] || 0) + 1;
    }
  });

  // Time of day analysis
  const hourStats: Record<number, { sessions: number; edges: number }> = {};
  sessions.forEach(s => {
    if (s.started_at) {
      const hour = new Date(s.started_at).getHours();
      if (!hourStats[hour]) hourStats[hour] = { sessions: 0, edges: 0 };
      hourStats[hour].sessions++;
      hourStats[hour].edges += s.edge_count;
    }
  });

  const timeSlots: TimeSlot[] = Object.entries(hourStats).map(([hour, stats]) => ({
    label: formatHour(parseInt(hour)),
    hour: parseInt(hour),
    edgesPerSession: stats.sessions > 0 ? stats.edges / stats.sessions : 0,
    sessionsInSlot: stats.sessions,
  }));

  const mostProductiveTime = timeSlots.length > 0
    ? timeSlots.sort((a, b) => b.edgesPerSession - a.edgesPerSession)[0]
    : null;

  // Average time of day
  let totalHours = 0;
  let sessionsWithTime = 0;
  sessions.forEach(s => {
    if (s.started_at) {
      totalHours += new Date(s.started_at).getHours();
      sessionsWithTime++;
    }
  });
  const averageTimeOfDay = sessionsWithTime > 0 ? Math.round(totalHours / sessionsWithTime) : 12;

  // Day of week preferences
  const dayCount: Record<number, number> = {};
  sessions.forEach(s => {
    if (s.started_at) {
      const day = new Date(s.started_at).getDay();
      dayCount[day] = (dayCount[day] || 0) + 1;
    }
  });

  const preferredDays = Object.entries(dayCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => parseInt(day));

  // Peak metrics
  const peakEdgeCount = Math.max(...sessions.map(s => s.edge_count), 0);
  const intensities = sessions.map(s => s.peak_intensity).filter(i => i > 0);
  const averagePeakIntensity = intensities.length > 0
    ? intensities.reduce((a, b) => a + b, 0) / intensities.length
    : 0;

  const durations = sessions.map(s => s.total_duration_sec / 60);
  const averageDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    mostUsedType,
    mostProductiveTime,
    averageTimeOfDay,
    preferredDays,
    averageDuration: Math.round(averageDuration),
    peakEdgeCount,
    averagePeakIntensity: Math.round(averagePeakIntensity * 10) / 10,
    sessionTypeBreakdown: typeCount,
    endReasonBreakdown: endReasonCount,
  };
}

// ============================================
// PERFORMANCE CALCULATIONS
// ============================================

function calculatePerformance(sessions: DbEdgeSession[]): PerformanceMetrics {
  // Edge efficiency (edges per minute)
  let totalEdges = 0;
  let totalMinutes = 0;
  sessions.forEach(s => {
    totalEdges += s.edge_count;
    totalMinutes += s.total_duration_sec / 60;
  });
  const edgeEfficiency = totalMinutes > 0
    ? Math.round((totalEdges / totalMinutes) * 100) / 100
    : 0;

  // Consistency score (based on session regularity)
  const consistencyScore = calculateConsistencyScore(sessions);

  // Progression rate (improvement in edges over time)
  const progressionRate = calculateProgressionRate(sessions);

  // Endurance score (based on session length trends)
  const enduranceScore = calculateEnduranceScore(sessions);

  // Commitment rate
  const sessionsWithCommitments = sessions.filter(s =>
    s.commitments_made && Array.isArray(s.commitments_made) && s.commitments_made.length > 0
  ).length;
  const commitmentRate = sessions.length > 0
    ? Math.round((sessionsWithCommitments / sessions.length) * 100)
    : 0;

  // Anchor utilization
  const sessionsWithAnchors = sessions.filter(s =>
    s.active_anchors && s.active_anchors.length > 0
  ).length;
  const anchorUtilization = sessions.length > 0
    ? Math.round((sessionsWithAnchors / sessions.length) * 100)
    : 0;

  return {
    edgeEfficiency,
    consistencyScore,
    progressionRate,
    enduranceScore,
    commitmentRate,
    anchorUtilization,
  };
}

function calculateConsistencyScore(sessions: DbEdgeSession[]): number {
  if (sessions.length < 2) return 0;

  // Calculate gaps between sessions
  const sortedSessions = sessions
    .filter(s => s.started_at)
    .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime());

  if (sortedSessions.length < 2) return 0;

  const gaps: number[] = [];
  for (let i = 1; i < sortedSessions.length; i++) {
    const prevTime = new Date(sortedSessions[i - 1].started_at!).getTime();
    const currTime = new Date(sortedSessions[i].started_at!).getTime();
    const gapDays = (currTime - prevTime) / (1000 * 60 * 60 * 24);
    gaps.push(gapDays);
  }

  // Ideal gap is 1-2 days
  let score = 100;
  gaps.forEach(gap => {
    if (gap > 3) score -= 5 * Math.min(gap - 3, 7);
    if (gap > 7) score -= 10;
  });

  return Math.max(0, Math.round(score));
}

function calculateProgressionRate(sessions: DbEdgeSession[]): number {
  if (sessions.length < 3) return 0;

  const sortedSessions = sessions
    .filter(s => s.started_at)
    .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime());

  // Compare first third vs last third
  const third = Math.floor(sortedSessions.length / 3);
  const firstThird = sortedSessions.slice(0, third);
  const lastThird = sortedSessions.slice(-third);

  const avgFirst = firstThird.reduce((sum, s) => sum + s.edge_count, 0) / firstThird.length;
  const avgLast = lastThird.reduce((sum, s) => sum + s.edge_count, 0) / lastThird.length;

  const change = avgFirst > 0 ? ((avgLast - avgFirst) / avgFirst) * 100 : 0;
  return Math.round(change);
}

function calculateEnduranceScore(sessions: DbEdgeSession[]): number {
  if (sessions.length < 3) return 50;

  const durations = sessions
    .filter(s => s.total_duration_sec > 0)
    .map(s => s.total_duration_sec / 60);

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);

  // Score based on average duration and max achievement
  let score = 0;
  if (avgDuration >= 30) score += 30;
  else if (avgDuration >= 20) score += 20;
  else if (avgDuration >= 10) score += 10;

  if (maxDuration >= 60) score += 40;
  else if (maxDuration >= 45) score += 30;
  else if (maxDuration >= 30) score += 20;

  // Bonus for recent improvement
  const recent = sessions.slice(0, 5);
  const recentAvg = recent.reduce((sum, s) => sum + s.total_duration_sec / 60, 0) / recent.length;
  if (recentAvg > avgDuration) score += 20;

  return Math.min(100, score);
}

// ============================================
// TREND CALCULATIONS
// ============================================

function calculateTrends(sessions: DbEdgeSession[]): SessionTrends {
  const sortedSessions = sessions
    .filter(s => s.started_at)
    .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime());

  // Last 7 days stats
  const lastSevenDays = calculateDailyStats(sortedSessions, 7);

  // Last 30 days weekly stats
  const lastThirtyDays = calculateWeeklyStats(sortedSessions, 30);

  // Calculate trends
  const recentSessions = sortedSessions.slice(-10);
  const olderSessions = sortedSessions.slice(-20, -10);

  const edgesTrend = calculateTrendDirection(
    recentSessions.map(s => s.edge_count),
    olderSessions.map(s => s.edge_count)
  );

  const durationTrend = calculateTrendDirection(
    recentSessions.map(s => s.total_duration_sec),
    olderSessions.map(s => s.total_duration_sec)
  );

  const intensityTrend = calculateTrendDirection(
    recentSessions.map(s => s.peak_intensity),
    olderSessions.map(s => s.peak_intensity)
  );

  // Frequency trend (sessions per week)
  const recentWeekCount = lastSevenDays.reduce((sum, d) => sum + d.sessionCount, 0);
  const frequencyTrend: 'improving' | 'stable' | 'declining' =
    recentWeekCount >= 5 ? 'improving' :
    recentWeekCount >= 3 ? 'stable' : 'declining';

  return {
    edgesTrend,
    durationTrend,
    frequencyTrend,
    intensityTrend,
    lastSevenDays,
    lastThirtyDays,
  };
}

export function calculateDailyStats(sessions: DbEdgeSession[], days: number): DailyStats[] {
  const stats: DailyStats[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];

    const daySessions = sessions.filter(s =>
      s.started_at && s.started_at.startsWith(dateStr)
    );

    stats.push({
      date: dateStr,
      sessionCount: daySessions.length,
      totalEdges: daySessions.reduce((sum, s) => sum + s.edge_count, 0),
      totalMinutes: Math.round(daySessions.reduce((sum, s) => sum + s.total_duration_sec / 60, 0)),
      averageIntensity: daySessions.length > 0
        ? daySessions.reduce((sum, s) => sum + s.peak_intensity, 0) / daySessions.length
        : 0,
    });
  }

  return stats.reverse();
}

export function calculateWeeklyStats(sessions: DbEdgeSession[], days: number): WeeklyStats[] {
  const stats: WeeklyStats[] = [];
  const now = new Date();
  const weeks = Math.ceil(days / 7);

  for (let i = 0; i < weeks; i++) {
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const weekSessions = sessions.filter(s => {
      if (!s.started_at) return false;
      const sessionDate = new Date(s.started_at);
      return sessionDate >= weekStart && sessionDate < weekEnd;
    });

    const totalEdges = weekSessions.reduce((sum, s) => sum + s.edge_count, 0);

    stats.push({
      weekStart: weekStartStr,
      sessionCount: weekSessions.length,
      totalEdges,
      totalMinutes: Math.round(weekSessions.reduce((sum, s) => sum + s.total_duration_sec / 60, 0)),
      averageEdgesPerSession: weekSessions.length > 0
        ? Math.round(totalEdges / weekSessions.length * 10) / 10
        : 0,
    });
  }

  return stats.reverse();
}

function calculateTrendDirection(
  recent: number[],
  older: number[]
): 'improving' | 'stable' | 'declining' {
  if (recent.length === 0 || older.length === 0) return 'stable';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

  if (changePercent > 10) return 'improving';
  if (changePercent < -10) return 'declining';
  return 'stable';
}

// ============================================
// RECOMMENDATIONS
// ============================================

function generateRecommendations(
  overview: SessionOverview,
  patterns: SessionPatterns,
  performance: PerformanceMetrics,
  trends: SessionTrends
): SessionRecommendation[] {
  const recommendations: SessionRecommendation[] = [];

  // Frequency recommendations
  if (overview.sessionsThisWeek < 3) {
    recommendations.push({
      type: 'timing',
      title: 'Increase Session Frequency',
      description: `Only ${overview.sessionsThisWeek} sessions this week. Aim for at least 4-5 for optimal conditioning.`,
      priority: 'high',
      actionable: 'Schedule your next session now',
    });
  }

  // Duration recommendations
  if (overview.averageSessionLength < 20) {
    recommendations.push({
      type: 'duration',
      title: 'Extend Session Length',
      description: `Average session is ${overview.averageSessionLength} minutes. Longer sessions (30+ min) lead to deeper conditioning.`,
      priority: 'medium',
      actionable: 'Try setting a 30-minute minimum goal',
    });
  }

  // Edge count recommendations
  if (overview.averageEdgesPerSession < 5) {
    recommendations.push({
      type: 'goal',
      title: 'Increase Edge Targets',
      description: `Averaging ${overview.averageEdgesPerSession} edges per session. Push for 6-8 to build better control.`,
      priority: 'medium',
    });
  }

  // Completion rate
  if (overview.completionRate < 70) {
    recommendations.push({
      type: 'improvement',
      title: 'Improve Completion Rate',
      description: `Only ${overview.completionRate}% of sessions complete. Abandoning sessions reduces effectiveness.`,
      priority: 'high',
      actionable: 'Set realistic goals you can complete',
    });
  }

  // Consistency
  if (performance.consistencyScore < 60) {
    recommendations.push({
      type: 'timing',
      title: 'Build Consistent Schedule',
      description: 'Session frequency is irregular. Regular practice builds stronger conditioning.',
      priority: 'medium',
      actionable: 'Set a daily reminder for session time',
    });
  }

  // Optimal timing
  if (patterns.mostProductiveTime) {
    recommendations.push({
      type: 'timing',
      title: `Best Time: ${patterns.mostProductiveTime.label}`,
      description: `You average ${Math.round(patterns.mostProductiveTime.edgesPerSession * 10) / 10} edges during ${patterns.mostProductiveTime.label} sessions. Schedule more sessions at this time.`,
      priority: 'low',
    });
  }

  // Anchor usage
  if (performance.anchorUtilization < 50) {
    recommendations.push({
      type: 'pattern',
      title: 'Use Anchors More',
      description: `Only ${performance.anchorUtilization}% of sessions use anchors. Anchors strengthen conditioning.`,
      priority: 'medium',
      actionable: 'Activate at least one anchor before each session',
    });
  }

  // Commitment rate
  if (performance.commitmentRate < 30) {
    recommendations.push({
      type: 'goal',
      title: 'Make More Commitments',
      description: 'Commitments made during arousal are powerful. Accept more auction bids.',
      priority: 'medium',
    });
  }

  // Session variety
  const typeCount = Object.keys(patterns.sessionTypeBreakdown).length;
  if (typeCount < 3) {
    recommendations.push({
      type: 'type',
      title: 'Try Different Session Types',
      description: 'You primarily use one session type. Different types train different aspects.',
      priority: 'low',
      actionable: 'Try a goon or denial session',
    });
  }

  // Trend-based recommendations
  if (trends.edgesTrend === 'declining') {
    recommendations.push({
      type: 'improvement',
      title: 'Edge Count Declining',
      description: 'Your edge counts are trending down. Focus on building back up.',
      priority: 'high',
    });
  }

  if (trends.durationTrend === 'improving') {
    recommendations.push({
      type: 'improvement',
      title: 'Great Endurance Progress!',
      description: 'Your session duration is improving. Keep pushing your limits.',
      priority: 'low',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations.slice(0, 5); // Top 5 recommendations
}

// ============================================
// HELPERS
// ============================================

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function createEmptyAnalytics(): SessionAnalytics {
  return {
    overview: {
      totalSessions: 0,
      totalDurationMinutes: 0,
      totalEdges: 0,
      averageSessionLength: 0,
      averageEdgesPerSession: 0,
      completionRate: 0,
      sessionsThisWeek: 0,
      sessionsLastWeek: 0,
      weekOverWeekChange: 0,
    },
    patterns: {
      mostUsedType: null,
      mostProductiveTime: null,
      averageTimeOfDay: 12,
      preferredDays: [],
      averageDuration: 0,
      peakEdgeCount: 0,
      averagePeakIntensity: 0,
      sessionTypeBreakdown: {},
      endReasonBreakdown: {},
    },
    performance: {
      edgeEfficiency: 0,
      consistencyScore: 0,
      progressionRate: 0,
      enduranceScore: 50,
      commitmentRate: 0,
      anchorUtilization: 0,
    },
    trends: {
      edgesTrend: 'stable',
      durationTrend: 'stable',
      frequencyTrend: 'stable',
      intensityTrend: 'stable',
      lastSevenDays: [],
      lastThirtyDays: [],
    },
    recommendations: [{
      type: 'timing',
      title: 'Start Your First Session',
      description: 'No sessions recorded yet. Start your first session to begin tracking.',
      priority: 'high',
      actionable: 'Begin an edge session now',
    }],
  };
}

// Note: All functions are already exported where defined
