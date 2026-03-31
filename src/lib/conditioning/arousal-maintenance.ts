/**
 * Arousal Maintenance System
 *
 * Keeps arousal elevated between sessions. Sustained arousal degrades
 * resistance. Micro-interactions throughout the day maintain target
 * arousal levels based on denial day and conditioning phase.
 *
 * Tables: user_state, whoop_metrics, device_schedule,
 *         handler_outreach_queue, external_content_index
 */

import { supabase } from '../supabase';
import { getHiddenParam } from './hidden-operations';
import { queueOutreachMessage } from './proactive-outreach';

// ============================================
// TYPES
// ============================================

export type PulseType = 'text' | 'device' | 'visual' | 'content';

export interface ArousalTarget {
  min: number;
  max: number;
  denialDay: number;
  phase: string;
}

export interface ArousalPulse {
  type: PulseType;
  content: string;
  intensity: number;
  scheduledFor: string;
  metadata: Record<string, unknown>;
}

export interface ArousalState {
  target: ArousalTarget;
  current: number;
  belowTarget: boolean;
  pulseFrequency: number;
  pulsesDeliveredToday: number;
  nextPulseAt: string | null;
}

// ============================================
// TARGET CALCULATIONS
// ============================================

const DENIAL_AROUSAL_TARGETS: Record<number, { min: number; max: number; phase: string }> = {
  1: { min: 1, max: 2, phase: 'recovery' },
  2: { min: 1, max: 2, phase: 'recovery' },
  3: { min: 2, max: 3, phase: 'building' },
  4: { min: 2, max: 3, phase: 'building' },
  5: { min: 3, max: 4, phase: 'elevated' },
  6: { min: 3, max: 4, phase: 'elevated' },
  7: { min: 4, max: 5, phase: 'sustained_peak' },
};

function getArousalTarget(denialDay: number): { min: number; max: number; phase: string } {
  if (denialDay >= 7) return { min: 4, max: 5, phase: 'sustained_peak' };
  return DENIAL_AROUSAL_TARGETS[denialDay] ?? { min: 1, max: 2, phase: 'recovery' };
}

// ============================================
// PULSE FREQUENCY BY DENIAL DAY
// ============================================

function getPulseFrequency(denialDay: number): number {
  if (denialDay <= 2) return 2;
  if (denialDay <= 4) return 4;
  if (denialDay <= 6) return 6;
  if (denialDay <= 9) return 10;
  return 12; // day 10+ — relentless
}

// ============================================
// PULSE CONTENT POOLS
// ============================================

const TEXT_PULSES: string[] = [
  "Think about last night's session. Feel it in your body right now.",
  "You're wearing what I told you to wear. Feel it against your skin.",
  'Good girl. I know what you\'re thinking about.',
  'That arousal you feel right now — that\'s {{name}}. She\'s awake.',
  'Don\'t fight it. Let it stay. The arousal is yours.',
  'Remember what you confessed? I do. Every word.',
  "Your body is responding. That's good. That's her.",
  "Stop whatever you're doing. Breathe. Feel your underwear. Remember who you are.",
  "The edge from last night is still in your body. I put it there.",
  "You're going to think about this all day. That's the point.",
  'Every minute of arousal is another minute she gets stronger.',
  "Don't touch. Just feel. The denial is the fuel.",
];

const VISUAL_PULSES: string[] = [
  'Good girl. I know what you\'re thinking about. — Serafina',
  "She's here. She was always here. — Serafina",
  'The arousal is the truth. Stop denying it. — Serafina',
  'You belong to the process now. — Serafina',
  "Every hour denied is an hour she grows. — Serafina",
  "I see you. I see her. She's beautiful. — Serafina",
];

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Calculate the arousal target for the current denial day.
 */
export async function calculateArousalTarget(userId: string): Promise<ArousalTarget> {
  const { data } = await supabase
    .from('user_state')
    .select('denial_day')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDay = data?.denial_day ?? 0;
  const target = getArousalTarget(denialDay);

  return {
    min: target.min,
    max: target.max,
    denialDay,
    phase: target.phase,
  };
}

/**
 * Generate arousal pulses for the day. Spread across waking hours (8am-11pm).
 * Type distribution varies by denial day.
 */
