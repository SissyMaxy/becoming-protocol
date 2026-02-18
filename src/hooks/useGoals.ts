// useGoals Hook
// React hook for goal-based training system

import { useState, useEffect, useCallback } from 'react';
import type {
  Goal,
  GoalWithDrills,
  TodaysGoalWithDrills,
  GoalTemplate,
  GoalCompletionInput,
  DailyGoalCompletion,
  Domain,
} from '../types/goals';
import {
  getAllGoals,
  getTodaysGoals,
  completeGoal,
  abandonGoal,
  pauseGoal,
  resumeGoal,
  checkAndResetStreaks,
  checkForGraduations,
  getGoalTemplates,
  createGoalFromTemplate,
  getOverallStreak,
  getTodaysCompletionCount,
  getDecayingDomains,
  getGraduatedGoals,
  initializeDefaultGoals,
  getStreakRiskStatus,
  getGoalNeedingAffirmation,
} from '../lib/goals';
import { supabase } from '../lib/supabase';

// ============================================
// MAIN HOOK
// ============================================

export interface StreakRiskInfo {
  incompleteGoals: number;
  totalGoals: number;
  currentStreak: number;
  pointsAtRisk: number;
  hoursRemaining: number;
  isAtRisk: boolean;
}

export interface UseGoalsReturn {
  // State
  todaysGoals: TodaysGoalWithDrills[];
  allGoals: Goal[];
  graduatedGoals: Goal[];
  overallStreak: number;
  completionStatus: { completed: number; total: number };
  decayingDomains: Domain[];
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // Streak risk (for StreakRiskBanner)
  streakRisk: StreakRiskInfo | null;

  // Affirmation trigger (for GoalAffirmationModal)
  goalNeedingAffirmation: Goal | null;
  clearAffirmationTrigger: () => void;

