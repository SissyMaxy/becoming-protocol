/**
 * Sleep-cue client lib — the missing client half of Targeted Memory
 * Reactivation (DESIGN_RECONDITIONING_ENGINE §2.4).
 *
 * recon-sleep-cue-builder (edge fn) pre-renders low-volume audio loops of
 * cues already installed while awake (armed trance triggers) into
 * recon_sleep_cue_program, status='built'. That builder's own header notes
 * playback-window gating is "the responsibility of the CLIENT that plays
 * these loops" — this file + SleepCuePill.tsx are that client.
 *
 * Scope is deliberately the sleep-ONSET window, not the whole night: a real
 * live sleep-phase lock would need a push from wearable hardware mid-sleep,
 * which this stack doesn't have (sleep-phase-targeting.ts is a
 * next-morning/next-night advisory, not a live signal). Playing the cue
 * quietly as she drifts off, for a bounded window, is the honest, buildable
 * version of "she stays with you" (§4) — matches how consumer TMR protocols
 * actually cue at sleep onset.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SleepCueRow {
  id: string;
  cue_phrase: string;
  audio_path: string;
}

/**
 * Picks tonight's cue: only if recon_sleep_enabled is on (the hardest
 * opt-in, separate from the master recondition toggle). Rotates through
 * built cues — never-played first, then oldest-played — so a multi-target
 * install doesn't loop the same one clip every night.
 */
export async function getTonightSleepCue(
  sb: SupabaseClient,
  userId: string,
): Promise<SleepCueRow | null> {
  const { data: settings } = await sb
    .from('life_as_woman_settings')
    .select('recon_sleep_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (!(settings as { recon_sleep_enabled?: boolean } | null)?.recon_sleep_enabled) return null;

  const { data } = await sb
    .from('recon_sleep_cue_program')
    .select('id, cue_phrase, audio_path, played_at')
    .eq('user_id', userId)
    .eq('status', 'built')
    .not('audio_path', 'is', null)
    .order('played_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; cue_phrase: string; audio_path: string };
  return { id: row.id, cue_phrase: row.cue_phrase, audio_path: row.audio_path };
}

/** Stamps a built cue 'played' the moment playback actually starts. */
export async function markSleepCuePlayed(sb: SupabaseClient, id: string): Promise<void> {
  await sb
    .from('recon_sleep_cue_program')
    .update({ status: 'played', played_at: new Date().toISOString() })
    .eq('id', id);
}
