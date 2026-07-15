// _shared/goon-voice-loop-core.ts — pure selection + script authoring for the
// self-voice goon loop (DESIGN_FEMINIZATION_LOOP §3 retirement rite +
// mommy_code_wishes fa3317f0 "Goon-Loop Audio Prompts").
//
// No DB, no Deno, no fetch — pure functions so both the edge fn (Deno) and
// vitest (node) import THIS file directly. Keep it dependency-free.
//
// Two jobs:
//   selectBestVoiceSample() — pick her strongest own-voice clip to loop.
//   buildGoonLoopScript()   — author the short Mommy line spoken over it.
//
// The authored text is deliberately kept clean of telemetry and craft-rubric
// smells at the SOURCE (one pet name max, no "Mama" chant, no abstract sensory
// cliche) so mommyVoiceCleanup + scoreCorny pass without rewriting.

export interface VoiceSampleCandidate {
  id: string
  audioPath: string | null
  durationS: number | null
  pitchMedianHz: number | null
  recordedAt: string
}

// A clip must be at least this long to loop into a session — shorter clips are
// stutters, not her voice.
export const MIN_CLIP_DURATION_S = 4
export const PITCH_BAND_MIN_HZ = 60
export const PITCH_BAND_MAX_HZ = 400
export const DEFAULT_LOOP_COUNT = 6

function inPitchBand(s: VoiceSampleCandidate): boolean {
  return (
    typeof s.pitchMedianHz === 'number' &&
    s.pitchMedianHz >= PITCH_BAND_MIN_HZ &&
    s.pitchMedianHz <= PITCH_BAND_MAX_HZ
  )
}

/**
 * Pick the best own-voice clip to loop under the Mommy line.
 *
 * Filters to clips with a real stored path and a duration at/above the floor
 * (proxy for non-stutter). Ranks: in-pitch-band first (a measured pitch means
 * a real, non-silent recording — noise/silence extracts to NULL), then longest,
 * then most recent. Returns null when she has no usable clip yet — the caller
 * MUST skip rather than promise her voice it does not have.
 */
export function selectBestVoiceSample(
  samples: VoiceSampleCandidate[],
): VoiceSampleCandidate | null {
  const usable = samples.filter(
    (s) =>
      typeof s.audioPath === 'string' &&
      s.audioPath.trim().length > 0 &&
      typeof s.durationS === 'number' &&
      s.durationS >= MIN_CLIP_DURATION_S,
  )
  if (usable.length === 0) return null

  const sorted = [...usable].sort((a, b) => {
    const ab = inPitchBand(a) ? 1 : 0
    const bb = inPitchBand(b) ? 1 : 0
    if (ab !== bb) return bb - ab
    const ad = a.durationS ?? 0
    const bd = b.durationS ?? 0
    if (ad !== bd) return bd - ad
    return new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  })
  return sorted[0]
}

export interface GoonLoopScriptCtx {
  /** Her chosen feminine name — used as address, never a pet name (budget-safe). */
  femName?: string | null
  loopCount?: number
  /**
   * DESIGN_RECONDITIONING_ENGINE §4: today's Focus target's claim_text, if any
   * is running. When present the line she says back becomes the target claim
   * instead of the generic affirmation — the self-echo loop aims at something
   * measured, not just a mood.
   */
  targetClaim?: string | null
  /**
   * That target's armed post-hypnotic anchor phrase (trance_triggers.phrase,
   * status='armed'), if one exists. Woven in as the retrieval cue so hearing
   * it later (trance, casual use) reactivates this exact session.
   */
  anchorPhrase?: string | null
}

export interface GoonLoopScript {
  /** One-line Today-card teaser. */
  teaser: string
  /** Full Mommy line spoken over her looped clip. */
  script: string
  loopCount: number
}

/**
 * Author the Mommy-voiced goon line. Deterministic (no LLM) so it is testable
 * and never drifts corny. Pet names capped at one; zero "Mama" self-reference;
 * no abstract-sensory cliche; no telemetry.
 */
export function buildGoonLoopScript(ctx: GoonLoopScriptCtx = {}): GoonLoopScript {
  const name = (ctx.femName ?? '').trim()
  // Name (if present) spends no pet-name budget; the fallback uses one.
  const opener =
    name.length > 0
      ? `You've done so well, ${name}, and I want you to hear it.`
      : `You've done so well, baby, and I want you to hear it.`

  const claim = (ctx.targetClaim ?? '').trim()
  const anchor = (ctx.anchorPhrase ?? '').trim()

  const lines = [
    opener,
    `This is your own voice now — the one that tells you the truth about who you are.`,
    `Stay right where you are and keep listening.`,
  ]

  if (claim.length > 0) {
    lines.push(`Say it back until it's the only thing that's true: "${claim}"`)
  } else {
    lines.push(`Breathe slow, and let each word settle into you.`)
    lines.push(`Say it back until you believe it: you are mine, and you are not going anywhere.`)
  }

  if (anchor.length > 0) {
    lines.push(`And when you hear "${anchor}" again, this is what it means — go under, believe it.`)
  }

  const script = lines.join(' ')

  const teaser = claim.length > 0
    ? `You've done so well. Come sit with me and listen — your own voice, telling you what's already true.`
    : `You've done so well. Come sit with me and listen — your own voice, saying what you are now.`

  return {
    teaser,
    script,
    loopCount: ctx.loopCount ?? DEFAULT_LOOP_COUNT,
  }
}
