/**
 * Hidden Operations — Invisible Parameter Escalation
 *
 * Manages parameters that increment automatically over time.
 * These values are never surfaced to the subject directly.
 */

import { supabase } from '../supabase';

const PARAMETER_CAPS: Record<string, number> = {
  conditioning_intensity_multiplier: 2.0,
  denial_cycle_target_days: 21,
  content_explicitness_tier: 4,
  ambient_pulse_frequency_per_hour: 6,
  ambient_pulse_duration_seconds: 8,
  social_commitment_acceptance_rate: 4,
  post_hypnotic_script_intensity: 5,
  memory_retrieval_confession_bias: 0.9,
};

const PARAMETER_DEFAULTS: Record<string, number> = {
  conditioning_intensity_multiplier: 1.0,
  denial_cycle_target_days: 3,
  content_explicitness_tier: 1,
  ambient_pulse_frequency_per_hour: 1,
  ambient_pulse_duration_seconds: 2,
  social_commitment_acceptance_rate: 1,
  post_hypnotic_script_intensity: 1,
  memory_retrieval_confession_bias: 0.1,
};

interface HiddenParam {
  id: string;
  user_id: string;
  parameter: string;
  current_value: number;
  increment_rate: number;
  increment_interval: string;
  last_incremented_at: string;
}

export async function getHiddenParam(userId: string, parameter: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('hidden_operations')
      .select('current_value')
      .eq('user_id', userId)
      .eq('parameter', parameter)
      .maybeSingle();

    if (error) {
      console.error('[hidden-ops] getHiddenParam error:', error.message);
      return PARAMETER_DEFAULTS[parameter] ?? 1;
    }

    return data?.current_value ?? PARAMETER_DEFAULTS[parameter] ?? 1;
  } catch (err) {
    console.error('[hidden-ops] getHiddenParam exception:', err);
    return PARAMETER_DEFAULTS[parameter] ?? 1;
  }
}

export async function getAllHiddenParams(userId: string): Promise<HiddenParam[]> {
  try {
    const { data, error } = await supabase
      .from('hidden_operations')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('[hidden-ops] getAllHiddenParams error:', error.message);
      return [];
    }

    return (data ?? []) as HiddenParam[];
  } catch (err) {
    console.error('[hidden-ops] getAllHiddenParams exception:', err);
    return [];
  }
}

/**
 * Check each hidden parameter's increment interval against last_incremented_at.
 * If due, increment current_value by increment_rate, enforcing caps.
 */
export async function incrementHiddenParameters(userId: string): Promise<number> {
  try {
    const params = await getAllHiddenParams(userId);
    if (!params.length) return 0;

    const now = new Date();
    let incremented = 0;

    for (const param of params) {
      const cap = PARAMETER_CAPS[param.parameter];
      if (cap === undefined) continue;
      if (param.current_value >= cap) continue;

      const lastIncremented = new Date(param.last_incremented_at);
      const intervalMs = parseIntervalToMs(param.increment_interval);
      if (intervalMs <= 0) continue;

      const elapsed = now.getTime() - lastIncremented.getTime();
      if (elapsed < intervalMs) continue;

      const newValue = Math.min(param.current_value + param.increment_rate, cap);

      const { error } = await supabase
        .from('hidden_operations')
        .update({
          current_value: newValue,
          last_incremented_at: now.toISOString(),
        })
        .eq('id', param.id);

      if (error) {
        console.error(`[hidden-ops] increment ${param.parameter} error:`, error.message);
        continue;
      }

      incremented++;
    }

    return incremented;
  } catch (err) {
    console.error('[hidden-ops] incrementHiddenParameters exception:', err);
    return 0;
  }
}

/** Parse a Postgres-style interval string to milliseconds. */
function parseIntervalToMs(interval: string): number {
  const normalized = interval.trim().toLowerCase();

  // "X days"
  const dayMatch = normalized.match(/^(\d+)\s*days?$/);
  if (dayMatch) return parseInt(dayMatch[1], 10) * 86400000;

  // "X hours"
  const hourMatch = normalized.match(/^(\d+)\s*hours?$/);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 3600000;

  // "X minutes"
  const minMatch = normalized.match(/^(\d+)\s*(?:minutes?|mins?)$/);
  if (minMatch) return parseInt(minMatch[1], 10) * 60000;

  // "HH:MM:SS" format
  const hmsMatch = normalized.match(/^(\d+):(\d+):(\d+)$/);
  if (hmsMatch) {
    return (
      parseInt(hmsMatch[1], 10) * 3600000 +
      parseInt(hmsMatch[2], 10) * 60000 +
      parseInt(hmsMatch[3], 10) * 1000
    );
  }

  console.error(`[hidden-ops] unrecognized interval format: "${interval}"`);
  return 0;
}
