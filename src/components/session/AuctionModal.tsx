/**
 * AuctionModal — Weighted decision point that drops during edge sessions.
 * Shows 3 options with a 15-second countdown. If timer expires, auto-selects
 * the highest-commitment option ("Handler chooses for you").
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SESSION_COLORS, AUCTION_TIMER_SECONDS } from './session-types';
import type { AuctionOption } from './session-types';

interface AuctionModalProps {
  edgeNumber: number;
  options: AuctionOption[];
  onSelect: (option: AuctionOption) => void;
}

export function AuctionModal({ edgeNumber, options, onSelect }: AuctionModalProps) {
  const [timeRemaining, setTimeRemaining] = useState(AUCTION_TIMER_SECONDS);
  const [selected, setSelected] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasResolvedRef = useRef(false);

  // Auto-select the first (highest-commitment) option when timer expires
  const autoSelect = useCallback(() => {
    if (hasResolvedRef.current) return;
    hasResolvedRef.current = true;
    const highestCommitment = options[0]; // first option = highest commitment by design
    setSelected(highestCommitment.id);
    setTimeout(() => onSelect(highestCommitment), 800);
  }, [options, onSelect]);

  // Countdown timer
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          autoSelect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoSelect]);

  const handleSelect = (option: AuctionOption) => {
    if (hasResolvedRef.current) return;
    hasResolvedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSelected(option.id);
    // Brief pause to show selection before closing
    setTimeout(() => onSelect(option), 600);
  };

  const timerProgress = timeRemaining / AUCTION_TIMER_SECONDS;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-sm mx-6 rounded-2xl border border-white/10 overflow-hidden"
        style={{ backgroundColor: '#0d0820' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <p
            className="text-xs tracking-[0.3em] uppercase mb-2"
            style={{ color: SESSION_COLORS.gold }}
          >
            Decision Point
          </p>
          <p className="text-white text-lg font-medium">
            Edge {edgeNumber} reached. Choose:
          </p>
        </div>

        {/* Options */}
        <div className="px-6 space-y-3">
          {options.map(option => {
            const isSelected = selected === option.id;
            const isAutoSelected = selected !== null && selected !== option.id;

            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option)}
                disabled={selected !== null}
                className={`
                  w-full p-4 rounded-xl border text-left transition-all duration-300
                  ${isSelected
                    ? 'border-white/30 bg-white/15 scale-[1.02]'
                    : isAutoSelected
                      ? 'border-white/5 bg-white/2 opacity-40'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">{option.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{option.label}</p>
                    <p className="text-white/40 text-xs mt-0.5">{option.description}</p>
                    {option.reward && (
                      <p className="text-xs mt-1" style={{ color: SESSION_COLORS.gold }}>
                        Reward: {option.reward}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Timer */}
        <div className="px-6 pt-5 pb-6">
          {/* Progress bar */}
          <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${timerProgress * 100}%`,
                backgroundColor: timeRemaining <= 5 ? '#ef4444' : SESSION_COLORS.gold,
              }}
            />
          </div>
          <p className={`text-xs text-center ${timeRemaining <= 5 ? 'text-red-400' : 'text-white/30'}`}>
            {timeRemaining > 0
              ? `${timeRemaining}s — Handler chooses if you don't`
              : 'Handler has chosen for you.'}
          </p>
        </div>
      </div>
    </div>
  );
}
