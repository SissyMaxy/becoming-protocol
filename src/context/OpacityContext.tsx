/**
 * OpacityContext — Global visibility control system.
 *
 * Level 0 = Builder Mode: Everything visible. Full control.
 * Level 1 = Curated View (default): Tasks, vault, briefing, feedback strip.
 *           Management sections exist but require deliberate navigation.
 * Level 2 = Handler's Preferred: Tasks, briefing, journal. No management access.
 * Level 3 = Blind Trust: Handler message + tasks + evening summary. Nothing else.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type OpacityLevel = 0 | 1 | 2 | 3;

export interface OpacityContextValue {
  level: OpacityLevel;
  setLevel: (level: OpacityLevel) => Promise<void>;
  canSee: (feature: string) => boolean;
  daysAtCurrentLevel: number;
  isLoading: boolean;
}

// ──────────────────────────────────────────────
// Feature visibility map
// Value = maximum opacity level at which feature is visible
// e.g., 1 means visible at levels 0 and 1, hidden at 2 and 3
// ──────────────────────────────────────────────

const FEATURE_VISIBILITY: Record<string, OpacityLevel> = {
  // Always visible (all levels)
  today_view: 3,
  handler_message: 3,
  task_cards: 3,
  morning_briefing: 3,
  evening_debrief: 3,
  settings_basic: 3,        // profile, difficulty, lovense, opacity, danger zone

  // Visible at levels 0-2
  quick_state_strip: 2,
  ambient_feedback_strip: 2,
  journal_prompt: 2,

  // Visible at levels 0-1
  progress_page: 1,
  sealed_content: 1,
  more_menu: 1,
  journal_page: 1,
  sessions_browse: 1,
  analytics_protocol: 1,
  analytics_dashboard: 1,
  analytics_service: 1,
  analytics_vectors: 1,
  analytics_triggers: 1,
  analytics_content: 1,
  escalation_content: 1,
  escalation_domain: 1,
  escalation_patterns: 1,
  escalation_seeds: 1,
  tools_curation: 1,
  records_history: 1,
  records_investments: 1,
  records_wishlist: 1,
  vault_swipe: 1,
  settings_reminders: 1,
  settings_microtasks: 1,
  settings_sleep: 1,
  settings_privacy: 1,
  settings_appearance: 1,
  settings_data: 1,
  settings_timeratchets: 1,

  // Builder mode only (level 0)
  developer_tools: 0,
  settings_advanced: 0,
  task_bank_full: 0,
};

function canSeeFeature(feature: string, currentLevel: OpacityLevel): boolean {
  const maxLevel = FEATURE_VISIBILITY[feature];
  if (maxLevel === undefined) return true; // Unknown features default visible
  return currentLevel <= maxLevel;
}

// ──────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────

const OpacityContext = createContext<OpacityContextValue>({
  level: 1,
  setLevel: async () => {},
  canSee: () => true,
  daysAtCurrentLevel: 0,
  isLoading: true,
});

export function useOpacity(): OpacityContextValue {
  return useContext(OpacityContext);
}

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

interface OpacityProviderProps {
  children: ReactNode;
}

export function OpacityProvider({ children }: OpacityProviderProps) {
  const { user } = useAuth();
  const [level, setLevelState] = useState<OpacityLevel>(1);
  const [levelSetAt, setLevelSetAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const { data } = await supabase
          .from('user_state')
          .select('opacity_level, opacity_level_set_at')
          .eq('user_id', user!.id)
          .maybeSingle();

        if (!cancelled && data) {
          setLevelState((data.opacity_level ?? 1) as OpacityLevel);
          setLevelSetAt(data.opacity_level_set_at ?? null);
        }
      } catch (err) {
        console.error('[Opacity] Failed to load:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Persist level change
  const setLevel = useCallback(async (newLevel: OpacityLevel) => {
    if (!user?.id) return;

    const previousLevel = level;
    const now = new Date().toISOString();

    // Optimistic update
    setLevelState(newLevel);
    setLevelSetAt(now);

    try {
      // Append to history
      const { data: current } = await supabase
        .from('user_state')
        .select('opacity_level_history')
        .eq('user_id', user.id)
        .maybeSingle();

      const history = Array.isArray(current?.opacity_level_history)
        ? current.opacity_level_history
        : [];

      history.push({
        level: newLevel,
        previous_level: previousLevel,
        set_at: now,
      });

      await supabase
        .from('user_state')
        .update({
          opacity_level: newLevel,
          opacity_level_set_at: now,
          opacity_level_history: history,
        })
        .eq('user_id', user.id);
    } catch (err) {
      console.error('[Opacity] Failed to persist level:', err);
      // Revert on failure
      setLevelState(previousLevel);
    }
  }, [user?.id, level]);

  // Days at current level
  const daysAtCurrentLevel = levelSetAt
    ? Math.floor((Date.now() - new Date(levelSetAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const canSee = useCallback(
    (feature: string) => canSeeFeature(feature, level),
    [level]
  );

  return (
    <OpacityContext.Provider value={{ level, setLevel, canSee, daysAtCurrentLevel, isLoading }}>
      {children}
    </OpacityContext.Provider>
  );
}
