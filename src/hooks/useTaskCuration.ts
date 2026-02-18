/**
 * Task Curation Hook
 *
 * State management for the swipe-based task evaluation flow.
 */

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from './useProfile';
import {
  selectNextCurationTask,
  recordCurationDecision,
  updatePreferencesFromCuration,
  startCurationSession,
  updateCurationSession,
  endCurationSession,
  getEvaluatedTaskIds,
  getUserPreferences,
  getRemainingTaskCount,
} from '../lib/task-curation';
import type {
  CurationDecision,
  CurationSession,
  CurationQueueState,
  CurationContext,
  UserTaskPreferences,
} from '../types/task-curation';

interface UseTaskCurationReturn {
  // State
  queueState: CurationQueueState;
  session: CurationSession | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  startSession: () => Promise<void>;
  handleSwipe: (decision: CurationDecision, feedback?: string) => Promise<void>;
  endSession: (reason?: 'user_exit') => Promise<void>;

  // UI state
  isSessionActive: boolean;
  showNeedsWorkModal: boolean;
  setShowNeedsWorkModal: (show: boolean) => void;
  pendingDecision: CurationDecision | null;
  confirmPendingDecision: (feedback?: string) => Promise<void>;
  cancelPendingDecision: () => void;
}

const INITIAL_QUEUE_STATE: CurationQueueState = {
  currentTask: null,
  nextTask: null,
  tasksRemaining: -1,
  currentIntensity: 1,
  sessionStats: { shown: 0, kept: 0, rejected: 0, needsWork: 0 },
};

