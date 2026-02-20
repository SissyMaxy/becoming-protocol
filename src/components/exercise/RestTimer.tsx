/**
 * Rest Timer — auto-start countdown between sets.
 * Shows circular countdown, "Skip" button, next exercise preview.
 */

import { useEffect, useState, useRef } from 'react';
import { Timer, SkipForward } from 'lucide-react';

interface RestTimerProps {
  seconds: number;
  onComplete: () => void;
  nextExerciseName?: string;
}

export function RestTimer({ seconds, onComplete, nextExerciseName }: RestTimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemaining(seconds);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [seconds, onComplete]);

  const progress = seconds > 0 ? (seconds - remaining) / seconds : 1;
  const circumference = 2 * Math.PI * 50;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Circular countdown */}
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r="50"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-white/10"
          />
          <circle
            cx="60" cy="60" r="50"
            fill="none"
            stroke="url(#restGradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
          />
          <defs>
            <linearGradient id="restGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white">{remaining}</span>
          <span className="text-xs text-white/50">seconds</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-white/60">
        <Timer className="w-4 h-4" />
        <span className="text-sm">Rest</span>
      </div>

      {nextExerciseName && (
        <p className="text-sm text-white/40">
          Next: <span className="text-white/70">{nextExerciseName}</span>
        </p>
      )}

      <button
        onClick={() => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onComplete();
        }}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors text-sm"
      >
        <SkipForward className="w-4 h-4" />
        Skip Rest
      </button>
    </div>
  );
}
