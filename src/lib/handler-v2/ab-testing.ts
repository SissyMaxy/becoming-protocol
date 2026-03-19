/**
 * A/B Testing Engine
 *
 * Generates alternative variants for Handler outputs, serves one randomly,
 * tracks which produces better compliance outcomes.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';
import { invokeWithAuth } from '../handler-ai';

/**
 * Optionally A/B test a Handler output.
 * Returns the output to serve (may be original or alternative).
 */
export async function maybeABTest(
  userId: string,
  testType: string,
  primaryOutput: string,
  state: { denialDay?: number; arousal?: number; timeOfDay?: string },
  params: HandlerParameters,
): Promise<{ output: string; testId?: string }> {
  const enabled = await params.get<boolean>('ab_testing.enabled', true);
  if (!enabled) return { output: primaryOutput };

  // Only A/B test 30% of the time to keep costs reasonable
  if (Math.random() > 0.3) return { output: primaryOutput };

  // Generate alternative via Handler AI
  const { data, error } = await invokeWithAuth('handler-ai', {
    action: 'generate',
    userPrompt: `You generated this ${testType}: "${primaryOutput}"\n\nGenerate an ALTERNATIVE version with a different tone or approach. Same information, different delivery. Output ONLY the alternative text.`,
    maxTokens: 200,
  });

  if (error || !data) return { output: primaryOutput };

  const variantB = typeof data === 'string'
    ? data
    : (data as Record<string, unknown>)?.response as string || primaryOutput;

  // Randomly serve A or B
  const served = Math.random() < 0.5 ? 'A' : 'B';

  const { data: testRow } = await supabase.from('ab_tests').insert({
    user_id: userId,
    test_type: testType,
    variant_a: primaryOutput,
    variant_b: variantB,
    served_variant: served,
    state_at_test: state,
  }).select('id').maybeSingle();

  return {
    output: served === 'A' ? primaryOutput : variantB,
    testId: testRow?.id,
  };
}

/**
 * Record the outcome of an A/B test.
 */
export async function recordABOutcome(
  testId: string,
  outcomeMetric: string,
  outcomeValue: boolean,
): Promise<void> {
  await supabase.from('ab_tests').update({
    outcome_metric: outcomeMetric,
    outcome_value: outcomeValue,
    outcome_measured_at: new Date().toISOString(),
  }).eq('id', testId);
}

/**
 * Analyze A/B test results and write winning strategies to memory.
 * Run weekly.
 */
export async function analyzeABResults(userId: string): Promise<string[]> {
  const { data: tests } = await supabase
    .from('ab_tests')
    .select('*')
    .eq('user_id', userId)
    .not('outcome_value', 'is', null);

  if (!tests || tests.length < 10) return [];

  const byType: Record<string, { a_wins: number; b_wins: number; a_total: number; b_total: number }> = {};

  for (const t of tests) {
    if (!byType[t.test_type]) byType[t.test_type] = { a_wins: 0, b_wins: 0, a_total: 0, b_total: 0 };
    const b = byType[t.test_type];

    if (t.served_variant === 'A') {
      b.a_total++;
      if (t.outcome_value) b.a_wins++;
    } else {
      b.b_total++;
      if (t.outcome_value) b.b_wins++;
    }
  }

  const insights: string[] = [];

  for (const [type, scores] of Object.entries(byType)) {
    if (scores.a_total + scores.b_total < 20) continue;

    const aRate = scores.a_total > 0 ? scores.a_wins / scores.a_total : 0;
    const bRate = scores.b_total > 0 ? scores.b_wins / scores.b_total : 0;

    if (Math.abs(aRate - bRate) > 0.15) {
      const winner = aRate > bRate ? 'primary' : 'alternative';
      const rate = Math.round(Math.max(aRate, bRate) * 100);
      insights.push(`${type}: ${winner} tone wins at ${rate}% over ${scores.a_total + scores.b_total} samples`);
    }
  }

  return insights;
}
