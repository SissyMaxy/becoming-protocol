// EdgeSessionCore.tsx
// Core session interface with phase tracking, pattern control, and haptic integration

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  Timer,
  TrendingUp,
  Heart,
  Zap,
  Target,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Waves,
  AlertOctagon,
  ThermometerSun,
  ShieldAlert,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useHandlerContextOptional } from '../../context/HandlerContext';
import { useLovense } from '../../hooks/useLovense';
import type { EdgeSessionConfig } from './EdgeSessionEntryFlow';
import type {
  EdgeSessionPhase,
  EdgeEvent,
  SessionSummary,
} from '../../types/edge-session';

interface EdgeSessionCoreProps {
  config: EdgeSessionConfig;
  onEdge: (edgeNumber: number) => void;
  onPhaseChange: (phase: EdgeSessionPhase) => void;
  onAuctionTrigger: (edgeNumber: number) => void;
  onEnd: (summary: SessionSummary) => void;
  onPause: () => void;
  onResume: () => void;
  className?: string;
}

const PHASE_COLORS: Record<EdgeSessionPhase, string> = {
  entry: 'from-gray-600 to-gray-700',
  warmup: 'from-blue-500 to-cyan-500',
  building: 'from-yellow-500 to-orange-500',
  plateau: 'from-purple-500 to-violet-500',
  edge: 'from-red-500 to-pink-500',
  recovery: 'from-indigo-500 to-purple-500',
  auction: 'from-amber-500 to-yellow-500',
  completion: 'from-green-500 to-emerald-500',
  abandoned: 'from-gray-500 to-gray-600',
};

const PHASE_LABELS: Record<EdgeSessionPhase, string> = {
  entry: 'Starting',
  warmup: 'Warming Up',
  building: 'Building',
  plateau: 'Plateau',
  edge: 'EDGE!',
  recovery: 'Recovery',
  auction: 'Commitment',
  completion: 'Complete',
  abandoned: 'Ended',
};

const PHASE_PATTERNS: Record<EdgeSessionPhase, string> = {
  entry: 'constant_subtle',
  warmup: 'warmup_gentle',
  building: 'building_wave',
  plateau: 'plateau_breathing',
  edge: 'edge_crest',
  recovery: 'recovery_gentle',
  auction: 'plateau_sustained',
  completion: 'denial_end_graceful',
  abandoned: 'recovery_quick',
};

