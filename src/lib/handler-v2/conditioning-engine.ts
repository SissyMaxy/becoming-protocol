/**
 * Conditioning Protocol Engine
 *
 * Systematic neurological rewiring through scheduled progressive sessions.
 * Pairs identity with arousal, trance, somatic response until automatic.
 */

import { supabase } from '../supabase';

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
