import { useBambiMode } from '../../context/BambiModeContext';
import { Star, Crown, Sparkles } from 'lucide-react';
import type { LevelInfo } from '../../types/rewards';

interface LevelProgressProps {
  levelInfo: LevelInfo;
  className?: string;
  showBar?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function LevelProgress({
  levelInfo,
  className = '',
  showBar = true,
  size = 'md',
}: LevelProgressProps) {
  const { isBambiMode } = useBambiMode();
  const { level, title, xpInLevel, xpForNextLevel, progress } = levelInfo;
  const isMaxLevel = level >= 10;

  const sizeClasses = {
    sm: {
      text: 'text-sm',
      badge: 'text-xs px-2 py-0.5',
      bar: 'h-1.5',
    },
    md: {
      text: 'text-base',
      badge: 'text-sm px-2.5 py-1',
      bar: 'h-2',
    },
    lg: {
      text: 'text-lg',
      badge: 'text-base px-3 py-1.5',
      bar: 'h-3',
    },
  };

  const LevelIcon = isMaxLevel ? Crown : Star;

  return (
    <div className={`${className}`}>
      {/* Level badge and title */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`flex items-center gap-1.5 rounded-full font-medium ${
            sizeClasses[size].badge
          } ${
            isBambiMode
              ? 'bg-gradient-to-r from-pink-400 to-pink-600 text-white'
              : 'bg-gradient-to-r from-protocol-accent to-purple-600 text-white'
          }`}
        >
          <LevelIcon className="w-4 h-4" />
          <span>Level {level}</span>
        </div>
        <span
          className={`font-semibold ${sizeClasses[size].text} ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          {title}
        </span>
        {isMaxLevel && (
          <Sparkles
            className={`w-4 h-4 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            } animate-pulse`}
          />
        )}
      </div>

      {/* Progress bar */}
      {showBar && !isMaxLevel && (
        <div>
          <div
            className={`w-full rounded-full ${sizeClasses[size].bar} ${
              isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface-light'
            }`}
          >
            <div
              className={`${sizeClasses[size].bar} rounded-full transition-all duration-500 ${
                isBambiMode
                  ? 'bg-gradient-to-r from-pink-400 to-pink-600'
                  : 'bg-gradient-to-r from-protocol-accent to-purple-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              {xpInLevel.toLocaleString()} XP
            </span>
            <span
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              {xpForNextLevel.toLocaleString()} XP to Level {level + 1}
            </span>
          </div>
        </div>
      )}

      {/* Max level message */}
      {showBar && isMaxLevel && (
        <p
          className={`text-sm ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
          }`}
        >
          Maximum level achieved!
        </p>
      )}
    </div>
  );
}

// Compact badge version for headers
export function LevelBadge({
  level,
  className = '',
}: {
  level: number;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();

  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium ${
        isBambiMode
          ? 'bg-pink-100 text-pink-600'
          : 'bg-protocol-accent/20 text-protocol-accent'
      } ${className}`}
    >
      <Star className="w-3 h-3" />
      <span>Lv.{level}</span>
    </div>
  );
}