  // Actions
  completeGoal: (input: GoalCompletionInput) => Promise<DailyGoalCompletion | null>;
  abandonGoal: (goalId: string, reason: string) => Promise<Goal | null>;
  pauseGoal: (goalId: string) => Promise<Goal | null>;
  resumeGoal: (goalId: string) => Promise<Goal | null>;
  addGoalFromTemplate: (templateId: string) => Promise<GoalWithDrills | null>;
  initializeGoals: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useGoals(): UseGoalsReturn {
  const [todaysGoals, setTodaysGoals] = useState<TodaysGoalWithDrills[]>([]);
  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [graduatedGoals, setGraduatedGoals] = useState<Goal[]>([]);
  const [overallStreak, setOverallStreak] = useState(0);
  const [completionStatus, setCompletionStatus] = useState({ completed: 0, total: 0 });
  const [decayingDomains, setDecayingDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Streak risk state
  const [streakRisk, setStreakRisk] = useState<StreakRiskInfo | null>(null);

  // Affirmation trigger state
  const [goalNeedingAffirmation, setGoalNeedingAffirmation] = useState<Goal | null>(null);

  // Get user ID on mount
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    }
    getUser();
  }, []);

  // Load all goal data
  const loadGoals = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      // Check and reset any broken streaks first
      await checkAndResetStreaks(userId);

      // Load all data in parallel
      const [
        todaysGoalsData,
        allGoalsData,
        graduatedGoalsData,
        streakData,
        statusData,
        decayingData,
        riskData,
        affirmationGoal,
      ] = await Promise.all([
        getTodaysGoals(userId),
        getAllGoals(userId),
        getGraduatedGoals(userId),
        getOverallStreak(userId),
        getTodaysCompletionCount(userId),
        getDecayingDomains(userId),
        getStreakRiskStatus(userId),
        getGoalNeedingAffirmation(userId),
      ]);

      setTodaysGoals(todaysGoalsData);
      setAllGoals(allGoalsData);
      setGraduatedGoals(graduatedGoalsData);
      setOverallStreak(streakData);
      setCompletionStatus(statusData);
      setDecayingDomains(decayingData);
      setStreakRisk(riskData);
      setGoalNeedingAffirmation(affirmationGoal);
      setInitialized(true);

      // Check for auto-graduations
      const graduated = await checkForGraduations(userId);
      if (graduated.length > 0) {
        // Refresh to show updated data
        const refreshedGoals = await getAllGoals(userId);
        const refreshedToday = await getTodaysGoals(userId);
        const refreshedGraduated = await getGraduatedGoals(userId);
        setAllGoals(refreshedGoals);
        setTodaysGoals(refreshedToday);
        setGraduatedGoals(refreshedGraduated);
      }
    } catch (err) {
      console.error('Failed to load goals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load on mount and when user changes
  useEffect(() => {
    if (userId) {
      loadGoals();
    }
  }, [userId, loadGoals]);

  // Complete a goal with optimistic update
  const handleCompleteGoal = useCallback(async (input: GoalCompletionInput): Promise<DailyGoalCompletion | null> => {
    // Optimistic update - immediately update UI
    setTodaysGoals(prev => prev.map(goal =>
      goal.goalId === input.goalId
        ? { ...goal, completedToday: true, drillUsedId: input.drillId }
        : goal
    ));
    setCompletionStatus(prev => ({ ...prev, completed: prev.completed + 1 }));

    try {
      const completion = await completeGoal(input);
      // Background refresh for accurate data
      loadGoals();
      return completion;
    } catch (err) {
      // Revert optimistic update on error
      setTodaysGoals(prev => prev.map(goal =>
        goal.goalId === input.goalId
          ? { ...goal, completedToday: false, drillUsedId: null }
          : goal
      ));
      setCompletionStatus(prev => ({ ...prev, completed: Math.max(0, prev.completed - 1) }));
      console.error('Failed to complete goal:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete goal');
      return null;
    }
  }, [loadGoals]);

  // Abandon a goal with optimistic update
  const handleAbandonGoal = useCallback(async (goalId: string, reason: string): Promise<Goal | null> => {
    // Optimistic: remove from today's goals
    const previousGoals = todaysGoals;
    setTodaysGoals(prev => prev.filter(g => g.goalId !== goalId));
    setAllGoals(prev => prev.map(g => g.id === goalId ? { ...g, status: 'abandoned' as const } : g));

    try {
      const goal = await abandonGoal(goalId, reason);
      loadGoals(); // Background refresh
      return goal;
    } catch (err) {
      // Revert on error
      setTodaysGoals(previousGoals);
      console.error('Failed to abandon goal:', err);
      setError(err instanceof Error ? err.message : 'Failed to abandon goal');
      return null;
    }
  }, [loadGoals, todaysGoals]);

  // Pause a goal with optimistic update
  const handlePauseGoal = useCallback(async (goalId: string): Promise<Goal | null> => {
    // Optimistic update
    const previousGoals = todaysGoals;
    setTodaysGoals(prev => prev.filter(g => g.goalId !== goalId));
    setAllGoals(prev => prev.map(g => g.id === goalId ? { ...g, status: 'paused' as const } : g));

    try {
      const goal = await pauseGoal(goalId);
      loadGoals(); // Background refresh
      return goal;
    } catch (err) {
      // Revert on error
      setTodaysGoals(previousGoals);
      console.error('Failed to pause goal:', err);
      setError(err instanceof Error ? err.message : 'Failed to pause goal');
      return null;
    }
  }, [loadGoals, todaysGoals]);

  // Resume a goal
  const handleResumeGoal = useCallback(async (goalId: string): Promise<Goal | null> => {
    try {
      const goal = await resumeGoal(goalId);
      await loadGoals();
      return goal;
    } catch (err) {
      console.error('Failed to resume goal:', err);
      setError(err instanceof Error ? err.message : 'Failed to resume goal');
      return null;
    }
  }, [loadGoals]);

  // Add goal from template
  const handleAddGoalFromTemplate = useCallback(async (templateId: string): Promise<GoalWithDrills | null> => {
    try {
      const goal = await createGoalFromTemplate(templateId);
      await loadGoals();
      return goal;
    } catch (err) {
      console.error('Failed to add goal:', err);
      setError(err instanceof Error ? err.message : 'Failed to add goal');
      return null;
    }
  }, [loadGoals]);

  // Initialize goals for new users
  const handleInitializeGoals = useCallback(async (): Promise<void> => {
    if (!userId) return;
    try {
      await initializeDefaultGoals(userId);
      await loadGoals();
    } catch (err) {
      console.error('Failed to initialize goals:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize goals');
    }
  }, [userId, loadGoals]);

  // Clear affirmation trigger (after user completes affirmation)
  const clearAffirmationTrigger = useCallback(() => {
    setGoalNeedingAffirmation(null);
  }, []);

  return {
    todaysGoals,
    allGoals,
    graduatedGoals,
    overallStreak,
    completionStatus,
    decayingDomains,
    loading,
    error,
    initialized,
    streakRisk,
    goalNeedingAffirmation,
    clearAffirmationTrigger,
    completeGoal: handleCompleteGoal,
    abandonGoal: handleAbandonGoal,
    pauseGoal: handlePauseGoal,
    resumeGoal: handleResumeGoal,
    addGoalFromTemplate: handleAddGoalFromTemplate,
    initializeGoals: handleInitializeGoals,
    refresh: loadGoals,
  };
}

// ============================================
// TEMPLATES HOOK
// ============================================

export interface UseGoalTemplatesReturn {
  templates: GoalTemplate[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useGoalTemplates(): UseGoalTemplatesReturn {
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getGoalTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  return {
    templates,
    loading,
    error,
    refresh: loadTemplates,
  };
}

// ============================================
// SINGLE GOAL HOOK
// ============================================

export interface UseSingleGoalReturn {
  goal: GoalWithDrills | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSingleGoal(goalId: string | null): UseSingleGoalReturn {
  const [goal, setGoal] = useState<GoalWithDrills | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGoal = useCallback(async () => {
    if (!goalId) {
      setGoal(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('id', goalId)
        .single();

      if (goalError) throw goalError;

      const { data: drillsData, error: drillsError } = await supabase
        .from('drills')
        .select('*')
        .eq('goal_id', goalId)
        .eq('active', true)
        .order('sort_order');

      if (drillsError) throw drillsError;

      // Import converters dynamically to avoid circular deps
      const { dbGoalToGoal, dbDrillToDrill } = await import('../types/goals');

      setGoal({
        ...dbGoalToGoal(goalData),
        drills: (drillsData || []).map(dbDrillToDrill),
      });
    } catch (err) {
      console.error('Failed to load goal:', err);
      setError(err instanceof Error ? err.message : 'Failed to load goal');
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  return {
    goal,
    loading,
    error,
    refresh: loadGoal,
  };
}
