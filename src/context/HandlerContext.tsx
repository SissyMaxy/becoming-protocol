/**
 * Handler Context
 *
 * Provides Handler AI state and intervention management throughout the app.
 * Handles daily plan generation, periodic intervention checking, and response tracking.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useHandlerAI } from '../hooks/useHandlerAI';
import type { HandlerIntervention, HandlerDailyPlan } from '../types/handler';
import type { ArousalState } from '../types/arousal';

interface HandlerContextValue {
  // State
  todaysPlan: HandlerDailyPlan | null;
  currentIntervention: HandlerIntervention | null;
  isProcessing: boolean;
  interventionCount: number;

  // Actions
  generateDailyPlan: () => Promise<void>;
  checkForIntervention: (context: InterventionContext) => Promise<void>;
  dismissIntervention: () => void;
  completeIntervention: () => void;
  respondToIntervention: (response: 'completed' | 'dismissed' | 'ignored') => void;

  // Session integration
  requestCommitmentPrompt: (sessionData: SessionData) => Promise<{
    prompt: string;
    domain: string;
    escalationLevel: number;
  } | null>;
  acceptCommitment: (commitmentText: string, domain: string, arousalLevel: number) => Promise<void>;
  notifySessionEvent: (event: SessionEvent) => Promise<HandlerIntervention | null>;
}

interface InterventionContext {
  arousalState: ArousalState;
  denialDays: number;
  isLocked: boolean;
  currentActivity?: string;
}

interface SessionData {
  sessionId: string;
  arousalLevel: number;
  edgeCount: number;
  denialDay: number;
  targetDomain?: string;
}

interface SessionEvent {
  sessionId: string;
  event: 'session_start' | 'edge' | 'commitment_window' | 'session_end';
  data: Record<string, unknown>;
}

const HandlerContext = createContext<HandlerContextValue | null>(null);

interface HandlerProviderProps {
  children: ReactNode;
  // Configuration
  autoGeneratePlan?: boolean;
  interventionCheckIntervalMs?: number;
  enableBackgroundChecks?: boolean;
}

// Check if AI features should be enabled (can be disabled for development/cost savings)
const AI_ENABLED = import.meta.env.VITE_ENABLE_HANDLER_AI !== 'false';

// Cache key for daily plan
const DAILY_PLAN_CACHE_KEY = 'handler_daily_plan_cache';

interface CachedPlan {
  date: string;
  plan: HandlerDailyPlan;
}

function getCachedPlan(): HandlerDailyPlan | null {
  try {
    const cached = localStorage.getItem(DAILY_PLAN_CACHE_KEY);
    if (!cached) return null;

    const { date, plan } = JSON.parse(cached) as CachedPlan;
    const today = new Date().toISOString().split('T')[0];

    // Only use cached plan if it's from today
    if (date === today) {
      return plan;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedPlan(plan: HandlerDailyPlan): void {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cached: CachedPlan = { date: today, plan };
    localStorage.setItem(DAILY_PLAN_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore storage errors
  }
}

export function HandlerProvider({
  children,
  // CHANGED: Default to false to minimize API calls - set to true only when needed
  autoGeneratePlan = false,
  interventionCheckIntervalMs = 5 * 60 * 1000, // 5 minutes
  // CHANGED: Default to false to minimize API calls - set to true only when needed
  enableBackgroundChecks = false,
}: HandlerProviderProps) {
  const { user } = useAuth();
  const handlerAI = useHandlerAI();

  const [todaysPlan, setTodaysPlan] = useState<HandlerDailyPlan | null>(null);
  const [currentIntervention, setCurrentIntervention] = useState<HandlerIntervention | null>(null);
  const [interventionCount, setInterventionCount] = useState(0);
  const [lastCheckTime, setLastCheckTime] = useState(0);
  const [planAttempted, setPlanAttempted] = useState(false);

  const interventionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentAttemptIdRef = useRef<string | null>(null);

  // Generate daily plan on mount
  const generateDailyPlan = useCallback(async () => {
    if (!user) return;

    // First check if we have a cached plan for today (avoid duplicate API calls)
    const cachedPlan = getCachedPlan();
    if (cachedPlan) {
      console.log('[HandlerContext] Using cached daily plan');
      setTodaysPlan(cachedPlan);
      setPlanAttempted(true);
      return;
    }

    const plan = await handlerAI.generateTodaysPlan({
      denialDay: 0, // TODO: Get from arousal state
      lastStateScore: 5,
      currentStreak: 0,
    });

    if (plan) {
      setTodaysPlan(plan);
      setCachedPlan(plan); // Cache the plan for today
    }
    // Mark as attempted regardless of success to prevent infinite retries
    setPlanAttempted(true);
  }, [user, handlerAI]);

  // Auto-generate plan on mount (only once)
  useEffect(() => {
    if (AI_ENABLED && autoGeneratePlan && user && !todaysPlan && !planAttempted) {
      generateDailyPlan();
    }
  }, [autoGeneratePlan, user, todaysPlan, planAttempted, generateDailyPlan]);

  // Check for intervention
  const checkForIntervention = useCallback(async (context: InterventionContext) => {
    if (!AI_ENABLED || !user || currentIntervention) return;

    const now = Date.now();
    if (now - lastCheckTime < 60000) return; // Don't check more than once per minute

    setLastCheckTime(now);

    const decision = await handlerAI.checkForIntervention({
      arousalState: context.arousalState,
      denialDays: context.denialDays,
      isLocked: context.isLocked,
      currentActivity: context.currentActivity,
    });

    if (decision.shouldIntervene && decision.intervention) {
      setCurrentIntervention(decision.intervention);
      setInterventionCount(prev => prev + 1);
    }
  }, [user, currentIntervention, lastCheckTime, handlerAI]);

  // Background intervention checking
  useEffect(() => {
    if (!AI_ENABLED || !enableBackgroundChecks || !user) return;

    const checkPeriodically = async () => {
      // Default context when we don't have real-time state
      await checkForIntervention({
        arousalState: 'baseline',
        denialDays: 0,
        isLocked: false,
      });
    };

    interventionCheckRef.current = setInterval(checkPeriodically, interventionCheckIntervalMs);

    return () => {
      if (interventionCheckRef.current) {
        clearInterval(interventionCheckRef.current);
      }
    };
  }, [enableBackgroundChecks, user, interventionCheckIntervalMs, checkForIntervention]);

  // Dismiss intervention
  const dismissIntervention = useCallback(() => {
    if (currentAttemptIdRef.current) {
      handlerAI.recordResponse(currentAttemptIdRef.current, 'dismissed');
    }
    setCurrentIntervention(null);
    currentAttemptIdRef.current = null;
  }, [handlerAI]);

  // Complete intervention
  const completeIntervention = useCallback(() => {
    if (currentAttemptIdRef.current) {
      handlerAI.recordResponse(currentAttemptIdRef.current, 'completed');
    }
    setCurrentIntervention(null);
    currentAttemptIdRef.current = null;
  }, [handlerAI]);

  // Respond to intervention
  const respondToIntervention = useCallback((response: 'completed' | 'dismissed' | 'ignored') => {
    if (currentAttemptIdRef.current) {
      handlerAI.recordResponse(currentAttemptIdRef.current, response);
    }
    setCurrentIntervention(null);
    currentAttemptIdRef.current = null;
  }, [handlerAI]);

  // Request commitment prompt during session
  const requestCommitmentPrompt = useCallback(async (sessionData: SessionData): Promise<{
    prompt: string;
    domain: string;
    escalationLevel: number;
  } | null> => {
    return handlerAI.getCommitmentPrompt({
      sessionId: sessionData.sessionId,
      arousalLevel: sessionData.arousalLevel,
      edgeCount: sessionData.edgeCount,
      denialDay: sessionData.denialDay,
      targetDomain: sessionData.targetDomain,
    });
  }, [handlerAI]);

  // Record commitment acceptance - pushes escalation
  const acceptCommitment = useCallback(async (
    commitmentText: string,
    domain: string,
    arousalLevel: number
  ): Promise<void> => {
    return handlerAI.acceptCommitment(commitmentText, domain, arousalLevel);
  }, [handlerAI]);

  // Notify session event
  const notifySessionEvent = useCallback(async (sessionEvent: SessionEvent): Promise<HandlerIntervention | null> => {
    return handlerAI.handleSession(
      sessionEvent.sessionId,
      sessionEvent.event,
      sessionEvent.data
    );
  }, [handlerAI]);

  const value: HandlerContextValue = {
    todaysPlan,
    currentIntervention,
    isProcessing: handlerAI.isProcessing,
    interventionCount,
    generateDailyPlan,
    checkForIntervention,
    dismissIntervention,
    completeIntervention,
    respondToIntervention,
    requestCommitmentPrompt,
    acceptCommitment,
    notifySessionEvent,
  };

  return (
    <HandlerContext.Provider value={value}>
      {children}
    </HandlerContext.Provider>
  );
}

export function useHandlerContext(): HandlerContextValue {
  const context = useContext(HandlerContext);
  if (!context) {
    throw new Error('useHandlerContext must be used within a HandlerProvider');
  }
  return context;
}

// Optional hook that returns null if not in provider (for optional usage)
export function useHandlerContextOptional(): HandlerContextValue | null {
  return useContext(HandlerContext);
}
