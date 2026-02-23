/**
 * Exercise Hook
 *
 * Wraps exercise lib functions with React state management.
 * Session state is local (no DB writes during workout).
 * Domain progression tracks level advancement across sessions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserState } from './useUserState';
import {
  getOrCreateStreak,
  getLatestMeasurement,
  getMeasurementHistory,
  getLastTemplateUsed,
  selectTemplate,
  startSession,
  completeSession,
  abandonSession,
  getOrCreateDomainConfig,
  checkDomainAdvancement,
} from '../lib/exercise';
import { emitBodyEvent } from '../lib/body-events';
import { getTemplateById, getTemplatesForLevel } from '../data/workout-templates';
import {
  DOMAIN_LEVEL_NAMES,
  DOMAIN_LEVEL_THRESHOLDS,
} from '../types/exercise';
import type {
  ExerciseStreakData,
  BodyMeasurement,
  WorkoutSessionState,
  WorkoutTemplate,
  WorkoutPhase,
  ExerciseCompleted,
  SessionCompletionResult,
  ExerciseBlock,
  ExerciseDomainConfig,
} from '../types/exercise';

export interface UseExerciseReturn {
  // Data
  streakData: ExerciseStreakData | null;
  latestMeasurement: BodyMeasurement | null;
  measurementHistory: BodyMeasurement[];
  recommendedTemplate: WorkoutTemplate | null;
  availableTemplates: WorkoutTemplate[];
  isLoading: boolean;

  // Domain progression
  domainConfig: ExerciseDomainConfig | null;
  domainLevelName: string;
  domainProgress: number; // 0-100

  // Session state
  session: WorkoutSessionState | null;
  currentExercise: ExerciseBlock | null;
  exercisesInPhase: ExerciseBlock[];
  phaseLabel: string;
  isLastExercise: boolean;
  isLastSet: boolean;

  // Session actions
  startWorkout: (templateId: string, deviceEnabled: boolean) => Promise<boolean>;
  tapRep: () => void;
  completeSet: () => void;
  skipRest: () => void;
  completeWorkout: () => Promise<SessionCompletionResult | null>;
  abandonWorkout: () => Promise<void>;
  pauseWorkout: () => void;
  resumeWorkout: () => void;

  // Refresh
  refresh: () => Promise<void>;
}

function getPhaseExercises(template: WorkoutTemplate, phase: WorkoutPhase): ExerciseBlock[] {
  switch (phase) {
    case 'warmup': return template.warmup;
    case 'main': return template.main;
    case 'cooldown': return template.cooldown;
  }
}

function getNextPhase(current: WorkoutPhase): WorkoutPhase | null {
  if (current === 'warmup') return 'main';
  if (current === 'main') return 'cooldown';
  return null;
}

export function useExercise(): UseExerciseReturn {
  const { user } = useAuth();
  const { userState } = useUserState();
  const userId = user?.id;

  const [streakData, setStreakData] = useState<ExerciseStreakData | null>(null);
  const [latestMeasurement, setLatestMeasurement] = useState<BodyMeasurement | null>(null);
  const [measurementHistory, setMeasurementHistory] = useState<BodyMeasurement[]>([]);
  const [recommendedTemplate, setRecommendedTemplate] = useState<WorkoutTemplate | null>(null);
  const [domainConfig, setDomainConfig] = useState<ExerciseDomainConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<WorkoutSessionState | null>(null);
  const completedExercises = useRef<ExerciseCompleted[]>([]);

  // Rest timer interval
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [streak, measurement, history, lastTemplate, config] = await Promise.all([
        getOrCreateStreak(userId),
        getLatestMeasurement(userId),
        getMeasurementHistory(userId, 10),
        getLastTemplateUsed(userId),
        getOrCreateDomainConfig(userId),
      ]);
      setStreakData(streak);
      setLatestMeasurement(measurement);
      setMeasurementHistory(history);
      setDomainConfig(config);

      const denialDay = userState?.denialDay || 0;
      const gymUnlocked = streak.gymGateUnlocked;
      const selected = selectTemplate(denialDay, lastTemplate, gymUnlocked, 'home', config.domainLevel);
      setRecommendedTemplate(selected);
    } catch (err) {
      console.error('[useExercise] Refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, userState?.denialDay]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Clean up rest timer on unmount
  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, []);

  // Domain progression computed values
  const domainLevel = domainConfig?.domainLevel || 1;
  const domainLevelName = DOMAIN_LEVEL_NAMES[domainLevel as keyof typeof DOMAIN_LEVEL_NAMES] || 'Activation';
  const threshold = DOMAIN_LEVEL_THRESHOLDS[domainLevel as keyof typeof DOMAIN_LEVEL_THRESHOLDS];
  const domainProgress = threshold === Infinity
    ? 100
    : Math.min(100, Math.round(((domainConfig?.tasksCompletedThisLevel || 0) / threshold) * 100));

  // Available templates filtered by domain level + gym gate
  const availableTemplates = (() => {
    const levelFiltered = getTemplatesForLevel(domainLevel);
    if (streakData?.gymGateUnlocked) {
      return levelFiltered;
    }
    return levelFiltered.filter(t => !t.gymGateRequired);
  })();

  // All templates for display (including locked ones)
  // Current exercise helpers
  const currentExercise = session
    ? getPhaseExercises(session.template, session.phase)[session.exerciseIndex] || null
    : null;

  const exercisesInPhase = session
    ? getPhaseExercises(session.template, session.phase)
    : [];

  const phaseLabel = session
    ? session.phase === 'warmup' ? 'Warmup'
      : session.phase === 'main' ? 'Main'
      : 'Cooldown'
    : '';

  const isLastExercise = session
    ? session.exerciseIndex >= exercisesInPhase.length - 1
      && getNextPhase(session.phase) === null
    : false;

  const isLastSet = session && currentExercise
    ? session.setIndex >= currentExercise.sets - 1
    : false;

  // ---- Session actions ----

  const startWorkout = useCallback(async (templateId: string, deviceEnabled: boolean): Promise<boolean> => {
    if (!userId) return false;
    const template = getTemplateById(templateId);
    if (!template) return false;

    const denialDay = userState?.denialDay || 0;
    const sessionId = await startSession(userId, templateId, deviceEnabled, denialDay);
    if (!sessionId) return false;

    completedExercises.current = [];

    // Determine starting phase (skip warmup if empty, e.g. MVW)
    let startPhase: WorkoutPhase = 'warmup';
    if (template.warmup.length === 0) {
      startPhase = 'main';
    }

    setSession({
      sessionId,
      template,
      phase: startPhase,
      exerciseIndex: 0,
      setIndex: 0,
      repsThisSet: 0,
      isResting: false,
      restTimeRemaining: 0,
      deviceEnabled,
      totalReps: 0,
      totalSets: 0,
      startedAt: Date.now(),
      isPaused: false,
    });

    return true;
  }, [userId, userState?.denialDay]);

  const tapRep = useCallback(() => {
    setSession(prev => {
      if (!prev || prev.isResting || prev.isPaused) return prev;
      return { ...prev, repsThisSet: prev.repsThisSet + 1 };
    });
  }, []);

  const advanceToNextExercise = useCallback((prev: WorkoutSessionState): WorkoutSessionState | null => {
    const exercises = getPhaseExercises(prev.template, prev.phase);
    const nextExIdx = prev.exerciseIndex + 1;

    if (nextExIdx < exercises.length) {
      return {
        ...prev,
        exerciseIndex: nextExIdx,
        setIndex: 0,
        repsThisSet: 0,
        isResting: false,
        restTimeRemaining: 0,
      };
    }

    // Try next phase
    const nextPhase = getNextPhase(prev.phase);
    if (nextPhase) {
      const nextPhaseExercises = getPhaseExercises(prev.template, nextPhase);
      if (nextPhaseExercises.length > 0) {
        return {
          ...prev,
          phase: nextPhase,
          exerciseIndex: 0,
          setIndex: 0,
          repsThisSet: 0,
          isResting: false,
          restTimeRemaining: 0,
        };
      }
      if (nextPhase === 'main') {
        const cooldownExercises = getPhaseExercises(prev.template, 'cooldown');
        if (cooldownExercises.length > 0) {
          return {
            ...prev,
            phase: 'cooldown',
            exerciseIndex: 0,
            setIndex: 0,
            repsThisSet: 0,
            isResting: false,
            restTimeRemaining: 0,
          };
        }
      }
    }

    return null;
  }, []);

  const startRestTimer = useCallback((seconds: number) => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);

    restTimerRef.current = setInterval(() => {
      setSession(prev => {
        if (!prev || !prev.isResting) {
          if (restTimerRef.current) clearInterval(restTimerRef.current);
          return prev;
        }
        const remaining = prev.restTimeRemaining - 1;
        if (remaining <= 0) {
          if (restTimerRef.current) clearInterval(restTimerRef.current);
          return { ...prev, isResting: false, restTimeRemaining: 0 };
        }
        return { ...prev, restTimeRemaining: remaining };
      });
    }, 1000);

    setSession(prev => {
      if (!prev) return prev;
      return { ...prev, isResting: true, restTimeRemaining: seconds };
    });
  }, []);

  const completeSet = useCallback(() => {
    setSession(prev => {
      if (!prev || prev.isResting || prev.isPaused) return prev;

      const exercise = getPhaseExercises(prev.template, prev.phase)[prev.exerciseIndex];
      if (!exercise) return prev;

      const repsRecorded = exercise.durationSeconds ? exercise.reps : prev.repsThisSet;
      const newTotalReps = prev.totalReps + repsRecorded;
      const newTotalSets = prev.totalSets + 1;
      const nextSetIdx = prev.setIndex + 1;

      if (nextSetIdx < exercise.sets) {
        const updated = {
          ...prev,
          setIndex: nextSetIdx,
          repsThisSet: 0,
          totalReps: newTotalReps,
          totalSets: newTotalSets,
        };

        if (exercise.restSeconds > 0) {
          setTimeout(() => startRestTimer(exercise.restSeconds), 0);
        }

        return updated;
      }

      completedExercises.current.push({
        name: exercise.name,
        sets: exercise.sets,
        reps: newTotalReps - (prev.totalReps - repsRecorded * (exercise.sets - 1)),
      });

      const next = advanceToNextExercise({
        ...prev,
        totalReps: newTotalReps,
        totalSets: newTotalSets,
      });

      if (next === null) {
        return {
          ...prev,
          totalReps: newTotalReps,
          totalSets: newTotalSets,
          phase: 'cooldown' as const,
          exerciseIndex: 999,
          isResting: false,
        };
      }

      const nextExercise = getPhaseExercises(next.template, next.phase)[next.exerciseIndex];
      if (nextExercise && exercise.restSeconds > 0 && nextExercise !== exercise) {
        setTimeout(() => startRestTimer(exercise.restSeconds), 0);
        return { ...next, totalReps: newTotalReps, totalSets: newTotalSets };
      }

      return { ...next, totalReps: newTotalReps, totalSets: newTotalSets };
    });
  }, [advanceToNextExercise, startRestTimer]);

  const skipRest = useCallback(() => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setSession(prev => {
      if (!prev) return prev;
      return { ...prev, isResting: false, restTimeRemaining: 0 };
    });
  }, []);

  const completeWorkout = useCallback(async (): Promise<SessionCompletionResult | null> => {
    if (!userId || !session) return null;

    const durationMin = Math.round((Date.now() - session.startedAt) / 60000);
    const result = await completeSession(
      userId,
      session.sessionId,
      completedExercises.current,
      durationMin,
      session.template.id,
      streakData?.currentStreakWeeks || 0,
    );

    // Advance domain progression
    if (domainConfig) {
      const updated = await checkDomainAdvancement(userId, domainConfig);
      setDomainConfig(updated);
    }

    // Emit workout_completed event
    if (result) {
      emitBodyEvent(userId, {
        type: 'workout_completed',
        templateId: session.template.id,
        durationMin: durationMin,
        sessionType: session.template.location === 'gym' ? 'gym' : session.template.id === 'mvw' ? 'mvw' : 'full',
      });

      // Emit streak milestone if applicable
      if (result.newStreakWeeks > 0 && result.newStreakWeeks !== streakData?.currentStreakWeeks) {
        emitBodyEvent(userId, { type: 'streak_milestone', weeks: result.newStreakWeeks });
      }
    }

    setSession(null);
    completedExercises.current = [];
    if (restTimerRef.current) clearInterval(restTimerRef.current);

    // Refresh streak data
    await refresh();

    return result;
  }, [userId, session, streakData?.currentStreakWeeks, domainConfig, refresh]);

  const abandonWorkout = useCallback(async () => {
    if (!session) return;
    await abandonSession(session.sessionId);
    setSession(null);
    completedExercises.current = [];
    if (restTimerRef.current) clearInterval(restTimerRef.current);
  }, [session]);

  const pauseWorkout = useCallback(() => {
    setSession(prev => prev ? { ...prev, isPaused: true } : prev);
  }, []);

  const resumeWorkout = useCallback(() => {
    setSession(prev => prev ? { ...prev, isPaused: false } : prev);
  }, []);

  // Detect workout-done sentinel
  const isWorkoutDone = session?.exerciseIndex === 999;

  return {
    streakData,
    latestMeasurement,
    measurementHistory,
    recommendedTemplate,
    availableTemplates,
    isLoading,
    domainConfig,
    domainLevelName,
    domainProgress,
    session: isWorkoutDone ? null : session,
    currentExercise: isWorkoutDone ? null : currentExercise,
    exercisesInPhase,
    phaseLabel,
    isLastExercise,
    isLastSet,
    startWorkout,
    tapRep,
    completeSet,
    skipRest,
    completeWorkout,
    abandonWorkout,
    pauseWorkout,
    resumeWorkout,
    refresh,
  };
}
