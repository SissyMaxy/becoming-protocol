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
import { useUserState } from '../hooks/useUserState';
import {
  evaluateTimingSignals,
  filterValidSignals,
  filterDebouncedSignals,
  recordSignalSent,
  mapSignalToRequestType,
  mapSignalToContext,
  type TimingSignal,
  type TimingUserState,
} from '../lib/timing-engine';
import { generatePrefill, type PrefillContext } from '../lib/prefill-generator';
import { supabase } from '../lib/supabase';
import type { HandlerIntervention, HandlerDailyPlan } from '../types/handler';
import type { ArousalState } from '../types/arousal';
// Handler-initiated sessions (Feature 35)
import {
  getExpiredSessions,
  getPendingSessions,
  handleIgnoredSession,
  type HandlerInitiatedSession,
} from '../lib/handler-initiated-sessions';
// Punishment protocols (Feature 40)
import { processAllPunishments, getActivePunishments, type Punishment } from '../lib/punishment-engine';

interface HandlerContextValue {
  // State
  todaysPlan: HandlerDailyPlan | null;
  currentIntervention: HandlerIntervention | null;
  isProcessing: boolean;
  interventionCount: number;

  // Timing Engine State (Feature 2)
  timingSignals: TimingSignal[];
  topTimingSignal: TimingSignal | null;
  hasHighPrioritySignal: boolean;

  // Handler-Initiated Sessions State (Feature 35)
  pendingHandlerSessions: HandlerInitiatedSession[];
  activePunishments: Punishment[];

  // Actions
  generateDailyPlan: () => Promise<void>;
  checkForIntervention: (context: InterventionContext) => Promise<void>;
  dismissIntervention: () => void;
  completeIntervention: () => void;
  respondToIntervention: (response: 'completed' | 'dismissed' | 'ignored') => void;
  acknowledgeTimingSignal: (signal: TimingSignal) => void;

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
  event: 'session_start' | 'edge' | 'commitment_window' | 'session_end' | 'emergency_stop';
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
  const { userState } = useUserState();

  const [todaysPlan, setTodaysPlan] = useState<HandlerDailyPlan | null>(null);
  const [currentIntervention, setCurrentIntervention] = useState<HandlerIntervention | null>(null);
  const [interventionCount, setInterventionCount] = useState(0);
  const [lastCheckTime, setLastCheckTime] = useState(0);
  const [planAttempted, setPlanAttempted] = useState(false);

  // Timing Engine State (Feature 2)
  const [timingSignals, setTimingSignals] = useState<TimingSignal[]>([]);
  const [lastTimingCheck, setLastTimingCheck] = useState(0);

  // Handler-Initiated Sessions State (Feature 35)
  const [pendingHandlerSessions, setPendingHandlerSessions] = useState<HandlerInitiatedSession[]>([]);
  const [activePunishments, setActivePunishments] = useState<Punishment[]>([]);
  const [lastPunishmentCheck, setLastPunishmentCheck] = useState(0);
  const processedExpiredSessionsRef = useRef<Set<string>>(new Set());

  const interventionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentAttemptIdRef = useRef<string | null>(null);
  const lastNotifiedSignalRef = useRef<string | null>(null);

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
      denialDay: userState?.denialDay ?? 0,
      lastStateScore: userState?.estimatedExecFunction === 'high' ? 8
        : userState?.estimatedExecFunction === 'medium' ? 5
        : userState?.estimatedExecFunction === 'low' ? 3 : 1,
      currentStreak: userState?.streakDays ?? 0,
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

