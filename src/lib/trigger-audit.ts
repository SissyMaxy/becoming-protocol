/**
 * Trigger Audit Trail
 *
 * Tracks system trigger executions and analyzes their effectiveness.
 * Provides insights into what's working and what needs adjustment.
 */

import { supabase } from './supabase';
import type { SystemEvent, SystemTarget, SystemAction, TriggerResult } from './system-triggers';

// ============================================
// TYPES
// ============================================

export interface TriggerExecution {
  id: string;
  userId: string;
  event: SystemEvent;
  context: Record<string, unknown>;
  actionsExecuted: SystemAction[];
  actionsFailed: Array<{ action: SystemAction; error: string }>;
  executedAt: string;
  sessionId?: string;
  arousalLevel?: number;
  denialDay?: number;
}

export interface TriggerAnalytics {
  overview: TriggerOverview;
  eventBreakdown: EventBreakdown[];
  targetBreakdown: TargetBreakdown[];
  timePatterns: TimePatterns;
  effectiveness: EffectivenessMetrics;
  correlations: TriggerCorrelation[];
  recommendations: TriggerRecommendation[];
}

export interface TriggerOverview {
  totalExecutions: number;
  successRate: number;
  uniqueEvents: number;
  executionsToday: number;
  executionsThisWeek: number;
  mostActiveHour: number;
  mostTriggeredEvent: SystemEvent | null;
}

export interface EventBreakdown {
  event: SystemEvent;
  count: number;
  successRate: number;
  lastTriggered: string;
  averageActionsPerTrigger: number;
}

export interface TargetBreakdown {
  target: SystemTarget;
  totalActions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  topActions: string[];
}

export interface TimePatterns {
  hourlyDistribution: number[];
  dailyDistribution: number[];
  weekdayVsWeekend: { weekday: number; weekend: number };
  peakHours: number[];
  quietHours: number[];
}

export interface EffectivenessMetrics {
  taskCompletionCorrelation: number; // Does triggering lead to more completions?
  streakMaintenance: number; // Do triggers help maintain streaks?
  arousalEngagement: number; // Do triggers work better at higher arousal?
  denialAmplification: number; // Do triggers work better at higher denial?
  sessionFollowThrough: number; // Do edge triggers lead to completed sessions?
  conditioningReinforcement: number; // Overall conditioning effectiveness
}

export interface TriggerCorrelation {
  event: SystemEvent;
  correlatedOutcome: string;
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'positive' | 'negative';
  insight: string;
}

export interface TriggerRecommendation {
  type: 'timing' | 'frequency' | 'target' | 'event' | 'context';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionable?: string;
}

// ============================================
// LOGGING
// ============================================

/**
 * Log a trigger execution for audit trail
 */
export async function logTriggerExecution(
  userId: string,
  event: SystemEvent,
  result: TriggerResult,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('trigger_executions').insert({
      user_id: userId,
      event,
      context: context || {},
      actions_executed: result.executed,
      actions_failed: result.failed,
      executed_at: new Date().toISOString(),
      session_id: context?.sessionId,
      arousal_level: context?.arousalLevel,
      denial_day: context?.denialDay,
    });
  } catch (error) {
    console.error('Failed to log trigger execution:', error);
  }
}

/**
 * Log a trigger's outcome for effectiveness tracking
 */
