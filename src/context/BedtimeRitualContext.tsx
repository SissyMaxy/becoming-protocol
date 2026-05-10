/**
 * BedtimeRitualContext — app-level mount-gate for the bedtime ritual
 * overlay. Lives at the same level as AftercareContext.
 *
 * On mount + when the user opens the app:
 *   1. Read user_state.bedtime_window + chastity_locked + current_phase.
 *   2. If window not enabled OR not currently inside the window → no-op.
 *   3. If aftercare is currently active → no-op (safeword aftercare wins).
 *   4. If a completion / skip row already exists for tonight's window → no-op.
 *   5. Otherwise insert a new row + mount BedtimeLock.
 *
 * The BedtimeLock itself handles step progression, completion, and skip.
 * On dismiss of any kind, it calls `onClose` which clears the active row
 * here so subsequent opens within the same window don't re-mount.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useAftercareOptional } from './AftercareContext';
import { supabase } from '../lib/supabase';
import {
  isWithinWindow,
  tonightWindowStart,
  loadTonightRow,
  startRitual,
  variantForPhase,
  DEFAULT_BEDTIME_WINDOW,
  type BedtimeRitualRow,
  type BedtimeWindow,
  type BedtimeStepKey,
} from '../lib/bedtime/ritual';
import { BedtimeLock } from '../components/bedtime/BedtimeLock';

interface ActiveRitual {
  row: BedtimeRitualRow;
  steps: BedtimeStepKey[];
  todaysMantraText: string | null;
  prefersVoice: boolean;
  chastityEnabled: boolean;
}

interface BedtimeContextType {
  isActive: boolean;
}

const BedtimeContext = createContext<BedtimeContextType | null>(null);

const POLL_INTERVAL_MS = 5 * 60_000;

export function BedtimeRitualProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const aftercare = useAftercareOptional();
  const [active, setActive] = useState<ActiveRitual | null>(null);
  const [pending, setPending] = useState(false);
  // Soft "we already evaluated tonight and chose not to mount" cache —
  // keyed by ISO of tonight's window-start. Prevents a re-poll from
  // re-mounting after the user skipped / completed.
  const [snoozedFor, setSnoozedFor] = useState<string | null>(null);

  const evaluate = useCallback(async () => {
    if (!user?.id) return;
    if (active || pending) return;
    if (aftercare?.isActive) return; // Hard rule: aftercare always wins.

    setPending(true);
    try {
      // 1. Window + chastity + phase + voice pref
      const { data: usRaw } = await supabase
        .from('user_state')
        .select('bedtime_window, chastity_locked, current_phase, prefers_voice')
        .eq('user_id', user.id)
        .maybeSingle();
      const us = usRaw as {
        bedtime_window?: BedtimeWindow | null;
        chastity_locked?: boolean | null;
        current_phase?: number | null;
        prefers_voice?: boolean | null;
      } | null;
      const window = (us?.bedtime_window ?? DEFAULT_BEDTIME_WINDOW) as BedtimeWindow;

      const now = new Date();
      if (!isWithinWindow(window, now)) return;

      // 2. Snoozed for tonight already?
      const winStart = tonightWindowStart(window, now);
      const winKey = winStart.toISOString();
      if (snoozedFor === winKey) return;

      // 3. Already a row for tonight?
      const existing = await loadTonightRow(supabase, user.id, winStart);
      if (existing && (existing.completed_at || existing.skipped_at)) {
        setSnoozedFor(winKey);
        return;
      }

      // 4. Resolve phase from feminine_self if present, else user_state
      let phase: number | null = us?.current_phase ?? null;
      try {
        const { data: fs } = await supabase
          .from('feminine_self')
          .select('transformation_phase')
          .eq('user_id', user.id)
          .maybeSingle();
        const tp = (fs as { transformation_phase?: number } | null)?.transformation_phase;
        if (typeof tp === 'number') phase = tp;
      } catch (_) { /* feminine_self optional */ }
      const steps = variantForPhase(phase);

      // 5. Today's mantra text (most recent delivered today, fallback to a generic)
      let todaysMantraText: string | null = null;
      try {
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const { data: del } = await supabase
          .from('mantra_delivery_log')
          .select('mantra_id')
          .eq('user_id', user.id)
          .gte('delivered_at', startOfDay.toISOString())
          .order('delivered_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const mid = (del as { mantra_id?: string } | null)?.mantra_id;
        if (mid) {
          const { data: m } = await supabase
            .from('mommy_mantras')
            .select('text')
            .eq('id', mid)
            .maybeSingle();
          todaysMantraText = (m as { text?: string } | null)?.text ?? null;
        }
      } catch (_) { /* mantra catalog optional */ }

      // 6. Insert a fresh row
      const row = existing ?? await startRitual({ sb: supabase, userId: user.id, phase });
      if (!row) return;

      setActive({
        row,
        steps,
        todaysMantraText,
        prefersVoice: !!us?.prefers_voice,
        chastityEnabled: !!us?.chastity_locked,
      });
    } finally {
      setPending(false);
    }
  }, [user?.id, active, pending, aftercare?.isActive, snoozedFor]);

  // Evaluate on mount + when aftercare flips off + every 5 min while open
  useEffect(() => {
    evaluate();
    const iv = window.setInterval(evaluate, POLL_INTERVAL_MS);
    return () => window.clearInterval(iv);
  }, [evaluate]);

  const handleClose = useCallback(() => {
    if (active) {
      // Snooze the rest of this window so a re-open doesn't re-mount.
      // The snooze key just needs to be unique per window — we use the
      // row's started_at so a fresh window the next night re-mounts.
      setSnoozedFor(active.row.started_at);
    }
    setActive(null);
  }, [active]);

  const value: BedtimeContextType = { isActive: active !== null };

  return (
    <BedtimeContext.Provider value={value}>
      {children}
      {active && !aftercare?.isActive && (
        <BedtimeLock
          row={active.row}
          steps={active.steps}
          todaysMantraText={active.todaysMantraText}
          prefersVoice={active.prefersVoice}
          chastityEnabled={active.chastityEnabled}
          onClose={handleClose}
        />
      )}
    </BedtimeContext.Provider>
  );
}

export function useBedtimeRitual(): BedtimeContextType {
  const ctx = useContext(BedtimeContext);
  if (!ctx) {
    throw new Error('useBedtimeRitual must be used within a BedtimeRitualProvider');
  }
  return ctx;
}

export function useBedtimeRitualOptional(): BedtimeContextType | null {
  return useContext(BedtimeContext);
}
