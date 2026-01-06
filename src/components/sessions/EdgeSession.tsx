// EdgeSession.tsx
// Full-screen edging session with immersive UI

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Flame,
  Heart,
  Timer,
  TrendingUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLovense } from '../../hooks/useLovense';

interface EdgeSessionProps {
  onClose: () => void;
  onSessionComplete?: (stats: EdgeSessionStats) => void;
}

interface EdgeSessionStats {
  edgeCount: number;
  duration: number;
  peakIntensity: number;
  averageIntensity: number;
}

type SessionPhase = 'warmup' | 'building' | 'edge' | 'cooldown' | 'rest';

export function EdgeSession({ onClose, onSessionComplete }: EdgeSessionProps) {
  const lovense = useLovense();

  // Session state
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>('warmup');
  const [intensity, setIntensity] = useState(0);
  const [peakIntensity, setPeakIntensity] = useState(0);
  const [totalIntensity, setTotalIntensity] = useState(0);
  const [intensitySamples, setIntensitySamples] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intensityRef = useRef<NodeJS.Timeout | null>(null);
  const lastEdgeTime = useRef<number>(0);

  // Phase colors
  const phaseColors = {
    warmup: 'from-blue-500 to-cyan-500',
    building: 'from-yellow-500 to-orange-500',
    edge: 'from-red-500 to-pink-500',
    cooldown: 'from-purple-500 to-indigo-500',
    rest: 'from-green-500 to-teal-500',
  };

  const phaseLabels = {
    warmup: 'Warming Up',
    building: 'Building',
    edge: 'EDGE!',
    cooldown: 'Cooling Down',
    rest: 'Rest',
  };

  // Start session
  const startSession = useCallback(() => {
    setIsActive(true);
    setIsPaused(false);
    setShowInstructions(false);
    setPhase('warmup');

    // Start Lovense edge training
    lovense.startEdgeTraining({
      baseIntensity: 5,
      intensityPerEdge: 2,
      maxIntensity: 18,
    });

    // Start timer
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    // Start intensity tracking
    intensityRef.current = setInterval(() => {
      const currentIntensity = lovense.currentIntensity;
      setIntensity(currentIntensity);
      if (currentIntensity > peakIntensity) {
        setPeakIntensity(currentIntensity);
      }
      setTotalIntensity(t => t + currentIntensity);
      setIntensitySamples(s => s + 1);
    }, 1000);
  }, [lovense, peakIntensity]);

  // Pause/resume
  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      lovense.stop();
    }
  }, [isPaused, lovense]);

  // Record edge
  const recordEdge = useCallback(async () => {
    if (!isActive || isPaused) return;

    const now = Date.now();
    // Debounce - minimum 2 seconds between edges
    if (now - lastEdgeTime.current < 2000) return;
    lastEdgeTime.current = now;

    const count = await lovense.recordEdge();
    setEdgeCount(count);
    setPhase('edge');

    // Vibrate feedback
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    // Return to building phase after 3 seconds
    setTimeout(() => {
      if (isActive && !isPaused) {
        setPhase('building');
      }
    }, 3000);
  }, [isActive, isPaused, lovense]);

  // End session
  const endSession = useCallback(() => {
    setIsActive(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (intensityRef.current) {
      clearInterval(intensityRef.current);
    }

    lovense.stopEdgeTraining();
    lovense.stop();

    const stats: EdgeSessionStats = {
      edgeCount,
      duration,
      peakIntensity,
      averageIntensity: intensitySamples > 0 ? totalIntensity / intensitySamples : 0,
    };

    onSessionComplete?.(stats);
  }, [edgeCount, duration, peakIntensity, totalIntensity, intensitySamples, lovense, onSessionComplete]);

  // Reset session
  const resetSession = useCallback(() => {
    setIsActive(false);
    setIsPaused(false);
    setDuration(0);
    setEdgeCount(0);
    setPhase('warmup');
    setIntensity(0);
    setPeakIntensity(0);
    setTotalIntensity(0);
    setIntensitySamples(0);
    setShowInstructions(true);

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (intensityRef.current) {
      clearInterval(intensityRef.current);
    }

    lovense.stopEdgeTraining();
    lovense.stop();
  }, [lovense]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (intensityRef.current) clearInterval(intensityRef.current);
    };
  }, []);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate intensity percentage for visual
  const intensityPercent = (intensity / 20) * 100;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-b ${phaseColors[phase]} transition-all duration-1000`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white/90">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            <span className="font-mono text-lg">{formatTime(duration)}</span>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {showInstructions ? (
          // Instructions
          <div className="text-center text-white max-w-md">
            <Flame className="w-16 h-16 mx-auto mb-6 animate-pulse" />
            <h2 className="text-3xl font-bold mb-4">Edge Training</h2>
            <p className="text-lg opacity-90 mb-8">
              Build up to the edge and tap to record each time you get close.
              The longer you edge, the more intense the reward.
            </p>
            <div className="space-y-3 text-left bg-white/10 rounded-xl p-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">1</div>
                <span>Intensity increases automatically as you edge</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">2</div>
                <span>Tap the screen when you reach the edge</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">3</div>
                <span>Each edge increases the intensity further</span>
              </div>
            </div>
            <button
              onClick={startSession}
              className="px-8 py-4 bg-white text-gray-900 rounded-full font-bold text-lg hover:bg-white/90 transition-colors flex items-center gap-2 mx-auto"
            >
              <Play className="w-6 h-6" />
              Start Session
            </button>
          </div>
        ) : (
          // Active Session
          <>
            {/* Phase Indicator */}
            <div className="text-white/80 text-lg font-medium mb-2 animate-pulse">
              {phaseLabels[phase]}
            </div>

            {/* Edge Counter - Tap Area */}
            <button
              onClick={recordEdge}
              disabled={!isActive || isPaused}
              className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                phase === 'edge'
                  ? 'bg-white scale-110 shadow-2xl'
                  : 'bg-white/20 hover:bg-white/30 active:scale-95'
              }`}
            >
              {/* Intensity Ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="128"
                  cy="128"
                  r="120"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="8"
                />
                <circle
                  cx="128"
                  cy="128"
                  r="120"
                  fill="none"
                  stroke="white"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${intensityPercent * 7.54} 754`}
                  className="transition-all duration-300"
                />
              </svg>

              {/* Edge Count */}
              <span
                className={`text-6xl font-bold ${
                  phase === 'edge' ? 'text-pink-500' : 'text-white'
                }`}
              >
                {edgeCount}
              </span>
              <span
                className={`text-sm uppercase tracking-wider ${
                  phase === 'edge' ? 'text-pink-400' : 'text-white/70'
                }`}
              >
                edges
              </span>

              {/* Tap hint */}
              {isActive && !isPaused && phase !== 'edge' && (
                <span className="absolute bottom-8 text-white/50 text-xs">
                  Tap when you edge
                </span>
              )}
            </button>

            {/* Intensity Bar */}
            <div className="w-64 mt-8">
              <div className="flex items-center justify-between text-white/80 text-sm mb-2">
                <span>Intensity</span>
                <span className="font-mono">{intensity}/20</span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${intensityPercent}%` }}
                />
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-6 mt-8 text-white/80">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Peak: {peakIntensity}</span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                <span className="text-sm">
                  Avg: {intensitySamples > 0 ? Math.round(totalIntensity / intensitySamples) : 0}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4 mt-8">
              <button
                onClick={togglePause}
                className="p-4 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                {isPaused ? (
                  <Play className="w-6 h-6 text-white" />
                ) : (
                  <Pause className="w-6 h-6 text-white" />
                )}
              </button>

              <button
                onClick={resetSession}
                className="p-4 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <RotateCcw className="w-6 h-6 text-white" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer - End Session */}
      {isActive && (
        <div className="p-4">
          <button
            onClick={endSession}
            className="w-full py-4 bg-white/20 hover:bg-white/30 rounded-xl text-white font-medium transition-colors"
          >
            End Session
          </button>
        </div>
      )}
    </div>
  );
}
