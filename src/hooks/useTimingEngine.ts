// useTimingEngine Hook
// Integrates timing engine signals with Handler interventions (Feature 2)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  evaluateTimingSignals,
  filterValidSignals,
  filterDebouncedSignals,
  getTopSignal,
  hasHighPrioritySignal,
  recordSignalSent,
  mapSignalToRequestType,
  mapSignalToContext,
  type TimingSignal,
  type TimingUserState,
} from '../lib/timing-engine';
import { generatePrefill, type PrefillContext } from '../lib/prefill-generator';
import { supabase } from '../lib/supabase';

interface UseTimingEngineOptions {
  enabled?: boolean;
  checkIntervalMs?: number;           // How often to check for signals (default: 5 min)
  onHighPrioritySignal?: (signal: TimingSignal) => void;
  onInterventionNeeded?: (signal: TimingSignal, message: string) => void;
}

interface UseTimingEngineReturn {
  // State
  signals: TimingSignal[];
  topSignal: TimingSignal | null;
  hasHighPriority: boolean;
  isChecking: boolean;
  lastCheckAt: Date | null;

  // Actions
  checkNow: () => Promise<TimingSignal[]>;
  dismissSignal: (signal: TimingSignal) => void;
  acknowledgeSignal: (signal: TimingSignal) => Promise<void>;
}

export function useTimingEngine(
  userState: Partial<TimingUserState> | null,
  options: UseTimingEngineOptions = {}
): UseTimingEngineReturn {
  const { user } = useAuth();
  const {
    enabled = true,
    checkIntervalMs = 5 * 60 * 1000, // 5 minutes
    onHighPrioritySignal,
    onInterventionNeeded,
  } = options;

  const [signals, setSignals] = useState<TimingSignal[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckAt, setLastCheckAt] = useState<Date | null>(null);

  const lastNotifiedSignalRef = useRef<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Build complete user state from partial state
  const buildCompleteState = useCallback((): TimingUserState | null => {
    if (!user?.id || !userState) return null;

    return {
      userId: user.id,
      arousalLevel: userState.arousalLevel ?? 0,
      denialDay: userState.denialDay ?? 0,
      streakDays: userState.streakDays ?? 0,
      mood: userState.mood ?? 5,
      ginaPresent: userState.ginaPresent ?? false,
      completedToday: userState.completedToday ?? false,
      justCompletedTask: userState.justCompletedTask ?? null,
      justCompletedSession: userState.justCompletedSession ?? false,
      lastSessionCompletedAt: userState.lastSessionCompletedAt ?? null,
      lastSessionType: userState.lastSessionType ?? null,
      domainLastCompleted: userState.domainLastCompleted ?? {},
      engagementRating: userState.engagementRating ?? 5,
    };
  }, [user?.id, userState]);

  // Check for timing signals
  const checkNow = useCallback(async (): Promise<TimingSignal[]> => {
    const state = buildCompleteState();
    if (!state) return [];

    setIsChecking(true);
    try {
      // Evaluate all signals
      let allSignals = evaluateTimingSignals(state);

      // Filter to valid (non-expired) signals
      allSignals = filterValidSignals(allSignals);

      // Filter out debounced signals
      allSignals = filterDebouncedSignals(allSignals);

      setSignals(allSignals);
      setLastCheckAt(new Date());

      // Check for high priority signals
      if (allSignals.length > 0 && allSignals[0].priority === 'high') {
        const topSignal = allSignals[0];
        const signalKey = `${topSignal.type}:${JSON.stringify(topSignal.context)}`;

        // Only notify if this is a new signal
        if (signalKey !== lastNotifiedSignalRef.current) {
          lastNotifiedSignalRef.current = signalKey;

          // Call high priority callback
          onHighPrioritySignal?.(topSignal);

          // Generate intervention message if callback provided
          if (onInterventionNeeded) {
            const message = await generateInterventionMessage(topSignal, state);
            onInterventionNeeded(topSignal, message);
          }
        }
      }

      return allSignals;
    } finally {
      setIsChecking(false);
    }
  }, [buildCompleteState, onHighPrioritySignal, onInterventionNeeded]);

  // Set up interval checking
  useEffect(() => {
    if (!enabled) return;

    // Initial check
    checkNow();

    // Set up interval
    checkIntervalRef.current = setInterval(checkNow, checkIntervalMs);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [enabled, checkIntervalMs, checkNow]);

  // Dismiss a signal (mark as debounced)
  const dismissSignal = useCallback((signal: TimingSignal) => {
    recordSignalSent(signal);
    setSignals(prev => prev.filter(s => s !== signal));
  }, []);

  // Acknowledge a signal (record that user responded)
  const acknowledgeSignal = useCallback(async (signal: TimingSignal) => {
    recordSignalSent(signal);

    // Log to database if appropriate
    if (user?.id) {
      try {
        await supabase
          .from('handler_initiated_sessions')
          .insert({
            user_id: user.id,
            trigger: signal.type,
            session_type: signal.suggestedAction,
            delivered_at: new Date().toISOString(),
            acknowledged_at: new Date().toISOString(),
            response_window_minutes: 15,
          });
      } catch (error) {
        console.error('Error logging signal acknowledgment:', error);
      }
    }

    setSignals(prev => prev.filter(s => s !== signal));
  }, [user?.id]);

  // Computed values
  const topSignal = getTopSignal(signals);
  const hasHighPriority = hasHighPrioritySignal(signals);

  return {
    signals,
    topSignal,
    hasHighPriority,
    isChecking,
    lastCheckAt,
    checkNow,
    dismissSignal,
    acknowledgeSignal,
  };
}

// ===========================================
// HELPER: Generate intervention message
// ===========================================

async function generateInterventionMessage(
  signal: TimingSignal,
  state: TimingUserState
): Promise<string> {
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
    days_avoiding_domain: 0,
    streak_days: state.streakDays,
    request_type: mapSignalToRequestType(signal),
  };

  // Generate prefill
  const prefill = generatePrefill(prefillContext);

  // Try to call the coach API
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

    if (error) throw error;
    return data.message || prefill;
  } catch (error) {
    console.error('Error generating intervention message:', error);
    // Return fallback message based on signal type
    return getFallbackMessage(signal);
  }
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'late_night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function getMoodString(mood: number): string {
  if (mood <= 2) return 'low';
  if (mood <= 4) return 'struggling';
  if (mood <= 6) return 'neutral';
  if (mood <= 8) return 'good';
  return 'great';
}

function getFallbackMessage(signal: TimingSignal): string {
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

export default useTimingEngine;
