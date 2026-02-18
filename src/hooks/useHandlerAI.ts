/**
 * useHandlerAI Hook
 *
 * React hook for integrating with the AI-powered Handler.
 * Provides methods for AI-driven interventions, daily planning,
 * commitment extraction, and pattern analysis.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  generateDailyPlan,
  shouldInterveneNow,
  generateCommitmentPrompt,
  analyzePatterns,
  recordInterventionResponse,
  handleSessionEvent,
  recordCommitmentAccepted,
  type HandlerContext,
  type DailyPlanRequest,
  type InterventionDecision,
  type CommitmentPromptRequest,
  type PatternAnalysis,
} from '../lib/handler-ai';
import type { HandlerDailyPlan, HandlerIntervention } from '../types/handler';
import type { ArousalState } from '../types/arousal';

interface UseHandlerAIReturn {
  // State
  isProcessing: boolean;
  lastDecision: InterventionDecision | null;
  lastPlan: HandlerDailyPlan | null;
  error: string | null;

  // AI-Powered Actions
  generateTodaysPlan: (options?: {
    denialDay?: number;
    lastStateScore?: number;
    currentStreak?: number;
    notificationBudget?: { min: number; max: number };
  }) => Promise<HandlerDailyPlan | null>;

  checkForIntervention: (context: {
    arousalState: ArousalState;
    denialDays: number;
    isLocked: boolean;
    currentEdgeCount?: number;
    sessionType?: 'edge' | 'goon' | 'hypno' | 'tease';
    currentActivity?: string;
  }) => Promise<InterventionDecision>;

  getCommitmentPrompt: (options: {
    sessionId: string;
    arousalLevel: number;
    edgeCount: number;
    denialDay: number;
    targetDomain?: string;
  }) => Promise<{ prompt: string; domain: string; escalationLevel: number } | null>;

  acceptCommitment: (
    commitmentText: string,
    domain: string,
    arousalLevel: number
  ) => Promise<void>;

  runPatternAnalysis: () => Promise<PatternAnalysis | null>;

  recordResponse: (
    attemptId: string,
    response: 'completed' | 'dismissed' | 'ignored' | 'resisted',
    responseTimeSeconds?: number,
    feedback?: string
  ) => Promise<void>;

  handleSession: (
    sessionId: string,
    event: 'session_start' | 'edge' | 'commitment_window' | 'session_end' | 'emergency_stop',
    data: Record<string, unknown>
  ) => Promise<HandlerIntervention | null>;

  // Utility
  clearError: () => void;
}

export function useHandlerAI(): UseHandlerAIReturn {
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDecision, setLastDecision] = useState<InterventionDecision | null>(null);
  const [lastPlan, setLastPlan] = useState<HandlerDailyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track last intervention time to prevent spam
  const lastInterventionTime = useRef<number>(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Generate today's intervention plan
  const generateTodaysPlan = useCallback(async (options?: {
    denialDay?: number;
    lastStateScore?: number;
    currentStreak?: number;
    notificationBudget?: { min: number; max: number };
  }): Promise<HandlerDailyPlan | null> => {
    if (!user) {
      setError('Not authenticated');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const request: DailyPlanRequest = {
        userId: user.id,
        denialDay: options?.denialDay ?? 0,
        lastStateScore: options?.lastStateScore ?? 5,
        currentStreak: options?.currentStreak ?? 0,
        notificationBudget: options?.notificationBudget ?? { min: 3, max: 6 },
      };

      const plan = await generateDailyPlan(request);
      setLastPlan(plan);
      return plan;
    } catch (err) {
      console.error('Failed to generate daily plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate plan');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [user]);

  // Check if the handler should intervene right now
  const checkForIntervention = useCallback(async (context: {
    arousalState: ArousalState;
    denialDays: number;
    isLocked: boolean;
    currentEdgeCount?: number;
    sessionType?: 'edge' | 'goon' | 'hypno' | 'tease';
    currentActivity?: string;
  }): Promise<InterventionDecision> => {
    if (!user) {
      return {
        shouldIntervene: false,
        reasoning: 'Not authenticated',
        confidence: 0,
      };
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Calculate time since last intervention
      const now = Date.now();
      const minutesSinceLastIntervention = lastInterventionTime.current > 0
        ? (now - lastInterventionTime.current) / (1000 * 60)
        : undefined;

      // Determine time of day
      const hour = new Date().getHours();
      let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
      if (hour >= 5 && hour < 12) timeOfDay = 'morning';
      else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
      else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
      else timeOfDay = 'night';

      const fullContext: HandlerContext = {
        userId: user.id,
        arousalState: context.arousalState,
        denialDays: context.denialDays,
        isLocked: context.isLocked,
        currentEdgeCount: context.currentEdgeCount,
        sessionType: context.sessionType,
        timeOfDay,
        dayOfWeek: new Date().getDay(),
        lastInterventionMinutesAgo: minutesSinceLastIntervention,
        currentActivity: context.currentActivity,
      };

      const decision = await shouldInterveneNow(fullContext);

      if (decision.shouldIntervene) {
        lastInterventionTime.current = now;
      }

      setLastDecision(decision);
      return decision;
    } catch (err) {
      console.error('Failed to check for intervention:', err);
      setError(err instanceof Error ? err.message : 'Failed to check intervention');
      return {
        shouldIntervene: false,
        reasoning: 'Error occurred',
        confidence: 0,
      };
    } finally {
      setIsProcessing(false);
    }
  }, [user]);

  // Get a commitment prompt during an arousal session
  const getCommitmentPrompt = useCallback(async (options: {
    sessionId: string;
    arousalLevel: number;
    edgeCount: number;
    denialDay: number;
    targetDomain?: string;
  }): Promise<{ prompt: string; domain: string; escalationLevel: number } | null> => {
    if (!user) {
      setError('Not authenticated');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const request: CommitmentPromptRequest = {
        userId: user.id,
        sessionId: options.sessionId,
        arousalLevel: options.arousalLevel,
        edgeCount: options.edgeCount,
        denialDay: options.denialDay,
        targetDomain: options.targetDomain,
      };

      const result = await generateCommitmentPrompt(request);
      return result;
    } catch (err) {
      console.error('Failed to generate commitment prompt:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate prompt');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [user]);

  // Run pattern analysis to update the user model
  const runPatternAnalysis = useCallback(async (): Promise<PatternAnalysis | null> => {
    if (!user) {
      setError('Not authenticated');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const analysis = await analyzePatterns(user.id);
      return analysis;
    } catch (err) {
      console.error('Failed to run pattern analysis:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze patterns');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [user]);

  // Record user's response to an intervention
  const recordResponse = useCallback(async (
    attemptId: string,
    response: 'completed' | 'dismissed' | 'ignored' | 'resisted',
    responseTimeSeconds?: number,
    feedback?: string
  ): Promise<void> => {
    if (!user) {
      setError('Not authenticated');
      return;
    }

    try {
      await recordInterventionResponse(
        user.id,
        attemptId,
        response,
        responseTimeSeconds,
        feedback
      );
    } catch (err) {
      console.error('Failed to record response:', err);
      setError(err instanceof Error ? err.message : 'Failed to record response');
    }
  }, [user]);

  // Handle session events for real-time AI decisions
  const handleSession = useCallback(async (
    sessionId: string,
    event: 'session_start' | 'edge' | 'commitment_window' | 'session_end' | 'emergency_stop',
    data: Record<string, unknown>
  ): Promise<HandlerIntervention | null> => {
    if (!user) {
      setError('Not authenticated');
      return null;
    }

    try {
      const intervention = await handleSessionEvent(user.id, sessionId, event, data);
      return intervention;
    } catch (err) {
      console.error('Failed to handle session event:', err);
      setError(err instanceof Error ? err.message : 'Failed to handle session event');
      return null;
    }
  }, [user]);

  // Record that user accepted a commitment - pushes escalation
  const acceptCommitment = useCallback(async (
    commitmentText: string,
    domain: string,
    arousalLevel: number
  ): Promise<void> => {
    if (!user) {
      setError('Not authenticated');
      return;
    }

    try {
      await recordCommitmentAccepted(user.id, commitmentText, domain, arousalLevel);
    } catch (err) {
      console.error('Failed to record commitment acceptance:', err);
      setError(err instanceof Error ? err.message : 'Failed to record commitment');
    }
  }, [user]);

  return {
    isProcessing,
    lastDecision,
    lastPlan,
    error,
    generateTodaysPlan,
    checkForIntervention,
    getCommitmentPrompt,
    acceptCommitment,
    runPatternAnalysis,
    recordResponse,
    handleSession,
    clearError,
  };
}

/**
 * Hook for automatic intervention checking
 * Runs periodic checks and calls onIntervention when one is triggered
 */
export function useAutoIntervention(
  enabled: boolean,
  context: {
    arousalState: ArousalState;
    denialDays: number;
    isLocked: boolean;
  },
  onIntervention: (intervention: HandlerIntervention) => void,
  checkIntervalMs: number = 5 * 60 * 1000 // 5 minutes default
) {
  const { checkForIntervention } = useHandlerAI();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startChecking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const check = async () => {
      if (!enabled) return;

      const decision = await checkForIntervention(context);
      if (decision.shouldIntervene && decision.intervention) {
        onIntervention(decision.intervention);
      }
    };

    // Initial check
    check();

    // Set up interval
    intervalRef.current = setInterval(check, checkIntervalMs);
  }, [enabled, context, checkForIntervention, onIntervention, checkIntervalMs]);

  const stopChecking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { startChecking, stopChecking };
}
