/**
 * Content Pipeline Hook
 *
 * Wraps pipeline lib functions with React state management.
 * Parallel loading via Promise.allSettled.
 * David's only actions: approve / reject.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getPendingVaultItems,
  getVaultStats,
  approveVaultItem,
  rejectVaultItem,
  planDistribution,
  getTodaySchedule,
  getActiveArc,
  getRevenueSummary,
  getPendingPostPacks,
  markManuallyPosted,
} from '../lib/content-pipeline';
import { supabase } from '../lib/supabase';
import type {
  VaultItem,
  VaultStats,
  Distribution,
  NarrativeArc,
  RevenueSummary,
  StandingPermission,
} from '../types/content-pipeline';

export interface UseContentPipelineReturn {
  pendingItems: VaultItem[];
  vaultStats: VaultStats | null;
  todaySchedule: Distribution[];
  pendingPostPacks: Distribution[];
  activeArc: NarrativeArc | null;
  revenueSummary: RevenueSummary | null;
  permissions: StandingPermission[];
  isLoading: boolean;

  approveItem: (vaultId: string) => Promise<void>;
  rejectItem: (vaultId: string) => Promise<void>;
  markPosted: (distributionId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useContentPipeline(): UseContentPipelineReturn {
  const { user } = useAuth();
  const userId = user?.id;

  const [pendingItems, setPendingItems] = useState<VaultItem[]>([]);
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<Distribution[]>([]);
  const [pendingPostPacks, setPendingPostPacks] = useState<Distribution[]>([]);
  const [activeArc, setActiveArc] = useState<NarrativeArc | null>(null);
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary | null>(null);
  const [permissions, setPermissions] = useState<StandingPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);

    try {
      const results = await Promise.allSettled([
        getPendingVaultItems(userId),
        getVaultStats(userId),
        getTodaySchedule(userId),
        getActiveArc(userId),
        getRevenueSummary(userId),
        supabase
          .from('content_permissions')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .then(({ data }) => (data || []) as StandingPermission[]),
        getPendingPostPacks(userId),
      ]);

      if (results[0].status === 'fulfilled') setPendingItems(results[0].value);
      if (results[1].status === 'fulfilled') setVaultStats(results[1].value);
      if (results[2].status === 'fulfilled') setTodaySchedule(results[2].value);
      if (results[3].status === 'fulfilled') setActiveArc(results[3].value);
      if (results[4].status === 'fulfilled') setRevenueSummary(results[4].value);
      if (results[5].status === 'fulfilled') setPermissions(results[5].value);
      if (results[6].status === 'fulfilled') setPendingPostPacks(results[6].value);
    } catch (err) {
      console.error('[useContentPipeline] Refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const approveItem = useCallback(async (vaultId: string) => {
    if (!userId) return;

    const success = await approveVaultItem(userId, vaultId);
    if (success) {
      // Remove from pending list optimistically
      setPendingItems(prev => prev.filter(item => item.id !== vaultId));

      // Trigger distribution planning in background
      planDistribution(userId, vaultId).catch(err =>
        console.warn('[useContentPipeline] Distribution planning failed:', err)
      );
    }
  }, [userId]);

  const rejectItem = useCallback(async (vaultId: string) => {
    if (!userId) return;

    const success = await rejectVaultItem(userId, vaultId);
    if (success) {
      setPendingItems(prev => prev.filter(item => item.id !== vaultId));
    }
  }, [userId]);

  const markPosted = useCallback(async (distributionId: string): Promise<boolean> => {
    const success = await markManuallyPosted(distributionId);
    if (success) {
      setPendingPostPacks(prev => prev.filter(d => d.id !== distributionId));
    }
    return success;
  }, []);

  return {
    pendingItems,
    vaultStats,
    todaySchedule,
    pendingPostPacks,
    activeArc,
    revenueSummary,
    permissions,
    isLoading,
    approveItem,
    rejectItem,
    markPosted,
    refresh,
  };
}
