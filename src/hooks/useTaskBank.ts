// Task Bank Hook
// State management for daily tasks and completions

import { useState, useCallback, useEffect, useRef } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { useAuth } from '../context/AuthContext';
import { useArousalState } from './useArousalState';
import {
  getTodayTasks,
  getOrCreateTodayTasks,
  completeTask,
  uncompleteTask,
  updateTaskProgress,
  skipTask,
  getTaskStats,
  getTimeOfDay,
} from '../lib/task-bank';
import type {
  DailyTask,
  UserTaskContext,
  TaskCategory,
  SkipCost,
} from '../types/task-bank';

interface UseTaskBankReturn {
  // Today's tasks
  todayTasks: DailyTask[];
  isLoading: boolean;
  error: string | null;

  // Stats
  stats: {
    totalCompleted: number;
    totalSkipped: number;
    completionsByCategory: Record<TaskCategory, number>;
    currentStreak: number;
    longestStreak: number;
  } | null;

  // Completion state
  completingTaskId: string | null;
  lastCompletedTask: {
    id: string;
    affirmation: string;
    pointsEarned: number;
  } | null;

  // Skip state
  skippingTaskId: string | null;
  weeklySkipCount: number;
  showSkipWarning: boolean;

  // Undo state
  undoingTaskId: string | null;

  // Actions
  loadTasks: () => Promise<void>;
  complete: (taskId: string, feltGood?: boolean, notes?: string) => Promise<void>;
  incrementProgress: (taskId: string) => Promise<void>;
  skip: (taskId: string) => Promise<{ cost: SkipCost; weeklySkipCount: number }>;
  undo: (taskId: string) => Promise<void>;
  dismissCompletion: () => void;
  dismissSkipWarning: () => void;
}

