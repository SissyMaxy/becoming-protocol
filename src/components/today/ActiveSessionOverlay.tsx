/**
 * Active Session Overlay
 * Shows during an active session with step-by-step guidance and vibration control
 */

import { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, SkipForward, Check, Vibrate, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';
import type { VibrationPattern } from './FocusedActionCard';

interface ActionStep {
  label: string;
  durationMinutes?: number;
  vibration?: VibrationPattern;
  intensity?: number;
}

interface ActiveSessionOverlayProps {
  title: string;
  steps: ActionStep[];
  onComplete: () => void;
  onCancel: () => void;
}

// Map our pattern names to Lovense pattern IDs
function mapPatternToLovense(pattern: VibrationPattern | undefined): string | null {
  if (!pattern || pattern === 'off') return null;

  const patternMap: Record<string, string> = {
    'gentle_wave': 'gentle_wave',
    'building': 'building',
    'edge_tease': 'edge_tease',
    'denial_pulse': 'denial_pulse',
    'constant_low': 'constant_low',
    'constant_medium': 'constant_medium',
    'constant_high': 'constant_high',
    'heartbeat': 'heartbeat',
    'staircase': 'staircase',
    'random_tease': 'random_tease',
    'flutter_gentle': 'flutter_gentle',
  };

  return patternMap[pattern] || null;
}

// Get human-readable pattern description
function getPatternDescription(pattern: VibrationPattern): string {
  const descriptions: Record<string, string> = {
    'off': 'No vibration',
    'gentle_wave': 'Smooth waves: 4→8→12→8→4 (medium, relaxing)',
    'building': 'Climbing: 3→6→9→12→15→18 (steadily increasing to high)',
    'edge_tease': 'Unpredictable spikes to 20 with sudden stops',
    'denial_pulse': 'Long silence → sudden MAX burst (torturous)',
    'constant_low': 'Steady at level 6 (background buzz)',
    'constant_medium': 'Steady at level 12 (noticeable)',
    'constant_high': 'Steady at level 18 (intense)',
    'heartbeat': 'Double-pulse: 14→18 with pause (thump-THUMP)',
    'staircase': 'Clear steps: 5→10→14→18→20→stop',
    'random_tease': 'Chaotic: random 6-20 spikes, never predictable',
    'flutter_gentle': 'Quick light pulses: 5-8, tickling sensation',
  };
  return descriptions[pattern] || pattern.replace('_', ' ');
}

export function ActiveSessionOverlay({
  title,
  steps,
  onComplete,
  onCancel,
}: ActiveSessionOverlayProps) {
  const { isBambiMode } = useBambiMode();
  const {
    playPattern,
    stopPattern,
    setIntensity,
    stop,
    currentIntensity,
    activePattern,
    status: lovenseStatus,
    activeToy: _activeToy,
  } = useLovense();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [stepTimeRemaining, setStepTimeRemaining] = useState<number | null>(null);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const isConnected = lovenseStatus === 'connected';

  // Start/update vibration when step changes
  useEffect(() => {
    if (!isPlaying || !currentStep) return;

    const patternId = mapPatternToLovense(currentStep.vibration);

    console.log('[Session] Step changed:', {
      stepIndex: currentStepIndex,
      vibration: currentStep.vibration,
      patternId,
      intensity: currentStep.intensity,
      isConnected,
    });

    if (patternId) {
      // Play the pattern
      console.log('[Session] Playing pattern:', patternId);
      playPattern(patternId, true); // loop=true
    } else if (currentStep.intensity && currentStep.intensity > 0) {
      // Set constant intensity directly
      console.log('[Session] Setting intensity:', currentStep.intensity);
      setIntensity(currentStep.intensity);
    } else {
      // No vibration for this step
      console.log('[Session] Stopping vibration');
      stop();
    }

    // Set up step timer if duration specified
    if (currentStep.durationMinutes) {
      setStepTimeRemaining(currentStep.durationMinutes * 60);
    } else {
      setStepTimeRemaining(null);
    }

    return () => {
      // Cleanup handled by stopPattern/stop
    };
  }, [currentStepIndex, isPlaying, currentStep, playPattern, setIntensity, stop, isConnected]);

  // Timer countdown
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTotalElapsed(prev => prev + 1);

      if (stepTimeRemaining !== null) {
        setStepTimeRemaining(prev => {
          if (prev === null || prev <= 1) {
            // Auto-advance to next step
            if (!isLastStep) {
              setCurrentStepIndex(i => i + 1);
            }
            return null;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, stepTimeRemaining, isLastStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPattern();
      stop();
    };
  }, [stopPattern, stop]);

  const handlePauseResume = () => {
    if (isPlaying) {
      stopPattern();
      stop();
    }
    setIsPlaying(!isPlaying);
  };

  const handleNextStep = () => {
    if (isLastStep) {
      stopPattern();
      stop();
      onComplete();
    } else {
      setCurrentStepIndex(i => i + 1);
    }
  };

  const handleCancel = () => {
    stopPattern();
    stop();
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate total estimated time
  const totalEstimatedMinutes = steps.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      {/* Close confirmation overlay */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-sm mx-4 text-center">
            <p className="text-white font-semibold text-lg mb-2">End session?</p>
            <p className="text-gray-400 text-sm mb-6">
              Step {currentStepIndex + 1} of {steps.length} &middot; {formatTime(totalElapsed)} elapsed. Progress will be lost.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-5 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
              >
                Keep Going
              </button>
              <button
                onClick={() => { setShowCloseConfirm(false); handleCancel(); }}
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`p-4 flex items-center justify-between ${
        isBambiMode ? 'bg-pink-900/50' : 'bg-protocol-surface/50'
      }`}>
        <button
          onClick={() => setShowCloseConfirm(true)}
          aria-label="Close session"
          className="p-2 rounded-lg hover:bg-white/10"
        >
          <X className="w-6 h-6 text-white" />
        </button>
        <h2 className="text-white font-bold truncate px-4">{title}</h2>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Vibration Status Banner - MORE VISIBLE */}
      {isConnected && (
        <div className={`px-4 py-4 ${
          currentIntensity > 0
            ? currentIntensity > 15
              ? 'bg-red-600'
              : currentIntensity > 10
                ? 'bg-orange-500'
                : currentIntensity > 5
                  ? 'bg-purple-600'
                  : 'bg-purple-800'
            : 'bg-gray-700'
        }`}>
          {/* Intensity bar */}
          <div className="flex items-center gap-3 mb-2">
            <Vibrate className={`w-6 h-6 text-white ${currentIntensity > 0 ? 'animate-pulse' : ''}`} />
            <div className="flex-1">
              <div className="flex justify-between text-white text-sm mb-1">
                <span className="font-bold">
                  {currentIntensity > 0
                    ? (activePattern?.name || currentStep?.vibration?.replace('_', ' ') || 'Vibrating')
                    : 'Paused'
                  }
                </span>
                <span className="font-mono text-lg">{currentIntensity}/20</span>
              </div>
              {/* Visual intensity bar */}
              <div className="h-3 bg-black/30 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    currentIntensity > 15 ? 'bg-red-400' :
                    currentIntensity > 10 ? 'bg-orange-400' :
                    currentIntensity > 5 ? 'bg-yellow-400' : 'bg-green-400'
                  }`}
                  style={{ width: `${(currentIntensity / 20) * 100}%` }}
                />
              </div>
            </div>
          </div>
          {/* Pattern description */}
          {currentStep?.vibration && currentStep.vibration !== 'off' && (
            <p className="text-white/70 text-xs text-center">
              {getPatternDescription(currentStep.vibration)}
            </p>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i < currentStepIndex
                  ? 'w-8 bg-green-500'
                  : i === currentStepIndex
                    ? 'w-12 bg-purple-500'
                    : 'w-4 bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Current step */}
        <div className={`p-6 rounded-2xl mb-4 ${
          isBambiMode
            ? 'bg-pink-900/30 border border-pink-500/30'
            : 'bg-protocol-surface border border-protocol-border'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
              isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white'
            }`}>
              {currentStepIndex + 1}
            </div>
            <div className="flex-1">
              <p className="text-white text-lg font-medium mb-2">
                {currentStep?.label}
              </p>
              <div className="flex items-center gap-4 text-sm">
                {currentStep?.durationMinutes && (
                  <span className="text-gray-400 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {currentStep.durationMinutes} min
                  </span>
                )}
                {currentStep?.vibration && currentStep.vibration !== 'off' && (
                  <span className="text-purple-400 flex items-center gap-1">
                    <Vibrate className="w-4 h-4" />
                    {currentStep.vibration.replace('_', ' ')}
                    {currentStep.intensity && ` (${currentStep.intensity})`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Step timer */}
          {stepTimeRemaining !== null && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Time remaining</span>
                <span className="text-white font-mono text-2xl">
                  {formatTime(stepTimeRemaining)}
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
                  }`}
                  style={{
                    width: `${((currentStep?.durationMinutes || 0) * 60 - stepTimeRemaining) / ((currentStep?.durationMinutes || 1) * 60) * 100}%`
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Upcoming steps preview */}
        {!isLastStep && (
          <div className="space-y-2">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Coming up</p>
            {steps.slice(currentStepIndex + 1, currentStepIndex + 3).map((step, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-gray-800/50 flex items-center gap-3"
              >
                <span className="text-gray-500 font-medium">
                  {currentStepIndex + 2 + i}
                </span>
                <span className="text-gray-400 flex-1 truncate">{step.label}</span>
                {step.vibration && step.vibration !== 'off' && (
                  <Vibrate className="w-4 h-4 text-purple-400/50" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className={`p-4 border-t ${
        isBambiMode ? 'border-pink-500/30 bg-pink-900/30' : 'border-protocol-border bg-protocol-surface'
      }`}>
        {/* Total time */}
        <div className="flex items-center justify-center gap-4 mb-4 text-sm">
          <span className="text-gray-400">
            Elapsed: {formatTime(totalElapsed)}
          </span>
          {totalEstimatedMinutes > 0 && (
            <span className="text-gray-500">
              / ~{totalEstimatedMinutes} min total
            </span>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handlePauseResume}
            className={`p-4 rounded-full ${
              isPlaying
                ? 'bg-yellow-500 hover:bg-yellow-600'
                : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white" />
            ) : (
              <Play className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            onClick={handleNextStep}
            className={`px-8 py-4 rounded-xl font-bold flex items-center gap-2 ${
              isLastStep
                ? isBambiMode
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
                : isBambiMode
                  ? 'bg-pink-500 hover:bg-pink-600 text-white'
                  : 'bg-protocol-accent hover:bg-protocol-accent-bright text-white'
            }`}
          >
            {isLastStep ? (
              <>
                <Check className="w-5 h-5" />
                Complete
              </>
            ) : (
              <>
                <SkipForward className="w-5 h-5" />
                Next Step
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
