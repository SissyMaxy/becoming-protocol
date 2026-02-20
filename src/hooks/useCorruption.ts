/**
 * useCorruption — Handler-internal hook for corruption state.
 *
 * This hook is consumed by Handler systems and AI context builders ONLY.
 * No user-facing UI component should ever import this hook.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getCorruptionSnapshot,
  initializeCorruption,
  logCorruptionEvent,
  suspendAllCorruption,
  resumeCorruption,
  checkAdvancement,
  advanceCorruption,
  incrementAdvancementScore,
} from '../lib/corruption';
import type {
  CorruptionDomain,
  CorruptionEventType,
  CorruptionSnapshot,
  AdvancementCheck,
  MaintenanceResult,
} from '../types/corruption';
import {
  dailyCorruptionMaintenance,
  gatherMilestoneData,
  runAdvancementChecks,
} from '../lib/corruption-advancement';

interface UseCorruptionReturn {
  snapshot: CorruptionSnapshot | null;
  isLoading: boolean;
  logEvent: (
    domain: CorruptionDomain,
    eventType: CorruptionEventType,
    level: number,
    details?: Record<string, unknown>,
    handlerIntent?: string,
    userFacingCopy?: string,
  ) => Promise<void>;
  suspend: (reason: string) => Promise<void>;
  resume: () => Promise<void>;
  checkDomainAdvancement: (
    domain: CorruptionDomain,
    milestoneData: Record<string, unknown>,
  ) => Promise<{ eligible: boolean; reason?: string }>;
  advanceDomain: (domain: CorruptionDomain) => Promise<{ new_level: number }>;
  addAdvancementPoints: (domain: CorruptionDomain, points: number) => Promise<void>;
  runMaintenance: () => Promise<MaintenanceResult | null>;
  getAdvancementStatus: () => Promise<AdvancementCheck[]>;
  refresh: () => Promise<void>;
}

export function useCorruption(): UseCorruptionReturn {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<CorruptionSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    if (!user?.id) return;
    const snap = await getCorruptionSnapshot(user.id);

    // Auto-initialize if no states exist
    if (snap.states.length === 0) {
      await initializeCorruption(user.id);
      const initialized = await getCorruptionSnapshot(user.id);
      setSnapshot(initialized);
    } else {
      setSnapshot(snap);
    }

    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const logEvent = useCallback(async (
    domain: CorruptionDomain,
    eventType: CorruptionEventType,
    level: number,
    details?: Record<string, unknown>,
    handlerIntent?: string,
    userFacingCopy?: string,
  ) => {
    if (!user?.id) return;
    await logCorruptionEvent(user.id, domain, eventType, level, details, handlerIntent, userFacingCopy);
  }, [user?.id]);

  const suspend = useCallback(async (reason: string) => {
    if (!user?.id) return;
    await suspendAllCorruption(user.id, reason);
    await loadSnapshot();
  }, [user?.id, loadSnapshot]);

  const resume = useCallback(async () => {
    if (!user?.id) return;
    await resumeCorruption(user.id);
    await loadSnapshot();
  }, [user?.id, loadSnapshot]);

  const checkDomainAdvancement = useCallback(async (
    domain: CorruptionDomain,
    milestoneData: Record<string, unknown>,
  ) => {
    if (!user?.id) return { eligible: false, reason: 'No user' };
    return checkAdvancement(user.id, domain, milestoneData);
  }, [user?.id]);

  const advanceDomain = useCallback(async (domain: CorruptionDomain) => {
    if (!user?.id) return { new_level: 0 };
    const result = await advanceCorruption(user.id, domain);
    await loadSnapshot();
    return result;
  }, [user?.id, loadSnapshot]);

  const addAdvancementPoints = useCallback(async (domain: CorruptionDomain, points: number) => {
    if (!user?.id) return;
    await incrementAdvancementScore(user.id, domain, points);
  }, [user?.id]);

  const runMaintenance = useCallback(async (): Promise<MaintenanceResult | null> => {
    if (!user?.id) return null;
    const result = await dailyCorruptionMaintenance(user.id);
    await loadSnapshot();
    return result;
  }, [user?.id, loadSnapshot]);

  const getAdvancementStatus = useCallback(async (): Promise<AdvancementCheck[]> => {
    if (!user?.id) return [];
    const milestoneData = await gatherMilestoneData(user.id);
    return runAdvancementChecks(user.id, milestoneData);
  }, [user?.id]);

  return {
    snapshot,
    isLoading,
    logEvent,
    suspend,
    resume,
    checkDomainAdvancement,
    advanceDomain,
    addAdvancementPoints,
    runMaintenance,
    getAdvancementStatus,
    refresh: loadSnapshot,
  };
}
