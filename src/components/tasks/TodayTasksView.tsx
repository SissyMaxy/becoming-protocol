// Today Tasks View
// Main view for daily task management

import { useEffect } from 'react';
import { Loader2, RefreshCw, Flame, Trophy, AlertTriangle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useTaskBank } from '../../hooks/useTaskBank';
import { TaskCard } from './TaskCard';
import { TaskCompletionCelebration } from './TaskCompletionCelebration';

export function TodayTasksView() {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const {
    todayTasks,
    isLoading,
    error,
    stats,
    completingTaskId,
    lastCompletedTask,
    skippingTaskId,
    weeklySkipCount,
    showSkipWarning,
    loadTasks,
    complete,
    incrementProgress,
    skip,
    dismissCompletion,
    dismissSkipWarning,
  } = useTaskBank();

  // Trigger hearts on completion in Bambi mode
  useEffect(() => {
    if (lastCompletedTask && isBambiMode) {
      triggerHearts?.();
    }
  }, [lastCompletedTask, isBambiMode, triggerHearts]);

  // Calculate progress
  const completedCount = todayTasks.filter(t => t.status === 'completed').length;
  const totalCount = todayTasks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // All done state
  const allDone = totalCount > 0 && completedCount === totalCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2
          className={`w-8 h-8 animate-spin ${
            isBambiMode ? 'text-pink-500' : 'text-emerald-500'
          }`}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-4 rounded-xl text-center ${
          isBambiMode
            ? 'bg-red-50 text-red-700'
            : 'bg-red-900/20 text-red-400'
        }`}
      >
        <p className="font-medium">Failed to load tasks</p>
        <p className="text-sm mt-1 opacity-70">{error}</p>
        <button
          onClick={loadTasks}
          className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
            isBambiMode
              ? 'bg-red-100 hover:bg-red-200'
              : 'bg-red-900/30 hover:bg-red-900/50'
          }`}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-900' : 'text-protocol-text'
            }`}
          >
            Today's Tasks
          </h2>
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}
          >
            {completedCount} of {totalCount} complete
          </p>
        </div>

        <button
          onClick={loadTasks}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode
              ? 'hover:bg-pink-100 text-pink-500'
              : 'hover:bg-protocol-surface text-protocol-text-muted'
          }`}
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Progress bar */}
      <div
        className={`h-2 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
        }`}
      >
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isBambiMode
              ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stats row */}
      {stats && (
        <div className="flex gap-3">
          <div
            className={`flex-1 p-3 rounded-xl ${
              isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
            }`}
          >
            <div className="flex items-center gap-2">
              <Flame
                className={`w-4 h-4 ${
                  isBambiMode ? 'text-pink-500' : 'text-orange-500'
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                {stats.currentStreak} day streak
              </span>
            </div>
          </div>
          <div
            className={`flex-1 p-3 rounded-xl ${
              isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trophy
                className={`w-4 h-4 ${
                  isBambiMode ? 'text-pink-500' : 'text-amber-500'
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                {stats.totalCompleted} total
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Skip warning */}
      {showSkipWarning && (
        <div
          className={`p-3 rounded-xl flex items-center gap-3 ${
            isBambiMode
              ? 'bg-amber-50 border border-amber-200'
              : 'bg-amber-900/20 border border-amber-600/30'
          }`}
        >
          <AlertTriangle
            className={`w-5 h-5 flex-shrink-0 ${
              isBambiMode ? 'text-amber-600' : 'text-amber-400'
            }`}
          />
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                isBambiMode ? 'text-amber-800' : 'text-amber-300'
              }`}
            >
              {weeklySkipCount} skips this week
            </p>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-amber-600' : 'text-amber-400/70'
              }`}
            >
              3 skips = streak freeze warning
            </p>
          </div>
          <button
            onClick={dismissSkipWarning}
            className={`text-xs px-2 py-1 rounded ${
              isBambiMode
                ? 'bg-amber-200 text-amber-700'
                : 'bg-amber-800/50 text-amber-300'
            }`}
          >
            OK
          </button>
        </div>
      )}

      {/* All done celebration */}
      {allDone && (
        <div
          className={`p-6 rounded-xl text-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-100 to-fuchsia-100'
              : 'bg-gradient-to-br from-emerald-900/30 to-teal-900/30'
          }`}
        >
          <div className="text-4xl mb-2">✨</div>
          <p
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-emerald-300'
            }`}
          >
            All tasks complete!
          </p>
          <p
            className={`text-sm mt-1 ${
              isBambiMode ? 'text-pink-500' : 'text-emerald-400/70'
            }`}
          >
            Good girl. You obeyed perfectly today.
          </p>
        </div>
      )}

      {/* Task list */}
      {todayTasks.length === 0 ? (
        <div
          className={`p-8 rounded-xl text-center ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
          }`}
        >
          <p
            className={`${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}
          >
            No tasks assigned yet.
          </p>
          <p
            className={`text-sm mt-1 opacity-70 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Tasks will appear once the system knows you better.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {todayTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={(feltGood) => complete(task.id, feltGood)}
              onIncrement={() => incrementProgress(task.id)}
              onSkip={() => skip(task.id)}
              isCompleting={completingTaskId === task.id}
              isSkipping={skippingTaskId === task.id}
            />
          ))}
        </div>
      )}

      {/* Completion celebration */}
      {lastCompletedTask && (
        <TaskCompletionCelebration
          affirmation={lastCompletedTask.affirmation}
          pointsEarned={lastCompletedTask.pointsEarned}
          onDismiss={dismissCompletion}
        />
      )}
    </div>
  );
}
