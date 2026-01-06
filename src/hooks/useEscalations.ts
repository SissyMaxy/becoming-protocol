// Escalations Hook
// State management for automatic time-locked escalations

import { useState, useCallback, useEffect } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import {
  getEscalationCalendar,
  checkAndTriggerEscalations,
  delayEscalation,
  getUpcomingWarnings,
  getImminentEscalations,
  getEscalationEffect,
  formatCountdown,
} from '../lib/escalations';
import type {
  EscalationCalendarItem,
  EscalationDelayCost,
  AutomaticEscalation,
} from '../types/escalations';

interface UseEscalationsReturn {
  // Calendar
  calendar: EscalationCalendarItem[];
  warnings: EscalationCalendarItem[];
  imminent: EscalationCalendarItem[];
  isLoading: boolean;
  error: string | null;

  // Recently triggered
  recentlyTriggered: AutomaticEscalation[];
  triggerMessage: string | null;

  // Actions
  refresh: () => Promise<void>;
  delay: (escalationId: string) => Promise<{ cost: EscalationDelayCost }>;
  dismissTrigger: () => void;

  // Helpers
  formatCountdown: (days: number) => string;
  getEffect: (type: string) => string;

  // Current day
  currentDay: number;
}

export function useEscalations(): UseEscalationsReturn {
  const { progress } = useProtocol();

  const [calendar, setCalendar] = useState<EscalationCalendarItem[]>([]);
  const [warnings, setWarnings] = useState<EscalationCalendarItem[]>([]);
  const [imminent, setImminent] = useState<EscalationCalendarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recentlyTriggered, setRecentlyTriggered] = useState<AutomaticEscalation[]>([]);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);

  // Calculate current day from total days in progress
  const currentDay = progress?.totalDays || 1;

  // Refresh calendar
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check and trigger any due escalations
      const triggered = await checkAndTriggerEscalations(currentDay);

      if (triggered.length > 0) {
        setRecentlyTriggered(triggered);
        // Show message for first triggered escalation
        setTriggerMessage(getEscalationEffect(triggered[0].escalationType));
      }

      // Load full calendar
      const calendarData = await getEscalationCalendar(currentDay);
      setCalendar(calendarData);

      // Load warnings
      const warningsData = await getUpcomingWarnings(currentDay);
      setWarnings(warningsData);

      // Load imminent
      const imminentData = await getImminentEscalations(currentDay);
      setImminent(imminentData);
    } catch (err) {
      console.error('Failed to load escalations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [currentDay]);

  // Load on mount and when day changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Delay escalation
  const delay = useCallback(
    async (escalationId: string): Promise<{ cost: EscalationDelayCost }> => {
      try {
        const result = await delayEscalation(escalationId);
        await refresh();
        return { cost: result.cost };
      } catch (err) {
        console.error('Failed to delay escalation:', err);
        throw err;
      }
    },
    [refresh]
  );

  const dismissTrigger = useCallback(() => {
    setRecentlyTriggered([]);
    setTriggerMessage(null);
  }, []);

  return {
    calendar,
    warnings,
    imminent,
    isLoading,
    error,
    recentlyTriggered,
    triggerMessage,
    refresh,
    delay,
    dismissTrigger,
    formatCountdown,
    getEffect: getEscalationEffect,
    currentDay,
  };
}
