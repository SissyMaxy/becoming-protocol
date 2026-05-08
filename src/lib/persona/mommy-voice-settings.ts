/**
 * Per-affect ElevenLabs voice tuning for Mommy outreach TTS.
 *
 * Voice ID stays constant (env ELEVENLABS_VOICE_ID); only the per-utterance
 * settings modulate so a "patient" line sounds steady and warm and a
 * "possessive" line sounds tighter, more deliberate. Mirrored at
 * supabase/functions/_shared/mommy-voice-settings.ts — keep them in sync.
 *
 * stability: 0–1. Lower = more emotive / variable; higher = steadier.
 * similarity_boost: 0–1. How close to the cloned voice; higher = more
 *   recognizable, lower = looser delivery.
 * style: 0–1. Style exaggeration (v2 multilingual). Higher = more dramatic.
 */

import type { Affect } from './dommy-mommy';

export interface MommyVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

export const DEFAULT_MOMMY_VOICE_SETTINGS: MommyVoiceSettings = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.4,
  use_speaker_boost: true,
};

const AFFECT_VOICE_SETTINGS: Record<Affect, MommyVoiceSettings> = {
  // Wet, hungry, dripping — looser, more emotive, dramatic.
  hungry:     { stability: 0.30, similarity_boost: 0.78, style: 0.65, use_speaker_boost: true },
  // Aching for relief, edge-of-need — emotive but a touch more controlled.
  aching:     { stability: 0.35, similarity_boost: 0.80, style: 0.60, use_speaker_boost: true },
  // Pleased, sweet ramp — warmer, slightly playful.
  delighted:  { stability: 0.55, similarity_boost: 0.82, style: 0.50, use_speaker_boost: true },
  // Soft and cuddly — steadier, less style exaggeration.
  indulgent:  { stability: 0.65, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true },
  // Cool surveillance — flatter, more deliberate.
  watching:   { stability: 0.78, similarity_boost: 0.78, style: 0.20, use_speaker_boost: true },
  // Long, even, unhurried — most stable.
  patient:    { stability: 0.85, similarity_boost: 0.78, style: 0.15, use_speaker_boost: true },
  // Light, teasing, smirk — variable but bright.
  amused:     { stability: 0.45, similarity_boost: 0.80, style: 0.55, use_speaker_boost: true },
  // Tight, controlling — steady but with bite.
  possessive: { stability: 0.70, similarity_boost: 0.85, style: 0.45, use_speaker_boost: true },
  // Edgy, restless, unpredictable — most variable.
  restless:   { stability: 0.25, similarity_boost: 0.78, style: 0.70, use_speaker_boost: true },
};

export function affectToVoiceSettings(affect: string | null | undefined): MommyVoiceSettings {
  if (!affect) return DEFAULT_MOMMY_VOICE_SETTINGS;
  const key = String(affect).toLowerCase().trim() as Affect;
  return AFFECT_VOICE_SETTINGS[key] ?? DEFAULT_MOMMY_VOICE_SETTINGS;
}

export function isKnownAffect(value: string | null | undefined): value is Affect {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(AFFECT_VOICE_SETTINGS, value);
}

export const MOMMY_VOICE_SETTINGS_BY_AFFECT = AFFECT_VOICE_SETTINGS;
