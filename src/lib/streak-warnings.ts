/**
 * Streak Warning System
 *
 * Proactive warning system for streak protection based on:
 * - Historical slip patterns
 * - Arousal forecasting
 * - Time-based risk factors
 * - Activity patterns
 */

import { supabase } from './supabase';
import { getQuickForecast } from './arousal-forecast';

// ============================================
// TYPES
// ============================================

export type WarningLevel = 'info' | 'caution' | 'warning' | 'critical';
export type WarningCategory = 'slip_risk' | 'inactivity' | 'pattern' | 'time_based' | 'historical';

export interface StreakWarning {
  id: string;
  userId: string;
  level: WarningLevel;
  category: WarningCategory;
  title: string;
  message: string;
  details?: string;
  actionSuggestion?: string;
  triggerData: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt?: string;
  dismissedAt?: string;
  expiresAt: string;
}

export interface StreakStatus {
  currentStreak: number;
  isActive: boolean;
  riskLevel: WarningLevel;
  activeWarnings: StreakWarning[];
  lastWarningCheck: string;
  safetyScore: number; // 0-100
  recommendations: string[];
}

export interface WarningConfig {
  enabled: boolean;
  checkIntervalMinutes: number;
  warningThresholds: {
    caution: number;  // Days before historical slip average
    warning: number;
    critical: number;
  };
  notificationEnabled: boolean;
  hapticAlertEnabled: boolean;
  quietHours: { start: number; end: number }; // 24hr format
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Check for streak warnings and generate new ones if needed
 */
export async function checkStreakWarnings(userId: string): Promise<StreakWarning[]> {
  const warnings: StreakWarning[] = [];
  const now = new Date();

  // Get forecast data
  const forecast = await getQuickForecast(userId);
  if (!forecast) return warnings;

  // Get historical data
  const { data: streakData } = await supabase
    .from('denial_streaks')
    .select('started_at, ended_at, days_completed, ended_by')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(10);

  const currentDay = forecast.currentDay;
  const riskLevel = forecast.riskLevel;

  // Calculate historical slip day
  const completedStreaks = (streakData || []).filter(s => s.ended_at && s.days_completed);
  const avgStreakLength = completedStreaks.length > 0
    ? completedStreaks.reduce((sum, s) => sum + (s.days_completed || 0), 0) / completedStreaks.length
    : 7;

  // Calculate days until historical average
  const daysUntilAvg = Math.max(0, avgStreakLength - currentDay);

  // 1. Slip Risk Warnings
  if (riskLevel === 'critical') {
    warnings.push(createWarning(userId, {
      level: 'critical',
      category: 'slip_risk',
      title: 'Critical Slip Risk',
      message: `You're at day ${currentDay} - historically a high-risk period.`,
      details: `Your arousal state indicates ${forecast.riskLevel} risk level.`,
      actionSuggestion: 'Consider a planned release or intensive cooldown routine.',
      expiresHours: 6,
    }));
  } else if (riskLevel === 'high') {
    warnings.push(createWarning(userId, {
      level: 'warning',
      category: 'slip_risk',
      title: 'Elevated Slip Risk',
      message: `Day ${currentDay} approaching your typical threshold.`,
      actionSuggestion: 'Use anchors and mindfulness to maintain control.',
      expiresHours: 12,
    }));
  } else if (daysUntilAvg <= 2 && daysUntilAvg > 0) {
    warnings.push(createWarning(userId, {
      level: 'caution',
      category: 'historical',
      title: 'Approaching Historical Average',
      message: `${Math.round(daysUntilAvg)} days until your average streak length (${Math.round(avgStreakLength)} days).`,
      actionSuggestion: 'Plan ahead to beat your average.',
      expiresHours: 24,
    }));
  }

  // 2. Time-Based Warnings
  const hour = now.getHours();
  if (riskLevel !== 'low' && hour >= 22) {
    warnings.push(createWarning(userId, {
      level: 'caution',
      category: 'time_based',
      title: 'Late Night Awareness',
      message: 'Slip risk often increases late at night.',
      actionSuggestion: 'Consider ending your day or using sleep programming.',
      expiresHours: 8,
    }));
  }

  // 3. Sweet Spot Opportunity
  if (forecast.daysUntilSweetSpot === 0 && forecast.currentState === 'sweet_spot') {
    warnings.push(createWarning(userId, {
      level: 'info',
      category: 'pattern',
      title: 'Sweet Spot Active',
      message: 'You\'re in the sweet spot - peak receptivity for conditioning.',
      actionSuggestion: 'This is an excellent time for deep work.',
      expiresHours: 24,
    }));
  }

  // 4. Check for streak record proximity
  const { data: longestStreak } = await supabase
    .from('denial_streaks')
    .select('days_completed')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('days_completed', { ascending: false })
    .limit(1)
    .maybeSingle();

  const personalRecord = longestStreak?.days_completed || 0;
  if (personalRecord > 0 && currentDay >= personalRecord - 1 && currentDay <= personalRecord + 1) {
    warnings.push(createWarning(userId, {
      level: 'info',
      category: 'pattern',
      title: 'Near Personal Record!',
      message: `You're at day ${currentDay}. Your record is ${personalRecord} days.`,
      actionSuggestion: currentDay > personalRecord
        ? 'You\'re in uncharted territory - stay vigilant!'
        : 'Push through to beat your record!',
      expiresHours: 24,
    }));
  }

  // Store warnings
  for (const warning of warnings) {
    await storeWarning(warning);
  }

  return warnings;
}

/**
 * Get current streak status with active warnings
 */
export async function getStreakStatus(userId: string): Promise<StreakStatus> {
  // Get current streak
  const { data: currentStreak } = await supabase
    .from('denial_streaks')
    .select('started_at')
    .eq('user_id', userId)
    .is('ended_at', null)
    .limit(1)
    .maybeSingle();

  const streakDays = currentStreak
    ? Math.floor((Date.now() - new Date(currentStreak.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Get active warnings
  const { data: warnings } = await supabase
    .from('streak_warnings')
    .select('*')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  const activeWarnings: StreakWarning[] = (warnings || []).map(w => ({
    id: w.id,
    userId: w.user_id,
    level: w.level as WarningLevel,
    category: w.category as WarningCategory,
    title: w.title,
    message: w.message,
    details: w.details,
    actionSuggestion: w.action_suggestion,
    triggerData: w.trigger_data || {},
    createdAt: w.created_at,
    acknowledgedAt: w.acknowledged_at,
    dismissedAt: w.dismissed_at,
    expiresAt: w.expires_at,
  }));

  // Determine risk level
  let riskLevel: WarningLevel = 'info';
  for (const warning of activeWarnings) {
    if (warning.level === 'critical') riskLevel = 'critical';
    else if (warning.level === 'warning' && riskLevel !== 'critical') riskLevel = 'warning';
    else if (warning.level === 'caution' && riskLevel === 'info') riskLevel = 'caution';
  }

  // Calculate safety score
  let safetyScore = 100;
  for (const warning of activeWarnings) {
    if (warning.level === 'critical') safetyScore -= 40;
    else if (warning.level === 'warning') safetyScore -= 25;
    else if (warning.level === 'caution') safetyScore -= 10;
  }
  safetyScore = Math.max(0, safetyScore);

  // Generate recommendations
  const recommendations = generateRecommendations(activeWarnings, streakDays, safetyScore);

  return {
    currentStreak: streakDays,
    isActive: !!currentStreak,
    riskLevel,
    activeWarnings,
    lastWarningCheck: new Date().toISOString(),
    safetyScore,
    recommendations,
  };
}

/**
 * Acknowledge a warning (user has seen it)
 */
export async function acknowledgeWarning(warningId: string): Promise<boolean> {
  const { error } = await supabase
    .from('streak_warnings')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', warningId);

  return !error;
}

/**
 * Dismiss a warning
 */
export async function dismissWarning(warningId: string): Promise<boolean> {
  const { error } = await supabase
    .from('streak_warnings')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', warningId);

  return !error;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createWarning(
  userId: string,
  params: {
    level: WarningLevel;
    category: WarningCategory;
    title: string;
    message: string;
    details?: string;
    actionSuggestion?: string;
    expiresHours: number;
  }
): StreakWarning {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.expiresHours * 60 * 60 * 1000);

  return {
    id: `warning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    level: params.level,
    category: params.category,
    title: params.title,
    message: params.message,
    details: params.details,
    actionSuggestion: params.actionSuggestion,
    triggerData: {},
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

async function storeWarning(warning: StreakWarning): Promise<void> {
  // Check if similar warning already exists
  const { data: existing } = await supabase
    .from('streak_warnings')
    .select('id')
    .eq('user_id', warning.userId)
    .eq('category', warning.category)
    .eq('level', warning.level)
    .is('dismissed_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    // Don't create duplicate warning
    return;
  }

  await supabase.from('streak_warnings').insert({
    id: warning.id,
    user_id: warning.userId,
    level: warning.level,
    category: warning.category,
    title: warning.title,
    message: warning.message,
    details: warning.details,
    action_suggestion: warning.actionSuggestion,
    trigger_data: warning.triggerData,
    created_at: warning.createdAt,
    expires_at: warning.expiresAt,
  });
}

function generateRecommendations(
  warnings: StreakWarning[],
  streakDays: number,
  safetyScore: number
): string[] {
  const recommendations: string[] = [];

  if (safetyScore < 50) {
    recommendations.push('Consider using mindfulness or anchor techniques to regain control.');
  }

  if (warnings.some(w => w.category === 'slip_risk' && w.level === 'critical')) {
    recommendations.push('This is a decision point: planned release or intensive cooldown.');
  }

  if (warnings.some(w => w.category === 'time_based')) {
    recommendations.push('Late night is high-risk. Consider sleep or distraction.');
  }

  if (streakDays >= 7 && safetyScore >= 70) {
    recommendations.push('Strong streak! Your discipline is building.');
  }

  if (warnings.some(w => w.title.includes('Sweet Spot'))) {
    recommendations.push('Use this sweet spot for conditioning work.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Streak looks healthy. Stay mindful and keep going.');
  }

  return recommendations;
}

// ============================================
// NOTIFICATION HELPERS
// ============================================

export function getWarningIcon(level: WarningLevel): string {
  switch (level) {
    case 'critical': return 'AlertOctagon';
    case 'warning': return 'AlertTriangle';
    case 'caution': return 'AlertCircle';
    case 'info': return 'Info';
  }
}

export function getWarningColor(level: WarningLevel, isBambiMode: boolean): string {
  if (isBambiMode) {
    switch (level) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'warning': return 'text-orange-600 bg-orange-100';
      case 'caution': return 'text-yellow-600 bg-yellow-100';
      case 'info': return 'text-blue-600 bg-blue-100';
    }
  }
  switch (level) {
    case 'critical': return 'text-red-400 bg-red-900/30';
    case 'warning': return 'text-orange-400 bg-orange-900/30';
    case 'caution': return 'text-yellow-400 bg-yellow-900/30';
    case 'info': return 'text-blue-400 bg-blue-900/30';
  }
}

// ============================================
// SQL SCHEMA
// ============================================

export const STREAK_WARNINGS_SQL = `
-- Streak warnings table
CREATE TABLE IF NOT EXISTS streak_warnings (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  action_suggestion TEXT,
  trigger_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_streak_warnings_user ON streak_warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_warnings_active ON streak_warnings(user_id, dismissed_at, expires_at);

-- RLS
ALTER TABLE streak_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own warnings"
  ON streak_warnings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own warnings"
  ON streak_warnings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own warnings"
  ON streak_warnings FOR UPDATE
  USING (auth.uid() = user_id);
`;
