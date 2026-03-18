import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const WHOOP_API = 'https://api.prod.whoop.com/developer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );

  // Authenticate user from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const accessToken = await getValidToken(supabase, user.id);
    const today = new Date().toISOString().split('T')[0];

    // Fetch all data in parallel
    const [recovery, sleep, cycle, workouts, body] = await Promise.allSettled([
      whoopGet(accessToken, '/v1/recovery?limit=1'),
      whoopGet(accessToken, '/v1/activity/sleep?limit=1'),
      whoopGet(accessToken, '/v1/cycle?limit=1'),
      whoopGet(accessToken, '/v1/activity/workout?limit=5'),
      whoopGet(accessToken, '/v1/user/measurement/body?limit=1'),
    ]);

    const recoveryData = recovery.status === 'fulfilled' ? recovery.value?.records?.[0] : null;
    const sleepData = sleep.status === 'fulfilled' ? sleep.value?.records?.[0] : null;
    const cycleData = cycle.status === 'fulfilled' ? cycle.value?.records?.[0] : null;
    const workoutData = workouts.status === 'fulfilled' ? workouts.value?.records || [] : [];
    const bodyData = body.status === 'fulfilled' ? body.value?.records?.[0] : null;

    // Build metrics row
    const metrics: Record<string, unknown> = {
      user_id: user.id,
      date: today,
      fetched_at: new Date().toISOString(),
    };

    if (recoveryData?.score) {
      metrics.recovery_score = recoveryData.score.recovery_score;
      metrics.hrv_rmssd_milli = recoveryData.score.hrv_rmssd_milli;
      metrics.resting_heart_rate = recoveryData.score.resting_heart_rate;
      metrics.spo2_percentage = recoveryData.score.spo2_percentage;
      metrics.skin_temp_celsius = recoveryData.score.skin_temp_celsius;
      metrics.raw_recovery = recoveryData;
    }

    if (sleepData?.score) {
      metrics.sleep_performance_percentage = sleepData.score.sleep_performance_percentage;
      metrics.sleep_consistency_percentage = sleepData.score.sleep_consistency_percentage;
      metrics.sleep_efficiency_percentage = sleepData.score.sleep_efficiency_percentage;
      metrics.total_sleep_duration_milli = sleepData.score.stage_summary?.total_in_bed_time_milli;
      metrics.rem_sleep_milli = sleepData.score.stage_summary?.total_rem_sleep_time_milli;
      metrics.deep_sleep_milli = sleepData.score.stage_summary?.total_slow_wave_sleep_time_milli;
      metrics.light_sleep_milli = sleepData.score.stage_summary?.total_light_sleep_time_milli;
      metrics.awake_milli = sleepData.score.stage_summary?.total_awake_time_milli;
      metrics.disturbance_count = sleepData.score.stage_summary?.disturbance_count;
      metrics.respiratory_rate = sleepData.score.respiratory_rate;
      metrics.sleep_debt_milli = sleepData.score.sleep_needed?.need_from_sleep_debt_milli;
      metrics.raw_sleep = sleepData;
    }

    if (cycleData?.score) {
      metrics.day_strain = cycleData.score.strain;
      metrics.day_kilojoule = cycleData.score.kilojoule;
      metrics.day_average_heart_rate = cycleData.score.average_heart_rate;
      metrics.day_max_heart_rate = cycleData.score.max_heart_rate;
      metrics.raw_cycle = cycleData;
    }

    if (bodyData?.weight_kilogram) {
      metrics.weight_kilogram = bodyData.weight_kilogram;
    }

    // Upsert metrics
    await supabase.from('whoop_metrics').upsert(metrics, { onConflict: 'user_id,date' });

    // Upsert workouts
    for (const w of workoutData) {
      if (!w.id) continue;
      const workoutDate = w.start ? new Date(w.start).toISOString().split('T')[0] : today;
      await supabase.from('whoop_workouts').upsert({
        user_id: user.id,
        whoop_workout_id: String(w.id),
        date: workoutDate,
        sport_name: w.sport_id ? SPORT_NAMES[w.sport_id] || `Sport ${w.sport_id}` : null,
        sport_id: w.sport_id,
        strain: w.score?.strain,
        average_heart_rate: w.score?.average_heart_rate,
        max_heart_rate: w.score?.max_heart_rate,
        kilojoule: w.score?.kilojoule,
        distance_meter: w.score?.distance_meter,
        duration_milli: w.score?.zone_duration?.zone_zero_milli != null
          ? Object.values(w.score.zone_duration).reduce((a: number, b: unknown) => a + (Number(b) || 0), 0)
          : null,
        zone_zero_milli: w.score?.zone_duration?.zone_zero_milli,
        zone_one_milli: w.score?.zone_duration?.zone_one_milli,
        zone_two_milli: w.score?.zone_duration?.zone_two_milli,
        zone_three_milli: w.score?.zone_duration?.zone_three_milli,
        zone_four_milli: w.score?.zone_duration?.zone_four_milli,
        zone_five_milli: w.score?.zone_duration?.zone_five_milli,
        raw_data: w,
      }, { onConflict: 'user_id,whoop_workout_id' });
    }

    // Build snapshot response
    const milliToHours = (ms: number | null | undefined) => ms ? +(ms / 3600000).toFixed(1) : 0;

    const snapshot = {
      date: today,
      connected: true,
      recovery: recoveryData?.score ? {
        score: recoveryData.score.recovery_score,
        hrv: recoveryData.score.hrv_rmssd_milli,
        restingHR: recoveryData.score.resting_heart_rate,
        spo2: recoveryData.score.spo2_percentage || 0,
        skinTemp: recoveryData.score.skin_temp_celsius || 0,
      } : null,
      sleep: sleepData?.score ? {
        performance: sleepData.score.sleep_performance_percentage,
        consistency: sleepData.score.sleep_consistency_percentage,
        efficiency: sleepData.score.sleep_efficiency_percentage,
        totalSleepHours: milliToHours(sleepData.score.stage_summary?.total_in_bed_time_milli),
        remHours: milliToHours(sleepData.score.stage_summary?.total_rem_sleep_time_milli),
        deepSleepHours: milliToHours(sleepData.score.stage_summary?.total_slow_wave_sleep_time_milli),
        disturbances: sleepData.score.stage_summary?.disturbance_count || 0,
        respiratoryRate: sleepData.score.respiratory_rate || 0,
        sleepDebtMinutes: Math.round((sleepData.score.sleep_needed?.need_from_sleep_debt_milli || 0) / 60000),
      } : null,
      strain: cycleData?.score ? {
        dayStrain: cycleData.score.strain,
        kilojoule: cycleData.score.kilojoule,
        avgHR: cycleData.score.average_heart_rate,
        maxHR: cycleData.score.max_heart_rate,
      } : null,
      workouts: workoutData.map((w: Record<string, unknown>) => ({
        sport: SPORT_NAMES[(w.sport_id as number)] || `Sport ${w.sport_id}`,
        strain: (w.score as Record<string, unknown>)?.strain || 0,
        durationMinutes: Math.round(((w.end ? new Date(w.end as string).getTime() : Date.now()) - new Date(w.start as string).getTime()) / 60000),
        avgHR: (w.score as Record<string, unknown>)?.average_heart_rate || 0,
        maxHR: (w.score as Record<string, unknown>)?.max_heart_rate || 0,
      })),
      body: bodyData?.weight_kilogram ? { weightKg: bodyData.weight_kilogram } : null,
    };

    return res.status(200).json(snapshot);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'WHOOP_NOT_CONNECTED') {
      return res.status(200).json({ connected: false });
    }
    if (message === 'WHOOP_TOKEN_REFRESH_FAILED') {
      return res.status(200).json({ connected: false, reason: 'token_expired' });
    }
    console.error('[Whoop Sync] Error:', err);
    return res.status(500).json({ error: message });
  }
}

