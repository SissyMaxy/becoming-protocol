/**
 * log-play — writes a hypno_plays row for a render played inside a session.
 *
 * WS1 closes the play→learning loop: every audio-session render or hypno source
 * played during a conditioning session logs a play row carrying the session FK,
 * edge count, and the peak arousal / HR observed during the play window. These
 * rows feed refresh_erotic_preference_profile (arousal-lift ranking) and the
 * efficacy-adaptation pass.
 *
 * A play references EITHER a rendered audio session (renderId → audio_session_renders)
 * OR an ingested hypno source (sourceId → hypno_sources). Migration 695 relaxed
 * source_id to nullable and added render_id + the one-of-two provenance CHECK.
 */

import { supabase } from '../supabase';

export interface LogPlayArgs {
  userId: string;
  /** Rendered audio session that was played (audio_session_renders.id). */
  renderId?: string | null;
  /** Ingested hypno source that was played (hypno_sources.id). */
  sourceId?: string | null;
  /** conditioning_sessions_v2.id this play happened inside, when known. */
  sessionId?: string | null;
  startedAt?: string;
  endedAt?: string | null;
  peakArousal?: number | null;
  peakHr?: number | null;
  edgesDuringPlay?: number | null;
}

export interface LogPlayResult {
  ok: boolean;
  playId?: string;
  error?: string;
}

/**
 * Insert one hypno_plays row. No-op-safe: if neither renderId nor sourceId is
 * supplied it returns an error rather than violating the provenance CHECK.
 */
export async function logHypnoPlay(args: LogPlayArgs): Promise<LogPlayResult> {
  if (!args.renderId && !args.sourceId) {
    return { ok: false, error: 'no_provenance' };
  }
  try {
    const { data, error } = await supabase
      .from('hypno_plays')
      .insert({
        user_id: args.userId,
        render_id: args.renderId ?? null,
        source_id: args.sourceId ?? null,
        session_id: args.sessionId ?? null,
        started_at: args.startedAt ?? new Date().toISOString(),
        ended_at: args.endedAt ?? null,
        peak_arousal: args.peakArousal ?? null,
        peak_hr: args.peakHr ?? null,
        edges_during_play: args.edgesDuringPlay ?? 0,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, playId: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'insert_failed' };
  }
}
