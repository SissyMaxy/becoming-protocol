// _shared/biometrics.ts — the SINGLE validator for machine biometric wire data.
//
// Contract (DESIGN_TURNING_OUT_2026-07-01.md §2):
//   arousal  wire 0–1000 finite number → canonical 0–10 app scale
//   hr       valid band 30–220 bpm; anything outside is null (invalid), and the
//            CALLER decides what invalid means (dropout stop vs telemetry fault)
//
// Pure module — no Deno/jsr imports — so it is unit-testable under vitest
// (src/__tests__/lib/machine-biometrics.test.ts) and importable from every
// edge function.
//
// NOTE on toArousal5: user_state.current_arousal is CHECK 0..5 today (mig 033).
// The app-wide 0–10 canonicalization ships in mig 639 ATOMICALLY with its
// readers (plan P7). Until that train lands, the user_state bridge MUST write
// the 0–5 scale or every high-arousal tick write is silently rejected by the
// CHECK (the exact enum/constraint bug class from the outreach-urgency
// incident). toArousal10 is exported, tested, and ready for the 639 cutover.

/** Wire-level arousal validation: finite number within 0..1000, else null. */
export function validArousal(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw < 0 || raw > 1000) return null
  return raw
}

/** Machine arousal (0..1000) → canonical app scale 0..10. */
export function toArousal10(machineArousal: number): number {
  return Math.max(0, Math.min(10, Math.round(machineArousal / 100)))
}

/**
 * Machine arousal (0..1000) → LEGACY user_state scale 0..5.
 * Used by the conditioning bridge until migration 639 flips the column
 * CHECK + every reader to 0..10 in one train. Delete with that migration.
 */
export function toArousal5(machineArousal: number): number {
  return Math.max(0, Math.min(5, Math.round(machineArousal / 200)))
}

/** Wire arousal → canonical 0..10, null when the wire value is invalid. */
export function canonArousal(raw: unknown): number | null {
  const v = validArousal(raw)
  return v === null ? null : toArousal10(v)
}

/**
 * Heart rate validation: 30–220 bpm band. Outside the band (including 0,
 * negative, NaN, non-number) → null. A null WITH hr_ever_seen=true is a
 * dropout / sensor-off / emergency and must stop the machine (caller rule).
 */
export function validHr(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw < 30 || raw > 220) return null
  return raw
}
