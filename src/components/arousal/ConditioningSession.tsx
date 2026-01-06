// Conditioning Session Component
// Pairs Lovense stimulation with feminization practice

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  Mic,
  Heart,
  Sparkles,
  CheckCircle,
  Volume2,
  Target,
  Vibrate,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';
import {
  CONDITIONING_PATTERNS,
  sendConditioningReward,
  calculateDenialAwareIntensity,
} from '../../lib/lovense-feminization';
import type { ArousalMetrics } from '../../types/arousal';

interface ConditioningSessionProps {
  arousalMetrics?: ArousalMetrics | null;
  onComplete?: (stats: ConditioningStats) => void;
  onClose: () => void;
  className?: string;
}

interface ConditioningStats {
  duration: number;
  patternsCompleted: string[];
  rewardsEarned: number;
  peakIntensity: number;
}

type SessionPhase = 'setup' | 'active' | 'complete';

// Affirmations for conditioning
const AFFIRMATIONS = [
  "I am becoming my true self",
  "My feminine voice flows naturally",
  "I embrace my authentic expression",
  "Every day I grow more confident",
  "I deserve to feel beautiful",
  "My body knows how to be feminine",
  "I release resistance and flow with change",
  "I am worthy of love and acceptance",
  "My transformation is beautiful",
  "I trust the process of becoming",
];

// Voice targets for practice
const VOICE_TARGETS = [
  { pitch: 'high', prompt: 'Speak in your lightest, brightest voice' },
  { pitch: 'medium', prompt: 'Find your comfortable feminine register' },
  { pitch: 'resonance', prompt: 'Focus on forward resonance' },
  { pitch: 'inflection', prompt: 'Add feminine inflection patterns' },
];

