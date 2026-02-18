/**
 * Task Curation Library
 *
 * Selection algorithm and database functions for the swipe-based task curation system.
 */

import { supabase } from './supabase';
import type { Task, FeminizationDomain } from '../types/task-bank';
import type {
  TaskCuration,
  DbTaskCuration,
  UserTaskPreferences,
  DbUserTaskPreferences,
  CurationSession,
  DbCurationSession,
  CurationDecision,
  CurationContext,
  CurationStats,
  SessionEndingReason,
} from '../types/task-curation';

// Import dbTaskToTask from task-bank
import { getAllTasks } from './task-bank';

// ============================================
// CONVERTERS
// ============================================

function dbCurationToCuration(db: DbTaskCuration): TaskCuration {
  return {
    id: db.id,
    userId: db.user_id,
    taskId: db.task_id,
    decision: db.decision as CurationDecision,
    decidedAt: db.decided_at,
    intensityAtDecision: db.intensity_at_decision,
    domainAtDecision: db.domain_at_decision,
    categoryAtDecision: db.category_at_decision,
    sessionPosition: db.session_position,
    swipeDurationMs: db.swipe_duration_ms || undefined,
    improvementFeedback: db.improvement_feedback || undefined,
  };
}

function dbPreferencesToPreferences(db: DbUserTaskPreferences): UserTaskPreferences {
  return {
    id: db.id,
    userId: db.user_id,
    categoryWeights: db.category_weights || {},
    domainWeights: db.domain_weights || {},
    intensityComfort: db.intensity_comfort,
    intensityProgressionRate: db.intensity_progression_rate,
    totalCurations: db.total_curations,
    keepRate: db.keep_rate,
    lastSessionAt: db.last_session_at || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function dbSessionToSession(db: DbCurationSession): CurationSession {
  return {
    id: db.id,
    userId: db.user_id,
    startedAt: db.started_at,
    endedAt: db.ended_at || undefined,
    tasksShown: db.tasks_shown,
    tasksKept: db.tasks_kept,
    tasksRejected: db.tasks_rejected,
    tasksNeedsWork: db.tasks_needs_work,
    maxIntensityReached: db.max_intensity_reached,
    sessionCompleted: db.session_completed,
    endingReason: db.ending_reason as SessionEndingReason | undefined,
  };
}

// ============================================
// TASK SELECTION FOR CURATION
// ============================================

/**
 * Get domain progression order based on protocol priority.
 *
 * PRIORITY ORDER (aligned with 5-domain escalation structure):
 * 1. AROUSAL DOMAINS (highest) - arousal, conditioning, chastity
 * 2. SISSIFICATION DOMAINS - identity, inner_narrative
 * 3. SUBMISSION DOMAINS - body_language, social
 * 4. FEMINIZATION DOMAINS (lowest) - movement, voice, skincare, style, makeup
 */
function getDomainProgressionOrder(
  preferences?: UserTaskPreferences
): FeminizationDomain[] {
  // STRENGTHENED: Priority-ordered domains - arousal first, feminization last
  const priorityOrderedDomains: FeminizationDomain[] = [
    // Arousal domain tasks (highest priority)
    'arousal',
    'conditioning',
    'chastity',
    // Sissification/Identity domain tasks
    'identity',
    'inner_narrative',
    // Submission domain tasks
    'body_language',
    'social',
    // Feminization domain tasks (lowest priority)
    'movement',
    'voice',
    'style',
    'makeup',
    'skincare', // Lowest of all
  ];

  if (!preferences || Object.keys(preferences.domainWeights).length === 0) {
    return priorityOrderedDomains;
  }

  // Apply learned preferences but maintain base priority order
  // Preferences can boost within tiers but arousal domains always come first
  return [...priorityOrderedDomains].sort((a, b) => {
    const priorityA = priorityOrderedDomains.indexOf(a);
    const priorityB = priorityOrderedDomains.indexOf(b);
    const weightA = preferences.domainWeights[a] || 1.0;
    const weightB = preferences.domainWeights[b] || 1.0;

    // Strong priority weighting - protocol priority matters more than preference
    const adjustedA = priorityA * 10 - weightA * 2;
    const adjustedB = priorityB * 10 - weightB * 2;

    return adjustedA - adjustedB;
  });
}

/**
 * Calculate goal alignment score for a task based on ultimateDestination keywords.
 */
function calculateGoalAlignment(
  task: Task,
  ultimateDestination?: string[]
): number {
  if (!ultimateDestination?.length) return 0.5;

  const taskText = `${task.instruction} ${task.subtext || ''} ${task.category} ${task.domain}`.toLowerCase();
  let matchScore = 0;

  for (const destination of ultimateDestination) {
    const keywords = destination.toLowerCase().split(/\s+/);
    for (const keyword of keywords) {
      if (keyword.length > 3 && taskText.includes(keyword)) {
        matchScore += 1;
      }
    }
  }

  // Normalize to 0-1 range
  return Math.min(matchScore / 5, 1);
}

/**
 * Select the next task for curation based on progressive escalation.
 *
 * Selection criteria:
 * 1. Intensity: prefer current level, slight bonus for +1
 * 2. Domain progression: comfortable domains first
 * 3. Goal alignment: matches ultimateDestination
 * 4. Category preference: from learned weights
 * 5. Excludes: already-evaluated tasks, hard limits
 */
export async function selectNextCurationTask(
  context: CurationContext
): Promise<Task | null> {
  // Get all active tasks
  const allTasks = await getAllTasks();

  if (!allTasks.length) return null;

  // Filter out evaluated tasks and hard limits
  const availableTasks = allTasks.filter(task => {
    // Already evaluated
    if (context.evaluatedTaskIds.includes(task.id)) return false;

    // Hard limit check - exclude if task matches any hard limit
    if (context.hardLimits.length > 0) {
      const taskText = `${task.instruction} ${task.subtext || ''} ${task.category} ${task.domain}`.toLowerCase();
      for (const limit of context.hardLimits) {
        if (taskText.includes(limit.toLowerCase())) return false;
      }
    }

    return true;
  });

  if (availableTasks.length === 0) return null;

  // Get domain progression order
  const domainOrder = getDomainProgressionOrder(context.preferences);

  // Score each task
  const scoredTasks = availableTasks.map(task => {
    let score = 0;

    // 1. Intensity scoring - prefer tasks at or near current intensity
    const intensityDiff = Math.abs(task.intensity - context.currentIntensity);
    score += (5 - intensityDiff) * 10; // Max 50 points

    // Bonus for exact match and slight bonus for +1
    if (task.intensity === context.currentIntensity) score += 15;
    if (task.intensity === context.currentIntensity + 1) score += 8;

    // 2. Domain progression scoring - earlier in list = higher score
    const domainIndex = domainOrder.indexOf(task.domain);
    if (domainIndex >= 0) {
      score += (12 - domainIndex) * 3; // Max 36 points
    }

    // 3. Goal alignment scoring
    const alignment = calculateGoalAlignment(task, context.ultimateDestination);
    score += alignment * 20; // Max 20 points

    // 4. Category preference weighting
    if (context.preferences?.categoryWeights[task.category]) {
      score += context.preferences.categoryWeights[task.category] * 10;
    }

    // 5. Soft limit penalty
    if (context.softLimits.length > 0) {
      const taskText = `${task.instruction} ${task.subtext || ''} ${task.category} ${task.domain}`.toLowerCase();
      for (const limit of context.softLimits) {
        if (taskText.includes(limit.toLowerCase())) {
          score -= 15;
          break;
        }
      }
    }

    return { task, score };
  });

  // Sort by score
  scoredTasks.sort((a, b) => b.score - a.score);

  // Random selection from top 3 to avoid predictability
  const topCount = Math.min(3, scoredTasks.length);
  const topCandidates = scoredTasks.slice(0, topCount);
  const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  return selected?.task || null;
}

// ============================================
// CURATION RECORDING
// ============================================

export async function recordCurationDecision(
  userId: string,
  taskId: string,
  decision: CurationDecision,
  context: {
    intensity: number;
    domain: string;
    category: string;
    sessionPosition: number;
    swipeDurationMs?: number;
    improvementFeedback?: string;
  }
): Promise<TaskCuration> {
  const { data, error } = await supabase
    .from('user_task_curations')
    .upsert({
      user_id: userId,
      task_id: taskId,
      decision,
      intensity_at_decision: context.intensity,
      domain_at_decision: context.domain,
      category_at_decision: context.category,
      session_position: context.sessionPosition,
      swipe_duration_ms: context.swipeDurationMs,
      improvement_feedback: context.improvementFeedback,
    }, { onConflict: 'user_id,task_id' })
    .select()
    .single();

  if (error) throw error;
  return dbCurationToCuration(data);
}

// ============================================
// SESSION MANAGEMENT
// ============================================

export async function startCurationSession(userId: string): Promise<CurationSession> {
  const { data, error } = await supabase
    .from('curation_sessions')
    .insert({ user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return dbSessionToSession(data);
}

export async function updateCurationSession(
  sessionId: string,
  updates: Partial<{
    tasksShown: number;
    tasksKept: number;
    tasksRejected: number;
    tasksNeedsWork: number;
    maxIntensityReached: number;
  }>
): Promise<void> {
  const dbUpdates: Partial<DbCurationSession> = {};

  if (updates.tasksShown !== undefined) dbUpdates.tasks_shown = updates.tasksShown;
  if (updates.tasksKept !== undefined) dbUpdates.tasks_kept = updates.tasksKept;
  if (updates.tasksRejected !== undefined) dbUpdates.tasks_rejected = updates.tasksRejected;
  if (updates.tasksNeedsWork !== undefined) dbUpdates.tasks_needs_work = updates.tasksNeedsWork;
  if (updates.maxIntensityReached !== undefined) dbUpdates.max_intensity_reached = updates.maxIntensityReached;

  const { error } = await supabase
    .from('curation_sessions')
    .update(dbUpdates)
    .eq('id', sessionId);

  if (error) throw error;
}

export async function endCurationSession(
  sessionId: string,
  reason: SessionEndingReason
): Promise<void> {
  const { error } = await supabase
    .from('curation_sessions')
    .update({
      ended_at: new Date().toISOString(),
      session_completed: true,
      ending_reason: reason,
    })
    .eq('id', sessionId);

  if (error) throw error;
}

// ============================================
// PREFERENCE LEARNING
// ============================================

export async function getUserPreferences(userId: string): Promise<UserTaskPreferences | null> {
  const { data, error } = await supabase
    .from('user_task_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return dbPreferencesToPreferences(data);
}

export async function updatePreferencesFromCuration(
  userId: string,
  curation: TaskCuration
): Promise<void> {
  // Get current preferences or create defaults
  let prefs = await getUserPreferences(userId);

  const categoryWeights: Record<string, number> = prefs?.categoryWeights || {};
  const domainWeights: Record<string, number> = prefs?.domainWeights || {};
  let intensityComfort = prefs?.intensityComfort || 1;
  const intensityProgressionRate = prefs?.intensityProgressionRate || 0.1;
  let totalCurations = prefs?.totalCurations || 0;

  const category = curation.categoryAtDecision;
  const domain = curation.domainAtDecision;
  const learningRate = 0.1;

  if (curation.decision === 'keep') {
    // Increase weights for kept tasks
    categoryWeights[category] = (categoryWeights[category] || 1.0) + learningRate;
    domainWeights[domain] = (domainWeights[domain] || 1.0) + learningRate;

    // Update intensity comfort if they kept a higher intensity task
    if (curation.intensityAtDecision > intensityComfort) {
      intensityComfort = Math.min(5, intensityComfort + intensityProgressionRate);
    }
  } else if (curation.decision === 'reject') {
    // Decrease weights for rejected tasks
    categoryWeights[category] = Math.max(0.1, (categoryWeights[category] || 1.0) - learningRate);
    domainWeights[domain] = Math.max(0.1, (domainWeights[domain] || 1.0) - learningRate);
  }
  // 'needs_work' doesn't change weights - task stays in rotation

  totalCurations++;

  // Calculate new keep rate
  const { count: keptCount } = await supabase
    .from('user_task_curations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('decision', 'keep');

  const keepRate = totalCurations > 0 ? (keptCount || 0) / totalCurations : 0.5;

  // Save updated preferences
  const { error } = await supabase
    .from('user_task_preferences')
    .upsert({
      user_id: userId,
      category_weights: categoryWeights,
      domain_weights: domainWeights,
      intensity_comfort: intensityComfort,
      intensity_progression_rate: intensityProgressionRate,
      total_curations: totalCurations,
      keep_rate: keepRate,
      last_session_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) throw error;
}

// ============================================
// CURATED TASK QUERIES
// ============================================

export async function getCuratedTaskIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_task_curations')
    .select('task_id')
    .eq('user_id', userId)
    .eq('decision', 'keep');

  if (error) throw error;
  return (data || []).map(d => d.task_id);
}

export async function getEvaluatedTaskIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_task_curations')
    .select('task_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data || []).map(d => d.task_id);
}

export async function getCurationStats(userId: string): Promise<CurationStats> {
  const { data, error } = await supabase
    .from('user_task_curations')
    .select('decision')
    .eq('user_id', userId);

  if (error) throw error;

  const curations = data || [];
  const kept = curations.filter(c => c.decision === 'keep').length;
  const rejected = curations.filter(c => c.decision === 'reject').length;
  const needsWork = curations.filter(c => c.decision === 'needs_work').length;

  return {
    totalEvaluated: curations.length,
    kept,
    rejected,
    needsWork,
    keepRate: curations.length > 0 ? kept / curations.length : 0,
  };
}

export async function getRemainingTaskCount(
  userId: string,
  hardLimits: string[] = []
): Promise<number> {
  const allTasks = await getAllTasks();
  const evaluatedIds = await getEvaluatedTaskIds(userId);

  const remaining = allTasks.filter(task => {
    if (evaluatedIds.includes(task.id)) return false;

    // Check hard limits
    if (hardLimits.length > 0) {
      const taskText = `${task.instruction} ${task.subtext || ''} ${task.category} ${task.domain}`.toLowerCase();
      for (const limit of hardLimits) {
        if (taskText.includes(limit.toLowerCase())) return false;
      }
    }

    return true;
  });

  return remaining.length;
}

// ============================================
// ENHANCED ML-LIKE PREFERENCE LEARNING
// ============================================

export interface CurationInsights {
  // Intensity analysis
  intensityCeiling: number;              // Max intensity user accepts
  intensityComfortZone: [number, number]; // Range user is comfortable with
  intensityRejectionRate: Record<number, number>; // Rejection rate per intensity

  // Category analysis
  categoryFatigue: Record<string, number>; // How tired of each category (0-1)
  categoryMomentum: Record<string, number>; // Recent acceptance momentum
  strongPreferences: string[];           // Categories with strong positive signal
  avoidancePatterns: string[];           // Categories being avoided

  // Timing analysis
  optimalHours: number[];                // Best hours for curation (0-23)
  sessionFatigue: number;                // How tired in current session (0-1)
  averageSwipeSpeed: number;             // Average ms per decision

  // Pattern analysis
  inferredSoftLimits: string[];          // Keywords/patterns being rejected
  sequentialPatterns: Array<{            // What categories follow what
    after: string;
    preferred: string[];
  }>;

  // Confidence metrics
  predictionAccuracy: number;            // How accurate our predictions are
  dataConfidence: number;                // How much data we have (0-1)
}

/**
 * Analyze curation history to generate ML-like insights
 */
export async function analyzeCurationPatterns(userId: string): Promise<CurationInsights> {
  // Fetch all curation history
  const { data: curations, error } = await supabase
    .from('user_task_curations')
    .select('*')
    .eq('user_id', userId)
    .order('decided_at', { ascending: true });

  if (error || !curations || curations.length === 0) {
    return getDefaultInsights();
  }

  const history = curations.map(dbCurationToCuration);

  return {
    intensityCeiling: calculateIntensityCeiling(history),
    intensityComfortZone: calculateComfortZone(history),
    intensityRejectionRate: calculateIntensityRejectionRates(history),
    categoryFatigue: calculateCategoryFatigue(history),
    categoryMomentum: calculateCategoryMomentum(history),
    strongPreferences: findStrongPreferences(history),
    avoidancePatterns: findAvoidancePatterns(history),
    optimalHours: findOptimalHours(history),
    sessionFatigue: calculateSessionFatigue(history),
    averageSwipeSpeed: calculateAverageSwipeSpeed(history),
    inferredSoftLimits: inferSoftLimits(history),
    sequentialPatterns: findSequentialPatterns(history),
    predictionAccuracy: calculatePredictionAccuracy(history),
    dataConfidence: Math.min(1, history.length / 50), // Full confidence at 50+ curations
  };
}

function getDefaultInsights(): CurationInsights {
  return {
    intensityCeiling: 3,
    intensityComfortZone: [1, 2],
    intensityRejectionRate: {},
    categoryFatigue: {},
    categoryMomentum: {},
    strongPreferences: [],
    avoidancePatterns: [],
    optimalHours: [],
    sessionFatigue: 0,
    averageSwipeSpeed: 3000,
    inferredSoftLimits: [],
    sequentialPatterns: [],
    predictionAccuracy: 0.5,
    dataConfidence: 0,
  };
}

/**
 * Calculate the intensity level where rejection rate spikes
 */
function calculateIntensityCeiling(history: TaskCuration[]): number {
  const byIntensity: Record<number, { kept: number; total: number }> = {};

  history.forEach(c => {
    const i = c.intensityAtDecision;
    if (!byIntensity[i]) byIntensity[i] = { kept: 0, total: 0 };
    byIntensity[i].total++;
    if (c.decision === 'keep') byIntensity[i].kept++;
  });

  // Find the intensity where acceptance drops below 50%
  for (let i = 1; i <= 5; i++) {
    const stats = byIntensity[i];
    if (stats && stats.total >= 3) {
      const rate = stats.kept / stats.total;
      if (rate < 0.5) return i;
    }
  }

  return 5; // No ceiling detected
}

/**
 * Calculate the intensity range where user is most comfortable
 */
function calculateComfortZone(history: TaskCuration[]): [number, number] {
  const byIntensity: Record<number, { kept: number; total: number }> = {};

  history.forEach(c => {
    const i = c.intensityAtDecision;
    if (!byIntensity[i]) byIntensity[i] = { kept: 0, total: 0 };
    byIntensity[i].total++;
    if (c.decision === 'keep') byIntensity[i].kept++;
  });

  let minComfort = 1;
  let maxComfort = 1;

  for (let i = 1; i <= 5; i++) {
    const stats = byIntensity[i];
    if (stats && stats.total >= 2) {
      const rate = stats.kept / stats.total;
      if (rate >= 0.6) {
        if (minComfort === 1) minComfort = i;
        maxComfort = i;
      }
    }
  }

  return [minComfort, maxComfort];
}

/**
 * Calculate rejection rate for each intensity level
 */
function calculateIntensityRejectionRates(history: TaskCuration[]): Record<number, number> {
  const byIntensity: Record<number, { rejected: number; total: number }> = {};

  history.forEach(c => {
    const i = c.intensityAtDecision;
    if (!byIntensity[i]) byIntensity[i] = { rejected: 0, total: 0 };
    byIntensity[i].total++;
    if (c.decision === 'reject') byIntensity[i].rejected++;
  });

  const rates: Record<number, number> = {};
  for (const [intensity, stats] of Object.entries(byIntensity)) {
    if (stats.total >= 2) {
      rates[parseInt(intensity)] = stats.rejected / stats.total;
    }
  }

  return rates;
}

/**
 * Calculate how "tired" the user is of each category
 * Based on recent rejection trends
 */
function calculateCategoryFatigue(history: TaskCuration[]): Record<string, number> {
  const recent = history.slice(-20); // Last 20 decisions
  const fatigue: Record<string, { rejected: number; total: number }> = {};

  recent.forEach(c => {
    const cat = c.categoryAtDecision;
    if (!fatigue[cat]) fatigue[cat] = { rejected: 0, total: 0 };
    fatigue[cat].total++;
    if (c.decision === 'reject') fatigue[cat].rejected++;
  });

  const result: Record<string, number> = {};
  for (const [cat, stats] of Object.entries(fatigue)) {
    if (stats.total >= 2) {
      result[cat] = stats.rejected / stats.total;
    }
  }

  return result;
}

/**
 * Calculate recent acceptance momentum for each category
 */
function calculateCategoryMomentum(history: TaskCuration[]): Record<string, number> {
  const recent = history.slice(-15); // Last 15 decisions
  const momentum: Record<string, number[]> = {};

  recent.forEach((c, index) => {
    const cat = c.categoryAtDecision;
    if (!momentum[cat]) momentum[cat] = [];

    // Weight recent decisions more heavily
    const weight = (index + 1) / recent.length;
    const value = c.decision === 'keep' ? weight : -weight * 0.5;
    momentum[cat].push(value);
  });

  const result: Record<string, number> = {};
  for (const [cat, values] of Object.entries(momentum)) {
    const sum = values.reduce((a, b) => a + b, 0);
    result[cat] = Math.max(-1, Math.min(1, sum / values.length));
  }

  return result;
}

/**
 * Find categories with strong positive preference signals
 */
function findStrongPreferences(history: TaskCuration[]): string[] {
  const byCategory: Record<string, { kept: number; total: number }> = {};

  history.forEach(c => {
    const cat = c.categoryAtDecision;
    if (!byCategory[cat]) byCategory[cat] = { kept: 0, total: 0 };
    byCategory[cat].total++;
    if (c.decision === 'keep') byCategory[cat].kept++;
  });

  return Object.entries(byCategory)
    .filter(([, stats]) => stats.total >= 3 && (stats.kept / stats.total) >= 0.75)
    .map(([cat]) => cat);
}

/**
 * Find categories being consistently avoided
 */
function findAvoidancePatterns(history: TaskCuration[]): string[] {
  const byCategory: Record<string, { rejected: number; total: number }> = {};

  history.forEach(c => {
    const cat = c.categoryAtDecision;
    if (!byCategory[cat]) byCategory[cat] = { rejected: 0, total: 0 };
    byCategory[cat].total++;
    if (c.decision === 'reject') byCategory[cat].rejected++;
  });

  return Object.entries(byCategory)
    .filter(([, stats]) => stats.total >= 3 && (stats.rejected / stats.total) >= 0.6)
    .map(([cat]) => cat);
}

/**
 * Find optimal hours for curation based on acceptance rates
 */
function findOptimalHours(history: TaskCuration[]): number[] {
  const byHour: Record<number, { kept: number; total: number }> = {};

  history.forEach(c => {
    const hour = new Date(c.decidedAt).getHours();
    if (!byHour[hour]) byHour[hour] = { kept: 0, total: 0 };
    byHour[hour].total++;
    if (c.decision === 'keep') byHour[hour].kept++;
  });

  return Object.entries(byHour)
    .filter(([, stats]) => stats.total >= 3 && (stats.kept / stats.total) >= 0.6)
    .map(([hour]) => parseInt(hour))
    .sort((a, b) => a - b);
}

/**
 * Calculate session fatigue based on position in session
 */
function calculateSessionFatigue(history: TaskCuration[]): number {
  // Get recent curations from today
  const today = new Date().toISOString().split('T')[0];
  const todayCurations = history.filter(c => c.decidedAt.startsWith(today));

  if (todayCurations.length < 5) return 0;

  // Check if rejection rate is increasing in recent decisions
  const recent = todayCurations.slice(-10);
  const firstHalf = recent.slice(0, 5);
  const secondHalf = recent.slice(-5);

  const firstRejectRate = firstHalf.filter(c => c.decision === 'reject').length / firstHalf.length;
  const secondRejectRate = secondHalf.filter(c => c.decision === 'reject').length / secondHalf.length;

  // Fatigue is the increase in rejection rate
  return Math.max(0, secondRejectRate - firstRejectRate);
}

/**
 * Calculate average swipe speed
 */
function calculateAverageSwipeSpeed(history: TaskCuration[]): number {
  const speeds = history
    .filter(c => c.swipeDurationMs && c.swipeDurationMs > 0 && c.swipeDurationMs < 30000)
    .map(c => c.swipeDurationMs!);

  if (speeds.length === 0) return 3000;

  return speeds.reduce((a, b) => a + b, 0) / speeds.length;
}

/**
 * Infer soft limits from rejection patterns
 * Looks for common keywords in rejected tasks
 */
function inferSoftLimits(history: TaskCuration[]): string[] {
  // This would need task content, so we track by domain/category patterns
  const rejected = history.filter(c => c.decision === 'reject');

  if (rejected.length < 5) return [];

  // Find domains with very high rejection
  const byDomain: Record<string, number> = {};
  rejected.forEach(c => {
    byDomain[c.domainAtDecision] = (byDomain[c.domainAtDecision] || 0) + 1;
  });

  const total = rejected.length;
  return Object.entries(byDomain)
    .filter(([, count]) => count / total >= 0.3) // 30%+ of rejections
    .map(([domain]) => domain);
}

/**
 * Find sequential patterns - what categories tend to be accepted after others
 */
function findSequentialPatterns(history: TaskCuration[]): Array<{ after: string; preferred: string[] }> {
  if (history.length < 10) return [];

  const sequences: Record<string, Record<string, number>> = {};

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    if (prev.decision === 'keep' && curr.decision === 'keep') {
      const prevCat = prev.categoryAtDecision;
      const currCat = curr.categoryAtDecision;

      if (!sequences[prevCat]) sequences[prevCat] = {};
      sequences[prevCat][currCat] = (sequences[prevCat][currCat] || 0) + 1;
    }
  }

  return Object.entries(sequences)
    .filter(([, following]) => Object.values(following).some(v => v >= 2))
    .map(([after, following]) => ({
      after,
      preferred: Object.entries(following)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => cat),
    }));
}

/**
 * Calculate how accurate our predictions have been
 * Based on whether high-scored tasks were kept
 */
function calculatePredictionAccuracy(history: TaskCuration[]): number {
  // This is a simplified version - real ML would track predictions vs outcomes
  if (history.length < 10) return 0.5;

  const recent = history.slice(-20);
  const kept = recent.filter(c => c.decision === 'keep').length;

  // If we're showing good tasks, keep rate should be high
  return kept / recent.length;
}

/**
 * Get smart task recommendations based on ML insights
 */
export async function getSmartRecommendations(
  userId: string,
  context: CurationContext
): Promise<{
  suggestedIntensity: number;
  suggestedCategories: string[];
  avoidCategories: string[];
  confidence: number;
  reasoning: string[];
}> {
  const insights = await analyzeCurationPatterns(userId);
  const reasoning: string[] = [];

  // Suggest intensity
  let suggestedIntensity = context.currentIntensity;
  if (insights.intensityComfortZone[1] > context.currentIntensity) {
    suggestedIntensity = Math.min(
      insights.intensityComfortZone[1],
      context.currentIntensity + 1
    );
    reasoning.push(`Comfort zone extends to intensity ${insights.intensityComfortZone[1]}`);
  }

  if (insights.intensityCeiling < context.currentIntensity) {
    suggestedIntensity = insights.intensityCeiling;
    reasoning.push(`Intensity ceiling detected at ${insights.intensityCeiling}`);
  }

  // Suggest categories
  const suggestedCategories = [...insights.strongPreferences];

  // Add categories with positive momentum
  for (const [cat, momentum] of Object.entries(insights.categoryMomentum)) {
    if (momentum > 0.3 && !suggestedCategories.includes(cat)) {
      suggestedCategories.push(cat);
      reasoning.push(`${cat} has positive momentum (${(momentum * 100).toFixed(0)}%)`);
    }
  }

  // Categories to avoid
  const avoidCategories = [...insights.avoidancePatterns];

  // Add fatigued categories
  for (const [cat, fatigue] of Object.entries(insights.categoryFatigue)) {
    if (fatigue > 0.5 && !avoidCategories.includes(cat)) {
      avoidCategories.push(cat);
      reasoning.push(`${cat} showing fatigue (${(fatigue * 100).toFixed(0)}% recent rejection)`);
    }
  }

  // Session fatigue warning
  if (insights.sessionFatigue > 0.3) {
    reasoning.push(`Session fatigue detected - consider ending session`);
  }

  return {
    suggestedIntensity,
    suggestedCategories: suggestedCategories.slice(0, 5),
    avoidCategories: avoidCategories.slice(0, 5),
    confidence: insights.dataConfidence,
    reasoning,
  };
}
