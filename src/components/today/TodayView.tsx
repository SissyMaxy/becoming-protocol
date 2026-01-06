/**
 * Today View
 * Redesigned immersive daily task experience
 * With weekend Gina integration support and goal-based training
 */

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, Heart, Target } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useTaskBank } from '../../hooks/useTaskBank';
import { useArousalState } from '../../hooks/useArousalState';
import { useWeekend } from '../../hooks/useWeekend';
import { useGoals } from '../../hooks/useGoals';
import { TodayHeader } from './TodayHeader';
import { ProgressRing } from './ProgressRing';
import { TaskCardNew } from './TaskCardNew';
import { CompletionCelebration } from './CompletionCelebration';
import { AllCompleteCelebration } from './AllCompleteCelebration';
import { WeekendHeader } from '../weekend/WeekendHeader';
import { WeekendActivityCard } from '../weekend/WeekendActivityCard';
import { GinaFramingModal } from '../weekend/GinaFramingModal';
import { WeekendFeedbackModal } from '../weekend/WeekendFeedbackModal';
import { GoalCard, GraduationCelebration, GoalAbandonmentGauntlet, StreakRiskBanner, GoalAffirmationModal } from '../goals';
import { TimeRatchetsDisplay } from '../ratchets/TimeRatchets';
import { ArousalPlannerSection } from '../arousal-planner';
import type { WeekendActivity, ActivityFeedback } from '../../types/weekend';
import type { Goal, GoalCompletionInput } from '../../types/goals';

