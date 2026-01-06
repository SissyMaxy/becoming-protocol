// Ceremonies Hook
// State management for point of no return rituals

import { useState, useCallback, useEffect } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import {
  checkCeremonyAvailability,
  startCeremony,
  updateCeremonyProgress,
  completeCeremony,
  getCeremonyStatus,
  getIrreversibleMarkers,
} from '../lib/ceremonies';
import type {
  Ceremony,
  UserCeremony,
  CeremonyEvidence,
  CeremonyStep,
} from '../types/ceremonies';
import { CEREMONY_DEFINITIONS } from '../types/ceremonies';

interface UseCeremoniesReturn {
  // Status
  availableCeremonies: UserCeremony[];
  completedCeremonies: UserCeremony[];
  nextCeremony: Ceremony | null;
  irreversibleMarkers: string[];
  isLoading: boolean;
  error: string | null;

  // Active ceremony
  activeCeremony: UserCeremony | null;
  activeStep: number;
  ceremonySteps: CeremonyStep[];

  // Actions
  refresh: () => Promise<void>;
  checkAvailability: () => Promise<Ceremony[]>;
  beginCeremony: (ceremonyId: string) => Promise<void>;
  completeStep: (response?: string) => Promise<void>;
  finishCeremony: (evidence?: Partial<CeremonyEvidence>) => Promise<void>;
  cancelCeremony: () => void;
}

export function useCeremonies(): UseCeremoniesReturn {
  const { progress } = useProtocol();

  const [availableCeremonies, setAvailableCeremonies] = useState<UserCeremony[]>([]);
  const [completedCeremonies, setCompletedCeremonies] = useState<UserCeremony[]>([]);
  const [nextCeremony, setNextCeremony] = useState<Ceremony | null>(null);
  const [irreversibleMarkers, setIrreversibleMarkers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active ceremony state
  const [activeCeremony, setActiveCeremony] = useState<UserCeremony | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [ceremonySteps, setCeremonySteps] = useState<CeremonyStep[]>([]);

  // Refresh status
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const status = await getCeremonyStatus();
      setAvailableCeremonies(status.available);
      setCompletedCeremonies(status.completed);
      setNextCeremony(status.next);

      const markers = await getIrreversibleMarkers();
      setIrreversibleMarkers(markers);
    } catch (err) {
      console.error('Failed to load ceremonies:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Check availability based on current context
  const checkAvailability = useCallback(async (): Promise<Ceremony[]> => {
    const context = {
      day: progress?.totalDays || 1,
      streak: progress?.overallStreak || 0,
      phase: progress?.phase?.currentPhase || 1,
      events: [], // Would come from completed actions
    };

    try {
      const available = await checkCeremonyAvailability(context);
      await refresh();
      return available;
    } catch (err) {
      console.error('Failed to check ceremony availability:', err);
      throw err;
    }
  }, [progress, refresh]);

  // Begin a ceremony
  const beginCeremony = useCallback(async (ceremonyId: string) => {
    try {
      const userCeremony = await startCeremony(ceremonyId);
      setActiveCeremony(userCeremony);
      setActiveStep(0);

      // Get steps from definitions
      const definition = (CEREMONY_DEFINITIONS as any)[userCeremony.ceremony.name];
      if (definition) {
        setCeremonySteps(definition.steps);
      } else {
        // Fallback: create confirm steps from ritual_steps
        setCeremonySteps(
          userCeremony.ceremony.ritualSteps.map(step => ({
            type: 'confirm' as const,
            text: step,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to start ceremony:', err);
      throw err;
    }
  }, []);

  // Complete current step
  const completeStep = useCallback(async (response?: string) => {
    if (!activeCeremony) return;

    try {
      await updateCeremonyProgress(activeCeremony.id, activeStep, response);

      if (activeStep < ceremonySteps.length - 1) {
        setActiveStep(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to complete step:', err);
      throw err;
    }
  }, [activeCeremony, activeStep, ceremonySteps.length]);

  // Finish ceremony
  const finishCeremony = useCallback(async (evidence?: Partial<CeremonyEvidence>) => {
    if (!activeCeremony) return;

    try {
      await completeCeremony(activeCeremony.id, evidence);
      setActiveCeremony(null);
      setActiveStep(0);
      setCeremonySteps([]);
      await refresh();
    } catch (err) {
      console.error('Failed to complete ceremony:', err);
      throw err;
    }
  }, [activeCeremony, refresh]);

  // Cancel ceremony (doesn't save progress)
  const cancelCeremony = useCallback(() => {
    setActiveCeremony(null);
    setActiveStep(0);
    setCeremonySteps([]);
  }, []);

  return {
    availableCeremonies,
    completedCeremonies,
    nextCeremony,
    irreversibleMarkers,
    isLoading,
    error,
    activeCeremony,
    activeStep,
    ceremonySteps,
    refresh,
    checkAvailability,
    beginCeremony,
    completeStep,
    finishCeremony,
    cancelCeremony,
  };
}
