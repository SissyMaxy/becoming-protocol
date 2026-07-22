/**
 * log-play — write a `hypno_plays` row for a render played INSIDE a session.
 *
 * Until now `hypno_plays` (mig 198) was only written by the api/hypno play
 * action, so goon/trance/cockwarming sessions never fed the hypno-learning
 * correlation pipeline or the erotic_preference_profile refresh. This is the
 * shared seam that closes that: every in-session render logs a play, so the
 * preference profile learns from what she actually drops to, not just uploads.
 *
 * `source_id` is nullable (a rendered session has no hypno_sources row); the
 * `session_id` FK ties the play to its conditioning_sessions_v2 row so the
 * correlation pipeline can join biometrics/edges.
 */

import { supabase } from '../supabase';

export interface LogPlayInput {
  userId: string;
  /** conditioning_sessions_v2.id this render played inside. */
  sessionId: string;
  startedAt: string;
  endedAt: string;
  /** 0-5 peak arousal observed during the play, if known. */
  peakArousal?: number | null;
  /** Live-logged edges during this render, if counted. */
  edgesDuringPlay?: number | null;
  /** Peak HR from session biometrics during the play window, if polled. */
  peakHr?: number | null;
}

/** Insert one in-session hypno play. Fire-and-forget; never throws into a session. */
export async function logSessionPlay(input: LogPlayInput): Promise<void> {
  try {
    await supabase.from('hypno_plays').insert({
      user_id: input.userId,
      source_id: null,
      session_id: input.sessionId,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      peak_arousal: input.peakArousal ?? null,
      edges_during_play: input.edgesDuringPlay ?? null,
      peak_hr: input.peakHr ?? null,
    });
  } catch {
    // Logging a play must never break the session it measures.
  }
}
