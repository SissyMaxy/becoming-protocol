// usePolling Hook
// Consolidated polling logic with exponential backoff and cleanup

import { useEffect, useRef, useCallback, useState } from 'react';

interface UsePollingOptions {
  /** Polling interval in milliseconds */
  interval: number;
  /** Whether polling is enabled */
  enabled?: boolean;
  /** Use exponential backoff on errors */
  useBackoff?: boolean;
  /** Maximum backoff interval in milliseconds */
  maxBackoffInterval?: number;
  /** Reset backoff on successful poll */
  resetBackoffOnSuccess?: boolean;
  /** Callback when polling starts */
  onStart?: () => void;
  /** Callback when polling stops */
  onStop?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

interface UsePollingReturn {
  /** Whether polling is currently active */
  isPolling: boolean;
  /** Current error state */
  error: Error | null;
  /** Number of consecutive failures */
  failureCount: number;
  /** Manually trigger a poll */
  pollNow: () => Promise<void>;
  /** Start polling */
  start: () => void;
  /** Stop polling */
  stop: () => void;
  /** Reset error state and backoff */
  reset: () => void;
}

export function usePolling<T>(
  pollFn: () => Promise<T>,
  options: UsePollingOptions
): UsePollingReturn {
  const {
    interval,
    enabled = true,
    useBackoff = true,
    maxBackoffInterval = 60000, // 1 minute max
    resetBackoffOnSuccess = true,
    onStart,
    onStop,
    onError,
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [failureCount, setFailureCount] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef(interval);
  const mountedRef = useRef(true);
  const pollFnRef = useRef(pollFn);
  // Tracks whether the poller is actively running. Read synchronously inside
  // scheduleNext so the reschedule decision can't see a stale `isPolling`
  // value captured at the time `start` was created (the setState is async).
  const isPollingRef = useRef(false);

  // Keep pollFn ref updated
  pollFnRef.current = pollFn;

  // Calculate backoff interval
  const getBackoffInterval = useCallback(() => {
    if (!useBackoff || failureCount === 0) {
      return interval;
    }
    // Exponential backoff: interval * 2^failureCount, capped at max
    const backoff = Math.min(
      interval * Math.pow(2, failureCount),
      maxBackoffInterval
    );
    return backoff;
  }, [interval, failureCount, useBackoff, maxBackoffInterval]);

  // Execute single poll
  const executePoll = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      await pollFnRef.current();

      if (mountedRef.current) {
        setError(null);
        if (resetBackoffOnSuccess) {
          setFailureCount(0);
          backoffRef.current = interval;
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setFailureCount(prev => prev + 1);
        onError?.(error);
      }
    }
  }, [interval, resetBackoffOnSuccess, onError]);

  // Start polling
  const start = useCallback(() => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }

    isPollingRef.current = true;
    setIsPolling(true);
    onStart?.();

    const scheduleNext = () => {
      const nextInterval = getBackoffInterval();
      intervalRef.current = setTimeout(async () => {
        await executePoll();
        // Read the ref (not the captured `isPolling` state) so a `stop()`
        // that fired after this tick was scheduled correctly halts the loop,
        // and a still-running poller keeps going instead of double-firing once
        // then dying on a stale `false`.
        if (mountedRef.current && isPollingRef.current) {
          scheduleNext();
        }
      }, nextInterval);
    };

    // Execute immediately, then schedule
    executePoll().then(() => {
      if (mountedRef.current && isPollingRef.current) {
        scheduleNext();
      }
    });
  }, [executePoll, getBackoffInterval, onStart]);

  // Stop polling
  const stop = useCallback(() => {
    isPollingRef.current = false;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
    onStop?.();
  }, [onStop]);

  // Manual poll trigger
  const pollNow = useCallback(async () => {
    await executePoll();
  }, [executePoll]);

  // Reset state
  const reset = useCallback(() => {
    setError(null);
    setFailureCount(0);
    backoffRef.current = interval;
  }, [interval]);

  // Handle enabled state changes
  useEffect(() => {
    if (enabled && !isPolling) {
      start();
    } else if (!enabled && isPolling) {
      stop();
    }
  }, [enabled, isPolling, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      isPollingRef.current = false;
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    isPolling,
    error,
    failureCount,
    pollNow,
    start,
    stop,
    reset,
  };
}

// Simplified polling hook for common use cases
export function useSimplePolling(
  pollFn: () => Promise<void>,
  intervalMs: number,
  enabled = true
) {
  return usePolling(pollFn, {
    interval: intervalMs,
    enabled,
    useBackoff: true,
    maxBackoffInterval: 30000,
  });
}
