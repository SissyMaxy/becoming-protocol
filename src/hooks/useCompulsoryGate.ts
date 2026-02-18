// useCompulsoryGate Hook
// Manages compulsory element state and app locking (Feature 38)

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  type CompulsoryElement,
  type CompulsoryStatus,
  getAppBlockingElements,
  evaluateCompulsoryStatus,
  completeCompulsoryElement,
  shouldLockApp,
  isFeatureBlockedByCompulsory,
} from '../lib/compulsory-elements';

interface UseCompulsoryGateReturn {
  // State
  isLocked: boolean;
  isLoading: boolean;
  blockingElements: CompulsoryElement[];
  allStatuses: CompulsoryStatus[];

  // Actions
  completeElement: (elementId: string) => Promise<boolean>;
  checkFeatureAccess: (feature: string) => Promise<{ blocked: boolean; reason: string | null }>;
  refresh: () => Promise<void>;
}

export function useCompulsoryGate(daysOnProtocol: number): UseCompulsoryGateReturn {
  const { user } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [blockingElements, setBlockingElements] = useState<CompulsoryElement[]>([]);
  const [allStatuses, setAllStatuses] = useState<CompulsoryStatus[]>([]);

  // Load compulsory status
  const refresh = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const [locked, blocking, statuses] = await Promise.all([
        shouldLockApp(user.id, daysOnProtocol),
        getAppBlockingElements(user.id, daysOnProtocol),
        evaluateCompulsoryStatus(user.id, daysOnProtocol),
      ]);

      setIsLocked(locked);
      setBlockingElements(blocking);
      setAllStatuses(statuses);
    } catch (error) {
      console.error('Error loading compulsory status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, daysOnProtocol]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Complete an element
  const completeElement = useCallback(async (elementId: string): Promise<boolean> => {
    if (!user?.id) return false;

    const success = await completeCompulsoryElement(user.id, elementId);
    if (success) {
      await refresh();
    }
    return success;
  }, [user?.id, refresh]);

  // Check if a specific feature is blocked by compulsory elements
  const checkFeatureAccess = useCallback(async (feature: string) => {
    if (!user?.id) return { blocked: false, reason: null };

    return isFeatureBlockedByCompulsory(user.id, daysOnProtocol, feature);
  }, [user?.id, daysOnProtocol]);

  return {
    isLocked,
    isLoading,
    blockingElements,
    allStatuses,
    completeElement,
    checkFeatureAccess,
    refresh,
  };
}

export default useCompulsoryGate;
