/**
 * AffirmationOverlay — Timed affirmation display system for edge sessions.
 *
 * Three display modes:
 * - subliminal: ~200ms flash (registers subconsciously)
 * - readable: ~3 seconds (can be read)
 * - lingering: ~8 seconds (sits with you)
 *
 * Scheduling is unpredictable — random intervals between affirmations.
 * Pool selection is phase-aware (building/edge/recovery/identity).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AFFIRMATION_POOLS, SESSION_COLORS } from './session-types';
import type { AffirmationPool } from './session-types';

type DisplayMode = 'subliminal' | 'readable' | 'lingering';
type AffirmationStyle = 'whisper' | 'statement' | 'command';
type AffirmationPosition = 'top' | 'center' | 'bottom';

interface ActiveAffirmation {
  text: string;
  displayMode: DisplayMode;
  position: AffirmationPosition;
  style: AffirmationStyle;
  opacity: number;
}

interface AffirmationOverlayProps {
  /** Current session phase — determines which pool to draw from */
  phase: 'building' | 'edge' | 'recovery' | 'idle';
  /** Whether affirmations should be cycling */
  isActive: boolean;
  /** Progress through session (0-1) — influences identity affirmation frequency */
  progress: number;
}

const DISPLAY_DURATIONS: Record<DisplayMode, number> = {
  subliminal: 200,
  readable: 3000,
  lingering: 8000,
};

const STYLE_CLASSES: Record<AffirmationStyle, string> = {
  whisper: 'text-lg font-light italic',
  statement: 'text-2xl font-medium',
  command: 'text-3xl font-bold tracking-wide uppercase',
};

const POSITION_CLASSES: Record<AffirmationPosition, string> = {
  top: 'top-20',
  center: 'top-1/2 -translate-y-1/2',
  bottom: 'bottom-32',
};

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickDisplayMode(): DisplayMode {
  const r = Math.random();
  if (r < 0.15) return 'subliminal';
  if (r < 0.55) return 'readable';
  return 'lingering';
}

function pickStyle(): AffirmationStyle {
  const r = Math.random();
  if (r < 0.4) return 'whisper';
  if (r < 0.8) return 'statement';
  return 'command';
}

function pickPosition(): AffirmationPosition {
  return pickRandom(['top', 'center', 'bottom'] as const);
}

/** Random interval between affirmations: 4-12 seconds */
function getNextInterval(): number {
  return 4000 + Math.random() * 8000;
}

function getPoolForPhase(phase: string, progress: number): AffirmationPool {
  if (phase === 'edge') return 'edge';
  if (phase === 'recovery') return 'recovery';

  // During building: mix in identity affirmations as session progresses
  if (progress > 0.6 && Math.random() < 0.4) return 'identity';
  if (progress > 0.3 && Math.random() < 0.2) return 'identity';
  return 'building';
}

export function AffirmationOverlay({ phase, isActive, progress }: AffirmationOverlayProps) {
  const [current, setCurrent] = useState<ActiveAffirmation | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNextAffirmation = useCallback(() => {
    if (!isActive) return;

    const pool = getPoolForPhase(phase, progress);
    const text = pickRandom(AFFIRMATION_POOLS[pool]);
    const displayMode = pickDisplayMode();
    const style = pickStyle();
    const position = pickPosition();

    // Show affirmation
    setCurrent({ text, displayMode, position, style, opacity: 1 });

    // Schedule fade out
    const duration = DISPLAY_DURATIONS[displayMode];
    fadeTimeoutRef.current = setTimeout(() => {
      setCurrent(prev => prev ? { ...prev, opacity: 0 } : null);

      // Clear after fade
      setTimeout(() => setCurrent(null), 300);
    }, duration);

    // Schedule next affirmation
    timeoutRef.current = setTimeout(() => {
      showNextAffirmation();
    }, duration + 300 + getNextInterval());
  }, [isActive, phase, progress]);

  useEffect(() => {
    if (!isActive) {
      setCurrent(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      return;
    }

    // Start cycling after initial delay
    const initial = setTimeout(showNextAffirmation, 2000);
    return () => {
      clearTimeout(initial);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [isActive, showNextAffirmation]);

  if (!current) return null;

  return (
    <div
      className={`absolute left-0 right-0 ${POSITION_CLASSES[current.position]} pointer-events-none z-20 flex justify-center px-6 transition-opacity duration-300`}
      style={{ opacity: current.opacity }}
    >
      <p
        className={`${STYLE_CLASSES[current.style]} text-center max-w-md handler-voice`}
        style={{
          color: current.style === 'command'
            ? SESSION_COLORS.rose
            : current.style === 'whisper'
              ? `${SESSION_COLORS.teal}aa`
              : `${SESSION_COLORS.purple}dd`,
          textShadow: `0 0 20px ${SESSION_COLORS.purple}40`,
        }}
      >
        {current.style === 'command' ? current.text.toUpperCase() : `"${current.text}"`}
      </p>
    </div>
  );
}