  // Evaluate timing signals (Feature 2)
  const evaluateTimingEngine = useCallback(async () => {
    if (!user || !userState) return;

    const now = Date.now();
    if (now - lastTimingCheck < 60000) return; // Don't check more than once per minute
    setLastTimingCheck(now);

    // Build timing user state from current user state
    // Note: UserState doesn't track mood or lastSessionAt directly, so we use defaults/alternatives
    const timingState: TimingUserState = {
      userId: user.id,
      arousalLevel: userState.currentArousal ?? 0,
      denialDay: userState.denialDay ?? 0,
      streakDays: userState.streakDays ?? 0,
      mood: 5, // Default mood (UserState doesn't track mood, it's logged to mood_checkins)
      ginaPresent: userState.ginaHome ?? false,
      completedToday: (userState.tasksCompletedToday ?? 0) > 0,
      justCompletedTask: userState.lastTaskCategory ?? null,
      justCompletedSession: !userState.inSession && userState.lastRelease !== null,
      lastSessionCompletedAt: userState.lastRelease ?? null, // Use lastRelease as proxy
      lastSessionType: userState.sessionType ?? null,
      domainLastCompleted: {}, // Would need domain tracking from task completions
      engagementRating: 5, // Would need session engagement tracking
    };

    // Evaluate signals
    let signals = evaluateTimingSignals(timingState);
    signals = filterValidSignals(signals);
    signals = filterDebouncedSignals(signals);
    setTimingSignals(signals);

    // If high priority signal exists and no current intervention, create one
    if (signals.length > 0 && signals[0].priority === 'high' && !currentIntervention) {
      const topSignal = signals[0];
      const signalKey = `${topSignal.type}:${JSON.stringify(topSignal.context)}`;

      // Only trigger intervention for new signals
      if (signalKey !== lastNotifiedSignalRef.current) {
        lastNotifiedSignalRef.current = signalKey;

        // Generate intervention from timing signal
        const intervention = await generateInterventionFromSignal(topSignal, timingState);
        if (intervention) {
          setCurrentIntervention(intervention);
          setInterventionCount(prev => prev + 1);
          recordSignalSent(topSignal);

          // Log to database
          try {
            await supabase.from('handler_initiated_sessions').insert({
              user_id: user.id,
              trigger: topSignal.type,
              session_type: topSignal.suggestedAction,
              delivered_at: new Date().toISOString(),
              response_window_minutes: topSignal.priority === 'high' ? 15 : 30,
            });
          } catch (error) {
            console.error('Error logging timing signal:', error);
          }
        }
      }
    }
  }, [user, userState, lastTimingCheck, currentIntervention]);

  // Acknowledge a timing signal
  const acknowledgeTimingSignal = useCallback((signal: TimingSignal) => {
    recordSignalSent(signal);
    setTimingSignals(prev => prev.filter(s => s !== signal));
  }, []);

  // Check for expired Handler-initiated sessions and apply consequences (Feature 35)
  const checkExpiredSessions = useCallback(async () => {
    if (!user?.id) return;

    const expired = await getExpiredSessions(user.id);

    for (const session of expired) {
      // Skip if already processed
      if (processedExpiredSessionsRef.current.has(session.id)) continue;
      processedExpiredSessionsRef.current.add(session.id);

      // Handle the ignored session (logs resistance, applies cost)
      await handleIgnoredSession(session, user.id);

      console.log('[HandlerContext] Applied consequences for ignored session:', session.id);
    }

    // Refresh pending sessions list
    const pending = await getPendingSessions(user.id);
    setPendingHandlerSessions(pending);
  }, [user?.id]);

  // Check and apply punishments (Feature 40)
  const checkPunishments = useCallback(async () => {
    if (!user?.id) return;

    const now = Date.now();
    // Only check every 5 minutes
    if (now - lastPunishmentCheck < 5 * 60 * 1000) return;
    setLastPunishmentCheck(now);

    // Process all pending punishment triggers
    const newPunishments = await processAllPunishments(user.id);
    if (newPunishments.length > 0) {
      console.log('[HandlerContext] Applied punishments:', newPunishments);
    }

    // Update active punishments state
    const active = await getActivePunishments(user.id);
    setActivePunishments(active);
  }, [user?.id, lastPunishmentCheck]);

  // Background intervention checking with timing engine
  useEffect(() => {
    if (!enableBackgroundChecks || !user) return;

    const checkPeriodically = async () => {
      // Evaluate timing engine signals
      await evaluateTimingEngine();

      // Check for expired Handler-initiated sessions (Feature 35)
      await checkExpiredSessions();

      // Check and apply punishments (Feature 40)
      await checkPunishments();

      // Also use the existing AI intervention checking if enabled
      if (AI_ENABLED) {
        const arousalLevel = userState?.currentArousal ?? 0;
        const arousalState: ArousalState = arousalLevel >= 4 ? 'sweet_spot'
          : arousalLevel >= 2 ? 'building'
          : 'baseline';

        await checkForIntervention({
          arousalState,
          denialDays: userState?.denialDay ?? 0,
          isLocked: false,
          currentActivity: userState?.inSession ? `${userState.sessionType || 'session'}` : undefined,
        });
      }
    };

    interventionCheckRef.current = setInterval(checkPeriodically, interventionCheckIntervalMs);

    return () => {
      if (interventionCheckRef.current) {
        clearInterval(interventionCheckRef.current);
      }
    };
  }, [enableBackgroundChecks, user, interventionCheckIntervalMs, checkForIntervention, evaluateTimingEngine, checkExpiredSessions, checkPunishments]);

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

