/**
 * Conditioning Protocol Engine
 *
 * Systematic neurological rewiring through scheduled progressive sessions.
 * Pairs identity with arousal, trance, somatic response until automatic.
 */

import { supabase } from '../supabase';

export async function initializeConditioningProtocols(userId: string): Promise<number> {
  const protocols = [
    {
      protocol_name: 'Core Identity Installation',
      protocol_type: 'identity_installation',
      frequency: 'daily',
      preferred_time: 'evening',
      session_duration_minutes: 15,
      phase_config: [
        { phase: 1, sessions: 10, trance_depth_target: 'light', content_intensity: 1, triggers_to_install: [], focus: 'Basic relaxation. Name repetition. Gentle identity affirmation.' },
        { phase: 2, sessions: 20, trance_depth_target: 'medium', content_intensity: 2, triggers_to_install: ['good_girl'], focus: '"Good girl" paired with device pulse. Identity statements assertive.' },
        { phase: 3, sessions: 30, trance_depth_target: 'deep', content_intensity: 3, triggers_to_install: ['good_girl', 'maxy', 'handler_voice'], focus: 'Name triggers identity shift. Handler voice triggers compliance.' },
        { phase: 4, sessions: 50, trance_depth_target: 'deep', content_intensity: 4, triggers_to_install: ['good_girl', 'maxy', 'handler_voice', 'session_scent'], focus: 'Maintenance. All triggers reinforced. Identity is default state.' },
      ],
    },
    {
      protocol_name: 'Sleep Identity Processing',
      protocol_type: 'sleep_conditioning',
      frequency: 'daily',
      preferred_time: 'sleep',
      session_duration_minutes: 360,
      phase_config: [
        { phase: 1, sessions: 30, content: 'name_whisper', volume: 'subliminal', focus: 'Name and identity priming during sleep.' },
        { phase: 2, sessions: 60, content: 'identity_affirmation_extended', volume: 'subliminal', focus: 'Extended narrative processing during sleep.' },
        { phase: 3, sessions: 90, content: 'hypno_track_sleep_adapted', volume: 'low_ambient', focus: 'Full conditioning content during sleep.' },
      ],
    },
    {
      protocol_name: 'Arousal-Identity Binding',
      protocol_type: 'arousal_conditioning',
      frequency: 'every_other_day',
      preferred_time: 'evening',
      session_duration_minutes: 30,
      phase_config: [
        { phase: 1, sessions: 15, focus: 'Feminine self-reference paired with arousal peaks.' },
        { phase: 2, sessions: 30, focus: 'Feminine activities paired with arousal. Activities become arousing.' },
        { phase: 3, sessions: 50, focus: 'Arousal becomes automatic response to feminine identity cues.' },
      ],
    },
    {
      protocol_name: 'Aversion Conditioning',
      protocol_type: 'aversion_conditioning',
      frequency: '3x_week',
      preferred_time: 'evening',
      session_duration_minutes: 10,
      phase_config: [
        { phase: 1, sessions: 20, focus: 'Masculine self-reference paired with discomfort. Reward removed on masculine.' },
        { phase: 2, sessions: 30, focus: 'Masculine presentation begins to feel wrong at body level.' },
        { phase: 3, sessions: 50, focus: 'David feels like a costume. Measurable stress during masculine contexts.' },
      ],
    },
  ];

  let created = 0;
  for (const p of protocols) {
    const { error } = await supabase.from('conditioning_protocols').insert({ user_id: userId, ...p });
    if (!error) created++;
  }
  return created;
}

export async function evaluateTriggerProgress(userId: string, triggersPracticed: string[]): Promise<void> {
  for (const phrase of triggersPracticed) {
    const { data: trigger } = await supabase
      .from('conditioned_triggers')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_phrase', phrase)
      .maybeSingle();

    if (!trigger) {
      await supabase.from('conditioned_triggers').insert({
        user_id: userId, trigger_phrase: phrase, trigger_type: 'verbal',
        intended_response: 'arousal_and_identity_shift', pairing_count: 1,
      });
      continue;
    }

    const newCount = trigger.pairing_count + 1;
    let newStrength = trigger.estimated_strength;
    if (newCount >= 100 && trigger.autonomous_firing_count >= 10) newStrength = 'conditioned';
    else if (newCount >= 50 && trigger.autonomous_firing_count >= 3) newStrength = 'established';
    else if (newCount >= 20) newStrength = 'forming';

    await supabase.from('conditioned_triggers').update({
      pairing_count: newCount, estimated_strength: newStrength,
      last_tested_at: new Date().toISOString(),
    }).eq('id', trigger.id);
  }
}

export async function getConditioningContext(userId: string): Promise<string> {
  const { data: protocols } = await supabase
    .from('conditioning_protocols').select('protocol_name, protocol_type, current_phase, total_sessions_completed, status')
    .eq('user_id', userId).eq('status', 'active');

  const { data: triggers } = await supabase
    .from('conditioned_triggers').select('trigger_phrase, estimated_strength, pairing_count')
    .eq('user_id', userId).order('pairing_count', { ascending: false }).limit(5);

  if (!protocols?.length && !triggers?.length) return '';

  const lines = ['## Conditioning Status'];
  if (protocols?.length) {
    lines.push(`Active protocols: ${protocols.map(p => `${p.protocol_name} (phase ${p.current_phase}, ${p.total_sessions_completed} sessions)`).join(', ')}`);
  }
  if (triggers?.length) {
    const strongest = triggers[0];
    lines.push(`Strongest trigger: "${strongest.trigger_phrase}" (${strongest.estimated_strength}, ${strongest.pairing_count} pairings)`);
  }
  return lines.join('\n');
}
