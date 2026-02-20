/**
 * useSessionTimer — Simple elapsed timer for edge sessions.
 * Counts seconds while running, provides formatted MM:SS output.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSessionTimerReturn {
  elapsedSec: number;
  formatted: string;
  reset: () => void;
}

function formatTime(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function useSessionTimer(isRunning: boolean): UseSessionTimerReturn {
  const [elapsedSec, setElapsedSec] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedSec(accumulatedRef.current + elapsed);
        }
      }, 1000);
    } else {
      // Accumulate elapsed time when pausing
      if (startTimeRef.current !== null) {
        accumulatedRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
        startTimeRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  const reset = useCallback(() => {
    setElapsedSec(0);
    accumulatedRef.current = 0;
    startTimeRef.current = isRunning ? Date.now() : null;
  }, [isRunning]);

  return {
    elapsedSec,
    formatted: formatTime(elapsedSec),
    reset,
  };
}
