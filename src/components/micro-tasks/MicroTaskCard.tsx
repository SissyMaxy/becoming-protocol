/**
 * MicroTaskCard — slide-in interactive card for identity-reinforcing micro-tasks.
 * Appears from the bottom, shows instruction + countdown, with Done/Skip actions.
 */

import { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { ScheduledMicro } from '../../types/micro-tasks';

interface MicroTaskCardProps {
  micro: ScheduledMicro;
  onComplete: () => void;
  onSkip: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  posture: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  scent: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  voice: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  awareness: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  gait: 'bg-green-500/20 text-green-400 border-green-500/30',
  anchor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

export function MicroTaskCard({ micro, onComplete, onSkip }: MicroTaskCardProps) {
  const [countdown, setCountdown] = useState(micro.task.durationSeconds);
  const [started, setStarted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleStart = () => {
    setStarted(true);
    setCountdown(micro.task.durationSeconds);
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const typeColor = TYPE_COLORS[micro.task.type] || 'bg-white/10 text-white/60 border-white/20';
  const progressPct = started
    ? ((micro.task.durationSeconds - countdown) / micro.task.durationSeconds) * 100
    : 0;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[90] animate-slide-up">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden max-w-lg mx-auto">
        {/* Progress bar */}
        {started && (
          <div className="h-1 bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        <div className="p-4">
          {/* Type badge + points */}
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>
              {micro.task.type}
            </span>
            <span className="text-xs text-white/30">+{micro.task.points} pts</span>
          </div>

          {/* Instruction */}
          <p className="text-white text-sm font-medium leading-relaxed mb-4">
            {micro.task.instruction}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!started ? (
              <button
                onClick={handleStart}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:from-purple-400 hover:to-pink-400 transition-colors"
              >
                Start ({micro.task.durationSeconds}s)
              </button>
            ) : countdown > 0 ? (
              <div className="flex-1 py-2.5 rounded-xl bg-white/5 text-center">
                <span className="text-white font-mono text-lg">{countdown}s</span>
              </div>
            ) : (
              <button
                onClick={onComplete}
                className="flex-1 py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-green-500/30 transition-colors"
              >
                <Check className="w-4 h-4" />
                Done
              </button>
            )}

            <button
              onClick={onSkip}
              className="p-2.5 rounded-xl bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
              title="Skip"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
