/**
 * useSleepConditioning
 *
 * Disabled by the Protocol Contract. Sleep conditioning is outside the
 * legible, consented, scoped, and recoverable boundary, so this hook keeps the
 * legacy API stable while refusing to fetch, offer, or start overnight sessions.
 */

import { useCallback } from 'react';

export interface SleepPrescriptionItem {
  id: string;
  title: string;
  mediaType: string;
  category: string;
  tier: number;
  intensity: number;
  durationMinutes: number | null;
  audioUrl: string | null;
  sessionContexts: string[];
}

export interface SleepPrescription {
  sessionId: string;
  tier: number;
  denialDay: number;
  streakDays: number;
  playlist: SleepPrescriptionItem[];
}

interface UseSleepConditioningReturn {
  prescription: SleepPrescription | null;
  isLoading: boolean;
  error: string | null;
  isActive: boolean;
  shouldOffer: boolean;
  startSleepSession: () => Promise<void>;
  endSleepSession: () => Promise<void>;
  fetchPrescription: () => Promise<SleepPrescription | null>;
}

const DISABLED_REASON = 'Sleep conditioning is disabled by the Protocol Contract.';

export function useSleepConditioning(): UseSleepConditioningReturn {
  const fetchPrescription = useCallback(async (): Promise<SleepPrescription | null> => {
    return null;
  }, []);

  const startSleepSession = useCallback(async () => {
    return;
  }, []);

  const endSleepSession = useCallback(async () => {
    return;
  }, []);

  return {
    prescription: null,
    isLoading: false,
    error: DISABLED_REASON,
    isActive: false,
    shouldOffer: false,
    startSleepSession,
    endSleepSession,
    fetchPrescription,
  };
}
