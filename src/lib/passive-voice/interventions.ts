/**
 * Passive Voice — Intervention Rule Engine
 *
 * Checks pitch data against rules and triggers responses.
 * Rules: pitch drops, extended low, context-aware thresholds, milestones.
 */

import { supabase } from '../supabase';
import type { VoiceIntervention, InterventionTrigger, InterventionType, VoiceContext } from '../../types/passive-voice';
import { mapIntervention } from '../../types/passive-voice';

// ── Thresholds ──────────────────────────────────────────

const PITCH_DROP_THRESHOLD_HZ = 30; // >30Hz drop from baseline triggers alert
const COOLDOWN_MINUTES = 15; // Don't fire same intervention type within this window

// ── Context-aware target ranges ─────────────────────────

const CONTEXT_TARGETS: Record<VoiceContext, { min: number; floor: number }> = {
  solo: { min: 180, floor: 150 },
  conversation: { min: 170, floor: 140 },
  phone: { min: 175, floor: 145 },
  video: { min: 180, floor: 150 },
  practice: { min: 190, floor: 170 },
  cam: { min: 185, floor: 155 },
  unknown: { min: 175, floor: 145 },
};

// ── Check intervention rules ────────────────────────────

export async function checkInterventionRules(
  userId: string,
  currentPitchHz: number,
  context: VoiceContext,
  baselinePitchHz?: number
): Promise<VoiceIntervention | null> {
  const targets = CONTEXT_TARGETS[context];

  // Check cooldown — don't spam interventions
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60000).toISOString();
  const { count: recentCount } = await supabase
    .from('voice_interventions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', cooldownCutoff);

  if (recentCount && recentCount > 0) return null;

  // Rule 1: Pitch drop from baseline
  if (baselinePitchHz && (baselinePitchHz - currentPitchHz) > PITCH_DROP_THRESHOLD_HZ) {
    return await recordIntervention(userId, {
      trigger_type: 'pitch_drop',
      trigger_data: {
        detected_hz: currentPitchHz,
        baseline_hz: baselinePitchHz,
        drop_hz: baselinePitchHz - currentPitchHz,
        context,
      },
      intervention_type: 'haptic',
      intervention_data: {
        pattern: 'double_tap',
        message: `Voice dropping — ${Math.round(currentPitchHz)}Hz vs ${Math.round(baselinePitchHz)}Hz baseline`,
      },
    });
  }

  // Rule 2: Extended time below floor
  if (currentPitchHz < targets.floor) {
    return await recordIntervention(userId, {
      trigger_type: 'extended_low',
      trigger_data: {
        detected_hz: currentPitchHz,
        threshold_hz: targets.floor,
        context,
      },
      intervention_type: 'gentle_reminder',
      intervention_data: {
        message: `Voice at ${Math.round(currentPitchHz)}Hz — breathe, lift resonance 💕`,
      },
    });
  }

  // Rule 3: Milestone celebration (consistently above target)
  if (currentPitchHz >= targets.min) {
    // Check if this is sustained (5+ consecutive samples above target)
    const { data: recent } = await supabase
      .from('passive_voice_samples')
      .select('avg_pitch_hz')
      .eq('user_id', userId)
      .order('sampled_at', { ascending: false })
      .limit(5);

    if (recent && recent.length >= 5) {
      const allAbove = recent.every((s) => (s.avg_pitch_hz as number) >= targets.min);
      if (allAbove) {
        // Only celebrate once per day
        const today = new Date().toISOString().split('T')[0];
        const { count: celebratedToday } = await supabase
          .from('voice_interventions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('trigger_type', 'milestone')
          .gte('created_at', `${today}T00:00:00`);

        if (!celebratedToday || celebratedToday === 0) {
          return await recordIntervention(userId, {
            trigger_type: 'milestone',
            trigger_data: {
              sustained_hz: currentPitchHz,
              target_hz: targets.min,
              context,
              consecutive_samples: 5,
            },
            intervention_type: 'celebration',
            intervention_data: {
              message: `Gorgeous! Sustained ${Math.round(currentPitchHz)}Hz in ${context} 🎉`,
            },
          });
        }
      }
    }
  }

  return null;
}

// ── Record intervention ─────────────────────────────────

export async function recordIntervention(
  userId: string,
  intervention: {
    trigger_type: InterventionTrigger;
    trigger_data: Record<string, unknown>;
    intervention_type: InterventionType;
    intervention_data: Record<string, unknown>;
  }
): Promise<VoiceIntervention | null> {
  const { data, error } = await supabase
    .from('voice_interventions')
    .insert({
      user_id: userId,
      trigger_type: intervention.trigger_type,
      trigger_data: intervention.trigger_data,
      intervention_type: intervention.intervention_type,
      intervention_data: intervention.intervention_data,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[passive-voice] recordIntervention error:', error);
    return null;
  }
  return mapIntervention(data as Record<string, unknown>);
}

// ── Get recent interventions ────────────────────────────

export async function getRecentInterventions(
  userId: string,
  days: number = 7
): Promise<VoiceIntervention[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await supabase
    .from('voice_interventions')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map((r) => mapIntervention(r as Record<string, unknown>));
}

// ── Acknowledge intervention ────────────────────────────

export async function acknowledgeIntervention(interventionId: string): Promise<void> {
  await supabase
    .from('voice_interventions')
    .update({ acknowledged: true })
    .eq('id', interventionId);
}
