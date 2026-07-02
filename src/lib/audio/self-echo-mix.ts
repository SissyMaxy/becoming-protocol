// self-echo-mix — pure gain/loop/timing math for the two-track self-echo player.
//
// The self-echo "composite" is NOT a single rendered mp3 (ffmpeg is unavailable
// on Vercel serverless — see src/lib/conditioning/elevenlabs.ts). Instead the
// Mommy render and her own-voice clip are layered at PLAY TIME in the browser
// via the Web Audio API (SelfEchoPlayer). This module is the pure, testable
// core of that layering: given the two clip durations and the intended
// loop_count, it computes how many times to loop her own voice under the Mommy
// track, at what gain, and with what fade envelope.
//
// No DOM, no Web Audio, no React — so vitest imports it directly and the player
// component consumes the same numbers it plays.

/** Her own voice sits ~-9dB under the Mommy track — present as a bed, never
 *  competing with the words on top. */
export const OWN_VOICE_GAIN_DB = -9;

/** Gentle fade at the head and tail of every loop so the bed breathes instead
 *  of clicking on each repeat. Capped to a quarter of the clip so a very short
 *  clip still keeps a sustain in the middle. */
export const DEFAULT_FADE_S = 0.4;

export interface LoopSchedule {
  /** How many times her own-voice clip plays under the Mommy track. */
  loops: number;
  /** Bed gain in decibels (negative = quieter than the Mommy track). */
  gainDb: number;
  /** Same gain as a linear multiplier for a Web Audio GainNode. */
  gainLinear: number;
  /** Per-loop fade-in duration (seconds). */
  fadeInS: number;
  /** Per-loop fade-out duration (seconds). */
  fadeOutS: number;
  /** Duration of one own-voice loop (seconds). */
  ownDurationS: number;
  /** Total length of the looped bed = loops * ownDurationS. */
  totalBedDurationS: number;
  /** True when the bed covers the whole Mommy track (no gap of silence). */
  coversMommy: boolean;
  /** Start offset (seconds, relative to session start) of each loop. */
  starts: number[];
}

/** Convert a decibel value to a linear amplitude multiplier. */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Compute the loop schedule for laying her own voice UNDER the Mommy track.
 *
 * Contract:
 *  - The bed always covers the full Mommy track length (loops enough times so
 *    there is no trailing silence under her words).
 *  - The intended loop_count is honoured as a MINIMUM — if the Mommy track is
 *    short, she still hears her voice loop_count times; if it is long, the bed
 *    loops as many more times as needed to cover it.
 *  - Bed gain is fixed at OWN_VOICE_GAIN_DB (~-9dB).
 *  - Every loop gets a gentle fade in/out.
 *
 * Degenerate inputs (non-positive / non-finite own duration) return a zero-loop
 * schedule — the player treats that as "no bed, Mommy track only".
 */
export function computeLoopSchedule(
  ownDurationS: number,
  loopCount: number,
  mommyDurationS: number,
): LoopSchedule {
  const gainDb = OWN_VOICE_GAIN_DB;
  const gainLinear = dbToLinear(gainDb);

  const safeOwn = Number.isFinite(ownDurationS) && ownDurationS > 0 ? ownDurationS : 0;
  const requested = Number.isFinite(loopCount) && loopCount > 0 ? Math.floor(loopCount) : 1;
  const mommy = Number.isFinite(mommyDurationS) && mommyDurationS > 0 ? mommyDurationS : 0;

  if (safeOwn === 0) {
    return {
      loops: 0,
      gainDb,
      gainLinear,
      fadeInS: 0,
      fadeOutS: 0,
      ownDurationS: 0,
      totalBedDurationS: 0,
      coversMommy: false,
      starts: [],
    };
  }

  // Loops needed to cover the Mommy track; never fewer than the requested count.
  const loopsToCover = mommy > 0 ? Math.ceil(mommy / safeOwn) : requested;
  const loops = Math.max(requested, loopsToCover);

  // Gentle fade — up to DEFAULT_FADE_S per side, but never more than a quarter
  // of the clip so fade-in + fade-out leave a sustain in the middle.
  const fade = Math.min(DEFAULT_FADE_S, safeOwn / 4);

  const starts: number[] = [];
  for (let i = 0; i < loops; i++) starts.push(i * safeOwn);

  const totalBedDurationS = loops * safeOwn;

  return {
    loops,
    gainDb,
    gainLinear,
    fadeInS: fade,
    fadeOutS: fade,
    ownDurationS: safeOwn,
    totalBedDurationS,
    coversMommy: mommy === 0 ? true : totalBedDurationS >= mommy,
    starts,
  };
}

/** JSON manifest written to self_echo_sessions.mixed_audio_path once both
 *  tracks exist. This is NOT a single-file mp3 path — the composite is layered
 *  at play time. mix_status='mixed' means "this manifest is ready to play". */
export interface SelfEchoManifest {
  kind: 'self_echo_manifest';
  mommy_render_path: string;
  own_voice_path: string;
  loop_count: number;
  gain_db: number;
  own_voice_duration_s: number | null;
}

/** Parse a mixed_audio_path value into a manifest, or null if it is not one
 *  (e.g. legacy null, or a future single-file path). Never throws. */
export function parseSelfEchoManifest(value: string | null | undefined): SelfEchoManifest | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<SelfEchoManifest>;
    if (parsed.kind !== 'self_echo_manifest') return null;
    if (!parsed.mommy_render_path || !parsed.own_voice_path) return null;
    return {
      kind: 'self_echo_manifest',
      mommy_render_path: parsed.mommy_render_path,
      own_voice_path: parsed.own_voice_path,
      loop_count: typeof parsed.loop_count === 'number' ? parsed.loop_count : 6,
      gain_db: typeof parsed.gain_db === 'number' ? parsed.gain_db : OWN_VOICE_GAIN_DB,
      own_voice_duration_s:
        typeof parsed.own_voice_duration_s === 'number' ? parsed.own_voice_duration_s : null,
    };
  } catch {
    return null;
  }
}
