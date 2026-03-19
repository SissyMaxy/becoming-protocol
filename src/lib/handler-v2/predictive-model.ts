/**
 * Predictive State Modeling
 *
 * After 30+ days of data, predicts each day's state before Maxy reports.
 * Pre-stages interventions and adapts prescriptions proactively.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';
import { invokeWithAuth } from '../handler-ai';

const TIME_BLOCKS = ['06-09', '09-12', '12-15', '15-18', '18-21', '21-00'] as const;

/**
 * Generate predictions for tomorrow's time blocks.
 * Should run overnight after the evening debrief.
 */
export async function generatePredictions(
  userId: string,
  params: HandlerParameters,
): Promise<number> {
  const minDays = await params.get<number>('prediction.min_days_for_modeling', 30);

  // Check if enough history exists
  const { count } = await supabase
    .from('task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count || 0) < minDays) {
    console.log(`[Prediction] Only ${count} data points, need ${minDays}. Skipping.`);
    return 0;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayOfWeek = days[tomorrow.getDay()];

  // Gather historical patterns
  const { data: recentCompletions } = await supabase
    .from('task_completions')
    .select('created_at, felt_good, points_earned')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: recentMoods } = await supabase
    .from('mood_checkins')
    .select('score, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(30);

  const { data: whoopTrend } = await supabase
    .from('whoop_metrics')
    .select('date, recovery_score, sleep_performance_percentage, day_strain')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(7);

  const { data: recentResistance } = await supabase
    .from('resistance_events')
    .select('resistance_type, trigger_type, outcome, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Build compact summary for AI
  const completionsByHour: Record<number, number> = {};
  for (const c of recentCompletions || []) {
    const hour = new Date(c.created_at).getHours();
    completionsByHour[hour] = (completionsByHour[hour] || 0) + 1;
  }

  const avgMood = recentMoods && recentMoods.length > 0
    ? recentMoods.reduce((s, m) => s + m.score, 0) / recentMoods.length
    : 5;

  const prompt = `Predict state for each time block tomorrow (${dayOfWeek}, ${tomorrowStr}).

Completion pattern by hour: ${JSON.stringify(completionsByHour)}
Average mood (last 30): ${avgMood.toFixed(1)}
Whoop trend (last 7 days): ${JSON.stringify(whoopTrend?.map(w => ({ recovery: w.recovery_score, sleep: w.sleep_performance_percentage })) || [])}
Recent resistance: ${JSON.stringify(recentResistance?.map(r => r.resistance_type) || [])}

For each block (${TIME_BLOCKS.join(', ')}), return:
{"time_block":"string","predicted_mood":number,"predicted_energy":"high|medium|low|depleted","predicted_engagement":"high|medium|low","predicted_resistance_risk":number,"suggested_handler_mode":"string","suggested_intensity_cap":number}

Return JSON array of 6 objects.`;

  const { data, error } = await invokeWithAuth('handler-ai', {
    action: 'generate',
    userPrompt: prompt,
    maxTokens: 1000,
  });

  if (error || !data) {
    console.error('[Prediction] AI call failed:', error?.message);
    return 0;
  }

  let predictions: Array<Record<string, unknown>> = [];
  try {
    const text = typeof data === 'string' ? data : (data as Record<string, unknown>)?.response as string || '';
    predictions = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  } catch {
    console.error('[Prediction] Parse failed');
    return 0;
  }

  let inserted = 0;
  for (let i = 0; i < Math.min(predictions.length, 6); i++) {
    const p = predictions[i];
    const { error: dbErr } = await supabase.from('state_predictions').upsert({
      user_id: userId,
      prediction_date: tomorrowStr,
      time_block: TIME_BLOCKS[i],
      predicted_mood: p.predicted_mood as number,
      predicted_energy: p.predicted_energy as string,
      predicted_engagement: p.predicted_engagement as string,
      predicted_resistance_risk: p.predicted_resistance_risk as number,
      suggested_handler_mode: p.suggested_handler_mode as string,
      suggested_intensity_cap: p.suggested_intensity_cap as number,
      prediction_features: { day_of_week: dayOfWeek, avg_mood: avgMood },
      confidence: 0.6,
    }, { onConflict: 'user_id,prediction_date,time_block' });

    if (!dbErr) inserted++;
  }

  console.log(`[Prediction] Generated ${inserted} predictions for ${tomorrowStr}`);
  return inserted;
}

/**
 * Get today's prediction for the current time block.
 */
export async function getCurrentPrediction(userId: string): Promise<{
  predictedMood?: number;
  predictedEnergy?: string;
  predictedEngagement?: string;
  resistanceRisk?: number;
  suggestedMode?: string;
  suggestedIntensityCap?: number;
} | null> {
  const today = new Date().toISOString().split('T')[0];
  const hour = new Date().getHours();
  const blockIndex = Math.max(0, Math.min(5, Math.floor((hour - 6) / 3)));
  const timeBlock = TIME_BLOCKS[blockIndex] || TIME_BLOCKS[0];

  const { data } = await supabase
    .from('state_predictions')
    .select('*')
    .eq('user_id', userId)
    .eq('prediction_date', today)
    .eq('time_block', timeBlock)
    .maybeSingle();

  if (!data) return null;

  return {
    predictedMood: data.predicted_mood,
    predictedEnergy: data.predicted_energy,
    predictedEngagement: data.predicted_engagement,
    resistanceRisk: data.predicted_resistance_risk,
    suggestedMode: data.suggested_handler_mode,
    suggestedIntensityCap: data.suggested_intensity_cap,
  };
}
