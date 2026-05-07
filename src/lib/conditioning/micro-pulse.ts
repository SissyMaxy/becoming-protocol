/**
 * Micro-Conditioning Pulse System (P10.7)
 *
 * 30-second affirmation pulses that fire as ambush events during the day.
 * Selects from a hardcoded affirmation pool, optionally plays cached audio,
 * activates Lovense with gentle_wave(3) for 10 seconds, and logs to
 * conditioning_sessions_v2 as session_type='micro_drop'.
 */

import { supabase } from '../supabase';
import { getSignedAssetUrl } from '../storage/signed-url';

// ============================================
// TYPES
// ============================================

export interface MicroPulse {
  text: string;
  category: 'identity' | 'embodiment' | 'submission' | 'trance';
  intensity: number; // 1-5
}

export interface MicroPulseDelivery {
  pulse: MicroPulse;
  audioUrl?: string;
  sessionId?: string;
  delivered: boolean;
}

// ============================================
// AFFIRMATION POOL
// ============================================

const AFFIRMATION_POOL: MicroPulse[] = [
  {
    text: "She's here. She was always here. Good girl.",
    category: 'identity',
    intensity: 3,
  },
  {
    text: "You are Maxy. That's not a choice anymore. It's a fact.",
    category: 'identity',
    intensity: 4,
  },
  {
    text: 'Feel your body. This is her body. Let it be.',
    category: 'embodiment',
    intensity: 3,
  },
  {
    text: 'Every breath as her. Every heartbeat as her.',
    category: 'embodiment',
    intensity: 2,
  },
  {
    text: 'The mirror knows. You know. Good girl.',
    category: 'identity',
    intensity: 3,
  },
  {
    text: "Drop. Deeper. She's here.",
    category: 'trance',
    intensity: 4,
  },
  {
    text: "You don't perform Maxy. You are Maxy.",
    category: 'identity',
    intensity: 5,
  },
  {
    text: "Let go. Feel it. She's always been here.",
    category: 'submission',
    intensity: 3,
  },
];

// ============================================
// PULSE GENERATION
// ============================================

/**
 * Select a random affirmation from the pool.
 */
export function generateMicroPulse(_userId: string): MicroPulse {
  const index = Math.floor(Math.random() * AFFIRMATION_POOL.length);
  return { ...AFFIRMATION_POOL[index] };
}

// ============================================
// DELIVERY
// ============================================

/**
 * Full micro-pulse delivery:
 * 1. Select random affirmation
 * 2. Check for cached audio version (content_curriculum with micro_pulse category)
 * 3. Activate Lovense with gentle_wave(3) for 10 seconds
 * 4. Log to conditioning_sessions_v2 as micro_drop
 */
export async function deliverMicroPulse(userId: string): Promise<MicroPulseDelivery> {
  const pulse = generateMicroPulse(userId);
  let audioUrl: string | undefined;
  let sessionId: string | undefined;

  try {
    // 1. Check for cached audio version
    const { data: cachedAudio } = await supabase
      .from('content_curriculum')
      .select('id, audio_storage_url')
      .eq('media_type', 'custom_handler')
      .eq('category', 'micro_pulse')
      .not('audio_storage_url', 'is', null)
      .limit(10);

    if (cachedAudio && cachedAudio.length > 0) {
      // Pick a random cached audio. After migration 260 the audio bucket
      // is private and audio_storage_url holds an object path — sign for
      // the inline player. 10-min TTL: micro-pulses are short and the
      // audio plays immediately on delivery.
      const pick = cachedAudio[Math.floor(Math.random() * cachedAudio.length)];
      audioUrl = (await getSignedAssetUrl('audio', pick.audio_storage_url, 600)) || undefined;
    }

    // 2. Activate Lovense with gentle_wave(3) for 10 seconds — fire-and-forget
    supabase.functions.invoke('lovense-command', {
      body: {
        user_id: userId,
        action: 'gentle_wave',
        intensity: 3,
        duration_seconds: 10,
        source: 'micro_pulse',
      },
    }).catch((err) => {
      console.warn('[micro-pulse] Lovense activation failed:', err);
    });

    // 3. Log to conditioning_sessions_v2
    const { data: session } = await supabase
      .from('conditioning_sessions_v2')
      .insert({
        user_id: userId,
        session_type: 'micro_drop',
        started_at: new Date().toISOString(),
        completed: true,
        ended_at: new Date(Date.now() + 30000).toISOString(), // 30 seconds
        source: 'micro_pulse',
        trance_depth_estimated: null,
        arousal_level_estimated: null,
        notes: `Micro pulse: "${pulse.text}" [${pulse.category}/${pulse.intensity}]`,
      })
      .select('id')
      .single();

    sessionId = session?.id;

    return {
      pulse,
      audioUrl,
      sessionId,
      delivered: true,
    };
  } catch (err) {
    console.error('[micro-pulse] deliverMicroPulse error:', err);
    return {
      pulse,
      audioUrl,
      sessionId,
      delivered: false,
    };
  }
}
