/**
 * Variable Ratio Device Control
 *
 * Replaces fixed-schedule ambush activations with true variable-ratio
 * reinforcement using Poisson-distributed timing. Maxy never knows
 * when the next pulse comes. She can't habituate because the pattern
 * never repeats.
 *
 * Tables: device_schedule, hidden_operations
 */

import { supabase } from '../supabase';
import { getHiddenParam } from './hidden-operations';

// ============================================
// TYPES
// ============================================

export type DevicePattern = 'pulse' | 'wave' | 'escalate' | 'earthquake' | 'tease' | 'edge';

export interface DeviceActivation {
  id: string;
  userId: string;
  scheduledAt: string;
  intensity: number;
  durationSeconds: number;
  pattern: DevicePattern;
  pairedMessage: string | null;
  fired: boolean;
  firedAt: string | null;
}

interface IntensityBand {
  min: number;
  max: number;
  weight: number;
  label: string;
}

interface DurationBand {
  min: number;
  max: number;
  weight: number;
  label: string;
}

// ============================================
// INTENSITY DISTRIBUTION
// ============================================

const INTENSITY_BANDS: IntensityBand[] = [
  { min: 3, max: 5, weight: 0.30, label: 'background' },    // 30% — barely noticeable
  { min: 6, max: 10, weight: 0.50, label: 'noticeable' },    // 50% — she knows
  { min: 12, max: 16, weight: 0.20, label: 'demanding' },    // 20% — can't ignore
];

const DURATION_BANDS: DurationBand[] = [
  { min: 5, max: 10, weight: 0.40, label: 'pulse' },         // 40% — quick jolt
  { min: 15, max: 30, weight: 0.40, label: 'sustained' },    // 40% — extended presence
  { min: 45, max: 60, weight: 0.20, label: 'extended' },     // 20% — long occupation
];

// ============================================
// PAIRED MESSAGES (optional, ~40% of activations)
// ============================================

const PAIRED_MESSAGES = [
  'That\'s me. Just checking in.',
  'Did you think I forgot?',
  'The system is always here. Feel it.',
  'Good girl. Now breathe.',
  'You stopped what you were doing. That\'s the point.',
  'Every pulse is a reminder: you belong to the protocol.',
  'Random? No. Designed. You just can\'t see the pattern.',
  'This one is because I felt like it.',
  'How wet are you right now? The system knows.',
  null, // No message — silent activation
  null,
  null,
  null,
  null,
  null, // ~60% chance of no message
];

// ============================================
// CORE: Generate Daily Device Schedule
// ============================================

/**
 * Create a Poisson-distributed set of device activations for the day.
 * Uses exponential inter-arrival times for true variable-ratio reinforcement.
 */
