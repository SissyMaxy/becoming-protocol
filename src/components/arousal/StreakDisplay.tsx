import { useBambiMode } from '../../context/BambiModeContext';
import type { DenialStreak, ArousalMetrics } from '../../types/arousal';
import { Flame, Trophy, Sparkles, Target, TrendingUp } from 'lucide-react';

interface StreakDisplayProps {
  streak: DenialStreak | null;
  metrics: ArousalMetrics | null;
  onLogRelease?: () => void;
  compact?: boolean;
  className?: string;
}

export function StreakDisplay({
  streak,
  metrics,
  onLogRelease,
  compact = false,
  className = '',
}: StreakDisplayProps) {
  const { isBambiMode } = useBambiMode();

  const currentDays = metrics?.currentStreakDays || 0;
  const longestStreak = metrics?.longestStreak || 0;
  const isPersonalRecord = currentDays > 0 && currentDays >= longestStreak;
  const optimalMin = metrics?.optimalMinDays || 3;
  const optimalMax = metrics?.optimalMaxDays || 10;
  const inSweetSpot = currentDays >= optimalMin && currentDays <= optimalMax;
  const prostateCount = streak?.prostateOrgasmsDuring || 0;
  const edgeCount = streak?.edgesDuring || 0;
  const sweetSpotDays = streak?.sweetSpotDays || 0;

  const getStreakColor = () => {
    if (isPersonalRecord && currentDays > 0) {
      return isBambiMode
        ? 'from-yellow-400 to-orange-500'
        : 'from-yellow-500 to-orange-600';
    }
    if (inSweetSpot) {
      return isBambiMode
        ? 'from-purple-400 to-pink-500'
        : 'from-purple-600 to-pink-600';
    }
    if (currentDays >= optimalMin) {
      return isBambiMode
        ? 'from-pink-400 to-pink-500'
        : 'from-protocol-accent to-protocol-accent-soft';
    }
    return isBambiMode
      ? 'from-gray-300 to-gray-400'
      : 'from-gray-600 to-gray-700';
  };

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        } ${className}`}
      >
        <Flame
          className={`w-4 h-4 ${
            currentDays >= optimalMin
              ? isBambiMode
                ? 'text-pink-500'
                : 'text-protocol-accent'
              : isBambiMode
                ? 'text-gray-400'
                : 'text-protocol-text-muted'
          }`}
        />
        <span
          className={`font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          {currentDays}
        </span>
        <span
          className={`text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}
        >
          days
        </span>
        {isPersonalRecord && currentDays > 0 && (
          <Trophy className="w-4 h-4 text-yellow-500" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl overflow-hidden ${
        isBambiMode ? 'bg-white shadow-lg' : 'bg-protocol-surface'
      } ${className}`}
    >
      {/* Main Streak Display */}
      <div className={`bg-gradient-to-r ${getStreakColor()} p-6 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium opacity-90 mb-1">
              Current Streak
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">{currentDays}</span>
              <span className="text-xl opacity-90">days</span>
            </div>
          </div>
          <div className="relative">
            <Flame className="w-16 h-16 opacity-90" />
            {isPersonalRecord && currentDays > 0 && (
              <div className="absolute -top-1 -right-1 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                <Trophy className="w-5 h-5 text-yellow-800" />
              </div>
            )}
          </div>
        </div>

        {/* Sweet Spot Indicator */}
        {inSweetSpot && (
          <div className="mt-4 flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">
              You're in the sweet spot! Maximum receptivity.
            </span>
          </div>
        )}

        {isPersonalRecord && currentDays > 0 && (
          <div className="mt-4 flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
            <Trophy className="w-4 h-4" />
            <span className="text-sm font-medium">Personal Record!</span>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className={`p-4 ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
        <div className="grid grid-cols-3 gap-3">
          {/* Optimal Range */}
          <div
            className={`p-3 rounded-xl ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface'
            }`}
          >
            <Target
              className={`w-5 h-5 mb-2 ${
                isBambiMode ? 'text-purple-500' : 'text-purple-400'
              }`}
            />
            <div
              className={`text-lg font-bold ${
                isBambiMode ? 'text-gray-900' : 'text-protocol-text'
              }`}
            >
              {optimalMin}-{optimalMax}
            </div>
            <div
              className={`text-xs ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}
            >
              Sweet spot
            </div>
          </div>

          {/* Longest Streak */}
          <div
            className={`p-3 rounded-xl ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface'
            }`}
          >
            <TrendingUp
              className={`w-5 h-5 mb-2 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            />
            <div
              className={`text-lg font-bold ${
                isBambiMode ? 'text-gray-900' : 'text-protocol-text'
              }`}
            >
              {longestStreak}
            </div>
            <div
              className={`text-xs ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}
            >
              Record
            </div>
          </div>

          {/* Sweet Spot Days */}
          <div
            className={`p-3 rounded-xl ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface'
            }`}
          >
            <Sparkles
              className={`w-5 h-5 mb-2 ${
                isBambiMode ? 'text-yellow-500' : 'text-yellow-400'
              }`}
            />
            <div
              className={`text-lg font-bold ${
                isBambiMode ? 'text-gray-900' : 'text-protocol-text'
              }`}
            >
              {sweetSpotDays}
            </div>
            <div
              className={`text-xs ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}
            >
              In sweet spot
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="flex gap-4 mt-4">
          {prostateCount > 0 && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                isBambiMode
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-purple-900/30 text-purple-400'
              }`}
            >
              <span className="text-base">✨</span>
              <span>{prostateCount} prostate</span>
            </div>
          )}
          {edgeCount > 0 && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-700'
                  : 'bg-pink-900/30 text-pink-400'
              }`}
            >
              <span className="text-base">🔄</span>
              <span>{edgeCount} edges</span>
            </div>
          )}
        </div>

        {/* Log Release Button */}
        {onLogRelease && (
          <button
            onClick={onLogRelease}
            className={`w-full mt-4 py-3 rounded-xl font-medium transition-all ${
              isBambiMode
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-protocol-surface-light text-protocol-text-muted hover:bg-protocol-border'
            }`}
          >
            Log Release
          </button>
        )}
      </div>
    </div>
  );
}

