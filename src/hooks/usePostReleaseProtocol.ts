/**
 * usePostReleaseProtocol — manages active lockout state, shame capture, deletion intercept.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { PostReleaseProtocol, LockoutTier } from '../types/post-release';
import {
  startProtocol,
  getActiveProtocol,
  captureShameEntry,
  saveReflection as saveReflectionEngine,
  interceptDeletion,
  completeProtocol,
} from '../lib/post-release-engine';
import type { DeletionInterceptResult } from '../lib/post-release-engine';

interface UsePostReleaseProtocolReturn {
  activeProtocol: PostReleaseProtocol | null;
  isLocked: boolean;
  minutesRemaining: number;
  lockoutTier: LockoutTier | null;
  isLoading: boolean;
  triggerProtocol: (releaseType: string, regretLevel: number, intensity?: number) => Promise<void>;
  captureShame: (text: string) => Promise<void>;
  saveReflection: (text: string) => Promise<void>;
  attemptDeletion: () => Promise<DeletionInterceptResult | null>;
}

function getMinutesRemaining(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 60000));
}

export function usePostReleaseProtocol(): UsePostReleaseProtocolReturn {
  const [activeProtocol, setActiveProtocol] = useState<PostReleaseProtocol | null>(null);
  const [minutesRemaining, setMinutesRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setActiveProtocol(null);
        return;
      }

      const protocol = await getActiveProtocol(user.id);
      setActiveProtocol(protocol);

      if (protocol) {
        setMinutesRemaining(getMinutesRemaining(protocol.lockoutExpiresAt));
      } else {
        setMinutesRemaining(0);
      }
    } catch {
      setActiveProtocol(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tick down every 60s while active
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!activeProtocol) return;

    intervalRef.current = setInterval(() => {
      const remaining = getMinutesRemaining(activeProtocol.lockoutExpiresAt);
      setMinutesRemaining(remaining);

      if (remaining <= 0) {
        // Auto-complete when expired
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            completeProtocol(user.id, activeProtocol.id).then(() => refresh());
          }
        });
      }
    }, 60000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeProtocol, refresh]);

  const triggerProtocol = useCallback(async (
    releaseType: string,
    regretLevel: number,
    intensity?: number
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const protocol = await startProtocol(user.id, releaseType, regretLevel, intensity);
    if (protocol) {
      setActiveProtocol(protocol);
      setMinutesRemaining(getMinutesRemaining(protocol.lockoutExpiresAt));
    }
  }, []);

  const captureShame = useCallback(async (text: string) => {
    if (!activeProtocol) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await captureShameEntry(user.id, activeProtocol.id, text);
    await refresh();
  }, [activeProtocol, refresh]);

  const saveReflectionCb = useCallback(async (text: string) => {
    if (!activeProtocol) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await saveReflectionEngine(user.id, activeProtocol.id, text);
    await refresh();
  }, [activeProtocol, refresh]);

  const attemptDeletionCb = useCallback(async (): Promise<DeletionInterceptResult | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const result = await interceptDeletion(user.id);
    if (result) await refresh();
    return result;
  }, [refresh]);

  return {
    activeProtocol,
    isLocked: activeProtocol !== null,
    minutesRemaining,
    lockoutTier: activeProtocol?.lockoutTier ?? null,
    isLoading,
    triggerProtocol,
    captureShame,
    saveReflection: saveReflectionCb,
    attemptDeletion: attemptDeletionCb,
  };
}
