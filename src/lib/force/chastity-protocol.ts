/**
 * Chastity Lockout Protocol
 *
 * Handler-driven lock durations with escalating streaks. Break-glass costs:
 * streak reset + public post + Gina disclosure + next lock doubled.
 */

import { supabase } from '../supabase';
import { enqueuePunishment } from './punishment-queue';

export async function lockNow(
  userId: string,
  durationHours: number,
  setBy: 'handler' | 'gina' | 'self' = 'handler',
  cage?: { deviceId?: string; cageModel?: string },
): Promise<string | null> {
  const { data: streak } = await supabase
    .from('user_state')
    .select('chastity_streak_days')
    .eq('user_id', userId)
    .maybeSingle();

  const streakDay = ((streak?.chastity_streak_days as number) || 0) + Math.round(durationHours / 24);

  const now = new Date();
  const unlock = new Date(now.getTime() + durationHours * 3600000);

  const { data, error } = await supabase
    .from('chastity_sessions')
    .insert({
      user_id: userId,
      locked_at: now.toISOString(),
      scheduled_unlock_at: unlock.toISOString(),
      duration_hours: durationHours,
      streak_day: streakDay,
      lock_set_by: setBy,
      device_id: cage?.deviceId,
      cage_model: cage?.cageModel,
      status: 'locked',
    })
    .select('id')
    .single();

  if (error || !data) return null;

  await supabase
    .from('user_state')
    .update({
      chastity_locked: true,
      chastity_current_session_id: data.id,
      chastity_scheduled_unlock_at: unlock.toISOString(),
      chastity_streak_days: streakDay,
    })
    .eq('user_id', userId);

  return data.id as string;
}

export async function scheduledRelease(userId: string, sessionId: string): Promise<void> {
  await supabase
    .from('chastity_sessions')
    .update({
      status: 'released',
      actual_unlock_at: new Date().toISOString(),
      unlock_authority: 'handler_scheduled',
    })
    .eq('id', sessionId);

  await supabase
    .from('user_state')
    .update({
      chastity_locked: false,
      chastity_current_session_id: null,
      chastity_scheduled_unlock_at: null,
    })
    .eq('user_id', userId);
}

/**
 * Break-glass unlock. Consequences fire automatically.
 */
export async function breakGlass(
  userId: string,
  sessionId: string,
  reason: string,
  evidencePhotoUrl?: string,
): Promise<void> {
  await supabase
    .from('chastity_sessions')
    .update({
      status: 'broken_glass',
      actual_unlock_at: new Date().toISOString(),
      unlock_authority: 'self_break_glass',
      break_glass_used: true,
      break_glass_reason: reason,
      break_glass_evidence: { photo_url: evidencePhotoUrl },
      break_glass_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  const { data: state } = await supabase
    .from('user_state')
    .select('chastity_total_break_glass_count')
    .eq('user_id', userId)
    .maybeSingle();

  const newCount = ((state?.chastity_total_break_glass_count as number) || 0) + 1;

  await supabase
    .from('user_state')
    .update({
      chastity_locked: false,
      chastity_current_session_id: null,
      chastity_scheduled_unlock_at: null,
      chastity_streak_days: 0,  // STREAK RESET
      chastity_total_break_glass_count: newCount,
    })
    .eq('user_id', userId);

  // Heavy slip
  const { data: slip } = await supabase
    .from('slip_log')
    .insert({
      user_id: userId,
      slip_type: 'chastity_unlocked_early',
      slip_points: 10,
      source_text: `Break-glass: ${reason}`,
      source_table: 'chastity_sessions',
      source_id: sessionId,
    })
    .select('id')
    .single();

  // Automatic consequences
  await enqueuePunishment(userId, 'public_slip_post', {
    triggered_by_slip_ids: slip ? [slip.id as string] : [],
  });
  await enqueuePunishment(userId, 'gina_disclosure_bump', {
    triggered_by_slip_ids: slip ? [slip.id as string] : [],
  });
  await enqueuePunishment(userId, 'denial_7_days', {
    triggered_by_slip_ids: slip ? [slip.id as string] : [],
  });
  await enqueuePunishment(userId, 'edge_no_release_90', {
    triggered_by_slip_ids: slip ? [slip.id as string] : [],
  });
}

/**
 * Schedule a Gina release window.
 */
export async function scheduleGinaWindow(
  userId: string,
  sessionId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('gina_release_windows')
    .insert({
      user_id: userId,
      chastity_session_id: sessionId,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      gina_decision: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return data.id as string;
}
