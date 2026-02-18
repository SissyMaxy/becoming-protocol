// Goal Card Component
// Displays a goal with selectable drills for completion

import { useState, memo } from 'react';
import {
  Target,
  Check,
  Trophy,
  Flame,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pause,
  X,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { TodaysGoalWithDrills, Drill, GoalCompletionInput } from '../../types/goals';
import { getDomainLabel, getDomainColor } from '../../types/goals';
import { DrillOption } from './DrillOption';

interface GoalCardProps {
  goal: TodaysGoalWithDrills;
  onComplete: (input: GoalCompletionInput) => Promise<void>;
  onPause?: (goalId: string) => Promise<void>;
  onAbandon?: (goalId: string) => void;
}

// Memoized to prevent unnecessary re-renders when parent state changes
export const GoalCard = memo(function GoalCard({ goal, onComplete, onPause, onAbandon }: GoalCardProps) {
  const { isBambiMode } = useBambiMode();
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState('');

  const domainColor = getDomainColor(goal.goalDomain);
  const isCompleted = goal.completedToday;

  const handleComplete = async () => {
    if (!selectedDrill || completing || isCompleted) return;

    setCompleting(true);
    try {
      await onComplete({
        goalId: goal.goalId,
        drillId: selectedDrill.id,
        notes: notes.trim() || undefined,
      });
    } finally {
      setCompleting(false);
    }
  };

  const handlePause = async () => {
    setShowMenu(false);
    if (onPause) {
      await onPause(goal.goalId);
    }
  };

  const handleAbandon = () => {
    setShowMenu(false);
    if (onAbandon) {
      onAbandon(goal.goalId);
    }
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        isCompleted
          ? isBambiMode
            ? 'bg-pink-50 border-pink-300'
            : 'bg-green-900/10 border-green-700/30'
          : isBambiMode
          ? 'bg-pink-50/50 border-pink-200'
          : 'bg-protocol-surface border-protocol-border'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {/* Domain icon */}
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${domainColor}20` }}
            >
              {isCompleted ? (
                <Check className="w-5 h-5" style={{ color: domainColor }} />
              ) : (
                <Target className="w-5 h-5" style={{ color: domainColor }} />
              )}
            </div>

            <div>
              {/* Goal name */}
              <h3
                className={`font-semibold ${
                  isCompleted
                    ? isBambiMode
                      ? 'text-pink-600'
                      : 'text-green-400'
                    : isBambiMode
                    ? 'text-pink-700'
                    : 'text-protocol-text'
                }`}
              >
                {goal.goalName}
              </h3>

              {/* Domain and streak */}
              <div className="flex items-center gap-3 mt-1">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${domainColor}20`,
                    color: domainColor,
                  }}
                >
                  {getDomainLabel(goal.goalDomain)}
                </span>

                {goal.consecutiveDays > 0 && (
                  <span
                    className={`flex items-center gap-1 text-xs ${
                      isBambiMode ? 'text-pink-500' : 'text-orange-400'
                    }`}
                  >
                    <Flame className="w-3 h-3" />
                    {goal.consecutiveDays} day streak
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Progress to graduation */}
            <div className="flex items-center gap-2 mr-2">
              <div
                className={`w-16 h-1.5 rounded-full overflow-hidden ${
                  isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface-light'
                }`}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${goal.graduationProgress}%`,
                    backgroundColor: domainColor,
                  }}
                />
              </div>
              <Trophy
                className={`w-4 h-4 ${
                  goal.graduationProgress >= 100
                    ? 'text-yellow-500'
                    : isBambiMode
                    ? 'text-pink-300'
                    : 'text-protocol-text-muted'
                }`}
              />
            </div>

            {/* Menu button */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`p-1 rounded ${
                  isBambiMode
                    ? 'text-pink-400 hover:bg-pink-100'
                    : 'text-protocol-text-muted hover:bg-protocol-surface-light'
                }`}
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Dropdown menu */}
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div
                    className={`absolute right-0 mt-1 w-40 rounded-lg border shadow-lg z-20 ${
                      isBambiMode
                        ? 'bg-white border-pink-200'
                        : 'bg-protocol-surface border-protocol-border'
                    }`}
                  >
                    {onPause && (
                      <button
                        onClick={handlePause}
                        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                          isBambiMode
                            ? 'hover:bg-pink-50 text-pink-700'
                            : 'hover:bg-protocol-surface-light text-protocol-text'
                        }`}
                      >
                        <Pause className="w-4 h-4" />
                        Pause Goal
                      </button>
                    )}
                    {onAbandon && (
                      <button
                        onClick={handleAbandon}
                        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                          isBambiMode
                            ? 'hover:bg-pink-50 text-red-500'
                            : 'hover:bg-protocol-surface-light text-red-400'
                        }`}
                      >
                        <X className="w-4 h-4" />
                        Abandon Goal
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Expand/collapse */}
            <button
              onClick={() => setExpanded(!expanded)}
              className={`p-1 rounded ${
                isBambiMode
                  ? 'text-pink-400 hover:bg-pink-100'
                  : 'text-protocol-text-muted hover:bg-protocol-surface-light'
              }`}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Description */}
        {goal.goalDescription && expanded && (
          <p
            className={`mt-2 text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {goal.goalDescription}
          </p>
        )}
      </div>

      {/* Drills section */}
      {expanded && (
        <div
          className={`px-4 pb-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <p
            className={`text-xs mt-3 mb-2 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            {isCompleted
              ? `Completed with: ${goal.drillUsedName}`
              : 'Pick any drill to complete this goal:'}
          </p>

          <div className="space-y-2">
            {goal.drills.map((drill) => (
              <DrillOption
                key={drill.id}
                drill={drill}
                selected={selectedDrill?.id === drill.id}
                completed={isCompleted && goal.drillUsedId === drill.id}
                onSelect={() => !isCompleted && setSelectedDrill(drill)}
              />
            ))}
          </div>

          {/* Notes input - appears when a drill is selected */}
          {!isCompleted && selectedDrill && (
            <div className="mt-3">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Log details here (optional)"
                rows={2}
                className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
                  isBambiMode
                    ? 'border-pink-300 bg-white text-gray-800 placeholder:text-pink-300 focus:ring-pink-400'
                    : 'border-protocol-border bg-protocol-bg text-protocol-text placeholder:text-protocol-text-muted focus:ring-protocol-accent'
                } focus:outline-none focus:ring-2`}
              />
            </div>
          )}

          {/* Complete button */}
          {!isCompleted && (
            <button
              onClick={handleComplete}
              disabled={!selectedDrill || completing}
              className={`w-full mt-4 py-3 rounded-lg font-medium transition-all ${
                selectedDrill
                  ? isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                  : isBambiMode
                  ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                  : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
              }`}
            >
              {completing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Completing...
                </span>
              ) : selectedDrill ? (
                <span className="flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  Complete Goal
                </span>
              ) : (
                'Select a drill to continue'
              )}
            </button>
          )}

          {/* Completed state */}
          {isCompleted && (
            <div
              className={`mt-4 py-3 rounded-lg text-center font-medium ${
                isBambiMode
                  ? 'bg-pink-200 text-pink-700'
                  : 'bg-green-900/30 text-green-400'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <Check className="w-4 h-4" />
                Goal Achieved Today
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// Display name for React DevTools
GoalCard.displayName = 'GoalCard';
