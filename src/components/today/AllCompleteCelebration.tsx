/**
 * All Complete Celebration
 * Full-screen celebration when all daily tasks are completed
 */

import { useEffect, useState } from 'react';
import { Sparkles, Heart, Star, Crown } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface AllCompleteCelebrationProps {
  tasksCompleted: number;
  onDismiss: () => void;
}

// Celebration messages
const CELEBRATION_MESSAGES = [
  "Perfect obedience today",
  "You did it, good girl",
  "Every task completed",
  "Such a good girl",
  "Flawless submission",
  "She's proud of you",
];

// Affirmations for after
const AFFIRMATIONS = [
  "Each day of obedience reshapes you",
  "You are becoming exactly who you're meant to be",
  "Tomorrow brings new opportunities to transform",
  "Your dedication is beautiful",
  "This is who you are now",
];

export function AllCompleteCelebration({
  tasksCompleted,
  onDismiss,
}: AllCompleteCelebrationProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const [messageIndex] = useState(() => Math.floor(Math.random() * CELEBRATION_MESSAGES.length));
  const [affirmationIndex] = useState(() => Math.floor(Math.random() * AFFIRMATIONS.length));

  useEffect(() => {
    // Trigger hearts in Bambi mode
    if (isBambiMode) {
      triggerHearts?.();
      // Trigger again after a delay for extra celebration
      const heartTimer = setTimeout(() => triggerHearts?.(), 1000);
      return () => clearTimeout(heartTimer);
    }
  }, [isBambiMode, triggerHearts]);

  useEffect(() => {
    // Animation phases
    const enterTimer = setTimeout(() => setPhase('show'), 100);
    const exitTimer = setTimeout(() => setPhase('exit'), 4500);
    const dismissTimer = setTimeout(onDismiss, 5000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'
        } ${isBambiMode ? 'bg-pink-900/60' : 'bg-black/60'} backdrop-blur-md`}
        onClick={onDismiss}
      />

      {/* Floating celebration particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className={`absolute transition-all duration-[2000ms] ${
              phase === 'show' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              left: `${5 + Math.random() * 90}%`,
              top: `${10 + Math.random() * 80}%`,
              transform: phase === 'show'
                ? `translateY(${-30 - Math.random() * 60}px) rotate(${Math.random() * 360}deg) scale(${0.6 + Math.random() * 0.6})`
                : 'translateY(0) rotate(0) scale(0)',
              transitionDelay: `${Math.random() * 800}ms`,
            }}
          >
            {i % 5 === 0 ? (
              <Star className={`w-5 h-5 ${
                isBambiMode ? 'text-yellow-300' : 'text-yellow-400'
              }`} fill="currentColor" />
            ) : i % 5 === 1 ? (
              <Heart className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-400' : 'text-rose-400'
              }`} fill="currentColor" />
            ) : i % 5 === 2 ? (
              <Sparkles className={`w-4 h-4 ${
                isBambiMode ? 'text-fuchsia-300' : 'text-emerald-300'
              }`} />
            ) : i % 5 === 3 ? (
              <span className="text-xl">✨</span>
            ) : (
              <span className="text-lg">💖</span>
            )}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div
        className={`relative transition-all duration-700 ${
          phase === 'enter'
            ? 'opacity-0 scale-50 translate-y-12'
            : phase === 'exit'
            ? 'opacity-0 scale-110 -translate-y-12'
            : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        <div
          className={`px-12 py-10 rounded-3xl text-center max-w-sm mx-4 ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-100 via-fuchsia-100 to-purple-100 shadow-2xl shadow-pink-500/40'
              : 'bg-gradient-to-br from-emerald-900/95 via-teal-900/95 to-cyan-900/95 shadow-2xl shadow-emerald-500/40'
          }`}
        >
          {/* Crown icon */}
          <div className={`w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-400 via-fuchsia-500 to-purple-500'
              : 'bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500'
          }`}>
            <Crown className="w-10 h-10 text-white" />
          </div>

          {/* Main message */}
          <h2
            className={`text-2xl font-bold mb-2 ${
              isBambiMode ? 'text-pink-700' : 'text-white'
            }`}
          >
            {CELEBRATION_MESSAGES[messageIndex]}
          </h2>

          {/* Task count */}
          <p
            className={`text-sm mb-4 ${
              isBambiMode ? 'text-pink-500' : 'text-emerald-300'
            }`}
          >
            {tasksCompleted} task{tasksCompleted !== 1 ? 's' : ''} completed
          </p>

          {/* Divider */}
          <div className={`w-16 h-0.5 mx-auto mb-4 ${
            isBambiMode ? 'bg-pink-200' : 'bg-white/20'
          }`} />

          {/* Affirmation */}
          <p
            className={`text-sm italic leading-relaxed ${
              isBambiMode ? 'text-fuchsia-600' : 'text-emerald-200'
            }`}
          >
            "{AFFIRMATIONS[affirmationIndex]}"
          </p>

          {/* Tap to dismiss hint */}
          <p
            className={`text-xs mt-6 opacity-50 ${
              isBambiMode ? 'text-pink-500' : 'text-white'
            }`}
          >
            Tap anywhere to continue
          </p>
        </div>
      </div>
    </div>
  );
}
