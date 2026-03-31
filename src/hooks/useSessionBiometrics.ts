/**
 * useSessionBiometrics — Polls Whoop session biometrics every 45s during active sessions.
 * Does NOT auto-start. Call startPolling(sessionId) to begin, stopPolling() to end and get summary.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const POLL_INTERVAL_MS = 45000;
const STALE_THRESHOLD = 3;

interface BiometricSnapshot {
  strain_current: number;
  strain_delta: number;
  avg_heart_rate: number;
  max_heart_rate: number;
  kilojoules: number;
  timestamp: string;
  stale: boolean;
}

interface SessionBiometricsSummary {
  total_strain_delta: number;
  peak_heart_rate: number;
  avg_heart_rate: number;
  snapshots_count: number;
  duration_seconds: number;
}

interface UseSessionBiometricsReturn {
  latest: BiometricSnapshot | null;
  history: BiometricSnapshot[];
  trend: 'rising' | 'stable' | 'falling' | null;
  isPolling: boolean;
  error: string | null;
  startPolling: (sessionId: string) => void;
  stopPolling: () => SessionBiometricsSummary | null;
}

function computeTrend(
  history: BiometricSnapshot[]
): 'rising' | 'stable' | 'falling' | null {
  if (history.length < 3) return null;

  const recent = history.slice(-3);
  const [a, b, c] = recent.map((s) => s.avg_heart_rate);

  if (c > b && b > a) return 'rising';
  if (c < b && b < a) return 'falling';
  return 'stable';
}

function buildSummary(history: BiometricSnapshot[]): SessionBiometricsSummary | null {
  if (history.length === 0) return null;

  const totalStrainDelta = history.reduce((sum, s) => sum + s.strain_delta, 0);
  const peakHR = Math.max(...history.map((s) => s.max_heart_rate));
  const avgHR =
    history.reduce((sum, s) => sum + s.avg_heart_rate, 0) / history.length;

  const first = new Date(history[0].timestamp).getTime();
  const last = new Date(history[history.length - 1].timestamp).getTime();
  const durationSeconds = Math.round((last - first) / 1000);

  return {
    total_strain_delta: totalStrainDelta,
    peak_heart_rate: peakHR,
    avg_heart_rate: Math.round(avgHR),
    snapshots_count: history.length,
    duration_seconds: durationSeconds,
  };
}

export function useSessionBiometrics(): UseSessionBiometricsReturn {
  const [latest, setLatest] = useState<BiometricSnapshot | null>(null);
  const [history, setHistory] = useState<BiometricSnapshot[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const historyRef = useRef<BiometricSnapshot[]>([]);
  const mountedRef = useRef(true);

  // Keep historyRef in sync
  historyRef.current = history;

  const poll = useCallback(async () => {
    if (!mountedRef.current || !sessionIdRef.current) return;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setError('No auth session');
        return;
      }

      const res = await fetch('/api/whoop/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'session-poll', session_id: sessionIdRef.current }),
      });

      if (!res.ok) {
        throw new Error(`Poll returned ${res.status}`);
      }

      const snapshot: BiometricSnapshot = await res.json();

      if (!mountedRef.current) return;

      consecutiveFailuresRef.current = 0;
      snapshot.stale = false;
      setError(null);
      setLatest(snapshot);
      setHistory((prev) => [...prev, snapshot]);
    } catch (err) {
      if (!mountedRef.current) return;

      consecutiveFailuresRef.current += 1;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);

      if (consecutiveFailuresRef.current >= STALE_THRESHOLD) {
        setLatest((prev) =>
          prev ? { ...prev, stale: true } : prev
        );
      }
    }
  }, []);

  const startPolling = useCallback(
    (sessionId: string) => {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Reset state
      sessionIdRef.current = sessionId;
      consecutiveFailuresRef.current = 0;
      setLatest(null);
      setHistory([]);
      setError(null);
      setIsPolling(true);

      // Poll immediately, then on interval
      poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    },
    [poll]
  );

  const stopPolling = useCallback((): SessionBiometricsSummary | null => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    sessionIdRef.current = null;
    setIsPolling(false);

    return buildSummary(historyRef.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const trend = computeTrend(history);

  return {
    latest,
    history,
    trend,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
}
