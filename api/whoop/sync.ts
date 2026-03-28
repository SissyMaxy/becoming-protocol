import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const WHOOP_API = 'https://api.prod.whoop.com/developer';

const SPORT_NAMES: Record<number, string> = {
  0: 'Running', 1: 'Cycling', 16: 'Yoga', 17: 'Meditation',
  43: 'Strength Training', 44: 'Functional Fitness', 47: 'Walking',
  48: 'Hiking', 52: 'Swimming', 63: 'Pilates', 71: 'Sex',
  82: 'Dance', 84: 'Stretching',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    // Auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // Get Whoop access token
    const { data: tokenRow } = await supabase
      .from('whoop_tokens')
      .select('*')
      .eq('user_id', user.id)
      .is('disconnected_at', null)
      .maybeSingle();

    if (!tokenRow) return res.status(200).json({ connected: false });

    let accessToken = tokenRow.access_token;

    // Refresh if expired
    if (new Date(tokenRow.expires_at) <= new Date(Date.now() + 60000)) {
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
        }).eq('user_id', user.id);
        return res.status(200).json({ connected: false, reason: 'token_expired' });
      }

      const newTokens = await refreshRes.json();
      accessToken = newTokens.access_token;

      await supabase.from('whoop_tokens').update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || tokenRow.refresh_token,
        expires_at: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
    }

    // Fetch Whoop data
    const [recovery, sleep, cycle, workouts, body] = await Promise.allSettled([
      whoopGet(accessToken, '/v1/recovery?limit=1'),
      whoopGet(accessToken, '/v1/activity/sleep?limit=1'),
      whoopGet(accessToken, '/v1/cycle?limit=1'),
      whoopGet(accessToken, '/v1/activity/workout?limit=5'),
      whoopGet(accessToken, '/v1/user/measurement/body?limit=1'),
    ]);

    const r = recovery.status === 'fulfilled' ? recovery.value?.records?.[0] : null;
    const s = sleep.status === 'fulfilled' ? sleep.value?.records?.[0] : null;
    const c = cycle.status === 'fulfilled' ? cycle.value?.records?.[0] : null;
    const w = workouts.status === 'fulfilled' ? workouts.value?.records || [] : [];
    const b = body.status === 'fulfilled' ? body.value?.records?.[0] : null;

    const today = new Date().toISOString().split('T')[0];
    const milliToHours = (ms: number | null | undefined) => ms ? +(ms / 3600000).toFixed(1) : 0;

    // Upsert metrics
    const metrics: Record<string, unknown> = { user_id: user.id, date: today, fetched_at: new Date().toISOString() };
    if (r?.score) {
      Object.assign(metrics, {
        recovery_score: r.score.recovery_score,
        hrv_rmssd_milli: r.score.hrv_rmssd_milli,
        resting_heart_rate: r.score.resting_heart_rate,
        spo2_percentage: r.score.spo2_percentage,
        skin_temp_celsius: r.score.skin_temp_celsius,
        raw_recovery: r,
      });
    }
    if (s?.score) {
      Object.assign(metrics, {
        sleep_performance_percentage: s.score.sleep_performance_percentage,
        sleep_consistency_percentage: s.score.sleep_consistency_percentage,
        sleep_efficiency_percentage: s.score.sleep_efficiency_percentage,
        total_sleep_duration_milli: s.score.stage_summary?.total_in_bed_time_milli,
        rem_sleep_milli: s.score.stage_summary?.total_rem_sleep_time_milli,
        deep_sleep_milli: s.score.stage_summary?.total_slow_wave_sleep_time_milli,
        light_sleep_milli: s.score.stage_summary?.total_light_sleep_time_milli,
        awake_milli: s.score.stage_summary?.total_awake_time_milli,
        disturbance_count: s.score.stage_summary?.disturbance_count,
        respiratory_rate: s.score.respiratory_rate,
        sleep_debt_milli: s.score.sleep_needed?.need_from_sleep_debt_milli,
        raw_sleep: s,
      });
    }
    if (c?.score) {
      Object.assign(metrics, {
        day_strain: c.score.strain,
        day_kilojoule: c.score.kilojoule,
        day_average_heart_rate: c.score.average_heart_rate,
        day_max_heart_rate: c.score.max_heart_rate,
        raw_cycle: c,
      });
    }
    if (b?.weight_kilogram) metrics.weight_kilogram = b.weight_kilogram;

    await supabase.from('whoop_metrics').upsert(metrics, { onConflict: 'user_id,date' });

    // Upsert workouts
    for (const workout of w) {
      if (!workout.id) continue;
      await supabase.from('whoop_workouts').upsert({
        user_id: user.id,
        whoop_workout_id: String(workout.id),
        date: workout.start ? new Date(workout.start).toISOString().split('T')[0] : today,
        sport_name: workout.sport_id != null ? (SPORT_NAMES[workout.sport_id] || 'Activity') : null,
        sport_id: workout.sport_id,
        strain: workout.score?.strain,
        average_heart_rate: workout.score?.average_heart_rate,
        max_heart_rate: workout.score?.max_heart_rate,
        kilojoule: workout.score?.kilojoule,
        distance_meter: workout.score?.distance_meter,
        raw_data: workout,
      }, { onConflict: 'user_id,whoop_workout_id' });
    }

    // Build response
    return res.status(200).json({
      date: today,
      connected: true,
      recovery: r?.score ? {
        score: r.score.recovery_score,
        hrv: r.score.hrv_rmssd_milli,
        restingHR: r.score.resting_heart_rate,
        spo2: r.score.spo2_percentage || 0,
        skinTemp: r.score.skin_temp_celsius || 0,
      } : null,
      sleep: s?.score ? {
        performance: s.score.sleep_performance_percentage,
        consistency: s.score.sleep_consistency_percentage,
        efficiency: s.score.sleep_efficiency_percentage,
        totalSleepHours: milliToHours(s.score.stage_summary?.total_in_bed_time_milli),
        remHours: milliToHours(s.score.stage_summary?.total_rem_sleep_time_milli),
        deepSleepHours: milliToHours(s.score.stage_summary?.total_slow_wave_sleep_time_milli),
        disturbances: s.score.stage_summary?.disturbance_count || 0,
        respiratoryRate: s.score.respiratory_rate || 0,
        sleepDebtMinutes: Math.round((s.score.sleep_needed?.need_from_sleep_debt_milli || 0) / 60000),
      } : null,
      strain: c?.score ? {
        dayStrain: c.score.strain,
        kilojoule: c.score.kilojoule,
        avgHR: c.score.average_heart_rate,
        maxHR: c.score.max_heart_rate,
      } : null,
      workouts: w.map((wk: any) => ({
        sport: SPORT_NAMES[wk.sport_id] || 'Activity',
        strain: wk.score?.strain || 0,
        durationMinutes: wk.start && wk.end ? Math.round((new Date(wk.end).getTime() - new Date(wk.start).getTime()) / 60000) : 0,
        avgHR: wk.score?.average_heart_rate || 0,
        maxHR: wk.score?.max_heart_rate || 0,
      })),
      body: b?.weight_kilogram ? { weightKg: b.weight_kilogram } : null,
    });
  } catch (err: any) {
    console.error('[Whoop Sync]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

async function whoopGet(token: string, path: string) {
  const resp = await fetch(`${WHOOP_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  return resp.json();
}
