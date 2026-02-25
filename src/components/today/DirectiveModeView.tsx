// DirectiveModeView - Single-card directive mode for Handler-led experience
// Feature 6: Replaces task list with one directive at a time
// When enabled, shows DirectiveCard instead of the full task list

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DirectiveCard, EmptyDirective, LoadingDirective } from '../DirectiveCard';
import { useDirectiveCoach, type UserStateForCoach } from '../../hooks/useDirectiveCoach';
import { useHandlerV2 } from '../../hooks/useHandlerV2';
import { useAuth } from '../../context/AuthContext';
import type { DailyTask } from '../../types/task-bank';
import type { HandlerIntervention } from '../../lib/handler-v2';

interface DirectiveModeViewProps {
  pendingTasks: DailyTask[];
  userState: {
    denialDay: number;
    arousalLevel: number;
    mood: number;
    ginaHome: boolean;
    streakDays: number;
    lastTask?: string;
  };
  onTaskComplete: (taskId: string, feltGood?: boolean) => void;
  onTaskSkip: (taskId: string) => void;
  onRefresh: () => void;
  onIntervention?: (intervention: HandlerIntervention) => void;
}

export function DirectiveModeView({
  pendingTasks,
  userState,
  onTaskComplete,
  onTaskSkip,
  onRefresh,
  onIntervention,
}: DirectiveModeViewProps) {
  const { user } = useAuth();
  const { fetchTaskFraming, isLoading: isCoachLoading, getTimeOfDay } = useDirectiveCoach();
  const { enhanceTask, checkForIntervention } = useHandlerV2();

  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [enhancedCopy, setEnhancedCopy] = useState<{
    instruction: string;
    subtext: string;
    affirmation: string;
    layer: 1 | 2 | 3;
  } | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Clamp index when pendingTasks shrinks (e.g. after completing a task with prior declines)
  useEffect(() => {
    if (currentTaskIndex >= pendingTasks.length && pendingTasks.length > 0) {
      setCurrentTaskIndex(0);
    }
  }, [pendingTasks.length, currentTaskIndex]);

  // Get current task
  const safeIndex = Math.min(currentTaskIndex, Math.max(0, pendingTasks.length - 1));
  const currentDailyTask = pendingTasks[safeIndex];
  const currentTask = currentDailyTask?.task;

  // Convert user state to coach format (memoized to prevent infinite re-renders)
  const coachUserState: UserStateForCoach = useMemo(() => ({
    user_id: user?.id || '',
    denial_day: userState.denialDay,
    arousal_level: userState.arousalLevel,
    mood: getMoodString(userState.mood),
    time_of_day: getTimeOfDay(),
    gina_present: userState.ginaHome,
    streak_days: userState.streakDays,
    last_task: userState.lastTask,
  }), [user?.id, userState.denialDay, userState.arousalLevel, userState.mood, userState.ginaHome, userState.streakDays, userState.lastTask, getTimeOfDay]);

  // Fetch coach message when current task changes
  const loadCoachMessage = useCallback(async () => {
    if (!currentTask || !user?.id) {
      setIsInitializing(false);
      return;
    }

    setIsInitializing(true);
    const message = await fetchTaskFraming(currentTask, coachUserState);
    setCoachMessage(message || 'Good girl. Here\'s your next task.');
    setIsInitializing(false);

    // Enhance task copy via Handler (non-blocking, runs after init completes)
    enhanceTask(currentTask).then(setEnhancedCopy).catch(() => {});
  }, [currentTask, user?.id, fetchTaskFraming, coachUserState, enhanceTask]);

  useEffect(() => {
    loadCoachMessage();
  }, [loadCoachMessage]);

  // Handle task completion
  const handleComplete = useCallback(async (result?: boolean | number) => {
    if (!currentDailyTask) return;

    const feltGood = typeof result === 'boolean' ? result : true;
    onTaskComplete(currentDailyTask.id, feltGood);

    // Move to next task (parent will update pendingTasks)
    // If this was the last task, the list will be empty
    setCoachMessage(null);
    setEnhancedCopy(null);

    // Check for intervention after completion
    const intervention = await checkForIntervention();
    if (intervention) {
      onIntervention?.(intervention);
    }
  }, [currentDailyTask, onTaskComplete, checkForIntervention, onIntervention]);

  // Handle decline (pivot to next task or alternative)
  const handleDecline = useCallback(() => {
    // The DirectiveCard handles pivot internally
    // After pivot is completed, move to next task
    if (currentTaskIndex < pendingTasks.length - 1) {
      setCurrentTaskIndex(prev => prev + 1);
    } else {
      // Last task — skip it and reset index so we don't loop
      if (currentDailyTask) {
        onTaskSkip(currentDailyTask.id);
      }
      setCurrentTaskIndex(0);
    }
    setCoachMessage(null);
    setEnhancedCopy(null);
  }, [currentTaskIndex, pendingTasks.length, currentDailyTask, onTaskSkip]);

  // Loading state
  if (isInitializing || isCoachLoading) {
    return <LoadingDirective />;
  }

  // No pending tasks
  if (!currentTask || pendingTasks.length === 0) {
    return (
      <EmptyDirective
        message="You're caught up"
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className="px-4">
      <DirectiveCard
        coachMessage={coachMessage || 'Good girl. Here\'s what you\'re doing now.'}
        task={currentTask}
        enhancedCopy={enhancedCopy}
        userState={{
          user_id: coachUserState.user_id,
          denial_day: coachUserState.denial_day,
          arousal_level: coachUserState.arousal_level,
          mood: coachUserState.mood,
          time_of_day: coachUserState.time_of_day,
          gina_present: coachUserState.gina_present,
          streak_days: coachUserState.streak_days,
        }}
        onComplete={handleComplete}
        onDecline={handleDecline}
        canDecline={true}
      />

      {/* Progress indicator */}
      {pendingTasks.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {pendingTasks.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === safeIndex
                  ? 'bg-pink-500'
                  : index < safeIndex
                    ? 'bg-pink-300'
                    : 'bg-gray-600'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Helper to convert numeric mood to string
function getMoodString(mood: number): string {
  if (mood <= 2) return 'low';
  if (mood <= 4) return 'struggling';
  if (mood <= 6) return 'neutral';
  if (mood <= 8) return 'good';
  return 'great';
}

export default DirectiveModeView;
