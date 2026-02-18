/**
 * Swipeable Task Card
 *
 * A card component with native touch/mouse gesture handling for swipe evaluation.
 * Swipe right = Keep, left = Reject, up = Needs Work.
 */

import { useState, useRef, useCallback } from 'react';
import { Check, X, Wrench } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Task } from '../../types/task-bank';
import type { CurationDecision } from '../../types/task-curation';
import { CATEGORY_EMOJI, INTENSITY_CONFIG, CATEGORY_CONFIG } from '../../types/task-bank';

interface SwipeableTaskCardProps {
  task: Task;
  onSwipe: (decision: CurationDecision) => void;
}

const SWIPE_THRESHOLD = 100;
const ROTATION_FACTOR = 0.1;

export function SwipeableTaskCard({ task, onSwipe }: SwipeableTaskCardProps) {
  const { isBambiMode } = useBambiMode();

  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const rotation = position.x * ROTATION_FACTOR;
  const opacity = 1 - Math.min(Math.abs(position.x) / 300, 0.3);

  // Determine which indicator to show
  const showKeep = position.x > 50;
  const showReject = position.x < -50;
  const showNeedsWork = position.y < -50 && Math.abs(position.x) < 50;

  const handleStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    startPos.current = { x: clientX, y: clientY };
  }, []);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - startPos.current.x;
    const deltaY = clientY - startPos.current.y;
    setPosition({ x: deltaX, y: deltaY });
  }, [isDragging]);

  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    // Check thresholds
    if (position.x > SWIPE_THRESHOLD) {
      // Swiped right - Keep
      animateOut('right', () => onSwipe('keep'));
    } else if (position.x < -SWIPE_THRESHOLD) {
      // Swiped left - Reject
      animateOut('left', () => onSwipe('reject'));
    } else if (position.y < -SWIPE_THRESHOLD && Math.abs(position.x) < 50) {
      // Swiped up - Needs Work
      animateOut('up', () => onSwipe('needs_work'));
    } else {
      // Reset position
      setPosition({ x: 0, y: 0 });
    }
  }, [isDragging, position, onSwipe]);

  const animateOut = (direction: 'left' | 'right' | 'up', callback: () => void) => {
    const targetX = direction === 'left' ? -500 : direction === 'right' ? 500 : 0;
    const targetY = direction === 'up' ? -500 : 0;

    setPosition({ x: targetX, y: targetY });

    // Call callback after animation
    setTimeout(callback, 200);
  };

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX, e.touches[0].clientY);
  }, [handleStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  }, [handleMove]);

  const onTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Mouse handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    handleStart(e.clientX, e.clientY);
  }, [handleStart]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      handleMove(e.clientX, e.clientY);
    }
  }, [isDragging, handleMove]);

  const onMouseUp = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  const onMouseLeave = useCallback(() => {
    if (isDragging) {
      handleEnd();
    }
  }, [isDragging, handleEnd]);

  const emoji = CATEGORY_EMOJI[task.category] || '✨';
  const intensityConfig = INTENSITY_CONFIG[task.intensity] || INTENSITY_CONFIG[1];
  const categoryConfig = CATEGORY_CONFIG[task.category];

  // Intensity color classes
  const intensityColors: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    teal: 'bg-teal-100 text-teal-700 border-teal-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300',
    orange: 'bg-orange-100 text-orange-700 border-orange-300',
    red: 'bg-red-100 text-red-700 border-red-300',
  };

  return (
    <div
      ref={cardRef}
      className="relative select-none touch-none"
      style={{
        transform: `translateX(${position.x}px) translateY(${position.y}px) rotate(${rotation}deg)`,
        opacity,
        transition: isDragging ? 'none' : 'all 0.3s ease-out',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {/* Direction indicators */}
      {showKeep && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg font-bold text-lg shadow-lg rotate-[-12deg]">
          <Check className="w-6 h-6" />
          KEEP
        </div>
      )}
      {showReject && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-bold text-lg shadow-lg rotate-[12deg]">
          <X className="w-6 h-6" />
          REJECT
        </div>
      )}
      {showNeedsWork && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg font-bold text-lg shadow-lg">
          <Wrench className="w-6 h-6" />
          NEEDS WORK
        </div>
      )}

      {/* Card content */}
      <div
        className={`w-80 rounded-2xl shadow-xl overflow-hidden ${
          isBambiMode
            ? 'bg-white border-2 border-pink-200'
            : 'bg-protocol-surface border border-protocol-border'
        }`}
      >
        {/* Header with emoji and intensity */}
        <div
          className={`p-6 flex items-center gap-4 ${
            isBambiMode
              ? 'bg-gradient-to-r from-pink-100 to-pink-50'
              : 'bg-gradient-to-r from-protocol-surface-light to-protocol-surface'
          }`}
        >
          <div
            className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl ${
              isBambiMode ? 'bg-pink-200' : 'bg-protocol-bg'
            }`}
          >
            {emoji}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  intensityColors[intensityConfig.color]
                }`}
              >
                {intensityConfig.label}
              </span>
            </div>
            <p
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              {categoryConfig?.label || task.category}
            </p>
          </div>
        </div>

        {/* Instruction */}
        <div className="p-6">
          <p
            className={`text-lg font-medium leading-relaxed ${
              isBambiMode ? 'text-pink-800' : 'text-protocol-text'
            }`}
          >
            {task.instruction}
          </p>

          {task.subtext && (
            <p
              className={`mt-3 text-sm ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              {task.subtext}
            </p>
          )}
        </div>

        {/* Domain badge */}
        <div
          className={`px-6 pb-6 flex items-center gap-2 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          <span className="text-xs font-medium uppercase tracking-wide">
            {task.domain.replace('_', ' ')}
          </span>
          {task.durationMinutes && (
            <>
              <span className="text-xs">•</span>
              <span className="text-xs">{task.durationMinutes} min</span>
            </>
          )}
          {task.targetCount && (
            <>
              <span className="text-xs">•</span>
              <span className="text-xs">{task.targetCount}x</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
