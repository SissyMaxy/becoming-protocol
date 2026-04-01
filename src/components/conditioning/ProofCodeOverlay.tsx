/**
 * ProofCodeOverlay — Full-screen overlay displaying the 4-digit verification code.
 *
 * Large, centered code in bold. Countdown timer from 5:00.
 * "Include this code in your photo" instruction.
 * Appears when a photo verification is demanded (ambush or mandate).
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Camera, Clock } from 'lucide-react';

interface ProofCodeOverlayProps {
  code: string;
  expiresAt: string;
  mandateType: string;
  onDismiss: () => void;
  onExpired: () => void;
}

export function ProofCodeOverlay({
  code,
  expiresAt,
  mandateType,
  onDismiss,
  onExpired,
}: ProofCodeOverlayProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const calculateTimeLeft = useCallback(() => {
    const now = Date.now();
    const expiry = new Date(expiresAt).getTime();
    return Math.max(0, Math.floor((expiry - now) / 1000));
  }, [expiresAt]);

  useEffect(() => {
    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateTimeLeft, onExpired]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isUrgent = timeLeft <= 60;
  const isCritical = timeLeft <= 30;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-4 right-4 p-2 text-white/50 hover:text-white/80 transition-colors"
        aria-label="Close overlay"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="flex flex-col items-center gap-6 px-8 max-w-sm">
        {/* Camera icon */}
        <Camera className="w-10 h-10 text-pink-400 opacity-80" />

        {/* Mandate type label */}
        <p className="text-sm uppercase tracking-widest text-pink-300/70 font-medium">
          {mandateType} verification
        </p>

        {/* The code — large, unmissable */}
        <div className="relative">
          <div
            className={`
              text-8xl font-mono font-black tracking-[0.3em] text-white
              select-all
              ${isCritical ? 'animate-pulse text-red-400' : ''}
            `}
          >
            {code}
          </div>
          {/* Glow effect */}
          <div className="absolute inset-0 text-8xl font-mono font-black tracking-[0.3em] text-pink-500/20 blur-lg pointer-events-none">
            {code}
          </div>
        </div>

        {/* Instruction */}
        <p className="text-center text-white/80 text-sm leading-relaxed">
          Include this code in your photo.
          <br />
          Write it on paper, show it on another screen,
          <br />
          or capture this screen in a mirror selfie.
        </p>

        {/* Timer */}
        <div
          className={`
            flex items-center gap-2 px-4 py-2 rounded-full
            ${isCritical ? 'bg-red-900/60 text-red-300' : isUrgent ? 'bg-yellow-900/40 text-yellow-300' : 'bg-white/10 text-white/70'}
          `}
        >
          <Clock className="w-4 h-4" />
          <span className="font-mono text-lg font-semibold">{timeStr}</span>
        </div>

        {/* Warning if running low */}
        {isUrgent && !isCritical && (
          <p className="text-yellow-400/80 text-xs text-center">
            Less than 1 minute remaining.
          </p>
        )}
        {isCritical && (
          <p className="text-red-400 text-xs text-center animate-pulse">
            Code expiring. Move now.
          </p>
        )}
      </div>
    </div>
  );
}