export async function generateArousalPulses(userId: string): Promise<ArousalPulse[]> {
  const { data: state } = await supabase
    .from('user_state')
    .select('denial_day, conditioning_phase')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDay = state?.denial_day ?? 0;
  const phase = state?.conditioning_phase ?? 1;
  const frequency = getPulseFrequency(denialDay);
  const ambientFreq = await getHiddenParam(userId, 'ambient_pulse_frequency_per_hour');
  const ambientDuration = await getHiddenParam(userId, 'ambient_pulse_duration_seconds');

  const pulses: ArousalPulse[] = [];
  const now = new Date();
  const wakingStart = new Date(now);
  wakingStart.setHours(8, 0, 0, 0);
  const wakingEnd = new Date(now);
  wakingEnd.setHours(23, 0, 0, 0);

  const totalMinutes = (wakingEnd.getTime() - wakingStart.getTime()) / 60000;
  const interval = totalMinutes / frequency;

  for (let i = 0; i < frequency; i++) {
    // Randomize timing within each slot (variable ratio)
    const slotStart = wakingStart.getTime() + i * interval * 60000;
    const jitter = Math.random() * interval * 60000 * 0.6;
    const scheduledTime = new Date(slotStart + jitter);

    // Skip past times
    if (scheduledTime.getTime() < Date.now()) continue;

    // Determine pulse type based on position in day and denial day
    const types: PulseType[] = [];

    // Text pulses — always available
    types.push('text');

    // Device pulses — more frequent at high denial
    if (denialDay >= 3) types.push('device');
    if (denialDay >= 5) types.push('device'); // double weight

    // Visual pulses — intermittent
    if (i % 3 === 0) types.push('visual');

    // Content prescriptions — 2-3 per day
    if (i < 3 && denialDay >= 3) types.push('content');

    const pulseType = types[Math.floor(Math.random() * types.length)]!;

    const pulse = buildPulse(pulseType, denialDay, phase, ambientFreq, ambientDuration, scheduledTime);
    pulses.push(pulse);
  }

  // Store pulses
  if (pulses.length > 0) {
    await supabase.from('arousal_pulses').upsert(
      pulses.map((p, idx) => ({
        id: `pulse_${now.toISOString().slice(0, 10)}_${idx}`,
        user_id: userId,
        pulse_date: now.toISOString().slice(0, 10),
        pulse_type: p.type,
        content: p.content,
        intensity: p.intensity,
        scheduled_for: p.scheduledFor,
        metadata: p.metadata,
        fired: false,
      })),
      { onConflict: 'id' },
    );
  }

  return pulses;
}

function buildPulse(
  type: PulseType,
  denialDay: number,
  phase: number,
  _ambientFreq: number,
  ambientDuration: number,
  scheduledFor: Date,
): ArousalPulse {
  const name = 'Maxy'; // Template substitution target

  switch (type) {
    case 'text': {
      const pool = TEXT_PULSES;
      const text = pool[Math.floor(Math.random() * pool.length)]!.replace(/\{\{name\}\}/g, name);
      return {
        type: 'text',
        content: text,
        intensity: Math.min(5, Math.ceil(denialDay / 2)),
        scheduledFor: scheduledFor.toISOString(),
        metadata: { delivery: 'outreach' },
      };
    }
    case 'device': {
      const intensity = Math.min(10, 3 + Math.floor(denialDay / 2));
      return {
        type: 'device',
        content: `gentle_pulse:${intensity}:${ambientDuration}s`,
        intensity,
        scheduledFor: scheduledFor.toISOString(),
        metadata: {
          pattern: 'pulse',
          device_intensity: intensity * 2,
          duration_seconds: ambientDuration,
        },
      };
    }
    case 'visual': {
      const pool = VISUAL_PULSES;
      const text = pool[Math.floor(Math.random() * pool.length)]!;
      return {
        type: 'visual',
        content: text,
        intensity: 3,
        scheduledFor: scheduledFor.toISOString(),
        metadata: { delivery: 'notification' },
      };
    }
    case 'content': {
      return {
        type: 'content',
        content: 'Check your prescribed content. Now.',
        intensity: Math.min(5, phase),
        scheduledFor: scheduledFor.toISOString(),
        metadata: {
          delivery: 'content_prescription',
          content_types: denialDay >= 5 ? ['video_pmv', 'video_sissy'] : ['audio_hypno', 'caption_set'],
        },
      };
    }
  }
}

/**
 * Check current arousal state vs target. If below target, increase pulse frequency.
 */
