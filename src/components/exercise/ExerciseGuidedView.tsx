/**
 * Exercise Guided View — full-screen step-by-step workout experience.
 *
 * Shows current exercise with form cues, rep counter or timer,
 * set tracking, rest timer, and Lovense device integration.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Pause, Play, ChevronRight } from 'lucide-react';
import { RestTimer } from './RestTimer';
import { useLovense } from '../../hooks/useLovense';
import type { ExerciseBlock, WorkoutSessionState } from '../../types/exercise';

interface ExerciseGuidedViewProps {
  session: WorkoutSessionState;
  currentExercise: ExerciseBlock;
  phaseLabel: string;
  exercisesInPhase: ExerciseBlock[];
  isLastSet: boolean;
  onTapRep: () => void;
  onCompleteSet: () => void;
  onSkipRest: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
}

export function ExerciseGuidedView({
  session,
  currentExercise,
  phaseLabel,
  exercisesInPhase,
  isLastSet,
  onTapRep,
  onCompleteSet,
  onSkipRest,
  onPause,
  onResume,
  onAbandon,
}: ExerciseGuidedViewProps) {
  const { setIntensity, stop: stopDevice, status: lovenseStatus } = useLovense();
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDeviceLevel = useRef(0);

  const isTimerBased = !!currentExercise.durationSeconds;
  const isConnected = session.deviceEnabled && lovenseStatus === 'connected';

  // Device level management
  useEffect(() => {
    if (!isConnected) return;

    const level = (currentExercise.deviceLevel || 0) * 4; // 0-5 → 0-20
    if (level !== lastDeviceLevel.current) {
      lastDeviceLevel.current = level;
      if (level > 0) {
        setIntensity(level).catch(() => {});
      } else {
        stopDevice().catch(() => {});
      }
    }

    return () => {
      // Don't stop on every unmount — only on abandon/complete
    };
  }, [currentExercise, isConnected, setIntensity, stopDevice]);

  // Drop device intensity during rest
  useEffect(() => {
    if (!isConnected) return;
    if (session.isResting) {
      const restLevel = Math.max(0, lastDeviceLevel.current - 8);
      if (restLevel > 0) {
        setIntensity(restLevel).catch(() => {});
      } else {
        stopDevice().catch(() => {});
      }
    }
  }, [session.isResting, isConnected, setIntensity, stopDevice]);

  // Timer-based exercise countdown
  useEffect(() => {
    if (!isTimerBased || session.isResting || session.isPaused) return;

    setTimerRemaining(currentExercise.durationSeconds!);
    timerRef.current = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Auto-complete set when timer finishes
          onCompleteSet();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerBased, currentExercise, session.isResting, session.isPaused, onCompleteSet]);

  // Device pulse on rep tap
  const handleTapRep = useCallback(() => {
    onTapRep();
    if (isConnected && currentExercise.devicePulseOnRep) {
      const pulseLevel = Math.min(20, (currentExercise.deviceLevel || 2) * 4 + 4);
      setIntensity(pulseLevel).catch(() => {});
      setTimeout(() => {
        const baseLevel = (currentExercise.deviceLevel || 0) * 4;
        if (baseLevel > 0) {
          setIntensity(baseLevel).catch(() => {});
        } else {
          stopDevice().catch(() => {});
        }
      }, 200);
    }
  }, [onTapRep, isConnected, currentExercise, setIntensity, stopDevice]);

  const handleAbandon = useCallback(() => {
    if (isConnected) stopDevice().catch(() => {});
    onAbandon();
  }, [isConnected, stopDevice, onAbandon]);

  // Next exercise preview
  const nextExIdx = session.exerciseIndex + 1;
  const nextExercise = nextExIdx < exercisesInPhase.length
    ? exercisesInPhase[nextExIdx]
    : null;

  // Elapsed time
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  if (session.isResting) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
        <RestTimer
          seconds={session.restTimeRemaining}
          onComplete={onSkipRest}
          nextExerciseName={
            isLastSet ? nextExercise?.name : currentExercise.name
          }
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-purple-400 font-medium uppercase">{phaseLabel}</span>
          <span className="text-xs text-white/30">
            {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {session.isPaused ? (
            <button onClick={onResume} className="p-2 text-white/60 hover:text-white">
              <Play className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={onPause} className="p-2 text-white/60 hover:text-white">
              <Pause className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setShowAbandonConfirm(true)}
            className="p-2 text-white/40 hover:text-red-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Device indicator */}
      {isConnected && currentExercise.deviceLevel && currentExercise.deviceLevel > 0 && (
        <div className="px-4 py-1 flex items-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(lvl => (
              <div
                key={lvl}
                className={`w-2 h-4 rounded-sm ${
                  lvl <= (currentExercise.deviceLevel || 0)
                    ? 'bg-pink-500'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-pink-400">
            Lv {currentExercise.deviceLevel}
            {currentExercise.devicePulseOnRep && ' (pulse on rep)'}
          </span>
        </div>
      )}

      {/* Paused overlay */}
      {session.isPaused && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Pause className="w-16 h-16 text-white/30 mx-auto mb-4" />
            <p className="text-white/50 text-lg">Paused</p>
            <button
              onClick={onResume}
              className="mt-6 px-8 py-3 rounded-xl bg-purple-500 text-white font-semibold"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Main exercise view */}
      {!session.isPaused && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          {/* Exercise name */}
          <h2 className="text-2xl font-bold text-white text-center">
            {currentExercise.name}
            {currentExercise.isPerSide && (
              <span className="text-purple-400 text-lg ml-2">(each side)</span>
            )}
          </h2>

          {/* Set counter */}
          <p className="text-white/50 text-sm">
            Set {session.setIndex + 1} of {currentExercise.sets}
          </p>

          {/* Rep counter or Timer */}
          {isTimerBased ? (
            <div className="text-center">
              <p className="text-6xl font-bold text-white font-mono">
                {timerRemaining}
              </p>
              <p className="text-white/40 text-sm mt-2">seconds remaining</p>
            </div>
          ) : (
            <>
              {/* Tap-to-count circle */}
              <button
                onClick={handleTapRep}
                className="w-36 h-36 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex flex-col items-center justify-center active:scale-95 transition-transform shadow-lg shadow-purple-500/20"
              >
                <span className="text-5xl font-bold text-white">
                  {session.repsThisSet}
                </span>
                <span className="text-white/70 text-xs mt-1">
                  / {currentExercise.reps} reps
                </span>
              </button>
              <p className="text-white/30 text-xs">Tap to count each rep</p>
            </>
          )}

          {/* Form cues */}
          <div className="w-full max-w-sm bg-white/5 rounded-xl p-4">
            {currentExercise.cues.map((cue, i) => (
              <p key={i} className="text-white/60 text-sm py-1 flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                {cue}
              </p>
            ))}
          </div>

          {/* Done with set button */}
          {!isTimerBased && (
            <button
              onClick={onCompleteSet}
              className="w-full max-w-sm py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors"
            >
              {isLastSet ? 'Done — Next Exercise' : 'Done with Set'}
            </button>
          )}
        </div>
      )}

      {/* Stats footer */}
      <div className="px-4 py-3 bg-white/5 flex justify-around text-center">
        <div>
          <p className="text-white font-bold">{session.totalReps}</p>
          <p className="text-white/40 text-xs">total reps</p>
        </div>
        <div>
          <p className="text-white font-bold">{session.totalSets}</p>
          <p className="text-white/40 text-xs">total sets</p>
        </div>
        <div>
          <p className="text-white font-bold">
            {session.exerciseIndex + 1}/{exercisesInPhase.length}
          </p>
          <p className="text-white/40 text-xs">exercises</p>
        </div>
      </div>

      {/* Abandon confirmation modal */}
      {showAbandonConfirm && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center px-6">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-bold text-lg mb-2">Quit Workout?</h3>
            <p className="text-white/60 text-sm mb-6">
              This session won't count toward your streak.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAbandonConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-white/10 text-white text-sm"
              >
                Keep Going
              </button>
              <button
                onClick={handleAbandon}
                className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm"
              >
                Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
