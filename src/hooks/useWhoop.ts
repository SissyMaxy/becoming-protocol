/**
 * useWhoop — Client-side hook for Whoop integration.
 * Handles connection status, sync, and data access.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface WhoopSnapshot {
  date: string;
  connected: boolean;
  reason?: string;
  recovery: {
    score: number;
    hrv: number;
    restingHR: number;
    spo2: number;
    skinTemp: number;
  } | null;
  sleep: {
    performance: number;
    consistency: number;
    efficiency: number;
    totalSleepHours: number;
    remHours: number;
    deepSleepHours: number;
    disturbances: number;
    respiratoryRate: number;
    sleepDebtMinutes: number;
  } | null;
  strain: {
    dayStrain: number;
    kilojoule: number;
    avgHR: number;
    maxHR: number;
  } | null;
  workouts: Array<{
    sport: string;
    strain: number;
    durationMinutes: number;
    avgHR: number;
    maxHR: number;
  }>;
  body: {
    weightKg: number;
  } | null;
}

interface UseWhoopReturn {
  isConnected: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  snapshot: WhoopSnapshot | null;
  lastSynced: Date | null;
  connect: () => void;
  disconnect: () => Promise<void>;
  sync: () => Promise<WhoopSnapshot | null>;
}

export function useWhoop(): UseWhoopReturn {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [snapshot, setSnapshot] = useState<WhoopSnapshot | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Check connection status on mount
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    async function checkConnection() {
      const { data } = await supabase
        .from('whoop_tokens')
        .select('connected_at, disconnected_at')
        .eq('user_id', user!.id)
        .is('disconnected_at', null)
        .maybeSingle();

      setIsConnected(!!data);
      setIsLoading(false);
    }

    checkConnection();
  }, [user?.id]);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const whoopStatus = params.get('whoop');
    if (whoopStatus === 'connected') {
      setIsConnected(true);
      setIsLoading(false);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      // Auto-sync immediately after connecting
      console.log('[useWhoop] Connected via OAuth, triggering initial sync');
    } else if (whoopStatus === 'error') {
      console.warn('[useWhoop] OAuth error:', params.get('reason'));
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const connect = useCallback(() => {
    if (!user?.id) return;
    window.location.href = `/api/whoop/auth?user_id=${user.id}`;
  }, [user?.id]);

  const disconnect = useCallback(async () => {
    if (!user?.id) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    await fetch('/api/whoop/disconnect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    setIsConnected(false);
    setSnapshot(null);
  }, [user?.id]);

  const syncAttempted = useRef(false);

  const sync = useCallback(async (): Promise<WhoopSnapshot | null> => {
    if (!user?.id) return null;

    setIsSyncing(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return null;

      const res = await fetch('/api/whoop/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.warn('[useWhoop] Sync returned', res.status, errBody);
        return null;
      }

      const data: WhoopSnapshot = await res.json();
      setSnapshot(data);
      setIsConnected(data.connected);
      setLastSynced(new Date());

      if (!data.connected) {
        setIsConnected(false);
      }

      return data;
    } catch (err) {
      console.error('[useWhoop] Sync failed:', err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [user?.id]);

  // Auto-sync on mount if connected (once only)
  useEffect(() => {
    if (isConnected && !snapshot && !isSyncing && !syncAttempted.current) {
      syncAttempted.current = true;
      sync();
    }
  }, [isConnected, snapshot, isSyncing, sync]);

  return {
    isConnected,
    isLoading,
    isSyncing,
    snapshot,
    lastSynced,
    connect,
    disconnect,
    sync,
  };
}
