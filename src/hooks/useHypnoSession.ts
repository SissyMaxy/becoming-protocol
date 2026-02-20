// ============================================
// useHypnoSession — Hypno session lifecycle hook
// Manages create → active → end, captures, library selection
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  HypnoSessionRecord,
  HypnoSessionType,
  HypnoCaptureMode,
  HypnoBypassReason,
  HypnoPostSessionState,
  HypnoCaptureType,
} from '../types/hypno-bridge';
import {
  createHypnoSession,
  endHypnoSession,
  addSessionCapture,
  getActiveHypnoSession,
} from '../lib/hypno-sessions';

// ============================================
// TYPES
// ============================================

export interface UseHypnoSessionReturn {
  activeSession: HypnoSessionRecord | null;
  isLoading: boolean;
  captureCount: number;
  flaggedTimestamps: number[];

  startSession: (input: StartSessionInput) => Promise<HypnoSessionRecord | null>;
  endSession: (endData: EndSessionInput) => Promise<void>;
  addCapture: (capture: CaptureInput) => Promise<string | null>;
  flagTimestamp: () => void;
}

interface StartSessionInput {
  libraryItemId?: string;
  contentIds?: string[];
  sessionType: HypnoSessionType;
  captureMode?: HypnoCaptureMode;
  bypassReason?: HypnoBypassReason;
  originalPrescriptionType?: string;
  denialDayAtStart?: number;
  arousalAtStart?: number;
}

interface EndSessionInput {
  tranceDepth?: number;
  postSessionState?: HypnoPostSessionState;
  completed: boolean;
}

interface CaptureInput {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio';
  description?: string;
  timestampSeconds?: number;
  captureType: HypnoCaptureType;
}

// ============================================
// HOOK
// ============================================

export function useHypnoSession(): UseHypnoSessionReturn {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<HypnoSessionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [captureCount, setCaptureCount] = useState(0);
  const [flaggedTimestamps, setFlaggedTimestamps] = useState<number[]>([]);
  const sessionStartTime = useRef<number>(0);

  // Load active session on mount
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    getActiveHypnoSession(user.id)
      .then(session => {
        if (session) {
          setActiveSession(session);
          setCaptureCount(session.captures?.length || 0);
          sessionStartTime.current = new Date(session.startedAt).getTime();
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user?.id]);

  const startSession = useCallback(async (input: StartSessionInput): Promise<HypnoSessionRecord | null> => {
    if (!user?.id) return null;

    const session = await createHypnoSession(user.id, input);
    if (session) {
      setActiveSession(session);
      setCaptureCount(0);
      setFlaggedTimestamps([]);
      sessionStartTime.current = Date.now();
    }
    return session;
  }, [user?.id]);

  const endSession = useCallback(async (endData: EndSessionInput): Promise<void> => {
    if (!user?.id || !activeSession) return;

    const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000);

    await endHypnoSession(user.id, activeSession.id, {
      ...endData,
      durationSeconds,
    });

    setActiveSession(null);
    setCaptureCount(0);
    setFlaggedTimestamps([]);
    sessionStartTime.current = 0;
  }, [user?.id, activeSession]);

  const addCapture = useCallback(async (capture: CaptureInput): Promise<string | null> => {
    if (!user?.id || !activeSession) return null;

    const vaultId = await addSessionCapture(user.id, activeSession.id, capture);
    if (vaultId) {
      setCaptureCount(prev => prev + 1);
    }
    return vaultId;
  }, [user?.id, activeSession]);

  const flagTimestamp = useCallback(() => {
    if (!sessionStartTime.current) return;
    const elapsed = Math.round((Date.now() - sessionStartTime.current) / 1000);
    setFlaggedTimestamps(prev => [...prev, elapsed]);
  }, []);

  return {
    activeSession,
    isLoading,
    captureCount,
    flaggedTimestamps,
    startSession,
    endSession,
    addCapture,
    flagTimestamp,
  };
}
