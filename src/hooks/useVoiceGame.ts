/**
 * useVoiceGame Hook
 * Core game state management for Voice Affirmation Game
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLovense } from './useLovense';
import { useSpeechRecognition } from './useSpeechRecognition';
import { calculateMatchAccuracy, calculateBonusPoints } from '../lib/voice-recognition';
import * as voiceGameLib from '../lib/voice-game';
import type {
  VoiceGameSession,
  VoiceGameProgress,
  VoiceGameSettings,
  VoiceGamePhase,
  VoiceGameDifficulty,
  AffirmationCategory,
  Affirmation,
  VoiceGameAchievement,
  VoiceMatchResult,
} from '../types/voice-game';

interface UseVoiceGameOptions {
  onSessionComplete?: (session: VoiceGameSession) => void;
  onAchievementUnlocked?: (achievement: VoiceGameAchievement) => void;
  onError?: (error: string) => void;
}

interface UseVoiceGameReturn {
  // State
  phase: VoiceGamePhase;
  session: VoiceGameSession | null;
  progress: VoiceGameProgress | null;
  settings: VoiceGameSettings | null;
  currentAffirmation: Affirmation | null;
  currentAttempt: number;
  sessionStreak: number;
  lastMatchResult: VoiceMatchResult | null;
  countdown: number;
  affirmationIndex: number;
  totalAffirmations: number;

  // Speech recognition
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  speechError: string | null;
  isSpeechSupported: boolean;

  // Actions
  startSession: (difficulty: VoiceGameDifficulty, categories: AffirmationCategory[]) => Promise<void>;
  retryAffirmation: () => void;
  skipAffirmation: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => Promise<VoiceGameSession | null>;
  nextAffirmation: () => void;

  // Settings
  updateSettings: (settings: Partial<VoiceGameSettings>) => Promise<void>;
  loadProgress: () => Promise<void>;

  // Loading states
  isLoading: boolean;
  isProcessing: boolean;
}

export function useVoiceGame(options: UseVoiceGameOptions = {}): UseVoiceGameReturn {
  const { onSessionComplete, onAchievementUnlocked, onError } = options;

  const lovense = useLovense();

  // Core state
  const [phase, setPhase] = useState<VoiceGamePhase>('setup');
  const [session, setSession] = useState<VoiceGameSession | null>(null);
  const [progress, setProgress] = useState<VoiceGameProgress | null>(null);
  const [settings, setSettings] = useState<VoiceGameSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Game state
  const [currentAffirmation, setCurrentAffirmation] = useState<Affirmation | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [lastMatchResult, setLastMatchResult] = useState<VoiceMatchResult | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [affirmationQueue, setAffirmationQueue] = useState<Affirmation[]>([]);
  const [affirmationIndex, setAffirmationIndex] = useState(0);

  // Refs
  const sessionRef = useRef<VoiceGameSession | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const {
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    isSupported: isSpeechSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    language: settings?.voiceRecognitionLanguage || 'en-US',
    continuous: false,
    interimResults: true,
    onEnd: () => {
      if (phase === 'listening' && transcript) {
        processTranscript(transcript);
      }
    },
  });

  // Initialize
  useEffect(() => {
    loadProgress();
  }, []);

  // Load user progress and settings
  const loadProgress = useCallback(async () => {
    setIsLoading(true);
    try {
      const [userProgress, userSettings] = await Promise.all([
        voiceGameLib.getProgress(),
        voiceGameLib.getSettings(),
      ]);
      setProgress(userProgress);
      setSettings(userSettings);
    } catch (err) {
      console.error('Failed to initialize voice game:', err);
      onError?.('Failed to load voice game data');
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  // Start countdown timer
  const startCountdown = useCallback(() => {
    setCountdown(3);
    setPhase('countdown');

    let count = 3;
    countdownRef.current = setInterval(() => {
      count--;
      setCountdown(count);

      if (count <= 0) {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
        }
        setPhase('listening');
        startTimeRef.current = Date.now();
        startListening();
      }
    }, 1000);
  }, [startListening]);

  // Start new session
  const startSession = useCallback(async (
    difficulty: VoiceGameDifficulty,
    categories: AffirmationCategory[]
  ) => {
    setIsLoading(true);
    try {
      // Create session in database
      const newSession = await voiceGameLib.createSession(difficulty, categories);
      setSession(newSession);
      sessionRef.current = newSession;

      // Load affirmations for session
      const count = settings?.affirmationsPerSession || 10;
      const affirmations = await voiceGameLib.getAffirmationsForSession(
        difficulty,
        categories,
        count
      );

      if (affirmations.length === 0) {
        throw new Error('No affirmations found for selected options');
      }

      setAffirmationQueue(affirmations);
      setAffirmationIndex(0);
      setCurrentAffirmation(affirmations[0]);
      setCurrentAttempt(1);
      setSessionStreak(0);
      setLastMatchResult(null);

      // Start countdown
      startCountdown();
    } catch (err) {
      console.error('Failed to start session:', err);
      onError?.('Failed to start session');
      setPhase('setup');
    } finally {
      setIsLoading(false);
    }
  }, [settings, startCountdown, onError]);

  // Process transcript and check match
  const processTranscript = useCallback(async (spokenText: string) => {
    if (!currentAffirmation || !session) return;

    setPhase('processing');
    setIsProcessing(true);

    try {
      const durationMs = Date.now() - startTimeRef.current;

      // Calculate match
      const matchResult = calculateMatchAccuracy(
        spokenText,
        currentAffirmation,
        session.difficulty
      );
      setLastMatchResult(matchResult);

      // Record attempt
      await voiceGameLib.recordAttempt({
        sessionId: session.id,
        affirmationId: currentAffirmation.id,
        spokenText,
        accuracy: matchResult.accuracy,
        isSuccess: matchResult.isMatch,
        attemptNumber: currentAttempt,
        durationMs,
      });

      // Update session stats
      const newAttempted = session.affirmationsAttempted + 1;
      let newCompleted = session.affirmationsCompleted;
      let newStreak = sessionStreak;
      let newLongestStreak = session.longestStreak;
      let newPoints = session.totalPoints;

      if (matchResult.isMatch) {
        // Success!
        setPhase('success');
        newCompleted++;
        newStreak++;
        newLongestStreak = Math.max(newLongestStreak, newStreak);
        setSessionStreak(newStreak);

        // Calculate points
        const points = calculateBonusPoints(
          currentAffirmation.pointValue,
          matchResult.accuracy,
          newStreak,
          session.difficulty
        );
        newPoints += points;

        // Send haptic reward
        if (settings?.hapticRewardsEnabled && (lovense.status === 'connected' || lovense.cloudConnected)) {
          await sendVoiceReward(session.difficulty, newStreak, matchResult.accuracy === 100);
        }

        // Update session in database
        await voiceGameLib.updateSessionProgress(session.id, {
          affirmationsAttempted: newAttempted,
          affirmationsCompleted: newCompleted,
          currentStreak: newStreak,
          longestStreak: newLongestStreak,
          totalPoints: newPoints,
          averageAccuracy: (session.averageAccuracy * session.affirmationsAttempted + matchResult.accuracy) / newAttempted,
        });

        // Update local session state
        setSession({
          ...session,
          affirmationsAttempted: newAttempted,
          affirmationsCompleted: newCompleted,
          currentStreak: newStreak,
          longestStreak: newLongestStreak,
          totalPoints: newPoints,
        });

        // Auto-advance after delay
        if (settings?.autoAdvanceOnSuccess) {
          setTimeout(() => {
            advanceToNextAffirmation();
          }, 2000);
        }
      } else {
        // Failed attempt
        const maxRetries = settings?.retryLimit || 3;

        if (currentAttempt < maxRetries) {
          setPhase('retry');
          setCurrentAttempt((prev) => prev + 1);
          setSessionStreak(0);

          // Encouragement buzz
          if (settings?.hapticRewardsEnabled && (lovense.status === 'connected' || lovense.cloudConnected)) {
            try {
              lovense.playPattern('voice_encouragement');
            } catch {
              // Ignore pattern errors
            }
          }
        } else {
          // Out of retries
          setSessionStreak(0);
          await voiceGameLib.updateSessionProgress(session.id, {
            affirmationsAttempted: newAttempted,
          });
          setSession({
            ...session,
            affirmationsAttempted: newAttempted,
          });
          advanceToNextAffirmation();
        }
      }
    } catch (err) {
      console.error('Failed to process transcript:', err);
      onError?.('Failed to process speech');
      setPhase('retry');
    } finally {
      setIsProcessing(false);
    }
  }, [currentAffirmation, session, currentAttempt, sessionStreak, settings, lovense, onError]);

  // Send haptic reward
  const sendVoiceReward = useCallback(async (
    difficulty: VoiceGameDifficulty,
    streak: number,
    isPerfect: boolean
  ) => {
    let patternName: string;

    if (isPerfect && streak >= 10) {
      patternName = 'voice_perfect_session';
    } else if (streak > 0 && streak % 5 === 0) {
      patternName = 'voice_streak_bonus';
    } else if (difficulty >= 4) {
      patternName = 'voice_success_strong';
    } else if (difficulty >= 2) {
      patternName = 'voice_success_medium';
    } else {
      patternName = 'voice_success_subtle';
    }

    try {
      lovense.playPattern(patternName);
    } catch (err) {
      console.warn('Failed to send voice reward:', err);
    }
  }, [lovense]);

  // Advance to next affirmation
  const advanceToNextAffirmation = useCallback(() => {
    const nextIndex = affirmationIndex + 1;

    if (nextIndex < affirmationQueue.length) {
      setAffirmationIndex(nextIndex);
      setCurrentAffirmation(affirmationQueue[nextIndex]);
      setCurrentAttempt(1);
      setLastMatchResult(null);
      resetTranscript();
      startCountdown();
    } else {
      // Session complete
      endSession();
    }
  }, [affirmationIndex, affirmationQueue, resetTranscript, startCountdown]);

  // Manual next (from success screen)
  const nextAffirmation = useCallback(() => {
    if (phase === 'success' || phase === 'retry') {
      advanceToNextAffirmation();
    }
  }, [phase, advanceToNextAffirmation]);

  // Retry current affirmation
  const retryAffirmation = useCallback(() => {
    if (phase !== 'retry') return;
    resetTranscript();
    startCountdown();
  }, [phase, resetTranscript, startCountdown]);

  // Skip current affirmation
  const skipAffirmation = useCallback(() => {
    stopListening();
    setSessionStreak(0);
    advanceToNextAffirmation();
  }, [stopListening, advanceToNextAffirmation]);

  // Pause session
  const pauseSession = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    stopListening();
    setPhase('paused');
  }, [stopListening]);

  // Resume session
  const resumeSession = useCallback(() => {
    startCountdown();
  }, [startCountdown]);

  // End session
  const endSession = useCallback(async (): Promise<VoiceGameSession | null> => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    stopListening();

    if (!session) return null;

    try {
      // Finalize session
      const completedSession = await voiceGameLib.completeSession(session.id);
      setSession(completedSession);

      // Update progress
      const newProgress = await voiceGameLib.updateProgress(completedSession);
      setProgress(newProgress);

      // Check for achievements
      const newAchievements = await voiceGameLib.checkAchievements(newProgress);
      if (newAchievements.length > 0) {
        onAchievementUnlocked?.(newAchievements[0]);

        // Perfect session reward
        if (completedSession.affirmationsCompleted === completedSession.affirmationsAttempted &&
            completedSession.affirmationsAttempted > 0) {
          try {
            lovense.playPattern('voice_perfect_session');
          } catch {
            // Ignore
          }
        }
      }

      setPhase('complete');
      onSessionComplete?.(completedSession);

      return completedSession;
    } catch (err) {
      console.error('Failed to end session:', err);
      onError?.('Failed to save session');
      setPhase('complete');
      return session;
    }
  }, [session, stopListening, onSessionComplete, onAchievementUnlocked, onError, lovense]);

  // Update settings
  const updateSettings = useCallback(async (
    newSettings: Partial<VoiceGameSettings>
  ) => {
    try {
      const updated = await voiceGameLib.updateSettings(newSettings);
      setSettings(updated);
    } catch (err) {
      console.error('Failed to update settings:', err);
      onError?.('Failed to save settings');
    }
  }, [onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  return {
    // State
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
    totalAffirmations: affirmationQueue.length,

    // Speech
    isListening,
    transcript,
    interimTranscript,
    speechError,
    isSpeechSupported,

    // Actions
    startSession,
    retryAffirmation,
    skipAffirmation,
    pauseSession,
    resumeSession,
    endSession,
    nextAffirmation,
    updateSettings,
    loadProgress,

    // Loading
    isLoading,
    isProcessing,
  };
}
