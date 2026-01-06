/**
 * useWeekend Hook
 *
 * React hook for managing weekend activities, plans, and Gina integration.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  WeekendActivity,
  WeekendSession,
  WeekendPlan,
  PlannedActivity,
  GinaIntegrationProgress,
  ActivityFeedback
} from '../types/weekend';
import { isWeekend, getWeekendDay, getWeekendStart } from '../types/weekend';
import {
  getWeekendActivities,
  getActivityById,
  getTodaySessions,
  getSessionsForWeekend,
  getCurrentWeekendPlan,
  saveWeekendPlan,
  getGinaIntegrationProgress,
  completeActivity as completeActivityStorage,
  recordMilestone,
  getCompletedActivityIds
} from '../lib/weekend-storage';
import {
  generateWeekendPrescription,
  getTodayActivitiesFromPlan,
  getActivityMilestone,
  calculateWeekendCompletion
} from '../lib/weekend-prescription';

export interface UseWeekendReturn {
  // State
  isWeekendDay: boolean;
  weekendDay: 'saturday' | 'sunday' | null;
  isLoading: boolean;
  error: string | null;

  // Current plan
  currentPlan: WeekendPlan | null;
  todaysActivities: PlannedActivity[];
  weekendCompletion: { completed: number; total: number; percentage: number };

  // Sessions
  todaysSessions: WeekendSession[];

  // Integration progress
  integrationProgress: GinaIntegrationProgress | null;

  // All activities (for reference)
  allActivities: WeekendActivity[];

  // Actions
  generatePlan: () => Promise<void>;
  completeActivity: (activityId: string, feedback: ActivityFeedback) => Promise<void>;
  skipActivity: (activityId: string) => Promise<void>;
  refreshData: () => Promise<void>;

  // Helpers
  getActivityDetails: (activityId: string) => WeekendActivity | undefined;
  getPlannedActivity: (activityId: string) => PlannedActivity | undefined;
}

export function useWeekend(): UseWeekendReturn {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [currentPlan, setCurrentPlan] = useState<WeekendPlan | null>(null);
  const [todaysSessions, setTodaysSessions] = useState<WeekendSession[]>([]);
  const [integrationProgress, setIntegrationProgress] = useState<GinaIntegrationProgress | null>(null);
  const [allActivities] = useState<WeekendActivity[]>(getWeekendActivities());

  // Derived state
  const isWeekendDay = isWeekend();
  const weekendDay = getWeekendDay();

  // Get today's activities from plan (max 3)
  const todaysActivities = currentPlan
    ? getTodayActivitiesFromPlan(currentPlan).slice(0, 3)
    : [];

  // Calculate completion
  const weekendCompletion = currentPlan
    ? calculateWeekendCompletion(currentPlan)
    : { completed: 0, total: 0, percentage: 0 };

  /**
   * Load all weekend data
   */
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load in parallel
      const [plan, sessions, progress] = await Promise.all([
        getCurrentWeekendPlan(),
        getTodaySessions(),
        getGinaIntegrationProgress()
      ]);

      setCurrentPlan(plan);
      setTodaysSessions(sessions);
      setIntegrationProgress(progress);

      // If it's a weekend and no plan exists, generate one
      if (isWeekendDay && !plan) {
        await generatePlanInternal(progress);
      }
    } catch (err) {
      console.error('Error loading weekend data:', err);
      setError('Failed to load weekend data');
    } finally {
      setIsLoading(false);
    }
  }, [isWeekendDay]);

  /**
   * Generate a new weekend plan
   */
  const generatePlanInternal = async (progress: GinaIntegrationProgress | null) => {
    try {
      const effectiveProgress = progress || {
        id: '',
        userId: '',
        currentLevel: 1 as const,
        levelGinaFeminizing: 1 as const,
        levelSharedActivities: 1 as const,
        levelIntimacy: 1 as const,
        levelSupport: 1 as const,
        milestones: {},
        totalGinaFeminizingSessions: 0,
        totalSharedSessions: 0,
        totalIntimacySessions: 0,
        totalSupportSessions: 0,
        ginaAvgEngagement: 0,
        ginaInitiatedCount: 0,
        lockedActivities: [],
        updatedAt: new Date().toISOString()
      };

      // Get previous activity IDs
      const previousActivityIds = await getCompletedActivityIds();

      // Get last weekend's activities
      const lastWeekend = new Date();
      lastWeekend.setDate(lastWeekend.getDate() - 7);
      const lastWeekendSessions = await getSessionsForWeekend(
        getWeekendStart(lastWeekend)
      );
      const lastWeekendActivityIds = lastWeekendSessions.map(s => s.activityId);

      // Generate prescription
      const prescription = generateWeekendPrescription({
        integrationProgress: effectiveProgress,
        previousActivityIds,
        lastWeekendActivityIds,
        completedMilestones: Object.keys(effectiveProgress.milestones).filter(
          k => effectiveProgress.milestones[k as keyof typeof effectiveProgress.milestones]
        )
      });

      // Save plan
      await saveWeekendPlan(prescription);

      // Reload to get the saved plan with ID
      const savedPlan = await getCurrentWeekendPlan();
      setCurrentPlan(savedPlan);
    } catch (err) {
      console.error('Error generating weekend plan:', err);
      setError('Failed to generate weekend plan');
    }
  };

  /**
   * Generate a new weekend plan (public API)
   */
  const generatePlan = useCallback(async () => {
    await generatePlanInternal(integrationProgress);
  }, [integrationProgress]);

  /**
   * Complete an activity with feedback
   */
  const completeActivity = useCallback(async (
    activityId: string,
    feedback: ActivityFeedback
  ) => {
    try {
      // Save the session
      await completeActivityStorage(activityId, feedback);

      // Check for milestone
      const milestone = getActivityMilestone(activityId);
      if (milestone && feedback.completed) {
        await recordMilestone(milestone);
      }

      // Update plan status
      if (currentPlan) {
        const updatedPlan = { ...currentPlan };

        // Update Saturday activities
        updatedPlan.saturdayActivities = updatedPlan.saturdayActivities.map(a =>
          a.activityId === activityId
            ? { ...a, status: feedback.completed ? 'completed' : 'skipped' as const }
            : a
        );

        // Update Sunday activities
        updatedPlan.sundayActivities = updatedPlan.sundayActivities.map(a =>
          a.activityId === activityId
            ? { ...a, status: feedback.completed ? 'completed' : 'skipped' as const }
            : a
        );

        await saveWeekendPlan(updatedPlan);
        setCurrentPlan(updatedPlan);
      }

      // Reload sessions
      const sessions = await getTodaySessions();
      setTodaysSessions(sessions);

      // Reload progress (might have been updated by trigger)
      const progress = await getGinaIntegrationProgress();
      setIntegrationProgress(progress);
    } catch (err) {
      console.error('Error completing activity:', err);
      setError('Failed to complete activity');
    }
  }, [currentPlan]);

  /**
   * Skip an activity
   */
  const skipActivity = useCallback(async (activityId: string) => {
    try {
      // Update plan status
      if (currentPlan) {
        const updatedPlan = { ...currentPlan };

        // Update Saturday activities
        updatedPlan.saturdayActivities = updatedPlan.saturdayActivities.map(a =>
          a.activityId === activityId
            ? { ...a, status: 'skipped' as const }
            : a
        );

        // Update Sunday activities
        updatedPlan.sundayActivities = updatedPlan.sundayActivities.map(a =>
          a.activityId === activityId
            ? { ...a, status: 'skipped' as const }
            : a
        );

        await saveWeekendPlan(updatedPlan);
        setCurrentPlan(updatedPlan);
      }
    } catch (err) {
      console.error('Error skipping activity:', err);
      setError('Failed to skip activity');
    }
  }, [currentPlan]);

  /**
   * Refresh all data
   */
  const refreshData = useCallback(async () => {
    await loadData();
  }, [loadData]);

  /**
   * Get activity details by ID
   */
  const getActivityDetails = useCallback((activityId: string): WeekendActivity | undefined => {
    return getActivityById(activityId);
  }, []);

  /**
   * Get planned activity by ID
   */
  const getPlannedActivity = useCallback((activityId: string): PlannedActivity | undefined => {
    if (!currentPlan) return undefined;

    const saturday = currentPlan.saturdayActivities.find(a => a.activityId === activityId);
    if (saturday) return saturday;

    return currentPlan.sundayActivities.find(a => a.activityId === activityId);
  }, [currentPlan]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    // State
    isWeekendDay,
    weekendDay,
    isLoading,
    error,

    // Current plan
    currentPlan,
    todaysActivities,
    weekendCompletion,

    // Sessions
    todaysSessions,

    // Integration progress
    integrationProgress,

    // All activities
    allActivities,

    // Actions
    generatePlan,
    completeActivity,
    skipActivity,
    refreshData,

    // Helpers
    getActivityDetails,
    getPlannedActivity
  };
}

/**
 * Hook to check if today is a weekend (simpler version)
 */
export function useIsWeekend(): boolean {
  return isWeekend();
}

/**
 * Hook to get current weekend day
 */
export function useWeekendDay(): 'saturday' | 'sunday' | null {
  return getWeekendDay();
}
