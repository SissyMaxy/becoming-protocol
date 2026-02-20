/**
 * EdgeButton — The large tap target for recording edges.
 * Centered in the session view with pulse animation on tap.
 */

import { useState, useCallback } from 'react';
import { SESSION_COLORS } from './session-types';

interface EdgeButtonProps {
  edgeCount: number;
  targetEdges: number;
  isRecovering: boolean;
  disabled?: boolean;
  onTap: () => void;
}

export function EdgeButton({ edgeCount, targetEdges, isRecovering, disabled, onTap }: EdgeButtonProps) {
  const [isPulsing, setIsPulsing] = useState(false);

  const handleTap = useCallback(() => {
    if (isRecovering || disabled) return;
    setIsPulsing(true);
    onTap();
    setTimeout(() => setIsPulsing(false), 500);
  }, [isRecovering, disabled, onTap]);

  const isDisabled = isRecovering || disabled;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Edge count display */}
      <div className="text-center">
        <span className="text-5xl font-bold text-white">
          {edgeCount}
        </span>
        <span className="text-lg text-white/40 ml-1">
          / {targetEdges}
        </span>
        <p className="text-sm text-white/30 mt-1">edges</p>
      </div>

      {/* The big button */}
      <button
        onClick={handleTap}
        disabled={isDisabled}
        aria-label={isRecovering ? 'Recovering — wait' : 'Record edge'}
        className={`
          relative w-40 h-40 rounded-full
          flex items-center justify-center
          text-white text-2xl font-bold tracking-wider uppercase
          transition-all duration-300 select-none
          ${isDisabled
            ? 'opacity-30 cursor-not-allowed scale-95'
            : 'active:scale-90 cursor-pointer hover:shadow-2xl'
          }
          ${isPulsing ? 'scale-110' : ''}
        `}
        style={{
          background: isDisabled
            ? 'rgba(255,255,255,0.05)'
            : `linear-gradient(135deg, ${SESSION_COLORS.rose}, ${SESSION_COLORS.purple})`,
          boxShadow: isDisabled
            ? 'none'
            : `0 0 40px ${SESSION_COLORS.rose}40, 0 0 80px ${SESSION_COLORS.purple}20`,
        }}
      >
        {/* Ripple ring animation */}
        {isPulsing && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              backgroundColor: `${SESSION_COLORS.rose}30`,
              animationDuration: '0.5s',
              animationIterationCount: '1',
            }}
          />
        )}

        <span className="relative z-10">
          {isRecovering ? '...' : 'EDGE'}
        </span>
      </button>
    </div>
  );
}
