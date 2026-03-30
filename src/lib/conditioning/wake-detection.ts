/**
 * Wake Detection via Whoop (P6.6)
 *
 * Detects when the user has woken up based on Whoop sleep data.
 * Used to improve morning briefing timing — soft gate only.
 * If Whoop data isn't available, the morning briefing fires normally on app open.
 */

import { supabase } from '../supabase';

export interface WakeDetectionResult {
  awake: boolean;
  wakeTime?: string;
  sleepQuality?: number;
  whoopAvailable: boolean;
}

/**
 * Detect wake state from Whoop sleep data.
 *
 * Logic: If today's whoop_metrics has total_sleep_duration_milli > 0,
 * sleep has been recorded = user woke up. Also checks if current time
 * is after the user's configured wake_time in bookend_config.
 */
export async function detectWakeFromWhoop(
  userId: string,
): Promise<WakeDetectionResult> {
  const noData: WakeDetectionResult = { awake: true, whoopAvailable: false };

  try {
    // Check if Whoop is connected
    const { data: tokenRow } = await supabase
      .from('whoop_tokens')
      .select('id')
      .eq('user_id', userId)
      .is('disconnected_at', null)
      .maybeSingle();

    if (!tokenRow) return noData;

    const today = new Date().toISOString().split('T')[0];

    // Fetch today's Whoop metrics
    const { data: metrics } = await supabase
      .from('whoop_metrics')
      .select('total_sleep_duration_milli, sleep_performance_percentage, date')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (!metrics) {
      // Whoop is connected but no data for today yet — might still be asleep
      // Check if current time is past their configured wake time as fallback
      const pastWakeTime = await isPastConfiguredWakeTime(userId);
      return {
        awake: pastWakeTime,
        whoopAvailable: true,
      };
    }

    // total_sleep_duration_milli > 0 means sleep cycle has been recorded = awake
    const sleepRecorded = (metrics.total_sleep_duration_milli || 0) > 0;

    // Estimate wake time: sleep was recorded when Whoop processed it
    // Whoop typically processes sleep within 30 min of waking
    const sleepQuality = metrics.sleep_performance_percentage ?? undefined;

    return {
      awake: sleepRecorded,
      wakeTime: sleepRecorded ? new Date().toISOString() : undefined,
      sleepQuality: sleepQuality != null ? Math.round(sleepQuality) : undefined,
      whoopAvailable: true,
    };
  } catch (err) {
    console.error('[WakeDetection] Error:', err);
    return noData;
  }
}

/**
 * Determine if the morning briefing should trigger.
 * Combines Whoop wake detection with bookend state.
 *
 * Returns true if:
 *   - User is awake (per Whoop or fallback)
 *   - AND morning bookend has not been viewed today
 *
 * This is a soft gate: if Whoop isn't available, returns true
 * so the morning briefing fires normally on app open.
 */
export async function shouldTriggerMorningBriefing(
  userId: string,
): Promise<boolean> {
  try {
    // Check if morning bookend already viewed today
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('bookend_views')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('bookend_type', 'morning')
      .gte('created_at', `${today}T00:00:00`);

    if ((count || 0) > 0) return false; // Already viewed today

    // Check wake state
    const wake = await detectWakeFromWhoop(userId);

    // If Whoop isn't available, don't block — return true
    if (!wake.whoopAvailable) return true;

    // Whoop available: only trigger if awake
    return wake.awake;
  } catch {
    // On any error, don't block the morning briefing
    return true;
  }
}

/**
 * Check if current time is past the user's configured wake time.
 * Used as fallback when Whoop has no sleep data for today.
 */
async function isPastConfiguredWakeTime(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('bookend_config')
      .select('wake_time')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data?.wake_time) return true; // No config = don't block

    // Parse wake_time (stored as "HH:MM" or "HH:MM:SS")
    const [hours, minutes] = (data.wake_time as string).split(':').map(Number);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const wakeMinutes = hours * 60 + (minutes || 0);

    return nowMinutes >= wakeMinutes;
  } catch {
    return true; // On error, don't block
  }
}
