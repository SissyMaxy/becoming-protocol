/**
 * Gina Schedule Prediction — Item 6
 *
 * Predicts when Gina is likely home/away based on historical timing data.
 * Used by calendar generation and device control for privacy windows.
 */

import { supabase } from '../supabase';

interface PrivacyWindow {
  dayOfWeek: number; // 0 = Sunday
  startHour: number;
  endHour: number;
  confidence: number; // 0-1
}

/**
 * Predict Gina's schedule based on gina_timing_data patterns.
 * Returns windows where she is likely away (privacy windows).
 */
export async function predictGinaSchedule(userId: string): Promise<PrivacyWindow[]> {
  const { data: timing } = await supabase
    .from('gina_timing_data')
    .select('day_of_week, time_block, receptivity_score, sample_count')
    .eq('user_id', userId)
    .gte('sample_count', 3); // Need at least 3 data points

  if (!timing || timing.length === 0) return [];

  // High receptivity (score >= 7) = Gina likely away = privacy window
  const windows: PrivacyWindow[] = [];

  // Group by day of week
  const byDay: Record<number, typeof timing> = {};
  for (const t of timing) {
    if (!byDay[t.day_of_week]) byDay[t.day_of_week] = [];
    byDay[t.day_of_week].push(t);
  }

  for (const [dayStr, blocks] of Object.entries(byDay)) {
    const day = parseInt(dayStr, 10);
    const highBlocks = blocks.filter(b => b.receptivity_score >= 7);

    for (const block of highBlocks) {
      // Parse time block (e.g., "morning", "afternoon", "evening", "night")
      const hourMap: Record<string, [number, number]> = {
        morning: [6, 12],
        afternoon: [12, 17],
        evening: [17, 22],
        night: [22, 6],
        '06-09': [6, 9],
        '09-12': [9, 12],
        '12-15': [12, 15],
        '15-18': [15, 18],
        '18-21': [18, 21],
        '21-00': [21, 24],
      };

      const hours = hourMap[block.time_block];
      if (!hours) continue;

      windows.push({
        dayOfWeek: day,
        startHour: hours[0],
        endHour: hours[1],
        confidence: Math.min(1, block.sample_count / 10) * (block.receptivity_score / 10),
      });
    }
  }

  return windows;
}

/**
 * Check if NOW is a privacy window (Gina likely away).
 */
export async function isPrivacyWindow(userId: string): Promise<{
  isPrivate: boolean;
  confidence: number;
  windowEnd?: number;
}> {
  const windows = await predictGinaSchedule(userId);
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  for (const w of windows) {
    if (w.dayOfWeek === dayOfWeek && hour >= w.startHour && hour < w.endHour) {
      return { isPrivate: true, confidence: w.confidence, windowEnd: w.endHour };
    }
  }

  return { isPrivate: false, confidence: 0 };
}
