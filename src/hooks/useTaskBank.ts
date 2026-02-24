// Task Bank Hook
// State management for daily tasks and completions

import { useState, useCallback, useEffect, useRef } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { useAuth } from '../context/AuthContext';
import { useArousalState } from './useArousalState';
import { useUserState } from './useUserState';
import { useCorruption } from './useCorruption';
import {
  getTodayTasks,
  getOrCreateTodayTasks,
  completeTask,
  uncompleteTask,
  updateTaskProgress,
  skipTask,
  getTaskStats,
  enhanceTasks,
  buildEnhancementContext,
  prescribeNextTask,
  refilterTasks,
  getHardcodedFallbackTasks,
} from '../lib/task-bank';
import type {
  DailyTask,
  UserTaskContext,
  TaskCategory,
  SkipCost,
} from '../types/task-bank';
import type { UserStateForSelection } from '../lib/rules-engine-v2';

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
  complete: (taskId: string, feltGood?: boolean, notes?: string, captureData?: Record<string, unknown>) => Promise<void>;
  incrementProgress: (taskId: string) => Promise<void>;
  skip: (taskId: string) => Promise<{ cost: SkipCost; weeklySkipCount: number }>;
  undo: (taskId: string) => Promise<void>;
  dismissCompletion: () => void;
  dismissSkipWarning: () => void;

  // Reactive prescription
  prescribeNext: (completedCategory: string, completedDomain: string) => Promise<void>;
  refreshPrescriptions: () => Promise<void>;
}

