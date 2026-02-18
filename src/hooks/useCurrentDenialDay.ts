// useCurrentDenialDay Hook
// Tracks denial streak and provides denial-related computed values

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { DenialStreak, ArousalMetrics, ReleaseType } from '../types/arousal';

interface DenialStatus {
  // Current streak info
  currentDay: number;
  isOnStreak: boolean;
  streakStartDate: string | null;

  // Milestones
  nextMilestone: number;
  daysToNextMilestone: number;
  milestonesReached: number[];

  // Earned release
  earnedReleaseDay: number;
  canRelease: boolean;
  daysUntilEarnedRelease: number;

  // Records
  personalBest: number;
  isPersonalBest: boolean;

  // Stats
  totalEdgesDuringStreak: number;
  prostateOrgasmsDuringStreak: number;
  sweetSpotDaysThisStreak: number;

  // Loading state
  isLoading: boolean;
  error: string | null;
}

interface DenialActions {
  extendStreak: (additionalDays: number) => Promise<void>;
  recordRelease: (releaseType: ReleaseType) => Promise<void>;
  addEdgesToStreak: (count: number) => Promise<void>;
  refreshStatus: () => Promise<void>;
}

// Milestone days for achievements
const DENIAL_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 365];

// Default minimum days before "earned" release
const DEFAULT_EARNED_RELEASE_DAYS = 7;

