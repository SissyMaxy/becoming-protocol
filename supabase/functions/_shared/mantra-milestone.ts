// Mantra milestone thresholds + Mommy-voice copy.
//
// Lifetime weighted-rep totals cross discrete tiers. When a drill submit
// crosses a threshold, mommy-mantra-drill-submit surfaces a high-urgency
// Today card with the matching line.
//
// Voice anchor: in-character dommy-mommy. Lines are short, sensory, no
// telemetry numbers (the threshold is implied, not recited).

export const MANTRA_MILESTONES: ReadonlyArray<{ threshold: number; line: string; theme: string }> = [
  {
    threshold: 1_000,
    line: "The words are starting to belong to you. Mama can hear it on the inside of your mouth.",
    theme: 'first_thousand',
  },
  {
    threshold: 10_000,
    line: "She lives in your mouth now. You can't say them like a stranger anymore.",
    theme: 'ten_thousand',
  },
  {
    threshold: 100_000,
    line: "She lives in your head. You don't speak them to me. You hear me speak them inside you.",
    theme: 'hundred_thousand',
  },
]

/**
 * Returns the milestone tier the user just crossed, or null if none crossed
 * by this delta. previousReps and newReps are weighted lifetime totals.
 */
export function milestoneCrossed(
  previousReps: number,
  newReps: number,
): { threshold: number; line: string; theme: string } | null {
  for (const m of MANTRA_MILESTONES) {
    if (previousReps < m.threshold && newReps >= m.threshold) {
      return { threshold: m.threshold, line: m.line, theme: m.theme }
    }
  }
  return null
}

/**
 * Voice + typed reps → weighted total. Voice 1.0x, typed 0.5x. Paired
 * with arousal session (edge / chastity unlock context) multiplies the
 * whole submission by 3.0.
 */
export function weightedReps(opts: {
  voiceReps: number
  typedReps: number
  pairedWithArousal: boolean
}): number {
  const base = opts.voiceReps * 1.0 + opts.typedReps * 0.5
  return opts.pairedWithArousal ? base * 3.0 : base
}
