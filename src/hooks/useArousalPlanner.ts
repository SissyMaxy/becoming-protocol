// Arousal Planner Hook
// Manages daily arousal plans with sessions, check-ins, and milestones

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  getTodayPlan,
  getOrCreateTodayPlan,
  startPlannedSession,
  completePlannedSession,
  skipPlannedSession,
  completeCheckIn,
  updateMilestoneProgress,
  achieveMilestone,
  expireOldPlans,
  generateDailyPrescription,
  type GeneratedPrescription,
} from '../lib/arousal-planner';
import type { ArousalState, PhysicalSign } from '../types/arousal';
import type {
  TodaysPlanView,
  PlannedEdgeSession,
  ArousalCheckIn,
  PrescriptionContext,
} from '../types/arousal-planner';

interface UseArousalPlannerReturn {
  // State
  todaysPlan: TodaysPlanView | null;
  nextScheduledItem: PlannedEdgeSession | ArousalCheckIn | null;
  nextItemType: 'session' | 'check_in' | null;
  overallProgress: number;
  isLoading: boolean;
  error: string | null;

  // Preview (before generation)
  prescriptionPreview: GeneratedPrescription | null;

  // Actions
  generatePlan: (context: PrescriptionContext) => Promise<void>;
  previewPrescription: (context: PrescriptionContext) => void;

  // Session actions
  startSession: (sessionId: string) => Promise<void>;
  completeSession: (
    sessionId: string,
    actualEdges: number,
    actualDurationMinutes: number,
    postSessionState: ArousalState,
    satisfactionRating?: number,
    linkedSessionId?: string
  ) => Promise<void>;
  skipSession: (sessionId: string) => Promise<void>;

  // Check-in actions
  submitCheckIn: (
    checkInId: string,
    arousalLevel: number,
    stateReported: ArousalState,
    achingIntensity?: number,
    physicalSigns?: PhysicalSign[],
    notes?: string
  ) => Promise<void>;

  // Milestone actions
  updateMilestone: (milestoneId: string, currentValue: number) => Promise<void>;
  completeMilestone: (milestoneId: string) => Promise<void>;

  // Utilities
  refresh: () => Promise<void>;
  getTimeUntilNext: () => { hours: number; minutes: number } | null;
}

