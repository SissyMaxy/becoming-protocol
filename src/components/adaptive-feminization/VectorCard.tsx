/**
 * Vector Card
 * Displays a single vector with level, progress, and lock-in status
 */

import { Lock, TrendingUp, Sparkles, AlertCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { VectorDisplayInfo, UserVectorState } from '../../types/adaptive-feminization';
import { getVectorById } from '../../data/vector-definitions';

interface VectorCardProps {
  info: VectorDisplayInfo;
  state?: UserVectorState;
  onClick?: () => void;
  compact?: boolean;
}

export function VectorCard({ info, state, onClick, compact = false }: VectorCardProps) {
  const { isBambiMode } = useBambiMode();
  const vector = getVectorById(info.id);

  if (!vector) return null;

  // Get velocity indicator
  const getVelocityIcon = () => {
    if (!state) return null;
    switch (state.velocityTrend) {
      case 'accelerating':
        return <TrendingUp className="w-3 h-3 text-emerald-500" />;
      case 'stalling':
        return <AlertCircle className="w-3 h-3 text-amber-500" />;
      case 'regressing':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`p-3 rounded-lg text-left transition-all ${
          isBambiMode
            ? 'bg-pink-50 hover:bg-pink-100 border border-pink-200'
            : 'bg-protocol-surface hover:bg-protocol-surface-light border border-protocol-border'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-xs font-medium"
            style={{ color: info.color }}
          >
            {info.name}
          </span>
          {info.isLockedIn && (
            <Lock className="w-3 h-3 text-amber-500" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            {info.level}
          </span>
          <div className="flex-1 h-1.5 bg-protocol-surface-light rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${info.progress}%`, backgroundColor: info.color }}
            />
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-xl text-left transition-all ${
        isBambiMode
          ? 'bg-white hover:bg-pink-50 border border-pink-200'
          : 'bg-protocol-surface hover:bg-protocol-surface-light border border-protocol-border'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-sm font-semibold"
              style={{ color: info.color }}
            >
              {info.name}
            </span>
            {info.isLockedIn && (
              <Lock className="w-3.5 h-3.5 text-amber-500" />
            )}
            {getVelocityIcon()}
          </div>
          <p className={`text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            {vector.description}
          </p>
        </div>

        <div className="text-right">
          <span
            className="text-2xl font-bold"
            style={{ color: info.color }}
          >
            {info.level}
          </span>
          <span className={`text-xs block ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            / 10
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className={`h-2 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
        }`}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${info.progress}%`, backgroundColor: info.color }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className={`text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            Level {info.level}
          </span>
          <span className={`text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            Level {Math.min(info.level + 1, 10)}
          </span>
        </div>
      </div>

      {/* Stats row */}
      {state && (
        <div className="flex items-center gap-4 text-xs">
          {state.streakDays > 0 && (
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
                {state.streakDays}d streak
              </span>
            </div>
          )}
          {state.totalEngagementMinutes > 0 && (
            <span className={isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}>
              {Math.round(state.totalEngagementMinutes / 60)}h total
            </span>
          )}
        </div>
      )}

      {/* Category badge */}
      <div className="mt-3 pt-3 border-t border-protocol-border">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          info.category === 'feminization'
            ? isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-pink-900/20 text-pink-400'
            : isBambiMode ? 'bg-purple-100 text-purple-600' : 'bg-purple-900/20 text-purple-400'
        }`}>
          {info.category === 'feminization' ? 'Feminization' : 'Sissification'}
        </span>
      </div>
    </button>
  );
}
