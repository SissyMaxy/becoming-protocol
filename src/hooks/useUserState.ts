/**
 * useUserState Hook
 * Manages the v2 user_state table - central state tracking
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { OdometerState, TimeOfDay } from '../lib/rules-engine-v2';
import { getCurrentTimeOfDay } from '../lib/rules-engine-v2';
import { handleOdometerChange } from '../lib/corruption-crisis';

// Handler mode types
export type HandlerMode = 'architect' | 'director' | 'handler' | 'caretaker' | 'invisible';

// Executive function estimate
export type ExecFunction = 'high' | 'medium' | 'low' | 'depleted';

// Full user state from database
export interface UserState {
  id: string;
  userId: string;

  // Identity
  odometer: OdometerState;
  currentPhase: number;

  // Streaks
  streakDays: number;
  longestStreak: number;
  domainStreaks: Record<string, number>;

  // Arousal/Denial
  denialDay: number;
  currentArousal: number;
  inSession: boolean;
  sessionType: string | null;
  edgeCount: number;
  lastRelease: string | null;

  // Context
  ginaHome: boolean;
  ginaAsleep: boolean;
  estimatedExecFunction: ExecFunction;

  // Handler
  handlerMode: HandlerMode;
  escalationLevel: number;
  vulnerabilityWindowActive: boolean;
  resistanceDetected: boolean;

  // Gina
  ginaVisibilityLevel: number;

  // Tracking
  tasksCompletedToday: number;
  lastTaskCategory: string | null;
  lastTaskDomain: string | null;
  completedToday: string[];
  avoidedDomains: string[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Partial update type
export type UserStateUpdate = Partial<Omit<UserState, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;

// Quick state update payload
export interface QuickStateInput {
  mood?: number; // 1-10
  arousal?: number; // 0-5
  execFunction?: ExecFunction;
  ginaHome?: boolean;
  ginaAsleep?: boolean;
}

// Hook return type
interface UseUserStateReturn {
  userState: UserState | null;
  isLoading: boolean;
  error: string | null;
  timeOfDay: TimeOfDay;

  // Actions
  refreshState: () => Promise<void>;
  updateState: (update: UserStateUpdate) => Promise<void>;
  quickUpdate: (input: QuickStateInput) => Promise<void>;

  // Streak operations
  incrementStreak: () => Promise<void>;
  resetStreak: () => Promise<void>;

  // Task tracking
  recordTaskCompletion: (taskCategory: string, taskDomain: string) => Promise<void>;

  // Arousal tracking
  incrementArousal: () => Promise<void>;
  decrementArousal: () => Promise<void>;
  setInSession: (inSession: boolean, sessionType?: string) => Promise<void>;

  // Gina context
  setGinaHome: (home: boolean) => Promise<void>;
}

// Map database row to UserState
function mapDbToUserState(row: Record<string, unknown>): UserState {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    odometer: (row.odometer as OdometerState) || 'coasting',
    currentPhase: (row.current_phase as number) || 0,
    streakDays: (row.streak_days as number) || 0,
    longestStreak: (row.longest_streak as number) || 0,
    domainStreaks: (row.domain_streaks as Record<string, number>) || {},
    denialDay: (row.denial_day as number) || 0,
    currentArousal: (row.current_arousal as number) || 0,
    inSession: (row.in_session as boolean) || false,
    sessionType: row.session_type as string | null,
    edgeCount: (row.edge_count as number) || 0,
    lastRelease: row.last_release as string | null,
    ginaHome: row.gina_home !== false, // Default to true
    ginaAsleep: (row.gina_asleep as boolean) || false,
    estimatedExecFunction: (row.estimated_exec_function as ExecFunction) || 'medium',
    handlerMode: (row.handler_mode as HandlerMode) || 'director',
    escalationLevel: (row.escalation_level as number) || 1,
    vulnerabilityWindowActive: (row.vulnerability_window_active as boolean) || false,
    resistanceDetected: (row.resistance_detected as boolean) || false,
    ginaVisibilityLevel: (row.gina_visibility_level as number) || 0,
    tasksCompletedToday: (row.tasks_completed_today as number) || 0,
    lastTaskCategory: row.last_task_category as string | null,
    lastTaskDomain: row.last_task_domain as string | null,
    completedToday: (row.completed_today as string[]) || [],
    avoidedDomains: (row.avoided_domains as string[]) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Map UserStateUpdate to database columns
function mapUpdateToDb(update: UserStateUpdate): Record<string, unknown> {
  const dbUpdate: Record<string, unknown> = {};

  if (update.odometer !== undefined) dbUpdate.odometer = update.odometer;
  if (update.currentPhase !== undefined) dbUpdate.current_phase = update.currentPhase;
  if (update.streakDays !== undefined) dbUpdate.streak_days = update.streakDays;
  if (update.longestStreak !== undefined) dbUpdate.longest_streak = update.longestStreak;
  if (update.domainStreaks !== undefined) dbUpdate.domain_streaks = update.domainStreaks;
  if (update.denialDay !== undefined) dbUpdate.denial_day = update.denialDay;
  if (update.currentArousal !== undefined) dbUpdate.current_arousal = update.currentArousal;
  if (update.inSession !== undefined) dbUpdate.in_session = update.inSession;
  if (update.sessionType !== undefined) dbUpdate.session_type = update.sessionType;
  if (update.edgeCount !== undefined) dbUpdate.edge_count = update.edgeCount;
  if (update.lastRelease !== undefined) dbUpdate.last_release = update.lastRelease;
  if (update.ginaHome !== undefined) dbUpdate.gina_home = update.ginaHome;
  if (update.ginaAsleep !== undefined) dbUpdate.gina_asleep = update.ginaAsleep;
  if (update.estimatedExecFunction !== undefined) dbUpdate.estimated_exec_function = update.estimatedExecFunction;
  if (update.handlerMode !== undefined) dbUpdate.handler_mode = update.handlerMode;
  if (update.escalationLevel !== undefined) dbUpdate.escalation_level = update.escalationLevel;
  if (update.vulnerabilityWindowActive !== undefined) dbUpdate.vulnerability_window_active = update.vulnerabilityWindowActive;
  if (update.resistanceDetected !== undefined) dbUpdate.resistance_detected = update.resistanceDetected;
  if (update.ginaVisibilityLevel !== undefined) dbUpdate.gina_visibility_level = update.ginaVisibilityLevel;
  if (update.tasksCompletedToday !== undefined) dbUpdate.tasks_completed_today = update.tasksCompletedToday;
  if (update.lastTaskCategory !== undefined) dbUpdate.last_task_category = update.lastTaskCategory;
  if (update.lastTaskDomain !== undefined) dbUpdate.last_task_domain = update.lastTaskDomain;
  if (update.completedToday !== undefined) dbUpdate.completed_today = update.completedToday;
  if (update.avoidedDomains !== undefined) dbUpdate.avoided_domains = update.avoidedDomains;

  return dbUpdate;
}

export function useUserState(): UseUserStateReturn {
  const [userState, setUserState] = useState<UserState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getCurrentTimeOfDay());
  const prevOdometerRef = useRef<string | null>(null);

  // Update time of day periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(getCurrentTimeOfDay());
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Fetch user state
  const refreshState = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setIsLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('user_state')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching user state:', fetchError);
        setError(fetchError.message);
        setIsLoading(false);
        return;
      }

      if (!data) {
        // Create initial user state
        const { data: newData, error: createError } = await supabase
          .from('user_state')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (createError) {
          console.error('Error creating user state:', createError);
          setError(createError.message);
          setIsLoading(false);
          return;
        }

        setUserState(mapDbToUserState(newData));
      } else {
        setUserState(mapDbToUserState(data));
      }

      setError(null);
    } catch (err) {
      console.error('Error in refreshState:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // Update state
  const updateState = useCallback(async (update: UserStateUpdate) => {
    if (!userState) return;

    const dbUpdate = mapUpdateToDb(update);

    const { error: updateError } = await supabase
      .from('user_state')
      .update(dbUpdate)
      .eq('id', userState.id);

    if (updateError) {
      console.error('Error updating user state:', updateError);
      setError(updateError.message);
      return;
    }

    // Optimistic update
    setUserState(prev => prev ? { ...prev, ...update } : prev);
  }, [userState]);

  // Quick state update (mood, arousal, exec function, Gina home)
  const quickUpdate = useCallback(async (input: QuickStateInput) => {
    const update: UserStateUpdate = {};

    if (input.arousal !== undefined) {
      update.currentArousal = Math.max(0, Math.min(5, input.arousal));
    }

    if (input.execFunction !== undefined) {
      update.estimatedExecFunction = input.execFunction;
    }

    if (input.ginaHome !== undefined) {
      update.ginaHome = input.ginaHome;
    }

    if (input.ginaAsleep !== undefined) {
      update.ginaAsleep = input.ginaAsleep;
    }

    // If mood is provided, we should also log it to mood_checkins
    if (input.mood !== undefined && userState) {
      const { error: moodError } = await supabase.from('mood_checkins').insert({
        user_id: userState.userId,
        score: input.mood,
        energy: input.execFunction === 'high' ? 8 : input.execFunction === 'medium' ? 5 : input.execFunction === 'low' ? 3 : 1,
      });
      if (moodError) {
        console.error('Error saving mood checkin:', moodError);
      }
    }

    await updateState(update);
  }, [updateState, userState]);

  // Auto-detect handler mode based on odometer + exec function (gap #10)
  useEffect(() => {
    if (!userState) return;

    const { odometer, estimatedExecFunction, handlerMode, currentArousal, denialDay, ginaHome } = userState;
    let targetMode: HandlerMode = handlerMode;

    // Caretaker mode: depleted exec function or survival odometer
    if (estimatedExecFunction === 'depleted' || odometer === 'survival') {
      targetMode = 'caretaker';
    }
    // Handler mode: high arousal + vulnerability conditions
    else if (currentArousal >= 4 && denialDay >= 5 && !ginaHome) {
      targetMode = 'handler';
    }
    // Architect mode: high function + momentum (strategic growth)
    else if (estimatedExecFunction === 'high' && (odometer === 'momentum' || odometer === 'breakthrough')) {
      targetMode = 'architect';
    }
    // Director mode: default for normal operation
    else if (estimatedExecFunction === 'medium' || estimatedExecFunction === 'high') {
      targetMode = 'director';
    }
    // Low but not depleted: invisible (minimal presence)
    else if (estimatedExecFunction === 'low') {
      targetMode = 'invisible';
    }

    if (targetMode !== handlerMode) {
      updateState({ handlerMode: targetMode });
    }

    // Corruption crisis suspension on odometer change
    if (prevOdometerRef.current !== null && prevOdometerRef.current !== odometer) {
      handleOdometerChange(userState.userId, odometer, prevOdometerRef.current)
        .catch(err => console.error('[Corruption] Odometer change handler failed:', err));
    }
    prevOdometerRef.current = odometer;
  }, [userState?.odometer, userState?.estimatedExecFunction, userState?.currentArousal, userState?.denialDay, userState?.ginaHome]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect vulnerability window (gap #15)
  useEffect(() => {
    if (!userState) return;

    const hour = new Date().getHours();
    const isNight = hour >= 22 || hour < 5;
    const highArousal = userState.currentArousal >= 3;
    const significantDenial = userState.denialDay >= 5;
    const notGinaHome = !userState.ginaHome;

    const shouldBeVulnerable = isNight && highArousal && significantDenial && notGinaHome;

    if (shouldBeVulnerable !== userState.vulnerabilityWindowActive) {
      updateState({ vulnerabilityWindowActive: shouldBeVulnerable });
    }
  }, [userState?.currentArousal, userState?.denialDay, userState?.ginaHome, timeOfDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Increment streak
  const incrementStreak = useCallback(async () => {
    if (!userState) return;

    const newStreak = userState.streakDays + 1;
    const newLongest = Math.max(newStreak, userState.longestStreak);

    await updateState({
      streakDays: newStreak,
      longestStreak: newLongest,
    });
  }, [userState, updateState]);

  // Reset streak
  const resetStreak = useCallback(async () => {
    await updateState({ streakDays: 0 });
  }, [updateState]);

  // Record task completion
  const recordTaskCompletion = useCallback(async (taskCategory: string, taskDomain: string) => {
    if (!userState) return;

    await updateState({
      tasksCompletedToday: userState.tasksCompletedToday + 1,
      lastTaskCategory: taskCategory,
      lastTaskDomain: taskDomain,
      completedToday: [...userState.completedToday, `${taskCategory}:${taskDomain}`],
    });
  }, [userState, updateState]);

  // Increment arousal
  const incrementArousal = useCallback(async () => {
    if (!userState) return;
    const newArousal = Math.min(5, userState.currentArousal + 1);
    await updateState({ currentArousal: newArousal });
  }, [userState, updateState]);

  // Decrement arousal
  const decrementArousal = useCallback(async () => {
    if (!userState) return;
    const newArousal = Math.max(0, userState.currentArousal - 1);
    await updateState({ currentArousal: newArousal });
  }, [userState, updateState]);

  // Set in session
  const setInSession = useCallback(async (inSession: boolean, sessionType?: string) => {
    await updateState({
      inSession,
      sessionType: inSession ? (sessionType || null) : null,
    });
  }, [updateState]);

  // Set Gina home
  const setGinaHome = useCallback(async (home: boolean) => {
    await updateState({ ginaHome: home });
  }, [updateState]);

  return {
    userState,
    isLoading,
    error,
    timeOfDay,
    refreshState,
    updateState,
    quickUpdate,
    incrementStreak,
    resetStreak,
    recordTaskCompletion,
    incrementArousal,
    decrementArousal,
    setInSession,
    setGinaHome,
  };
}
