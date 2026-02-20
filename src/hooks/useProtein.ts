/**
 * useProtein — React hook for daily protein tracking.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTodayProtein, toggleProteinSource, getProteinHistory } from '../lib/protein';
import { countSources, estimateGrams, getProteinRating, PROTEIN_SOURCES } from '../types/protein';
import type { DailyProtein } from '../types/protein';

interface UseProteinReturn {
  today: DailyProtein | null;
  count: number;
  grams: number;
  rating: ReturnType<typeof getProteinRating>;
  history: DailyProtein[];
  isLoading: boolean;
  toggle: (key: typeof PROTEIN_SOURCES[number]['key'], value: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_PROTEIN: DailyProtein = {
  id: '',
  userId: '',
  date: '',
  shakePostWorkout: false,
  breakfastProtein: false,
  lunchProtein: false,
  dinnerProtein: false,
  snackProtein: false,
  notes: null,
  createdAt: '',
};

export function useProtein(): UseProteinReturn {
  const { user } = useAuth();
  const userId = user?.id;

  const [today, setToday] = useState<DailyProtein | null>(null);
  const [history, setHistory] = useState<DailyProtein[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [todayData, historyData] = await Promise.all([
        getTodayProtein(userId),
        getProteinHistory(userId, 7),
      ]);
      setToday(todayData);
      setHistory(historyData);
    } catch (err) {
      console.error('[Protein] refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(async (
    key: typeof PROTEIN_SOURCES[number]['key'],
    value: boolean
  ) => {
    if (!userId) return;

    // Optimistic update
    setToday(prev => {
      const base = prev || { ...EMPTY_PROTEIN, userId, date: new Date().toISOString().slice(0, 10) };
      return { ...base, [key]: value };
    });

    const result = await toggleProteinSource(userId, key, value);
    if (result) {
      setToday(result);
    }
  }, [userId]);

  const effective = today || EMPTY_PROTEIN;
  const count = countSources(effective);
  const grams = estimateGrams(effective);
  const rating = getProteinRating(count);

  return {
    today,
    count,
    grams,
    rating,
    history,
    isLoading,
    toggle,
    refresh,
  };
}
