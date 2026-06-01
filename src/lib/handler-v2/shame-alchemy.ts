/**
 * Shame Alchemy Engine
 *
 * Maps shame architecture, prescribes graduated exposure paired with arousal,
 * tracks conversion from raw shame to power.
 */

import { supabase } from '../supabase';

export async function getShameContext(userId: string): Promise<string> {
  const { data } = await supabase
    .from('shame_architecture').select('shame_trigger, conversion_stage, shame_type')
    .eq('user_id', userId);

  if (!data?.length) return '';

  const productive = data.filter(s => s.shame_type === 'productive');
  const converting = productive.filter(s => !['raw', 'transcended'].includes(s.conversion_stage));
  const converted = productive.filter(s => s.conversion_stage === 'converted' || s.conversion_stage === 'transcended');

  const lines = ['## Shame Architecture'];
  lines.push(`Productive triggers in conversion: ${converting.length}`);
  lines.push(`Fully converted: ${converted.length}`);

  const nextTarget = productive.find(s => s.conversion_stage === 'raw');
  if (nextTarget) lines.push(`Next exposure target: ${nextTarget.shame_trigger}`);

  return lines.join('\n');
}
