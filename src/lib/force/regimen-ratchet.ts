/**
 * Regimen Adherence Ratchet
 *
 * Handler drives dose scheduling. Missed doses create slips + punishments.
 * Ceasing a regimen requires 7-day cooldown with Gina disclosure pressure.
 */

import { supabase } from '../supabase';
import { enqueuePunishment } from './punishment-queue';

export interface RegimenInput {
  medication_name: string;
  medication_category: string;
  dose_amount: string;
  dose_times_per_day: number;
  dose_schedule_hours: number[];
  prescriber?: string;
  refill_source?: string;
}

export async function activateRegimen(
  userId: string,
  input: RegimenInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('medication_regimen')
    .insert({
      user_id: userId,
      ...input,
      ratchet_stage: 'active',
      active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[Regimen] activate failed:', error?.message);
    return null;
  }

  await scheduleNextDoses(userId, data.id as string, 7);
  return data.id as string;
}

export async function scheduleNextDoses(
  userId: string,
  regimenId: string,
  daysAhead: number,
): Promise<number> {
  const { data: regimen } = await supabase
    .from('medication_regimen')
    .select('dose_schedule_hours, active')
    .eq('id', regimenId)
    .maybeSingle();

  if (!regimen || !regimen.active) return 0;

  const hours = (regimen.dose_schedule_hours as number[]) || [8];
  const doses: Array<{ user_id: string; regimen_id: string; scheduled_at: string }> = [];

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    for (const h of hours) {
      const scheduled = new Date(day);
      scheduled.setHours(h, 0, 0, 0);
      if (scheduled.getTime() < Date.now()) continue;
      doses.push({
        user_id: userId,
        regimen_id: regimenId,
        scheduled_at: scheduled.toISOString(),
      });
    }
  }

  if (doses.length === 0) return 0;

  const { error } = await supabase.from('dose_log').insert(doses);
  if (error) console.error('[Regimen] dose scheduling failed:', error.message);
  return doses.length;
}

export async function markDoseTaken(
  doseId: string,
  evidence: { photoUrl?: string; confirmationType?: 'photo' | 'timestamp' | 'text' } = {},
): Promise<void> {
  const now = new Date();
  await supabase
    .from('dose_log')
    .update({
      taken_at: now.toISOString(),
      photo_url: evidence.photoUrl,
      confirmation_type: evidence.confirmationType || 'timestamp',
    })
    .eq('id', doseId);
}

/**
 * Scan for overdue doses and create slips + punishments.
 */
export async function processMissedDoses(userId: string): Promise<number> {
  // Grace period: 2 hours after scheduled time
  const graceCutoff = new Date(Date.now() - 2 * 3600000).toISOString();

  const { data: missed } = await supabase
    .from('dose_log')
    .select('id, scheduled_at, regimen_id')
    .eq('user_id', userId)
    .is('taken_at', null)
    .eq('skipped', false)
    .is('triggered_slip_id', null)
    .lt('scheduled_at', graceCutoff)
    .limit(10);

  if (!missed || missed.length === 0) return 0;

  for (const d of missed) {
    const lateMinutes = Math.round((Date.now() - new Date(d.scheduled_at as string).getTime()) / 60000);

    // Create slip
    const { data: slip } = await supabase
      .from('slip_log')
      .insert({
        user_id: userId,
        slip_type: 'hrt_dose_missed',
        slip_points: 4,
        source_text: `Missed dose scheduled ${d.scheduled_at}, ${lateMinutes}min late`,
        source_table: 'dose_log',
        source_id: d.id,
      })
      .select('id')
      .single();

    if (slip) {
      await supabase
        .from('dose_log')
        .update({
          late_by_minutes: lateMinutes,
          triggered_slip_id: slip.id,
        })
        .eq('id', d.id);

      // Queue a punishment for repeat misses
      await enqueuePunishment(userId, 'mantra_50', {
        triggered_by_slip_ids: [slip.id as string],
      });
    }
  }

  return missed.length;
}

/**
 * Request to cease — starts 7-day cooldown + Gina disclosure.
 */
export async function requestCease(userId: string, regimenId: string): Promise<void> {
  const cooldownEnds = new Date(Date.now() + 7 * 86400000).toISOString();
  await supabase
    .from('medication_regimen')
    .update({
      cease_requested_at: new Date().toISOString(),
      cease_cooldown_ends_at: cooldownEnds,
    })
    .eq('id', regimenId);

  // Log as heavy slip
  await supabase.from('slip_log').insert({
    user_id: userId,
    slip_type: 'resistance_statement',
    slip_points: 8,
    source_text: 'Requested regimen cease',
    source_table: 'medication_regimen',
    source_id: regimenId,
  });

  // Queue Gina disclosure + public post punishment
  await enqueuePunishment(userId, 'gina_disclosure_bump', {});
  await enqueuePunishment(userId, 'public_slip_post', {});
}
