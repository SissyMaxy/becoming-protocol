/**
 * Progress Ring - Circular progress indicator
 * Shows task completion with satisfying animation
 */

import { useEffect, useState } from 'react';

interface ProgressRingProps {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({
  completed,
  total,
  size = 120,
  strokeWidth = 8,
}: ProgressRingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const strokeDashoffset = circumference - (animatedProgress / 100) * circumference;

  // Animate progress on change
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress]);

  const isComplete = completed === total && total > 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Background circle */}
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-protocol-surface-light"
        />

        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`transition-all duration-700 ease-out ${
            isComplete
              ? 'stroke-protocol-success'
              : 'stroke-[url(#progressGradient)]'
          }`}
          style={{
            stroke: isComplete ? undefined : 'url(#progressGradient)',
          }}
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" /> {/* rose-500 */}
            <stop offset="100%" stopColor="#a855f7" /> {/* purple-500 */}
          </linearGradient>
        </defs>
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${
          isComplete ? 'text-protocol-success' : 'text-protocol-text'
        }`}>
          {completed}/{total}
        </span>
        <span className="text-xs text-protocol-text-muted">
          {isComplete ? 'complete!' : 'tasks'}
        </span>
      </div>

      {/* Completion glow effect */}
      {isComplete && (
        <div className="absolute inset-0 rounded-full bg-protocol-success/10 animate-pulse" />
      )}
    </div>
  );
}
