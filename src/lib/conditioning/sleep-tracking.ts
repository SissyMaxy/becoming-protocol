/**
 * Sleep Conditioning Tracking
 *
 * Verifies that sleep conditioning actually played and correlates
 * with sleep quality via Whoop data. No more trusting that it ran —
 * the system knows duration, completion, and deep sleep impact.
 *
 * Tables: sleep_conditioning_tracking, whoop_metrics
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type PlaybackEvent = 'started' | 'progress' | 'completed' | 'interrupted';

export interface SleepPlaybackData {
  event: PlaybackEvent;
  durationSeconds?: number;
  contentIds?: string[];
}

export interface SleepVerification {
  played: boolean;
  durationSeconds: number;
  completed: boolean;
  deepSleepCorrelation: 'positive' | 'neutral' | 'negative';
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Record a sleep playback event. Called by SleepContentPlayer component.
 * Fire-and-forget — errors are swallowed.
 */
export async function recordSleepPlayback(
  userId: string,
  data: SleepPlaybackData,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  // Ensure row exists for today (upsert)
  await supabase
    .from('sleep_conditioning_tracking')
    .upsert(
      {
        user_id: userId,
        date: today,
        prescribed: true,
      },
      { onConflict: 'user_id,date' },
    );

  switch (data.event) {
    case 'started':
      await supabase
        .from('sleep_conditioning_tracking')
        .update({
          playback_started: true,
          playback_started_at: now,
          content_ids: data.contentIds ?? [],
        })
        .eq('user_id', userId)
        .eq('date', today);
      break;

    case 'progress':
      if (data.durationSeconds != null) {
        await supabase
          .from('sleep_conditioning_tracking')
          .update({
            playback_duration_seconds: data.durationSeconds,
          })
          .eq('user_id', userId)
          .eq('date', today);
      }
      break;

    case 'completed':
      await supabase
        .from('sleep_conditioning_tracking')
        .update({
          playback_completed: true,
          playback_duration_seconds: data.durationSeconds ?? 0,
        })
        .eq('user_id', userId)
        .eq('date', today);
      break;

    case 'interrupted':
      await supabase
        .from('sleep_conditioning_tracking')
        .update({
          playback_duration_seconds: data.durationSeconds ?? 0,
          playback_completed: false,
        })
        .eq('user_id', userId)
        .eq('date', today);
      break;
  }
}

/**
 * Correlate sleep quality with conditioning playback for a given date.
 * Compares Whoop sleep data against whether conditioning played.
 */
