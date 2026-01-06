// Task Completion Celebration
// Brief celebration modal after completing a task

import { useEffect, useState } from 'react';
import { useBambiMode } from '../../context/BambiModeContext';

interface TaskCompletionCelebrationProps {
  affirmation: string;
  pointsEarned: number;
  onDismiss: () => void;
}

export function TaskCompletionCelebration({
  affirmation,
  pointsEarned,
  onDismiss,
}: TaskCompletionCelebrationProps) {
  const { isBambiMode } = useBambiMode();
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setPhase('show'), 50);
    // Start exit after 2s
    const exitTimer = setTimeout(() => setPhase('exit'), 2000);
    // Dismiss after exit animation
    const dismissTimer = setTimeout(onDismiss, 2300);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'
        } bg-black/30`}
      />

      {/* Content */}
      <div
        className={`relative transition-all duration-300 ${
          phase === 'enter'
            ? 'opacity-0 scale-90 translate-y-4'
            : phase === 'exit'
            ? 'opacity-0 scale-110 -translate-y-4'
            : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        <div
          className={`px-8 py-6 rounded-2xl text-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-100 to-fuchsia-100 shadow-xl shadow-pink-500/20'
              : 'bg-gradient-to-br from-emerald-900/90 to-teal-900/90 shadow-xl shadow-emerald-500/20'
          }`}
        >
          {/* Affirmation */}
          <p
            className={`text-xl font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-emerald-300'
            }`}
          >
            {affirmation}
          </p>

          {/* Points */}
          <div
            className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${
              isBambiMode ? 'bg-pink-200/50' : 'bg-emerald-800/50'
            }`}
          >
            <span className="text-lg">✨</span>
            <span
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-600' : 'text-emerald-400'
              }`}
            >
              +{pointsEarned} points
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
