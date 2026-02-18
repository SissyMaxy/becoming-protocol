/**
 * Pattern Notifications Hook
 *
 * Monitors pattern activity and triggers notifications:
 * - Proactive reminders for high-frequency patterns
 * - Time-based pattern awareness
 * - Catch logging integration
 */

import { useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { checkPatternReminders, logPatternCatch, getPattern } from '../lib/patterns';
import { getNotificationManager, pushAchievement } from '../lib/notifications';

interface UsePatternNotificationsOptions {
  enabled?: boolean;
  checkIntervalMs?: number;
}

export function usePatternNotifications({
  enabled = true,
  checkIntervalMs = 30 * 60 * 1000, // Check every 30 minutes
}: UsePatternNotificationsOptions = {}) {
  const { user } = useAuth();

  // Check for pattern reminders
  const checkReminders = useCallback(async () => {
    if (!user?.id || !enabled) return;

    try {
      await checkPatternReminders(user.id);
    } catch (error) {
      console.error('Failed to check pattern reminders:', error);
    }
  }, [user?.id, enabled]);

  // Handle pattern catch from notification action
  const handlePatternCatch = useCallback(async (patternId: string, corrected: boolean) => {
    if (!user?.id) return;

    try {
      const pattern = await getPattern(patternId);
      if (!pattern) return;

      await logPatternCatch(patternId, user.id, {
        correctionApplied: true,
        correctionSuccess: corrected,
        context: 'Logged via notification',
      });

      // Push achievement notification for milestones
      if (pattern.timesCaught === 10) {
        pushAchievement('Pattern Spotter: 10 catches', 25);
      } else if (pattern.timesCaught === 50) {
        pushAchievement('Pattern Master: 50 catches', 50);
      } else if (pattern.timesCaught === 100) {
        pushAchievement('Pattern Virtuoso: 100 catches', 100);
      }

      // If high correction streak, celebrate
      if (corrected && pattern.timesCorrected > 0 && pattern.timesCorrected % 10 === 0) {
        getNotificationManager().push({
          type: 'achievement',
          priority: 'low',
          title: 'Correction Streak!',
          message: `${pattern.timesCorrected} corrections on "${pattern.patternName}"`,
          icon: 'Trophy',
        });
      }
    } catch (error) {
      console.error('Failed to log pattern catch:', error);
    }
  }, [user?.id]);

  // Listen for open-pattern-catch events (from notification actions)
  useEffect(() => {
    const handleOpenPatternCatch = (event: CustomEvent<{ patternId: string }>) => {
      // This event triggers the pattern catch UI to open
      // The PatternCatchWidget or a modal should listen for this
      console.log('Open pattern catch requested:', event.detail.patternId);
    };

    window.addEventListener('open-pattern-catch', handleOpenPatternCatch as EventListener);
    return () => {
      window.removeEventListener('open-pattern-catch', handleOpenPatternCatch as EventListener);
    };
  }, []);

  // Initial check and interval
  useEffect(() => {
    if (!user?.id || !enabled) return;

    // Initial check after short delay
    const initialTimeout = setTimeout(checkReminders, 5000);

    // Periodic checks
    const interval = setInterval(checkReminders, checkIntervalMs);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [user?.id, enabled, checkIntervalMs, checkReminders]);

  return {
    checkReminders,
    handlePatternCatch,
  };
}
