// _shared/tts.ts — single text-to-speech chokepoint for every Mommy-voiced render.
//
// Provider selection is env-driven and fail-closed at call time:
//   - ElevenLabs  if ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID are set (best quality,
//                 honours affect-modulated voice_settings)
//   - OpenAI      else if OPENAI_API_KEY is set (gpt-4o-mini-tts, 'shimmer' — the
//                 warm feminine voice; affect is mapped to a tone `instructions` hint)
//   - none        → throws ttsConfigError(); the caller records it and stays pending,
//                 never emitting a fake/silent track.
//
// This project has NO ElevenLabs secrets provisioned, so without the OpenAI path
// every trance/hypno/echo render is dead. self-echo-mixer proved the fallback on a
// real session; this module generalizes it so audio-session-render and
// outreach-tts-render (and the reconditioning engine's cinematic delivery) all share
// one working implementation instead of three ElevenLabs-only copies.

import { affectToVoiceSettings, type MommyVoiceSettings } from './mommy-voice-settings.ts'

export type TtsProvider = 'elevenlabs' | 'openai'

export interface TtsResult {
  bytes: Uint8Array
  provider: TtsProvider
  model: string
  /** ElevenLabs voice id used, when provider === 'elevenlabs' */
  voiceId?: string
  /** The ElevenLabs voice_settings sent (also echoed for audit on the OpenAI path) */
  voiceSettings: MommyVoiceSettings
}

export interface TtsOptions {
  /** Mommy affect key (e.g. 'possessive', 'aching'); drives ElevenLabs voice_settings
   *  and the OpenAI tone instructions. Ignored if voiceSettings is passed explicitly. */
  affect?: string | null
  /** Override the resolved ElevenLabs voice_settings. */
  voiceSettings?: MommyVoiceSettings
  /** Per-call TTS timeout. Default 60s. */
  timeoutMs?: number
  /** Override the OpenAI voice (default 'shimmer'). */
  openaiVoice?: string
}

const DEFAULT_TIMEOUT_MS = 60_000
const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts'
const OPENAI_TTS_VOICE = 'shimmer'
const ELEVENLABS_MODEL = 'eleven_multilingual_v2'

/** Which provider will be used, or null if nothing is configured. Pure env read. */
export function ttsProvider(): TtsProvider | null {
  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (elevenKey && voiceId) return 'elevenlabs'
  if (openaiKey) return 'openai'
  return null
}

/** True when at least one TTS provider is configured. */
export function ttsConfigured(): boolean {
  return ttsProvider() !== null
}

export function ttsConfigError(): string {
  return 'render not configured (no ELEVENLABS_API_KEY+ELEVENLABS_VOICE_ID and no OPENAI_API_KEY)'
}

// OpenAI gpt-4o-mini-tts takes a free-text `instructions` field to steer delivery.
// ElevenLabs encodes the same intent numerically via voice_settings, so this only
// applies on the OpenAI path.
const AFFECT_INSTRUCTIONS: Record<string, string> = {
  hungry: 'Warm, breathy, close to the ear; slow and wanting.',
  aching: 'Soft, yearning, unhurried; a low ache under every word.',
  delighted: 'Bright, fond, smiling; light and affectionate.',
  indulgent: 'Slow, doting, generous; savour each phrase.',
  watching: 'Calm, steady, quietly attentive; unhurried and sure.',
  patient: 'Gentle, even, reassuring; all the time in the world.',
  amused: 'Playful, teasing, a smile in the voice.',
  possessive: 'Low, sure, possessive; intimate and certain, never harsh.',
  restless: 'Urgent, close, a little breathless; leaning in.',
}

function affectToInstructions(affect?: string | null): string | undefined {
  if (!affect) return undefined
  return AFFECT_INSTRUCTIONS[String(affect).toLowerCase().trim()]
}

/**
 * Render `text` to MP3 bytes via the configured provider. Throws (fails loud) on
 * missing config or a non-2xx TTS response so callers persist the error and retry
 * rather than emit silence.
 */
export async function synthesizeMommySpeech(
  text: string,
  opts: TtsOptions = {},
): Promise<TtsResult> {
  const provider = ttsProvider()
  if (!provider) throw new Error(ttsConfigError())

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const voiceSettings = opts.voiceSettings ?? affectToVoiceSettings(opts.affect)

  if (provider === 'elevenlabs') {
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')!
    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID')!
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', 'xi-api-key': elevenKey },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: voiceSettings,
        }),
      },
    )
    if (!res.ok) {
      const detail = await res.text().catch(() => 'unknown')
      throw new Error(`elevenlabs_${res.status}:${detail.slice(0, 200)}`)
    }
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      provider,
      model: ELEVENLABS_MODEL,
      voiceId,
      voiceSettings,
    }
  }

  // OpenAI TTS — returns mp3 bytes directly.
  const openaiKey = Deno.env.get('OPENAI_API_KEY')!
  const voice = opts.openaiVoice ?? OPENAI_TTS_VOICE
  const instructions = affectToInstructions(opts.affect)
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice,
      input: text,
      response_format: 'mp3',
      ...(instructions ? { instructions } : {}),
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => 'unknown')
    throw new Error(`openai_${res.status}:${detail.slice(0, 200)}`)
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    provider,
    model: OPENAI_TTS_MODEL,
    voiceSettings,
  }
}
