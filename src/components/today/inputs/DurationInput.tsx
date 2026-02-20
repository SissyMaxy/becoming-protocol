import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Check, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData } from '../../../types/task-bank';

interface DurationInputProps {
  targetMinutes?: number;
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

export function DurationInput({ targetMinutes, intensity, isCompleting, onComplete, getGradient }: DurationInputProps) {
  const { isBambiMode } = useBambiMode();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const targetSeconds = (targetMinutes || 5) * 60;

  const tick = useCallback(() => {
    setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
  }, []);

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now() - elapsed * 1000;
      intervalRef.current = setInterval(tick, 250);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, tick, elapsed]);

  // Auto-complete when target reached
  useEffect(() => {
    if (running && elapsed >= targetSeconds) {
      handleFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, targetSeconds, running]);

  const handleStart = () => {
    setRunning(true);
  };

  const handleFinish = () => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    onComplete({
      completion_type: 'duration',
      actual_duration_seconds: elapsed,
    });
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = Math.min(100, (elapsed / targetSeconds) * 100);

  if (!running && elapsed === 0) {
    return (
      <button
        onClick={handleStart}
        className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${
          getGradient(intensity, isBambiMode)
        } hover:opacity-90`}
      >
        <span className="flex items-center justify-center gap-2">
          <Play className="w-5 h-5" />
          <span>Start Timer</span>
          <span className="text-white/70 text-sm">({targetMinutes || 5}m)</span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex-1 space-y-2">
      {/* Timer display */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-mono font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {fmt(elapsed)}
          </span>
          <span className={`text-sm ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            / {fmt(targetSeconds)}
          </span>
        </div>
        {running && (
          <span className={`w-2 h-2 rounded-full animate-pulse ${
            isBambiMode ? 'bg-pink-500' : 'bg-emerald-500'
          }`} />
        )}
      </div>

      {/* Progress bar */}
      <div className={`h-1.5 rounded-full overflow-hidden ${
        isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
      }`}>
        <div
          className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
            getGradient(intensity, isBambiMode)
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {running ? (
          <button
            onClick={handleFinish}
            disabled={isCompleting}
            className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${
              getGradient(intensity, isBambiMode)
            } hover:opacity-90`}
          >
            {isCompleting ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Square className="w-4 h-4" />
                <span>Done Early</span>
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={isCompleting}
            className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${
              getGradient(intensity, isBambiMode)
            } hover:opacity-90`}
          >
            {isCompleting ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                <span>Complete</span>
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
