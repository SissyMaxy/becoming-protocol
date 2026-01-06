/**
 * Progress Ring
 * Circular progress visualization for task completion
 */

import { useBambiMode } from '../../context/BambiModeContext';

interface ProgressRingProps {
  completed: number;
  total: number;
  size?: number;
}

export function ProgressRing({ completed, total, size = 120 }: ProgressRingProps) {
  const { isBambiMode } = useBambiMode();

  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference - (progress * circumference);

  const allComplete = total > 0 && completed === total;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isBambiMode ? '#fce7f3' : 'rgba(255,255,255,0.1)'}
          strokeWidth={strokeWidth}
        />

        {/* Progress circle with gradient */}
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            {isBambiMode ? (
              <>
                <stop offset="0%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#a855f7" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#06b6d4" />
              </>
            )}
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />

        {/* Glow effect when complete */}
        {allComplete && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isBambiMode ? '#ec4899' : '#10b981'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="opacity-50 blur-sm animate-pulse"
          />
        )}
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {allComplete ? (
          <div className="text-center">
            <span className="text-3xl">✨</span>
            <p className={`text-xs font-medium mt-1 ${
              isBambiMode ? 'text-pink-600' : 'text-emerald-400'
            }`}>
              Perfect
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-0.5">
              <span className={`text-3xl font-bold ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                {completed}
              </span>
              <span className={`text-lg ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>
                /{total}
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              {total - completed === 1 ? 'task left' : 'tasks left'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
