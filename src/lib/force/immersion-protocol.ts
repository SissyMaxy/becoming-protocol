/**
 * Immersion Protocol
 *
 * User pre-commits to hypno-locked sessions. Handler enforces within. Early
 * exit triggers denial reset + public post + Gina disclosure + next session
 * doubled.
 */

import { supabase } from '../supabase';
import { enqueuePunishment } from './punishment-queue';

export type ImmersionType =
  | 'hypno_loop'
  | 'maxy_mantra'
  | 'goon_queue'
  | 'handler_directive_cycle'
  | 'sleep_overnight'
  | 'mixed';

export interface ImmersionPlan {
  scheduledStart: Date;
  durationMinutes: number;
  sessionType: ImmersionType;
  contentPlan: Record<string, unknown>;
  chastityRequired?: boolean;
  phoneLocked?: boolean;
  blackoutRequired?: boolean;
  headphonesRequired?: boolean;
}

export async function scheduleImmersion(userId: string, plan: ImmersionPlan): Promise<string | null> {
  const { data, error } = await supabase
    .from('immersion_sessions')
    .insert({
      user_id: userId,
      scheduled_start: plan.scheduledStart.toISOString(),
      committed_duration_minutes: plan.durationMinutes,
      session_type: plan.sessionType,
      content_plan: plan.contentPlan,
      chastity_required: plan.chastityRequired ?? true,
      phone_locked: plan.phoneLocked ?? true,
      blackout_required: plan.blackoutRequired ?? false,
      headphones_required: plan.headphonesRequired ?? true,
      status: 'scheduled',
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return data.id as string;
}

export async function startImmersion(sessionId: string): Promise<void> {
  await supabase
    .from('immersion_sessions')
    .update({
      actual_start: new Date().toISOString(),
      status: 'active',
    })
    .eq('id', sessionId);
}

export async function completeImmersion(
  sessionId: string,
  debrief: { resistance?: string; breakthroughs?: string } = {},
): Promise<void> {
  await supabase
    .from('immersion_sessions')
    .update({
      actual_end: new Date().toISOString(),
      status: 'completed',
      debrief_resistance_notes: debrief.resistance,
      debrief_breakthroughs: debrief.breakthroughs,
    })
    .eq('id', sessionId);
}

/**
 * Early exit — fires consequences.
 */
export async function breakEarly(
  userId: string,
  sessionId: string,
  reason: string,
): Promise<void> {
  const { data: session } = await supabase
    .from('immersion_sessions')
    .select('committed_duration_minutes, actual_start')
    .eq('id', sessionId)
    .maybeSingle();

  const committedMin = (session?.committed_duration_minutes as number) || 60;
  const startedAt = session?.actual_start ? new Date(session.actual_start as string) : new Date();
  const servedMin = Math.round((Date.now() - startedAt.getTime()) / 60000);

  const consequences = {
    denial_reset: false,
    public_post_queued: false,
    gina_disclosure_bumped: false,
    next_session_doubled: true,
    punishment_ids: [] as string[],
  };

  await supabase
    .from('immersion_sessions')
    .update({
      status: 'broken_early',
      broken_at: new Date().toISOString(),
      broken_reason: reason,
      actual_end: new Date().toISOString(),
      early_exit_consequences: consequences,
    })
    .eq('id', sessionId);

  // Heavy slip
  const { data: slip } = await supabase
    .from('slip_log')
    .insert({
      user_id: userId,
      slip_type: 'immersion_session_broken',
      slip_points: 6,
      source_text: `Broke immersion at ${servedMin}/${committedMin}min: ${reason}`,
      source_table: 'immersion_sessions',
      source_id: sessionId,
    })
    .select('id')
    .single();

  // Consequences fire
  const slipIds = slip ? [slip.id as string] : [];
  const p1 = await enqueuePunishment(userId, 'public_slip_post', { triggered_by_slip_ids: slipIds });
  const p2 = await enqueuePunishment(userId, 'gina_disclosure_bump', { triggered_by_slip_ids: slipIds });
  const p3 = await enqueuePunishment(userId, 'denial_3_days', { triggered_by_slip_ids: slipIds });
  if (p1) consequences.punishment_ids.push(p1);
  if (p2) consequences.punishment_ids.push(p2);
  if (p3) consequences.punishment_ids.push(p3);
  consequences.public_post_queued = Boolean(p1);
  consequences.gina_disclosure_bumped = Boolean(p2);
  consequences.denial_reset = Boolean(p3);

  await supabase
    .from('immersion_sessions')
    .update({ early_exit_consequences: consequences })
    .eq('id', sessionId);

  // Schedule next session at doubled duration
  const nextStart = new Date(Date.now() + 24 * 3600000);
  await scheduleImmersion(userId, {
    scheduledStart: nextStart,
    durationMinutes: committedMin * 2,
    sessionType: 'mixed',
    contentPlan: { auto_scheduled_after_break: true, previous_session: sessionId },
  });
}
