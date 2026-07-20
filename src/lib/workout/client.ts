// Client helpers for the Mommy-led body program (the workout engine).
// Reads the body_conditioning reconditioning target, activates it, and logs
// real per-set work to workout_set_log. The program itself is computed pure
// from the target's program_start (src/lib/body-program.ts) — no cron needed.

import { supabase } from '../supabase';
import type { BodyProgramConfig } from '../body-program';

/** Local YYYY-MM-DD (the program is anchored to the user's own calendar day). */
export function todayLocalISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export interface BodyProgramTarget {
  id: string;
  config: BodyProgramConfig;
}

/** The user's active body-conditioning target, or null if the program isn't started. */
export async function loadBodyProgramTarget(userId: string): Promise<BodyProgramTarget | null> {
  const { data } = await supabase
    .from('reconditioning_targets')
    .select('id, indicator_config, status')
    .eq('user_id', userId)
    .eq('indicator_config->>program', 'body_conditioning')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, config: (data.indicator_config ?? {}) as BodyProgramConfig };
}

/** Start (or restart, from today) the program. Returns the target id. */
export async function startBodyProgram(split = 'lower_led_3x'): Promise<string | null> {
  const { data, error } = await supabase.rpc('body_program_start', { p_split: split });
  if (error) return null;
  return (data as string) ?? null;
}

export interface WorkoutSetInput {
  sessionUid: string;
  exerciseName: string;
  setNumber: number;
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  programWeek?: number | null;
  programDay?: string | null;
  sessionName?: string | null;
}

/** Log one completed set. */
export async function logWorkoutSet(userId: string, s: WorkoutSetInput): Promise<boolean> {
  const { error } = await supabase.from('workout_set_log').insert({
    user_id: userId,
    session_uid: s.sessionUid,
    exercise_name: s.exerciseName,
    set_number: s.setNumber,
    reps: s.reps ?? null,
    weight_kg: s.weightKg ?? null,
    duration_seconds: s.durationSeconds ?? null,
    program_week: s.programWeek ?? null,
    program_day: s.programDay ?? null,
    session_name: s.sessionName ?? null,
  });
  return !error;
}

/** Most recent logged weight per exercise, for prefilling the next session. */
export async function loadLastWeights(userId: string, exerciseNames: string[]): Promise<Record<string, number>> {
  if (exerciseNames.length === 0) return {};
  const { data } = await supabase
    .from('workout_set_log')
    .select('exercise_name, weight_kg, logged_at')
    .eq('user_id', userId)
    .in('exercise_name', exerciseNames)
    .not('weight_kg', 'is', null)
    .order('logged_at', { ascending: false })
    .limit(200);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ exercise_name: string; weight_kg: number }>) {
    if (out[row.exercise_name] === undefined) out[row.exercise_name] = row.weight_kg;
  }
  return out;
}

/** Credit the daily "moved today" streak (reuses the fitness_log_session RPC). */
export async function creditMovementDay(userId: string): Promise<void> {
  await supabase.rpc('fitness_log_session', { p_user: userId });
}

/**
 * Ensure today's train-day is a real deadline-bearing decree — so it surfaces
 * as the pressing Focus task and skipping it feeds the slip/penalty ledger.
 * No-op off train days / when the program isn't active. Idempotent per day.
 */
export async function ensureWorkoutDecree(edict: string, sessionName: string): Promise<void> {
  await supabase.rpc('body_program_ensure_decree', { p_edict: edict, p_session_name: sessionName });
}

/** Mark today's train decree fulfilled (resolves the obligation). */
export async function fulfillWorkoutDecree(): Promise<void> {
  await supabase.rpc('body_program_fulfill');
}

export type WristStatus =
  | { state: 'none' }
  | { state: 'below_floor'; minutes: number }
  | { state: 'verified'; minutes: number; avg_hr: number | null; max_hr: number | null; sport: string | null };

/**
 * What her watch saw today, without committing anything (mig 689). Drives the
 * proof line on the order card — "her watch saw it · 34 min · heart at 156" or
 * the failed-proof line — before the user acts. Visible before it's committed.
 */
export async function wristWorkoutStatus(): Promise<WristStatus> {
  const { data, error } = await supabase.rpc('wrist_workout_status');
  if (error || !data) return { state: 'none' };
  return data as WristStatus;
}

/**
 * Fulfill today's train decree from a real Whoop workout row — no upload, no
 * self-report. Returns whether the strap actually cleared the floor. This is
 * the proof path that catches a skip: if it returns verified:false, nothing
 * landed on the wrist and the self-report path stays the only way to close it.
 */
export async function wristVerifyWorkout(): Promise<{ verified: boolean; decreeFulfilled: boolean }> {
  const { data, error } = await supabase.rpc('wrist_verify_workout');
  if (error || !data) return { verified: false, decreeFulfilled: false };
  const r = data as { verified?: boolean; decree_fulfilled?: boolean };
  return { verified: !!r.verified, decreeFulfilled: !!r.decree_fulfilled };
}