export function ConditioningSession({
  arousalMetrics,
  onComplete,
  onClose,
  className = '',
}: ConditioningSessionProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const lovense = useLovense();

  // Session state
  const [phase, setPhase] = useState<SessionPhase>('setup');
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Conditioning state
  const [currentAffirmationIndex, setCurrentAffirmationIndex] = useState(0);
  const [affirmationsCompleted, setAffirmationsCompleted] = useState<number[]>([]);
  const [currentVoiceTarget, setCurrentVoiceTarget] = useState(0);
  const [voiceTargetsHit, setVoiceTargetsHit] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [rewardsEarned, setRewardsEarned] = useState(0);
  const [peakIntensity, setPeakIntensity] = useState(0);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const affirmationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate recommended intensity
  const recommendedIntensity = calculateDenialAwareIntensity(arousalMetrics || null);

  // Get active patterns
  const activePatterns = CONDITIONING_PATTERNS.filter(p => selectedPatterns.includes(p.id));
  const currentPattern = activePatterns[currentPatternIndex];

  // Timer effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  // Affirmation rotation (every 30 seconds during active phase)
  useEffect(() => {
    if (phase === 'active' && isTimerRunning && currentPattern?.triggerType === 'affirmation') {
      affirmationIntervalRef.current = setInterval(() => {
        setCurrentAffirmationIndex(i => (i + 1) % AFFIRMATIONS.length);
      }, 30000);
    }
    return () => {
      if (affirmationIntervalRef.current) clearInterval(affirmationIntervalRef.current);
    };
  }, [phase, isTimerRunning, currentPattern]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Toggle pattern selection
  const togglePattern = (patternId: string) => {
    setSelectedPatterns(prev =>
      prev.includes(patternId)
        ? prev.filter(id => id !== patternId)
        : [...prev, patternId]
    );
  };

  // Start session
  const handleStartSession = async () => {
    if (selectedPatterns.length === 0) return;

    // Connect Lovense if not connected
    if (lovense.status !== 'connected') {
      await lovense.connect();
    }

    setPhase('active');
    setIsTimerRunning(true);

    // Start with low intensity
    if (lovense.status === 'connected') {
      await lovense.setIntensity(Math.floor(recommendedIntensity / 2));
    }
  };

  // Send reward for completing an action
  const handleReward = useCallback(async () => {
    if (!currentPattern) return;

    await sendConditioningReward(currentPattern, lovense.activeToy?.id);
    setRewardsEarned(r => r + 1);

    if (currentPattern.rewardIntensity > peakIntensity) {
      setPeakIntensity(currentPattern.rewardIntensity);
    }

    if (isBambiMode) {
      triggerHearts();
    }
  }, [currentPattern, lovense.activeToy?.id, peakIntensity, isBambiMode, triggerHearts]);

  // Complete an affirmation
  const handleAffirmationComplete = async () => {
    if (!affirmationsCompleted.includes(currentAffirmationIndex)) {
      setAffirmationsCompleted(prev => [...prev, currentAffirmationIndex]);
      await handleReward();
    }
    setCurrentAffirmationIndex(i => (i + 1) % AFFIRMATIONS.length);
  };

  // Handle voice target hit
  const handleVoiceTargetHit = async () => {
    setVoiceTargetsHit(v => v + 1);
    await handleReward();
    setCurrentVoiceTarget(i => (i + 1) % VOICE_TARGETS.length);
  };

  // Toggle recording for voice practice
  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  // Move to next pattern
  const handleNextPattern = () => {
    if (currentPatternIndex < activePatterns.length - 1) {
      setCurrentPatternIndex(i => i + 1);
    } else {
      handleEndSession();
    }
  };

  // End session
  const handleEndSession = () => {
    setIsTimerRunning(false);
    lovense.stop();

    const stats: ConditioningStats = {
      duration: timerSeconds,
      patternsCompleted: selectedPatterns,
      rewardsEarned,
      peakIntensity,
    };

    setPhase('complete');
    onComplete?.(stats);
  };

  // Close session
  const handleClose = () => {
    setIsTimerRunning(false);
    lovense.stop();
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 ${className}`}
    >
      <div
        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
            isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Conditioning Session
          </h2>
          <button
            onClick={handleClose}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-400'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {/* SETUP PHASE */}
          {phase === 'setup' && (
            <div className="space-y-6">
              <div className="text-center mb-4">
                <Sparkles
                  className={`w-12 h-12 mx-auto mb-3 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                  }`}
                />
                <p
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                >
                  Select conditioning patterns to practice. Each pattern pairs
                  feminization practice with pleasure rewards.
                </p>
              </div>

              {/* Lovense Status */}
              <div
                className={`p-4 rounded-xl ${
                  isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Vibrate
                      className={`w-5 h-5 ${
                        lovense.status === 'connected'
                          ? 'text-green-500'
                          : isBambiMode
                            ? 'text-pink-300'
                            : 'text-protocol-text-muted'
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {lovense.status === 'connected'
                        ? lovense.activeToy?.name || 'Toy Connected'
                        : 'Connect Lovense for rewards'}
                    </span>
                  </div>
                  {lovense.status !== 'connected' && (
                    <button
                      onClick={() => lovense.connect()}
                      disabled={lovense.status === 'connecting'}
                      className={`px-3 py-1 rounded-lg text-sm font-medium ${
                        isBambiMode
                          ? 'bg-pink-500 text-white hover:bg-pink-600'
                          : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                      }`}
                    >
                      {lovense.status === 'connecting' ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>

              {/* Pattern Selection */}
              <div>
                <h3
                  className={`text-sm font-medium mb-3 ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  Select Patterns
                </h3>
                <div className="space-y-2">
                  {CONDITIONING_PATTERNS.map((pattern) => (
                    <button
                      key={pattern.id}
                      onClick={() => togglePattern(pattern.id)}
                      className={`w-full p-4 rounded-xl text-left transition-all ${
                        selectedPatterns.includes(pattern.id)
                          ? isBambiMode
                            ? 'bg-pink-500 text-white'
                            : 'bg-protocol-accent text-white'
                          : isBambiMode
                            ? 'bg-pink-50 hover:bg-pink-100'
                            : 'bg-protocol-surface hover:bg-protocol-surface-light'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p
                            className={`font-medium ${
                              selectedPatterns.includes(pattern.id)
                                ? 'text-white'
                                : isBambiMode
                                  ? 'text-pink-700'
                                  : 'text-protocol-text'
                            }`}
                          >
                            {pattern.name}
                          </p>
                          <p
                            className={`text-sm ${
                              selectedPatterns.includes(pattern.id)
                                ? 'text-white/80'
                                : isBambiMode
                                  ? 'text-pink-500'
                                  : 'text-protocol-text-muted'
                            }`}
                          >
                            {pattern.description}
                          </p>
                        </div>
                        {selectedPatterns.includes(pattern.id) && (
                          <CheckCircle className="w-5 h-5" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStartSession}
                disabled={selectedPatterns.length === 0}
                className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                  selectedPatterns.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                }`}
              >
                <Play className="w-5 h-5" />
                Start Conditioning
              </button>
            </div>
          )}

          {/* ACTIVE PHASE */}
          {phase === 'active' && currentPattern && (
            <div className="space-y-6">
              {/* Timer & Progress */}
              <div className="text-center">
                <p
                  className={`text-4xl font-mono font-bold mb-2 ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                  }`}
                >
                  {formatTime(timerSeconds)}
                </p>
                <p
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                >
                  Pattern {currentPatternIndex + 1} of {activePatterns.length}
                </p>
              </div>

              {/* Current Pattern Card */}
              <div
                className={`p-6 rounded-xl text-center ${
                  isBambiMode
                    ? 'bg-gradient-to-r from-pink-50 to-purple-50 border-2 border-pink-200'
                    : 'bg-protocol-surface border border-protocol-border'
                }`}
              >
                <h3
                  className={`text-lg font-semibold mb-2 ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {currentPattern.name}
                </h3>

                {/* Affirmation Pattern */}
                {currentPattern.triggerType === 'affirmation' && (
                  <div className="space-y-4">
                    <p
                      className={`text-lg italic ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      "{AFFIRMATIONS[currentAffirmationIndex]}"
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Speak this affirmation aloud, then tap Complete
                    </p>
                    <button
                      onClick={handleAffirmationComplete}
                      className={`px-6 py-3 rounded-xl font-medium ${
                        isBambiMode
                          ? 'bg-pink-500 text-white hover:bg-pink-600'
                          : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                      }`}
                    >
                      <CheckCircle className="w-5 h-5 inline mr-2" />
                      Complete
                    </button>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      {affirmationsCompleted.length} affirmations completed
                    </p>
                  </div>
                )}

                {/* Voice Target Pattern */}
                {currentPattern.triggerType === 'voice_target' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      {isRecording && (
                        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      )}
                      <Mic
                        className={`w-8 h-8 ${
                          isRecording
                            ? 'text-red-500'
                            : isBambiMode
                              ? 'text-pink-500'
                              : 'text-protocol-accent'
                        }`}
                      />
                    </div>
                    <p
                      className={`text-lg ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {VOICE_TARGETS[currentVoiceTarget].prompt}
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={toggleRecording}
                        className={`px-4 py-2 rounded-xl font-medium ${
                          isRecording
                            ? 'bg-red-500 text-white'
                            : isBambiMode
                              ? 'bg-pink-100 text-pink-600'
                              : 'bg-protocol-surface text-protocol-text'
                        }`}
                      >
                        {isRecording ? 'Stop' : 'Record'}
                      </button>
                      <button
                        onClick={handleVoiceTargetHit}
                        className={`px-4 py-2 rounded-xl font-medium ${
                          isBambiMode
                            ? 'bg-pink-500 text-white hover:bg-pink-600'
                            : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                        }`}
                      >
                        <Target className="w-4 h-4 inline mr-1" />
                        Hit Target
                      </button>
                    </div>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      {voiceTargetsHit} voice targets hit
                    </p>
                  </div>
                )}

                {/* Posture Pattern */}
                {currentPattern.triggerType === 'posture' && (
                  <div className="space-y-4">
                    <div
                      className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                        isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
                      }`}
                    >
                      <Heart
                        className={`w-8 h-8 ${
                          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                        }`}
                      />
                    </div>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                      }`}
                    >
                      Stand or sit with feminine posture. Shoulders back, chest open,
                      weight balanced. When you feel aligned, tap for your reward.
                    </p>
                    <button
                      onClick={handleReward}
                      className={`px-6 py-3 rounded-xl font-medium ${
                        isBambiMode
                          ? 'bg-pink-500 text-white hover:bg-pink-600'
                          : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                      }`}
                    >
                      <Sparkles className="w-5 h-5 inline mr-2" />
                      Claim Reward
                    </button>
                  </div>
                )}

                {/* Anchor Focus Pattern */}
                {currentPattern.triggerType === 'anchor_focus' && (
                  <div className="space-y-4">
                    <Volume2
                      className={`w-10 h-10 mx-auto ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                      }`}
                    />
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                      }`}
                    >
                      Focus on your anchors. Feel the scent, the fabric, the jewelry.
                      Let each sensation deepen your connection to her. When fully focused,
                      claim your building reward.
                    </p>
                    <button
                      onClick={handleReward}
                      className={`px-6 py-3 rounded-xl font-medium ${
                        isBambiMode
                          ? 'bg-pink-500 text-white hover:bg-pink-600'
                          : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                      }`}
                    >
                      <Heart className="w-5 h-5 inline mr-2" />
                      Deepen Focus
                    </button>
                  </div>
                )}

                {/* Name Response Pattern */}
                {currentPattern.triggerType === 'name_spoken' && (
                  <div className="space-y-4">
                    <p
                      className={`text-lg font-semibold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      Say her name out loud
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Each time you speak her name, you reinforce the connection.
                    </p>
                    <button
                      onClick={handleReward}
                      className={`px-6 py-3 rounded-xl font-medium ${
                        isBambiMode
                          ? 'bg-pink-500 text-white hover:bg-pink-600'
                          : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                      }`}
                    >
                      <Sparkles className="w-5 h-5 inline mr-2" />
                      I said her name
                    </button>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div
                className={`p-4 rounded-xl ${
                  isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
                }`}
              >
                <div className="flex justify-between text-sm">
                  <div className="text-center">
                    <p
                      className={`text-lg font-bold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {rewardsEarned}
                    </p>
                    <p
                      className={isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}
                    >
                      Rewards
                    </p>
                  </div>
                  <div className="text-center">
                    <p
                      className={`text-lg font-bold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {peakIntensity}
                    </p>
                    <p
                      className={isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}
                    >
                      Peak
                    </p>
                  </div>
                  <div className="text-center">
                    <p
                      className={`text-lg font-bold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {lovense.currentIntensity}
                    </p>
                    <p
                      className={isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}
                    >
                      Intensity
                    </p>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                    isBambiMode
                      ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                      : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                  }`}
                >
                  {isTimerRunning ? (
                    <>
                      <Pause className="w-5 h-5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Resume
                    </>
                  )}
                </button>
                <button
                  onClick={handleNextPattern}
                  className={`flex-1 py-3 rounded-xl font-medium ${
                    isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                  }`}
                >
                  {currentPatternIndex < activePatterns.length - 1
                    ? 'Next Pattern'
                    : 'Complete'}
                </button>
              </div>
            </div>
          )}

          {/* COMPLETE PHASE */}
          {phase === 'complete' && (
            <div className="text-center py-8">
              <div
                className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  isBambiMode
                    ? 'bg-gradient-to-r from-pink-400 to-pink-600'
                    : 'bg-gradient-to-r from-protocol-accent to-purple-600'
                }`}
              >
                <Sparkles className="w-10 h-10 text-white" />
              </div>

              <h3
                className={`text-2xl font-bold mb-2 ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Conditioning Complete!
              </h3>

              <div
                className={`p-4 rounded-xl my-6 ${
                  isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
                }`}
              >
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p
                      className={`text-2xl font-bold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {formatTime(timerSeconds)}
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Duration
                    </p>
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {rewardsEarned}
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Rewards Earned
                    </p>
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {selectedPatterns.length}
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Patterns
                    </p>
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                      }`}
                    >
                      {peakIntensity}
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Peak Intensity
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className={`w-full py-3 rounded-xl font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                }`}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
