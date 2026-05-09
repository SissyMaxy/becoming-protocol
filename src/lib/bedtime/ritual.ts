/**
 * Bedtime ritual client lib — types + the open/close trigger seam.
 *
 * The ritual is a SOFT prompt overlay shown when the user opens the
 * app inside the configured bedtime window AND no completion / skip
 * row exists for tonight. It is never a hard lockout — tapping outside
 * dismisses with a 'skipped' log.
 *
 * Hard rules enforced here:
 *   - Skipping is unconditional and writes only `skipped_at` + reason.
 *   - The mount-gate is suppressed during an active aftercare session
 *     (the safeword-aftercare flow always wins).
 *   - Phase 1 users get the lighter 'mantra' variant (mantra step only).
 *   - The window straddles midnight when end_hour > 24 (e.g. {22, 26}
 *     means 22:00 today through 02:00 tomorrow).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type BedtimeStepKey = 'mantra' | 'posture' | 'chastity' | 'breath';

export interface BedtimeWindow {
  start_hour: number;
  end_hour: number;
  enabled: boolean;
}

export interface BedtimeStepCompleted {
  step: BedtimeStepKey;
  completed_at: string;
}

export interface BedtimeRitualRow {
  id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  steps_completed: BedtimeStepCompleted[];
  skipped_at: string | null;
  skip_reason: string | null;
  phase_at_start: number | null;
  goodnight_outreach_id: string | null;
}

export const DEFAULT_BEDTIME_WINDOW: BedtimeWindow = {
  start_hour: 22,
  end_hour: 24,
  enabled: false,
};

/**
 * Is `now` (Date) inside the configured window? Window straddles
 * midnight when end_hour > 24 (e.g. 22..26 covers 22:00..02:00 next
 * day). Tolerant to end_hour <= start_hour by treating it as 24-wrap.
 */
export function isWithinWindow(window: BedtimeWindow, now: Date = new Date()): boolean {
  if (!window.enabled) return false;
  const h = now.getHours() + now.getMinutes() / 60;
  const start = window.start_hour;
  const end = window.end_hour > start ? window.end_hour : window.end_hour + 24;
  // Same-day window
  if (h >= start && h < end) return true;
  // Wrap-around: hour after midnight may map onto end-24
  if (end > 24 && h + 24 >= start && h + 24 < end) return true;
  return false;
}

/** Steps for the variant the user should see at this phase. */
export function variantForPhase(phase: number | null | undefined): BedtimeStepKey[] {
  const p = Math.max(1, Math.min(7, Number(phase ?? 1)));
  if (p <= 1) return ['mantra'];
  return ['mantra', 'posture', 'chastity', 'breath'];
}

/**
 * Resolve "is there already a row for tonight?" — look for any row
 * whose started_at falls inside the window. The window may straddle
 * midnight, so we anchor on the most recent window-start before now.
 */
export function tonightWindowStart(window: BedtimeWindow, now: Date = new Date()): Date {
  const h = now.getHours() + now.getMinutes() / 60;
  const startH = window.start_hour;
  const anchor = new Date(now);
  anchor.setMinutes(0, 0, 0);
  anchor.setHours(Math.floor(startH));
  // If now is BEFORE start_hour, the live window started yesterday at start_hour
  if (h < startH) anchor.setDate(anchor.getDate() - 1);
  return anchor;
}

interface StartArgs {
  sb: SupabaseClient;
  userId: string;
  phase: number | null | undefined;
}

export async function loadTonightRow(
  sb: SupabaseClient,
  userId: string,
  windowStart: Date,
): Promise<BedtimeRitualRow | null> {
  const { data, error } = await sb
    .from('bedtime_ritual_completions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', windowStart.toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? coerceRow(data as Record<string, unknown>) : null;
}

export async function startRitual({ sb, userId, phase }: StartArgs): Promise<BedtimeRitualRow | null> {
  const { data, error } = await sb
    .from('bedtime_ritual_completions')
    .insert({
      user_id: userId,
      phase_at_start: phase ?? null,
      steps_completed: [],
    })
    .select('*')
    .single();
  if (error) return null;
  return coerceRow(data as Record<string, unknown>);
}

export async function recordStep(
  sb: SupabaseClient,
  rowId: string,
  step: BedtimeStepKey,
  prevSteps: BedtimeStepCompleted[],
): Promise<BedtimeStepCompleted[]> {
  const next = [
    ...prevSteps.filter(s => s.step !== step),
    { step, completed_at: new Date().toISOString() },
  ];
  await sb
    .from('bedtime_ritual_completions')
    .update({ steps_completed: next })
    .eq('id', rowId);
  return next;
}

export async function completeRitual(
  sb: SupabaseClient,
  rowId: string,
  goodnightOutreachId?: string | null,
): Promise<void> {
  await sb
    .from('bedtime_ritual_completions')
    .update({
      completed_at: new Date().toISOString(),
      goodnight_outreach_id: goodnightOutreachId ?? null,
    })
    .eq('id', rowId);
}

export async function skipRitual(
  sb: SupabaseClient,
  rowId: string,
  reason: string,
): Promise<void> {
  await sb
    .from('bedtime_ritual_completions')
    .update({
      skipped_at: new Date().toISOString(),
      skip_reason: reason,
    })
    .eq('id', rowId);
}

/** Pull the most recent un-acknowledged mommy-bedtime outreach for the
 * user — the BedtimeLock routes to this on completion. Soft-fail. */
export async function getTonightGoodnight(
  sb: SupabaseClient,
  userId: string,
): Promise<{ id: string; message: string } | null> {
  const { data } = await sb
    .from('handler_outreach_queue')
    .select('id, message')
    .eq('user_id', userId)
    .eq('source', 'mommy_bedtime')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; message: string } | null) ?? null;
}

function coerceRow(raw: Record<string, unknown>): BedtimeRitualRow {
  const stepsRaw = raw.steps_completed;
  const steps: BedtimeStepCompleted[] = Array.isArray(stepsRaw)
    ? (stepsRaw as Array<{ step?: string; completed_at?: string }>)
        .filter(s => typeof s?.step === 'string' && typeof s?.completed_at === 'string')
        .map(s => ({ step: s.step as BedtimeStepKey, completed_at: s.completed_at as string }))
    : [];
  return {
    id: raw.id as string,
    user_id: raw.user_id as string,
    started_at: raw.started_at as string,
    completed_at: (raw.completed_at as string | null) ?? null,
    steps_completed: steps,
    skipped_at: (raw.skipped_at as string | null) ?? null,
    skip_reason: (raw.skip_reason as string | null) ?? null,
    phase_at_start: (raw.phase_at_start as number | null) ?? null,
    goodnight_outreach_id: (raw.goodnight_outreach_id as string | null) ?? null,
  };
}
