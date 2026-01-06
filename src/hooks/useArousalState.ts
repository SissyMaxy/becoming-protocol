// Arousal State Management Hook

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  getTodayArousalState,
  getRecentArousalStates,
  getCurrentStreak,
  getCachedOrComputeMetrics,
  computeArousalMetrics,
} from '../lib/arousal-metrics';
import {
  getStateRecommendations,
  doesReleaseResetStreak,
} from '../lib/arousal-state-machine';
import type {
  ArousalState,
  ArousalMetrics,
  ArousalStateEntry,
  DenialStreak,
  ArousalCheckInInput,
  OrgasmLogInput,
  StateRecommendation,
} from '../types/arousal';

interface UseArousalStateReturn {
  // State
  currentState: ArousalState;
  todayEntry: ArousalStateEntry | null;
  metrics: ArousalMetrics | null;
  currentStreak: DenialStreak | null;
  recommendations: StateRecommendation;
  recentStates: ArousalStateEntry[];
  isLoading: boolean;
  error: string | null;

  // Actions
  logArousalCheckIn: (data: ArousalCheckInInput) => Promise<void>;
  logOrgasm: (data: OrgasmLogInput) => Promise<void>;
  startNewStreak: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useArousalState(): UseArousalStateReturn {
  const [currentState, setCurrentState] = useState<ArousalState>('baseline');
  const [todayEntry, setTodayEntry] = useState<ArousalStateEntry | null>(null);
  const [metrics, setMetrics] = useState<ArousalMetrics | null>(null);
  const [currentStreak, setCurrentStreak] = useState<DenialStreak | null>(null);
  const [recentStates, setRecentStates] = useState<ArousalStateEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get recommendations based on current state
  const recommendations = getStateRecommendations(currentState);

  // Load initial data
  useEffect(() => {
    loadArousalData();
  }, []);

  const loadArousalData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const [todayData, metricsData, streakData, recentData] = await Promise.all([
        getTodayArousalState(),
        getCachedOrComputeMetrics(user.id),
        getCurrentStreak(),
        getRecentArousalStates(30),
      ]);

      setTodayEntry(todayData);
      setMetrics(metricsData);
      setCurrentStreak(streakData);
      setRecentStates(recentData);

      // Determine current state
      const state = todayData?.state || metricsData?.currentState || 'baseline';
      setCurrentState(state);
    } catch (err) {
      console.error('Failed to load arousal data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load arousal data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Log an arousal check-in
   */
  const logArousalCheckIn = useCallback(async (data: ArousalCheckInInput) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const today = new Date().toISOString().split('T')[0];

      const { error: upsertError } = await supabase
        .from('arousal_states')
        .upsert({
          user_id: user.id,
          date: today,
          state: data.state,
          arousal_level: data.arousalLevel,
          feminization_receptivity: data.feminizationReceptivity,
          aching_intensity: data.achingIntensity,
          edge_count: data.edgeCount,
          physical_signs: data.physicalSigns,
          notes: data.notes || null,
          logged_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (upsertError) throw upsertError;

      // Update local state
      setCurrentState(data.state);
      setTodayEntry({
        id: '', // Will be refreshed
        userId: user.id,
        date: today,
        state: data.state,
        arousalLevel: data.arousalLevel,
        feminizationReceptivity: data.feminizationReceptivity,
        achingIntensity: data.achingIntensity,
        edgeCount: data.edgeCount,
        physicalSigns: data.physicalSigns,
        notes: data.notes,
        loggedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Refresh metrics
      const newMetrics = await computeArousalMetrics(user.id);
      setMetrics(newMetrics);
    } catch (err) {
      console.error('Failed to log arousal check-in:', err);
      throw err;
    }
  }, []);

  /**
   * Log an orgasm event
   */
  const logOrgasm = useCallback(async (data: OrgasmLogInput) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Insert orgasm record
      const { data: orgasmRecord, error: insertError } = await supabase
        .from('orgasm_log')
        .insert({
          user_id: user.id,
          release_type: data.releaseType,
          context: data.context,
          planned: data.planned,
          state_before: currentState,
          days_since_last: metrics?.currentStreakDays || 0,
          intensity: data.intensity || null,
          satisfaction: data.satisfaction || null,
          regret_level: data.regretLevel || null,
          trigger: data.trigger || null,
          notes: data.notes || null,
          partner_initiated: data.partnerInitiated || false,
          partner_controlled: data.partnerControlled || false,
          partner_aware: data.partnerAware || false,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Handle streak based on release type
      if (doesReleaseResetStreak(data.releaseType)) {
        // End current streak
        if (currentStreak) {
          await supabase.rpc('end_current_streak', {
            p_user_id: user.id,
            p_ended_by: data.releaseType === 'full' ? 'full_release' : data.releaseType,
            p_orgasm_id: orgasmRecord.id,
          });
        }

        // Start new streak
        await supabase.rpc('start_new_streak', {
          p_user_id: user.id,
        });

        // Update state to post_release
        const today = new Date().toISOString().split('T')[0];
        await supabase
          .from('arousal_states')
          .upsert({
            user_id: user.id,
            date: today,
            state: 'post_release',
            arousal_level: 2,
            feminization_receptivity: 3,
            aching_intensity: 1,
            edge_count: 0,
            physical_signs: ['calm'],
            logged_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        setCurrentState('post_release');
      } else {
        // Prostate/sissygasm - increment counter but don't reset
        if (currentStreak && data.releaseType === 'prostate') {
          await supabase
            .from('denial_streaks')
            .update({
              prostate_orgasms_during: (currentStreak.prostateOrgasmsDuring || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', currentStreak.id);
        }
      }

      // Refresh all data
      await loadArousalData();
    } catch (err) {
      console.error('Failed to log orgasm:', err);
      throw err;
    }
  }, [currentState, metrics, currentStreak, loadArousalData]);

  /**
   * Start a new denial streak
   */
  const startNewStreak = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if there's already an ongoing streak
      if (currentStreak && !currentStreak.endedAt) {
        throw new Error('There is already an ongoing streak');
      }

      await supabase.rpc('start_new_streak', {
        p_user_id: user.id,
      });

      // Refresh streak data
      const newStreak = await getCurrentStreak();
      setCurrentStreak(newStreak);
    } catch (err) {
      console.error('Failed to start new streak:', err);
      throw err;
    }
  }, [currentStreak]);

  return {
    currentState,
    todayEntry,
    metrics,
    currentStreak,
    recommendations,
    recentStates,
    isLoading,
    error,
    logArousalCheckIn,
    logOrgasm,
    startNewStreak,
    refresh: loadArousalData,
  };
}
