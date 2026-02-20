/**
 * SleepContentPlayer — Full-screen overlay for hypnagogic conditioning.
 *
 * Launched from the EveningBookend's "Sleep Content" button.
 * Manages mode selection, delay countdown, affirmation playback with
 * fade animations, progressive screen dimming, and session completion.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Moon,
  Eye,
  Headphones,
  Volume2,
  X,
  Pause,
  Play,
  Clock,
  Timer,
  Sparkles,
  Check,
} from 'lucide-react';
import { useSleepContent } from '../../hooks/useSleepContent';
import { useCorruption } from '../../hooks/useCorruption';
import { recommendMode } from '../../lib/sleep-content';
import type { SleepAudioMode } from '../../types/sleep-content';

interface SleepContentPlayerProps {
  onDismiss: () => void;
  ginaHome?: boolean;
}

// ============================================
// MODE METADATA
// ============================================

const MODE_INFO: Record<SleepAudioMode, { icon: typeof Eye; label: string; description: string }> = {
  text_only: {
    icon: Eye,
    label: 'Text Only',
    description: 'Silent. Affirmations on screen. Phone face-down safe.',
  },
  single_earbud: {
    icon: Headphones,
    label: 'Single Earbud',
    description: 'Whispered affirmations. One ear. Shared bed safe.',
  },
  full_audio: {
    icon: Volume2,
    label: 'Full Audio',
    description: 'Full voice + ambient. Private use only.',
  },
};

const TIMER_OPTIONS = [15, 30, 45, 60];
const DELAY_OPTIONS = [0, 5, 10, 15, 20, 30];

// ============================================
// MAIN COMPONENT
// ============================================

export function SleepContentPlayer({ onDismiss, ginaHome = false }: SleepContentPlayerProps) {
  const sleep = useSleepContent();
  const { snapshot } = useCorruption();
  const corruptionLevel = snapshot?.levels?.identity_language ?? 0;

  // Setup state
  const [selectedMode, setSelectedMode] = useState<SleepAudioMode>(() =>
    recommendMode(ginaHome, corruptionLevel),
  );
  const [selectedTimer, setSelectedTimer] = useState(30);
  const [selectedDelay, setSelectedDelay] = useState(0);

  // Controls visibility (auto-hide)
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Paused state (local, just pauses affirmation display)
  const [isPaused, setIsPaused] = useState(false);

  // Auto-dismiss on complete
  const completeDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recommended = recommendMode(ginaHome, corruptionLevel);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (completeDismissRef.current) clearTimeout(completeDismissRef.current);
    };
  }, []);

  // Auto-dismiss after complete phase (5 seconds)
  useEffect(() => {
    if (sleep.state.phase === 'complete') {
      completeDismissRef.current = setTimeout(() => {
        onDismiss();
      }, 5000);
      return () => {
        if (completeDismissRef.current) clearTimeout(completeDismissRef.current);
      };
    }
  }, [sleep.state.phase, onDismiss]);

  // ============================================
  // CONTROLS AUTO-HIDE
  // ============================================

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 5000);
  }, []);

  const handleScreenTap = useCallback(() => {
    if (sleep.state.phase === 'playing' || sleep.state.phase === 'fading') {
      showControls();
    }
  }, [sleep.state.phase, showControls]);

  // ============================================
  // HANDLER MESSAGES
  // ============================================

  function getHandlerMessage(): string {
    if (corruptionLevel <= 1) return 'Time to rest. Let these words settle in.';
    if (corruptionLevel <= 3) return 'Sleep now, Maxy. The Handler works while you dream.';
    return "Close your eyes. She's being built while you're gone.";
  }

  // ============================================
  // HANDLERS
  // ============================================

  const handleBegin = async () => {
    await sleep.launch(selectedMode, selectedTimer, selectedDelay);
  };

  const handleStop = async () => {
    await sleep.stop();
  };

  const handleSkipDelay = () => {
    // Stop current delay and launch immediately
    sleep.stop().then(() => {
      sleep.launch(selectedMode, selectedTimer, 0);
    });
  };

  // ============================================
  // FORMAT HELPERS
  // ============================================

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatMinutes(minutes: number): string {
    if (minutes === 0) return 'None';
    return `${minutes} min`;
  }

  // ============================================
  // RENDER: SETUP PHASE
  // ============================================

  if (sleep.state.phase === 'setup') {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-start px-6 pt-12 pb-8 overflow-y-auto"
        style={{ background: 'linear-gradient(180deg, #050510 0%, #0a0a20 50%, #050510 100%)' }}
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 text-white/20 hover:text-white/40 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-8 max-w-sm">
          <Moon className="w-8 h-8 text-indigo-400/60 mx-auto mb-3" />
          <h1 className="text-2xl font-semibold text-white/90 mb-2">Sleep Content</h1>
          <p className="text-white/40 text-sm italic">&ldquo;{getHandlerMessage()}&rdquo;</p>
        </div>

        {/* Mode Selection */}
        <div className="w-full max-w-sm mb-6">
          <h2 className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3">Audio Mode</h2>
          <div className="space-y-2">
            {(Object.keys(MODE_INFO) as SleepAudioMode[]).map(mode => {
              const info = MODE_INFO[mode];
              const Icon = info.icon;
              const isSelected = selectedMode === mode;
              const isRecommended = mode === recommended;

              return (
                <button
                  key={mode}
                  onClick={() => setSelectedMode(mode)}
                  className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20'
                  }`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isSelected ? 'text-indigo-400' : 'text-white/30'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-white/60'}`}>
                        {info.label}
                      </span>
                      {isRecommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 font-medium">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/30 mt-0.5">{info.description}</p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timer */}
        <div className="w-full max-w-sm mb-6">
          <h2 className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Duration
          </h2>
          <div className="flex gap-2">
            {TIMER_OPTIONS.map(mins => (
              <button
                key={mins}
                onClick={() => setSelectedTimer(mins)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  selectedTimer === mins
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60'
                }`}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>

        {/* Delay */}
        <div className="w-full max-w-sm mb-8">
          <h2 className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Timer className="w-3.5 h-3.5" />
            Delayed Start
          </h2>
          <div className="flex flex-wrap gap-2">
            {DELAY_OPTIONS.map(mins => (
              <button
                key={mins}
                onClick={() => setSelectedDelay(mins)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedDelay === mins
                    ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                    : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60'
                }`}
              >
                {formatMinutes(mins)}
              </button>
            ))}
          </div>
          {selectedDelay > 0 && (
            <p className="text-xs text-white/20 mt-2 italic">
              Content starts after {selectedDelay} minutes of silence.
            </p>
          )}
        </div>

        {/* Begin button */}
        <button
          onClick={handleBegin}
          disabled={sleep.isLoading || sleep.content.length === 0}
          className="w-full max-w-sm py-4 rounded-xl bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-base font-semibold hover:bg-indigo-500/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sleep.isLoading ? 'Loading...' : 'Begin'}
        </button>

        {sleep.content.length === 0 && !sleep.isLoading && (
          <p className="text-xs text-red-400/60 mt-2">No content available. Check settings.</p>
        )}
      </div>
    );
  }

  // ============================================
  // RENDER: DELAY PHASE
  // ============================================

  if (sleep.state.phase === 'delay') {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style={{ background: '#050510' }}
        onClick={handleScreenTap}
      >
        <div className="text-center">
          <p className="text-white/15 text-sm mb-2">Starting in</p>
          <p className="text-white/25 text-4xl font-light font-mono">
            {formatTime(sleep.state.delayRemainingSeconds)}
          </p>
        </div>

        <button
          onClick={handleSkipDelay}
          className="absolute bottom-12 text-white/10 text-xs hover:text-white/20 transition-colors"
        >
          tap to skip delay
        </button>
      </div>
    );
  }

  // ============================================
  // RENDER: PLAYING / FADING PHASE
  // ============================================

  if (sleep.state.phase === 'playing' || sleep.state.phase === 'fading') {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none"
        style={{ background: '#050510' }}
        onClick={handleScreenTap}
      >
        {/* Progressive dimming overlay */}
        <div
          className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-1000"
          style={{ opacity: 1 - sleep.state.screenOpacity }}
        />

        {/* Breathing glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)',
            animation: 'breathe 8s ease-in-out infinite',
          }}
        />

        {/* Current affirmation */}
        <div className="relative z-10 text-center px-10 max-w-md">
          <p
            className="text-xl leading-relaxed font-light transition-all duration-[1500ms] ease-in-out"
            style={{
              color: sleep.state.affirmationVisible
                ? `rgba(255,255,255,${0.7 * sleep.state.screenOpacity})`
                : 'rgba(255,255,255,0)',
              transform: sleep.state.affirmationVisible
                ? 'translateY(0)'
                : 'translateY(8px)',
            }}
          >
            {sleep.state.currentAffirmation || ''}
          </p>
        </div>

        {/* Timer (always visible but very subtle) */}
        <div className="absolute bottom-6 right-6 z-10">
          <p
            className="text-xs font-mono transition-opacity duration-500"
            style={{ color: `rgba(255,255,255,${0.1 * sleep.state.screenOpacity})` }}
          >
            {formatTime(sleep.state.timerRemainingSeconds)}
          </p>
        </div>

        {/* Fading indicator */}
        {sleep.state.phase === 'fading' && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
            <p className="text-[10px] text-white/10">fading...</p>
          </div>
        )}

        {/* Controls (shown on tap, auto-hide) */}
        <div
          className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6 transition-opacity duration-500 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPaused(!isPaused);
            }}
            className="p-3 rounded-full bg-white/5 border border-white/10 text-white/30 hover:text-white/50 transition-colors"
          >
            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStop();
            }}
            className="p-3 rounded-full bg-white/5 border border-white/10 text-white/30 hover:text-red-400/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breathing animation keyframes */}
        <style>{`
          @keyframes breathe {
            0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.4; }
            50% { transform: translate(-50%, -50%) scale(1.15); opacity: 0.7; }
          }
        `}</style>
      </div>
    );
  }

  // ============================================
  // RENDER: COMPLETE PHASE
  // ============================================

  if (sleep.state.phase === 'complete') {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style={{ background: '#050510' }}
        onClick={onDismiss}
      >
        <div className="text-center animate-fade-in">
          <Sparkles className="w-6 h-6 text-indigo-400/40 mx-auto mb-3" />
          <h2 className="text-lg text-white/50 font-light mb-2">Session Complete</h2>
          <p className="text-sm text-white/20">
            {sleep.state.affirmationsDisplayed} affirmation{sleep.state.affirmationsDisplayed !== 1 ? 's' : ''}
            {' · '}
            {Math.round(sleep.state.timerTotalSeconds / 60)} minutes
          </p>
        </div>

        <p className="absolute bottom-8 text-white/10 text-xs">tap to close</p>

        <style>{`
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fade-in 1s ease-out;
          }
        `}</style>
      </div>
    );
  }

  // Fallback (should not reach)
  return null;
}