async function getValidToken(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('whoop_tokens')
    .select('*')
    .eq('user_id', userId)
    .is('disconnected_at', null)
    .maybeSingle();

  if (!tokenRow) throw new Error('WHOOP_NOT_CONNECTED');

  // If token still valid (with 60s buffer)
  if (new Date(tokenRow.expires_at) > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

  // Refresh
  const refreshRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refresh_token,
      client_id: process.env.WHOOP_CLIENT_ID || '',
      client_secret: process.env.WHOOP_CLIENT_SECRET || '',
      scope: 'offline',
    }),
  });

  if (!refreshRes.ok) {
    await supabase.from('whoop_tokens').update({
      disconnected_at: new Date().toISOString(),
    }).eq('user_id', userId);
    throw new Error('WHOOP_TOKEN_REFRESH_FAILED');
  }

  const newTokens = await refreshRes.json();
  const expiresAt = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000);

  await supabase.from('whoop_tokens').update({
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || tokenRow.refresh_token,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  return newTokens.access_token;
}

async function whoopGet(token: string, path: string) {
  const res = await fetch(`${WHOOP_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn(`[Whoop API] ${path} failed:`, res.status);
    return null;
  }
  return res.json();
}

// Common Whoop sport IDs
const SPORT_NAMES: Record<number, string> = {
  -1: 'Activity',
  0: 'Running',
  1: 'Cycling',
  16: 'Yoga',
  17: 'Meditation',
  43: 'Strength Training',
  44: 'Functional Fitness',
  47: 'Walking',
  48: 'Hiking',
  52: 'Swimming',
  63: 'Pilates',
  71: 'Sex',
  82: 'Dance',
  84: 'Stretching',
};
