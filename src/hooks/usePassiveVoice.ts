/**
 * usePassiveVoice — Background voice monitoring hook
 *
 * Manages passive pitch analysis lifecycle.
 * Auto-saves samples, runs intervention checks.
 * No audio stored — only numeric pitch metrics.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import type { VoiceContext, PassiveVoiceStats } from '../types/passive-voice';
import { createPassiveAnalyzer, type PassiveAnalyzer, type PassiveSample } from '../lib/passive-voice/analyzer';
import { saveSample, aggregateDay, getMonthlyStats } from '../lib/passive-voice/aggregation';
import { checkInterventionRules } from '../lib/passive-voice/interventions';

interface UsePassiveVoiceReturn {
  isMonitoring: boolean;
  currentPitch: number | null;
  currentContext: VoiceContext;
  todayStats: PassiveVoiceStats | null;
  isLoading: boolean;

  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
  setContext: (ctx: VoiceContext) => void;
  refresh: () => Promise<void>;
}

export function usePassiveVoice(): UsePassiveVoiceReturn {
  const { user } = useAuth();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);
  const [currentContext, setCurrentContext] = useState<VoiceContext>('unknown');
  const [todayStats, setTodayStats] = useState<PassiveVoiceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const analyzerRef = useRef<PassiveAnalyzer | null>(null);
  const pitchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baselinePitchRef = useRef<number | null>(null);

  // Load today's stats
  const loadStats = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const stats = await getMonthlyStats(user.id);
    setTodayStats(stats);
    // Use weekly average as baseline for intervention checks
    baselinePitchRef.current = stats.weeklyAvgHz;
    setIsLoading(false);
  }, [user]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Handle incoming samples
  const handleSample = useCallback(async (sample: PassiveSample) => {
    if (!user) return;

    // Save to database
    await saveSample(user.id, sample);

    // Aggregate today
    const today = new Date().toISOString().split('T')[0];
    await aggregateDay(user.id, today);

    // Check intervention rules
    await checkInterventionRules(
      user.id,
      sample.avg_pitch_hz,
      sample.voice_context,
      baselinePitchRef.current ?? undefined
    );
  }, [user]);

  const startMonitoring = useCallback(async () => {
    if (isMonitoring || !user) return;

    const analyzer = createPassiveAnalyzer(handleSample);
    analyzer.setContext(currentContext);
    await analyzer.start();

    analyzerRef.current = analyzer;
    setIsMonitoring(true);

    // Poll current pitch for UI display
    pitchPollRef.current = setInterval(() => {
      const pitch = analyzer.getCurrentPitch();
      setCurrentPitch(pitch);
    }, 500);
  }, [isMonitoring, user, currentContext, handleSample]);

  const stopMonitoring = useCallback(() => {
    if (analyzerRef.current) {
      analyzerRef.current.stop();
      analyzerRef.current = null;
    }
    if (pitchPollRef.current) {
      clearInterval(pitchPollRef.current);
      pitchPollRef.current = null;
    }
    setIsMonitoring(false);
    setCurrentPitch(null);
  }, []);

  const setContext = useCallback((ctx: VoiceContext) => {
    setCurrentContext(ctx);
    if (analyzerRef.current) {
      analyzerRef.current.setContext(ctx);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (analyzerRef.current) {
        analyzerRef.current.stop();
      }
      if (pitchPollRef.current) {
        clearInterval(pitchPollRef.current);
      }
    };
  }, []);

  return {
    isMonitoring,
    currentPitch,
    currentContext,
    todayStats,
    isLoading,
    startMonitoring,
    stopMonitoring,
    setContext,
    refresh: loadStats,
  };
}
