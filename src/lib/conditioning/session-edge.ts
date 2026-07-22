/**
 * session-edge — write a session_edge_events row (mig 695).
 *
 * One row per edge inside a conditioning session: a manual "edged" tap
 * (source 'button') or an auto denial cycle from the cycle engine
 * (source 'denial_cycle'). Rows are biometric-tagged (hr, arousal_estimate)
 * so efficacy-adaptation + preference learning can query edges by session,
 * time, and physiological context. endGoonSession tallies them.
 */

import { supabase } from '../supabase';

export interface LogEdgeArgs {
  userId: string;
  sessionId: string | null;
  source?: 'button' | 'denial_cycle';
  hr?: number | null;
  arousalEstimate?: number | null;
}

export async function logSessionEdge(args: LogEdgeArgs): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('session_edge_events').insert({
      user_id: args.userId,
      session_id: args.sessionId,
      source: args.source ?? 'button',
      hr: args.hr ?? null,
      arousal_estimate: args.arousalEstimate ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'insert_failed' };
  }
}
