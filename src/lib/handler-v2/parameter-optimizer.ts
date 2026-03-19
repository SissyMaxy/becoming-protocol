/**
 * Parameter Optimization Loop
 *
 * Reviews outcomes and adjusts handler_parameters.
 * Run weekly. The system that deploys on day 1 is a prototype.
 * The system on day 90 is a precision instrument.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';

/**
 * Weekly optimization pass. Reviews completion data, resistance patterns,
 * and A/B test results to adjust parameters.
 */
export async function runOptimizationPass(userId: string): Promise<string[]> {
  const params = new HandlerParameters(userId);
  const changes: string[] = [];

  // 1. Optimize avoidance push probability per domain
  const avoidanceChange = await optimizeAvoidanceProbability(userId, params);
  if (avoidanceChange) changes.push(avoidanceChange);

  // 2. Optimize domain saturation cap
  const satChange = await optimizeDomainSaturation(userId, params);
  if (satChange) changes.push(satChange);

  // 3. Optimize intensity caps based on completion rates
  const intensityChange = await optimizeIntensityCaps(userId, params);
  if (intensityChange) changes.push(intensityChange);

  // 4. Learn optimal interrupt timing
  const interruptChange = await optimizeInterruptTiming(userId, params);
  if (interruptChange) changes.push(interruptChange);

  if (changes.length > 0) {
    console.log(`[Optimizer] ${changes.length} parameter adjustments:`, changes);
  }

  return changes;
}

async function optimizeAvoidanceProbability(
  userId: string,
  params: HandlerParameters,
): Promise<string | null> {
  // Look at resistance events where avoidance was confronted
  const { data: events } = await supabase
    .from('resistance_events')
    .select('resistance_type, outcome, trigger_details')
    .eq('user_id', userId)
    .eq('resistance_type', 'anxiety_avoidance')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!events || events.length < 10) return null;

  const complied = events.filter(e => e.outcome === 'compliance' || e.outcome === 'delayed_compliance').length;
  const rate = complied / events.length;

  const current = await params.get<number>('rules.avoidance_push_probability', 0.3);

  // If compliance rate > 60%, increase push probability (she can handle it)
  // If < 30%, decrease (pushing too hard)
  let newValue = current;
  if (rate > 0.6 && current < 0.8) {
    newValue = Math.min(0.8, current + 0.1);
  } else if (rate < 0.3 && current > 0.1) {
    newValue = Math.max(0.1, current - 0.1);
  }

  if (newValue !== current) {
    await params.set('rules.avoidance_push_probability', newValue, 'handler_optimized',
      `Avoidance compliance rate ${(rate * 100).toFixed(0)}% over ${events.length} events. Adjusted ${current}→${newValue}`);
    return `avoidance_push: ${current}→${newValue} (${(rate * 100).toFixed(0)}% compliance)`;
  }
  return null;
}

async function optimizeDomainSaturation(
  userId: string,
  params: HandlerParameters,
): Promise<string | null> {
  // Check if any domain is consistently exhausted (all tasks completed) vs under-served
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: completions } = await supabase
    .from('task_completions')
    .select('task_id, task_bank(domain)')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo);

  if (!completions || completions.length < 20) return null;

  const domainCounts: Record<string, number> = {};
  for (const c of completions) {
    const domain = (c.task_bank as unknown as Record<string, unknown>)?.domain as string || 'unknown';
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  }

  const avgPerDomain = Object.values(domainCounts).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(domainCounts).length);
  const current = await params.get<number>('rules.domain_saturation_cap', 3);

  // If average daily domain completions > current cap, consider raising
  const dailyAvg = avgPerDomain / 7;
  if (dailyAvg > current * 0.9 && current < 5) {
    const newCap = current + 1;
    await params.set('rules.domain_saturation_cap', newCap, 'handler_optimized',
      `Avg ${dailyAvg.toFixed(1)} completions/day/domain approaching cap ${current}. Raised to ${newCap}`);
    return `domain_sat_cap: ${current}→${newCap}`;
  }

  return null;
}

async function optimizeIntensityCaps(
  userId: string,
  params: HandlerParameters,
): Promise<string | null> {
  // Check if high-intensity tasks are consistently completed or declined
  const { data: completions } = await supabase
    .from('task_completions')
    .select('task_id, task_bank(intensity)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!completions || completions.length < 20) return null;

  const highIntensity = completions.filter(c =>
    ((c.task_bank as unknown as Record<string, unknown>)?.intensity as number || 0) >= 4
  );

  if (highIntensity.length === 0) return null;

  const { data: skips } = await supabase
    .from('resistance_events')
    .select('trigger_details')
    .eq('user_id', userId)
    .eq('trigger_type', 'task_declined')
    .order('created_at', { ascending: false })
    .limit(20);

  const highSkips = (skips || []).filter(s =>
    ((s.trigger_details as Record<string, unknown>)?.intensity as number || 0) >= 4
  );

  // If high-intensity completions are common and skips are rare, raise base cap
  const completionRate = highIntensity.length / completions.length;
  const skipRate = highSkips.length / Math.max(1, (skips || []).length);

  if (completionRate > 0.3 && skipRate < 0.2) {
    const current = await params.get<number>('rules.intensity_cap.base', 2);
    if (current < 4) {
      const newCap = current + 1;
      await params.set('rules.intensity_cap.base', newCap, 'handler_optimized',
        `High-intensity completion rate ${(completionRate * 100).toFixed(0)}%, skip rate ${(skipRate * 100).toFixed(0)}%. Raised base to ${newCap}`);
      return `intensity_base: ${current}→${newCap}`;
    }
  }

  return null;
}

async function optimizeInterruptTiming(
  userId: string,
  params: HandlerParameters,
): Promise<string | null> {
  // Analyze when ambush/micro-task completions happen most
  const { data: ambushes } = await supabase
    .from('micro_task_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(50);

  if (!ambushes || ambushes.length < 15) return null;

  // Count completions by hour
  const hourCounts: Record<number, number> = {};
  for (const a of ambushes) {
    if (!a.completed_at) continue;
    const hour = new Date(a.completed_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  // Find top 4 hours
  const sorted = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([h]) => `${h}:00`);

  if (sorted.length >= 3) {
    const current = await params.get<string[]>('interrupts.optimal_times', []);
    if (JSON.stringify(sorted) !== JSON.stringify(current)) {
      await params.set('interrupts.optimal_times', sorted, 'handler_optimized',
        `Learned optimal interrupt times from ${ambushes.length} micro-task completions`);
      return `interrupt_times: ${sorted.join(', ')}`;
    }
  }

  return null;
}
