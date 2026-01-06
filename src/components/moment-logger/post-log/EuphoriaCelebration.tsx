// Euphoria Celebration - Brief celebratory screen
// Auto-dismisses after ~2 seconds

import { useEffect, useState } from 'react';
import { Sparkles, Heart } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { MomentIntensity } from '../../../types/moment-logger';

interface EuphoriaCelebrationProps {
  intensity: MomentIntensity;
  onComplete: () => void;
}

const CELEBRATION_MESSAGES = [
  "That's evidence. She's here.",
  "Captured. This moment matters.",
  "Logged and remembered.",
  "Another proof point.",
  "Building your truth.",
];

export function EuphoriaCelebration({
  intensity,
  onComplete,
}: EuphoriaCelebrationProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [animationPhase, setAnimationPhase] = useState(0);
  const [message] = useState(() =>
    CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)]
  );

  useEffect(() => {
    // Trigger hearts in Bambi mode
    if (isBambiMode) {
      triggerHearts();
    }

    // Animation phases
    const timers = [
      setTimeout(() => setAnimationPhase(1), 100),
      setTimeout(() => setAnimationPhase(2), 400),
      setTimeout(() => onComplete(), 2000),
    ];

    return () => timers.forEach(clearTimeout);
  }, [isBambiMode, triggerHearts, onComplete]);

  // Scale sparkles based on intensity
  const sparkleCount = intensity + 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onComplete}
    >
      <div
        className={`w-full max-w-xs p-8 rounded-2xl text-center transition-all duration-500 ${
          animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        } ${
          isBambiMode
            ? 'bg-gradient-to-br from-pink-500 to-fuchsia-600'
            : 'bg-gradient-to-br from-emerald-600 to-teal-600'
        }`}
      >
        {/* Sparkles */}
        <div className="flex justify-center gap-1 mb-4">
          {Array.from({ length: sparkleCount }).map((_, i) => (
            <Sparkles
              key={i}
              className={`w-6 h-6 text-white transition-all duration-300 ${
                animationPhase >= 2
                  ? 'opacity-100 scale-100'
                  : 'opacity-0 scale-50'
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            />
          ))}
        </div>

        {/* Title */}
        <h2
          className={`text-2xl font-bold text-white mb-2 transition-all duration-300 ${
            animationPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          ✨ Logged!
        </h2>

        {/* Message */}
        <p
          className={`text-white/90 text-sm transition-all duration-300 ${
            animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {message}
        </p>

        {/* Heart icon */}
        <div
          className={`mt-4 transition-all duration-500 ${
            animationPhase >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          }`}
        >
          <Heart className="w-8 h-8 text-white/80 mx-auto fill-current" />
        </div>
      </div>
    </div>
  );
}
