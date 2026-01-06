/**
 * useScheduledAmbush Hook
 *
 * Manages scheduled ambushes - polling for pending tasks,
 * displaying notifications, and tracking completions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getNextAmbush,
  getAmbushesForDate,
  markAmbushDelivered,
  completeAmbush,
  skipAmbush,
  snoozeAmbush,
  canSnooze,
  getAmbushDayStats,
  scheduleDailyAmbushes,
} from '../lib/scheduled-ambush';
import type { ScheduledAmbush, AmbushDayStats } from '../types/scheduled-ambush';

interface UseScheduledAmbushOptions {
  pollIntervalMs?: number;
  autoSchedule?: boolean;
}

interface UseScheduledAmbushReturn {
  // Current ambush
  currentAmbush: ScheduledAmbush | null;
  isLoading: boolean;

  // Today's ambushes
  todaysAmbushes: ScheduledAmbush[];
  todaysStats: AmbushDayStats | null;

  // Actions
  complete: (proofUrl?: string) => Promise<void>;
  skip: () => Promise<void>;
  snooze: () => Promise<void>;
  dismiss: () => void;
  refresh: () => Promise<void>;

  // State
  canSnoozeAmbush: boolean;
  isCompleting: boolean;

  // Scheduling
  scheduleToday: () => Promise<number>;
}

export function useScheduledAmbush(
  options: UseScheduledAmbushOptions = {}
): UseScheduledAmbushReturn {
  const { pollIntervalMs = 30000, autoSchedule = true } = options;
  const { user } = useAuth();

  const [currentAmbush, setCurrentAmbush] = useState<ScheduledAmbush | null>(null);
  const [todaysAmbushes, setTodaysAmbushes] = useState<ScheduledAmbush[]>([]);
  const [todaysStats, setTodaysStats] = useState<AmbushDayStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [canSnoozeAmbush, setCanSnoozeAmbush] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasScheduledRef = useRef(false);

  // Check for pending ambushes
  const checkForAmbush = useCallback(async () => {
    if (!user) return;

    try {
      const ambush = await getNextAmbush(user.id);

      if (ambush && ambush.id !== currentAmbush?.id) {
        // Mark as delivered
        await markAmbushDelivered(ambush.id);
        setCurrentAmbush(ambush);

        // Check if can snooze
        const canSnz = await canSnooze(ambush.id);
        setCanSnoozeAmbush(canSnz);
      }
    } catch (error) {
      console.error('Error checking for ambush:', error);
    }
  }, [user, currentAmbush?.id]);

  // Load today's data
  const loadTodaysData = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const [ambushes, stats] = await Promise.all([
        getAmbushesForDate(user.id),
        getAmbushDayStats(user.id),
      ]);
      setTodaysAmbushes(ambushes);
      setTodaysStats(stats);
    } catch (error) {
      console.error('Error loading today\'s ambushes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Schedule today's ambushes
  const scheduleToday = useCallback(async (): Promise<number> => {
    if (!user) return 0;

    const count = await scheduleDailyAmbushes(user.id);
    if (count > 0) {
      await loadTodaysData();
    }
    return count;
  }, [user, loadTodaysData]);

  // Complete current ambush
  const complete = useCallback(async (proofUrl?: string) => {
    if (!currentAmbush) return;

    setIsCompleting(true);
    try {
      await completeAmbush(currentAmbush.id, { proofUrl });
      setCurrentAmbush(null);
      await loadTodaysData();
    } finally {
      setIsCompleting(false);
    }
  }, [currentAmbush, loadTodaysData]);

  // Skip current ambush
  const skip = useCallback(async () => {
    if (!currentAmbush) return;

    await skipAmbush(currentAmbush.id);
    setCurrentAmbush(null);
    await loadTodaysData();
  }, [currentAmbush, loadTodaysData]);

  // Snooze current ambush
  const snooze = useCallback(async () => {
    if (!currentAmbush) return;

    await snoozeAmbush(currentAmbush.id);
    setCurrentAmbush(null);
  }, [currentAmbush]);

  // Dismiss without action (for UI purposes)
  const dismiss = useCallback(() => {
    setCurrentAmbush(null);
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    await loadTodaysData();
    await checkForAmbush();
  }, [loadTodaysData, checkForAmbush]);

  // Initial load and auto-schedule
  useEffect(() => {
    if (!user) return;

    const initialize = async () => {
      await loadTodaysData();

      // Auto-schedule if enabled and not already done
      if (autoSchedule && !hasScheduledRef.current) {
        hasScheduledRef.current = true;
        const ambushes = await getAmbushesForDate(user.id);
        if (ambushes.length === 0) {
          await scheduleToday();
        }
      }

      // Check for pending ambush
      await checkForAmbush();
    };

    initialize();
  }, [user, loadTodaysData, checkForAmbush, autoSchedule, scheduleToday]);

  // Set up polling
  useEffect(() => {
    if (!user) return;

    // Poll for pending ambushes
    pollIntervalRef.current = setInterval(checkForAmbush, pollIntervalMs);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [user, checkForAmbush, pollIntervalMs]);

  return {
    currentAmbush,
    isLoading,
    todaysAmbushes,
    todaysStats,
    complete,
    skip,
    snooze,
    dismiss,
    refresh,
    canSnoozeAmbush,
    isCompleting,
    scheduleToday,
  };
}
