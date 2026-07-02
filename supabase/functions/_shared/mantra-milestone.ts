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
 * Returns ALL milestone tiers crossed by this delta, lowest first.
 * previousReps and newReps are weighted lifetime totals. A single huge
 * submission (or a reconciliation catch-up) can cross more than one tier —
 * the old lowest-only return silently swallowed the higher ones.
 */
export function milestonesCrossed(
  previousReps: number,
  newReps: number,
): Array<{ threshold: number; line: string; theme: string }> {
  const crossed: Array<{ threshold: number; line: string; theme: string }> = []
  for (const m of MANTRA_MILESTONES) {
    if (previousReps < m.threshold && newReps >= m.threshold) {
      crossed.push({ threshold: m.threshold, line: m.line, theme: m.theme })
    }
  }
  return crossed
}

/**
 * Back-compat single-tier variant (lowest crossed). Prefer
 * milestonesCrossed — this exists so older callers/tests keep compiling.
 */
export function milestoneCrossed(
  previousReps: number,
  newReps: number,
): { threshold: number; line: string; theme: string } | null {
  return milestonesCrossed(previousReps, newReps)[0] ?? null
}

/**
 * Rep honesty ceiling: a voice rep takes ≥2 seconds to say. Claimed voice
 * reps are capped at floor(duration_s / 2); no recording duration → no
 * verifiable voice reps (fail-closed — anticipate circumvention).
 */
export function capVoiceReps(claimedVoiceReps: number, durationS: number | null | undefined): number {
  const claimed = Math.max(0, Math.floor(Number(claimedVoiceReps) || 0))
  const dur = Number(durationS)
  if (!Number.isFinite(dur) || dur <= 0) return 0
  return Math.min(claimed, Math.floor(dur / 2))
}

/**
 * Pure TS mirror of the mantra_apply_drill RPC's idempotency semantics
 * (migration 637) — used by the regression test that pins "resubmitting the
 * same session id never double-counts." State is a set of applied session
 * ids + the lifetime total; returns the new state + the RPC's return shape.
 */
export function applyDrillIdempotent(
  state: { appliedSessionIds: Set<string>; lifetimeTotal: number },
  sessionId: string,
  weighted: number,
): { inserted: boolean; prevTotal: number; newTotal: number } {
  const prevTotal = state.lifetimeTotal
  if (state.appliedSessionIds.has(sessionId)) {
    return { inserted: false, prevTotal, newTotal: prevTotal }
  }
  state.appliedSessionIds.add(sessionId)
  state.lifetimeTotal = prevTotal + Math.max(0, weighted)
  return { inserted: true, prevTotal, newTotal: state.lifetimeTotal }
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
