// useHandlerSessions Hook
// Manages Handler-initiated sessions and response window tracking (Feature 35)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  type HandlerInitiatedSession,
  type ResistanceCost,
  getPendingSessions,
  getExpiredSessions,
  acknowledgeSession,
  completeSession,
  declineSession,
  handleIgnoredSession,
  initiateSession,
  getInitiationMessage,
  getEscalationMessage,
} from '../lib/handler-initiated-sessions';
import { type TimingSignal } from '../lib/timing-engine';
import { applyPunishment } from '../lib/punishment-engine';

interface UseHandlerSessionsOptions {
  enabled?: boolean;
  checkIntervalMs?: number;
  onSessionInitiated?: (session: HandlerInitiatedSession, message: string) => void;
  onSessionExpired?: (session: HandlerInitiatedSession, message: string) => void;
  onPunishmentApplied?: (trigger: string) => void;
}

interface UseHandlerSessionsReturn {
  // State
  pendingSessions: HandlerInitiatedSession[];
  currentSession: HandlerInitiatedSession | null;
  isLoading: boolean;
  hasUrgentSession: boolean;
  timeRemaining: number | null; // Seconds until current session expires

  // Actions
  initiate: (signal: TimingSignal, userState: { denialDay: number; streakDays: number; arousalLevel: number }) => Promise<HandlerInitiatedSession | null>;
  acknowledge: (sessionId: string) => Promise<boolean>;
  complete: (sessionId: string) => Promise<boolean>;
  decline: (sessionId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useHandlerSessions(
  options: UseHandlerSessionsOptions = {}
): UseHandlerSessionsReturn {
  const { user } = useAuth();
  const {
    enabled = true,
    checkIntervalMs = 60 * 1000, // Check every minute
    onSessionInitiated,
    onSessionExpired,
    onPunishmentApplied,
  } = options;

  const [pendingSessions, setPendingSessions] = useState<HandlerInitiatedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processedSessionsRef = useRef<Set<string>>(new Set());

  // Get the most urgent pending session
  const currentSession = pendingSessions.length > 0 ? pendingSessions[0] : null;
  const hasUrgentSession = pendingSessions.some(s => {
    const deliveredAt = new Date(s.deliveredAt).getTime();
    const windowMs = s.responseWindowMinutes * 60 * 1000;
    const remaining = windowMs - (Date.now() - deliveredAt);
    return remaining > 0 && remaining < 5 * 60 * 1000; // Less than 5 minutes
  });

  // Refresh pending sessions
  const refresh = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const sessions = await getPendingSessions(user.id);
      setPendingSessions(sessions);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Check for expired sessions and apply consequences
  const checkExpiredSessions = useCallback(async () => {
    if (!user?.id) return;

    const expired = await getExpiredSessions(user.id);

    for (const session of expired) {
      // Skip if already processed
      if (processedSessionsRef.current.has(session.id)) continue;
      processedSessionsRef.current.add(session.id);

      // Handle the ignored session
      await handleIgnoredSession(session, user.id);

      // Apply punishment
      await applyPunishment(user.id, 'ignored_initiated_session');
      onPunishmentApplied?.('ignored_initiated_session');

      // Notify
      const escalationMessage = getEscalationMessage(session);
      onSessionExpired?.(session, escalationMessage);
    }

    // Refresh after processing
    await refresh();
  }, [user?.id, refresh, onSessionExpired, onPunishmentApplied]);

  // Update countdown timer for current session
  useEffect(() => {
    if (!currentSession) {
      setTimeRemaining(null);
      return;
    }

    const updateCountdown = () => {
      const deliveredAt = new Date(currentSession.deliveredAt).getTime();
      const windowMs = currentSession.responseWindowMinutes * 60 * 1000;
      const remaining = Math.max(0, windowMs - (Date.now() - deliveredAt));
      setTimeRemaining(Math.floor(remaining / 1000));
    };

    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [currentSession]);

  // Initial load and periodic checks
  useEffect(() => {
    if (!enabled || !user?.id) return;

    refresh();
    checkExpiredSessions();

    checkIntervalRef.current = setInterval(() => {
      checkExpiredSessions();
    }, checkIntervalMs);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [enabled, user?.id, checkIntervalMs, refresh, checkExpiredSessions]);

  // Initiate a new session
  const initiate = useCallback(async (
    signal: TimingSignal,
    userState: { denialDay: number; streakDays: number; arousalLevel: number }
  ): Promise<HandlerInitiatedSession | null> => {
    if (!user?.id) return null;

    const session = await initiateSession(user.id, signal, userState);
    if (session) {
      const message = getInitiationMessage(signal, userState);
      onSessionInitiated?.(session, message);
      await refresh();
    }

    return session;
  }, [user?.id, refresh, onSessionInitiated]);

  // Acknowledge a session
  const acknowledge = useCallback(async (sessionId: string): Promise<boolean> => {
    const success = await acknowledgeSession(sessionId);
    if (success) {
      await refresh();
    }
    return success;
  }, [refresh]);

  // Complete a session
  const complete = useCallback(async (sessionId: string): Promise<boolean> => {
    const success = await completeSession(sessionId);
    if (success) {
      await refresh();
    }
    return success;
  }, [refresh]);

  // Decline a session (with consequences)
  const decline = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!user?.id) return false;

    const cost: ResistanceCost = {
      action: 'declined_initiated_session',
      estimatedDaysAdded: 1,
      baselineRegression: 0.05,
      momentumImpact: 'Declined Handler-initiated session. Resistance logged.',
    };

    const success = await declineSession(sessionId, cost);
    if (success) {
      await refresh();
    }
    return success;
  }, [user?.id, refresh]);

  return {
    pendingSessions,
    currentSession,
    isLoading,
    hasUrgentSession,
    timeRemaining,
    initiate,
    acknowledge,
    complete,
    decline,
    refresh,
  };
}

export default useHandlerSessions;
