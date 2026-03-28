/**
 * Handler Impact Tracking
 *
 * Tracks correlations between Handler interventions and behavioral responses.
 * The Handler uses this data to learn which approaches work best in which contexts.
 *
 * Tables: handler_interventions, intervention_outcomes, handler_effectiveness
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type InterventionType =
  | 'task_assignment'
  | 'resistance_push'
  | 'comfort'
  | 'escalation'
  | 'de_escalation'
  | 'trigger_deployment'
  | 'commitment_extraction'
  | 'confrontation'
  | 'praise'
  | 'denial_extension'
  | 'content_prescription'
  | 'session_initiation'
  | 'boundary_test'
  | 'reframe'
  | 'silence';

export type OutcomeType =
  | 'compliance_shift'
  | 'arousal_shift'
  | 'resistance_change'
  | 'pattern_break'
  | 'confession'
  | 'commitment_honored'
  | 'commitment_broken'
  | 'mood_shift'
  | 'streak_maintained'
  | 'streak_broken'
  | 'session_completed'
  | 'session_refused'
  | 'depth_achieved'
  | 'trigger_response'
  | 'behavioral_change'
  | 'no_change';

export type OutcomeDirection = 'positive' | 'negative' | 'neutral';

export interface InterventionInput {
  intervention_type: InterventionType;
  handler_mode?: string;
  conversation_id?: string;
  message_index?: number;
  intervention_detail?: string;
  resistance_detected?: boolean;
  vulnerability_window?: boolean;
}

export interface OutcomeInput {
  outcome_type: OutcomeType;
  direction: OutcomeDirection;
  magnitude?: number;
  description?: string;
  evidence?: string;
  latency_minutes?: number;
}

export interface EffectivenessRow {
  intervention_type: string;
  handler_mode: string | null;
  total_uses: number;
  positive_outcomes: number;
  negative_outcomes: number;
  neutral_outcomes: number;
  avg_magnitude: number | null;
  avg_latency_minutes: number | null;
  best_denial_range: number[] | null;
  best_arousal_range: number[] | null;
  best_with_resistance: boolean | null;
  best_in_vulnerability: boolean | null;
}

// ============================================
// RECORD INTERVENTION
// ============================================

/**
 * Record a Handler intervention. Automatically pulls current state
 * (denial_day, arousal, streak, whoop) from user_state and whoop_metrics.
 */
