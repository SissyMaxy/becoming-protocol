// useTimer Hook
// Safe timer management with proper cleanup to prevent memory leaks

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseTimeoutOptions {
  /** Whether the timeout should start automatically */
  autoStart?: boolean;
}

interface UseTimeoutReturn {
  /** Start or restart the timeout */
  start: () => void;
  /** Stop/clear the timeout */
  stop: () => void;
  /** Reset and restart the timeout */
  reset: () => void;
  /** Whether the timeout is currently active */
  isActive: boolean;
}

/**
 * Safe setTimeout hook with cleanup
 */
export function useTimeout(
  callback: () => void,
  delay: number | null,
  options: UseTimeoutOptions = {}
): UseTimeoutReturn {
  const { autoStart = true } = options;

  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  callbackRef.current = callback;

  // Clear timeout helper
  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Start timeout
  const start = useCallback(() => {
    clear(); // Always clear before starting

    if (delay === null) return;

    setIsActive(true);
    timeoutRef.current = setTimeout(() => {
      setIsActive(false);
      timeoutRef.current = null;
      callbackRef.current();
    }, delay);
  }, [delay, clear]);

  // Stop timeout
  const stop = useCallback(() => {
    clear();
  }, [clear]);

  // Reset timeout (clear and restart)
  const reset = useCallback(() => {
    start();
  }, [start]);

  // Auto-start on mount or delay change
  useEffect(() => {
    if (autoStart && delay !== null) {
      start();
    }
    return clear;
  }, [delay, autoStart, start, clear]);

  // Cleanup on unmount
  useEffect(() => {
    return clear;
  }, [clear]);

  return { start, stop, reset, isActive };
}

interface UseIntervalOptions {
  /** Whether the interval should start automatically */
  autoStart?: boolean;
  /** Execute callback immediately on start */
  immediate?: boolean;
}

interface UseIntervalReturn {
  /** Start the interval */
  start: () => void;
  /** Stop the interval */
  stop: () => void;
  /** Whether the interval is currently active */
  isActive: boolean;
  /** Number of times the callback has been called */
  count: number;
}

/**
 * Safe setInterval hook with cleanup
 */
export function useInterval(
  callback: () => void,
  delay: number | null,
  options: UseIntervalOptions = {}
): UseIntervalReturn {
  const { autoStart = true, immediate = false } = options;

  const [isActive, setIsActive] = useState(false);
  const [count, setCount] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  callbackRef.current = callback;

  // Clear interval helper
  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Start interval
  const start = useCallback(() => {
    clear(); // Always clear before starting

    if (delay === null) return;

    setIsActive(true);
    setCount(0);

    // Execute immediately if requested
    if (immediate) {
      callbackRef.current();
      setCount(1);
    }

    intervalRef.current = setInterval(() => {
      setCount(prev => prev + 1);
      callbackRef.current();
    }, delay);
  }, [delay, immediate, clear]);

  // Stop interval
  const stop = useCallback(() => {
    clear();
  }, [clear]);

  // Auto-start on mount or delay change
  useEffect(() => {
    if (autoStart && delay !== null) {
      start();
    }
    return clear;
  }, [delay, autoStart, start, clear]);

  // Cleanup on unmount
  useEffect(() => {
    return clear;
  }, [clear]);

  return { start, stop, isActive, count };
}

/**
 * Debounced callback hook
 */
export function useDebounce<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  callbackRef.current = callback;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args: unknown[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        timeoutRef.current = null;
      }, delay);
    }) as T,
    [delay]
  );
}

/**
 * Throttled callback hook
 */
export function useThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef(0);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  callbackRef.current = callback;

  return useCallback(
    ((...args: unknown[]) => {
      const now = Date.now();
      if (now - lastCallRef.current >= delay) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      }
    }) as T,
    [delay]
  );
}

/**
 * Countdown timer hook
 */
export function useCountdown(
  initialSeconds: number,
  options: { autoStart?: boolean; onComplete?: () => void } = {}
): {
  seconds: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
} {
  const { autoStart = false, onComplete } = options;

  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);

  onCompleteRef.current = onComplete;

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clear();
    setIsRunning(true);

    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clear();
          setIsRunning(false);
          onCompleteRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clear]);

  const stop = useCallback(() => {
    clear();
    setIsRunning(false);
  }, [clear]);

  const reset = useCallback(() => {
    clear();
    setSeconds(initialSeconds);
    setIsRunning(false);
  }, [initialSeconds, clear]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
    return clear;
  }, [autoStart, start, clear]);

  return { seconds, isRunning, start, stop, reset };
}