export function EdgeSessionCore({
  config,
  onEdge,
  onPhaseChange,
  onAuctionTrigger,
  onEnd,
  onPause,
  onResume,
  className = '',
}: EdgeSessionCoreProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const handlerContext = useHandlerContextOptional();
  const lovense = useLovense();

  // Session state
  const [phase, setPhase] = useState<EdgeSessionPhase>('warmup');
  const [duration, setDuration] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [intensity, setIntensity] = useState(0);
  const [peakIntensity, setPeakIntensity] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [phaseStartTime, setPhaseStartTime] = useState(0);
  const [showIntensityControls, setShowIntensityControls] = useState(false);

  // Pattern state
  const [currentPattern, setCurrentPattern] = useState<string | null>(null);
  const [autoPatternMode, _setAutoPatternMode] = useState(config.patternMode === 'auto');

  // Safety controls state
  const [isEmergencyStop, setIsEmergencyStop] = useState(false);
  const [isGettingClose, setIsGettingClose] = useState(false);
  const [cooldownSecondsRemaining, setCooldownSecondsRemaining] = useState(0);

  // Stats tracking
  const [totalIntensity, setTotalIntensity] = useState(0);
  const [intensitySamples, setIntensitySamples] = useState(0);
  const [_edgeEvents, setEdgeEvents] = useState<EdgeEvent[]>([]);
  const [patternsUsed, setPatternsUsed] = useState<string[]>([]);
  const [timeInPhases, setTimeInPhases] = useState<Record<EdgeSessionPhase, number>>({
    entry: 0,
    warmup: 0,
    building: 0,
    plateau: 0,
    edge: 0,
    recovery: 0,
    auction: 0,
    completion: 0,
    abandoned: 0,
  });

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastEdgeTime = useRef<number>(0);
  const sessionStartTime = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>(`edge-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start session timer
  useEffect(() => {
    sessionStartTime.current = Date.now();

    timerRef.current = setInterval(() => {
      if (!isPaused) {
        setDuration(d => d + 1);

        // Track intensity
        const currentIntensity = lovense.currentIntensity;
        setIntensity(currentIntensity);
        if (currentIntensity > peakIntensity) {
          setPeakIntensity(currentIntensity);
        }
        setTotalIntensity(t => t + currentIntensity);
        setIntensitySamples(s => s + 1);

        // Track time in phase
        setTimeInPhases(prev => ({
          ...prev,
          [phase]: prev[phase] + 1,
        }));
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, phase, lovense.currentIntensity, peakIntensity]);

  // Start edge training on mount
  useEffect(() => {
    const intensityMap = {
      gentle: { base: 4, max: 12 },
      moderate: { base: 6, max: 16 },
      intense: { base: 8, max: 20 },
    };

    const settings = intensityMap[config.intensityPreference];

    lovense.startEdgeTraining({
      baseIntensity: settings.base,
      maxIntensity: settings.max,
      intensityPerEdge: 1,
    });

    // Start with warmup pattern
    if (autoPatternMode) {
      playPattern(PHASE_PATTERNS.warmup);
    }

    // Notify Handler AI of session start
    handlerContext?.notifySessionEvent({
      sessionId: sessionIdRef.current,
      event: 'session_start',
      data: {
        sessionType: config.sessionType,
        intensityPreference: config.intensityPreference,
        goal: config.goal,
        goalTarget: config.goalTarget,
        auctionEnabled: config.auctionEnabled,
      },
    });

    return () => {
      lovense.stopEdgeTraining();
      lovense.stop();
    };
  }, []);

  // Handle phase transitions
  useEffect(() => {
    onPhaseChange(phase);
    setPhaseStartTime(Date.now());

    // Auto-play patterns based on phase
    if (autoPatternMode && phase !== 'entry' && phase !== 'abandoned') {
      playPattern(PHASE_PATTERNS[phase]);
    }
  }, [phase, autoPatternMode, onPhaseChange]);

  // Play pattern
  const playPattern = useCallback(async (patternName: string) => {
    try {
      await lovense.playPattern(patternName);
      setCurrentPattern(patternName);
      if (!patternsUsed.includes(patternName)) {
        setPatternsUsed(prev => [...prev, patternName]);
      }
    } catch (error) {
      console.error('Failed to play pattern:', error);
    }
  }, [lovense, patternsUsed]);

  // Record edge
  const recordEdge = useCallback(async () => {
    if (isPaused) return;

    const now = Date.now();
    // Debounce - minimum 2 seconds between edges
    if (now - lastEdgeTime.current < 2000) return;
    lastEdgeTime.current = now;

    const newCount = edgeCount + 1;
    setEdgeCount(newCount);
    setPhase('edge');

    // Record edge event
    const edgeEvent: EdgeEvent = {
      id: `edge-${newCount}`,
      sessionId: '',
      edgeNumber: newCount,
      timestamp: new Date().toISOString(),
      intensity: lovense.currentIntensity,
      durationSec: Math.floor((now - phaseStartTime) / 1000),
      patternUsed: currentPattern || undefined,
    };
    setEdgeEvents(prev => [...prev, edgeEvent]);

    // Notify parent
    onEdge(newCount);

    // Notify Handler AI of edge event
    handlerContext?.notifySessionEvent({
      sessionId: sessionIdRef.current,
      event: 'edge',
      data: {
        edgeNumber: newCount,
        intensity: lovense.currentIntensity,
        duration,
        phase,
      },
    });

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 100]);
    }

    // Trigger celebration
    if (isBambiMode) {
      triggerHearts();
    }

    // Check for auction trigger (commitment window)
    if (config.auctionEnabled && (newCount === 5 || newCount === 8 || newCount === 10 || newCount % 5 === 0)) {
      // Notify Handler AI of commitment window
      handlerContext?.notifySessionEvent({
        sessionId: sessionIdRef.current,
        event: 'commitment_window',
        data: {
          edgeCount: newCount,
          intensity: lovense.currentIntensity,
          duration,
        },
      });

      setTimeout(() => {
        onAuctionTrigger(newCount);
      }, 2000);
    }

    // Transition to recovery after edge peak
    setTimeout(() => {
      if (phase === 'edge') {
        setPhase('recovery');
      }
    }, 3000);
  }, [edgeCount, isPaused, lovense.currentIntensity, phaseStartTime, currentPattern, onEdge, config.auctionEnabled, onAuctionTrigger, isBambiMode, triggerHearts, phase]);

  // Increase intensity
  const increaseIntensity = useCallback(() => {
    const newIntensity = Math.min(20, lovense.currentIntensity + 2);
    lovense.setIntensity(newIntensity);
  }, [lovense]);

  // Decrease intensity
  const decreaseIntensity = useCallback(() => {
    const newIntensity = Math.max(0, lovense.currentIntensity - 2);
    lovense.setIntensity(newIntensity);
  }, [lovense]);

  // Toggle pause
  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      onResume();
      lovense.setIntensity(intensity);
    } else {
      setIsPaused(true);
      onPause();
      lovense.stop();
    }
  }, [isPaused, intensity, lovense, onPause, onResume]);

  // Advance phase
  const advancePhase = useCallback(() => {
    const phaseOrder: EdgeSessionPhase[] = ['warmup', 'building', 'plateau', 'edge', 'recovery'];
    const currentIndex = phaseOrder.indexOf(phase);
    if (currentIndex < phaseOrder.length - 1 && currentIndex >= 0) {
      setPhase(phaseOrder[currentIndex + 1]);
    }
  }, [phase]);

  // EMERGENCY STOP - Immediately halt all stimulation
  const handleEmergencyStop = useCallback(() => {
    // Immediately stop all vibration
    lovense.stop();
    lovense.stopEdgeTraining();

    // Set emergency state
    setIsEmergencyStop(true);
    setIsPaused(true);
    setIsGettingClose(false);

    // Strong haptic feedback to confirm stop
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

    console.log('EMERGENCY STOP ACTIVATED');
  }, [lovense]);

  // Resume from emergency stop
  const handleResumeFromEmergency = useCallback(() => {
    setIsEmergencyStop(false);
    setIsPaused(false);
    setPhase('recovery');
    setCooldownSecondsRemaining(30); // 30 second recovery cooldown

    // Restart at very low intensity
    lovense.setIntensity(2);

    // Play recovery pattern
    if (autoPatternMode) {
      playPattern('recovery_gentle');
    }
  }, [lovense, autoPatternMode, playPattern]);

  // GETTING CLOSE - Stop completely and cooldown for 2 minutes
  const handleGettingClose = useCallback(() => {
    if (isEmergencyStop) return;

    // Stop completely
    lovense.stop();

    // Set getting close state and start 2 minute cooldown
    setIsGettingClose(true);
    setCooldownSecondsRemaining(120); // 2 minute cooldown
    setPhase('recovery');

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    console.log('Getting close - stopped for 2 minute cooldown');
  }, [lovense, isEmergencyStop]);

  // Cooldown timer effect
  useEffect(() => {
    if (cooldownSecondsRemaining > 0 && !isPaused && !isEmergencyStop) {
      const timer = setTimeout(() => {
        setCooldownSecondsRemaining(prev => prev - 1);
      }, 1000);

      // When cooldown ends, return with slow fluttering pulses
      if (cooldownSecondsRemaining === 1) {
        setIsGettingClose(false);
        if (phase === 'recovery') {
          setPhase('warmup');
          // Start with gentle fluttering pulses
          playPattern('flutter_gentle');
        }
      }

      return () => clearTimeout(timer);
    }
  }, [cooldownSecondsRemaining, isPaused, isEmergencyStop, phase, playPattern]);

  // End session
  const endSession = useCallback(() => {
    lovense.stopEdgeTraining();
    lovense.stop();

    const summary: SessionSummary = {
      sessionId: sessionIdRef.current,
      sessionType: config.sessionType,
      totalDuration: duration,
      edgeCount,
      peakIntensity,
      patternsUsed,
      commitmentsMade: [],
      bidsAccepted: [],
      anchorsUsed: config.activeAnchors,
      averageIntensity: intensitySamples > 0 ? Math.round(totalIntensity / intensitySamples) : 0,
      timeAtEdge: timeInPhases.edge,
      edgesPerMinute: duration > 0 ? (edgeCount / (duration / 60)) : 0,
      basePoints: 50 + (edgeCount * 10),
      streakMultiplier: 1.0,
      bonusPoints: 0,
      totalPoints: 50 + (edgeCount * 10),
      newAchievements: [],
    };

    // Notify Handler AI of session end
    handlerContext?.notifySessionEvent({
      sessionId: sessionIdRef.current,
      event: 'session_end',
      data: {
        totalDuration: duration,
        edgeCount,
        peakIntensity,
        averageIntensity: summary.averageIntensity,
        edgesPerMinute: summary.edgesPerMinute,
      },
    });

    setPhase('completion');
    onEnd(summary);
  }, [config, duration, edgeCount, peakIntensity, patternsUsed, totalIntensity, intensitySamples, timeInPhases, onEnd, lovense, handlerContext]);

  // Calculate intensity percentage for visual
  const intensityPercent = (intensity / 20) * 100;

  // Check if goal is reached
  const goalReached = config.goal === 'edge_count' && config.goalTarget && edgeCount >= config.goalTarget;
  const durationGoalReached = config.goal === 'duration' && config.goalTarget && duration >= config.goalTarget * 60;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-b ${PHASE_COLORS[phase]} transition-all duration-1000 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white/90">
        <button
          onClick={endSession}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            <span className="font-mono text-lg">{formatTime(duration)}</span>
          </div>

          {config.goal !== 'open_ended' && config.goalTarget && (
            <div
              className={`px-3 py-1 rounded-full text-sm ${
                goalReached || durationGoalReached
                  ? 'bg-green-500/50'
                  : 'bg-white/10'
              }`}
            >
              {config.goal === 'edge_count'
                ? `${edgeCount}/${config.goalTarget}`
                : `${formatTime(duration)} / ${config.goalTarget}m`}
            </div>
          )}
        </div>
      </div>

      {/* Phase Indicator */}
      <div className="flex justify-center mb-2">
        <div
          className={`px-4 py-1.5 rounded-full bg-white/20 text-white text-sm font-medium ${
            phase === 'edge' ? 'animate-pulse scale-110' : ''
          }`}
        >
          {PHASE_LABELS[phase]}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Edge Counter - Tap Area */}
        <button
          onClick={recordEdge}
          disabled={isPaused}
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
            {edgeCount === 1 ? 'edge' : 'edges'}
          </span>

          {/* Tap hint */}
          {!isPaused && phase !== 'edge' && (
            <span className="absolute bottom-8 text-white/50 text-xs">
              Tap when you edge
            </span>
          )}
        </button>

        {/* Intensity Display and Controls */}
        <div className="w-64 mt-8">
          <button
            onClick={() => setShowIntensityControls(!showIntensityControls)}
            className="w-full"
          >
            <div className="flex items-center justify-between text-white/80 text-sm mb-2">
              <span className="flex items-center gap-1">
                <Zap className="w-4 h-4" />
                Intensity
              </span>
              <span className="font-mono">{intensity}/20</span>
            </div>
            <div className="h-3 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${intensityPercent}%` }}
              />
            </div>
          </button>

          {/* Intensity Controls */}
          {showIntensityControls && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={decreaseIntensity}
                className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <ChevronDown className="w-6 h-6 text-white" />
              </button>
              <span className="text-white text-2xl font-bold w-12 text-center">
                {intensity}
              </span>
              <button
                onClick={increaseIntensity}
                className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <ChevronUp className="w-6 h-6 text-white" />
              </button>
            </div>
          )}
        </div>

        {/* Pattern Info */}
        {currentPattern && (
          <div className="mt-4 flex items-center gap-2 text-white/60 text-sm">
            <Waves className="w-4 h-4" />
            <span>{currentPattern.replace(/_/g, ' ')}</span>
          </div>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-6 mt-6 text-white/80">
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

        {/* Goal Reached Notification */}
        {(goalReached || durationGoalReached) && (
          <div className="mt-6 px-6 py-3 bg-green-500/30 rounded-xl text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <span>Goal reached! End when ready.</span>
          </div>
        )}

        {/* SAFETY CONTROLS - Getting Close Button */}
        <div className="w-full max-w-xs mt-6">
          <button
            onClick={handleGettingClose}
            disabled={isPaused || isEmergencyStop || isGettingClose}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
              isGettingClose
                ? 'bg-yellow-500/50 text-yellow-100 cursor-not-allowed'
                : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-400 hover:to-orange-400 active:scale-95 shadow-lg'
            }`}
          >
            <ThermometerSun className="w-6 h-6" />
            {isGettingClose ? (
              <span>Cooling Down... {formatTime(cooldownSecondsRemaining)}</span>
            ) : (
              <span>Getting Close!</span>
            )}
          </button>
          <p className="text-center text-white/50 text-xs mt-2">
            {isGettingClose ? 'Paused - will return with gentle pulses' : 'Tap to pause for 2 minutes'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mt-6">
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
            onClick={advancePhase}
            className="p-4 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            title="Next phase"
          >
            <Target className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Paused Overlay */}
        {isPaused && !isEmergencyStop && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center">
              <Pause className="w-16 h-16 text-white mx-auto mb-4" />
              <p className="text-white text-xl">Paused</p>
              <button
                onClick={togglePause}
                className="mt-4 px-6 py-3 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors"
              >
                Resume
              </button>
            </div>
          </div>
        )}

        {/* EMERGENCY STOP Overlay */}
        {isEmergencyStop && (
          <div className="absolute inset-0 bg-red-900/90 flex items-center justify-center z-60">
            <div className="text-center p-8">
              <div className="w-24 h-24 rounded-full bg-red-500 flex items-center justify-center mx-auto mb-6 animate-pulse">
                <ShieldAlert className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-white text-3xl font-bold mb-2">STOPPED</h2>
              <p className="text-red-200 text-lg mb-8">
                All stimulation halted. Take your time.
              </p>
              <div className="space-y-4">
                <button
                  onClick={handleResumeFromEmergency}
                  className="w-full py-4 px-8 bg-white/20 rounded-xl text-white font-medium hover:bg-white/30 transition-colors"
                >
                  Resume Session (Low Intensity)
                </button>
                <button
                  onClick={endSession}
                  className="w-full py-4 px-8 bg-red-600 rounded-xl text-white font-medium hover:bg-red-700 transition-colors"
                >
                  End Session
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Emergency Stop & End Session */}
      <div className="p-4 space-y-3">
        {/* EMERGENCY STOP BUTTON - Always visible, prominent */}
        <button
          onClick={handleEmergencyStop}
          disabled={isEmergencyStop}
          className={`w-full py-5 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
            isEmergencyStop
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600 active:scale-[0.98] shadow-lg border-2 border-red-400'
          }`}
        >
          <AlertOctagon className="w-7 h-7" />
          <span>EMERGENCY STOP</span>
        </button>

        <button
          onClick={endSession}
          className="w-full py-4 bg-white/20 hover:bg-white/30 rounded-xl text-white font-medium transition-colors"
        >
          End Session
        </button>
      </div>
    </div>
  );
}

// Quick Patterns Bar Component
export function QuickPatternsBar({
  onPatternSelect,
  currentPattern,
  phase: _phase,
}: {
  onPatternSelect: (patternName: string) => void;
  currentPattern: string | null;
  phase: EdgeSessionPhase;
}) {
  const patterns = [
    { name: 'building_steady', label: 'Steady', icon: <TrendingUp className="w-4 h-4" /> },
    { name: 'building_wave', label: 'Wave', icon: <Waves className="w-4 h-4" /> },
    { name: 'plateau_breathing', label: 'Breath', icon: <Heart className="w-4 h-4" /> },
    { name: 'tease_almost', label: 'Tease', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="flex gap-2 p-2 bg-black/20 rounded-xl">
      {patterns.map((pattern) => (
        <button
          key={pattern.name}
          onClick={() => onPatternSelect(pattern.name)}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-all ${
            currentPattern === pattern.name
              ? 'bg-white text-gray-900'
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
        >
          {pattern.icon}
          <span>{pattern.label}</span>
        </button>
      ))}
    </div>
  );
}
