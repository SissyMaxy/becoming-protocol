/**
 * Kink Quiz Scoring Logic
 * Calculate vector levels from quiz responses
 */

import { supabase } from './supabase';
import {
  QUIZ_QUESTIONS,
  ANSWER_MULTIPLIERS,
  getQuestionById,
  type QuizAnswer,
} from '../data/kink-quiz-data';
import type { VectorId } from '../types/adaptive-feminization';

export interface QuizResponse {
  questionId: string;
  answer: QuizAnswer;
}

export interface QuizProgress {
  responses: QuizResponse[];
  currentIndex: number;
  startedAt: string;
  completedAt?: string;
}

export interface VectorLevelResult {
  vectorId: VectorId;
  level: number;
  answeredQuestions: number;
  maxPossibleLevel: number;
}

// ============================================
// SCORING
// ============================================

/**
 * Calculate level for a single vector based on responses
 */
export function calculateVectorLevel(
  responses: QuizResponse[],
  vectorId: VectorId
): VectorLevelResult {
  // Get all questions for this vector
  const vectorQuestions = QUIZ_QUESTIONS.filter(q => q.vectorId === vectorId);

  // Get responses for this vector
  const vectorResponses = responses.filter(r => {
    const question = getQuestionById(r.questionId);
    return question?.vectorId === vectorId;
  });

  if (vectorResponses.length === 0) {
    return {
      vectorId,
      level: 0,
      answeredQuestions: 0,
      maxPossibleLevel: Math.max(...vectorQuestions.map(q => q.milestoneLevel)),
    };
  }

  // Calculate level based on highest achieved milestone
  let maxAchievedLevel = 0;

  for (const response of vectorResponses) {
    const question = getQuestionById(response.questionId);
    if (!question) continue;

    const multiplier = ANSWER_MULTIPLIERS[response.answer];
    const achievedLevel = question.milestoneLevel * multiplier;
    maxAchievedLevel = Math.max(maxAchievedLevel, achievedLevel);
  }

  return {
    vectorId,
    level: Math.min(10, Math.round(maxAchievedLevel * 10) / 10), // Round to 1 decimal
    answeredQuestions: vectorResponses.length,
    maxPossibleLevel: Math.max(...vectorQuestions.map(q => q.milestoneLevel)),
  };
}

/**
 * Calculate levels for all vectors from responses
 */
export function calculateAllVectorLevels(
  responses: QuizResponse[]
): Record<VectorId, VectorLevelResult> {
  // Get unique vector IDs from questions
  const vectorIds = [...new Set(QUIZ_QUESTIONS.map(q => q.vectorId))];

  const results: Record<VectorId, VectorLevelResult> = {} as Record<VectorId, VectorLevelResult>;

  for (const vectorId of vectorIds) {
    results[vectorId] = calculateVectorLevel(responses, vectorId);
  }

  return results;
}

/**
 * Calculate XP earned from quiz completion
 */
export function calculateQuizXP(responses: QuizResponse[]): number {
  let xp = 0;

  for (const response of responses) {
    // Base XP for answering
    xp += 2;

    // Bonus XP for non-"never" answers
    if (response.answer !== 'never') {
      xp += 1;
    }

    // Extra bonus for high-commitment answers
    if (response.answer === 'regular' || response.answer === 'always') {
      xp += 2;
    }
  }

  // Completion bonus
  if (responses.length === QUIZ_QUESTIONS.length) {
    xp += 50;
  }

  return xp;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Initialize vector states from quiz results
 */
export async function initializeVectorStatesFromQuiz(
  userId: string,
  levels: Record<VectorId, VectorLevelResult>
): Promise<void> {
  const now = new Date().toISOString();

  // Build upsert data for all vectors
  const upsertData = Object.entries(levels).map(([vectorId, result]) => ({
    user_id: userId,
    vector_id: vectorId,
    current_level: result.level,
    sub_component_scores: {},
    velocity_trend: 'steady' as const,
    last_activity_date: now,
    total_engagement_minutes: 0,
    streak_days: 0,
    peak_level: result.level,
    locked_in: false,
  }));

  // Batch upsert
  const { error } = await supabase
    .from('user_vector_states')
    .upsert(upsertData, { onConflict: 'user_id,vector_id' });

  if (error) {
    console.error('Failed to initialize vector states:', error);
    throw error;
  }
}

/**
 * Save quiz progress for resuming later
 */
export async function saveQuizProgress(
  userId: string,
  progress: QuizProgress
): Promise<void> {
  const { error } = await supabase
    .from('user_profiles')
    .update({
      quiz_progress: progress,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to save quiz progress:', error);
    // Don't throw - quiz can continue without saving
  }
}

/**
 * Load saved quiz progress
 */
export async function loadQuizProgress(
  userId: string
): Promise<QuizProgress | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('quiz_progress')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.quiz_progress) {
    return null;
  }

  return data.quiz_progress as QuizProgress;
}

/**
 * Mark quiz as completed
 */
export async function markQuizCompleted(
  userId: string,
  xpEarned: number
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('user_profiles')
    .update({
      quiz_completed_at: now,
      quiz_progress: null, // Clear progress
      updated_at: now,
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to mark quiz completed:', error);
  }

  // Award XP (if reward system is available)
  try {
    await supabase.rpc('add_reward_points', {
      p_user_id: userId,
      p_points: xpEarned,
      p_source: 'kink_quiz_completion',
      p_description: 'Completed Readiness Quiz',
    });
  } catch (e) {
    // XP award is optional, don't fail quiz completion
    console.log('XP award skipped (function may not exist):', e);
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Get summary stats from quiz results
 */
export function getQuizSummary(levels: Record<VectorId, VectorLevelResult>): {
  totalVectors: number;
  vectorsWithProgress: number;
  averageLevel: number;
  highestLevel: number;
  lowestLevel: number;
  feminizationAverage: number;
  sissificationAverage: number;
} {
  const results = Object.values(levels);
  const withProgress = results.filter(r => r.level > 0);

  const feminizationResults = results.filter(r => {
    const q = QUIZ_QUESTIONS.find(q => q.vectorId === r.vectorId);
    return q?.category === 'feminization';
  });

  const sissificationResults = results.filter(r => {
    const q = QUIZ_QUESTIONS.find(q => q.vectorId === r.vectorId);
    return q?.category === 'sissification';
  });

  const avg = (arr: VectorLevelResult[]) =>
    arr.length > 0 ? arr.reduce((sum, r) => sum + r.level, 0) / arr.length : 0;

  return {
    totalVectors: results.length,
    vectorsWithProgress: withProgress.length,
    averageLevel: avg(results),
    highestLevel: Math.max(...results.map(r => r.level), 0),
    lowestLevel: Math.min(...results.map(r => r.level), 0),
    feminizationAverage: avg(feminizationResults),
    sissificationAverage: avg(sissificationResults),
  };
}

/**
 * Get top vectors (highest levels) from results
 */
export function getTopVectors(
  levels: Record<VectorId, VectorLevelResult>,
  count: number = 5
): VectorLevelResult[] {
  return Object.values(levels)
    .filter(r => r.level > 0)
    .sort((a, b) => b.level - a.level)
    .slice(0, count);
}

/**
 * Get vectors that need development (lowest levels)
 */
export function getGrowthVectors(
  levels: Record<VectorId, VectorLevelResult>,
  count: number = 5
): VectorLevelResult[] {
  return Object.values(levels)
    .sort((a, b) => a.level - b.level)
    .slice(0, count);
}
