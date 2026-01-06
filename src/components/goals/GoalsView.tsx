// Goals View
// Goal-based daily training view (replacement for task-based TodayView)

import { useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Flame,
  Trophy,
  Target,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useGoals, useGoalTemplates } from '../../hooks/useGoals';
import { GoalCard } from './GoalCard';
import { GoalAbandonmentGauntlet } from './GoalAbandonmentGauntlet';
import { GraduationCelebration } from './GraduationCelebration';
import { GraduatedGoals } from './GraduatedGoals';
import { TimeRatchetsBadges } from '../ratchets/TimeRatchets';
import type { Goal, GoalCompletionInput, GoalTemplate } from '../../types/goals';

export function GoalsView() {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const {
    todaysGoals,
    allGoals,
    graduatedGoals,
    overallStreak,
    completionStatus,
    loading,
    error,
    completeGoal,
    abandonGoal,
    pauseGoal,
    addGoalFromTemplate,
    refresh,
  } = useGoals();

  const { templates } = useGoalTemplates();

  // Modal states
  const [abandoningGoal, setAbandoningGoal] = useState<Goal | null>(null);
  const [graduatedGoal, setGraduatedGoal] = useState<Goal | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [addingTemplateId, setAddingTemplateId] = useState<string | null>(null);

  // Find the full goal data for abandonment gauntlet
  const getFullGoal = (goalId: string): Goal | undefined => {
    return allGoals.find(g => g.id === goalId);
  };

  // Handle goal completion
  const handleComplete = async (input: GoalCompletionInput) => {
    const result = await completeGoal(input);
    if (result && isBambiMode) {
      triggerHearts?.();
    }

    // Check if this goal just graduated
    const goal = getFullGoal(input.goalId);
    if (goal && goal.consecutiveDays + 1 >= goal.graduationThreshold) {
      const graduated = allGoals.find(g => g.id === input.goalId && g.status === 'graduated');
      if (graduated) {
        setGraduatedGoal(graduated);
      }
    }
  };

  // Handle goal abandonment
  const handleAbandon = (goalId: string) => {
    const goal = getFullGoal(goalId);
    if (goal) {
      setAbandoningGoal(goal);
    }
  };

  const handleConfirmAbandon = async (reason: string) => {
    if (!abandoningGoal) return;
    await abandonGoal(abandoningGoal.id, reason);
    setAbandoningGoal(null);
  };

  // Handle goal pause
  const handlePause = async (goalId: string) => {
    await pauseGoal(goalId);
  };

  // Handle adding a new goal from template
  const handleAddGoal = async (template: GoalTemplate) => {
    setAddingTemplateId(template.id);
    try {
      await addGoalFromTemplate(template.id);
      setShowAddGoal(false);
    } finally {
      setAddingTemplateId(null);
    }
  };

  // Calculate progress
  const allCompleted = completionStatus.completed === completionStatus.total && completionStatus.total > 0;
  const graduatedCount = allGoals.filter(g => g.status === 'graduated').length;

  // Available templates (not already active)
  const activeGoalNames = new Set(allGoals.filter(g => g.status === 'active').map(g => g.name));
  const availableTemplates = templates.filter(t => !activeGoalNames.has(t.name));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2
          className={`w-10 h-10 animate-spin mb-4 ${
            isBambiMode ? 'text-pink-500' : 'text-emerald-500'
          }`}
        />
        <p
          className={`text-sm ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}
        >
          Loading your goals...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          className={`p-6 rounded-2xl text-center ${
            isBambiMode
              ? 'bg-red-50 border border-red-200'
              : 'bg-red-900/20 border border-red-600/30'
          }`}
        >
          <AlertCircle
            className={`w-10 h-10 mx-auto mb-3 ${
              isBambiMode ? 'text-red-500' : 'text-red-400'
            }`}
          />
          <p
            className={`font-semibold ${
              isBambiMode ? 'text-red-700' : 'text-red-400'
            }`}
          >
            Failed to load goals
          </p>
          <p
            className={`text-sm mt-2 opacity-70 ${
              isBambiMode ? 'text-red-600' : 'text-red-400'
            }`}
          >
            {error}
          </p>
          <button
            onClick={refresh}
            className={`mt-4 px-5 py-2 rounded-xl text-sm font-medium transition-colors ${
              isBambiMode
                ? 'bg-red-100 hover:bg-red-200 text-red-700'
                : 'bg-red-900/30 hover:bg-red-900/50 text-red-300'
            }`}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen pb-24 ${
        isBambiMode
          ? 'bg-gradient-to-b from-pink-50 to-white'
          : 'bg-protocol-bg'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div
          className={`rounded-2xl p-5 ${
            isBambiMode
              ? 'bg-white shadow-sm'
              : 'bg-protocol-surface border border-protocol-border'
          }`}
        >
          {/* Top row: greeting and stats */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Today's Goals
              </h1>
              <p
                className={`text-sm mt-1 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Complete any drill to achieve each goal
              </p>
            </div>

            <button
              onClick={refresh}
              className={`p-2 rounded-lg ${
                isBambiMode
                  ? 'text-pink-400 hover:bg-pink-50'
                  : 'text-protocol-text-muted hover:bg-protocol-surface-light'
              }`}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4">
            {/* Overall streak */}
            <div className="flex items-center gap-2">
              <Flame
                className={`w-5 h-5 ${
                  overallStreak > 0
                    ? 'text-orange-500'
                    : isBambiMode
                    ? 'text-pink-300'
                    : 'text-protocol-text-muted'
                }`}
              />
              <span
                className={`font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                {overallStreak}
              </span>
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                day streak
              </span>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <Target
                className={`w-5 h-5 ${
                  allCompleted
                    ? 'text-green-500'
                    : isBambiMode
                    ? 'text-pink-400'
                    : 'text-protocol-text-muted'
                }`}
              />
              <span
                className={`font-semibold ${
                  allCompleted
                    ? 'text-green-500'
                    : isBambiMode
                    ? 'text-pink-700'
                    : 'text-protocol-text'
                }`}
              >
                {completionStatus.completed}/{completionStatus.total}
              </span>
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                goals
              </span>
            </div>

            {/* Graduated */}
            {graduatedCount > 0 && (
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <span
                  className={`font-semibold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {graduatedCount}
                </span>
                <span
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  graduated
                </span>
              </div>
            )}
          </div>

          {/* Time ratchets */}
          <div className="mt-4 pt-4 border-t border-pink-100 dark:border-protocol-border">
            <TimeRatchetsBadges />
          </div>
        </div>
      </div>

      {/* Goals list */}
      <div className="px-4 space-y-4">
        {todaysGoals.length === 0 ? (
          <div
            className={`p-8 rounded-2xl text-center ${
              isBambiMode ? 'bg-white shadow-sm' : 'bg-protocol-surface'
            }`}
          >
            <Target
              className={`w-12 h-12 mx-auto mb-4 ${
                isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
              }`}
            />
            <p
              className={`font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              No active goals
            </p>
            <p
              className={`text-sm mt-2 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Add goals to start your training journey
            </p>

            {availableTemplates.length > 0 && (
              <button
                onClick={() => setShowAddGoal(true)}
                className={`mt-4 px-5 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                }`}
              >
                Add Your First Goal
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Active goals */}
            {todaysGoals.map((goal) => (
              <GoalCard
                key={goal.goalId}
                goal={goal}
                onComplete={handleComplete}
                onPause={handlePause}
                onAbandon={handleAbandon}
              />
            ))}

            {/* All completed message */}
            {allCompleted && (
              <div
                className={`p-6 rounded-2xl text-center ${
                  isBambiMode
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-green-900/20 border border-green-700/30'
                }`}
              >
                <div className="text-4xl mb-3">✨</div>
                <p
                  className={`font-semibold ${
                    isBambiMode ? 'text-green-700' : 'text-green-400'
                  }`}
                >
                  All goals achieved!
                </p>
                <p
                  className={`text-sm mt-1 ${
                    isBambiMode ? 'text-green-600' : 'text-green-400/70'
                  }`}
                >
                  You're one day closer to making this automatic.
                </p>
              </div>
            )}

            {/* Add goal button */}
            {availableTemplates.length > 0 && (
              <button
                onClick={() => setShowAddGoal(true)}
                className={`w-full p-4 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-colors ${
                  isBambiMode
                    ? 'border-pink-200 text-pink-400 hover:border-pink-300 hover:bg-pink-50'
                    : 'border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50 hover:bg-protocol-surface'
                }`}
              >
                <Plus className="w-5 h-5" />
                Add Another Goal
              </button>
            )}

            {/* Graduated goals section */}
            {graduatedGoals.length > 0 && (
              <div className="mt-6">
                <GraduatedGoals goals={graduatedGoals} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Goal Modal */}
      {showAddGoal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
          <div
            className={`w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] overflow-hidden ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface'
            }`}
          >
            <div
              className={`p-4 border-b ${
                isBambiMode ? 'border-pink-100' : 'border-protocol-border'
              }`}
            >
              <h2
                className={`font-semibold text-lg ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Add a Goal
              </h2>
              <p
                className={`text-sm ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Choose a goal to work toward
              </p>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
              {availableTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleAddGoal(template)}
                  disabled={addingTemplateId === template.id}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    addingTemplateId === template.id
                      ? isBambiMode
                        ? 'bg-pink-100 border-pink-200'
                        : 'bg-protocol-surface-light border-protocol-border'
                      : isBambiMode
                      ? 'bg-pink-50 border-pink-100 hover:border-pink-300'
                      : 'bg-protocol-surface-light border-protocol-border hover:border-protocol-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {template.name}
                    </span>
                    {addingTemplateId === template.id ? (
                      <Loader2 className="w-5 h-5 animate-spin text-pink-500" />
                    ) : (
                      <Plus
                        className={`w-5 h-5 ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}
                      />
                    )}
                  </div>
                  {template.description && (
                    <p
                      className={`text-sm mt-1 ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      {template.description}
                    </p>
                  )}
                  <div
                    className={`text-xs mt-2 ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    {template.graduationThreshold} days to graduate
                  </div>
                </button>
              ))}
            </div>

            <div
              className={`p-4 border-t ${
                isBambiMode ? 'border-pink-100' : 'border-protocol-border'
              }`}
            >
              <button
                onClick={() => setShowAddGoal(false)}
                className={`w-full py-3 rounded-xl font-medium ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                    : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abandonment Gauntlet */}
      {abandoningGoal && (
        <GoalAbandonmentGauntlet
          goal={abandoningGoal}
          onConfirm={handleConfirmAbandon}
          onCancel={() => setAbandoningGoal(null)}
        />
      )}

      {/* Graduation Celebration */}
      {graduatedGoal && (
        <GraduationCelebration
          goal={graduatedGoal}
          onClose={() => setGraduatedGoal(null)}
        />
      )}
    </div>
  );
}