export async function logTriggerOutcome(
  executionId: string,
  outcome: {
    successful: boolean;
    outcomeType: string;
    details?: string;
    measuredValue?: number;
  }
): Promise<void> {
  try {
    await supabase.from('trigger_outcomes').insert({
      execution_id: executionId,
      successful: outcome.successful,
      outcome_type: outcome.outcomeType,
      details: outcome.details,
      measured_value: outcome.measuredValue,
      logged_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log trigger outcome:', error);
  }
}

// ============================================
// ANALYTICS
// ============================================

/**
 * Get comprehensive trigger analytics
 */
export async function getTriggerAnalytics(userId: string): Promise<TriggerAnalytics | null> {
  const { data: executions, error } = await supabase
    .from('trigger_executions')
    .select('*')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Failed to fetch trigger executions:', error);
    return null;
  }

  if (!executions || executions.length === 0) {
    return createEmptyAnalytics();
  }

  const mapped: TriggerExecution[] = executions.map(e => ({
    id: e.id,
    userId: e.user_id,
    event: e.event as SystemEvent,
    context: e.context || {},
    actionsExecuted: e.actions_executed || [],
    actionsFailed: e.actions_failed || [],
    executedAt: e.executed_at,
    sessionId: e.session_id,
    arousalLevel: e.arousal_level,
    denialDay: e.denial_day,
  }));

  const overview = calculateOverview(mapped);
  const eventBreakdown = calculateEventBreakdown(mapped);
  const targetBreakdown = calculateTargetBreakdown(mapped);
  const timePatterns = calculateTimePatterns(mapped);
  const effectiveness = await calculateEffectiveness(userId, mapped);
  const correlations = calculateCorrelations(mapped, effectiveness);
  const recommendations = generateRecommendations(overview, eventBreakdown, timePatterns, effectiveness);

  return {
    overview,
    eventBreakdown,
    targetBreakdown,
    timePatterns,
    effectiveness,
    correlations,
    recommendations,
  };
}

// ============================================
// CALCULATIONS
// ============================================

function calculateOverview(executions: TriggerExecution[]): TriggerOverview {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const executionsToday = executions.filter(e => e.executedAt >= todayStart).length;
  const executionsThisWeek = executions.filter(e => e.executedAt >= weekAgo).length;

  const totalActions = executions.reduce((sum, e) => sum + e.actionsExecuted.length + e.actionsFailed.length, 0);
  const successfulActions = executions.reduce((sum, e) => sum + e.actionsExecuted.length, 0);
  const successRate = totalActions > 0 ? Math.round((successfulActions / totalActions) * 100) : 100;

  const uniqueEvents = new Set(executions.map(e => e.event)).size;

  // Calculate most active hour
  const hourCounts: Record<number, number> = {};
  executions.forEach(e => {
    const hour = new Date(e.executedAt).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const mostActiveHour = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 12;

  // Most triggered event
  const eventCounts: Record<string, number> = {};
  executions.forEach(e => {
    eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
  });
  const mostTriggeredEvent = Object.entries(eventCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] as SystemEvent ?? null;

  return {
    totalExecutions: executions.length,
    successRate,
    uniqueEvents,
    executionsToday,
    executionsThisWeek,
    mostActiveHour: parseInt(mostActiveHour as string),
    mostTriggeredEvent,
  };
}

function calculateEventBreakdown(executions: TriggerExecution[]): EventBreakdown[] {
  const eventStats: Record<string, {
    count: number;
    successes: number;
    failures: number;
    lastTriggered: string;
    totalActions: number;
  }> = {};

  executions.forEach(e => {
    if (!eventStats[e.event]) {
      eventStats[e.event] = {
        count: 0,
        successes: 0,
        failures: 0,
        lastTriggered: e.executedAt,
        totalActions: 0,
      };
    }

    const stats = eventStats[e.event];
    stats.count++;
    stats.successes += e.actionsExecuted.length;
    stats.failures += e.actionsFailed.length;
    stats.totalActions += e.actionsExecuted.length + e.actionsFailed.length;

    if (e.executedAt > stats.lastTriggered) {
      stats.lastTriggered = e.executedAt;
    }
  });

  return Object.entries(eventStats)
    .map(([event, stats]) => ({
      event: event as SystemEvent,
      count: stats.count,
      successRate: stats.totalActions > 0
        ? Math.round((stats.successes / stats.totalActions) * 100)
        : 100,
      lastTriggered: stats.lastTriggered,
      averageActionsPerTrigger: stats.count > 0
        ? Math.round((stats.totalActions / stats.count) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function calculateTargetBreakdown(executions: TriggerExecution[]): TargetBreakdown[] {
  const targetStats: Record<string, {
    totalActions: number;
    successCount: number;
    failureCount: number;
    actions: Record<string, number>;
  }> = {};

  executions.forEach(e => {
    e.actionsExecuted.forEach(action => {
      if (!targetStats[action.target]) {
        targetStats[action.target] = {
          totalActions: 0,
          successCount: 0,
          failureCount: 0,
          actions: {},
        };
      }
      targetStats[action.target].totalActions++;
      targetStats[action.target].successCount++;
      targetStats[action.target].actions[action.action] =
        (targetStats[action.target].actions[action.action] || 0) + 1;
    });

    e.actionsFailed.forEach(({ action }) => {
      if (!targetStats[action.target]) {
        targetStats[action.target] = {
          totalActions: 0,
          successCount: 0,
          failureCount: 0,
          actions: {},
        };
      }
      targetStats[action.target].totalActions++;
      targetStats[action.target].failureCount++;
      targetStats[action.target].actions[action.action] =
        (targetStats[action.target].actions[action.action] || 0) + 1;
    });
  });

  return Object.entries(targetStats)
    .map(([target, stats]) => ({
      target: target as SystemTarget,
      totalActions: stats.totalActions,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      successRate: stats.totalActions > 0
        ? Math.round((stats.successCount / stats.totalActions) * 100)
        : 100,
      topActions: Object.entries(stats.actions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([action]) => action),
    }))
    .sort((a, b) => b.totalActions - a.totalActions);
}

function calculateTimePatterns(executions: TriggerExecution[]): TimePatterns {
  const hourlyDistribution = new Array(24).fill(0);
  const dailyDistribution = new Array(7).fill(0);
  let weekdayCount = 0;
  let weekendCount = 0;

  executions.forEach(e => {
    const date = new Date(e.executedAt);
    const hour = date.getHours();
    const day = date.getDay();

    hourlyDistribution[hour]++;
    dailyDistribution[day]++;

    if (day === 0 || day === 6) {
      weekendCount++;
    } else {
      weekdayCount++;
    }
  });

  // Find peak and quiet hours
  const avgHourly = hourlyDistribution.reduce((a, b) => a + b, 0) / 24;
  const peakHours = hourlyDistribution
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count > avgHourly * 1.5)
    .map(h => h.hour);

  const quietHours = hourlyDistribution
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count < avgHourly * 0.3)
    .map(h => h.hour);

  return {
    hourlyDistribution,
    dailyDistribution,
    weekdayVsWeekend: { weekday: weekdayCount, weekend: weekendCount },
    peakHours,
    quietHours,
  };
}

async function calculateEffectiveness(
  userId: string,
  executions: TriggerExecution[]
): Promise<EffectivenessMetrics> {
  // Get task completions to correlate
  const { data: taskCompletions } = await supabase
    .from('task_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .gte('completed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Get edge sessions to correlate
  const { data: sessions } = await supabase
    .from('edge_sessions')
    .select('started_at, status')
    .eq('user_id', userId)
    .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Task completion correlation
  const taskTriggers = executions.filter(e => e.event === 'task_completed');
  const taskCompletionCorrelation = calculateTemporalCorrelation(
    taskTriggers.map(e => e.executedAt),
    (taskCompletions || []).map(t => t.completed_at)
  );

  // Session follow-through (edge triggers -> completed sessions)
  const edgeTriggers = executions.filter(e =>
    e.event === 'edge_reached' || e.event === 'edge_session_completed'
  );
  const completedSessions = (sessions || []).filter(s => s.status === 'completed');
  const sessionFollowThrough = completedSessions.length > 0 && edgeTriggers.length > 0
    ? Math.min(100, Math.round((completedSessions.length / edgeTriggers.length) * 100))
    : 50;

  // Arousal engagement (do triggers at higher arousal work better?)
  const highArousalTriggers = executions.filter(e => (e.arousalLevel || 0) >= 7);
  const lowArousalTriggers = executions.filter(e => (e.arousalLevel || 0) < 7);
  const highArousalSuccess = highArousalTriggers.length > 0
    ? highArousalTriggers.filter(e => e.actionsFailed.length === 0).length / highArousalTriggers.length
    : 0.5;
  const lowArousalSuccess = lowArousalTriggers.length > 0
    ? lowArousalTriggers.filter(e => e.actionsFailed.length === 0).length / lowArousalTriggers.length
    : 0.5;
  const arousalEngagement = Math.round((highArousalSuccess / Math.max(lowArousalSuccess, 0.1)) * 50);

  // Denial amplification
  const highDenialTriggers = executions.filter(e => (e.denialDay || 0) >= 5);
  const denialAmplification = highDenialTriggers.length > 0
    ? Math.round((highDenialTriggers.length / executions.length) * 100)
    : 0;

  // Overall conditioning (based on consistency and variety)
  const uniqueEvents = new Set(executions.map(e => e.event)).size;
  const conditioningReinforcement = Math.min(100, Math.round(
    (executions.length / 100) * 30 + // Volume
    uniqueEvents * 5 + // Variety
    (taskCompletionCorrelation * 0.3) // Correlation
  ));

  return {
    taskCompletionCorrelation: Math.round(taskCompletionCorrelation),
    streakMaintenance: 70, // Would need streak data
    arousalEngagement: Math.min(100, arousalEngagement),
    denialAmplification: Math.min(100, denialAmplification),
    sessionFollowThrough,
    conditioningReinforcement,
  };
}

function calculateTemporalCorrelation(timestamps1: string[], timestamps2: string[]): number {
  if (timestamps1.length === 0 || timestamps2.length === 0) return 50;

  // Simple temporal proximity scoring
  let correlationScore = 0;
  const windowMs = 60 * 60 * 1000; // 1 hour window

  for (const t1 of timestamps1) {
    const t1Ms = new Date(t1).getTime();
    for (const t2 of timestamps2) {
      const t2Ms = new Date(t2).getTime();
      const diff = Math.abs(t1Ms - t2Ms);
      if (diff < windowMs) {
        correlationScore += 1 - (diff / windowMs);
      }
    }
  }

  const maxPossible = Math.min(timestamps1.length, timestamps2.length);
  return maxPossible > 0 ? Math.round((correlationScore / maxPossible) * 100) : 50;
}

function calculateCorrelations(
  executions: TriggerExecution[],
  effectiveness: EffectivenessMetrics
): TriggerCorrelation[] {
  const correlations: TriggerCorrelation[] = [];

  // Task completion correlation
  if (effectiveness.taskCompletionCorrelation > 60) {
    correlations.push({
      event: 'task_completed',
      correlatedOutcome: 'Task momentum',
      strength: effectiveness.taskCompletionCorrelation > 80 ? 'strong' : 'moderate',
      direction: 'positive',
      insight: 'Task completion triggers are reinforcing positive habits',
    });
  }

  // Arousal-based correlation
  const arousalEvents = executions.filter(e => (e.arousalLevel || 0) >= 7);
  if (arousalEvents.length > 10 && effectiveness.arousalEngagement > 60) {
    correlations.push({
      event: 'edge_reached',
      correlatedOutcome: 'Arousal receptivity',
      strength: effectiveness.arousalEngagement > 80 ? 'strong' : 'moderate',
      direction: 'positive',
      insight: 'Triggers during high arousal are more effective',
    });
  }

  // Session follow-through
  if (effectiveness.sessionFollowThrough > 70) {
    correlations.push({
      event: 'edge_session_completed',
      correlatedOutcome: 'Session completion',
      strength: 'strong',
      direction: 'positive',
      insight: 'Edge triggers are leading to completed sessions',
    });
  } else if (effectiveness.sessionFollowThrough < 40) {
    correlations.push({
      event: 'edge_reached',
      correlatedOutcome: 'Session abandonment',
      strength: 'moderate',
      direction: 'negative',
      insight: 'Many edge sessions are being abandoned - consider gentler pacing',
    });
  }

  return correlations;
}

function generateRecommendations(
  overview: TriggerOverview,
  eventBreakdown: EventBreakdown[],
  timePatterns: TimePatterns,
  effectiveness: EffectivenessMetrics
): TriggerRecommendation[] {
  const recommendations: TriggerRecommendation[] = [];

  // Low success rate
  if (overview.successRate < 90) {
    recommendations.push({
      type: 'target',
      title: 'Action Failures Detected',
      description: `Only ${overview.successRate}% success rate. Some trigger actions are failing.`,
      priority: 'high',
      actionable: 'Check failed actions in the breakdown',
    });
  }

  // Underutilized triggers
  const lowCountEvents = eventBreakdown.filter(e => e.count < 5);
  if (lowCountEvents.length > 0) {
    recommendations.push({
      type: 'event',
      title: 'Underutilized Triggers',
      description: `${lowCountEvents.length} trigger types rarely fire. Consider enabling more features.`,
      priority: 'medium',
    });
  }

  // Timing optimization
  if (timePatterns.quietHours.length > 8) {
    recommendations.push({
      type: 'timing',
      title: 'Large Quiet Windows',
      description: 'Triggers are concentrated in certain hours. Consider spreading activity.',
      priority: 'low',
    });
  }

  // Effectiveness-based
  if (effectiveness.sessionFollowThrough < 50) {
    recommendations.push({
      type: 'context',
      title: 'Improve Session Follow-Through',
      description: 'Edge triggers aren\'t leading to completed sessions. Consider adjusting session difficulty.',
      priority: 'high',
    });
  }

  if (effectiveness.arousalEngagement > 80) {
    recommendations.push({
      type: 'context',
      title: 'Leverage High Arousal',
      description: 'Triggers work much better during high arousal. Time important triggers accordingly.',
      priority: 'medium',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations.slice(0, 5);
}

// ============================================
// EMPTY STATE
// ============================================

function createEmptyAnalytics(): TriggerAnalytics {
  return {
    overview: {
      totalExecutions: 0,
      successRate: 100,
      uniqueEvents: 0,
      executionsToday: 0,
      executionsThisWeek: 0,
      mostActiveHour: 12,
      mostTriggeredEvent: null,
    },
    eventBreakdown: [],
    targetBreakdown: [],
    timePatterns: {
      hourlyDistribution: new Array(24).fill(0),
      dailyDistribution: new Array(7).fill(0),
      weekdayVsWeekend: { weekday: 0, weekend: 0 },
      peakHours: [],
      quietHours: Array.from({ length: 24 }, (_, i) => i),
    },
    effectiveness: {
      taskCompletionCorrelation: 50,
      streakMaintenance: 50,
      arousalEngagement: 50,
      denialAmplification: 0,
      sessionFollowThrough: 50,
      conditioningReinforcement: 0,
    },
    correlations: [],
    recommendations: [{
      type: 'event',
      title: 'No Trigger Data Yet',
      description: 'Use the app to generate trigger events for analysis.',
      priority: 'medium',
    }],
  };
}

// ============================================
// EXPORTS FOR SQL SCHEMA
// ============================================

export const TRIGGER_AUDIT_SQL = `
-- Trigger execution audit trail
CREATE TABLE IF NOT EXISTS trigger_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  actions_executed JSONB DEFAULT '[]',
  actions_failed JSONB DEFAULT '[]',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT,
  arousal_level INT,
  denial_day INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_trigger_executions_user ON trigger_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_trigger_executions_event ON trigger_executions(event);
CREATE INDEX IF NOT EXISTS idx_trigger_executions_date ON trigger_executions(executed_at);

-- Trigger outcomes for effectiveness tracking
CREATE TABLE IF NOT EXISTS trigger_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES trigger_executions(id),
  successful BOOLEAN NOT NULL,
  outcome_type TEXT NOT NULL,
  details TEXT,
  measured_value DECIMAL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_outcomes_execution ON trigger_outcomes(execution_id);

-- RLS policies
ALTER TABLE trigger_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trigger executions"
  ON trigger_executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trigger executions"
  ON trigger_executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own trigger outcomes"
  ON trigger_outcomes FOR SELECT
  USING (
    execution_id IN (
      SELECT id FROM trigger_executions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert trigger outcomes for their executions"
  ON trigger_outcomes FOR INSERT
  WITH CHECK (
    execution_id IN (
      SELECT id FROM trigger_executions WHERE user_id = auth.uid()
    )
  );
`;
