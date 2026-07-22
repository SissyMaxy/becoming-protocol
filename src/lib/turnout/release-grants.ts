/**
 * release-grants — issue a reward-only release grant (WS6, mig 705).
 *
 * A grant is ONLY ever given for an arc-aligned completion (a comfortable
 * practice drill, a consolidated rung, a scene debrief). It only GRANTS a
 * window — it is never a penalty, and the absence of a grant is never a
 * consequence (denial_day stays derived from last_release). Reward-only, by
 * construction.
 */

import { supabase } from '../supabase';

export type ReleaseGrantReason = 'practice_drill' | 'turnout_rung' | 'scene_debrief';

export async function issueReleaseGrant(args: {
  userId: string;
  grantedFor: ReleaseGrantReason;
  sourceRef?: string | null;
  windowHours?: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const hours = args.windowHours ?? 48;
    const { error } = await supabase.from('release_grants').insert({
      user_id: args.userId,
      granted_for: args.grantedFor,
      source_ref: args.sourceRef ?? null,
      expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'insert_failed' };
  }
}
