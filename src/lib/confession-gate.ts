// Confession gate — Mommy withholds the morning until last night's
// confession is answered. (Wish 187f616e.)
//
// The ENFORCEMENT lives in SQL (migration 591): confession_gate_should_be_active()
// + a confession_queue trigger that keeps user_state.confession_gate_active
// truthful and fires the "good girl" praise burst on clear. This module is
// the parity mirror used client-side to decide whether the Today confession
// card wears the locked-Mommy badge, and to document/lock the rule with a
// regression test.
//
// PARITY: keep shouldGateConfession() in sync with
// confession_gate_should_be_active(p_user) in migration 591. The rule:
//   gate is active  ⇔  persona is dommy_mommy
//                   AND effective difficulty band is NOT 'recovery'
//                   AND a confession is still unanswered (not missed) and
//                       was created more than 12h ago.

export type DifficultyBand = 'recovery' | 'gentle' | 'firm' | 'cruel'

export interface ConfessionGateInputs {
  /** user_state.handler_persona */
  persona: string | null | undefined
  /** effective band = override_band ?? current_difficulty_band */
  effectiveBand: DifficultyBand | null | undefined
  /** oldest unanswered, non-missed confession (confessed_at IS NULL AND
   *  missed = false). null when none pending. */
  pendingConfessionCreatedAt: Date | string | null | undefined
  /** evaluation clock — injectable for tests */
  now?: Date
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

export function shouldGateConfession(input: ConfessionGateInputs): boolean {
  if ((input.persona ?? 'therapist') !== 'dommy_mommy') return false
  if ((input.effectiveBand ?? 'gentle') === 'recovery') return false
  if (!input.pendingConfessionCreatedAt) return false

  const created = input.pendingConfessionCreatedAt instanceof Date
    ? input.pendingConfessionCreatedAt
    : new Date(input.pendingConfessionCreatedAt)
  if (Number.isNaN(created.getTime())) return false

  const now = input.now ?? new Date()
  return now.getTime() - created.getTime() > TWELVE_HOURS_MS
}
