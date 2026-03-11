/**
 * useBookends — React hook for morning/evening bookend system.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserState } from './useUserState';
import {
  getOrCreateBookendConfig,
  hasViewedBookendToday,
  recordBookendView,
  isAfterBedTime,
  getDaySummary,
  getMorningMessage,
  getEveningMessage,
} from '../lib/bookend';
import { getLastCompletedProtocol, markMorningReframeShown } from '../lib/post-release-engine';
import type { BookendConfig, DaySummary } from '../types/bookend';
import type { PostReleaseProtocol } from '../types/post-release';

interface UseBookendsReturn {
  config: BookendConfig | null;
  showMorningBookend: boolean;
  showEveningBookend: boolean;
  morningMessage: string;
  eveningMessage: string;
  daySummary: DaySummary | null;
  lastProtocol: PostReleaseProtocol | null;
  dismissMorning: () => Promise<void>;
  dismissEvening: () => Promise<void>;
  triggerEvening: () => void;
  isLoading: boolean;
}

export function useBookends(): UseBookendsReturn {
  const { user } = useAuth();
  const { userState } = useUserState();
  const userId = user?.id;

  const [config, setConfig] = useState<BookendConfig | null>(null);
  const [showMorning, setShowMorning] = useState(false);
  const [showEvening, setShowEvening] = useState(false);
  const [morningMessage, setMorningMessage] = useState('');
  const [eveningMessage, setEveningMessage] = useState('');
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [lastProtocol, setLastProtocol] = useState<PostReleaseProtocol | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const denialDay = userState?.denialDay ?? 0;
  const streak = userState?.streakDays ?? 0;

  // Initialize on mount
  useEffect(() => {
    async function init() {
      if (!userId) return;

      try {
        const cfg = await getOrCreateBookendConfig(userId);
        setConfig(cfg);

        if (!cfg.enabled) {
          setIsLoading(false);
          return;
        }

        // Check if morning bookend should show
        const morningViewed = await hasViewedBookendToday(userId, 'morning');
        if (!morningViewed) {
          const msg = getMorningMessage(denialDay, streak);
          setMorningMessage(msg);
          setShowMorning(true);

          // Fetch last completed post-release protocol for morning reframe
          const protocol = await getLastCompletedProtocol(userId);
          if (protocol) {
            setLastProtocol(protocol);
          }
        }

        // Check if evening bookend should auto-show (after bed time)
        if (isAfterBedTime(cfg.bedTime)) {
          const eveningViewed = await hasViewedBookendToday(userId, 'evening');
          if (!eveningViewed) {
            const summary = await getDaySummary(userId);
            setDaySummary(summary);
            const msg = getEveningMessage(summary.tasksCompleted, summary.domainsTouched);
            setEveningMessage(msg);
            setShowEvening(true);
          }
        }
      } catch (err) {
        console.error('[Bookends] init error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [userId, denialDay, streak]);

  const dismissMorning = useCallback(async () => {
    setShowMorning(false);
    if (userId && morningMessage) {
      await recordBookendView(userId, 'morning', morningMessage).catch(() => {});
    }
    // Mark post-release morning reframe as shown
    if (userId && lastProtocol) {
      markMorningReframeShown(userId, lastProtocol.id).catch(() => {});
      setLastProtocol(null);
    }
  }, [userId, morningMessage, lastProtocol]);

  const dismissEvening = useCallback(async () => {
    setShowEvening(false);
    if (userId && eveningMessage) {
      await recordBookendView(userId, 'evening', eveningMessage).catch(() => {});
    }
  }, [userId, eveningMessage]);

  // Manual trigger for "End Day" button
  const triggerEvening = useCallback(() => {
    if (!userId || !config) return;

    (async () => {
      const summary = await getDaySummary(userId);
      setDaySummary(summary);
      const msg = getEveningMessage(summary.tasksCompleted, summary.domainsTouched);
      setEveningMessage(msg);
      setShowEvening(true);
    })().catch(() => {});
  }, [userId, config]);

  return {
    config,
    showMorningBookend: showMorning,
    showEveningBookend: showEvening,
    morningMessage,
    eveningMessage,
    daySummary,
    lastProtocol,
    dismissMorning,
    dismissEvening,
    triggerEvening,
    isLoading,
  };
}