export function useTaskBank(): UseTaskBankReturn {
  const { currentEntry: _currentEntry, progress } = useProtocol();
  const { user } = useAuth();
  const { metrics, currentState } = useArousalState();
  const { userState, timeOfDay } = useUserState();
  const { snapshot: corruptionSnapshot } = useCorruption();
  const ginaCorruptionLevel = corruptionSnapshot?.levels.gina ?? 0;

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

  // Calculate max daily tasks based on executive function
  const getMaxDailyTasks = useCallback((): number => {
    const execFn = userState?.estimatedExecFunction || 'medium';
    const odometer = userState?.odometer || 'coasting';

    // Depression/survival mode: minimal tasks
    if (execFn === 'depleted' || odometer === 'survival') return 2;
    if (execFn === 'low') return 3;
    // High function / momentum: can handle more
    if (execFn === 'high' && (odometer === 'momentum' || odometer === 'breakthrough')) return 5;
    // Default
    return 4;
  }, [userState?.estimatedExecFunction, userState?.odometer]);

  // Build user context - takes existingTasks as parameter to avoid stale closure
  const buildContext = useCallback((existingTasks: DailyTask[] = []): UserTaskContext => {
    return {
      userId: user?.id || '',
      phase: progress?.phase?.currentPhase || 1,
      denialDay: userState?.denialDay || metrics?.currentStreakDays || 0,
      streakDays: userState?.streakDays || 0,
      arousalState: currentState,
      timeOfDay,
      ginaHome: userState?.ginaHome ?? false,
      ginaAsleep: userState?.ginaAsleep ?? false,
      ginaCorruptionLevel,
      ownedItems: [], // Would come from wishlist/inventory
      completedTaskIds: [], // Would be loaded from completions
      recentlyServedTaskIds: existingTasks.map(t => t.taskId),
      categoryCompletions: {} as Record<TaskCategory, number>,
      totalCompletions: userState?.tasksCompletedToday || 0,
      resistancePatterns: {
        skippedCategories: [],
        skippedTaskIds: [],
        delayPatterns: false,
      },
      maxDailyTasks: getMaxDailyTasks(),
    };
  }, [user, progress, metrics, currentState, userState, stats, getMaxDailyTasks, ginaCorruptionLevel]);

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

      // Enhance tasks with Claude personalization (async, non-blocking)
      // Only if there are pending tasks without enhancements
      const hasPendingUnenhanced = tasks.some(
        t => t.status === 'pending' && !t.enhancedInstruction
      );
      if (hasPendingUnenhanced) {
        console.log('[useTaskBank] Starting task enhancement for', tasks.filter(t => t.status === 'pending' && !t.enhancedInstruction).length, 'tasks');
        buildEnhancementContext(user.id).then(ctx => {
          console.log('[useTaskBank] Enhancement context built:', { chosenName: ctx.chosenName, denialDay: ctx.denialDay, timeOfDay: ctx.timeOfDay });
          return enhanceTasks(tasks, ctx).then(enhanced => {
            const enhancedCount = enhanced.filter(t => t.enhancedInstruction).length;
            console.log('[useTaskBank] Enhancement result:', enhancedCount, 'tasks enhanced');
            if (enhancedCount > 0) {
              setTodayTasks(enhanced);
            }
          });
        }).catch(err => {
          console.error('[useTaskBank] Enhancement failed:', err);
        });
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, buildContext]);

  // Track ginaHome/ginaAsleep for reactive re-filtering
  const prevGinaHomeRef = useRef<boolean | undefined>(undefined);
  const prevGinaAsleepRef = useRef<boolean | undefined>(undefined);

  // Load on mount - only once
  useEffect(() => {
    if (hasLoadedRef.current) return;
    if (!user?.id) return;

    hasLoadedRef.current = true;
    loadTasks();
  }, [user?.id, loadTasks]);

  // Re-load tasks when ginaHome changes (hide/show intimate tasks)
  useEffect(() => {
    if (userState?.ginaHome === undefined) return;
    if (prevGinaHomeRef.current === undefined) {
      prevGinaHomeRef.current = userState.ginaHome;
      return;
    }
    if (prevGinaHomeRef.current !== userState.ginaHome) {
      prevGinaHomeRef.current = userState.ginaHome;
      // Reload tasks with new ginaHome context
      loadTasks();
    }
  }, [userState?.ginaHome, loadTasks]);

  // Re-load tasks when ginaAsleep changes (filter noisy tasks)
  useEffect(() => {
    if (userState?.ginaAsleep === undefined) return;
    if (prevGinaAsleepRef.current === undefined) {
      prevGinaAsleepRef.current = userState.ginaAsleep;
      return;
    }
    if (prevGinaAsleepRef.current !== userState.ginaAsleep) {
      prevGinaAsleepRef.current = userState.ginaAsleep;
      loadTasks();
    }
  }, [userState?.ginaAsleep, loadTasks]);

  // Complete task
  const complete = useCallback(async (
    dailyTaskId: string,
    feltGood?: boolean,
    notes?: string,
    captureData?: Record<string, unknown>
  ) => {
    setCompletingTaskId(dailyTaskId);

    try {
      const result = await completeTask(dailyTaskId, {
        denialDay: metrics?.currentStreakDays,
        arousalState: currentState,
        streakDay: userState?.streakDays,
        feltGood,
        notes,
        captureData,
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

  // Daily task cap — don't prescribe infinitely
  const DAILY_TASK_CAP = 10;

  // Build state overrides from current user state for rules-engine
  const buildStateOverrides = useCallback((): Partial<UserStateForSelection> => {
    const completedDomains = todayTasks
      .filter(t => t.status === 'completed')
      .map(t => t.task.domain);
    const completedCategories = todayTasks
      .filter(t => t.status === 'completed')
      .map(t => t.task.category);

    return {
      userId: user?.id || '',
      timeOfDay: timeOfDay as UserStateForSelection['timeOfDay'],
      ginaHome: userState?.ginaHome ?? false,
      denialDay: userState?.denialDay ?? 0,
      currentArousal: userState?.currentArousal ?? 0,
      inSession: userState?.inSession ?? false,
      odometer: userState?.odometer ?? 'coasting',
      estimatedExecFunction: userState?.estimatedExecFunction ?? 'medium',
      currentPhase: userState?.currentPhase ?? 0,
      streakDays: userState?.streakDays ?? 0,
      lastTaskId: userState?.lastTaskId ?? null,
      lastTaskCategory: userState?.lastTaskCategory ?? null,
      lastTaskDomain: userState?.lastTaskDomain ?? null,
      avoidedDomains: userState?.avoidedDomains ?? [],
      completedTodayDomains: completedDomains,
      completedTodayCategories: completedCategories,
      ownedItems: userState?.ownedItems ?? [],
      completedTaskIds: [],
    };
  }, [user?.id, userState, todayTasks]);

  // Prescribe a single replacement task after completion
  const prescribeNext = useCallback(async (completedCategory: string, completedDomain: string) => {
    if (!user?.id) return;

    // Don't exceed daily cap
    if (todayTasks.length >= DAILY_TASK_CAP) {
      console.log('[useTaskBank] Daily task cap reached, not prescribing more');
      return;
    }

    // Don't prescribe if enough pending tasks remain
    const pendingCount = todayTasks.filter(t => t.status === 'pending').length;
    const maxPending = getMaxDailyTasks();
    if (pendingCount >= maxPending) {
      console.log('[useTaskBank] Enough pending tasks remain, not prescribing');
      return;
    }

    const context = buildContext(todayTasks);
    const stateOverrides = buildStateOverrides();

    // Set last task to the just-completed one for no-repeat filtering
    stateOverrides.lastTaskCategory = completedCategory;
    stateOverrides.lastTaskDomain = completedDomain;

    // Exclude all currently assigned task IDs (not just pending — avoid reassigning completed)
    const excludeIds = todayTasks.map(t => t.taskId);

    try {
      const newTask = await prescribeNextTask(context, stateOverrides, excludeIds);
      if (newTask) {
        setTodayTasks(prev => [...prev, newTask]);

        // Enhance the new task (non-blocking)
        if (user.id) {
          buildEnhancementContext(user.id).then(ctx =>
            enhanceTasks([newTask], ctx).then(enhanced => {
              if (enhanced[0]?.enhancedInstruction) {
                setTodayTasks(prev => prev.map(t =>
                  t.id === newTask.id ? enhanced[0] : t
                ));
              }
            })
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[useTaskBank] prescribeNext failed:', err);
    }
  }, [user?.id, todayTasks, buildContext, buildStateOverrides, getMaxDailyTasks]);

  // Re-filter tasks when state changes (Gina toggle, energy shift)
  // Removes invalid tasks and prescribes replacements
  const refreshPrescriptions = useCallback(async () => {
    if (!user?.id) return;

    const stateOverrides = buildStateOverrides();

    // Re-filter existing tasks
    const { valid, invalidatedIds } = refilterTasks(todayTasks, stateOverrides);

    if (invalidatedIds.length === 0) return; // Nothing changed

    console.log('[useTaskBank] Refiltered:', invalidatedIds.length, 'tasks invalidated');

    // Update local state to remove invalidated pending tasks
    setTodayTasks(valid);

    // Prescribe replacements for invalidated tasks
    const context = buildContext(valid);
    const excludeIds = valid.map(t => t.taskId);
    const newTasks: DailyTask[] = [];

    for (const _invalidId of invalidatedIds) {
      if (valid.filter(t => t.status === 'pending').length + newTasks.length >= getMaxDailyTasks()) {
        break; // Enough tasks
      }

      try {
        const replacement = await prescribeNextTask(context, stateOverrides, [...excludeIds, ...newTasks.map(t => t.taskId)]);
        if (replacement) {
          newTasks.push(replacement);
        }
      } catch {
        // Individual replacement failure is ok, continue
      }
    }

    if (newTasks.length > 0) {
      setTodayTasks(prev => [...prev, ...newTasks]);

      // Enhance new tasks (non-blocking)
      if (user.id) {
        buildEnhancementContext(user.id).then(ctx =>
          enhanceTasks(newTasks, ctx).then(enhanced => {
            const enhancedMap = new Map(enhanced.filter(t => t.enhancedInstruction).map(t => [t.id, t]));
            if (enhancedMap.size > 0) {
              setTodayTasks(prev => prev.map(t => enhancedMap.get(t.id) || t));
            }
          })
        ).catch(() => {});
      }
    }

    // If we ended up with zero pending tasks and zero replacements, use fallback
    const finalPending = valid.filter(t => t.status === 'pending').length + newTasks.length;
    if (finalPending === 0) {
      console.warn('[useTaskBank] No pending tasks after refilter, using hardcoded fallback');
      const fallbacks = getHardcodedFallbackTasks(2);
      setTodayTasks(prev => [...prev, ...fallbacks]);
    }
  }, [user?.id, todayTasks, buildContext, buildStateOverrides, getMaxDailyTasks]);

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
    prescribeNext,
    refreshPrescriptions,
  };
}
