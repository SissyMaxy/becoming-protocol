/**
 * HRT Pipeline Manager
 *
 * Manages medical pathway to HRT. Dose reminders, change tracking,
 * body evidence as irreversibility leverage.
 */

import { supabase } from '../supabase';

export async function getHRTContext(userId: string): Promise<string> {
  const { data: pipeline } = await supabase
    .from('hrt_pipeline').select('*').eq('user_id', userId).maybeSingle();

  if (!pipeline) return '';

  const lines = ['## HRT Status'];
  lines.push(`Stage: ${pipeline.stage}`);

  if (pipeline.medication) lines.push(`Medication: ${pipeline.medication} ${pipeline.dosage || ''}`);
  if (pipeline.doses_taken) lines.push(`Doses taken: ${pipeline.doses_taken} (${pipeline.doses_missed} missed)`);
  if (pipeline.next_appointment) lines.push(`Next appointment: ${new Date(pipeline.next_appointment).toLocaleDateString()}`);

  // Body evidence
  const { data: changes } = await supabase
    .from('hrt_changes').select('*').eq('user_id', userId)
    .order('change_date', { ascending: false }).limit(2);

  if (changes && changes.length >= 2) {
    const latest = changes[0];
    const prev = changes[1];
    if (latest.bust_cm && prev.bust_cm) {
      lines.push(`Bust change: ${prev.bust_cm}→${latest.bust_cm}cm (+${(latest.bust_cm - prev.bust_cm).toFixed(1)}cm)`);
    }
    lines.push('These changes are visible and not reversible without explanation.');
  }

  return lines.join('\n');
}

export async function checkDoseReminders(userId: string): Promise<{ overdue: number }> {
  const { data: pipeline } = await supabase
    .from('hrt_pipeline').select('stage, medication')
    .eq('user_id', userId).in('stage', ['started', 'maintaining', 'adjusting']).maybeSingle();

  if (!pipeline) return { overdue: 0 };

  const { data: pending } = await supabase
    .from('hrt_doses').select('id, scheduled_at')
    .eq('user_id', userId).is('taken_at', null).eq('missed', false)
    .lte('scheduled_at', new Date().toISOString());

  let overdue = 0;
  for (const dose of pending || []) {
    const minutesOverdue = (Date.now() - new Date(dose.scheduled_at).getTime()) / 60000;
    if (minutesOverdue > 240) {
      await supabase.from('hrt_doses').update({ missed: true }).eq('id', dose.id);
      overdue++;
    }
  }
  return { overdue };
}

export async function logDoseTaken(userId: string, medication: string): Promise<void> {
  const { data: pending } = await supabase
    .from('hrt_doses').select('id').eq('user_id', userId)
    .eq('medication', medication).is('taken_at', null).eq('missed', false)
    .order('scheduled_at', { ascending: true }).limit(1).maybeSingle();

  if (pending) {
    await supabase.from('hrt_doses').update({ taken_at: new Date().toISOString() }).eq('id', pending.id);
  }

  await supabase.from('hrt_pipeline').update({
    last_dose_at: new Date().toISOString(),
  }).eq('user_id', userId);
}
