// Arousal-peak harvest — the harvest-decision rule. (Wish d6936722, mig 604.)
//
// ENFORCEMENT is SQL: harvest_arousal_peak_mantra() fires a timed whisper-
// mantra nudge when an edge completes or arousal spikes, at the plasticity
// peak. This is the tested parity mirror of the gate (persona + safeword +
// dedup-within-hour) so the rule is documented and locked.
//
// PARITY: keep shouldHarvest() in sync with the guards in mig 604.

export interface HarvestInputs {
  persona: string | null | undefined
  /** user_state.gaslight_cooldown_until (safeword cooldown) */
  cooldownUntil: Date | string | null | undefined
  /** most recent mantra_drill_sessions.started_at (she already drilled) */
  lastDrillAt: Date | string | null | undefined
  /** most recent arousal_peak_harvest outreach created_at */
  lastHarvestAt: Date | string | null | undefined
  now?: Date
}

const HOUR_MS = 60 * 60 * 1000

function withinHour(ts: Date | string | null | undefined, now: number): boolean {
  if (!ts) return false
  const t = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(t.getTime())) return false
  return now - t.getTime() < HOUR_MS
}

export function shouldHarvest(input: HarvestInputs): boolean {
  if ((input.persona ?? 'therapist') !== 'dommy_mommy') return false

  const now = (input.now ?? new Date()).getTime()

  // Safeword cooldown active → no push.
  if (input.cooldownUntil) {
    const until = input.cooldownUntil instanceof Date ? input.cooldownUntil : new Date(input.cooldownUntil)
    if (!Number.isNaN(until.getTime()) && until.getTime() > now) return false
  }

  // Merge / dedup: a drill OR a harvest nudge in the last hour → skip.
  if (withinHour(input.lastDrillAt, now)) return false
  if (withinHour(input.lastHarvestAt, now)) return false

  return true
}