export function useArousalPlanner(): UseArousalPlannerReturn {
  const [todaysPlan, setTodaysPlan] = useState<TodaysPlanView | null>(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState<GeneratedPrescription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const nextScheduledItem = todaysPlan?.nextScheduledItem || null;
  const nextItemType = todaysPlan?.nextItemType || null;
  const overallProgress = todaysPlan?.overallProgress || 0;

  // Load plan on mount
  useEffect(() => {
    loadTodaysPlan();
  }, []);

  const loadTodaysPlan = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Expire old plans first
      await expireOldPlans(user.id);

      // Get today's plan (may be null if not generated yet)
      const plan = await getTodayPlan(user.id);
      setTodaysPlan(plan);
    } catch (err) {
      console.error('Failed to load arousal plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plan');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Preview a prescription without saving
   */
  const previewPrescription = useCallback((context: PrescriptionContext) => {
    const prescription = generateDailyPrescription(context);
    setPrescriptionPreview(prescription);
  }, []);

  /**
   * Generate and save today's plan
   */
  const generatePlan = useCallback(async (context: PrescriptionContext) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const plan = await getOrCreateTodayPlan(user.id, context);
      setTodaysPlan(plan);
      setPrescriptionPreview(null); // Clear preview
    } catch (err) {
      console.error('Failed to generate plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate plan');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Start a planned session
   */
  const startSession = useCallback(async (sessionId: string) => {
    try {
      const success = await startPlannedSession(sessionId);
      if (!success) throw new Error('Failed to start session');

      // Refresh plan
      await loadTodaysPlan();
    } catch (err) {
      console.error('Failed to start session:', err);
      throw err;
    }
  }, [loadTodaysPlan]);

  /**
   * Complete a planned session
   */
  const completeSession = useCallback(async (
    sessionId: string,
    actualEdges: number,
    actualDurationMinutes: number,
    postSessionState: ArousalState,
    satisfactionRating?: number,
    linkedSessionId?: string
  ) => {
    try {
      const success = await completePlannedSession(
        sessionId,
        actualEdges,
        actualDurationMinutes,
        postSessionState,
        satisfactionRating,
        linkedSessionId
      );
      if (!success) throw new Error('Failed to complete session');

      // Refresh plan
      await loadTodaysPlan();
    } catch (err) {
      console.error('Failed to complete session:', err);
      throw err;
    }
  }, [loadTodaysPlan]);

  /**
   * Skip a planned session
   */
  const skipSession = useCallback(async (sessionId: string) => {
    try {
      const success = await skipPlannedSession(sessionId);
      if (!success) throw new Error('Failed to skip session');

      // Refresh plan
      await loadTodaysPlan();
    } catch (err) {
      console.error('Failed to skip session:', err);
      throw err;
    }
  }, [loadTodaysPlan]);

  /**
   * Submit a check-in
   */
  const submitCheckIn = useCallback(async (
    checkInId: string,
    arousalLevel: number,
    stateReported: ArousalState,
    achingIntensity?: number,
    physicalSigns?: PhysicalSign[],
    notes?: string
  ) => {
    try {
      const success = await completeCheckIn(
        checkInId,
        arousalLevel,
        stateReported,
        achingIntensity,
        physicalSigns as string[],
        notes
      );
      if (!success) throw new Error('Failed to submit check-in');

      // Refresh plan
      await loadTodaysPlan();
    } catch (err) {
      console.error('Failed to submit check-in:', err);
      throw err;
    }
  }, [loadTodaysPlan]);

  /**
   * Update milestone progress
   */
  const updateMilestone = useCallback(async (milestoneId: string, currentValue: number) => {
    try {
      const success = await updateMilestoneProgress(milestoneId, currentValue);
      if (!success) throw new Error('Failed to update milestone');

      // Refresh plan
      await loadTodaysPlan();
    } catch (err) {
      console.error('Failed to update milestone:', err);
      throw err;
    }
  }, [loadTodaysPlan]);

  /**
   * Manually complete a milestone
   */
  const completeMilestone = useCallback(async (milestoneId: string) => {
    try {
      const success = await achieveMilestone(milestoneId);
      if (!success) throw new Error('Failed to complete milestone');

      // Refresh plan
      await loadTodaysPlan();
    } catch (err) {
      console.error('Failed to complete milestone:', err);
      throw err;
    }
  }, [loadTodaysPlan]);

  /**
   * Get time until next scheduled item
   */
  const getTimeUntilNext = useCallback((): { hours: number; minutes: number } | null => {
    if (!nextScheduledItem) return null;

    const now = new Date();
    const scheduledTime = nextScheduledItem.scheduledTime;
    const [hours, minutes] = scheduledTime.split(':').map(Number);

    const scheduled = new Date();
    scheduled.setHours(hours, minutes, 0, 0);

    if (scheduled <= now) return null;

    const diffMs = scheduled.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    return {
      hours: Math.floor(diffMinutes / 60),
      minutes: diffMinutes % 60,
    };
  }, [nextScheduledItem]);

  return {
    // State
    todaysPlan,
    nextScheduledItem,
    nextItemType,
    overallProgress,
    isLoading,
    error,
    prescriptionPreview,

    // Actions
    generatePlan,
    previewPrescription,
    startSession,
    completeSession,
    skipSession,
    submitCheckIn,
    updateMilestone,
    completeMilestone,

    // Utilities
    refresh: loadTodaysPlan,
    getTimeUntilNext,
  };
}

// ============================================
// HELPER FUNCTION: Build context from arousal state
// ============================================

export function buildPrescriptionContext(
  userId: string,
  currentState: ArousalState,
  streakDays: number,
  isLocked: boolean,
  chastityHoursToday: number = 0
): PrescriptionContext {
  return {
    userId,
    currentState,
    denialDays: streakDays,
    isChastityLocked: isLocked,
    chastityHoursToday,
    recentEdgeSessions: [],
    recentCheckIns: [],
    optimalMinDays: 5,
    optimalMaxDays: 14,
    averageSweetSpotEntryDay: 5,
  };
}
