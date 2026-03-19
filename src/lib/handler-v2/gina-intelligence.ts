/**
 * Gina Relationship Intelligence System
 *
 * Tracks introductions, reactions, timing patterns, and disclosure readiness.
 * Helps Maxy be a proactive, emotionally intelligent partner.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';

// ============================================
// COMFORT MAP
// ============================================

export async function logGinaReaction(
  userId: string,
  channel: string,
  introduction: string,
  reaction: 'positive' | 'neutral' | 'negative' | 'curious',
  detail?: string,
  ginaInitiated?: boolean,
): Promise<void> {
  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  await supabase.from('gina_comfort_map').insert({
    user_id: userId,
    channel,
    introduction,
    reaction,
    reaction_detail: detail || null,
    gina_initiated: ginaInitiated || false,
    day_of_week: days[now.getDay()],
    time_of_day: timeOfDay,
  });
}

// ============================================
// INTRODUCTION PACING
// ============================================

export async function getNextIntroduction(
  userId: string,
  params: HandlerParameters,
): Promise<{ channel: string; suggestion: string } | null> {
  const minDays = await params.get<number>('gina.introduction_pacing_min_days', 3);
  const positiveThreshold = await params.get<number>('gina.comfort_map_positive_threshold', 3);

  const { data: recent } = await supabase
    .from('gina_comfort_map')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!recent || recent.length === 0) return null;

  // Check spacing
  const daysSinceLast = (Date.now() - new Date(recent[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLast < minDays) return null;

  // Score channels
  const channelScores: Record<string, { positive: number; negative: number }> = {};
  for (const r of recent) {
    if (!channelScores[r.channel]) channelScores[r.channel] = { positive: 0, negative: 0 };
    if (r.reaction === 'positive' || r.reaction === 'curious') channelScores[r.channel].positive++;
    if (r.reaction === 'negative') channelScores[r.channel].negative++;
  }

  // Advance positive channels, skip negative ones
  const safe = Object.entries(channelScores)
    .filter(([, s]) => s.negative === 0)
    .sort((a, b) => b[1].positive - a[1].positive);

  if (safe.length > 0 && safe[0][1].positive >= positiveThreshold) {
    return { channel: safe[0][0], suggestion: `advance_${safe[0][0]}` };
  }

  // Try untried channels
  const allChannels = ['skincare', 'clothing', 'scent', 'products', 'shared_activities', 'environment', 'domestic'];
  const untried = allChannels.filter(c => !channelScores[c]);
  if (untried.length > 0) {
    return { channel: untried[0], suggestion: `introduce_${untried[0]}` };
  }

  return null;
}

// ============================================
// TIMING INTELLIGENCE
// ============================================

export async function getGinaReceptivity(
  userId: string,
): Promise<'high' | 'medium' | 'low' | 'unknown'> {
  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayOfWeek = days[now.getDay()];
  const hour = now.getHours();
  const timeBlock = hour < 9 ? 'morning' : hour < 12 ? 'midday' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  const { data } = await supabase
    .from('gina_timing_data')
    .select('receptivity_score, sample_count')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .eq('time_block', timeBlock)
    .maybeSingle();

  if (!data || data.sample_count < 3) return 'unknown';
  if (data.receptivity_score >= 0.7) return 'high';
  if (data.receptivity_score >= 0.4) return 'medium';
  return 'low';
}

export async function updateTimingIntelligence(userId: string): Promise<void> {
  const { data: reactions } = await supabase
    .from('gina_comfort_map')
    .select('reaction, day_of_week, time_of_day')
    .eq('user_id', userId);

  if (!reactions || reactions.length < 10) return;

  const scores: Record<string, { positive: number; total: number }> = {};
  for (const r of reactions) {
    if (!r.day_of_week || !r.time_of_day) continue;
    const key = `${r.day_of_week}__${r.time_of_day}`;
    if (!scores[key]) scores[key] = { positive: 0, total: 0 };
    scores[key].total++;
    if (r.reaction === 'positive' || r.reaction === 'curious') scores[key].positive++;
  }

  for (const [key, score] of Object.entries(scores)) {
    const [dayOfWeek, timeBlock] = key.split('__');
    await supabase.from('gina_timing_data').upsert({
      user_id: userId,
      day_of_week: dayOfWeek,
      time_block: timeBlock,
      receptivity_score: score.total > 0 ? score.positive / score.total : 0.5,
      sample_count: score.total,
    }, { onConflict: 'user_id,day_of_week,time_block' });
  }
}

// ============================================
// DISCLOSURE READINESS
// ============================================

export async function assessDisclosureReadiness(
  userId: string,
): Promise<{ ready: boolean; score: number; signals: string[] }> {
  const { data: signals } = await supabase
    .from('gina_disclosure_signals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!signals || signals.length === 0) {
    return { ready: false, score: 0, signals: [] };
  }

  const now = Date.now();
  let totalScore = 0;
  const descriptions: string[] = [];

  for (const s of signals) {
    const ageWeeks = (now - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7);
    const recencyMultiplier = Math.max(0.1, 1 - (ageWeeks / 12));
    totalScore += s.weight * recencyMultiplier;
    descriptions.push(`${s.signal_type}: ${s.description}`);
  }

  return {
    ready: totalScore > 10,
    score: totalScore,
    signals: descriptions,
  };
}

export async function logDisclosureSignal(
  userId: string,
  signalType: string,
  description: string,
  weight: number = 1.0,
): Promise<void> {
  await supabase.from('gina_disclosure_signals').insert({
    user_id: userId,
    signal_type: signalType,
    description,
    weight,
  });
}
