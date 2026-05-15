/**
 * useRealNameLockout — React hook for text-input boy-name lockout.
 *
 * Usage:
 *   const lockout = useRealNameLockout({ userId, surface: 'chat' });
 *   <input value={input} onChange={e => {
 *     const raw = e.target.value;
 *     if (lockout.detectDispute(raw)) void lockout.recordDispute(raw);
 *     const out = lockout.transform(raw);
 *     setInput(out);
 *   }} />
 *
 * The hook reads real_name_lockout_settings + real_name_lockout_active()
 * on mount + poll, applies transform.ts logic, logs events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { transformText, detectDispute, type LockoutMode } from './transform';

interface UseRealNameLockoutArgs {
  userId: string | undefined;
  surface: 'chat' | 'confession' | 'journal' | 'sniffies' | 'dossier' | 'other';
}

interface SettingsRow {
  enabled: boolean;
  legacy_name: string;
  legacy_name_variants: string[];
  feminine_name: string;
  mode: LockoutMode;
}

export interface RealNameLockoutHook {
  /** True if a window is currently open (or mode='always'). */
  active: boolean;
  /** Current mode (only meaningful when active). */
  mode: LockoutMode | null;
  /** Pure transform — call before setState. */
  transform: (raw: string) => string;
  /** Detect dispute (call before transform). */
  detectDispute: (raw: string) => boolean;
  /** Record a dispute event (fire-and-forget). */
  recordDispute: (raw: string) => Promise<void>;
  /** Manually refresh the active-window state (e.g. after a push lands). */
  refresh: () => void;
}

export function useRealNameLockout({ userId, surface }: UseRealNameLockoutArgs): RealNameLockoutHook {
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [active, setActive] = useState(false);
  const priorOutputRef = useRef<string>('');

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: s } = await supabase
      .from('real_name_lockout_settings')
      .select('enabled, legacy_name, legacy_name_variants, feminine_name, mode')
      .eq('user_id', userId)
      .maybeSingle();
    setSettings((s as SettingsRow | null) ?? null);

    const { data: a } = await supabase
      .rpc('real_name_lockout_active', { uid: userId });
    setActive(Boolean(a));
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [userId, load]);

  const transform = useCallback((raw: string): string => {
    if (!active || !settings || !settings.enabled || !settings.legacy_name) {
      priorOutputRef.current = raw;
      return raw;
    }
    const result = transformText({
      text: raw,
      legacyName: settings.legacy_name,
      legacyVariants: settings.legacy_name_variants ?? [],
      feminineName: settings.feminine_name || 'her',
      mode: settings.mode,
    });
    // Fire-and-forget log when a rewrite landed
    if (result.isRewritten && userId) {
      const firstViolation = result.violations[0];
      void supabase.from('real_name_lockout_events').insert({
        user_id: userId,
        surface,
        event_type: 'rewrite_applied',
        original_fragment: firstViolation?.fragment ?? null,
        rewritten_to: settings.feminine_name || 'her',
        full_input_length: raw.length,
      });
    }
    priorOutputRef.current = result.text;
    return result.text;
  }, [active, settings, userId, surface]);

  const detectDisputeFn = useCallback((raw: string): boolean => {
    if (!settings || !settings.enabled) return false;
    return detectDispute(
      raw,
      priorOutputRef.current,
      settings.legacy_name,
      settings.legacy_name_variants ?? [],
    );
  }, [settings]);

  const recordDispute = useCallback(async (raw: string): Promise<void> => {
    if (!userId || !settings) return;
    await supabase.from('real_name_lockout_events').insert({
      user_id: userId,
      surface,
      event_type: active ? 'dispute_undo' : 'outside_window_attempt',
      original_fragment: raw.slice(0, 200),
      rewritten_to: null,
      full_input_length: raw.length,
    });
  }, [userId, settings, active, surface]);

  return {
    active,
    mode: settings?.mode ?? null,
    transform,
    detectDispute: detectDisputeFn,
    recordDispute,
    refresh: () => void load(),
  };
}
