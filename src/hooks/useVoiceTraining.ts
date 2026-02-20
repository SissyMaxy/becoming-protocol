/**
 * useVoiceTraining Hook
 *
 * State management for the structured voice drill system.
 * Pitch detection, drill scheduling, progress tracking.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  createPitchDetector,
  getTodayDrills,
  logDrill,
  getTodayDrillLogs,
  getVoiceTrainingProgress,
  getPitchHistory,
  logPitch,
  checkVoiceAvoidance,
  VOICE_LEVELS,
  LEVEL_THRESHOLDS,
} from '../lib/voice-training';
import type { PitchDetector } from '../lib/voice-training';
import type {
  VoiceDrill,
  DrillLog,
  VoiceTrainingStats,
} from '../types/voice-training';

interface UseVoiceTrainingReturn {
  // State
  stats: VoiceTrainingStats | null;
  todayDrills: VoiceDrill[];
  todayLogs: DrillLog[];
  isLoading: boolean;

  // Pitch detection
  currentPitch: number | null;
  isPitchDetecting: boolean;
  startPitchDetection: () => Promise<void>;
  stopPitchDetection: () => void;

  // Drill actions
  completeDrill: (drillId: string, result: {
    durationSeconds?: number;
    pitchAvgHz?: number;
    pitchMinHz?: number;
    pitchMaxHz?: number;
    qualityRating?: number;
    notes?: string;
  }) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

export function useVoiceTraining(): UseVoiceTrainingReturn {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [stats, setStats] = useState<VoiceTrainingStats | null>(null);
  const [todayDrills, setTodayDrills] = useState<VoiceDrill[]>([]);
  const [todayLogs, setTodayLogs] = useState<DrillLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pitch detection
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);
  const [isPitchDetecting, setIsPitchDetecting] = useState(false);
  const detectorRef = useRef<PitchDetector | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);

    try {
      const [progress, logs, avoidance, pitchHist] = await Promise.allSettled([
        getVoiceTrainingProgress(userId),
        getTodayDrillLogs(userId),
        checkVoiceAvoidance(userId),
        getPitchHistory(userId, 30),
      ]);

      const prog = progress.status === 'fulfilled' ? progress.value : null;
      const todayLogsResult = logs.status === 'fulfilled' ? logs.value : [];
      const avoidResult = avoidance.status === 'fulfilled' ? avoidance.value : null;
      const histResult = pitchHist.status === 'fulfilled' ? pitchHist.value : [];

      setTodayLogs(todayLogsResult);

      const voiceLevel = prog?.voiceLevel || 1;
      const drills = await getTodayDrills(userId, voiceLevel);
      setTodayDrills(drills);

      // Calculate today's drill stats
      const todayMinutes = todayLogsResult.reduce(
        (sum, l) => sum + Math.round((l.durationSeconds || 0) / 60), 0
      );

      // Drills needed for next level
      const threshold = LEVEL_THRESHOLDS[voiceLevel] || 999;
      const drillsNeeded = Math.max(0, threshold - (prog?.totalDrills || 0));

      setStats({
        baselineHz: prog?.baselinePitchHz || null,
        currentHz: prog?.currentPitchHz || null,
        targetHz: prog?.targetPitchHz || 190,
        shiftHz: prog?.pitchShiftHz || 0,
        pitchHistory: histResult,
        drillStreak: prog?.drillStreak || 0,
        longestDrillStreak: prog?.drillStreakLongest || 0,
        totalDrills: prog?.totalDrills || 0,
        totalMinutes: prog?.totalDrillMinutes || 0,
        todayDrills: todayLogsResult.length,
        todayMinutes,
        voiceLevel,
        levelName: VOICE_LEVELS[voiceLevel] || 'Unknown',
        nextLevelDrillsNeeded: drillsNeeded,
        daysSinceLastPractice: avoidResult?.daysSinceLastPractice || 0,
        isAvoiding: (avoidResult?.daysSinceLastPractice || 0) >= 3,
      });
    } catch (err) {
      console.error('[useVoiceTraining] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pitch detection
  const startPitchDetection = useCallback(async () => {
    if (detectorRef.current?.isRunning()) return;

    const detector = createPitchDetector((hz) => {
      setCurrentPitch(hz);
    });

    detectorRef.current = detector;
    await detector.start();
    setIsPitchDetecting(true);
  }, []);

  const stopPitchDetection = useCallback(() => {
    if (!detectorRef.current) return;

    const avgHz = detectorRef.current.getAveragePitch();
    detectorRef.current.stop();
    detectorRef.current = null;
    setIsPitchDetecting(false);

    // Log average pitch if we got readings
    if (avgHz && userId) {
      logPitch(userId, avgHz, 'drill').catch(err =>
        console.warn('[useVoiceTraining] Failed to log pitch:', err)
      );
    }
  }, [userId]);

  // Complete drill
  const completeDrill = useCallback(async (
    drillId: string,
    result: {
      durationSeconds?: number;
      pitchAvgHz?: number;
      pitchMinHz?: number;
      pitchMaxHz?: number;
      qualityRating?: number;
      notes?: string;
    }
  ) => {
    if (!userId) return;

    await logDrill(userId, drillId, result);
    await loadData(); // Refresh after completion
  }, [userId, loadData]);

  // Cleanup pitch detector on unmount
  useEffect(() => {
    return () => {
      if (detectorRef.current) {
        detectorRef.current.stop();
      }
    };
  }, []);

  return {
    stats,
    todayDrills,
    todayLogs,
    isLoading,
    currentPitch,
    isPitchDetecting,
    startPitchDetection,
    stopPitchDetection,
    completeDrill,
    refresh: loadData,
  };
}