export function useTaskBank(): UseTaskBankReturn {
  const { currentEntry: _currentEntry, progress } = useProtocol();
  const { user } = useAuth();
  const { metrics, currentState } = useArousalState();

  // Task state
  const [todayTasks, setTodayTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<UseTaskBankReturn['stats']>(null);

  // Completion state
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [lastCompletedTask, setLastCompletedTask] = useState<{
    id: string;
    affirmation: string;
    pointsEarned: number;
  } | null>(null);

  // Skip state
  const [skippingTaskId, setSkippingTaskId] = useState<string | null>(null);
  const [weeklySkipCount, setWeeklySkipCount] = useState(0);
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  // Undo state
  const [undoingTaskId, setUndoingTaskId] = useState<string | null>(null);

  // Ref to track if initial load has happened
  const hasLoadedRef = useRef(false);

  // Build user context - takes existingTasks as parameter to avoid stale closure
  const buildContext = useCallback((existingTasks: DailyTask[] = []): UserTaskContext => {
    return {
      userId: user?.id || '',
      phase: progress?.phase?.currentPhase || 1,
      denialDay: metrics?.currentStreakDays || 0,
      streakDays: 0, // Will be updated after stats load
      arousalState: currentState,
      timeOfDay: getTimeOfDay(),
      ginaHome: false, // Would come from user input/schedule
      ownedItems: [], // Would come from wishlist/inventory
      completedTaskIds: [], // Would be loaded from completions
      recentlyServedTaskIds: existingTasks.map(t => t.taskId),
      categoryCompletions: {} as Record<TaskCategory, number>,
      totalCompletions: 0,
      resistancePatterns: {
        skippedCategories: [],
        skippedTaskIds: [],
        delayPatterns: false,
      },
      maxDailyTasks: 4,
    };
  }, [user, progress, metrics, currentState]);

  // Load tasks
  const loadTasks = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // First try to get existing tasks
      let tasks = await getTodayTasks();

      // If no tasks, generate new ones
      if (tasks.length === 0) {
        const context = buildContext([]);
        tasks = await getOrCreateTodayTasks(context);
      }

      setTodayTasks(tasks);

      // Load stats
      const taskStats = await getTaskStats();
      setStats(taskStats);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, buildContext]);

  // Load on mount - only once
  useEffect(() => {
    if (hasLoadedRef.current) return;
    if (!user?.id) return;

    hasLoadedRef.current = true;
    loadTasks();
  }, [user?.id, loadTasks]);

  // Complete task
  const complete = useCallback(async (
    dailyTaskId: string,
    feltGood?: boolean,
    notes?: string
  ) => {
    setCompletingTaskId(dailyTaskId);

    try {
      const result = await completeTask(dailyTaskId, {
        denialDay: metrics?.currentStreakDays,
        arousalState: currentState,
        streakDay: stats?.currentStreak,
        feltGood,
        notes,
      });

      // Update local state
      setTodayTasks(prev => prev.map(t =>
        t.id === dailyTaskId
          ? { ...t, status: 'completed' as const, completedAt: new Date().toISOString() }
          : t
      ));

      setLastCompletedTask({
        id: dailyTaskId,
        affirmation: result.affirmation,
        pointsEarned: result.pointsEarned,
      });

      // Refresh stats
      const newStats = await getTaskStats();
      setStats(newStats);
    } catch (err) {
      console.error('Failed to complete task:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setCompletingTaskId(null);
    }
  }, [metrics, currentState, stats]);

  // Increment progress (for count/duration tasks)
  const incrementProgress = useCallback(async (dailyTaskId: string) => {
    const task = todayTasks.find(t => t.id === dailyTaskId);
    if (!task) return;

    const newProgress = task.progress + 1;

    try {
      await updateTaskProgress(dailyTaskId, newProgress);

      // Update local state
      setTodayTasks(prev => prev.map(t =>
        t.id === dailyTaskId
          ? { ...t, progress: newProgress }
          : t
      ));

      // Check if task is now complete
      if (task.task.completionType === 'count' &&
          task.task.targetCount &&
          newProgress >= task.task.targetCount) {
        await complete(dailyTaskId);
      }
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  }, [todayTasks, complete]);

  // Skip task
  const skip = useCallback(async (dailyTaskId: string) => {
    setSkippingTaskId(dailyTaskId);

    try {
      const result = await skipTask(dailyTaskId);

      // Update local state
      setTodayTasks(prev => prev.map(t =>
        t.id === dailyTaskId
          ? { ...t, status: 'skipped' as const, skippedAt: new Date().toISOString() }
          : t
      ));

      setWeeklySkipCount(result.weeklySkipCount);

      // Show warning if approaching threshold
      if (result.weeklySkipCount >= 2) {
        setShowSkipWarning(true);
      }

      return result;
    } catch (err) {
      console.error('Failed to skip task:', err);
      throw err;
    } finally {
      setSkippingTaskId(null);
    }
  }, []);

  // Undo completed task
  const undo = useCallback(async (dailyTaskId: string) => {
    setUndoingTaskId(dailyTaskId);

    try {
      await uncompleteTask(dailyTaskId);

      // Update local state
      setTodayTasks(prev => prev.map(t =>
        t.id === dailyTaskId
          ? { ...t, status: 'pending' as const, completedAt: undefined }
          : t
      ));

      // Refresh stats
      const newStats = await getTaskStats();
      setStats(newStats);
    } catch (err) {
      console.error('Failed to undo task:', err);
      setError(err instanceof Error ? err.message : 'Failed to undo task');
    } finally {
      setUndoingTaskId(null);
    }
  }, []);

  const dismissCompletion = useCallback(() => {
    setLastCompletedTask(null);
  }, []);

  const dismissSkipWarning = useCallback(() => {
    setShowSkipWarning(false);
  }, []);

  return {
    todayTasks,
    isLoading,
    error,
    stats,
    completingTaskId,
    lastCompletedTask,
    skippingTaskId,
    weeklySkipCount,
    showSkipWarning,
    undoingTaskId,
    loadTasks,
    complete,
    incrementProgress,
    skip,
    undo,
    dismissCompletion,
    dismissSkipWarning,
  };
}
