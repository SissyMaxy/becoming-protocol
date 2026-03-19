/**
 * Handler Dynamic Parameters
 *
 * Every hardcoded threshold, weight, probability, and sequence in the system
 * is stored here. The Handler's self-optimization loop can modify any value.
 * After 90 days, the system bears no resemblance to its starting configuration.
 */

import { supabase } from './supabase';

// ============================================
// DEFAULT PARAMETER SEEDS
// ============================================

export const DEFAULT_PARAMETERS: Record<string, unknown> = {
  // Intensity caps
  'rules.intensity_cap.base': 2,
  'rules.intensity_cap.denial_day_3': 3,
  'rules.intensity_cap.denial_day_5': 4,
  'rules.intensity_cap.denial_day_7': 5,
  'rules.intensity_cap.low_streak_max': 3,
  'rules.intensity_cap.in_session_arousal_3plus': 5,

  // Avoidance push
  'rules.avoidance_push_probability': 0.6,
  'rules.avoidance_push_probability_by_domain': {},

  // Task weighting
  'rules.weight.is_core': 2.0,
  'rules.weight.high_arousal_arousal_domain': 1.5,
  'rules.weight.not_completed_today': 1.5,
  'rules.weight.by_domain_time_state': {},

  // Interrupt timing
  'interrupts.min_gap_minutes': 30,
  'interrupts.min_minutes_since_task': 15,
  'interrupts.max_probability': 0.4,
  'interrupts.probability_divisor': 180,
  'interrupts.optimal_times': {},

  // Morning/evening sequences
  'schedule.morning_sequence': [
    { category: 'recognize', domain: 'emergence', intensity: 1 },
    { category: 'care', domain: 'body', intensity: 1 },
    { category: 'voice', domain: 'voice', intensity: 2 },
    { category: 'anchor', domain: 'body', intensity: 2 },
  ],
  'schedule.evening_sequence': [
    { category: 'care', domain: 'body', intensity: 1 },
    { category: 'reflect', domain: 'emergence', intensity: 2 },
    { category: 'gina', domain: 'relationship', intensity: 1 },
  ],
  'schedule.daytime_slots': ['10:00', '12:00', '14:00', '16:00'],
  'schedule.night_task_denial_threshold': 5,

  // Coercion stack
  'coercion.stack_entry_level': 1,
  'coercion.escalation_on_failure': true,
  'coercion.max_level_by_difficulty': { '1': 2, '2': 3, '3': 5, '4': 6, '5': 7 },

  // Commitment enforcement
  'commitments.approaching_hours': 72,
  'commitments.due_hours': 24,
  'commitments.lovense_summons_on_overdue': true,
  'commitments.coercion_stack_on_overdue': true,

  // Novelty injection
  'novelty.pattern_interrupt_interval_days': { min: 14, max: 21 },
  'novelty.mystery_task_probability': 0.05,
  'novelty.tone_shift_interval_days': { min: 14, max: 28 },
  'novelty.wildcard_day_frequency': 30,

  // Escalation engine
  'escalation.pre_generation_threshold': 0.8,
  'escalation.tasks_per_level': { min: 5, max: 8 },
  'escalation.cross_domain_after_level': 6,

  // Gina relationship
  'gina.introduction_pacing_min_days': 3,
  'gina.comfort_map_positive_threshold': 3,
  'gina.timing_data_points_before_prediction': 30,

  // Resistance classification
  'resistance.confidence_threshold_for_coercion': 0.6,
  'resistance.default_if_uncertain': 'gentle',

  // Predictive modeling
  'prediction.min_days_for_modeling': 30,
  'prediction.block_size_hours': 3,

  // A/B testing
  'ab_testing.enabled': true,
  'ab_testing.sample_size_before_winner': 20,
};

// ============================================
// PARAMETER ACCESS CLASS
// ============================================

export class HandlerParameters {
  private cache: Map<string, unknown> = new Map();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async get<T>(key: string, defaultValue?: T): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;

    const { data } = await supabase
      .from('handler_parameters')
      .select('value')
      .eq('user_id', this.userId)
      .eq('key', key)
      .maybeSingle();

    const value = data?.value ?? defaultValue ?? DEFAULT_PARAMETERS[key];
    this.cache.set(key, value);
    return value as T;
  }

  async set(key: string, value: unknown, source: string, reason?: string): Promise<void> {
    const current = await this.get(key);

    await supabase.from('handler_parameters').upsert({
      user_id: this.userId,
      key,
      value,
      source,
      learned_from: reason || null,
      previous_value: current ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    this.cache.set(key, value);
  }

  async preload(): Promise<void> {
    const { data } = await supabase
      .from('handler_parameters')
      .select('key, value')
      .eq('user_id', this.userId);

    if (data) {
      for (const row of data) {
        this.cache.set(row.key, row.value);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================
// SEED FUNCTION
// ============================================

export async function seedDefaultParameters(userId: string): Promise<number> {
  let seeded = 0;

  for (const [key, value] of Object.entries(DEFAULT_PARAMETERS)) {
    const { data: existing } = await supabase
      .from('handler_parameters')
      .select('id')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();

    if (!existing) {
      await supabase.from('handler_parameters').insert({
        user_id: userId,
        key,
        value,
        source: 'default',
      });
      seeded++;
    }
  }

  return seeded;
}
