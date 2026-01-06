/**
 * Scheduled Session Card
 * Shows a planned edge session with start/complete actions
 */

import { Play, Check, SkipForward, Clock, Flame, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { PlannedEdgeSession, SessionIntensity } from '../../types/arousal-planner';
import { TIME_BLOCK_CONFIG } from '../../types/arousal-planner';

interface ScheduledSessionCardProps {
  session: PlannedEdgeSession;
  onStart: () => void;
  onComplete: () => void;
  onSkip: () => void;
  isStarting?: boolean;
  isCompleting?: boolean;
  isSkipping?: boolean;
  isNext?: boolean;
}

export function ScheduledSessionCard({
  session,
  onStart,
  onComplete,
  onSkip,
  isStarting = false,
  isCompleting = false,
  isSkipping = false,
  isNext = false,
}: ScheduledSessionCardProps) {
  const { isBambiMode } = useBambiMode();
  const isLoading = isStarting || isCompleting || isSkipping;

  const timeBlockConfig = TIME_BLOCK_CONFIG[session.timeBlock];

  // Status colors
  const statusStyles = {
    scheduled: isBambiMode
      ? 'bg-white border-gray-200'
      : 'bg-protocol-surface border-protocol-border',
    started: isBambiMode
      ? 'bg-purple-50 border-purple-300'
      : 'bg-purple-900/20 border-purple-500/50',
    completed: isBambiMode
      ? 'bg-green-50 border-green-300'
      : 'bg-green-900/20 border-green-500/50',
    skipped: isBambiMode
      ? 'bg-gray-50 border-gray-200 opacity-60'
      : 'bg-gray-800/50 border-gray-600 opacity-60',
    missed: isBambiMode
      ? 'bg-red-50 border-red-200 opacity-60'
      : 'bg-red-900/20 border-red-600/50 opacity-60',
  };

  // Intensity badges
  const intensityColors: Record<SessionIntensity, string> = {
    gentle: isBambiMode ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400',
    moderate: isBambiMode ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-900/30 text-yellow-400',
    intense: isBambiMode ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-400',
  };

  // Session type labels
  const sessionTypeLabels = {
    edge_training: 'Edge Training',
    denial: 'Denial Practice',
    anchoring: 'Anchoring',
    goon: 'Goon Session',
    maintenance: 'Maintenance',
  };

  const isActionable = session.status === 'scheduled' || session.status === 'started';

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${statusStyles[session.status]} ${
        isNext && session.status === 'scheduled' ? 'ring-2 ring-purple-400 ring-offset-2' : ''
      }`}
    >
      {/* Header: Time + Type */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`} />
          <span className={`font-medium ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            {session.scheduledTime}
          </span>
          <span className={`text-sm ${
            isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
          }`}>
            {timeBlockConfig.label}
          </span>
        </div>

        <span className={`text-xs px-2 py-1 rounded-full ${intensityColors[session.intensityLevel]}`}>
          {session.intensityLevel}
        </span>
      </div>

      {/* Session type + targets */}
      <div className="mb-3">
        <h4 className={`font-semibold ${
          isBambiMode ? 'text-gray-800' : 'text-protocol-text'
        }`}>
          {sessionTypeLabels[session.sessionType]}
        </h4>
        <div className={`flex items-center gap-3 mt-1 text-sm ${
          isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
        }`}>
          <span className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" />
            {session.targetEdges} edges
          </span>
          <span>{session.targetDurationMinutes} min</span>
        </div>
      </div>

      {/* Affirmation focus */}
      {session.affirmationFocus && (
        <p className={`text-sm italic mb-3 ${
          isBambiMode ? 'text-purple-600' : 'text-purple-400'
        }`}>
          "{session.affirmationFocus}"
        </p>
      )}

      {/* Special instructions */}
      {session.specialInstructions && (
        <p className={`text-xs mb-3 ${
          isBambiMode ? 'text-amber-600' : 'text-amber-400'
        }`}>
          Note: {session.specialInstructions}
        </p>
      )}

      {/* Completed info */}
      {session.status === 'completed' && (
        <div className={`text-sm ${
          isBambiMode ? 'text-green-600' : 'text-green-400'
        }`}>
          <Check className="w-4 h-4 inline mr-1" />
          Completed: {session.actualEdges} edges in {session.actualDurationMinutes} min
        </div>
      )}

      {/* Actions */}
      {isActionable && (
        <div className="flex items-center gap-2 mt-4">
          {session.status === 'scheduled' ? (
            <>
              <button
                onClick={onStart}
                disabled={isLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
                  isBambiMode
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                } disabled:opacity-50`}
              >
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Session
                  </>
                )}
              </button>

              <button
                onClick={onSkip}
                disabled={isLoading}
                className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  isBambiMode
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                } disabled:opacity-50`}
              >
                {isSkipping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SkipForward className="w-4 h-4" />
                )}
              </button>
            </>
          ) : session.status === 'started' ? (
            <button
              onClick={onComplete}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
                isBambiMode
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              } disabled:opacity-50`}
            >
              {isCompleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Complete Session
                </>
              )}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
