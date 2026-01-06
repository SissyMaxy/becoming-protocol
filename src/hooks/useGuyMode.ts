// Guy Mode Hook
// State management for guy mode tracking and penalties

import { useState, useCallback, useEffect } from 'react';
import {
  logGuyModeEvent,
  getGuyModeStats,
  getCapabilities,
  updateCapabilityAtrophy,
  acknowledgeAtrophy,
  getGuyModePrompt,
  getDysphoriaAmplificationPrompt,
} from '../lib/guy-mode';
import type {
  GuyModeEventType,
  GuyModeStats,
  GuyModePenalty,
  MasculineCapability,
} from '../types/guy-mode';

interface UseGuyModeReturn {
  // Stats
  stats: GuyModeStats | null;
  capabilities: MasculineCapability[];
  isLoading: boolean;
  error: string | null;

  // Active prompts
  activePrompt: string | null;
  atrophyMilestones: { capability: string; message: string }[];

  // Last penalty
  lastPenalty: GuyModePenalty | null;

  // Actions
  logEvent: (
    eventType: GuyModeEventType,
    durationMinutes?: number,
    notes?: string
  ) => Promise<GuyModePenalty | undefined>;
  refreshStats: () => Promise<void>;
  acknowledgeCapabilityAtrophy: (capabilityName: string) => Promise<void>;
  dismissPrompt: () => void;
  dismissMilestones: () => void;
  dismissPenalty: () => void;

  // Quick logging helpers
  logCostumeModeEnter: () => Promise<void>;
  logCostumeModeExit: (durationMinutes: number) => Promise<void>;
  logMasculineClothing: (item: string) => Promise<void>;
  logDeadnameUsed: () => Promise<void>;
}

export function useGuyMode(): UseGuyModeReturn {
  const [stats, setStats] = useState<GuyModeStats | null>(null);
  const [capabilities, setCapabilities] = useState<MasculineCapability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [atrophyMilestones, setAtrophyMilestones] = useState<
    { capability: string; message: string }[]
  >([]);
  const [lastPenalty, setLastPenalty] = useState<GuyModePenalty | null>(null);

  // Load stats and capabilities
  const refreshStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsData, capsData, atrophyResult] = await Promise.all([
        getGuyModeStats(),
        getCapabilities(),
        updateCapabilityAtrophy(),
      ]);

      setStats(statsData);
      setCapabilities(capsData);

      // Set active prompt based on stats
      const prompt = getGuyModePrompt(statsData);
      if (prompt) {
        setActivePrompt(prompt);
      }

      // Set atrophy milestones
      if (atrophyResult.milestones.length > 0) {
        setAtrophyMilestones(atrophyResult.milestones);
      }
    } catch (err) {
      console.error('Failed to load guy mode stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Log event
  const logEvent = useCallback(
    async (
      eventType: GuyModeEventType,
      durationMinutes?: number,
      notes?: string
    ): Promise<GuyModePenalty | undefined> => {
      try {
        const result = await logGuyModeEvent(eventType, durationMinutes, notes);

        // Show dysphoria amplification prompt
        const dysphoriaPrompt = getDysphoriaAmplificationPrompt(eventType);
        setActivePrompt(dysphoriaPrompt);

        // Show penalty if triggered
        if (result.penalty) {
          setLastPenalty(result.penalty);
        }

        // Refresh stats
        await refreshStats();

        return result.penalty;
      } catch (err) {
        console.error('Failed to log guy mode event:', err);
        throw err;
      }
    },
    [refreshStats]
  );

  // Acknowledge capability atrophy
  const acknowledgeCapabilityAtrophy = useCallback(
    async (capabilityName: string) => {
      try {
        await acknowledgeAtrophy(capabilityName);
        setCapabilities(prev =>
          prev.map(c =>
            c.name === capabilityName ? { ...c, atrophyAcknowledged: true } : c
          )
        );
      } catch (err) {
        console.error('Failed to acknowledge atrophy:', err);
      }
    },
    []
  );

  // Dismiss actions
  const dismissPrompt = useCallback(() => setActivePrompt(null), []);
  const dismissMilestones = useCallback(() => setAtrophyMilestones([]), []);
  const dismissPenalty = useCallback(() => setLastPenalty(null), []);

  // Quick logging helpers
  const logCostumeModeEnter = useCallback(async () => {
    await logEvent('costume_mode_entered');
  }, [logEvent]);

  const logCostumeModeExit = useCallback(
    async (durationMinutes: number) => {
      await logEvent('costume_mode_exited', durationMinutes);
      await logEvent('guy_mode_hours', durationMinutes);
    },
    [logEvent]
  );

  const logMasculineClothing = useCallback(
    async (item: string) => {
      await logEvent('masculine_clothing_worn', undefined, item);
    },
    [logEvent]
  );

  const logDeadnameUsed = useCallback(async () => {
    await logEvent('deadname_used_by_self');
  }, [logEvent]);

  return {
    stats,
    capabilities,
    isLoading,
    error,
    activePrompt,
    atrophyMilestones,
    lastPenalty,
    logEvent,
    refreshStats,
    acknowledgeCapabilityAtrophy,
    dismissPrompt,
    dismissMilestones,
    dismissPenalty,
    logCostumeModeEnter,
    logCostumeModeExit,
    logMasculineClothing,
    logDeadnameUsed,
  };
}
