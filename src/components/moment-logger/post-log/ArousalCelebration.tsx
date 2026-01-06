// Arousal Celebration - Brief acknowledgment after logging arousal
// Auto-dismisses after 2 seconds

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { MomentIntensity } from '../../../types/moment-logger';

interface ArousalCelebrationProps {
  intensity: MomentIntensity;
  onComplete: () => void;
}

const MESSAGES: Record<MomentIntensity, string> = {
  1: 'A little spark noted',
  2: 'Feeling the warmth',
  3: 'Burning bright',
  4: 'On fire!',
};

export function ArousalCelebration({
  intensity,
  onComplete,
}: ArousalCelebrationProps) {
  const { isBambiMode } = useBambiMode();
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setPhase('show'), 100);
    // Start exit after 1.5s
    const exitTimer = setTimeout(() => setPhase('exit'), 1500);
    // Complete after exit animation
    const completeTimer = setTimeout(onComplete, 2000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className={`flex flex-col items-center gap-4 p-8 rounded-2xl transition-all duration-300 ${
          phase === 'enter'
            ? 'opacity-0 scale-90'
            : phase === 'exit'
            ? 'opacity-0 scale-110'
            : 'opacity-100 scale-100'
        } ${
          isBambiMode
            ? 'bg-gradient-to-br from-orange-100 to-red-100'
            : 'bg-gradient-to-br from-orange-900/80 to-red-900/80'
        }`}
      >
        {/* Flame Icon */}
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-orange-400 to-red-500'
              : 'bg-gradient-to-br from-orange-500 to-red-600'
          }`}
        >
          <Flame
            className={`w-10 h-10 text-white ${
              intensity >= 3 ? 'animate-pulse' : ''
            }`}
          />
        </div>

        {/* Message */}
        <p
          className={`text-xl font-semibold text-center ${
            isBambiMode ? 'text-orange-700' : 'text-orange-200'
          }`}
        >
          {MESSAGES[intensity]}
        </p>

        {/* Intensity indicator */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`w-3 h-3 rounded-full transition-all ${
                level <= intensity
                  ? isBambiMode
                    ? 'bg-orange-500'
                    : 'bg-orange-400'
                  : isBambiMode
                  ? 'bg-orange-200'
                  : 'bg-orange-800'
              }`}
            />
          ))}
        </div>

        {/* Subtext */}
        <p
          className={`text-sm ${
            isBambiMode ? 'text-orange-500' : 'text-orange-300/70'
          }`}
        >
          Logged
        </p>
      </div>
    </div>
  );
}