export function TodayView() {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const { metrics } = useArousalState();
  const {
    todayTasks,
    isLoading,
    error,
    completingTaskId,
    lastCompletedTask,
    skippingTaskId,
    weeklySkipCount,
    showSkipWarning,
    undoingTaskId,
    loadTasks,
    complete,
    incrementProgress,
    skip,
    undo,
    dismissCompletion,
    dismissSkipWarning,
  } = useTaskBank();

  // Weekend system
  const {
    isWeekendDay,
    weekendDay,
    isLoading: isWeekendLoading,
    currentPlan,
    todaysActivities,
    integrationProgress,
    completeActivity: completeWeekendActivity,
    skipActivity: skipWeekendActivity,
    getActivityDetails,
    getPlannedActivity,
  } = useWeekend();

  const [showAllComplete, setShowAllComplete] = useState(false);

  // Goals system
  const {
    todaysGoals,
    allGoals,
    loading: goalsLoading,
    initialized: goalsInitialized,
    streakRisk,
    goalNeedingAffirmation,
    clearAffirmationTrigger,
    completeGoal,
    abandonGoal,
    pauseGoal,
    initializeGoals,
    refresh: refreshGoals,
  } = useGoals();

  // Auto-initialize goals if user has none
  useEffect(() => {
    if (goalsInitialized && allGoals.length === 0 && !goalsLoading) {
      initializeGoals();
    }
  }, [goalsInitialized, allGoals.length, goalsLoading, initializeGoals]);

  // Goal modal states
  const [abandoningGoal, setAbandoningGoal] = useState<Goal | null>(null);
  const [graduatedGoal, setGraduatedGoal] = useState<Goal | null>(null);

  // Weekend modal states
  const [framingActivity, setFramingActivity] = useState<WeekendActivity | null>(null);
  const [feedbackActivity, setFeedbackActivity] = useState<WeekendActivity | null>(null);
  const [completingWeekendActivityId, setCompletingWeekendActivityId] = useState<string | null>(null);
  const [skippingWeekendActivityId, setSkippingWeekendActivityId] = useState<string | null>(null);

  // Get denial days from arousal metrics
  const denialDays = metrics?.currentStreakDays || 0;

  // Weekend activity handlers
  const handleShowFraming = (activityId: string) => {
    const activity = getActivityDetails(activityId);
    if (activity) {
      setFramingActivity(activity);
    }
  };

  const handleStartWeekendActivity = () => {
    // Close framing modal - activity is now "in progress"
    setFramingActivity(null);
  };

  const handleCompleteWeekendActivity = (activityId: string) => {
    const activity = getActivityDetails(activityId);
    if (activity) {
      setFeedbackActivity(activity);
    }
  };

  const handleSubmitFeedback = async (feedback: ActivityFeedback) => {
    if (!feedbackActivity) return;

    setCompletingWeekendActivityId(feedbackActivity.activityId);
    try {
      await completeWeekendActivity(feedbackActivity.activityId, feedback);
      if (isBambiMode) {
        triggerHearts?.();
      }
    } finally {
      setCompletingWeekendActivityId(null);
      setFeedbackActivity(null);
    }
  };

  const handleSkipWeekendActivity = async (activityId: string) => {
    setSkippingWeekendActivityId(activityId);
    try {
      await skipWeekendActivity(activityId);
    } finally {
      setSkippingWeekendActivityId(null);
    }
  };

  // Goal handlers
  const getFullGoal = (goalId: string): Goal | undefined => {
    return allGoals.find(g => g.id === goalId);
  };

  const handleGoalComplete = async (input: GoalCompletionInput) => {
    const result = await completeGoal(input);
    if (result && isBambiMode) {
      triggerHearts?.();
    }
    // Check if goal just graduated
    const goal = getFullGoal(input.goalId);
    if (goal && goal.consecutiveDays + 1 >= goal.graduationThreshold) {
      setTimeout(() => {
        const graduated = allGoals.find(g => g.id === input.goalId && g.status === 'graduated');
        if (graduated) {
          setGraduatedGoal(graduated);
        }
      }, 500);
    }
  };

  const handleGoalAbandon = (goalId: string) => {
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

  const handleGoalPause = async (goalId: string) => {
    await pauseGoal(goalId);
  };

  // Calculate progress (including weekend activities and goals)
  const completedCount = todayTasks.filter(t => t.status === 'completed').length;
  const totalCount = todayTasks.length;
  const pendingTasks = todayTasks.filter(t => t.status === 'pending');
  const completedTasks = todayTasks.filter(t => t.status === 'completed');
  const skippedTasks = todayTasks.filter(t => t.status === 'skipped');

  // Goals progress
  const pendingGoals = todaysGoals.filter(g => !g.completedToday);
  const completedGoals = todaysGoals.filter(g => g.completedToday);

  // All done state (tasks + goals)
  const allTasksDone = totalCount > 0 && completedCount === totalCount;
  const allGoalsDone = todaysGoals.length > 0 && completedGoals.length === todaysGoals.length;
  const allDone = (totalCount === 0 || allTasksDone) && (todaysGoals.length === 0 || allGoalsDone);

  // Trigger hearts and celebration on completion in Bambi mode
  useEffect(() => {
    if (lastCompletedTask && isBambiMode) {
      triggerHearts?.();
    }
  }, [lastCompletedTask, isBambiMode, triggerHearts]);

  // Show all complete celebration when everything is done
  useEffect(() => {
    if (allDone && completedCount > 0) {
      const timer = setTimeout(() => setShowAllComplete(true), 500);
      return () => clearTimeout(timer);
    }
  }, [allDone, completedCount]);

  // Combined loading state
  const isAnyLoading = isLoading || goalsLoading || (isWeekendDay && isWeekendLoading);

  if (isAnyLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2
          className={`w-10 h-10 animate-spin mb-4 ${
            isWeekendDay
              ? 'text-rose-500'
              : isBambiMode
                ? 'text-pink-500'
                : 'text-emerald-500'
          }`}
        />
        <p className={`text-sm ${
          isWeekendDay
            ? 'text-rose-600'
            : isBambiMode
              ? 'text-pink-600'
              : 'text-protocol-text-muted'
        }`}>
          {isWeekendDay ? 'Loading weekend activities...' : 'Loading your tasks...'}
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
          <p className={`font-semibold ${
            isBambiMode ? 'text-red-700' : 'text-red-400'
          }`}>
            Failed to load tasks
          </p>
          <p className={`text-sm mt-2 opacity-70 ${
            isBambiMode ? 'text-red-600' : 'text-red-400'
          }`}>
            {error}
          </p>
          <button
            onClick={loadTasks}
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

  // Weekend activity categorization
  const pendingWeekendActivities = todaysActivities.filter(a => a.status === 'pending');
  const completedWeekendActivities = todaysActivities.filter(a => a.status === 'completed');
  const skippedWeekendActivities = todaysActivities.filter(a => a.status === 'skipped');

  // Combined counts for progress ring (tasks + goals + weekend activities)
  const combinedCompleted = completedCount + completedGoals.length + completedWeekendActivities.length;
  const combinedTotal = totalCount + todaysGoals.length + todaysActivities.length;

  // Refresh all data
  const handleRefresh = () => {
    loadTasks();
    refreshGoals();
  };

  return (
    <div className={`min-h-screen pb-24 ${
      isWeekendDay
        ? 'bg-gradient-to-b from-rose-50 to-white dark:from-rose-950/20 dark:to-protocol-bg'
        : isBambiMode
          ? 'bg-gradient-to-b from-pink-50 to-white'
          : 'bg-protocol-bg'
    }`}>
      {/* Header section - Weekend or Regular */}
      <div className="p-4">
        {isWeekendDay && weekendDay ? (
          <WeekendHeader
            weekendDay={weekendDay}
            activitiesRemaining={pendingWeekendActivities.length + pendingTasks.length}
            activitiesTotal={todaysActivities.length + totalCount}
            integrationProgress={integrationProgress}
            weekendFocus={currentPlan?.weekendFocus}
          />
        ) : (
          <TodayHeader
            denialDays={denialDays}
            tasksRemaining={totalCount - completedCount}
            tasksTotal={totalCount}
          />
        )}
      </div>

      {/* Progress and refresh row */}
      <div className="px-4 py-6 flex items-center justify-between">
        <ProgressRing
          completed={combinedCompleted}
          total={combinedTotal}
        />

        <button
          onClick={handleRefresh}
          className={`p-3 rounded-xl transition-colors ${
            isWeekendDay
              ? 'hover:bg-rose-100 text-rose-500 dark:hover:bg-rose-900/30 dark:text-rose-400'
              : isBambiMode
                ? 'hover:bg-pink-100 text-pink-500'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
          }`}
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Skip warning */}
      {showSkipWarning && (
        <div className="px-4 mb-4">
          <div
            className={`p-4 rounded-xl flex items-center gap-3 ${
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
                className={`text-xs mt-0.5 ${
                  isBambiMode ? 'text-amber-600' : 'text-amber-400/70'
                }`}
              >
                Too many skips will freeze your streak
              </p>
            </div>
            <button
              onClick={dismissSkipWarning}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                isBambiMode
                  ? 'bg-amber-200 text-amber-700 hover:bg-amber-300'
                  : 'bg-amber-800/50 text-amber-300 hover:bg-amber-800/70'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Streak Risk Banner - Skip ANY goal = streak breaks */}
      {streakRisk && streakRisk.isAtRisk && (
        <div className="px-4 mb-4">
          <StreakRiskBanner
            incompleteGoals={streakRisk.incompleteGoals}
            totalGoals={streakRisk.totalGoals}
            currentStreak={streakRisk.currentStreak}
            pointsAtRisk={streakRisk.pointsAtRisk}
            hoursRemaining={streakRisk.hoursRemaining}
          />
        </div>
      )}

      {/* Time Anchors - Sunk cost awareness */}
      {!isWeekendDay && (
        <div className="px-4 mb-4">
          <TimeRatchetsDisplay compact />
        </div>
      )}

      {/* Arousal Planner Section */}
      {!isWeekendDay && (
        <div className="px-4">
          <ArousalPlannerSection />
        </div>
      )}

      {/* Goals Section */}
      {todaysGoals.length > 0 && (
        <div className="px-4 space-y-4 mb-6">
          {/* Section header */}
          <div className="flex items-center gap-2 px-1">
            <Target className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            <p className={`text-xs uppercase tracking-wider font-semibold ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}>
              Today's Goals
            </p>
            <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
              ({completedGoals.length}/{todaysGoals.length})
            </span>
          </div>

          {/* Pending Goals */}
          {pendingGoals.map((goal) => (
            <GoalCard
              key={goal.goalId}
              goal={goal}
              onComplete={handleGoalComplete}
              onPause={handleGoalPause}
              onAbandon={handleGoalAbandon}
            />
          ))}

          {/* Completed Goals */}
          {completedGoals.length > 0 && pendingGoals.length > 0 && (
            <div className={`pt-2 border-t ${isBambiMode ? 'border-pink-200' : 'border-protocol-border'}`}>
              <p className={`text-xs uppercase tracking-wider font-semibold px-1 mb-3 ${
                isBambiMode ? 'text-green-500' : 'text-green-400'
              }`}>
                Goals Achieved
              </p>
              {completedGoals.map((goal) => (
                <GoalCard
                  key={goal.goalId}
                  goal={goal}
                  onComplete={handleGoalComplete}
                  onPause={handleGoalPause}
                  onAbandon={handleGoalAbandon}
                />
              ))}
            </div>
          )}

          {/* All goals done message */}
          {pendingGoals.length === 0 && completedGoals.length > 0 && (
            <div className={`p-4 rounded-xl text-center ${
              isBambiMode
                ? 'bg-green-50 border border-green-200'
                : 'bg-green-900/20 border border-green-700/30'
            }`}>
              <p className={`font-medium ${isBambiMode ? 'text-green-700' : 'text-green-400'}`}>
                All goals achieved today!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="px-4 space-y-4">
        {/* Weekend Activities Section */}
        {isWeekendDay && todaysActivities.length > 0 && (
          <>
            {/* Pending Weekend Activities */}
            {pendingWeekendActivities.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Heart className="w-4 h-4 text-rose-500" />
                  <p className="text-xs uppercase tracking-wider font-semibold text-rose-500">
                    Activities with Gina
                  </p>
                </div>
                {pendingWeekendActivities.map((planned, index) => {
                  const activity = getActivityDetails(planned.activityId);
                  if (!activity) return null;
                  return (
                    <WeekendActivityCard
                      key={planned.activityId}
                      activity={activity}
                      plannedActivity={planned}
                      onComplete={() => handleCompleteWeekendActivity(planned.activityId)}
                      onSkip={() => handleSkipWeekendActivity(planned.activityId)}
                      onShowFraming={() => handleShowFraming(planned.activityId)}
                      isCompleting={completingWeekendActivityId === planned.activityId}
                      isSkipping={skippingWeekendActivityId === planned.activityId}
                      isFirst={index === 0 && pendingTasks.length === 0}
                    />
                  );
                })}
              </div>
            )}

            {/* Completed Weekend Activities */}
            {completedWeekendActivities.length > 0 && (
              <div className="space-y-3 mt-6">
                <p className="text-xs uppercase tracking-wider font-semibold px-1 text-rose-400">
                  Completed with Gina
                </p>
                {completedWeekendActivities.map(planned => {
                  const activity = getActivityDetails(planned.activityId);
                  if (!activity) return null;
                  return (
                    <WeekendActivityCard
                      key={planned.activityId}
                      activity={activity}
                      plannedActivity={planned}
                      onComplete={() => {}}
                      onSkip={() => {}}
                      onShowFraming={() => {}}
                      isCompleting={false}
                      isSkipping={false}
                    />
                  );
                })}
              </div>
            )}

            {/* Skipped Weekend Activities */}
            {skippedWeekendActivities.length > 0 && (
              <div className="space-y-3 mt-6">
                <p className="text-xs uppercase tracking-wider font-semibold px-1 text-gray-400">
                  Skipped Activities
                </p>
                {skippedWeekendActivities.map(planned => {
                  const activity = getActivityDetails(planned.activityId);
                  if (!activity) return null;
                  return (
                    <WeekendActivityCard
                      key={planned.activityId}
                      activity={activity}
                      plannedActivity={planned}
                      onComplete={() => {}}
                      onSkip={() => {}}
                      onShowFraming={() => {}}
                      isCompleting={false}
                      isSkipping={false}
                    />
                  );
                })}
              </div>
            )}

            {/* Divider between weekend activities and regular tasks */}
            {(pendingTasks.length > 0 || completedTasks.length > 0) && (
              <div className="py-4">
                <div className={`h-px ${
                  isBambiMode ? 'bg-pink-200' : 'bg-protocol-border'
                }`} />
              </div>
            )}
          </>
        )}

        {/* Regular Tasks */}
        {todayTasks.length === 0 && (!isWeekendDay || todaysActivities.length === 0) ? (
          <div
            className={`p-8 rounded-2xl text-center ${
              isBambiMode ? 'bg-white shadow-sm' : 'bg-protocol-surface'
            }`}
          >
            <div className="text-4xl mb-3">{isWeekendDay ? '💕' : '🌸'}</div>
            <p
              className={`font-medium ${
                isWeekendDay
                  ? 'text-rose-700'
                  : isBambiMode
                    ? 'text-pink-700'
                    : 'text-protocol-text'
              }`}
            >
              {isWeekendDay ? 'No activities planned yet' : 'No tasks assigned yet'}
            </p>
            <p
              className={`text-sm mt-2 ${
                isWeekendDay
                  ? 'text-rose-500'
                  : isBambiMode
                    ? 'text-pink-500'
                    : 'text-protocol-text-muted'
              }`}
            >
              {isWeekendDay
                ? 'Weekend activities will appear as the system learns your preferences.'
                : 'Tasks will appear once the system knows you better.'}
            </p>
          </div>
        ) : todayTasks.length > 0 && (
          <>
            {/* Section: Pending tasks */}
            {pendingTasks.length > 0 && (
              <div className="space-y-3">
                <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  {isWeekendDay ? 'Solo Tasks' : pendingTasks.length === 1 ? 'Your task' : `${pendingTasks.length} tasks remaining`}
                </p>
                {pendingTasks.map((task, index) => (
                  <TaskCardNew
                    key={task.id}
                    task={task}
                    onComplete={(feltGood) => complete(task.id, feltGood)}
                    onIncrement={() => incrementProgress(task.id)}
                    onSkip={() => skip(task.id)}
                    isCompleting={completingTaskId === task.id}
                    isSkipping={skippingTaskId === task.id}
                    isFirst={index === 0 && pendingWeekendActivities.length === 0}
                  />
                ))}
              </div>
            )}

            {/* Section: Completed tasks */}
            {completedTasks.length > 0 && (
              <div className="space-y-3 mt-6">
                <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  Completed
                </p>
                {completedTasks.map(task => (
                  <TaskCardNew
                    key={task.id}
                    task={task}
                    onComplete={() => {}}
                    onSkip={() => {}}
                    onUndo={() => undo(task.id)}
                    isCompleting={false}
                    isSkipping={false}
                    isUndoing={undoingTaskId === task.id}
                  />
                ))}
              </div>
            )}

            {/* Section: Skipped tasks */}
            {skippedTasks.length > 0 && (
              <div className="space-y-3 mt-6">
                <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                  isBambiMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  Skipped
                </p>
                {skippedTasks.map(task => (
                  <TaskCardNew
                    key={task.id}
                    task={task}
                    onComplete={() => {}}
                    onSkip={() => {}}
                    isCompleting={false}
                    isSkipping={false}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Completion celebration (per-task) */}
      {lastCompletedTask && (
        <CompletionCelebration
          affirmation={lastCompletedTask.affirmation}
          pointsEarned={lastCompletedTask.pointsEarned}
          onDismiss={dismissCompletion}
        />
      )}

      {/* All complete celebration */}
      {showAllComplete && (
        <AllCompleteCelebration
          tasksCompleted={completedCount}
          onDismiss={() => setShowAllComplete(false)}
        />
      )}

      {/* Weekend: Gina Framing Modal */}
      {framingActivity && (
        <GinaFramingModal
          activity={framingActivity}
          plannedActivity={getPlannedActivity(framingActivity.activityId)}
          alternativeActivity={
            getPlannedActivity(framingActivity.activityId)?.alternativeActivity
              ? getActivityDetails(getPlannedActivity(framingActivity.activityId)!.alternativeActivity!)
              : undefined
          }
          onClose={() => setFramingActivity(null)}
          onStartActivity={handleStartWeekendActivity}
        />
      )}

      {/* Weekend: Feedback Modal */}
      {feedbackActivity && (
        <WeekendFeedbackModal
          activity={feedbackActivity}
          onSubmit={handleSubmitFeedback}
          onCancel={() => setFeedbackActivity(null)}
        />
      )}

      {/* Goal: Abandonment Gauntlet */}
      {abandoningGoal && (
        <GoalAbandonmentGauntlet
          goal={abandoningGoal}
          onConfirm={handleConfirmAbandon}
          onCancel={() => setAbandoningGoal(null)}
        />
      )}

      {/* Goal: Graduation Celebration */}
      {graduatedGoal && (
        <GraduationCelebration
          goal={graduatedGoal}
          onClose={() => setGraduatedGoal(null)}
        />
      )}

      {/* Goal: Identity Affirmation (at milestones - Day 10, 20, 30) */}
      {goalNeedingAffirmation && (
        <GoalAffirmationModal
          goal={goalNeedingAffirmation}
          onComplete={() => {
            clearAffirmationTrigger();
            refreshGoals();
          }}
        />
      )}
    </div>
  );
}
