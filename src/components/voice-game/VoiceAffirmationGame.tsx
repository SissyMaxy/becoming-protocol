/**
 * Voice Affirmation Game
 * Main component for the gamified voice training feature
 */

import { useState } from 'react';
import {
  ArrowLeft,
  Mic,
  MicOff,
  Play,
  Pause,
  SkipForward,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Flame,
  Star,
  Trophy,
  Volume2,
  ChevronRight,
} from 'lucide-react';
import { useVoiceGame } from '../../hooks/useVoiceGame';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';
import { getMatchFeedback } from '../../lib/voice-recognition';
import type {
  VoiceGameDifficulty,
  AffirmationCategory,
} from '../../types/voice-game';

interface VoiceAffirmationGameProps {
  onBack: () => void;
}

export function VoiceAffirmationGame({ onBack }: VoiceAffirmationGameProps) {
  const { isBambiMode } = useBambiMode();
  const lovense = useLovense();

  const {
    phase,
    session,
    progress,
    settings,
    currentAffirmation,
    currentAttempt,
    sessionStreak,
    lastMatchResult,
    countdown,
    affirmationIndex,
    totalAffirmations,
    transcript,
    interimTranscript,
    speechError,
    isSpeechSupported,
    startSession,
    retryAffirmation,
    skipAffirmation,
    pauseSession,
    resumeSession,
    endSession,
    nextAffirmation,
    isLoading,
  } = useVoiceGame({
    onSessionComplete: (session) => {
      console.log('Session completed:', session);
    },
    onAchievementUnlocked: (achievement) => {
      console.log('Achievement unlocked:', achievement);
    },
  });

  // Setup state
  const [selectedDifficulty, setSelectedDifficulty] = useState<VoiceGameDifficulty>(
    (settings?.defaultDifficulty as VoiceGameDifficulty) || 2
  );
  const [selectedCategories, setSelectedCategories] = useState<AffirmationCategory[]>(
    settings?.preferredCategories || ['identity', 'feminine', 'transformation']
  );

  const isLovenseConnected = lovense.status === 'connected' || lovense.cloudConnected;

  // Category info
  const categoryInfo: Record<AffirmationCategory, { label: string; color: string }> = {
    identity: { label: 'Identity', color: '#3b82f6' },
    capability: { label: 'Capability', color: '#22c55e' },
    worthiness: { label: 'Worthiness', color: '#f59e0b' },
    transformation: { label: 'Transformation', color: '#8b5cf6' },
    gratitude: { label: 'Gratitude', color: '#ec4899' },
    feminine: { label: 'Feminine', color: '#f472b6' },
    submission: { label: 'Submission', color: '#6366f1' },
  };

  // Toggle category selection
  const toggleCategory = (category: AffirmationCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  // Handle start
  const handleStart = () => {
    if (selectedCategories.length === 0) return;
    startSession(selectedDifficulty, selectedCategories);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-protocol-accent/30 border-t-protocol-accent rounded-full animate-spin mx-auto mb-4" />
          <p className={isBambiMode ? 'text-pink-700' : 'text-protocol-text'}>Loading...</p>
        </div>
      </div>
    );
  }

  // Not supported
  if (!isSpeechSupported) {
    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} p-4`}>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-protocol-text/70 hover:text-protocol-text mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        <div className="text-center py-12">
          <MicOff className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold text-protocol-text mb-2">
            Speech Recognition Not Available
          </h2>
          <p className="text-protocol-text/70">
            Your browser doesn't support speech recognition.
            Please try Chrome, Edge, or Safari.
          </p>
        </div>
      </div>
    );
  }

  // Setup phase
  if (phase === 'setup') {
    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} p-4`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-protocol-text/70 hover:text-protocol-text"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          {isLovenseConnected && (
            <div className="flex items-center gap-1 text-pink-500 text-sm">
              <Volume2 className="w-4 h-4" />
              Haptics On
            </div>
          )}
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <Mic className={`w-12 h-12 mx-auto mb-3 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <h1 className="text-2xl font-bold text-protocol-text mb-2">
            Voice Affirmation Game
          </h1>
          <p className="text-protocol-text/70">
            Speak affirmations aloud for rewards
          </p>
        </div>

        {/* Progress summary */}
        {progress && (
          <div className={`${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'} rounded-xl p-4 mb-6`}>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-protocol-text">
                  {progress.totalAffirmations}
                </div>
                <div className="text-xs text-protocol-text/60">Affirmations</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-protocol-text flex items-center justify-center gap-1">
                  <Flame className="w-5 h-5 text-orange-500" />
                  {progress.currentStreak}
                </div>
                <div className="text-xs text-protocol-text/60">Day Streak</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-protocol-text">
                  {Math.round(progress.averageAccuracy)}%
                </div>
                <div className="text-xs text-protocol-text/60">Accuracy</div>
              </div>
            </div>
          </div>
        )}

        {/* Difficulty */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-protocol-text/70 mb-3">Difficulty</h3>
          <div className="flex gap-2">
            {([1, 2, 3, 4, 5] as VoiceGameDifficulty[]).map((level) => (
              <button
                key={level}
                onClick={() => setSelectedDifficulty(level)}
                className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                  selectedDifficulty === level
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                    : isBambiMode
                    ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface/80'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-xs text-protocol-text/50 mt-2">
            Level {selectedDifficulty}: {selectedDifficulty <= 2 ? 'Easier' : selectedDifficulty >= 4 ? 'Stricter' : 'Moderate'} matching
          </p>
        </div>

        {/* Categories */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-protocol-text/70 mb-3">Categories</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(categoryInfo) as AffirmationCategory[]).map((category) => {
              const info = categoryInfo[category];
              const isSelected = selectedCategories.includes(category);
              return (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isSelected
                      ? 'text-white'
                      : 'bg-protocol-surface text-protocol-text/70 hover:text-protocol-text'
                  }`}
                  style={{
                    backgroundColor: isSelected ? info.color : undefined,
                  }}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={selectedCategories.length === 0}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
            selectedCategories.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
          }`}
        >
          <Play className="w-6 h-6" />
          Start Session
        </button>
      </div>
    );
  }

  // Complete phase
  if (phase === 'complete' && session) {
    const accuracy = session.affirmationsAttempted > 0
      ? Math.round((session.affirmationsCompleted / session.affirmationsAttempted) * 100)
      : 0;

    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'} p-4`}>
        <div className="text-center py-8">
          <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <Trophy className={`w-10 h-10 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          </div>

          <h1 className="text-2xl font-bold text-protocol-text mb-2">
            Session Complete!
          </h1>

          <div className="grid grid-cols-2 gap-4 my-8">
            <div className={`${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'} rounded-xl p-4`}>
              <div className="text-3xl font-bold text-protocol-text">
                {session.affirmationsCompleted}/{session.affirmationsAttempted}
              </div>
              <div className="text-sm text-protocol-text/60">Completed</div>
            </div>
            <div className={`${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'} rounded-xl p-4`}>
              <div className="text-3xl font-bold text-protocol-text">
                {accuracy}%
              </div>
              <div className="text-sm text-protocol-text/60">Success Rate</div>
            </div>
            <div className={`${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'} rounded-xl p-4`}>
              <div className="text-3xl font-bold text-protocol-text flex items-center justify-center gap-1">
                <Flame className="w-6 h-6 text-orange-500" />
                {session.longestStreak}
              </div>
              <div className="text-sm text-protocol-text/60">Best Streak</div>
            </div>
            <div className={`${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'} rounded-xl p-4`}>
              <div className="text-3xl font-bold text-protocol-text flex items-center justify-center gap-1">
                <Star className="w-6 h-6 text-yellow-500" />
                {session.totalPoints}
              </div>
              <div className="text-sm text-protocol-text/60">Points</div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => startSession(selectedDifficulty, selectedCategories)}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
              }`}
            >
              <RefreshCw className="w-5 h-5" />
              Play Again
            </button>
            <button
              onClick={onBack}
              className={`w-full py-4 rounded-xl font-medium ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                  : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface/80'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active game phases (countdown, listening, processing, success, retry, paused)
  const phaseColors = {
    countdown: 'from-blue-600 to-purple-600',
    listening: 'from-purple-600 to-pink-600',
    processing: 'from-gray-600 to-gray-700',
    success: 'from-green-500 to-emerald-600',
    retry: 'from-yellow-500 to-orange-500',
    paused: 'from-gray-600 to-gray-700',
    setup: 'from-gray-600 to-gray-700',
    complete: 'from-gray-600 to-gray-700',
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${phaseColors[phase]} text-white`}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => endSession()}
          className="p-2 rounded-full bg-white/20 hover:bg-white/30"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-4">
          {/* Progress */}
          <div className="text-sm font-medium">
            {affirmationIndex + 1} / {totalAffirmations}
          </div>

          {/* Streak */}
          {sessionStreak > 0 && (
            <div className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded-full">
              <Flame className="w-4 h-4 text-orange-300" />
              <span className="font-bold">{sessionStreak}</span>
            </div>
          )}

          {/* Pause/Resume */}
          {phase !== 'paused' && phase !== 'processing' && (
            <button
              onClick={pauseSession}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30"
            >
              <Pause className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Paused overlay */}
        {phase === 'paused' && (
          <div className="text-center">
            <Pause className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h2 className="text-2xl font-bold mb-8">Paused</h2>
            <button
              onClick={resumeSession}
              className="px-8 py-4 bg-white text-gray-900 rounded-xl font-bold flex items-center gap-2 mx-auto"
            >
              <Play className="w-6 h-6" />
              Resume
            </button>
          </div>
        )}

        {/* Countdown */}
        {phase === 'countdown' && (
          <div className="text-center">
            <div className="text-9xl font-bold mb-8 animate-pulse">
              {countdown}
            </div>
            <p className="text-xl opacity-70">Get ready to speak...</p>
          </div>
        )}

        {/* Listening / Processing / Success / Retry */}
        {(phase === 'listening' || phase === 'processing' || phase === 'success' || phase === 'retry') && currentAffirmation && (
          <div className="text-center w-full max-w-md">
            {/* Affirmation text */}
            <div className="mb-8">
              <p className="text-3xl md:text-4xl font-light leading-relaxed">
                "{currentAffirmation.text}"
              </p>
            </div>

            {/* Mic indicator */}
            <div className="mb-8">
              <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center ${
                phase === 'listening'
                  ? 'bg-white/30 animate-pulse'
                  : phase === 'processing'
                  ? 'bg-white/20'
                  : phase === 'success'
                  ? 'bg-green-400/30'
                  : 'bg-yellow-400/30'
              }`}>
                {phase === 'listening' && <Mic className="w-12 h-12" />}
                {phase === 'processing' && (
                  <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {phase === 'success' && <Check className="w-12 h-12" />}
                {phase === 'retry' && <AlertCircle className="w-12 h-12" />}
              </div>
            </div>

            {/* Transcript / Result */}
            <div className="min-h-[80px] mb-8">
              {phase === 'listening' && (
                <p className="text-lg opacity-70">
                  {interimTranscript || transcript || 'Listening...'}
                </p>
              )}
              {phase === 'processing' && (
                <p className="text-lg opacity-70">Processing...</p>
              )}
              {(phase === 'success' || phase === 'retry') && lastMatchResult && (
                <div>
                  <p className="text-2xl font-bold mb-2">
                    {getMatchFeedback(lastMatchResult)}
                  </p>
                  <p className="text-lg opacity-70">
                    {lastMatchResult.accuracy}% match
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            {phase === 'success' && (
              <button
                onClick={nextAffirmation}
                className="px-8 py-4 bg-white text-gray-900 rounded-xl font-bold flex items-center gap-2 mx-auto"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {phase === 'retry' && (
              <div className="flex gap-4 justify-center">
                <button
                  onClick={retryAffirmation}
                  className="px-6 py-3 bg-white text-gray-900 rounded-xl font-bold flex items-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  Try Again
                </button>
                <button
                  onClick={skipAffirmation}
                  className="px-6 py-3 bg-white/20 rounded-xl font-medium flex items-center gap-2"
                >
                  <SkipForward className="w-5 h-5" />
                  Skip
                </button>
              </div>
            )}

            {phase === 'listening' && (
              <p className="text-sm opacity-50">
                Attempt {currentAttempt} of {settings?.retryLimit || 3}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Speech error */}
      {speechError && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-500/90 text-white px-4 py-3 rounded-xl text-sm">
          {speechError}
        </div>
      )}
    </div>
  );
}
