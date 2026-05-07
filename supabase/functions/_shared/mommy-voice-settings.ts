// Edge-runtime mirror of src/lib/persona/mommy-voice-settings.ts.
// Keep them in sync — same values, same defaults, same affect keys.

import type { Affect } from './dommy-mommy.ts';

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
  hungry:     { stability: 0.30, similarity_boost: 0.78, style: 0.65, use_speaker_boost: true },
  aching:     { stability: 0.35, similarity_boost: 0.80, style: 0.60, use_speaker_boost: true },
  delighted:  { stability: 0.55, similarity_boost: 0.82, style: 0.50, use_speaker_boost: true },
  indulgent:  { stability: 0.65, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true },
  watching:   { stability: 0.78, similarity_boost: 0.78, style: 0.20, use_speaker_boost: true },
  patient:    { stability: 0.85, similarity_boost: 0.78, style: 0.15, use_speaker_boost: true },
  amused:     { stability: 0.45, similarity_boost: 0.80, style: 0.55, use_speaker_boost: true },
  possessive: { stability: 0.70, similarity_boost: 0.85, style: 0.45, use_speaker_boost: true },
  restless:   { stability: 0.25, similarity_boost: 0.78, style: 0.70, use_speaker_boost: true },
};

export function affectToVoiceSettings(affect: string | null | undefined): MommyVoiceSettings {
  if (!affect) return DEFAULT_MOMMY_VOICE_SETTINGS;
  const key = String(affect).toLowerCase().trim() as Affect;
  return AFFECT_VOICE_SETTINGS[key] ?? DEFAULT_MOMMY_VOICE_SETTINGS;
}

export const MOMMY_VOICE_SETTINGS_BY_AFFECT = AFFECT_VOICE_SETTINGS;