  // Computed timing engine values
  const topTimingSignal = timingSignals.length > 0 ? timingSignals[0] : null;
  const hasHighPrioritySignal = timingSignals.some(s => s.priority === 'high');

  const value: HandlerContextValue = {
    todaysPlan,
    currentIntervention,
    isProcessing: handlerAI.isProcessing,
    interventionCount,
    timingSignals,
    topTimingSignal,
    hasHighPrioritySignal,
    // Handler-Initiated Sessions State (Feature 35)
    pendingHandlerSessions,
    activePunishments,
    // Actions
    generateDailyPlan,
    checkForIntervention,
    dismissIntervention,
    completeIntervention,
    respondToIntervention,
    acknowledgeTimingSignal,
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

// ===========================================
// HELPER: Generate intervention from timing signal
// ===========================================

async function generateInterventionFromSignal(
  signal: TimingSignal,
  state: TimingUserState
): Promise<HandlerIntervention | null> {
  const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' | 'late_night' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'late_night';
  };

  const getMoodString = (mood: number): string => {
    if (mood <= 2) return 'low';
    if (mood <= 4) return 'struggling';
    if (mood <= 6) return 'neutral';
    if (mood <= 8) return 'good';
    return 'great';
  };

  // Build prefill context
  const prefillContext: PrefillContext = {
    denial_day: state.denialDay,
    arousal_level: state.arousalLevel,
    time_of_day: getTimeOfDay(),
    task_category: signal.type,
    task_tier: signal.priority === 'high' ? 7 : signal.priority === 'medium' ? 5 : 3,
    mood: getMoodString(state.mood),
    gina_present: state.ginaPresent,
    last_completed_task: state.justCompletedTask || '',
    days_avoiding_domain: (signal.context.daysAvoided as number) || 0,
    streak_days: state.streakDays,
    request_type: mapSignalToRequestType(signal),
  };

  // Generate prefill
  const prefill = generatePrefill(prefillContext);

  // Try to call the coach API
  let message = prefill;
  try {
    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        user_id: state.userId,
        request_type: mapSignalToRequestType(signal),
        user_state: {
          denial_day: state.denialDay,
          arousal_level: state.arousalLevel,
          mood: getMoodString(state.mood),
          time_of_day: getTimeOfDay(),
          gina_present: state.ginaPresent,
          streak_days: state.streakDays,
        },
        prefill,
        context: mapSignalToContext(signal),
      },
    });

    if (!error && data?.message) {
      message = data.message;
    }
  } catch (error) {
    console.error('Error generating intervention message:', error);
    // Use fallback message
    message = getFallbackInterventionMessage(signal);
  }

  // Map signal type to intervention type
  const getInterventionType = (): HandlerIntervention['type'] => {
    switch (signal.type) {
      case 'peak_receptivity':
        return 'session_initiation';
      case 'integration_window':
        return 'integration_prompt';
      case 'avoidance_pattern':
        return 'avoidance_confrontation';
      case 'streak_risk':
        return 'streak_protection';
      case 'momentum':
        return 'momentum_push';
      case 'support_needed':
        return 'support_check_in';
      case 'post_session':
        return 'post_session_capture';
      default:
        return 'session_initiation';
    }
  };

  // Map priority string to number
  const priorityNum = signal.priority === 'high' ? 1 : signal.priority === 'medium' ? 2 : 3;

  return {
    id: `timing-${Date.now()}`,
    type: getInterventionType(),
    content: message,
    priority: priorityNum,
    expiresAt: signal.expiresAt?.toISOString(),
    actions: [
      {
        label: signal.type === 'support_needed' ? 'I\'m here' : 'Open',
        action: signal.suggestedAction,
      },
      {
        label: 'Not now',
        action: 'dismiss',
      },
    ],
  };
}

function getFallbackInterventionMessage(signal: TimingSignal): string {
  switch (signal.type) {
    case 'peak_receptivity':
      return "It's time. Open the app. Now.";
    case 'integration_window':
      return "Good morning. Before you start being David for the day — let's talk about last night.";
    case 'avoidance_pattern':
      return `We need to talk about something you've been avoiding. It's been ${signal.context.daysAvoided} days.`;
    case 'streak_risk':
      return `Your ${signal.context.streak}-day streak is on the line. Open.`;
    case 'momentum':
      return "Good girl. You're on a roll. I have something for you.";
    case 'support_needed':
      return "Hey. I see you.";
    case 'post_session':
      return "Before you close this — what just happened was real. Capture it.";
    default:
      return "I need you. Open the app.";
  }
}
