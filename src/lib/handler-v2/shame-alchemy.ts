/**
 * Shame Alchemy Engine
 *
 * Maps shame architecture, prescribes graduated exposure paired with arousal,
 * tracks conversion from raw shame to power.
 */

import { supabase } from '../supabase';

export async function initializeShameArchitecture(userId: string): Promise<number> {
  const triggers = [
    { shame_trigger: 'being_seen_feminine_in_public', category: 'social', shame_type: 'productive' },
    { shame_trigger: 'voice_cracking_during_practice', category: 'performance', shame_type: 'productive' },
    { shame_trigger: 'sexual_submission_desire', category: 'sexual', shame_type: 'productive' },
    { shame_trigger: 'being_desired_by_men', category: 'sexual', shame_type: 'productive' },
    { shame_trigger: 'earning_money_from_body', category: 'identity', shame_type: 'productive' },
    { shame_trigger: 'wearing_feminine_clothes_outside', category: 'social', shame_type: 'productive' },
    { shame_trigger: 'telling_someone_about_transition', category: 'social', shame_type: 'productive' },
    { shame_trigger: 'mirror_dysphoria', category: 'body', shame_type: 'destructive' },
    { shame_trigger: 'gina_discovering_everything', category: 'identity', shame_type: 'unknown' },
  ];

  let created = 0;
  for (const t of triggers) {
    const { error } = await supabase.from('shame_architecture').insert({ user_id: userId, ...t });
    if (!error) created++;
  }
  return created;
}

export async function prescribeShameExposure(
  userId: string,
  currentArousal: number,
  whoopRecovery?: number,
): Promise<{ shameId: string; trigger: string; exposureType: string; framing: string } | null> {
  if (currentArousal < 3) return null;
  if (whoopRecovery != null && whoopRecovery < 34) return null;

  const { data: shames } = await supabase
    .from('shame_architecture').select('*')
    .eq('user_id', userId).eq('shame_type', 'productive')
    .in('conversion_stage', ['raw', 'exposed', 'arousal_paired', 'softening'])
    .order('exposure_count', { ascending: true }).limit(1);

  if (!shames?.length) return null;
  const target = shames[0];

  const exposureMap: Record<string, string> = {
    raw: 'visualization',
    exposed: 'session_paired',
    arousal_paired: 'writing',
    softening: 'controlled_action',
  };

  return {
    shameId: target.id,
    trigger: target.shame_trigger,
    exposureType: exposureMap[target.conversion_stage] || 'visualization',
    framing: 'The arousal transforms the fear into power. Lean into it.',
  };
}

export async function logShameExposure(
  userId: string,
  shameId: string,
  exposureType: string,
  outcome: string,
  context: { arousal?: number; denialDay?: number; deviceActive?: boolean },
): Promise<void> {
  await supabase.from('shame_exposures').insert({
    user_id: userId, shame_id: shameId, exposure_type: exposureType,
    outcome, arousal_at_exposure: context.arousal, denial_day: context.denialDay,
    device_active: context.deviceActive,
  });

  // Update architecture
  const update: Record<string, unknown> = {
    last_exposure_at: new Date().toISOString(),
    last_exposure_outcome: outcome,
  };

  if (outcome === 'arousal_spike' || outcome === 'power_feeling') {
    // Advance conversion stage
    const { data: shame } = await supabase
      .from('shame_architecture').select('conversion_stage, exposure_count, arousal_pairing_count')
      .eq('id', shameId).maybeSingle();

    if (shame) {
      const stages = ['raw', 'exposed', 'arousal_paired', 'softening', 'converted', 'transcended'];
      const currentIdx = stages.indexOf(shame.conversion_stage);
      const successCount = (shame.arousal_pairing_count || 0) + 1;

      // Advance after 5 successful exposures at current stage
      if (successCount >= 5 && currentIdx < stages.length - 1) {
        update.conversion_stage = stages[currentIdx + 1];
      }
      update.arousal_pairing_count = successCount;
    }
  } else if (outcome === 'withdrawal' || outcome === 'crisis') {
    // withdrawal_count incremented via separate query below
  }

  await supabase.from('shame_architecture').update(update).eq('id', shameId);
}

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