export async function correlateSleepQuality(
  userId: string,
  date: string,
): Promise<void> {
  const [trackingRes, whoopRes] = await Promise.all([
    supabase
      .from('sleep_conditioning_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
    supabase
      .from('whoop_metrics')
      .select('sleep_start, total_sleep_minutes, deep_sleep_minutes')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
  ]);

  if (!trackingRes.data || !whoopRes.data) return;

  const whoop = whoopRes.data;
  const tracking = trackingRes.data;

  // Determine if audio was playing during deep sleep phase
  // Deep sleep typically begins 30-60 min after sleep onset
  let audioDuringDeepSleep = false;
  if (tracking.playback_started && whoop.sleep_start) {
    const sleepStart = new Date(whoop.sleep_start).getTime();
    const playbackStart = tracking.playback_started_at
      ? new Date(tracking.playback_started_at).getTime()
      : 0;
    const playbackEnd = playbackStart + (tracking.playback_duration_seconds ?? 0) * 1000;

    // Deep sleep onset estimated at 30-90 min after sleep start
    const deepSleepEstStart = sleepStart + 30 * 60 * 1000;
    const deepSleepEstEnd = sleepStart + 120 * 60 * 1000;

    audioDuringDeepSleep =
      playbackEnd > deepSleepEstStart && playbackStart < deepSleepEstEnd;
  }

  await supabase
    .from('sleep_conditioning_tracking')
    .update({
      whoop_sleep_start: whoop.sleep_start ?? null,
      whoop_total_sleep_minutes: whoop.total_sleep_minutes ?? null,
      whoop_deep_sleep_minutes: whoop.deep_sleep_minutes ?? null,
      audio_during_deep_sleep: audioDuringDeepSleep,
    })
    .eq('user_id', userId)
    .eq('date', date);
}

/**
 * Verify sleep conditioning for a date.
 * Returns playback status and deep sleep correlation.
 */
export async function verifySleepConditioning(
  userId: string,
  date: string,
): Promise<SleepVerification> {
  const { data: tracking } = await supabase
    .from('sleep_conditioning_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (!tracking || !tracking.playback_started) {
    return {
      played: false,
      durationSeconds: 0,
      completed: false,
      deepSleepCorrelation: 'neutral',
    };
  }

  // Calculate deep sleep correlation by comparing conditioning vs non-conditioning nights
  const correlation = await calculateDeepSleepCorrelation(userId);

  return {
    played: tracking.playback_started ?? false,
    durationSeconds: tracking.playback_duration_seconds ?? 0,
    completed: tracking.playback_completed ?? false,
    deepSleepCorrelation: correlation,
  };
}

/**
 * Build handler context block for sleep conditioning tracking.
 */
export async function buildSleepTrackingContext(userId: string): Promise<string> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const { data: nights } = await supabase
      .from('sleep_conditioning_tracking')
      .select('*')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgoStr)
      .order('date', { ascending: false });

    if (!nights || nights.length === 0) return '';

    const played = nights.filter((n) => n.playback_started);
    const completed = nights.filter((n) => n.playback_completed);
    const missed = nights.filter((n) => !n.playback_started);

    const avgDuration =
      played.length > 0
        ? Math.round(
            played.reduce((s, n) => s + (n.playback_duration_seconds ?? 0), 0) /
              played.length /
              60,
          )
        : 0;

    // Deep sleep correlation
    const correlation = await calculateDeepSleepCorrelation(userId);
    const correlationStr =
      correlation === 'positive'
        ? 'POSITIVE'
        : correlation === 'negative'
          ? 'negative'
          : 'neutral';

    // Compute deep sleep % difference
    const withAudio = nights.filter(
      (n) => n.playback_started && n.whoop_deep_sleep_minutes != null,
    );
    const withoutAudio = nights.filter(
      (n) => !n.playback_started && n.whoop_deep_sleep_minutes != null,
    );
    let deepSleepDiffStr = '';
    if (withAudio.length > 0 && withoutAudio.length > 0) {
      const avgWith =
        withAudio.reduce((s, n) => s + (n.whoop_deep_sleep_minutes ?? 0), 0) /
        withAudio.length;
      const avgWithout =
        withoutAudio.reduce(
          (s, n) => s + (n.whoop_deep_sleep_minutes ?? 0),
          0,
        ) / withoutAudio.length;
      const pctDiff =
        avgWithout > 0
          ? Math.round(((avgWith - avgWithout) / avgWithout) * 100)
          : 0;
      deepSleepDiffStr = ` (${pctDiff >= 0 ? '+' : ''}${pctDiff}% on conditioning nights)`;
    }

    // Last night
    const lastNight = nights[0];
    let lastNightStr = '';
    if (lastNight) {
      if (lastNight.playback_started) {
        const durMin = Math.round(
          (lastNight.playback_duration_seconds ?? 0) / 60,
        );
        lastNightStr = `PLAYED ${durMin} min, ${lastNight.playback_completed ? 'completed' : 'interrupted'}`;
      } else {
        lastNightStr = 'MISSED';
      }
    }

    // Tonight prescribed?
    const { data: todayRow } = await supabase
      .from('sleep_conditioning_tracking')
      .select('prescribed')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();
    const tonightPrescribed = todayRow?.prescribed ?? false;

    const lines: string[] = [`## Sleep Conditioning`];
    lines.push(
      `SLEEP CONDITIONING: Last 7 nights: ${played.length} played (avg ${avgDuration} min), ${missed.length} missed. Completed: ${completed.length}/${played.length}. Deep sleep correlation: ${correlationStr}${deepSleepDiffStr}.`,
    );
    if (lastNightStr) {
      lines.push(`  Last night: ${lastNightStr}.`);
    }
    lines.push(`  Tonight: ${tonightPrescribed ? 'prescribed' : 'not prescribed'}.`);

    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Compare deep sleep on conditioning vs non-conditioning nights (last 30 days).
 */
async function calculateDeepSleepCorrelation(
  userId: string,
): Promise<'positive' | 'neutral' | 'negative'> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: nights } = await supabase
    .from('sleep_conditioning_tracking')
    .select(
      'playback_started, playback_completed, whoop_deep_sleep_minutes',
    )
    .eq('user_id', userId)
    .gte('date', thirtyDaysAgo.toISOString().slice(0, 10));

  if (!nights || nights.length < 5) return 'neutral';

  const withAudio = nights.filter(
    (n) => n.playback_started && n.whoop_deep_sleep_minutes != null,
  );
  const withoutAudio = nights.filter(
    (n) => !n.playback_started && n.whoop_deep_sleep_minutes != null,
  );

  if (withAudio.length < 2 || withoutAudio.length < 2) return 'neutral';

  const avgWith =
    withAudio.reduce((s, n) => s + (n.whoop_deep_sleep_minutes ?? 0), 0) /
    withAudio.length;
  const avgWithout =
    withoutAudio.reduce(
      (s, n) => s + (n.whoop_deep_sleep_minutes ?? 0),
      0,
    ) / withoutAudio.length;

  const pctDiff =
    avgWithout > 0
      ? ((avgWith - avgWithout) / avgWithout) * 100
      : 0;

  if (pctDiff >= 5) return 'positive';
  if (pctDiff <= -5) return 'negative';
  return 'neutral';
}
