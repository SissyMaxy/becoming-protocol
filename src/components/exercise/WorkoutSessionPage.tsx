/**
 * Workout Session Page
 *
 * Three-phase orchestrator:
 * 1. Template selection (no active session)
 * 2. Guided workout (ExerciseGuidedView)
 * 3. Completion screen (SessionCompleteScreen)
 */

import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  Dumbbell,
  Flame,
  Timer,
  Zap,
  Lock,
  ChevronRight,
  ListChecks,
  Target,
} from 'lucide-react';
import { useExercise } from '../../hooks/useExercise';
import { useRewardOptional } from '../../context/RewardContext';
import { ExerciseGuidedView } from './ExerciseGuidedView';
import { CheckoffView } from './CheckoffView';
import { SessionCompleteScreen } from './SessionCompleteScreen';
import { ExerciseDomainProgress } from './ExerciseDomainProgress';
import { MeasurementHistory } from './MeasurementHistory';
import { WORKOUT_TEMPLATES, getTemplateById } from '../../data/workout-templates';
import { startSession, completeSession } from '../../lib/exercise';
import { toggleProteinSource } from '../../lib/protein';
import { useAuth } from '../../context/AuthContext';
import type { SessionCompletionResult, WorkoutTemplate, ExerciseCompleted } from '../../types/exercise';

interface WorkoutSessionPageProps {
  onBack: () => void;
}

type WorkoutMode = 'guided' | 'checkoff';