export async function recordIntervention(
  userId: string,
  input: InterventionInput,
): Promise<string | null> {
  // Pull current state in parallel
  const [stateResult, whoopResult] = await Promise.allSettled([
    supabase
      .from('user_state')
      .select('denial_day, arousal_level, streak_days, exec_function')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('whoop_metrics')
      .select('strain, avg_hr, recovery_score')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const state =
    stateResult.status === 'fulfilled' ? stateResult.value.data : null;
  const whoop =
    whoopResult.status === 'fulfilled' ? whoopResult.value.data : null;

  const { data, error } = await supabase
    .from('handler_interventions')
    .insert({
      user_id: userId,
      intervention_type: input.intervention_type,
      handler_mode: input.handler_mode ?? null,
      conversation_id: input.conversation_id ?? null,
      message_index: input.message_index ?? null,
      intervention_detail: input.intervention_detail ?? null,
      resistance_detected: input.resistance_detected ?? false,
      vulnerability_window: input.vulnerability_window ?? false,
      denial_day: state?.denial_day ?? null,
      arousal_level: state?.arousal_level ?? null,
      streak_days: state?.streak_days ?? null,
      exec_function: state?.exec_function ?? null,
      whoop_strain: whoop?.strain ?? null,
      whoop_avg_hr: whoop?.avg_hr ?? null,
      whoop_recovery_score: whoop?.recovery_score ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[impact-tracking] recordIntervention error:', error.message);
    return null;
  }

  return data.id;
}

// ============================================
// RECORD OUTCOME
// ============================================

/**
 * Record an observed outcome linked to a specific intervention.
 */
export async function recordOutcome(
  userId: string,
  interventionId: string,
  input: OutcomeInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('intervention_outcomes')
    .insert({
      user_id: userId,
      intervention_id: interventionId,
      outcome_type: input.outcome_type,
      direction: input.direction,
      magnitude: input.magnitude ?? null,
      description: input.description ?? null,
      evidence: input.evidence ?? null,
      latency_minutes: input.latency_minutes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[impact-tracking] recordOutcome error:', error.message);
    return null;
  }

  return data.id;
}

// ============================================
// COMPUTE EFFECTIVENESS
// ============================================

/**
 * Recompute handler_effectiveness from raw intervention + outcome data.
 * Groups by (intervention_type, handler_mode), calculates aggregate stats,
 * and upserts into handler_effectiveness.
 */
export async function computeEffectiveness(userId: string): Promise<void> {
  // Fetch all interventions with their outcomes
  const { data: interventions, error: iErr } = await supabase
    .from('handler_interventions')
    .select(
      'id, intervention_type, handler_mode, denial_day, arousal_level, resistance_detected, vulnerability_window',
    )
    .eq('user_id', userId);

  if (iErr || !interventions?.length) return;

  const interventionIds = interventions.map((i) => i.id);

  const { data: outcomes, error: oErr } = await supabase
    .from('intervention_outcomes')
    .select(
      'intervention_id, direction, magnitude, latency_minutes',
    )
    .eq('user_id', userId)
    .in('intervention_id', interventionIds);

  if (oErr) return;

  // Index outcomes by intervention_id
  const outcomesByIntervention = new Map<
    string,
    Array<{ direction: string; magnitude: number | null; latency_minutes: number | null }>
  >();
  for (const o of outcomes ?? []) {
    const list = outcomesByIntervention.get(o.intervention_id) ?? [];
    list.push(o);
    outcomesByIntervention.set(o.intervention_id, list);
  }

  // Group interventions by (type, mode)
  type GroupKey = string;
  interface GroupData {
    intervention_type: string;
    handler_mode: string | null;
    total_uses: number;
    positive: number;
    negative: number;
    neutral: number;
    magnitudes: number[];
    latencies: number[];
    // Context tracking for "best" ranges
    positive_denial_days: number[];
    positive_arousal_levels: number[];
    positive_with_resistance: number;
    positive_without_resistance: number;
    positive_in_vulnerability: number;
    positive_outside_vulnerability: number;
  }

  const groups = new Map<GroupKey, GroupData>();

  for (const intervention of interventions) {
    const key = `${intervention.intervention_type}::${intervention.handler_mode ?? '__null__'}`;

    if (!groups.has(key)) {
      groups.set(key, {
        intervention_type: intervention.intervention_type,
        handler_mode: intervention.handler_mode,
        total_uses: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        magnitudes: [],
        latencies: [],
        positive_denial_days: [],
        positive_arousal_levels: [],
        positive_with_resistance: 0,
        positive_without_resistance: 0,
        positive_in_vulnerability: 0,
        positive_outside_vulnerability: 0,
      });
    }

    const g = groups.get(key)!;
    g.total_uses++;

    const iOutcomes = outcomesByIntervention.get(intervention.id) ?? [];
    for (const o of iOutcomes) {
      if (o.direction === 'positive') {
        g.positive++;
        if (intervention.denial_day != null) g.positive_denial_days.push(intervention.denial_day);
        if (intervention.arousal_level != null) g.positive_arousal_levels.push(intervention.arousal_level);
        if (intervention.resistance_detected) g.positive_with_resistance++;
        else g.positive_without_resistance++;
        if (intervention.vulnerability_window) g.positive_in_vulnerability++;
        else g.positive_outside_vulnerability++;
      } else if (o.direction === 'negative') {
        g.negative++;
      } else {
        g.neutral++;
      }
      if (o.magnitude != null) g.magnitudes.push(o.magnitude);
      if (o.latency_minutes != null) g.latencies.push(o.latency_minutes);
    }
  }

  // Upsert each group into handler_effectiveness
  for (const g of groups.values()) {
    const avgMag =
      g.magnitudes.length > 0
        ? g.magnitudes.reduce((a, b) => a + b, 0) / g.magnitudes.length
        : null;
    const avgLat =
      g.latencies.length > 0
        ? g.latencies.reduce((a, b) => a + b, 0) / g.latencies.length
        : null;

    // Compute best ranges from positive-outcome interventions
    const bestDenialRange = computeRange(g.positive_denial_days);
    const bestArousalRange = computeRange(g.positive_arousal_levels);
    const bestWithResistance =
      g.positive_with_resistance + g.positive_without_resistance > 0
        ? g.positive_with_resistance > g.positive_without_resistance
        : null;
    const bestInVulnerability =
      g.positive_in_vulnerability + g.positive_outside_vulnerability > 0
        ? g.positive_in_vulnerability > g.positive_outside_vulnerability
        : null;

    await supabase.from('handler_effectiveness').upsert(
      {
        user_id: userId,
        intervention_type: g.intervention_type,
        handler_mode: g.handler_mode,
        total_uses: g.total_uses,
        positive_outcomes: g.positive,
        negative_outcomes: g.negative,
        neutral_outcomes: g.neutral,
        avg_magnitude: avgMag,
        avg_latency_minutes: avgLat,
        best_denial_range: bestDenialRange,
        best_arousal_range: bestArousalRange,
        best_with_resistance: bestWithResistance,
        best_in_vulnerability: bestInVulnerability,
        last_computed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,intervention_type,handler_mode' },
    );
  }
}

/** Compute [min, max] from an array of numbers. Returns null if empty. */
function computeRange(values: number[]): number[] | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Use 10th/90th percentile to exclude outliers
  const lo = sorted[Math.floor(sorted.length * 0.1)];
  const hi = sorted[Math.floor(sorted.length * 0.9)];
  return [lo, hi];
}

// ============================================
// GET EFFECTIVENESS PROFILE
// ============================================

/**
 * Returns the full effectiveness profile for decision-making.
 * Sorted by positive outcome rate descending.
 */
export async function getEffectivenessProfile(
  userId: string,
): Promise<EffectivenessRow[]> {
  const { data, error } = await supabase
    .from('handler_effectiveness')
    .select('*')
    .eq('user_id', userId)
    .order('positive_outcomes', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    intervention_type: row.intervention_type,
    handler_mode: row.handler_mode,
    total_uses: row.total_uses,
    positive_outcomes: row.positive_outcomes,
    negative_outcomes: row.negative_outcomes,
    neutral_outcomes: row.neutral_outcomes,
    avg_magnitude: row.avg_magnitude,
    avg_latency_minutes: row.avg_latency_minutes,
    best_denial_range: row.best_denial_range,
    best_arousal_range: row.best_arousal_range,
    best_with_resistance: row.best_with_resistance,
    best_in_vulnerability: row.best_in_vulnerability,
  }));
}

// ============================================
// BUILD IMPACT CONTEXT (for Handler prompt)
// ============================================

/**
 * Builds a formatted context block for the Handler system prompt.
 * Shows: top performers, mode-context insights, approaches to avoid.
 */
export async function buildImpactContext(userId: string): Promise<string> {
  const profile = await getEffectivenessProfile(userId);
  if (profile.length === 0) return '';

  const lines: string[] = ['## Handler Impact Intelligence'];

  // --- Top performers (positive rate >= 60%, min 3 uses)
  const qualified = profile.filter((r) => r.total_uses >= 3);
  const withRates = qualified.map((r) => {
    const totalOutcomes = r.positive_outcomes + r.negative_outcomes + r.neutral_outcomes;
    const positiveRate = totalOutcomes > 0 ? r.positive_outcomes / totalOutcomes : 0;
    const negativeRate = totalOutcomes > 0 ? r.negative_outcomes / totalOutcomes : 0;
    return { ...r, positiveRate, negativeRate, totalOutcomes };
  });

  const top = withRates
    .filter((r) => r.positiveRate >= 0.6)
    .sort((a, b) => b.positiveRate - a.positiveRate)
    .slice(0, 5);

  if (top.length > 0) {
    lines.push('');
    lines.push('### High-Effectiveness Interventions');
    for (const r of top) {
      const mode = r.handler_mode ? ` (${r.handler_mode})` : '';
      const pct = (r.positiveRate * 100).toFixed(0);
      const mag = r.avg_magnitude != null ? `, avg magnitude ${r.avg_magnitude.toFixed(2)}` : '';
      const ctx: string[] = [];
      if (r.best_denial_range) ctx.push(`denial d${r.best_denial_range[0]}-${r.best_denial_range[1]}`);
      if (r.best_arousal_range) ctx.push(`arousal ${r.best_arousal_range[0]}-${r.best_arousal_range[1]}`);
      if (r.best_with_resistance) ctx.push('with resistance');
      if (r.best_in_vulnerability) ctx.push('in vulnerability window');
      const ctxStr = ctx.length > 0 ? ` | best when: ${ctx.join(', ')}` : '';
      lines.push(`- ${r.intervention_type}${mode}: ${pct}% positive (${r.total_uses} uses${mag})${ctxStr}`);
    }
  }

  // --- Avoid list (negative rate >= 50%, min 3 uses)
  const avoid = withRates
    .filter((r) => r.negativeRate >= 0.5)
    .sort((a, b) => b.negativeRate - a.negativeRate)
    .slice(0, 5);

  if (avoid.length > 0) {
    lines.push('');
    lines.push('### Approaches to Avoid / Reconsider');
    for (const r of avoid) {
      const mode = r.handler_mode ? ` (${r.handler_mode})` : '';
      const pct = (r.negativeRate * 100).toFixed(0);
      lines.push(`- ${r.intervention_type}${mode}: ${pct}% negative outcomes (${r.total_uses} uses) — reconsider or change context`);
    }
  }

  // --- Mode effectiveness summary
  const modeMap = new Map<string, { positive: number; negative: number; neutral: number }>();
  for (const r of profile) {
    const mode = r.handler_mode ?? 'unknown';
    const existing = modeMap.get(mode) ?? { positive: 0, negative: 0, neutral: 0 };
    existing.positive += r.positive_outcomes;
    existing.negative += r.negative_outcomes;
    existing.neutral += r.neutral_outcomes;
    modeMap.set(mode, existing);
  }

  const modeEntries = [...modeMap.entries()]
    .map(([mode, counts]) => {
      const total = counts.positive + counts.negative + counts.neutral;
      const rate = total > 0 ? counts.positive / total : 0;
      return { mode, rate, total };
    })
    .filter((m) => m.total >= 3)
    .sort((a, b) => b.rate - a.rate);

  if (modeEntries.length > 1) {
    lines.push('');
    lines.push('### Mode Effectiveness');
    for (const m of modeEntries) {
      lines.push(`- ${m.mode}: ${(m.rate * 100).toFixed(0)}% positive (${m.total} outcomes)`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
}
