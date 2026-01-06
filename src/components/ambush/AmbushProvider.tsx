/**
 * AmbushProvider.tsx
 *
 * Wraps the app to provide global ambush notification functionality.
 * Polls for pending ambushes and displays notifications when they're due.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useScheduledAmbush } from '../../hooks/useScheduledAmbush';
import { AmbushNotification } from './AmbushNotification';
import type { ScheduledAmbush, AmbushDayStats } from '../../types/scheduled-ambush';

interface AmbushContextValue {
  currentAmbush: ScheduledAmbush | null;
  todaysAmbushes: ScheduledAmbush[];
  todaysStats: AmbushDayStats | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  scheduleToday: () => Promise<number>;
}

const AmbushContext = createContext<AmbushContextValue | null>(null);

interface AmbushProviderProps {
  children: ReactNode;
  enabled?: boolean;
  pollIntervalMs?: number;
}

export function AmbushProvider({
  children,
  enabled = true,
  pollIntervalMs = 30000,
}: AmbushProviderProps) {
  const {
    currentAmbush,
    todaysAmbushes,
    todaysStats,
    isLoading,
    complete,
    skip,
    snooze,
    dismiss,
    refresh,
    canSnoozeAmbush,
    isCompleting,
    scheduleToday,
  } = useScheduledAmbush({
    pollIntervalMs,
    autoSchedule: enabled,
  });

  const contextValue: AmbushContextValue = {
    currentAmbush,
    todaysAmbushes,
    todaysStats,
    isLoading,
    refresh,
    scheduleToday,
  };

  return (
    <AmbushContext.Provider value={contextValue}>
      {children}

      {/* Global ambush notification */}
      {enabled && currentAmbush && (
        <AmbushNotification
          ambush={currentAmbush}
          onComplete={complete}
          onSnooze={snooze}
          onSkip={skip}
          onDismiss={dismiss}
          canSnooze={canSnoozeAmbush}
          isCompleting={isCompleting}
        />
      )}
    </AmbushContext.Provider>
  );
}

export function useAmbushContext(): AmbushContextValue {
  const context = useContext(AmbushContext);
  if (!context) {
    throw new Error('useAmbushContext must be used within an AmbushProvider');
  }
  return context;
}

export function useAmbushContextOptional(): AmbushContextValue | null {
  return useContext(AmbushContext);
}