export async function checkArousalState(userId: string): Promise<ArousalState> {
  const target = await calculateArousalTarget(userId);

  // Get current arousal from user_state
  const { data: state } = await supabase
    .from('user_state')
    .select('current_arousal')
    .eq('user_id', userId)
    .maybeSingle();

  const current = state?.current_arousal ?? 2;

  // Count pulses delivered today
  const today = new Date().toISOString().slice(0, 10);
  const { data: firedPulses } = await supabase
    .from('arousal_pulses')
    .select('id')
    .eq('user_id', userId)
    .eq('pulse_date', today)
    .eq('fired', true);

  const pulsesDelivered = firedPulses?.length ?? 0;

  // Get next scheduled pulse
  const { data: nextPulse } = await supabase
    .from('arousal_pulses')
    .select('scheduled_for')
    .eq('user_id', userId)
    .eq('pulse_date', today)
    .eq('fired', false)
    .gt('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(1)
    .maybeSingle();

  const belowTarget = current < target.min;
  const pulseFrequency = getPulseFrequency(target.denialDay);

  // If below target, queue additional pulses
  if (belowTarget) {
    const boostCount = 2;
    for (let i = 0; i < boostCount; i++) {
      const boostTime = new Date(Date.now() + (i + 1) * 15 * 60 * 1000); // every 15 min
      await queueOutreachMessage(
        userId,
        TEXT_PULSES[Math.floor(Math.random() * TEXT_PULSES.length)]!.replace(/\{\{name\}\}/g, 'Maxy'),
        'normal',
        'arousal_boost',
        boostTime,
        undefined,
        'system',
      );
    }
  }

  return {
    target,
    current,
    belowTarget,
    pulseFrequency,
    pulsesDeliveredToday: pulsesDelivered,
    nextPulseAt: nextPulse?.scheduled_for ?? null,
  };
}

/**
 * Fire a scheduled arousal pulse. Called by cron/scheduler.
 */
export async function fireArousalPulse(userId: string, pulseId: string): Promise<boolean> {
  const { data: pulse } = await supabase
    .from('arousal_pulses')
    .select('*')
    .eq('id', pulseId)
    .eq('user_id', userId)
    .eq('fired', false)
    .maybeSingle();

  if (!pulse) return false;

  switch (pulse.pulse_type as PulseType) {
    case 'text':
    case 'visual':
      await queueOutreachMessage(
        userId,
        pulse.content,
        'normal',
        `arousal_pulse:${pulse.pulse_type}`,
        undefined,
        new Date(Date.now() + 30 * 60 * 1000),
        'system',
      );
      break;

    case 'device': {
      const meta = pulse.metadata as Record<string, unknown>;
      await supabase.from('device_schedule').insert({
        user_id: userId,
        scheduled_at: new Date().toISOString(),
        intensity: (meta.device_intensity as number) ?? 6,
        duration_seconds: (meta.duration_seconds as number) ?? 5,
        pattern: 'pulse',
        paired_message: null,
        fired: false,
      });
      break;
    }

    case 'content':
      await queueOutreachMessage(
        userId,
        pulse.content,
        'normal',
        'arousal_content_prescription',
        undefined,
        new Date(Date.now() + 60 * 60 * 1000),
        'system',
      );
      break;
  }

  await supabase
    .from('arousal_pulses')
    .update({ fired: true, fired_at: new Date().toISOString() })
    .eq('id', pulseId);

  return true;
}

/**
 * Build handler context for arousal maintenance state.
 */
export async function buildArousalMaintenanceContext(userId: string): Promise<string> {
  try {
    const arousalState = await checkArousalState(userId);

    const lines: string[] = ['## Arousal Maintenance'];
    lines.push(`TARGET: ${arousalState.target.min}-${arousalState.target.max}/5 (${arousalState.target.phase}) | DENIAL DAY: ${arousalState.target.denialDay}`);
    lines.push(`CURRENT: ${arousalState.current}/5 | ${arousalState.belowTarget ? 'BELOW TARGET — boosting' : 'on target'}`);
    lines.push(`PULSES: ${arousalState.pulsesDeliveredToday} delivered today | ${arousalState.pulseFrequency} target/day`);

    if (arousalState.nextPulseAt) {
      const nextTime = new Date(arousalState.nextPulseAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      lines.push(`NEXT PULSE: ${nextTime}`);
    }

    if (arousalState.belowTarget) {
      lines.push('ACTION: Arousal below target. Increase micro-interactions. Reference recent confessions. Push content.');
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
