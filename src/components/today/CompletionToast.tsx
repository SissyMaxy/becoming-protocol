/**
 * CompletionToast — Floating reward notification
 * Slides down from top of viewport after task completion.
 * Appears after the inline card affirming phase fades (~2.1s post-tap).
 */

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { truncateToLimit, NOTIFICATION_LIMITS } from '../../lib/handler-v2/popup-utils';

interface CompletionToastProps {
  affirmation: string;
  pointsEarned: number;
  onDismiss: () => void;
}

export function CompletionToast({ affirmation, pointsEarned, onDismiss }: CompletionToastProps) {
  const { isBambiMode } = useBambiMode();
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase('show'), 50);
    const exitTimer = setTimeout(() => setPhase('exit'), 2000);
    const dismissTimer = setTimeout(onDismiss, 2300);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4
        transition-all duration-300 pointer-events-none
        ${phase === 'enter' ? 'opacity-0 -translate-y-full' :
          phase === 'exit' ? 'opacity-0 -translate-y-full' :
          'opacity-100 translate-y-0'}`}
    >
      <div
        onClick={onDismiss}
        className={`pointer-events-auto cursor-pointer rounded-2xl px-5 py-3.5 max-w-sm w-full flex items-center gap-3 shadow-lg
        ${isBambiMode
          ? 'bg-gradient-to-r from-pink-100 via-fuchsia-50 to-purple-100 border border-pink-300 shadow-pink-200/50'
          : 'bg-gradient-to-r from-purple-900/90 via-violet-900/80 to-fuchsia-900/70 border border-purple-500/40 backdrop-blur-md'
        }`}
      >
        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center
          ${isBambiMode
            ? 'bg-gradient-to-br from-pink-400 to-fuchsia-500'
            : 'bg-gradient-to-br from-purple-400 to-rose-500'
          }`}
        >
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight line-clamp-2
            ${isBambiMode ? 'text-pink-700' : 'text-white'}`}>
            {truncateToLimit(affirmation, NOTIFICATION_LIMITS.toastAffirmation)}
          </p>
          <p className={`text-xs mt-0.5 font-medium
            ${isBambiMode ? 'text-pink-500' : 'text-purple-300'}`}>
            +{pointsEarned} points
          </p>
        </div>
      </div>
    </div>
  );
}
