/**
 * useProtein — React hook for daily protein tracking with
 * gram adjustments, supplements, time-gating, and grocery nudge.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTodayProtein, toggleProteinSource, toggleSupplement, setGramLevel, getProteinHistory } from '../lib/protein';
import {
  countSources,
  estimateGrams,
  getProteinRating,
  getGramsRating,
  getVisibleSources,
  getHandlerMessage,
  shouldShowGroceryNudge,
  PROTEIN_TARGET,
} from '../types/protein';
import { emitBodyEvent } from '../lib/body-events';
import type { DailyProtein, ProteinSource, ProteinSourceKey, GramLevel, SupplementKey } from '../types/protein';

interface UseProteinReturn {
  today: DailyProtein | null;
  count: number;
  grams: number;
  targetGrams: number;
  progressPct: number;
  rating: ReturnType<typeof getProteinRating>;
  gramsRating: ReturnType<typeof getGramsRating>;
  visibleSources: ProteinSource[];
  history: DailyProtein[];
  isLoading: boolean;
  supplements: { protein: boolean; creatine: boolean; collagen: boolean };
  groceryNudge: boolean;
  handlerMessage: string;
  toggle: (key: ProteinSourceKey, value: boolean) => Promise<void>;
  toggleSupp: (key: SupplementKey, value: boolean) => Promise<void>;
  adjustGrams: (sourceKey: ProteinSourceKey, level: GramLevel) => Promise<void>;
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
  gramAdjustments: {},
  supplementProtein: false,
  supplementCreatine: false,
  supplementCollagen: false,
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

  const toggle = useCallback(async (key: ProteinSourceKey, value: boolean) => {
    if (!userId) return;
    // Optimistic update
    setToday(prev => {
      const base = prev || { ...EMPTY_PROTEIN, userId, date: new Date().toISOString().slice(0, 10) };
      return { ...base, [key]: value };
    });
    const result = await toggleProteinSource(userId, key, value);
    if (result) {
      setToday(result);
      // Emit protein_target_hit when reaching target
      const newGrams = estimateGrams(result);
      if (newGrams >= PROTEIN_TARGET) {
        emitBodyEvent(userId, { type: 'protein_target_hit', grams: newGrams, date: result.date });
      }
    }
  }, [userId]);

  const toggleSupp = useCallback(async (key: SupplementKey, value: boolean) => {
    if (!userId) return;
    setToday(prev => {
      const base = prev || { ...EMPTY_PROTEIN, userId, date: new Date().toISOString().slice(0, 10) };
      return { ...base, [key]: value };
    });
    const result = await toggleSupplement(userId, key, value);
    if (result) setToday(result);
  }, [userId]);

  const adjustGrams = useCallback(async (sourceKey: ProteinSourceKey, level: GramLevel) => {
    if (!userId) return;
    setToday(prev => {
      const base = prev || { ...EMPTY_PROTEIN, userId, date: new Date().toISOString().slice(0, 10) };
      return { ...base, gramAdjustments: { ...base.gramAdjustments, [sourceKey]: level } };
    });
    const result = await setGramLevel(userId, sourceKey, level);
    if (result) setToday(result);
  }, [userId]);

  const effective = today || EMPTY_PROTEIN;
  const count = countSources(effective);
  const grams = estimateGrams(effective);
  const rating = getProteinRating(count);
  const gramsRating = getGramsRating(grams);
  const progressPct = Math.min(100, Math.round((grams / PROTEIN_TARGET) * 100));

  const visibleSources = useMemo(
    () => getVisibleSources(new Date().getHours(), today),
    [today],
  );

  const supplements = {
    protein: effective.supplementProtein,
    creatine: effective.supplementCreatine,
    collagen: effective.supplementCollagen,
  };

  const groceryNudge = useMemo(() => shouldShowGroceryNudge(history), [history]);

  const handlerMessage = useMemo(() => getHandlerMessage(rating.rating), [rating.rating]);

  return {
    today,
    count,
    grams,
    targetGrams: PROTEIN_TARGET,
    progressPct,
    rating,
    gramsRating,
    visibleSources,
    history,
    isLoading,
    supplements,
    groceryNudge,
    handlerMessage,
    toggle,
    toggleSupp,
    adjustGrams,
    refresh,
  };
}
