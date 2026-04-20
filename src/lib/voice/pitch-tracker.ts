/**
 * Voice Pitch Tracker — P4.3
 *
 * Records pitch samples, computes averages, detects trends.
 * Feeds Handler context with voice feminization progress data.
 */

import { supabase } from '../supabase';

// ── Record a pitch sample ────────────────────────────

export async function recordPitchSample(
  userId: string,
  pitchHz: number,
  context?: string,
  sessionId?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('voice_pitch_samples')
    .insert({
      user_id: userId,
      pitch_hz: pitchHz,
      context: context || null,
      session_id: sessionId || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[pitch-tracker] recordPitchSample error:', error);
    return null;
  }

  // No pitch slip detection — voice tracking is longitudinal, not target-based.
  // Forcing feminine pitch targets causes dysphoria. The Handler should
  // reference pitch TRENDS ("up 3Hz this month") not compliance ("below 140Hz = slip").

  return data.id;
}

// ── Average pitch over N days ────────────────────────

export async function getAveragePitch(
  userId: string,
  days: number = 30,
): Promise<number | null> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('voice_pitch_samples')
    .select('pitch_hz')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error || !data || data.length === 0) return null;

  const sum = data.reduce((acc, row) => acc + (row.pitch_hz as number), 0);
  return Math.round((sum / data.length) * 10) / 10;
}

// ── Pitch trend: last 7d vs previous 7d ──────────────

export async function getPitchTrend(
  userId: string,
): Promise<'rising' | 'stable' | 'falling' | null> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString();

  const [recentResult, previousResult] = await Promise.allSettled([
    supabase
      .from('voice_pitch_samples')
      .select('pitch_hz')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('voice_pitch_samples')
      .select('pitch_hz')
      .eq('user_id', userId)
      .gte('created_at', fourteenDaysAgo)
      .lt('created_at', sevenDaysAgo),
  ]);

  const recentData = recentResult.status === 'fulfilled' ? recentResult.value.data : null;
  const previousData = previousResult.status === 'fulfilled' ? previousResult.value.data : null;

  if (!recentData || recentData.length === 0 || !previousData || previousData.length === 0) {
    return null;
  }

  const recentAvg = recentData.reduce((s, r) => s + (r.pitch_hz as number), 0) / recentData.length;
  const previousAvg = previousData.reduce((s, r) => s + (r.pitch_hz as number), 0) / previousData.length;

  const diff = recentAvg - previousAvg;
  // 3Hz threshold for meaningful change
  if (diff > 3) return 'rising';
  if (diff < -3) return 'falling';
  return 'stable';
}

// ── Handler context string ───────────────────────────

export async function buildVoicePitchContext(userId: string): Promise<string> {
  try {
    const [avg7, avg30, trend] = await Promise.allSettled([
      getAveragePitch(userId, 7),
      getAveragePitch(userId, 30),
      getPitchTrend(userId),
    ]);

    const recent = avg7.status === 'fulfilled' ? avg7.value : null;
    const monthly = avg30.status === 'fulfilled' ? avg30.value : null;
    const trendVal = trend.status === 'fulfilled' ? trend.value : null;

    if (!recent && !monthly) return '';

    const parts: string[] = [];
    const avgStr = recent ? `${recent}Hz (7d)` : monthly ? `${monthly}Hz (30d)` : '';
    const trendStr = trendVal ? `, trend: ${trendVal}` : '';
    const monthStr = recent && monthly ? `, 30d avg: ${monthly}Hz` : '';

    parts.push(`VOICE PITCH: avg ${avgStr}${monthStr}${trendStr}`);

    // Count samples in last 7 days
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count } = await supabase
      .from('voice_pitch_samples')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);

    if (count != null && count > 0) {
      parts.push(`  ${count} samples this week`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