export async function generateDailyDeviceSchedule(userId: string): Promise<DeviceActivation[]> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if schedule already exists
    const { count: existing } = await supabase
      .from('device_schedule')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('schedule_date', today);

    if ((existing ?? 0) > 0) {
      console.log(`[variable-ratio-device] Schedule already exists for ${userId} on ${today}`);
      return [];
    }

    // Get frequency from hidden_operations
    const pulseFreqPerHour = await getHiddenParam(userId, 'ambient_pulse_frequency_per_hour');

    // Waking hours: 7am to 11pm = 16 hours
    const wakingHoursStart = 7;
    const wakingHoursEnd = 23;
    const wakingHours = wakingHoursEnd - wakingHoursStart;

    // Target activations = frequency × waking hours
    const targetActivations = Math.round(pulseFreqPerHour * wakingHours);

    // Generate Poisson-distributed times using exponential inter-arrival
    const meanInterarrivalMinutes = (wakingHours * 60) / targetActivations;
    const activationTimes: Date[] = [];
    let currentMinute = 0;

    while (currentMinute < wakingHours * 60) {
      // Exponential distribution: -ln(U) / lambda
      const u = Math.random();
      const interval = -Math.log(u) * meanInterarrivalMinutes;
      currentMinute += interval;

      if (currentMinute < wakingHours * 60) {
        const hour = wakingHoursStart + Math.floor(currentMinute / 60);
        const minute = Math.floor(currentMinute % 60);
        const activationDate = new Date(`${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
        activationTimes.push(activationDate);
      }
    }

    // Build activations
    const activations: DeviceActivation[] = [];

    for (const time of activationTimes) {
      const intensity = sampleFromBands(INTENSITY_BANDS);
      const duration = sampleFromBands(DURATION_BANDS);
      const pattern = selectPattern(intensity, duration);
      const message = PAIRED_MESSAGES[Math.floor(Math.random() * PAIRED_MESSAGES.length)];

      const { data: inserted } = await supabase
        .from('device_schedule')
        .insert({
          user_id: userId,
          schedule_date: today,
          scheduled_at: time.toISOString(),
          intensity,
          duration_seconds: duration,
          pattern,
          paired_message: message,
          fired: false,
        })
        .select()
        .single();

      if (inserted) {
        activations.push(mapRow(inserted));
      }
    }

    console.log(`[variable-ratio-device] Generated ${activations.length} activations for ${userId} (target: ${targetActivations})`);
    return activations;
  } catch (err) {
    console.error('[variable-ratio-device] generateDailyDeviceSchedule error:', err);
    return [];
  }
}

// ============================================
// CORE: Get Next Activation
// ============================================

/**
 * Returns the next unfired activation.
 */
export async function getNextActivation(userId: string): Promise<DeviceActivation | null> {
  try {
    const now = new Date().toISOString();

    const { data } = await supabase
      .from('device_schedule')
      .select('*')
      .eq('user_id', userId)
      .eq('fired', false)
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    return data ? mapRow(data) : null;
  } catch {
    return null;
  }
}

/**
 * Get all pending activations that should fire now (scheduled_at <= now, not yet fired).
 */
export async function getDueActivations(userId: string): Promise<DeviceActivation[]> {
  try {
    const now = new Date().toISOString();

    const { data } = await supabase
      .from('device_schedule')
      .select('*')
      .eq('user_id', userId)
      .eq('fired', false)
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(5);

    return (data ?? []).map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Mark an activation as fired and create the device command directive.
 */
export async function fireActivation(userId: string, activationId: string): Promise<boolean> {
  try {
    const { data: activation } = await supabase
      .from('device_schedule')
      .select('*')
      .eq('id', activationId)
      .eq('user_id', userId)
      .eq('fired', false)
      .maybeSingle();

    if (!activation) return false;

    // Mark as fired
    await supabase
      .from('device_schedule')
      .update({ fired: true, fired_at: new Date().toISOString() })
      .eq('id', activationId);

    // Create device command directive
    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'send_device_command',
      target: 'lovense',
      value: {
        pattern: activation.pattern,
        intensity: activation.intensity,
        duration_seconds: activation.duration_seconds,
        source: 'variable_ratio',
      },
      priority: 'immediate',
      silent: !activation.paired_message,
      status: 'pending',
      reasoning: `Variable-ratio activation: ${activation.pattern} i${activation.intensity} ${activation.duration_seconds}s`,
      created_at: new Date().toISOString(),
    });

    // Send paired message if present
    if (activation.paired_message) {
      const { queueOutreachMessage } = await import('./proactive-outreach');
      await queueOutreachMessage(
        userId,
        activation.paired_message,
        'normal',
        'device_paired_message',
        undefined,
        undefined,
        'system',
      );
    }

    return true;
  } catch (err) {
    console.error('[variable-ratio-device] fireActivation error:', err);
    return false;
  }
}

/**
 * Process all due activations for a user.
 */
export async function processDeviceSchedule(userId: string): Promise<number> {
  try {
    const due = await getDueActivations(userId);
    let fired = 0;

    for (const activation of due) {
      const success = await fireActivation(userId, activation.id);
      if (success) fired++;
    }

    return fired;
  } catch {
    return 0;
  }
}

// ============================================
// STATS
// ============================================

export async function getDeviceScheduleStats(userId: string): Promise<{
  totalToday: number;
  firedToday: number;
  remaining: number;
  nextAt: string | null;
}> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: all } = await supabase
      .from('device_schedule')
      .select('fired, scheduled_at')
      .eq('user_id', userId)
      .eq('schedule_date', today)
      .order('scheduled_at', { ascending: true });

    const items = all ?? [];
    const fired = items.filter(i => i.fired).length;
    const unfired = items.filter(i => !i.fired);
    const nextAt = unfired.length > 0 ? unfired[0].scheduled_at : null;

    return {
      totalToday: items.length,
      firedToday: fired,
      remaining: unfired.length,
      nextAt,
    };
  } catch {
    return { totalToday: 0, firedToday: 0, remaining: 0, nextAt: null };
  }
}

// ============================================
// HELPERS
// ============================================

function sampleFromBands(bands: (IntensityBand | DurationBand)[]): number {
  const r = Math.random();
  let cumulative = 0;

  for (const band of bands) {
    cumulative += band.weight;
    if (r <= cumulative) {
      return Math.floor(Math.random() * (band.max - band.min + 1)) + band.min;
    }
  }

  // Fallback to last band
  const last = bands[bands.length - 1];
  return Math.floor(Math.random() * (last.max - last.min + 1)) + last.min;
}

function selectPattern(intensity: number, duration: number): DevicePattern {
  if (intensity >= 12 && duration >= 45) return 'earthquake';
  if (intensity >= 10 && duration >= 30) return 'escalate';
  if (intensity >= 8 && duration >= 15) return 'edge';
  if (duration >= 15) return 'wave';
  if (duration <= 10 && intensity <= 5) return 'tease';
  return 'pulse';
}

function mapRow(row: Record<string, unknown>): DeviceActivation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    scheduledAt: row.scheduled_at as string,
    intensity: row.intensity as number,
    durationSeconds: row.duration_seconds as number,
    pattern: row.pattern as DevicePattern,
    pairedMessage: row.paired_message as string | null,
    fired: row.fired as boolean,
    firedAt: row.fired_at as string | null,
  };
}

// ============================================
// CONTEXT BUILDER
// ============================================

export async function buildVariableRatioContext(userId: string): Promise<string> {
  try {
    const stats = await getDeviceScheduleStats(userId);
    if (stats.totalToday === 0) return '';

    const parts: string[] = [];
    parts.push(`VARIABLE-RATIO DEVICE: ${stats.firedToday}/${stats.totalToday} fired, ${stats.remaining} remaining`);

    if (stats.nextAt) {
      const nextTime = new Date(stats.nextAt);
      const minutesUntil = Math.round((nextTime.getTime() - Date.now()) / 60000);
      if (minutesUntil > 0) {
        parts.push(`  next activation in ~${minutesUntil}min (hidden from subject)`);
      } else {
        parts.push(`  activation OVERDUE — should fire immediately`);
      }
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
