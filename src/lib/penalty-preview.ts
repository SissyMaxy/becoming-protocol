// Penalty Preview Rail — the may-apply rule + card phrasing. (Wish 31e1b144,
// mig 601.)
//
// ENFORCEMENT lives in SQL: penalty_may_apply(source_table, source_id) is the
// fail-closed guard every penalty applier consults. This module is the tested
// parity mirror (drives the PenaltyPreviewCard's "shown / not yet" state) and
// the source of truth for the rule.
//
// PARITY: keep penaltyMayApply() in sync with penalty_may_apply(), which as
// of mig 627 reads the OBLIGATION LEDGER:
//   a penalty may apply ⇔ an obligation exists, is not voided/cancelled/
//   fulfilled/paused, has not already fired (consequence_applied_at), was
//   genuinely surfaced, at least grace_minutes have passed since surfacing,
//   and the enforcement gate is 'active'.
// The gate is read server-side; this mirror takes it as an input (fail-closed
// default: not active).

export interface PenaltyGateInputs {
  exists: boolean
  cancelled: boolean
  /** obligation already fired its one consequence (mig 627: terminal + unique) */
  applied?: boolean
  /** enforcement_gate mode is 'active' (mig 627: paused/latched blocks penalties) */
  gateActive?: boolean
  /** when the companion preview was surfaced to the user (null = never shown) */
  surfacedAt: Date | string | null | undefined
  graceMinutes: number
  now?: Date
}

export function penaltyMayApply(input: PenaltyGateInputs): boolean {
  if (!input.exists) return false          // no cost shown = no penalty (fail-closed)
  if (input.cancelled) return false
  if (input.applied) return false           // fired once already — never re-fires
  if (input.gateActive === false) return false // paused/safeword-latched
  if (!input.surfacedAt) return false       // never surfaced

  const surfaced = input.surfacedAt instanceof Date ? input.surfacedAt : new Date(input.surfacedAt)
  if (Number.isNaN(surfaced.getTime())) return false

  const now = input.now ?? new Date()
  const graceMs = Math.max(0, input.graceMinutes) * 60_000
  return now.getTime() >= surfaced.getTime() + graceMs
}

export type PreviewState = 'not_shown' | 'in_grace' | 'live' | 'cancelled' | 'applied'

// What the card shows for a preview.
export function previewState(input: {
  cancelled: boolean
  applied: boolean
  surfacedAt: Date | string | null | undefined
  graceMinutes: number
  now?: Date
}): PreviewState {
  if (input.cancelled) return 'cancelled'
  if (input.applied) return 'applied'
  if (!input.surfacedAt) return 'not_shown'
  return penaltyMayApply({ exists: true, cancelled: false, surfacedAt: input.surfacedAt, graceMinutes: input.graceMinutes, now: input.now })
    ? 'live'
    : 'in_grace'
}
