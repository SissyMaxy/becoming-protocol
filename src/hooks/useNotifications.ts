/**
 * useNotifications Hook
 * Polls for delayed dopamine rewards every 60s when app is active.
 * Also generates periodic notifications based on dopamine engine budget.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  processDelayedRewards,
  generateNotification,
  deliverInApp,
  resetDailyCounters,
} from '../lib/dopamine-engine';

interface UseNotificationsOptions {
  denialDay?: number;
  ginaHome?: boolean;
  feminizationTarget?: string;
  streakDays?: number;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { user } = useAuth();
  const lastResetDate = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const processRewards = useCallback(async () => {
    if (!user?.id) return;
    try {
      await processDelayedRewards(user.id);
    } catch {
      // Silent — dopamine is invisible
    }
  }, [user?.id]);

  const tryGenerateNotification = useCallback(async () => {
    if (!user?.id) return;
    try {
      const payload = await generateNotification(user.id, {
        denialDay: options.denialDay,
        ginaHome: options.ginaHome,
        feminizationTarget: options.feminizationTarget,
        streakDays: options.streakDays,
      });
      if (payload) {
        deliverInApp(payload);
      }
    } catch {
      // Silent
    }
  }, [user?.id, options.denialDay, options.ginaHome, options.feminizationTarget, options.streakDays]);

  // Daily reset check
  const checkDailyReset = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().split('T')[0];
    if (lastResetDate.current !== today) {
      lastResetDate.current = today;
      try {
        await resetDailyCounters(user.id);
      } catch {
        // Silent
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    // Initial run
    checkDailyReset();
    processRewards();

    // Poll every 60s: process delayed rewards + try generating a notification
    intervalRef.current = setInterval(() => {
      processRewards();
      tryGenerateNotification();
    }, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id, processRewards, tryGenerateNotification, checkDailyReset]);

  return { processRewards, tryGenerateNotification };
}