export function WorkoutSessionPage({ onBack }: WorkoutSessionPageProps) {
  const { user } = useAuth();
  const exercise = useExercise();
  const reward = useRewardOptional();
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [completionResult, setCompletionResult] = useState<SessionCompletionResult | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Default check-off for level 1-2, guided for 3+
  const defaultMode: WorkoutMode = (exercise.domainConfig?.domainLevel || 1) <= 2 ? 'checkoff' : 'guided';
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>(defaultMode);

  // Active checkoff session (template being worked through in checkoff mode)
  const [checkoffTemplate, setCheckoffTemplate] = useState<WorkoutTemplate | null>(null);

  const handleStart = useCallback(async (templateId: string) => {
    if (workoutMode === 'checkoff') {
      const template = getTemplateById(templateId);
      if (template) {
        setCheckoffTemplate(template);
      }
      return;
    }
    setIsStarting(true);
    const success = await exercise.startWorkout(templateId, deviceEnabled);
    setIsStarting(false);
    if (!success) {
      console.error('[Workout] Failed to start session');
    }
  }, [exercise, deviceEnabled, workoutMode]);

  const handleCheckoffComplete = useCallback(async (exercises: ExerciseCompleted[], durationMinutes: number) => {
    if (!user?.id || !checkoffTemplate) return;
    const denialDay = 0; // checkoff mode doesn't need denial context
    const sessionId = await startSession(user.id, checkoffTemplate.id, false, denialDay);
    if (!sessionId) {
      console.error('[Workout] Failed to create checkoff session');
      setCheckoffTemplate(null);
      return;
    }
    const streakWeeks = exercise.streakData?.currentStreakWeeks || 0;
    const result = await completeSession(user.id, sessionId, exercises, durationMinutes, checkoffTemplate.id, streakWeeks);
    if (result) {
      setCompletionResult(result);
      if (reward?.addPoints) {
        reward.addPoints(result.pointsAwarded, 'session_complete').catch(() => {});
      }
    }
    setCheckoffTemplate(null);
    exercise.refresh();
  }, [user?.id, checkoffTemplate, exercise, reward]);

  const handleCheckoffAbandon = useCallback(() => {
    setCheckoffTemplate(null);
  }, []);

  const handleComplete = useCallback(async () => {
    const result = await exercise.completeWorkout();
    if (result) {
      setCompletionResult(result);
      if (reward?.addPoints) {
        reward.addPoints(result.pointsAwarded, 'session_complete').catch(() => {});
      }
    }
  }, [exercise, reward]);

  const handleProteinShakeCheck = useCallback(() => {
    if (!user?.id) return;
    toggleProteinSource(user.id, 'shakePostWorkout', true).catch(err => {
      console.error('[Workout] Shake auto-check failed:', err);
    });
  }, [user?.id]);

  const handleDone = useCallback(() => {
    setCompletionResult(null);
  }, []);

  // Days since last measurement (for completion screen prompt)
  const daysSinceMeasurement = exercise.latestMeasurement
    ? Math.floor((Date.now() - new Date(exercise.latestMeasurement.measuredAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Phase 3: Session complete
  if (completionResult) {
    return (
      <SessionCompleteScreen
        result={completionResult}
        onDone={handleDone}
        domainConfig={exercise.domainConfig}
        daysSinceMeasurement={daysSinceMeasurement}
        onProteinShakeCheck={handleProteinShakeCheck}
      />
    );
  }

  // Phase 2b: Active checkoff session
  if (checkoffTemplate) {
    return (
      <CheckoffView
        template={checkoffTemplate}
        onComplete={handleCheckoffComplete}
        onAbandon={handleCheckoffAbandon}
      />
    );
  }

  // Phase 2a: Active guided session
  if (exercise.session && exercise.currentExercise) {
    return (
      <ExerciseGuidedView
        session={exercise.session}
        currentExercise={exercise.currentExercise}
        phaseLabel={exercise.phaseLabel}
        exercisesInPhase={exercise.exercisesInPhase}
        isLastSet={exercise.isLastSet}
        onTapRep={exercise.tapRep}
        onCompleteSet={() => {
          exercise.completeSet();
          // Check if workout is now done (sentinel value)
          setTimeout(() => {
            if (!exercise.session || !exercise.currentExercise) {
              handleComplete();
            }
          }, 100);
        }}
        onSkipRest={exercise.skipRest}
        onPause={exercise.pauseWorkout}
        onResume={exercise.resumeWorkout}
        onAbandon={exercise.abandonWorkout}
      />
    );
  }

  // Locked templates: templates above current domain level (for display)
  const domainLevel = exercise.domainConfig?.domainLevel || 1;
  const lockedTemplates = WORKOUT_TEMPLATES.filter(
    t => t.domainLevelMin > domainLevel && !exercise.availableTemplates.some(a => a.id === t.id)
  );

  // Phase 1: Template selection
  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 -ml-2 text-white/60 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Workouts</h1>
          <p className="text-white/50 text-sm">Guided exercise sessions</p>
        </div>
      </div>

      {/* Domain progress card */}
      {exercise.domainConfig && (
        <div className="mx-4 mb-4">
          <ExerciseDomainProgress
            config={exercise.domainConfig}
            domainProgress={exercise.domainProgress}
          />
        </div>
      )}

      {/* Streak info */}
      {exercise.streakData && (
        <div className="mx-4 mb-4 bg-white/5 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-orange-400" />
            <div>
              <p className="text-white font-medium">
                Week {exercise.streakData.currentStreakWeeks}
              </p>
              <p className="text-white/50 text-sm">
                {exercise.streakData.sessionsThisWeek}/3 sessions this week
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white/70 text-sm">{exercise.streakData.totalSessions} total</p>
          </div>
        </div>
      )}

      {/* Gym gate progress (if not unlocked) */}
      {exercise.streakData && !exercise.streakData.gymGateUnlocked && (
        <div className="mx-4 mb-4 bg-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-yellow-400" />
            <p className="text-white/70 text-sm font-medium">Gym Gate</p>
          </div>
          <div className="space-y-2">
            <ProgressBar
              label="Sessions"
              current={exercise.streakData.totalSessions}
              target={18}
            />
            <ProgressBar
              label="Streak Weeks"
              current={exercise.streakData.currentStreakWeeks}
              target={6}
            />
            <ProgressBar
              label="Full Sessions"
              current={exercise.streakData.totalFullSessions}
              target={12}
            />
          </div>
        </div>
      )}

      {/* Device toggle */}
      <div className="mx-4 mb-4 bg-white/5 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-pink-400" />
          <div>
            <p className="text-white text-sm font-medium">Arousal Pairing</p>
            <p className="text-white/40 text-xs">Connect device for rep pulses</p>
          </div>
        </div>
        <button
          onClick={() => setDeviceEnabled(!deviceEnabled)}
          className={`w-12 h-6 rounded-full transition-colors ${
            deviceEnabled ? 'bg-pink-500' : 'bg-white/20'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white transition-transform ${
              deviceEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Workout mode toggle */}
      <div className="mx-4 mb-4 bg-white/5 rounded-xl p-4">
        <p className="text-white/50 text-xs mb-2">Workout Mode</p>
        <div className="flex gap-2">
          <button
            onClick={() => setWorkoutMode('checkoff')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
              workoutMode === 'checkoff'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            Check-off
          </button>
          <button
            onClick={() => setWorkoutMode('guided')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
              workoutMode === 'guided'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            <Target className="w-4 h-4" />
            Guided
          </button>
        </div>
      </div>

      {/* Recommended template */}
      {exercise.recommendedTemplate && (
        <div className="mx-4 mb-2">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Recommended</p>
          <TemplateCard
            template={exercise.recommendedTemplate}
            isRecommended
            onStart={() => handleStart(exercise.recommendedTemplate!.id)}
            isStarting={isStarting}
          />
        </div>
      )}

      {/* All available templates */}
      <div className="mx-4 mt-4">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-2">All Workouts</p>
        <div className="space-y-2">
          {exercise.availableTemplates
            .filter(t => t.id !== exercise.recommendedTemplate?.id)
            .map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                onStart={() => handleStart(template.id)}
                isStarting={isStarting}
              />
            ))}
        </div>
      </div>

      {/* Locked templates (above current level) */}
      {lockedTemplates.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Locked</p>
          <div className="space-y-2">
            {lockedTemplates.map(template => (
              <LockedTemplateCard key={template.id} template={template} />
            ))}
          </div>
        </div>
      )}

      {/* Measurement history */}
      <div className="mx-4 mt-4">
        <MeasurementHistory
          history={exercise.measurementHistory}
          latest={exercise.latestMeasurement}
          onRefresh={exercise.refresh}
        />
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function TemplateCard({
  template,
  isRecommended,
  onStart,
  isStarting,
}: {
  template: WorkoutTemplate;
  isRecommended?: boolean;
  onStart: () => void;
  isStarting: boolean;
}) {
  const isGym = template.location === 'gym';

  return (
    <button
      onClick={onStart}
      disabled={isStarting}
      className={`w-full text-left rounded-xl p-4 transition-colors ${
        isRecommended
          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
          : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isGym ? 'bg-blue-500/20' : 'bg-purple-500/20'
          }`}>
            <Dumbbell className={`w-5 h-5 ${isGym ? 'text-blue-400' : 'text-purple-400'}`} />
          </div>
          <div>
            <p className="text-white font-medium">{template.name}</p>
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <Timer className="w-3 h-3" />
              <span>~{template.estimatedMinutes} min</span>
              <span className="text-white/20">|</span>
              <span>{template.location}</span>
            </div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-white/30" />
      </div>
    </button>
  );
}

function LockedTemplateCard({ template }: { template: WorkoutTemplate }) {
  const isGym = template.location === 'gym';

  return (
    <div className="w-full text-left rounded-xl p-4 bg-white/[0.02] border border-white/5 opacity-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isGym ? 'bg-blue-500/10' : 'bg-purple-500/10'
          }`}>
            <Lock className="w-4 h-4 text-white/30" />
          </div>
          <div>
            <p className="text-white/40 font-medium">{template.name}</p>
            <div className="flex items-center gap-2 text-white/20 text-xs">
              <Timer className="w-3 h-3" />
              <span>~{template.estimatedMinutes} min</span>
              <span className="text-white/10">|</span>
              <span className="text-xs bg-white/5 text-white/30 px-1.5 py-0.5 rounded">
                Level {template.domainLevelMin}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target }: { label: string; current: number; target: number }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70">{current}/{target}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
