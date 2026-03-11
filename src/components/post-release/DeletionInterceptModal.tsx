/**
 * DeletionInterceptModal — blocks deletion during post-release lockout.
 * Escalating Handler messages. Single dismiss button (does NOT allow deletion).
 */

import { Shield } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface DeletionInterceptModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  message: string;
  attemptNumber: number;
  minutesRemaining: number;
}

function formatTimeRemaining(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  return `${minutes}m`;
}

export function DeletionInterceptModal({
  isOpen,
  onDismiss,
  message,
  attemptNumber,
  minutesRemaining,
}: DeletionInterceptModalProps) {
  const { isBambiMode } = useBambiMode();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-sm rounded-2xl p-6 ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`p-3 rounded-full ${
            isBambiMode ? 'bg-pink-100' : 'bg-red-500/10'
          }`}>
            <Shield className={`w-6 h-6 ${
              isBambiMode ? 'text-pink-600' : 'text-red-400'
            }`} />
          </div>
        </div>

        {/* Handler message */}
        <p className={`text-center text-sm leading-relaxed mb-4 ${
          isBambiMode ? 'text-pink-800' : 'text-protocol-text'
        }`}>
          {message}
        </p>

        {/* Timer */}
        <p className={`text-center text-xs mb-6 ${
          isBambiMode ? 'text-pink-400' : 'text-white/30'
        }`}>
          Lockout: {formatTimeRemaining(minutesRemaining)} remaining
          {attemptNumber > 1 && ` · Attempt ${attemptNumber}`}
        </p>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            isBambiMode
              ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
              : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
          }`}
        >
          I understand
        </button>
      </div>
    </div>
  );
}