export function useTaskCuration(): UseTaskCurationReturn {
  const { user } = useAuth();
  const { profile } = useProfile();

  const [queueState, setQueueState] = useState<CurationQueueState>(INITIAL_QUEUE_STATE);
  const [session, setSession] = useState<CurationSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [showNeedsWorkModal, setShowNeedsWorkModal] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<CurationDecision | null>(null);

  const evaluatedTaskIds = useRef<string[]>([]);
  const preferences = useRef<UserTaskPreferences | null>(null);
  const cardShownAt = useRef<number>(Date.now());

  // Build curation context
  const buildContext = useCallback((): CurationContext => {
    return {
      userId: user?.id || '',
      currentIntensity: queueState.currentIntensity,
      evaluatedTaskIds: evaluatedTaskIds.current,
      hardLimits: profile?.depth?.hardLimits || [],
      softLimits: profile?.depth?.softLimits || [],
      ultimateDestination: profile?.depth?.ultimateDestination,
      preferences: preferences.current || undefined,
    };
  }, [user, queueState.currentIntensity, profile]);

  // Start curation session
  const startSession = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load user preferences
      preferences.current = await getUserPreferences(user.id);

      // Load previously evaluated task IDs
      evaluatedTaskIds.current = await getEvaluatedTaskIds(user.id);

      // Get remaining count
      const hardLimits = profile?.depth?.hardLimits || [];
      const remaining = await getRemainingTaskCount(user.id, hardLimits);

      if (remaining === 0) {
        setError('All tasks have been evaluated!');
        setIsLoading(false);
        return;
      }

      // Start session in DB
      const newSession = await startCurationSession(user.id);
      setSession(newSession);

      // Determine starting intensity based on preferences
      const startIntensity = preferences.current?.intensityComfort || 1;

      // Build initial context
      const context: CurationContext = {
        userId: user.id,
        currentIntensity: startIntensity,
        evaluatedTaskIds: evaluatedTaskIds.current,
        hardLimits: profile?.depth?.hardLimits || [],
        softLimits: profile?.depth?.softLimits || [],
        ultimateDestination: profile?.depth?.ultimateDestination,
        preferences: preferences.current || undefined,
      };

      // Load first task
      const firstTask = await selectNextCurationTask(context);
      if (!firstTask) {
        setError('No tasks available for curation');
        setIsLoading(false);
        return;
      }

      evaluatedTaskIds.current.push(firstTask.id);

      // Update context for second task
      context.evaluatedTaskIds = evaluatedTaskIds.current;

      // Pre-load second task
      const secondTask = await selectNextCurationTask(context);
      if (secondTask) {
        evaluatedTaskIds.current.push(secondTask.id);
      }

      setQueueState({
        currentTask: firstTask,
        nextTask: secondTask,
        tasksRemaining: remaining - 1,
        currentIntensity: startIntensity,
        sessionStats: { shown: 1, kept: 0, rejected: 0, needsWork: 0 },
      });

      cardShownAt.current = Date.now();
      setIsSessionActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsLoading(false);
    }
  }, [user, profile]);

  // Handle swipe decision
  const handleSwipe = useCallback(async (
    decision: CurationDecision,
    feedback?: string
  ) => {
    // For needs_work, show modal first
    if (decision === 'needs_work' && !feedback) {
      setPendingDecision(decision);
      setShowNeedsWorkModal(true);
      return;
    }

    if (!user || !session || !queueState.currentTask) return;

    const task = queueState.currentTask;
    const swipeDuration = Date.now() - cardShownAt.current;

    try {
      // Record decision
      const curation = await recordCurationDecision(user.id, task.id, decision, {
        intensity: task.intensity,
        domain: task.domain,
        category: task.category,
        sessionPosition: queueState.sessionStats.shown,
        swipeDurationMs: swipeDuration,
        improvementFeedback: feedback,
      });

      // Update AI preferences
      await updatePreferencesFromCuration(user.id, curation);

      // Update local preferences
      preferences.current = await getUserPreferences(user.id);

      // Update stats
      const newStats = { ...queueState.sessionStats };
      newStats.shown++;
      if (decision === 'keep') newStats.kept++;
      if (decision === 'reject') newStats.rejected++;
      if (decision === 'needs_work') newStats.needsWork++;

      // Update session in DB
      await updateCurationSession(session.id, {
        tasksShown: newStats.shown,
        tasksKept: newStats.kept,
        tasksRejected: newStats.rejected,
        tasksNeedsWork: newStats.needsWork,
        maxIntensityReached: Math.max(session.maxIntensityReached, task.intensity),
      });

      // Calculate intensity progression - every 5 keeps, consider increasing
      let newIntensity = queueState.currentIntensity;
      if (newStats.kept > 0 && newStats.kept % 5 === 0 && newIntensity < 5) {
        newIntensity++;
      }

      // Load next-next task
      const context = buildContext();
      context.currentIntensity = newIntensity;
      const nextNextTask = await selectNextCurationTask(context);
      if (nextNextTask) {
        evaluatedTaskIds.current.push(nextNextTask.id);
      }

      // Check if we're out of tasks
      if (!queueState.nextTask && !nextNextTask) {
        // No more tasks - end session
        await endCurationSession(session.id, 'exhausted');
        setIsSessionActive(false);
        setSession(prev => prev ? {
          ...prev,
          sessionCompleted: true,
          endingReason: 'exhausted',
          tasksShown: newStats.shown,
          tasksKept: newStats.kept,
          tasksRejected: newStats.rejected,
          tasksNeedsWork: newStats.needsWork,
        } : null);
        setQueueState(prev => ({
          ...prev,
          currentTask: null,
          nextTask: null,
          tasksRemaining: 0,
          sessionStats: newStats,
        }));
      } else {
        // Move to next task
        setQueueState({
          currentTask: queueState.nextTask,
          nextTask: nextNextTask,
          tasksRemaining: Math.max(0, queueState.tasksRemaining - 1),
          currentIntensity: newIntensity,
          sessionStats: newStats,
        });
        cardShownAt.current = Date.now();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision');
    }
  }, [user, session, queueState, buildContext]);

  // Confirm pending decision (from needs_work modal)
  const confirmPendingDecision = useCallback(async (feedback?: string) => {
    if (pendingDecision) {
      setShowNeedsWorkModal(false);
      await handleSwipe(pendingDecision, feedback);
      setPendingDecision(null);
    }
  }, [pendingDecision, handleSwipe]);

  // Cancel pending decision
  const cancelPendingDecision = useCallback(() => {
    setShowNeedsWorkModal(false);
    setPendingDecision(null);
  }, []);

  // End session manually
  const endSession = useCallback(async (reason: 'user_exit' = 'user_exit') => {
    if (!session) return;

    await endCurationSession(session.id, reason);
    setIsSessionActive(false);
    setSession(prev => prev ? {
      ...prev,
      sessionCompleted: true,
      endingReason: reason,
    } : null);
  }, [session]);

  return {
    queueState,
    session,
    isLoading,
    error,
    startSession,
    handleSwipe,
    endSession,
    isSessionActive,
    showNeedsWorkModal,
    setShowNeedsWorkModal,
    pendingDecision,
    confirmPendingDecision,
    cancelPendingDecision,
  };
}