export function useCurrentDenialDay(): DenialStatus & DenialActions {
  const { user } = useAuth();
  const [currentStreak, setCurrentStreak] = useState<DenialStreak | null>(null);
  const [metrics, setMetrics] = useState<ArousalMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load current streak and metrics
  const loadDenialStatus = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError(null);

      // Get current active streak (no end date)
      const { data: streakData, error: streakError } = await supabase
        .from('denial_streaks')
        .select('*')
        .eq('user_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (streakError && streakError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        console.error('Error loading denial streak:', streakError);
      }

      if (streakData) {
        setCurrentStreak({
          id: streakData.id,
          userId: streakData.user_id,
          startedAt: streakData.started_at,
          endedAt: streakData.ended_at,
          endedBy: streakData.ended_by,
          endingOrgasmId: streakData.ending_orgasm_id,
          daysCompleted: streakData.days_completed,
          edgesDuring: streakData.edges_during || 0,
          prostateOrgasmsDuring: streakData.prostate_orgasms_during || 0,
          sweetSpotDays: streakData.sweet_spot_days || 0,
          isPersonalRecord: streakData.is_personal_record || false,
          notes: streakData.notes,
          createdAt: streakData.created_at,
          updatedAt: streakData.updated_at,
        });
      } else {
        setCurrentStreak(null);
      }

      // Get metrics for personal best
      const { data: metricsData, error: metricsError } = await supabase
        .from('arousal_metrics')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (metricsError && metricsError.code !== 'PGRST116') {
        console.error('Error loading metrics:', metricsError);
      }

      if (metricsData) {
        setMetrics({
          userId: metricsData.user_id,
          currentStreakDays: metricsData.current_streak_days || 0,
          currentState: metricsData.current_state,
          daysInCurrentState: metricsData.days_in_current_state || 0,
          averageCycleLength: metricsData.average_cycle_length,
          averageSweetSpotEntryDay: metricsData.average_sweet_spot_entry_day,
          averageOverloadDay: metricsData.average_overload_day,
          sweetSpotPercentage: metricsData.sweet_spot_percentage,
          postReleasePercentage: metricsData.post_release_percentage,
          optimalMinDays: metricsData.optimal_min_days,
          optimalMaxDays: metricsData.optimal_max_days,
          slipRate: metricsData.slip_rate,
          averageDaysToSlip: metricsData.average_days_to_slip,
          highRiskContexts: metricsData.high_risk_contexts || [],
          longestStreak: metricsData.longest_streak || 0,
          longestSweetSpotStreak: metricsData.longest_sweet_spot_streak || 0,
          arousalPracticeCorrelation: metricsData.arousal_practice_correlation,
          lastComputedAt: metricsData.last_computed_at,
        });
      }
    } catch (err) {
      console.error('Error in loadDenialStatus:', err);
      setError(err instanceof Error ? err.message : 'Failed to load denial status');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load on mount and user change
  useEffect(() => {
    loadDenialStatus();
  }, [loadDenialStatus]);

  // Calculate current day
  const currentDay = useMemo(() => {
    if (!currentStreak?.startedAt) return 0;
    const start = new Date(currentStreak.startedAt);
    const now = new Date();
    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, [currentStreak?.startedAt]);

  // Calculate milestones
  const milestonesReached = useMemo(() => {
    return DENIAL_MILESTONES.filter(m => currentDay >= m);
  }, [currentDay]);

  const nextMilestone = useMemo(() => {
    return DENIAL_MILESTONES.find(m => m > currentDay) || DENIAL_MILESTONES[DENIAL_MILESTONES.length - 1];
  }, [currentDay]);

  const daysToNextMilestone = useMemo(() => {
    return Math.max(0, nextMilestone - currentDay);
  }, [nextMilestone, currentDay]);

  // Calculate earned release
  const earnedReleaseDay = useMemo(() => {
    // Use optimal min days from metrics, or default
    return metrics?.optimalMinDays || DEFAULT_EARNED_RELEASE_DAYS;
  }, [metrics?.optimalMinDays]);

  const canRelease = useMemo(() => {
    return currentDay >= earnedReleaseDay;
  }, [currentDay, earnedReleaseDay]);

  const daysUntilEarnedRelease = useMemo(() => {
    return Math.max(0, earnedReleaseDay - currentDay);
  }, [earnedReleaseDay, currentDay]);

  // Personal best check
  const personalBest = metrics?.longestStreak || 0;
  const isPersonalBest = currentDay > personalBest;

  // Actions
  const extendStreak = useCallback(async (additionalDays: number) => {
    if (!user?.id) return;

    // This would update user preferences for earned release day
    // For now, just log it
    console.log(`Extending streak requirement by ${additionalDays} days`);

    // Could update a user_preferences table with extended_release_day
  }, [user?.id]);

  const recordRelease = useCallback(async (releaseType: ReleaseType) => {
    if (!user?.id || !currentStreak) return;

    const resetsStreak = ['full', 'ruined', 'wet_dream', 'accident'].includes(releaseType);

    if (resetsStreak) {
      // End current streak
      const { error } = await supabase
        .from('denial_streaks')
        .update({
          ended_at: new Date().toISOString(),
          ended_by: releaseType === 'full' ? 'full_release' : releaseType,
          days_completed: currentDay,
          is_personal_record: isPersonalBest,
        })
        .eq('id', currentStreak.id);

      if (error) {
        console.error('Error ending streak:', error);
        throw error;
      }

      // Start new streak
      const { error: newStreakError } = await supabase
        .from('denial_streaks')
        .insert({
          user_id: user.id,
          started_at: new Date().toISOString(),
          edges_during: 0,
          prostate_orgasms_during: 0,
          sweet_spot_days: 0,
          is_personal_record: false,
        });

      if (newStreakError) {
        console.error('Error starting new streak:', newStreakError);
      }
    } else {
      // Prostate/sissygasm - update counter but don't end streak
      const { error } = await supabase
        .from('denial_streaks')
        .update({
          prostate_orgasms_during: (currentStreak.prostateOrgasmsDuring || 0) + 1,
        })
        .eq('id', currentStreak.id);

      if (error) {
        console.error('Error updating prostate count:', error);
      }
    }

    await loadDenialStatus();
  }, [user?.id, currentStreak, currentDay, isPersonalBest, loadDenialStatus]);

  const addEdgesToStreak = useCallback(async (count: number) => {
    if (!user?.id || !currentStreak) return;

    const { error } = await supabase
      .from('denial_streaks')
      .update({
        edges_during: (currentStreak.edgesDuring || 0) + count,
      })
      .eq('id', currentStreak.id);

    if (error) {
      console.error('Error adding edges:', error);
    }

    await loadDenialStatus();
  }, [user?.id, currentStreak, loadDenialStatus]);

  return {
    // Status
    currentDay,
    isOnStreak: !!currentStreak,
    streakStartDate: currentStreak?.startedAt || null,

    // Milestones
    nextMilestone,
    daysToNextMilestone,
    milestonesReached,

    // Earned release
    earnedReleaseDay,
    canRelease,
    daysUntilEarnedRelease,

    // Records
    personalBest,
    isPersonalBest,

    // Stats
    totalEdgesDuringStreak: currentStreak?.edgesDuring || 0,
    prostateOrgasmsDuringStreak: currentStreak?.prostateOrgasmsDuring || 0,
    sweetSpotDaysThisStreak: currentStreak?.sweetSpotDays || 0,

    // State
    isLoading,
    error,

    // Actions
    extendStreak,
    recordRelease,
    addEdgesToStreak,
    refreshStatus: loadDenialStatus,
  };
}

// Standalone function to get denial day without hook (for non-component use)
export async function getCurrentDenialDay(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('denial_streaks')
    .select('started_at')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 0;

  const start = new Date(data.started_at);
  const now = new Date();
  const diffTime = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}
