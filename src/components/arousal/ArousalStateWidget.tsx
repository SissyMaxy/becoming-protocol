import { useBambiMode } from '../../context/BambiModeContext';
import type { ArousalState } from '../../types/arousal';
import { AROUSAL_STATE_CONFIG } from '../../types/arousal';

interface ArousalStateWidgetProps {
  state: ArousalState;
  daysSinceRelease: number;
  arousalLevel: number;
  onTap: () => void;
  compact?: boolean;
  className?: string;
}

export function ArousalStateWidget({
  state,
  daysSinceRelease,
  arousalLevel,
  onTap,
  compact = false,
  className = '',
}: ArousalStateWidgetProps) {
  const { isBambiMode } = useBambiMode();
  const config = AROUSAL_STATE_CONFIG[state];

  const getStateColorClasses = () => {
    if (isBambiMode) {
      switch (state) {
        case 'sweet_spot':
          return 'bg-gradient-to-r from-pink-400 to-purple-500 text-white';
        case 'building':
          return 'bg-pink-100 text-pink-700 border-2 border-pink-300';
        case 'overload':
          return 'bg-red-100 text-red-700 border-2 border-red-300';
        case 'post_release':
        case 'recovery':
          return 'bg-gray-100 text-gray-600 border-2 border-gray-200';
        default:
          return 'bg-pink-50 text-pink-600 border-2 border-pink-200';
      }
    } else {
      switch (state) {
        case 'sweet_spot':
          return 'bg-gradient-to-r from-purple-600 to-pink-600 text-white';
        case 'building':
          return 'bg-blue-900/30 text-blue-400 border border-blue-500/30';
        case 'overload':
          return 'bg-red-900/30 text-red-400 border border-red-500/30';
        case 'post_release':
        case 'recovery':
          return 'bg-protocol-surface text-protocol-text-muted border border-protocol-border';
        default:
          return 'bg-protocol-surface text-protocol-text border border-protocol-border';
      }
    }
  };

  if (compact) {
    return (
      <button
        onClick={onTap}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${getStateColorClasses()} ${className}`}
      >
        <span className="text-lg">{config.emoji}</span>
        <span className="text-sm font-medium">{config.label}</span>
        <span className="text-xs opacity-75">D{daysSinceRelease}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onTap}
      className={`w-full p-4 rounded-xl transition-all active:scale-98 ${getStateColorClasses()} ${className}`}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl">{config.emoji}</span>
        <div className="flex-1 text-left">
          <div className="font-semibold text-lg">{config.label}</div>
          <div className="text-sm opacity-80">
            Day {daysSinceRelease} • Level {arousalLevel}/10
          </div>
        </div>
      </div>

      {state === 'sweet_spot' && (
        <div
          className={`mt-3 text-sm ${
            isBambiMode ? 'text-white/90' : 'text-white/90'
          }`}
        >
          Maximum receptivity — protect this state
        </div>
      )}

      {state === 'overload' && (
        <div
          className={`mt-3 text-sm ${
            isBambiMode ? 'text-red-700' : 'text-red-400'
          }`}
        >
          High risk — decide: release, cool-down, or ride it
        </div>
      )}

      {state === 'post_release' && (
        <div
          className={`mt-3 text-sm ${
            isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
          }`}
        >
          Low receptivity — light practice only
        </div>
      )}

      {state === 'building' && (
        <div
          className={`mt-3 text-sm ${
            isBambiMode ? 'text-pink-600' : 'text-blue-400'
          }`}
        >
          Sweet spot approaching
        </div>
      )}
    </button>
  );
}

// Mini version for header/stats
export function ArousalStateBadge({
  state,
  daysSinceRelease,
  className = '',
}: {
  state: ArousalState;
  daysSinceRelease: number;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();
  const config = AROUSAL_STATE_CONFIG[state];

  const getBadgeColor = () => {
    if (isBambiMode) {
      switch (state) {
        case 'sweet_spot':
          return 'bg-purple-100 text-purple-700';
        case 'building':
          return 'bg-pink-100 text-pink-600';
        case 'overload':
          return 'bg-red-100 text-red-600';
        default:
          return 'bg-gray-100 text-gray-600';
      }
    } else {
      switch (state) {
        case 'sweet_spot':
          return 'bg-purple-500/20 text-purple-400';
        case 'building':
          return 'bg-blue-500/20 text-blue-400';
        case 'overload':
          return 'bg-red-500/20 text-red-400';
        default:
          return 'bg-protocol-surface text-protocol-text-muted';
      }
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm font-medium ${getBadgeColor()} ${className}`}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
      <span className="opacity-75">D{daysSinceRelease}</span>
    </div>
  );
}
