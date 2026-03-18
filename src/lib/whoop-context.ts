/**
 * Whoop Context Builder
 * Builds the biometric context block for the Handler system prompt.
 */

import { supabase } from './supabase';

export interface WhoopBiometricContext {
  available: boolean;
  contextBlock: string;
  recoveryZone: 'GREEN' | 'YELLOW' | 'RED' | null;
  recoveryScore: number | null;
  sleepPerformance: number | null;
  dayStrain: number | null;
}

/**
 * Fetch latest Whoop metrics and build context for Handler prompt.
 */
export async function buildWhoopContext(userId: string): Promise<WhoopBiometricContext> {
  const empty: WhoopBiometricContext = {
    available: false,
    contextBlock: '',
    recoveryZone: null,
    recoveryScore: null,
    sleepPerformance: null,
    dayStrain: null,
  };

  // Check if Whoop is connected
  const { data: tokenRow } = await supabase
    .from('whoop_tokens')
    .select('id')
    .eq('user_id', userId)
    .is('disconnected_at', null)
    .maybeSingle();

  if (!tokenRow) return empty;

  // Get latest metrics
  const { data: metrics } = await supabase
    .from('whoop_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!metrics) return empty;

  // Get today's workouts
  const today = new Date().toISOString().split('T')[0];
  const { data: workouts } = await supabase
    .from('whoop_workouts')
    .select('sport_name, strain, duration_milli, average_heart_rate, max_heart_rate')
    .eq('user_id', userId)
    .eq('date', today);

  const lines: string[] = ['## Biometric State (Whoop)'];

  let recoveryZone: 'GREEN' | 'YELLOW' | 'RED' | null = null;

  if (metrics.recovery_score != null) {
    recoveryZone = metrics.recovery_score >= 67 ? 'GREEN' : metrics.recovery_score >= 34 ? 'YELLOW' : 'RED';
    lines.push(`Recovery: ${metrics.recovery_score}% (${recoveryZone})`);
    const hrvStr = metrics.hrv_rmssd_milli != null ? `HRV: ${metrics.hrv_rmssd_milli.toFixed(1)}ms` : '';
    const rhrStr = metrics.resting_heart_rate != null ? `RHR: ${metrics.resting_heart_rate}bpm` : '';
    const spo2Str = metrics.spo2_percentage != null ? `SpO2: ${metrics.spo2_percentage.toFixed(1)}%` : '';
    const parts = [hrvStr, rhrStr, spo2Str].filter(Boolean);
    if (parts.length) lines.push(parts.join(' | '));
  }

  if (metrics.sleep_performance_percentage != null) {
    const totalHrs = metrics.total_sleep_duration_milli
      ? (metrics.total_sleep_duration_milli / 3600000).toFixed(1)
      : '?';
    lines.push(`Sleep: ${metrics.sleep_performance_percentage.toFixed(0)}% performance, ${totalHrs}h total`);

    const deepHrs = metrics.deep_sleep_milli ? (metrics.deep_sleep_milli / 3600000).toFixed(1) : null;
    const remHrs = metrics.rem_sleep_milli ? (metrics.rem_sleep_milli / 3600000).toFixed(1) : null;
    const disturbances = metrics.disturbance_count;
    const sleepParts = [
      deepHrs ? `Deep: ${deepHrs}h` : null,
      remHrs ? `REM: ${remHrs}h` : null,
      disturbances != null ? `Disturbances: ${disturbances}` : null,
    ].filter(Boolean);
    if (sleepParts.length) lines.push(sleepParts.join(' | '));

    if (metrics.sleep_debt_milli && metrics.sleep_debt_milli > 1800000) {
      lines.push(`Sleep debt: ${Math.round(metrics.sleep_debt_milli / 60000)}min — adjust intensity accordingly`);
    }
  }

  if (metrics.day_strain != null) {
    lines.push(`Day strain: ${metrics.day_strain.toFixed(1)} / 21`);
  }

  if (workouts && workouts.length > 0) {
    const workoutStrs = workouts.map(w => {
      const mins = w.duration_milli ? Math.round(w.duration_milli / 60000) : 0;
      return `${w.sport_name || 'Activity'} (${mins}min${w.strain ? `, strain ${w.strain.toFixed(1)}` : ''})`;
    });
    lines.push(`Workouts today: ${workoutStrs.join(', ')}`);
  }

  if (metrics.weight_kilogram) {
    const lbs = (metrics.weight_kilogram * 2.205).toFixed(1);
    lines.push(`Weight: ${metrics.weight_kilogram.toFixed(1)}kg / ${lbs}lbs`);
  }

  return {
    available: lines.length > 1,
    contextBlock: lines.join('\n'),
    recoveryZone,
    recoveryScore: metrics.recovery_score,
    sleepPerformance: metrics.sleep_performance_percentage,
    dayStrain: metrics.day_strain,
  };
}
