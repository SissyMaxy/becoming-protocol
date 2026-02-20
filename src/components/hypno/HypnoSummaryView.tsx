/**
 * HypnoSummaryView — Post-session wrap-up
 *
 * Collects trance depth and post-session state, shows session stats,
 * then calls endHypnoSession and completes.
 */

import { useState, useCallback } from 'react';
import { CheckCircle2, Loader2, Clock, Camera, Flag } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { HypnoSessionRecord, HypnoPostSessionState } from '../../types/hypno-bridge';

interface HypnoSummaryViewProps {
  session: HypnoSessionRecord;
  captureCount: number;
  flaggedCount: number;
  elapsedSeconds: number;
  onComplete: (tranceDepth: number, postState: HypnoPostSessionState) => Promise<void>;
}

const TRANCE_LEVELS = [
  { value: 1, label: 'Light', desc: 'Relaxed but aware' },
  { value: 2, label: 'Moderate', desc: 'Somewhat fuzzy' },
  { value: 3, label: 'Mid-deep', desc: 'Drifting, suggestible' },
  { value: 4, label: 'Deep', desc: 'Lost track of time' },
  { value: 5, label: 'Very deep', desc: 'Gone' },
] as const;

const POST_STATES: { value: HypnoPostSessionState; label: string; emoji: string }[] = [
  { value: 'energized', label: 'Energized', emoji: '⚡' },
  { value: 'compliant', label: 'Compliant', emoji: '🎀' },
  { value: 'foggy', label: 'Foggy', emoji: '🌫️' },
  { value: 'aroused', label: 'Aroused', emoji: '🔥' },
  { value: 'peaceful', label: 'Peaceful', emoji: '🕊️' },
  { value: 'disoriented', label: 'Disoriented', emoji: '😵‍💫' },
  { value: 'resistant', label: 'Resistant', emoji: '🛡️' },
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function HypnoSummaryView({
  session,
  captureCount,
  flaggedCount,
  elapsedSeconds,
  onComplete,
}: HypnoSummaryViewProps) {
  const { isBambiMode } = useBambiMode();
  const [tranceDepth, setTrancedepth] = useState(3);
  const [postState, setPostState] = useState<HypnoPostSessionState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = useCallback(async () => {
    if (!postState) return;
    setIsSubmitting(true);
    try {
      await onComplete(tranceDepth, postState);
    } finally {
      setIsSubmitting(false);
    }
  }, [tranceDepth, postState, onComplete]);

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2
          className={`text-lg font-semibold mb-1 ${
            isBambiMode ? 'text-purple-700' : 'text-purple-300'
          }`}
        >
          Session Complete
        </h2>
        <p
          className={`text-xs ${
            isBambiMode ? 'text-gray-500' : 'text-gray-400'
          }`}
        >
          {session.sessionType.replace(/_/g, ' ')}
        </p>
      </div>

      {/* Stats */}
      <div
        className={`flex items-center justify-center gap-6 py-3 rounded-xl ${
          isBambiMode
            ? 'bg-purple-50 border border-purple-200'
            : 'bg-purple-900/20 border border-purple-700/30'
        }`}
      >
        <div className="text-center">
          <Clock
            className={`w-4 h-4 mx-auto mb-1 ${
              isBambiMode ? 'text-purple-400' : 'text-purple-500'
            }`}
          />
          <p
            className={`text-sm font-semibold ${
              isBambiMode ? 'text-purple-700' : 'text-purple-300'
            }`}
          >
            {formatDuration(elapsedSeconds)}
          </p>
          <p className={`text-[10px] ${isBambiMode ? 'text-purple-400' : 'text-purple-500'}`}>
            Duration
          </p>
        </div>
        <div className={`w-px h-10 ${isBambiMode ? 'bg-purple-200' : 'bg-purple-700'}`} />
        <div className="text-center">
          <Camera
            className={`w-4 h-4 mx-auto mb-1 ${
              isBambiMode ? 'text-purple-400' : 'text-purple-500'
            }`}
          />
          <p
            className={`text-sm font-semibold ${
              isBambiMode ? 'text-purple-700' : 'text-purple-300'
            }`}
          >
            {captureCount}
          </p>
          <p className={`text-[10px] ${isBambiMode ? 'text-purple-400' : 'text-purple-500'}`}>
            Captures
          </p>
        </div>
        <div className={`w-px h-10 ${isBambiMode ? 'bg-purple-200' : 'bg-purple-700'}`} />
        <div className="text-center">
          <Flag
            className={`w-4 h-4 mx-auto mb-1 ${
              isBambiMode ? 'text-purple-400' : 'text-purple-500'
            }`}
          />
          <p
            className={`text-sm font-semibold ${
              isBambiMode ? 'text-purple-700' : 'text-purple-300'
            }`}
          >
            {flaggedCount}
          </p>
          <p className={`text-[10px] ${isBambiMode ? 'text-purple-400' : 'text-purple-500'}`}>
            Flagged
          </p>
        </div>
      </div>

      {/* Trance depth */}
      <div>
        <label
          className={`text-xs font-medium uppercase tracking-wide block mb-2 ${
            isBambiMode ? 'text-purple-600' : 'text-purple-400'
          }`}
        >
          Trance Depth
        </label>
        <div className="flex gap-2">
          {TRANCE_LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => setTrancedepth(level.value)}
              className={`flex-1 py-2 rounded-lg text-center transition-colors ${
                tranceDepth === level.value
                  ? isBambiMode
                    ? 'bg-purple-500 text-white'
                    : 'bg-purple-600 text-white'
                  : isBambiMode
                    ? 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                    : 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50'
              }`}
            >
              <span className="text-sm font-semibold block">{level.value}</span>
              <span className="text-[9px] block">{level.label}</span>
            </button>
          ))}
        </div>
        <p
          className={`text-[10px] mt-1 text-center ${
            isBambiMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {TRANCE_LEVELS.find((l) => l.value === tranceDepth)?.desc}
        </p>
      </div>

      {/* Post-session state */}
      <div>
        <label
          className={`text-xs font-medium uppercase tracking-wide block mb-2 ${
            isBambiMode ? 'text-purple-600' : 'text-purple-400'
          }`}
        >
          How do you feel?
        </label>
        <div className="grid grid-cols-4 gap-2">
          {POST_STATES.map((state) => (
            <button
              key={state.value}
              onClick={() => setPostState(state.value)}
              className={`py-2 rounded-lg text-center transition-colors ${
                postState === state.value
                  ? isBambiMode
                    ? 'bg-purple-500 text-white'
                    : 'bg-purple-600 text-white'
                  : isBambiMode
                    ? 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                    : 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50'
              }`}
            >
              <span className="text-base block">{state.emoji}</span>
              <span className="text-[9px] block">{state.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Complete */}
      <button
        onClick={handleComplete}
        disabled={!postState || isSubmitting}
        className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          !postState || isSubmitting
            ? isBambiMode
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : isBambiMode
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-purple-600 text-white hover:bg-purple-500'
        }`}
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}
        {isSubmitting ? 'Saving...' : 'Complete Session'}
      </button>
    </div>
  );
}
