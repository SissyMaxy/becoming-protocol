/**
 * Today View
 * Redesigned immersive daily task experience
 * With weekend Gina integration support and goal-based training
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, AlertTriangle, Heart, Target, Moon, FileText, ChevronRight, Clock, Star, DollarSign, Send, Headphones, Camera } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useOpacity } from '../../context/OpacityContext';
import { supabase } from '../../lib/supabase';
import { useTaskBank } from '../../hooks/useTaskBank';
import { useArousalState } from '../../hooks/useArousalState';
import { useWeekend } from '../../hooks/useWeekend';
import { useGoals } from '../../hooks/useGoals';
import { useLovense } from '../../hooks/useLovense';
import { useContentPipeline } from '../../hooks/useContentPipeline';
import { useHypnoSession } from '../../hooks/useHypnoSession';
import { PostPackCard } from '../content/PostPackCard';
import { HypnoSessionCard } from '../hypno/HypnoSessionCard';
import { HYPNO_TASK_CODES } from '../../lib/content/hypno-tasks';
import { useShootFlow } from '../../hooks/useShootFlow';
import { ShootCard } from '../shoots/ShootCard';
import { ShotView } from '../shoots/ShotView';
import { MediaUpload } from '../shoots/MediaUpload';
import { ReadyToPost } from '../shoots/ReadyToPost';
// TodayHeader and ProgressRing removed — kill friction above first task
import { TaskCardNew } from './TaskCardNew';
// CompletionCelebration removed — affirmation is now inline in the card (CardPhase)
import { AllCompleteCelebration } from './AllCompleteCelebration';
import { HandlerMessage } from './HandlerMessage';
import { AmbientFeedbackStrip } from './AmbientFeedbackStrip';
import { ActiveSessionOverlay } from './ActiveSessionOverlay';
import { SessionContainer } from '../session';
import type { SessionConfig } from '../session';
import { QuickStateStrip } from './QuickStateStrip';
import { JournalPrompt } from './JournalPrompt';
import { getTaskVariant, VoiceTaskEnrichment, EdgeTaskEnrichment, HypnoTaskEnrichment } from './TaskCardVariants';
import { CommitmentReminder } from './CommitmentReminder';
// DirectiveModeView and Tooltip removed — no mode toggles in main view
import { useUserState } from '../../hooks/useUserState';
import type { PriorityAction } from './FocusedActionCard';
import { getMorningPersonalization } from '../../lib/morning-personalization';
import type { MorningPersonalization } from '../../lib/morning-personalization';
import { WeekendHeader } from '../weekend/WeekendHeader';
import { WeekendActivityCard } from '../weekend/WeekendActivityCard';
import { GinaFramingModal } from '../weekend/GinaFramingModal';
import { WeekendFeedbackModal } from '../weekend/WeekendFeedbackModal';
import { GoalCard, GraduationCelebration, GoalAbandonmentGauntlet, GoalAffirmationModal } from '../goals';
import { TimeRatchetsDisplay } from '../ratchets/TimeRatchets';
import { ArousalPlannerSection } from '../arousal-planner';
// NextBestActionWidget removed - consolidated into FocusedActionCard
import { StreakWarningsWidget } from '../streak';
import { BodyDashboard } from '../body';
import { MicroTaskWidget } from '../micro-tasks';
import { HandlerDirective } from '../handler/HandlerDirective';
import { getActiveBriefs, type ContentBrief } from '../../lib/handler-v2/content-engine';
import { useAuth } from '../../context/AuthContext';
import { useVoiceTraining } from '../../hooks/useVoiceTraining';
import { useStandingPermission } from '../../hooks/useStandingPermission';
import { VaultSwipe } from '../vault/VaultSwipe';
import type { WeekendActivity, ActivityFeedback } from '../../types/weekend';
import type { Goal, GoalCompletionInput } from '../../types/goals';

export function TodayView() {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const { canSee } = useOpacity();
  useArousalState(); // hook still needed for side effects
  const { user } = useAuth();

  // Handler briefs state
  const [activeBriefs, setActiveBriefs] = useState<ContentBrief[]>([]);
  const [briefsLoaded, setBriefsLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    getActiveBriefs(user.id).then(briefs => {
      setActiveBriefs(briefs);
      setBriefsLoaded(true);
    }).catch(() => setBriefsLoaded(true));
  }, [user?.id]);

  // v2 User State - central state tracking
  const {
    userState,
    isLoading: isUserStateLoading,
    timeOfDay,
    quickUpdate,
    recordTaskCompletion,
  } = useUserState();
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
    prescribeNext,
    refreshPrescriptions,
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

  // Lovense connection status (used by ActiveSessionOverlay)
  useLovense();

  // Content pipeline — pending post packs for manual posting
  const { pendingPostPacks, markPosted } = useContentPipeline();

  // Hypno sessions — active session display
  const { activeSession: activeHypnoSession } = useHypnoSession();

  // Shoot flow — prescribed content shoots
  const shootFlow = useShootFlow();

  // Voice training stats for task card variants
  const { stats: voiceStats } = useVoiceTraining();

  // Vault — pending content count + standing permission
  const { granted: vaultFullAutonomy } = useStandingPermission('content_full_autonomy');
  const [vaultPendingCount, setVaultPendingCount] = useState(0);
  const [showVault, setShowVault] = useState(false);

  useEffect(() => {
    if (!user?.id || vaultFullAutonomy) return;
    supabase
      .from('content_vault')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .then(({ count }) => {
        setVaultPendingCount(count ?? 0);
      });
  }, [user?.id, vaultFullAutonomy]);

  const [showAllComplete, setShowAllComplete] = useState(false);

  // Morning personalization for Handler message
  const [morningData, setMorningData] = useState<MorningPersonalization | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    getMorningPersonalization(user.id).then(setMorningData).catch(() => {});
  }, [user?.id]);

  // Completion counter for Handler message reactivity
  const completionCountRef = useRef(0);

  // Handler message refresh: re-fetch morning personalization
  const refreshHandlerMessage = useCallback(() => {
    if (!user?.id) return;
    getMorningPersonalization(user.id).then(setMorningData).catch(() => {});
  }, [user?.id]);

  // QuickStateStrip callback: re-filter tasks and refresh Handler on significant changes
  const handleStateChanged = useCallback(() => {
    // Debounce slightly to let state persist before refiltering
    setTimeout(() => {
      refreshPrescriptions();
    }, 300);
  }, [refreshPrescriptions]);

  // Active session - shows step-by-step guidance with vibration control
  const [activeSession, setActiveSession] = useState<PriorityAction | null>(null);

  // Immersive edge session (v2)
  const [edgeSessionConfig, setEdgeSessionConfig] = useState<SessionConfig | null>(null);

  // Goals system
  const {
    todaysGoals,
    allGoals,
    loading: goalsLoading,
    initialized: goalsInitialized,
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

  // GinaHome: hide intimate content when Gina is home (gap #19)
  const isGinaHome = userState?.ginaHome ?? false;

  // Evening check-in state (gap #5) - effect is placed after allDone is computed
  const currentHour = new Date().getHours();
  const isEvening = currentHour >= 19 && currentHour < 23;
  const [showEveningCheckin, setShowEveningCheckin] = useState(false);
  const [eveningMood, setEveningMood] = useState<number | null>(null);
  const [eveningSubmitted, setEveningSubmitted] = useState(false);

  // Current mood from mood_checkins
  const [currentMood, setCurrentMood] = useState<number | undefined>(undefined);

  // Fetch latest mood from mood_checkins
  const fetchLatestMood = useCallback(async () => {
    if (!userState?.userId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('mood_checkins')
      .select('score')
      .eq('user_id', userState.userId)
      .gte('recorded_at', today.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching mood:', error);
      return;
    }

    if (data?.score) {
      setCurrentMood(data.score);
    }
  }, [userState?.userId]);

  useEffect(() => {
    fetchLatestMood();
  }, [fetchLatestMood]);

  const handleEveningCheckin = async (mood: number) => {
    setEveningMood(mood);
    await quickUpdate({ mood });
    setCurrentMood(mood);
    setEveningSubmitted(true);
    setTimeout(() => setShowEveningCheckin(false), 2000);
  };

  // Wrap quickUpdate to also update local mood state (optimistic update)
  const handleQuickUpdate = (update: Parameters<typeof quickUpdate>[0]) => {
    // Update UI immediately
    if (update.mood !== undefined) {
      setCurrentMood(update.mood);
    }
    // Save to database in background
    quickUpdate(update);

    // Refresh Handler message on Gina toggle (significant state change)
    if (update.ginaHome !== undefined || update.ginaAsleep !== undefined) {
      refreshHandlerMessage();
    }
  };

  // Streak break recovery: show sunk cost prominently (gap #21)
  const isStreakBreakRecovery = useMemo(() => {
    return (userState?.streakDays ?? 0) === 0 && (userState?.longestStreak ?? 0) > 3;
  }, [userState?.streakDays, userState?.longestStreak]);

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

  // Show evening check-in prompt if all tasks done and it's evening (gap #5)
  useEffect(() => {
    if (isEvening && allDone && !eveningSubmitted) {
      setShowEveningCheckin(true);
    }
  }, [isEvening, allDone, eveningSubmitted]);

  // Trigger hearts on completion in Bambi mode + auto-dismiss
  useEffect(() => {
    if (lastCompletedTask) {
      if (isBambiMode) {
        triggerHearts?.();
      }
      // Auto-dismiss after card's affirmation phase completes (~2.5s)
      const timer = setTimeout(() => dismissCompletion(), 2500);
      return () => clearTimeout(timer);
    }
  }, [lastCompletedTask, isBambiMode, triggerHearts, dismissCompletion]);

  // Record task completion to user_state + prescribe next task + refresh Handler message
  useEffect(() => {
    if (lastCompletedTask) {
      // Find the completed task to get category and domain
      const completedTask = todayTasks.find(t => t.id === lastCompletedTask.id);
      if (completedTask?.task) {
        const { category, domain } = completedTask.task;

        // Update user_state tracking
        recordTaskCompletion(category, domain);

        // Prescribe a replacement task (reactive loop core)
        prescribeNext(category, domain);

        // Refresh Handler message every 3 completions
        completionCountRef.current += 1;
        if (completionCountRef.current % 3 === 0) {
          refreshHandlerMessage();
        }
      }
    }
  }, [lastCompletedTask, todayTasks, recordTaskCompletion, prescribeNext, refreshHandlerMessage]);

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

  // (FocusedActionCard removed — tasks shown directly in flat layout)

  // Complete an action (called when session ends or action has no steps)
  const handleCompleteAction = (action: PriorityAction) => {
    if (action.type === 'goal') {
      const goal = todaysGoals.find(g => g.goalId === action.id);
      if (goal && goal.drills.length > 0) {
        handleGoalComplete({
          goalId: goal.goalId,
          drillId: goal.drills[0].id, // Use first available drill
          notes: '',
          feltGood: true,
        });
      }
    } else if (action.type === 'task') {
      const task = todayTasks.find(t => t.id === action.id);
      if (task) {
        complete(task.id, true);
      }
    }
  };

  // Handle session completion
  const handleSessionComplete = () => {
    if (activeSession) {
      handleCompleteAction(activeSession);
    }
    setActiveSession(null);
  };

  // Handle session cancel
  const handleSessionCancel = () => {
    setActiveSession(null);
  };

  // Refresh all data
  const handleRefresh = () => {
    loadTasks();
    refreshGoals();
  };

  return (
    <div className={`min-h-screen pb-24 ${
      isWeekendDay
        ? 'bg-gradient-to-b from-rose-950/20 to-protocol-bg'
        : isBambiMode
          ? 'bg-gradient-to-b from-pink-50 to-white'
          : 'bg-protocol-bg'
    }`}>
      {/* ═══ Handler Message — persistent voice ═══ */}
      <div className="px-4 pt-4 pb-2">
        <HandlerMessage
          handlerMode={userState?.handlerMode ?? 'director'}
          greeting={morningData?.greeting}
          insight={morningData?.insight}
          motivationalMessage={morningData?.motivationalMessage}
          streakDays={userState?.streakDays ?? 0}
          denialDay={userState?.denialDay ?? 0}
          timeOfDay={timeOfDay ?? 'morning'}
        />
      </div>

      {/* ═══ Vault access — visible at opacity ≤ 1, hidden with full autonomy ═══ */}
      {canSee('vault_swipe') && !vaultFullAutonomy && vaultPendingCount > 0 && (
        <div className="px-4 pb-1 flex justify-end">
          <button
            onClick={() => setShowVault(true)}
            className="relative p-2 rounded-lg hover:bg-protocol-surface transition-colors"
            aria-label={`${vaultPendingCount} vault items pending`}
          >
            <Camera className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-protocol-accent text-[10px] text-white font-bold flex items-center justify-center px-1">
              {vaultPendingCount}
            </span>
          </button>
        </div>
      )}

      {/* ═══ Quick state strip — hidden at opacity level 3 ═══ */}
      {canSee('quick_state_strip') && userState && (
        <div className="px-4 pb-2">
          <QuickStateStrip
            currentMood={currentMood}
            currentArousal={userState.currentArousal}
            currentExecFunction={userState.estimatedExecFunction}
            ginaHome={userState.ginaHome}
            ginaAsleep={userState.ginaAsleep}
            onUpdate={handleQuickUpdate}
            onStateChanged={handleStateChanged}
            isLoading={isUserStateLoading}
          />
        </div>
      )}

      {/* ═══ Skip warning — always visible when triggered ═══ */}
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

      {/* ═══ Main content — always visible ═══ */}

          {/* Refresh */}
          <div className="px-4 mb-3 flex justify-end">
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-lg transition-colors ${
                isBambiMode
                  ? 'hover:bg-pink-100 text-pink-500'
                  : 'hover:bg-protocol-surface text-protocol-text-muted'
              }`}
              aria-label="Refresh tasks"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Weekend Header — only on weekends */}
          {isWeekendDay && weekendDay && (
            <div className="px-4 mb-4">
              <WeekendHeader
                weekendDay={weekendDay}
                activitiesRemaining={pendingWeekendActivities.length + pendingTasks.length}
                activitiesTotal={todaysActivities.length + totalCount}
                integrationProgress={integrationProgress}
                weekendFocus={currentPlan?.weekendFocus}
              />
            </div>
          )}

          {/* Commitment Reminders */}
          {!isGinaHome && (
            <div className="px-4 mb-4">
              <CommitmentReminder maxDisplay={2} />
            </div>
          )}

          {/* Handler Authority */}
          {!isGinaHome && (
            <div className="px-4 mb-4">
              <HandlerDirective
                onSessionStart={(sessionId, sessionType) => {
                  setActiveSession({
                    id: sessionId,
                    type: 'session',
                    title: `Handler Session: ${sessionType}`,
                    description: 'Handler has scheduled this session for you.',
                    steps: [
                      { label: 'Find a private space where you won\'t be disturbed.', durationMinutes: 1 },
                      { label: 'Get comfortable and focus on your breathing.', durationMinutes: 1, vibration: 'gentle_wave' },
                      { label: 'Begin the session. Let Handler guide you deeper.', durationMinutes: 5, vibration: 'building' },
                      { label: 'Session complete. Return when you\'re ready.', durationMinutes: 1, vibration: 'gentle_wave' },
                    ],
                  });
                }}
              />
            </div>
          )}

          {/* Handler Content Briefs */}
          {!isGinaHome && briefsLoaded && activeBriefs.length > 0 && (
            <div className="px-4 mb-4">
              <div className={`rounded-xl border overflow-hidden ${
                isBambiMode
                  ? 'bg-purple-50 border-purple-200'
                  : 'bg-purple-900/20 border-purple-700/30'
              }`}>
                <div className="flex items-center justify-between p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className={`w-4 h-4 ${isBambiMode ? 'text-purple-500' : 'text-purple-400'}`} />
                    <span className={`text-sm font-semibold ${
                      isBambiMode ? 'text-purple-700' : 'text-purple-300'
                    }`}>
                      Handler Briefs
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isBambiMode ? 'bg-purple-200 text-purple-600' : 'bg-purple-800 text-purple-300'
                    }`}>
                      {activeBriefs.length}
                    </span>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-handler'))}
                    className={`text-xs flex items-center gap-1 ${
                      isBambiMode ? 'text-purple-500 hover:text-purple-700' : 'text-purple-400 hover:text-purple-200'
                    }`}
                  >
                    Command Center <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1 px-3 pb-3">
                  {activeBriefs.slice(0, 3).map((brief) => (
                    <button
                      key={brief.id}
                      onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-handler'))}
                      className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                        isBambiMode
                          ? 'bg-white/60 hover:bg-white border border-purple-100'
                          : 'bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${
                          isBambiMode ? 'text-purple-600' : 'text-purple-300'
                        }`}>
                          Brief #{brief.briefNumber} — {brief.contentType}
                        </span>
                        {brief.rewardMoney && brief.rewardMoney > 0 && (
                          <span className={`text-xs flex items-center gap-0.5 ${
                            isBambiMode ? 'text-green-600' : 'text-green-400'
                          }`}>
                            <DollarSign className="w-3 h-3" />
                            {brief.rewardMoney}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs line-clamp-1 ${
                        isBambiMode ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {brief.instructions?.concept || brief.purpose}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {brief.deadline && (
                          <span className={`text-xs flex items-center gap-1 ${
                            isBambiMode ? 'text-amber-600' : 'text-amber-400'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {new Date(brief.deadline).toLocaleDateString()}
                          </span>
                        )}
                        <span className={`text-xs flex items-center gap-1 ${
                          isBambiMode ? 'text-purple-500' : 'text-purple-400'
                        }`}>
                          <Star className="w-3 h-3" />
                          {brief.difficulty || 'standard'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Post Packs */}
          {!isGinaHome && pendingPostPacks.length > 0 && (
            <div className="px-4 mb-4 space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Send className={`w-4 h-4 ${isBambiMode ? 'text-blue-500' : 'text-blue-400'}`} />
                <span className={`text-xs uppercase tracking-wider font-semibold ${
                  isBambiMode ? 'text-blue-500' : 'text-blue-400'
                }`}>
                  Post Packs
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isBambiMode ? 'bg-blue-200 text-blue-600' : 'bg-blue-800 text-blue-300'
                }`}>
                  {pendingPostPacks.length}
                </span>
              </div>
              {pendingPostPacks.map(dist => (
                <PostPackCard
                  key={dist.id}
                  distribution={dist}
                  onMarkPosted={markPosted}
                />
              ))}
            </div>
          )}

          {/* Hypno Session */}
          {!isGinaHome && activeHypnoSession && (
            <div className="px-4 mb-4">
              <div className="flex items-center gap-2 px-1 mb-2">
                <Headphones className={`w-4 h-4 ${isBambiMode ? 'text-purple-500' : 'text-purple-400'}`} />
                <span className={`text-xs uppercase tracking-wider font-semibold ${
                  isBambiMode ? 'text-purple-500' : 'text-purple-400'
                }`}>
                  Hypno Session
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isBambiMode ? 'bg-green-100 text-green-600' : 'bg-green-900/30 text-green-400'
                }`}>
                  Active
                </span>
              </div>
              <HypnoSessionCard
                taskCode={HYPNO_TASK_CODES.HYPNO_SESSION}
                activeSession={activeHypnoSession}
                onStart={() => window.dispatchEvent(new CustomEvent('navigate-to-hypno'))}
              />
            </div>
          )}

          {/* Streak Break Recovery */}
          {isStreakBreakRecovery && (
            <div className="px-4 mb-4">
              <div className={`p-4 rounded-xl border ${
                isBambiMode
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-amber-900/20 border-amber-700/30'
              }`}>
                <p className={`text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-amber-700' : 'text-amber-300'
                }`}>
                  Welcome back. Your {userState?.longestStreak || 0}-day streak is waiting to be rebuilt.
                </p>
                <p className={`text-xs ${
                  isBambiMode ? 'text-amber-600' : 'text-amber-400/70'
                }`}>
                  Start with just one task. That's all it takes.
                </p>
              </div>
              <div className="mt-2">
                <TimeRatchetsDisplay compact />
              </div>
            </div>
          )}

          {/* Evening Mood Check-in */}
          {showEveningCheckin && (
            <div className="px-4 mb-4">
              <div className={`p-4 rounded-xl border ${
                isBambiMode
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-indigo-900/20 border-indigo-700/30'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <Moon className={`w-4 h-4 ${isBambiMode ? 'text-indigo-500' : 'text-indigo-400'}`} />
                  <span className={`text-sm font-medium ${
                    isBambiMode ? 'text-indigo-700' : 'text-indigo-300'
                  }`}>
                    Evening Check-in
                  </span>
                </div>
                {eveningSubmitted ? (
                  <p className={`text-sm ${isBambiMode ? 'text-indigo-600' : 'text-indigo-400'}`}>
                    Mood logged. Rest well.
                  </p>
                ) : (
                  <>
                    <p className={`text-xs mb-3 ${isBambiMode ? 'text-indigo-500' : 'text-indigo-400/70'}`}>
                      How are you feeling right now?
                    </p>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(score => (
                        <button
                          key={score}
                          onClick={() => handleEveningCheckin(score * 2)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                            eveningMood === score * 2
                              ? 'bg-indigo-500 text-white'
                              : isBambiMode
                                ? 'bg-indigo-100 hover:bg-indigo-200 text-indigo-600'
                                : 'bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300'
                          }`}
                        >
                          {score === 1 ? 'Low' : score === 2 ? 'Meh' : score === 3 ? 'OK' : score === 4 ? 'Good' : 'Great'}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Body Dashboard (Protein + Exercise unified) */}
          <div className="px-4 mb-4">
            <BodyDashboard />
          </div>

          {/* Streak Warnings */}
          {!isWeekendDay && (
            <div className="px-4 mb-4">
              <StreakWarningsWidget compact />
            </div>
          )}

          {/* Time Anchors */}
          {!isWeekendDay && (
            <div className="px-4 mb-4">
              <TimeRatchetsDisplay compact />
            </div>
          )}

          {/* Micro-Task Widget */}
          {!isWeekendDay && (
            <div className="px-4 mb-4">
              <MicroTaskWidget />
            </div>
          )}

          {/* Exercise Widget — now part of BodyDashboard above */}

          {/* Arousal Planner */}
          {!isWeekendDay && !isGinaHome && (
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
            {/* Section: Prescribed Shoots */}
            {shootFlow.prescriptions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Camera className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
                  <span className={`text-xs uppercase tracking-wider font-semibold ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}>
                    {shootFlow.prescriptions.length === 1 ? 'Prescribed Shoot' : `${shootFlow.prescriptions.length} Shoots`}
                  </span>
                </div>
                {shootFlow.prescriptions.map(shoot => (
                  <ShootCard
                    key={shoot.id}
                    prescription={shoot}
                    activePoll={shootFlow.activePoll}
                    onStartShoot={() => shootFlow.startShoot(shoot.id)}
                    onSkip={() => shootFlow.skipShoot(shoot.id)}
                    isLoading={shootFlow.isLoading}
                  />
                ))}
              </div>
            )}

            {/* Section: Pending tasks */}
            {pendingTasks.length > 0 && (
              <div className="space-y-3">
                <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  {isWeekendDay ? 'Solo Tasks' : pendingTasks.length === 1 ? 'Your task' : `${pendingTasks.length} tasks remaining`}
                </p>
                {pendingTasks.map((task, index) => {
                  const variant = getTaskVariant(task);
                  const effectiveCompletionType = task.completionTypeOverride || task.task.completionType;
                  const isEdgeSession = effectiveCompletionType === 'session_complete' && !isGinaHome;
                  return (
                    <div key={task.id}>
                      {variant === 'voice' && <VoiceTaskEnrichment stats={voiceStats} />}
                      {variant === 'edge' && <EdgeTaskEnrichment denialDay={userState?.denialDay ?? 0} arousalLevel={userState?.currentArousal ?? 0} />}
                      {variant === 'hypno' && <HypnoTaskEnrichment session={activeHypnoSession} taskInstruction={task.task.instruction} />}
                      <TaskCardNew
                        task={task}
                        onComplete={(feltGood, notes, captureData) => {
                          if (isEdgeSession) {
                            setEdgeSessionConfig({
                              sessionType: 'anchoring',
                              targetEdges: 10,
                              originTaskId: task.id,
                              prescribed: true,
                            });
                          } else {
                            complete(task.id, feltGood, notes, captureData as Record<string, unknown> | undefined);
                          }
                        }}
                        onIncrement={() => incrementProgress(task.id)}
                        onSkip={() => skip(task.id)}
                        isCompleting={completingTaskId === task.id}
                        isSkipping={skippingTaskId === task.id}
                        isFirst={index === 0 && pendingWeekendActivities.length === 0}
                      />
                    </div>
                  );
                })}
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

      {/* ═══ Journal Prompt — hidden at opacity level 3 ═══ */}
      {canSee('journal_prompt') && user?.id && (
        <div className="px-4 pb-2">
          <JournalPrompt
            userId={user.id}
            handlerMode={userState?.handlerMode ?? 'director'}
          />
        </div>
      )}

      {/* ═══ Ambient Feedback Strip — hidden at opacity level 3 ═══ */}
      {canSee('ambient_feedback_strip') && (
        <div className="px-4 py-4">
          <AmbientFeedbackStrip
            tasksCompleted={completedCount}
            totalTasks={totalCount}
            currentStreak={userState?.streakDays ?? 0}
            denialDay={userState?.denialDay ?? 0}
          />
        </div>
      )}

      {/* Per-task affirmation is now inline in the card (CardPhase: affirming).
          Auto-dismiss lastCompletedTask so it doesn't linger. */}

      {/* ContinuationPrompt removed — flat layout replaces single-action flow */}

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

      {/* Active Session Overlay - step-by-step guidance with vibration control */}
      {activeSession && activeSession.steps && (
        <ActiveSessionOverlay
          title={activeSession.title}
          steps={activeSession.steps}
          onComplete={handleSessionComplete}
          onCancel={handleSessionCancel}
        />
      )}

      {/* Immersive Edge Session (v2) */}
      {edgeSessionConfig && (
        <SessionContainer
          config={edgeSessionConfig}
          denialDay={userState?.denialDay ?? 0}
          onComplete={() => {
            loadTasks();
            setEdgeSessionConfig(null);
          }}
          onCancel={() => setEdgeSessionConfig(null)}
        />
      )}

      {/* Shoot Flow Overlays */}
      {shootFlow.phase === 'shooting' && shootFlow.activeShoot && (
        <ShotView
          shots={shootFlow.activeShoot.shotList}
          references={shootFlow.references}
          shootTitle={shootFlow.activeShoot.title}
          onComplete={shootFlow.completeShoting}
          onClose={shootFlow.closeFlow}
        />
      )}

      {shootFlow.phase === 'upload' && shootFlow.activeShoot && (
        <MediaUpload
          shootId={shootFlow.activeShoot.id}
          onUploadComplete={shootFlow.uploadMedia}
          onClose={shootFlow.closeFlow}
        />
      )}

      {/* Vault Swipe Overlay */}
      {showVault && (
        <VaultSwipe onClose={() => {
          setShowVault(false);
          // Refresh pending count after vault interaction
          if (user?.id && !vaultFullAutonomy) {
            supabase
              .from('content_vault')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('status', 'pending')
              .then(({ count }) => setVaultPendingCount(count ?? 0));
          }
        }} />
      )}

      {shootFlow.phase === 'posting' && shootFlow.activeShoot && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 bg-protocol-bg">
          <ReadyToPost
            posts={(shootFlow.activeShoot.selectedMedia || []).length > 0
              ? buildReadyToPostEntries(shootFlow.activeShoot)
              : []
            }
            shootTitle={shootFlow.activeShoot.title}
            totalPhotos={shootFlow.activeShoot.mediaPaths.length}
            selectedCount={shootFlow.activeShoot.selectedMedia.length}
            onMarkPosted={async (postId) => { await shootFlow.markPosted(postId); }}
            onDone={shootFlow.markAllPosted}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Build platform post entries for ReadyToPost from a shoot prescription.
 */
function buildReadyToPostEntries(shoot: import('../../types/industry').ShootPrescription) {
  const posts: Array<{
    id: string;
    platform: string;
    subreddit?: string;
    title?: string;
    caption: string;
    mediaUrls: string[];
    ppvPrice?: number;
    denialDay: number;
    posted: boolean;
  }> = [];

  const denialDay = shoot.denialDay ?? 0;
  const caption = shoot.captionDraft || '';
  const mediaUrls = shoot.selectedMedia || [];

  // OF: full set
  posts.push({
    id: `${shoot.id}-of`,
    platform: 'onlyfans',
    caption,
    mediaUrls,
    ppvPrice: denialDay >= 5 ? 4.99 : undefined,
    denialDay,
    posted: false,
  });

  // Primary Reddit
  const secondary = shoot.secondaryPlatforms || [];
  const redditSubs = secondary
    .filter((p: string) => p.startsWith('reddit:'))
    .map((p: string) => p.replace('reddit:', ''));

  for (const sub of redditSubs) {
    posts.push({
      id: `${shoot.id}-reddit-${sub}`,
      platform: 'reddit',
      subreddit: sub,
      title: caption.slice(0, 100),
      caption: `${caption} [link in bio for full set]`,
      mediaUrls: mediaUrls.slice(0, 1),
      denialDay,
      posted: false,
    });
  }

  // Twitter
  if (secondary.includes('twitter') || secondary.some((p: string) => p === 'twitter')) {
    posts.push({
      id: `${shoot.id}-twitter`,
      platform: 'twitter',
      caption: caption.length > 240 ? caption.slice(0, 237) + '...' : caption,
      mediaUrls: mediaUrls.slice(0, 1),
      denialDay,
      posted: false,
    });
  }

  return posts;
}