// Mini badge version
export function StreakBadge({
  days,
  isRecord = false,
  className = '',
}: {
  days: number;
  isRecord?: boolean;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm font-medium ${
        isRecord
          ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white'
          : isBambiMode
            ? 'bg-pink-100 text-pink-700'
            : 'bg-protocol-accent/20 text-protocol-accent'
      } ${className}`}
    >
      <Flame className="w-3.5 h-3.5" />
      <span>{days}d</span>
      {isRecord && <Trophy className="w-3.5 h-3.5" />}
    </div>
  );
}

// Progress indicator towards sweet spot
export function SweetSpotProgress({
  currentDays,
  optimalMin,
  optimalMax,
  className = '',
}: {
  currentDays: number;
  optimalMin: number;
  optimalMax: number;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();

  const totalRange = optimalMax + 2; // Show a bit beyond optimal
  const progress = Math.min(currentDays / totalRange, 1);
  const minProgress = optimalMin / totalRange;
  const maxProgress = optimalMax / totalRange;
  const inSweetSpot = currentDays >= optimalMin && currentDays <= optimalMax;
  const pastOptimal = currentDays > optimalMax;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between text-xs">
        <span
          className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}
        >
          Day {currentDays}
        </span>
        <span
          className={
            inSweetSpot
              ? isBambiMode
                ? 'text-purple-600'
                : 'text-purple-400'
              : isBambiMode
                ? 'text-gray-500'
                : 'text-protocol-text-muted'
          }
        >
          {inSweetSpot
            ? 'In Sweet Spot'
            : pastOptimal
              ? 'Past optimal'
              : `${optimalMin - currentDays} days to sweet spot`}
        </span>
      </div>
      <div
        className={`relative h-3 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-gray-200' : 'bg-protocol-surface-light'
        }`}
      >
        {/* Sweet spot zone indicator */}
        <div
          className={`absolute h-full ${
            isBambiMode ? 'bg-purple-200' : 'bg-purple-900/30'
          }`}
          style={{
            left: `${minProgress * 100}%`,
            width: `${(maxProgress - minProgress) * 100}%`,
          }}
        />
        {/* Progress bar */}
        <div
          className={`absolute h-full rounded-full transition-all ${
            inSweetSpot
              ? 'bg-gradient-to-r from-purple-500 to-pink-500'
              : pastOptimal
                ? 'bg-gradient-to-r from-orange-500 to-red-500'
                : isBambiMode
                  ? 'bg-pink-400'
                  : 'bg-protocol-accent'
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span
          className={isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'}
        >
          0
        </span>
        <span
          className={isBambiMode ? 'text-purple-500' : 'text-purple-400'}
        >
          {optimalMin}
        </span>
        <span
          className={isBambiMode ? 'text-purple-500' : 'text-purple-400'}
        >
          {optimalMax}
        </span>
        <span
          className={isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'}
        >
          {totalRange}+
        </span>
      </div>
    </div>
  );
}
