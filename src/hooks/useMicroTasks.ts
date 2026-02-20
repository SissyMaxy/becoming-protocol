/**
 * useMicroTasks — React hook for micro-task scheduling and delivery.
 *
 * Generates a daily schedule, fires setTimeout for each task,
 * manages the active card, and logs completions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRewardOptional } from '../context/RewardContext';
import {
  getOrCreateMicroTaskConfig,
  scheduleMicroTasks,
  isWithinWorkHours,
  logMicroTaskCompletion,
  getMicroTaskStats,
  getTodayCompletionCount,
} from '../lib/micro-tasks';
import type {
  MicroTaskConfig,
  MicroTaskStats,
  ScheduledMicro,
} from '../types/micro-tasks';

interface UseMicroTasksReturn {
  config: MicroTaskConfig | null;
  activeMicro: ScheduledMicro | null;
  stats: MicroTaskStats;
  schedule: ScheduledMicro[];
  isLoading: boolean;
  completeMicro: () => Promise<void>;
  skipMicro: () => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_STATS: MicroTaskStats = {
  completedToday: 0,
  totalToday: 0,
  completedThisWeek: 0,
  totalThisWeek: 0,
};

export function useMicroTasks(): UseMicroTasksReturn {
  const { user } = useAuth();
  const reward = useRewardOptional();
  const userId = user?.id;

  const [config, setConfig] = useState<MicroTaskConfig | null>(null);
  const [schedule, setSchedule] = useState<ScheduledMicro[]>([]);
  const [activeMicro, setActiveMicro] = useState<ScheduledMicro | null>(null);
  const [stats, setStats] = useState<MicroTaskStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleGeneratedRef = useRef<string>(''); // date key to avoid re-generating

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  // Show a micro-task card
  const showMicro = useCallback((micro: ScheduledMicro) => {
    setActiveMicro(micro);
    setSchedule(prev =>
      prev.map(s => s === micro ? { ...s, status: 'active' } : s)
    );

    // Auto-expire after 2x duration
    const expiryMs = micro.task.durationSeconds * 2 * 1000;
    expiryTimerRef.current = setTimeout(() => {
      expiryTimerRef.current = null;
      // Only expire if this micro is still active
      setActiveMicro(current => {
        if (current === micro) {
          // Log as expired
          if (userId) {
            logMicroTaskCompletion(userId, micro.task, 'expired', micro.scheduledAt, 0).catch(() => {});
          }
          setSchedule(prev =>
            prev.map(s => s === micro ? { ...s, status: 'expired' } : s)
          );
          setStats(prev => ({ ...prev, totalToday: prev.totalToday + 1 }));
          return null;
        }
        return current;
      });
    }, expiryMs);
  }, [userId]);

  // Complete the active micro-task
  const completeMicro = useCallback(async () => {
    if (!activeMicro || !userId) return;

    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }

    const points = activeMicro.task.points;

    setSchedule(prev =>
      prev.map(s => s === activeMicro ? { ...s, status: 'completed' } : s)
    );
    setActiveMicro(null);
    setStats(prev => ({
      ...prev,
      completedToday: prev.completedToday + 1,
      totalToday: prev.totalToday + 1,
      completedThisWeek: prev.completedThisWeek + 1,
      totalThisWeek: prev.totalThisWeek + 1,
    }));

    await logMicroTaskCompletion(userId, activeMicro.task, 'completed', activeMicro.scheduledAt, points).catch(() => {});
    if (reward?.addPoints) {
      reward.addPoints(points, 'micro_task').catch(() => {});
    }
  }, [activeMicro, userId, reward]);

  // Skip the active micro-task
  const skipMicro = useCallback(async () => {
    if (!activeMicro || !userId) return;

    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }

    setSchedule(prev =>
      prev.map(s => s === activeMicro ? { ...s, status: 'skipped' } : s)
    );
    setActiveMicro(null);
    setStats(prev => ({
      ...prev,
      totalToday: prev.totalToday + 1,
      totalThisWeek: prev.totalThisWeek + 1,
    }));

    await logMicroTaskCompletion(userId, activeMicro.task, 'skipped', activeMicro.scheduledAt, 0).catch(() => {});
  }, [activeMicro, userId]);

  // Initialize config and schedule
  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      const [cfg, fetchedStats] = await Promise.all([
        getOrCreateMicroTaskConfig(userId),
        getMicroTaskStats(userId),
      ]);
      setConfig(cfg);
      setStats(fetchedStats);

      if (!cfg.enabled || !isWithinWorkHours(cfg)) {
        setIsLoading(false);
        return;
      }

      // Only generate schedule once per day
      const todayKey = new Date().toISOString().slice(0, 10);
      if (scheduleGeneratedRef.current === todayKey) {
        setIsLoading(false);
        return;
      }
      scheduleGeneratedRef.current = todayKey;

      const alreadyDone = await getTodayCompletionCount(userId);
      const newSchedule = scheduleMicroTasks(cfg, alreadyDone);
      setSchedule(newSchedule);

      // Set up timers for each scheduled micro-task
      clearTimers();
      const now = Date.now();
      newSchedule.forEach(micro => {
        const delay = micro.scheduledAt.getTime() - now;
        if (delay > 0) {
          const timer = setTimeout(() => showMicro(micro), delay);
          timersRef.current.push(timer);
        }
      });
    } catch (err) {
      console.error('[MicroTasks] init error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, clearTimers, showMicro]);

  useEffect(() => {
    refresh();
    return clearTimers;
  }, [refresh, clearTimers]);

  return {
    config,
    activeMicro,
    stats,
    schedule,
    isLoading,
    completeMicro,
    skipMicro,
    refresh,
  };
}
