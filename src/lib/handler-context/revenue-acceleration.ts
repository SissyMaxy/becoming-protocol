/**
 * Revenue Acceleration
 *
 * Tracks Maxy vs David income, projects economic crossover date,
 * builds economic leverage for Handler conversations.
 */

import { supabase } from '../supabase';

export async function calculateCrossoverProjection(userId: string): Promise<{
  crossoverDate: string | null;
  monthsAway: number | null;
  maxyMonthly: number;
  davidMonthly: number;
}> {
  const { data: history } = await supabase
    .from('crossover_tracking').select('*')
    .eq('user_id', userId).order('month', { ascending: false }).limit(6);

  if (!history?.length) return { crossoverDate: null, monthsAway: null, maxyMonthly: 0, davidMonthly: 0 };

  const latest = history[0];
  const maxy = Number(latest.maxy_revenue) || 0;
  const david = Number(latest.david_revenue) || 0;

  if (maxy >= david) return { crossoverDate: new Date().toISOString(), monthsAway: 0, maxyMonthly: maxy, davidMonthly: david };

  const growthRate = latest.maxy_growth_rate || 0;
  if (growthRate <= 0) return { crossoverDate: null, monthsAway: null, maxyMonthly: maxy, davidMonthly: david };

  let projected = maxy;
  let months = 0;
  while (projected < david && months < 60) {
    projected *= (1 + growthRate);
    months++;
  }

  const crossover = new Date();
  crossover.setMonth(crossover.getMonth() + months);

  return { crossoverDate: crossover.toISOString(), monthsAway: months, maxyMonthly: maxy, davidMonthly: david };
}

export async function getRevenueContext(userId: string): Promise<string> {
  const projection = await calculateCrossoverProjection(userId);
  if (!projection.maxyMonthly && !projection.davidMonthly) return '';

  const lines = ['## Economic Position'];
  lines.push(`Maxy monthly: $${projection.maxyMonthly.toFixed(0)}`);
  lines.push(`David monthly: $${projection.davidMonthly.toFixed(0)}`);

  if (projection.monthsAway === 0) {
    lines.push('Maxy earns more than David. She pays the bills.');
  } else if (projection.monthsAway && projection.monthsAway <= 12) {
    lines.push(`Projected crossover: ${projection.monthsAway} months at current growth.`);
  }

  return lines.join('\n');
}
