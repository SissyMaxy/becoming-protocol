/**
 * Completion Celebration
 * Enhanced celebration modal for task completion
 */

import { useEffect, useState } from 'react';
import { Sparkles, Heart } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface CompletionCelebrationProps {
  affirmation: string;
  pointsEarned: number;
  onDismiss: () => void;
}

export function CompletionCelebration({
  affirmation,
  pointsEarned,
  onDismiss,
}: CompletionCelebrationProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    // Trigger hearts in Bambi mode
    if (isBambiMode) {
      triggerHearts?.();
    }

    // Animation phases
    const enterTimer = setTimeout(() => setPhase('show'), 50);
    const exitTimer = setTimeout(() => setPhase('exit'), 2500);
    const dismissTimer = setTimeout(onDismiss, 2800);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss, isBambiMode, triggerHearts]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'
        } ${isBambiMode ? 'bg-pink-900/40' : 'bg-black/40'} backdrop-blur-sm`}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className={`absolute transition-all duration-1000 ${
              phase === 'show' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              left: `${10 + Math.random() * 80}%`,
              top: `${20 + Math.random() * 60}%`,
              transform: phase === 'show'
                ? `translateY(${-20 - Math.random() * 40}px) scale(${0.5 + Math.random() * 0.5})`
                : 'translateY(0) scale(0)',
              transitionDelay: `${Math.random() * 500}ms`,
            }}
          >
            {i % 3 === 0 ? (
              <Sparkles className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-300' : 'text-emerald-300'
              }`} />
            ) : i % 3 === 1 ? (
              <Heart className={`w-3 h-3 ${
                isBambiMode ? 'text-pink-400' : 'text-rose-400'
              }`} />
            ) : (
              <span className="text-lg">✨</span>
            )}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div
        className={`relative transition-all duration-500 ${
          phase === 'enter'
            ? 'opacity-0 scale-75 translate-y-8'
            : phase === 'exit'
            ? 'opacity-0 scale-110 -translate-y-8'
            : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        <div
          className={`px-10 py-8 rounded-3xl text-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-100 via-fuchsia-100 to-purple-100 shadow-2xl shadow-pink-500/30'
              : 'bg-gradient-to-br from-emerald-900/95 via-teal-900/95 to-cyan-900/95 shadow-2xl shadow-emerald-500/30'
          }`}
        >
          {/* Sparkle icon */}
          <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-400 to-fuchsia-500'
              : 'bg-gradient-to-br from-emerald-400 to-teal-500'
          }`}>
            <Sparkles className="w-7 h-7 text-white" />
          </div>

          {/* Affirmation */}
          <p
            className={`text-xl font-bold max-w-xs ${
              isBambiMode ? 'text-pink-700' : 'text-white'
            }`}
          >
            {affirmation}
          </p>

          {/* Points */}
          <div
            className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full ${
              isBambiMode ? 'bg-pink-200/60' : 'bg-white/10'
            }`}
          >
            <span className="text-xl">✨</span>
            <span
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-600' : 'text-emerald-300'
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
