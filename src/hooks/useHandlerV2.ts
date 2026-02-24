/**
 * useHandlerV2 Hook
 * React hook for the v2 Handler Intelligence system
 * Implements v2 Part 2: The Handler with 3-layer degradation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Handler,
  getHandler,
  type UserState,
  type HandlerMode,
  type HandlerIntervention,
  type MorningBriefing,
  type EveningDebrief,
  type SessionGuidance,
  type FailureMode,
} from '../lib/handler-v2';
import { useUserState } from './useUserState';
import { getCurrentTimeOfDay } from '../lib/rules-engine-v2';
import type { Task } from '../types/task-bank';

export interface UseHandlerV2Return {
  // State
  handler: Handler | null;
  isLoading: boolean;
  error: string | null;

  // Mode
  currentMode: HandlerMode;
  escalationLevel: 1 | 2 | 3 | 4 | 5;
  vulnerabilityWindowOpen: boolean;

  // Budget
  budgetStatus: {
    dailyLimitCents: number;
    usedTodayCents: number;
    remainingCents: number;
    aiAvailable: boolean;
  };

  // Failure modes
  activeFailureMode: FailureMode | null;

  // Actions
  getMorningBriefing: () => Promise<MorningBriefing | null>;
  getEveningDebrief: () => Promise<EveningDebrief | null>;
  getSessionGuidance: (phase: 'opening' | 'midpoint' | 'peak' | 'closing') => Promise<SessionGuidance | null>;
  enhanceTask: (task: Task) => Promise<{
    instruction: string;
    subtext: string;
    affirmation: string;
    layer: 1 | 2 | 3;
  }>;
  checkForIntervention: () => Promise<HandlerIntervention | null>;
  extractCommitment: () => Promise<string | null>;
  detectFailureModes: (journalText?: string) => { detected: boolean; failureMode?: FailureMode; severity: string };

  // Refresh
  refresh: () => Promise<void>;
}

export function useHandlerV2(): UseHandlerV2Return {
  const [handler, setHandler] = useState<Handler | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentMode, setCurrentMode] = useState<HandlerMode>('director');
  const [escalationLevel, setEscalationLevel] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [vulnerabilityWindowOpen, setVulnerabilityWindowOpen] = useState(false);
  const [activeFailureMode, setActiveFailureMode] = useState<FailureMode | null>(null);
  const [budgetStatus, setBudgetStatus] = useState({
    dailyLimitCents: 50,
    usedTodayCents: 0,
    remainingCents: 50,
    aiAvailable: false,
  });

  const { userState } = useUserState();
  const handlerRef = useRef<Handler | null>(null);

  // Initialize handler
  useEffect(() => {
    let mounted = true;

    async function initHandler() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;

        const h = await getHandler(user.id);
        handlerRef.current = h;

        if (mounted) {
          setHandler(h);
          setError(null);
        }
      } catch (err) {
        console.error('Error initializing handler:', err);
        if (mounted) {
          setError('Failed to initialize Handler');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initHandler();

    return () => {
      mounted = false;
    };
  }, []);

  // Update handler state when userState changes
  useEffect(() => {
    if (!handler || !userState) return;

    // Extract domains and categories from completedToday array
    const completedTodayDomains: string[] = [];
    const completedTodayCategories: string[] = [];
    if (userState.completedToday) {
      for (const item of userState.completedToday) {
        const [category, domain] = item.split(':');
        if (category && !completedTodayCategories.includes(category)) {
          completedTodayCategories.push(category);
        }
        if (domain && !completedTodayDomains.includes(domain)) {
          completedTodayDomains.push(domain);
        }
      }
    }

    // Convert userState to Handler's UserState format
    const handlerState: UserState = {
      userId: userState.userId,
      odometer: (userState.odometer ?? 'coasting') as UserState['odometer'],
      currentPhase: userState.currentPhase ?? 0,
      timeOfDay: getCurrentTimeOfDay(),
      minutesSinceLastTask: 0, // Would need to track last task time separately
      tasksCompletedToday: userState.tasksCompletedToday ?? 0,
      pointsToday: 0, // Would need to track points separately
      streakDays: userState.streakDays ?? 0,
      longestStreak: userState.longestStreak ?? 0,
      consecutiveSurvivalDays: 0, // Would need to calculate from history
      denialDay: userState.denialDay ?? 0,
      currentArousal: (userState.currentArousal ?? 0) as 0 | 1 | 2 | 3 | 4 | 5,
      inSession: userState.inSession ?? false,
      sessionType: userState.sessionType as UserState['sessionType'],
      edgeCount: userState.edgeCount,
      lastRelease: userState.lastRelease ? new Date(userState.lastRelease) : undefined,
      ginaHome: userState.ginaHome ?? true,
      workday: isWorkday(),
      estimatedExecFunction: (userState.estimatedExecFunction ?? 'medium') as UserState['estimatedExecFunction'],
      lastTaskCategory: userState.lastTaskCategory ?? null,
      lastTaskDomain: userState.lastTaskDomain ?? null,
      completedTodayDomains,
      completedTodayCategories,
      avoidedDomains: userState.avoidedDomains ?? [],
      recentMoodScores: [], // Would need to fetch from mood_checkins
      currentMood: undefined, // Would need to fetch latest
      currentAnxiety: undefined, // Would need to fetch latest
      currentEnergy: undefined, // Would need to fetch latest
      ginaVisibilityLevel: userState.ginaVisibilityLevel ?? 0,
      handlerMode: (userState.handlerMode as HandlerMode) ?? 'director',
      escalationLevel: (userState.escalationLevel ?? 1) as 1 | 2 | 3 | 4 | 5,
      vulnerabilityWindowActive: userState.vulnerabilityWindowActive ?? false,
      resistanceDetected: userState.resistanceDetected ?? false,
      currentFailureMode: undefined, // Would need to check failure_mode_events
      workStressModeActive: false, // Would need to check user_state columns
      weekendModeActive: isWeekend(),
      recoveryProtocolActive: undefined,
    };

    handler.updateState(handlerState);

    // Update local state
    const modeResult = handler.getRecommendedMode();
    setCurrentMode(modeResult.mode);
    setEscalationLevel(handler.getEscalationLevel());
    setVulnerabilityWindowOpen(handler.isVulnerabilityWindowOpen());
    setBudgetStatus(handler.getBudgetStatus());
    setActiveFailureMode(handlerState.currentFailureMode ?? null);
  }, [handler, userState]);

  // Get morning briefing
  const getMorningBriefing = useCallback(async (): Promise<MorningBriefing | null> => {
    if (!handler) return null;
    try {
      return await handler.getMorningBriefing();
    } catch (err) {
      console.error('Error getting morning briefing:', err);
      return null;
    }
  }, [handler]);

  // Get evening debrief
  const getEveningDebrief = useCallback(async (): Promise<EveningDebrief | null> => {
    if (!handler) return null;
    try {
      return await handler.getEveningDebrief();
    } catch (err) {
      console.error('Error getting evening debrief:', err);
      return null;
    }
  }, [handler]);

  // Get session guidance
  const getSessionGuidance = useCallback(async (
    phase: 'opening' | 'midpoint' | 'peak' | 'closing'
  ): Promise<SessionGuidance | null> => {
    if (!handler) return null;
    try {
      return await handler.getSessionGuidance(phase);
    } catch (err) {
      console.error('Error getting session guidance:', err);
      return null;
    }
  }, [handler]);

  // Enhance task copy
  const enhanceTask = useCallback(async (task: Task) => {
    if (!handler) {
      return {
        instruction: task.instruction,
        subtext: task.subtext || '',
        affirmation: task.reward.affirmation,
        layer: 1 as const,
      };
    }
    try {
      return await handler.enhanceTask(task);
    } catch (err) {
      console.error('Error enhancing task:', err);
      return {
        instruction: task.instruction,
        subtext: task.subtext || '',
        affirmation: task.reward.affirmation,
        layer: 1 as const,
      };
    }
  }, [handler]);

  // Check for intervention
  const checkForIntervention = useCallback(async (): Promise<HandlerIntervention | null> => {
    if (!handler) return null;
    try {
      const intervention = await handler.checkInterventions();
      if (intervention) {
        // Update mode based on intervention
        setCurrentMode(intervention.mode);
      }
      return intervention;
    } catch (err) {
      console.error('Error checking for intervention:', err);
      return null;
    }
  }, [handler]);

  // Extract commitment
  const extractCommitment = useCallback(async (): Promise<string | null> => {
    if (!handler) return null;
    try {
      return await handler.extractCommitment();
    } catch (err) {
      console.error('Error extracting commitment:', err);
      return null;
    }
  }, [handler]);

  // Detect failure modes
  const detectFailureModes = useCallback((journalText?: string) => {
    if (!handler) {
      return { detected: false, severity: 'none' };
    }
    return handler.detectFailureModes(journalText);
  }, [handler]);

  // Refresh handler state
  const refresh = useCallback(async () => {
    if (!handler) return;

    const budget = handler.getBudgetStatus();
    setBudgetStatus(budget);

    const modeResult = handler.getRecommendedMode();
    setCurrentMode(modeResult.mode);
    setEscalationLevel(handler.getEscalationLevel());
    setVulnerabilityWindowOpen(handler.isVulnerabilityWindowOpen());
  }, [handler]);

  return {
    handler,
    isLoading,
    error,
    currentMode,
    escalationLevel,
    vulnerabilityWindowOpen,
    budgetStatus,
    activeFailureMode,
    getMorningBriefing,
    getEveningDebrief,
    getSessionGuidance,
    enhanceTask,
    checkForIntervention,
    extractCommitment,
    detectFailureModes,
    refresh,
  };
}

// Helper functions
function isWorkday(): boolean {
  const day = new Date().getDay();
  return day >= 1 && day <= 5;
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}
