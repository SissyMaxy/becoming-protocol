// Task Card Component
// Individual task display with completion/skip actions

import { useState, memo } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { DailyTask } from '../../types/task-bank';
import { CATEGORY_EMOJI, INTENSITY_CONFIG } from '../../types/task-bank';
import { OverrideDialog } from '../corruption/OverrideDialog';
import type { OverrideFriction } from '../../lib/corruption-behaviors';

interface TaskCardProps {
  task: DailyTask;
  onComplete: (feltGood?: boolean) => void;
  onIncrement?: () => void;
  onSkip: () => void;
  onOverrideLogged?: (reason?: string) => void;
  isCompleting: boolean;
  isSkipping: boolean;
  overrideFriction?: OverrideFriction;
}

// Memoized to prevent unnecessary re-renders in task lists
export const TaskCard = memo(function TaskCard({
  task,
  onComplete,
  onIncrement,
  onSkip,
  onOverrideLogged,
  isCompleting,
  isSkipping,
  overrideFriction = 'none',
}: TaskCardProps) {
  const { isBambiMode } = useBambiMode();
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);

  const { instruction, category, intensity, completionType, targetCount, durationMinutes } = task.task;
  const emoji = CATEGORY_EMOJI[category];
  const intensityConfig = INTENSITY_CONFIG[intensity];

  const isCompleted = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  const isPending = task.status === 'pending';

  // Progress display for count tasks
  const showProgress = completionType === 'count' && targetCount;
  const progressText = showProgress ? `${task.progress}/${targetCount}` : null;

  // Duration display
  const durationText = completionType === 'duration' && durationMinutes
    ? `${durationMinutes} min`
    : null;

  // Intensity color
  const getIntensityColor = () => {
    if (isBambiMode) {
      switch (intensity) {
        case 1: return 'bg-pink-100 text-pink-600';
        case 2: return 'bg-pink-200 text-pink-700';
        case 3: return 'bg-fuchsia-200 text-fuchsia-700';
        case 4: return 'bg-purple-200 text-purple-700';
        case 5: return 'bg-red-200 text-red-700';
        default: return 'bg-pink-100 text-pink-600';
      }
    }
    switch (intensity) {
      case 1: return 'bg-emerald-900/30 text-emerald-400';
      case 2: return 'bg-teal-900/30 text-teal-400';
      case 3: return 'bg-amber-900/30 text-amber-400';
      case 4: return 'bg-orange-900/30 text-orange-400';
      case 5: return 'bg-red-900/30 text-red-400';
      default: return 'bg-emerald-900/30 text-emerald-400';
    }
  };

  const handleComplete = () => {
    if (showProgress && task.progress < (targetCount || 0) - 1) {
      // Increment progress instead of completing
      onIncrement?.();
    } else {
      onComplete(true);
    }
  };

  const handleSkipClick = () => {
    if (showSkipConfirm) {
      // At autonomy level 3+, show override dialog before allowing skip
      if (overrideFriction !== 'none') {
        setShowSkipConfirm(false);
        setShowOverrideDialog(true);
        return;
      }
      onSkip();
      setShowSkipConfirm(false);
    } else {
      setShowSkipConfirm(true);
    }
  };

  const handleOverrideConfirm = (reason?: string) => {
    setShowOverrideDialog(false);
    onOverrideLogged?.(reason);
    onSkip();
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden transition-all duration-300 ${
        isCompleted
          ? isBambiMode
            ? 'bg-pink-50 border border-pink-200 opacity-75'
            : 'bg-emerald-900/20 border border-emerald-600/30 opacity-75'
          : isSkipped
          ? isBambiMode
            ? 'bg-gray-50 border border-gray-200 opacity-50'
            : 'bg-gray-800/30 border border-gray-600/30 opacity-50'
          : isBambiMode
          ? 'bg-white border border-pink-200 shadow-sm'
          : 'bg-protocol-surface border border-protocol-border'
      }`}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Category emoji */}
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${
              isCompleted
                ? isBambiMode
                  ? 'bg-pink-200'
                  : 'bg-emerald-800/50'
                : isBambiMode
                ? 'bg-pink-100'
                : 'bg-protocol-bg'
            }`}
          >
            {isCompleted ? (
              <Check className={`w-5 h-5 ${isBambiMode ? 'text-pink-600' : 'text-emerald-400'}`} />
            ) : (
              emoji
            )}
          </div>

          {/* Instruction */}
          <div className="flex-1 min-w-0">
            <p
              className={`font-medium leading-snug ${
                isCompleted || isSkipped
                  ? 'line-through opacity-70'
                  : ''
              } ${
                isBambiMode ? 'text-gray-800' : 'text-protocol-text'
              }`}
            >
              {instruction}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Intensity badge */}
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${getIntensityColor()}`}
              >
                {intensityConfig.label}
              </span>

              {/* Duration */}
              {durationText && (
                <span
                  className={`text-xs ${
                    isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
                  }`}
                >
                  {durationText}
                </span>
              )}

              {/* Progress */}
              {progressText && (
                <span
                  className={`text-xs font-medium ${
                    isBambiMode ? 'text-pink-600' : 'text-emerald-400'
                  }`}
                >
                  {progressText}
                </span>
              )}
            </div>
          </div>

          {/* Action button */}
          {isPending && (
            <div className="flex items-center gap-2">
              {showSkipConfirm ? (
                <>
                  <button
                    onClick={() => setShowSkipConfirm(false)}
                    className={`p-2 rounded-lg transition-colors ${
                      isBambiMode
                        ? 'text-gray-500 hover:bg-gray-100'
                        : 'text-protocol-text-muted hover:bg-protocol-bg'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSkipClick}
                    disabled={isSkipping}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isBambiMode
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {isSkipping ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Skip'
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSkipClick}
                    className={`p-2 rounded-lg transition-colors opacity-50 hover:opacity-100 ${
                      isBambiMode
                        ? 'text-gray-400 hover:bg-gray-100'
                        : 'text-protocol-text-muted hover:bg-protocol-bg'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={isCompleting}
                    className={`px-4 py-2 rounded-lg font-medium transition-all active:scale-95 ${
                      isBambiMode
                        ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white hover:opacity-90'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90'
                    }`}
                  >
                    {isCompleting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : showProgress && task.progress < (targetCount || 0) - 1 ? (
                      '+1'
                    ) : (
                      'Done'
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Override friction dialog (autonomy level 3+) */}
      {showOverrideDialog && (
        <OverrideDialog
          friction={overrideFriction}
          taskName={instruction}
          onKeep={() => setShowOverrideDialog(false)}
          onOverride={handleOverrideConfirm}
          onCancel={() => setShowOverrideDialog(false)}
        />
      )}

      {/* Skip warning overlay */}
      {showSkipConfirm && (
        <div
          className={`absolute inset-0 flex items-center justify-center backdrop-blur-sm ${
            isBambiMode ? 'bg-white/80' : 'bg-protocol-bg/80'
          }`}
        >
          <div className="text-center px-4">
            <p
              className={`text-sm font-medium mb-1 ${
                isBambiMode ? 'text-gray-700' : 'text-protocol-text'
              }`}
            >
              Skip this task?
            </p>
            <p
              className={`text-xs mb-3 ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}
            >
              -15 points | Returns tomorrow
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-emerald-500 text-white'
                }`}
              >
                I'll do it
              </button>
              <button
                onClick={handleSkipClick}
                disabled={isSkipping}
                className={`px-4 py-1.5 rounded-lg text-sm ${
                  isBambiMode
                    ? 'bg-gray-200 text-gray-600'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {isSkipping ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Skip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Display name for React DevTools
TaskCard.displayName = 'TaskCard';
