/**
 * Task Curation Types
 *
 * Types for the swipe-based task evaluation system.
 * Users curate their personal task bank while training AI on preferences.
 */

import type { Task } from './task-bank';

// ============================================
// CURATION DECISIONS
// ============================================

export type CurationDecision = 'keep' | 'reject' | 'needs_work';

export const CURATION_DECISION_LABELS: Record<CurationDecision, string> = {
  keep: 'Keep',
  reject: 'Reject',
  needs_work: 'Needs Work',
};

export const CURATION_DECISION_COLORS: Record<CurationDecision, string> = {
  keep: '#22c55e',      // green
  reject: '#ef4444',    // red
  needs_work: '#3b82f6', // blue
};

// ============================================
// TASK CURATION
// ============================================

export interface TaskCuration {
  id: string;
  userId: string;
  taskId: string;
  decision: CurationDecision;
  decidedAt: string;

  // Context at decision
  intensityAtDecision: number;
  domainAtDecision: string;
  categoryAtDecision: string;
  sessionPosition: number;
  swipeDurationMs?: number;

  // AI feedback
  improvementFeedback?: string;
}

export interface DbTaskCuration {
  id: string;
  user_id: string;
  task_id: string;
  decision: string;
  decided_at: string;
  intensity_at_decision: number;
  domain_at_decision: string;
  category_at_decision: string;
  session_position: number;
  swipe_duration_ms: number | null;
  improvement_feedback: string | null;
  created_at: string;
}

// ============================================
// USER TASK PREFERENCES
// ============================================

export interface UserTaskPreferences {
  id: string;
  userId: string;

  // Learned weights
  categoryWeights: Record<string, number>;
  domainWeights: Record<string, number>;
  intensityComfort: number;
  intensityProgressionRate: number;

  // Stats
  totalCurations: number;
  keepRate: number;
  lastSessionAt?: string;

  createdAt: string;
  updatedAt: string;
}

export interface DbUserTaskPreferences {
  id: string;
  user_id: string;
  category_weights: Record<string, number>;
  domain_weights: Record<string, number>;
  intensity_comfort: number;
  intensity_progression_rate: number;
  total_curations: number;
  keep_rate: number;
  last_session_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// CURATION SESSIONS
// ============================================

export type SessionEndingReason = 'exhausted' | 'user_exit' | 'session_limit';

export interface CurationSession {
  id: string;
  userId: string;
  startedAt: string;
  endedAt?: string;

  // Stats
  tasksShown: number;
  tasksKept: number;
  tasksRejected: number;
  tasksNeedsWork: number;
  maxIntensityReached: number;

  // End state
  sessionCompleted: boolean;
  endingReason?: SessionEndingReason;
}

export interface DbCurationSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  tasks_shown: number;
  tasks_kept: number;
  tasks_rejected: number;
  tasks_needs_work: number;
  max_intensity_reached: number;
  session_completed: boolean;
  ending_reason: string | null;
  created_at: string;
}

// ============================================
// CURATION QUEUE STATE
// ============================================

export interface CurationQueueState {
  currentTask: Task | null;
  nextTask: Task | null; // Pre-loaded for smooth transitions
  tasksRemaining: number; // -1 if unknown
  currentIntensity: number;
  sessionStats: {
    shown: number;
    kept: number;
    rejected: number;
    needsWork: number;
  };
}

// ============================================
// CURATION CONTEXT
// ============================================

export interface CurationContext {
  userId: string;
  currentIntensity: number;
  evaluatedTaskIds: string[];
  hardLimits: string[];
  softLimits: string[];
  ultimateDestination?: string[];
  preferences?: UserTaskPreferences;
}

// ============================================
// SWIPE STATE
// ============================================

export interface SwipeState {
  isDragging: boolean;
  position: { x: number; y: number };
  rotation: number;
  opacity: number;
  direction: 'left' | 'right' | 'up' | null;
}

// ============================================
// CURATION STATS
// ============================================

export interface CurationStats {
  totalEvaluated: number;
  kept: number;
  rejected: number;
  needsWork: number;
  keepRate: number;
}
