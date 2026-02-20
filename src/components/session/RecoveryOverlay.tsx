/**
 * RecoveryOverlay — Between-edge breathing guide and affirmation display.
 * Shows during recovery phase with hidden countdown.
 */

import { SESSION_COLORS } from './session-types';

interface RecoveryOverlayProps {
  affirmation: string;
  isActive: boolean;
}

export function RecoveryOverlay({ affirmation, isActive }: RecoveryOverlayProps) {
  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center transition-opacity duration-500"
      style={{ backgroundColor: `${SESSION_COLORS.teal}10` }}
    >
      {/* Breathing circle */}
      <div className="relative mb-8">
        <div
          className="w-32 h-32 rounded-full border-2 animate-breathe"
          style={{
            borderColor: `${SESSION_COLORS.teal}60`,
            boxShadow: `0 0 40px ${SESSION_COLORS.teal}20`,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-sm font-medium animate-breathe-text"
            style={{ color: SESSION_COLORS.teal }}
          >
            breathe
          </span>
        </div>
      </div>

      {/* Affirmation */}
      <p
        className="text-xl font-light text-center px-8 mb-4 italic handler-voice"
        style={{ color: `${SESSION_COLORS.teal}cc` }}
      >
        "{affirmation}"
      </p>

      {/* Hidden countdown — user sees only this */}
      <p className="text-xs text-white/30">
        Handler will decide when you can continue
      </p>

      {/* CSS animations */}
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(0.8); opacity: 0.35; }
          40% { transform: scale(1.2); opacity: 0.8; }
          60% { transform: scale(1.2); opacity: 0.8; }
        }
        @keyframes breathe-text {
          0%, 100% { opacity: 0.25; }
          40% { opacity: 0.8; }
          60% { opacity: 0.8; }
        }
        .animate-breathe {
          animation: breathe 10s cubic-bezier(0.37, 0, 0.63, 1) infinite;
        }
        .animate-breathe-text {
          animation: breathe-text 10s cubic-bezier(0.37, 0, 0.63, 1) infinite;
        }
      `}</style>
    </div>
  );
}
