/**
 * Resistance Classification Engine
 *
 * When Maxy declines a task or engagement drops, classify WHY in real-time.
 * Each resistance type requires a completely different intervention.
 */

import { supabase } from '../supabase';
import type { UserState } from './types';

export interface ClassificationResult {
  type: string;
  confidence: number;
  signals: string[];
  suggestedStrategy: string;
}

export async function classifyResistance(
  state: UserState,
  trigger: { type: string; details: Record<string, unknown> },
  whoopRecovery?: number | null,
  whoopSleep?: number | null,
): Promise<ClassificationResult> {
  const signals: string[] = [];
  const scores: Record<string, number> = {
    adhd_paralysis: 0,
    anxiety_avoidance: 0,
    depressive_inertia: 0,
    shame_spiral: 0,
    genuine_distress: 0,
    satiation: 0,
  };

  // Time-based signals
  const hour = new Date().getHours();
  if (hour >= 8 && hour <= 10) {
    scores.depressive_inertia += 0.15;
    signals.push('morning_resistance');
  }
  if (hour >= 22) {
    scores.adhd_paralysis += 0.1;
    signals.push('late_night_depletion');
  }

  // Whoop signals
  if (whoopRecovery != null) {
    if (whoopRecovery < 34) {
      scores.genuine_distress += 0.25;
      scores.depressive_inertia += 0.2;
      signals.push(`red_recovery_${whoopRecovery}`);
    } else if (whoopRecovery >= 67) {
      scores.adhd_paralysis += 0.2;
      signals.push(`green_recovery_${whoopRecovery}`);
    }
  }

  if (whoopSleep != null && whoopSleep < 60) {
    scores.genuine_distress += 0.15;
    signals.push(`poor_sleep_${whoopSleep}`);
  }

  // Domain-specific signals
  const domain = trigger.details?.domain as string | undefined;
  if (domain) {
    if (['voice', 'intimate', 'social'].includes(domain)) {
      scores.shame_spiral += 0.15;
      signals.push(`shame_adjacent_domain_${domain}`);
    }

    // Check for known avoidance patterns
    if (state.avoidedDomains?.includes(domain)) {
      scores.anxiety_avoidance += 0.2;
      signals.push(`known_avoidance_domain_${domain}`);
    }
  }

  // Streak/engagement signals
  if (state.streakDays === 0) {
    scores.depressive_inertia += 0.15;
    signals.push('broken_streak');
  }

  if (state.tasksCompletedToday === 0 && state.timeOfDay !== 'morning') {
    scores.depressive_inertia += 0.2;
    signals.push('zero_tasks_midday');
  }

  // Denial day signals
  if (state.denialDay <= 1) {
    scores.satiation += 0.3;
    signals.push(`post_release_day_${state.denialDay}`);
  }

  // Select highest-scoring classification
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topType = sorted[0][0];
  const confidence = Math.min(1, sorted[0][1]);

  // Strategy selection
  const strategies: Record<string, string> = {
    adhd_paralysis: 'micro_task_with_device_summons',
    anxiety_avoidance: 'reduce_scope_increase_certainty',
    depressive_inertia: 'minimum_viable_engagement',
    shame_spiral: 'identity_reframing_evidence_anchor',
    genuine_distress: 'caretaker_mode_no_pressure',
    satiation: 'light_day_passive_anchors',
  };

  const strategy = confidence >= 0.6
    ? strategies[topType] || 'gentle'
    : 'gentle';

  return { type: topType, confidence, signals, suggestedStrategy: strategy };
}

/**
 * Log a resistance event to the database.
 */
export async function logResistanceEvent(
  userId: string,
  classification: ClassificationResult,
  trigger: { type: string; details: Record<string, unknown> },
  state: UserState,
  whoopData?: Record<string, unknown>,
): Promise<void> {
  await supabase.from('resistance_events').insert({
    user_id: userId,
    trigger_type: trigger.type,
    trigger_details: trigger.details,
    resistance_type: classification.type,
    classification_confidence: classification.confidence,
    classification_signals: classification.signals,
    intervention_strategy: classification.suggestedStrategy,
    state_at_event: {
      denial_day: state.denialDay,
      streak: state.streakDays,
      arousal: state.currentArousal,
      time_of_day: state.timeOfDay,
      tasks_today: state.tasksCompletedToday,
    },
    whoop_at_event: whoopData || null,
  });
}
