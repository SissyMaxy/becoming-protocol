/**
 * Passive Voice — Aggregation & Storage
 *
 * Saves individual samples, computes daily aggregates.
 */

import { supabase } from '../supabase';
import type {
  PassiveVoiceSample,
  VoiceDailyAggregate,
  PassiveVoiceStats,
  ContextAggregate,
} from '../../types/passive-voice';
import { mapSample, mapAggregate } from '../../types/passive-voice';
import type { PassiveSample } from './analyzer';

// ── Target range ────────────────────────────────────────
const TARGET_MIN_HZ = 180;
const TARGET_MAX_HZ = 220;

// ── Save individual sample ──────────────────────────────

export async function saveSample(
  userId: string,
  sample: PassiveSample
): Promise<PassiveVoiceSample | null> {
  const { data, error } = await supabase
    .from('passive_voice_samples')
    .insert({
      user_id: userId,
      avg_pitch_hz: sample.avg_pitch_hz,
      min_pitch_hz: sample.min_pitch_hz,
      max_pitch_hz: sample.max_pitch_hz,
      duration_seconds: sample.duration_seconds,
      voice_context: sample.voice_context,
      confidence: sample.confidence,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[passive-voice] saveSample error:', error);
    return null;
  }
  return mapSample(data as Record<string, unknown>);
}

// ── Aggregate day from samples ──────────────────────────

export async function aggregateDay(
  userId: string,
  date: string // YYYY-MM-DD
): Promise<VoiceDailyAggregate | null> {
  const { data: samples } = await supabase
    .from('passive_voice_samples')
    .select('*')
    .eq('user_id', userId)
    .eq('sample_date', date)
    .order('sampled_at', { ascending: true });

  if (!samples || samples.length === 0) return null;

  const pitches = samples.map((s) => s.avg_pitch_hz as number);
  const sorted = [...pitches].sort((a, b) => a - b);

  const avg = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Standard deviation
  const variance = pitches.reduce((sum, p) => sum + (p - avg) ** 2, 0) / pitches.length;
  const stdDev = Math.sqrt(variance);

  // Time in target range
  const totalDuration = samples.reduce((s, r) => s + (r.duration_seconds as number), 0);
  const targetDuration = samples
    .filter((s) => {
      const hz = s.avg_pitch_hz as number;
      return hz >= TARGET_MIN_HZ && hz <= TARGET_MAX_HZ;
    })
    .reduce((s, r) => s + (r.duration_seconds as number), 0);
  const timeInTargetPct = totalDuration > 0 ? (targetDuration / totalDuration) * 100 : 0;

  // By context breakdown
  const byContext: Record<string, ContextAggregate> = {};
  for (const s of samples) {
    const ctx = s.voice_context as string;
    if (!byContext[ctx]) {
      byContext[ctx] = { avg: 0, samples: 0, duration_seconds: 0 };
    }
    byContext[ctx].samples++;
    byContext[ctx].avg += s.avg_pitch_hz as number;
    byContext[ctx].duration_seconds += s.duration_seconds as number;
  }
  for (const ctx of Object.keys(byContext)) {
    byContext[ctx].avg = Math.round((byContext[ctx].avg / byContext[ctx].samples) * 10) / 10;
  }

  // Upsert aggregate
  const { data: agg, error } = await supabase
    .from('voice_daily_aggregates')
    .upsert({
      user_id: userId,
      aggregate_date: date,
      total_samples: samples.length,
      total_duration_seconds: Math.round(totalDuration * 10) / 10,
      avg_pitch_hz: Math.round(avg * 10) / 10,
      median_pitch_hz: Math.round(median * 10) / 10,
      min_pitch_hz: Math.round(min * 10) / 10,
      max_pitch_hz: Math.round(max * 10) / 10,
      pitch_std_dev: Math.round(stdDev * 10) / 10,
      time_in_target_pct: Math.round(timeInTargetPct * 10) / 10,
      by_context: byContext,
    }, { onConflict: 'user_id,aggregate_date' })
    .select('*')
    .single();

  if (error) {
    console.error('[passive-voice] aggregateDay error:', error);
    return null;
  }
  return mapAggregate(agg as Record<string, unknown>);
}

// ── Get daily aggregate ─────────────────────────────────

export async function getDailyAggregate(
  userId: string,
  date: string
): Promise<VoiceDailyAggregate | null> {
  const { data } = await supabase
    .from('voice_daily_aggregates')
    .select('*')
    .eq('user_id', userId)
    .eq('aggregate_date', date)
    .single();

  if (!data) return null;
  return mapAggregate(data as Record<string, unknown>);
}

// ── Get weekly trend ────────────────────────────────────

export async function getWeeklyTrend(userId: string): Promise<VoiceDailyAggregate[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data } = await supabase
    .from('voice_daily_aggregates')
    .select('*')
    .eq('user_id', userId)
    .gte('aggregate_date', sevenDaysAgo.toISOString().split('T')[0])
    .order('aggregate_date', { ascending: true });

  if (!data) return [];
  return data.map((r) => mapAggregate(r as Record<string, unknown>));
}

// ── Get monthly stats ───────────────────────────────────

export async function getMonthlyStats(userId: string): Promise<PassiveVoiceStats> {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [todayAgg, weeklyTrend, monthlyAggs, interventionsToday] = await Promise.all([
    getDailyAggregate(userId, today),
    getWeeklyTrend(userId),
    supabase
      .from('voice_daily_aggregates')
      .select('avg_pitch_hz')
      .eq('user_id', userId)
      .gte('aggregate_date', thirtyDaysAgo.toISOString().split('T')[0]),
    supabase
      .from('voice_interventions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00`),
  ]);

  const monthlyPitches = (monthlyAggs.data || [])
    .map((r) => r.avg_pitch_hz as number)
    .filter(Boolean);
  const monthlyAvg = monthlyPitches.length > 0
    ? monthlyPitches.reduce((a, b) => a + b, 0) / monthlyPitches.length
    : null;

  const weeklyPitches = weeklyTrend
    .map((d) => d.avg_pitch_hz)
    .filter((h): h is number => h !== null);
  const weeklyAvg = weeklyPitches.length > 0
    ? weeklyPitches.reduce((a, b) => a + b, 0) / weeklyPitches.length
    : null;

  return {
    todayAvgHz: todayAgg?.avg_pitch_hz ?? null,
    todayTargetPct: todayAgg?.time_in_target_pct ?? null,
    todayDurationMinutes: todayAgg ? Math.round(todayAgg.total_duration_seconds / 60) : 0,
    todaySamples: todayAgg?.total_samples ?? 0,
    weeklyTrend: weeklyTrend.map((d) => ({
      date: d.aggregate_date,
      avg_hz: d.avg_pitch_hz,
    })),
    weeklyAvgHz: weeklyAvg ? Math.round(weeklyAvg * 10) / 10 : null,
    monthlyAvgHz: monthlyAvg ? Math.round(monthlyAvg * 10) / 10 : null,
    interventionsToday: interventionsToday.count || 0,
    currentContext: 'unknown',
  };
}
