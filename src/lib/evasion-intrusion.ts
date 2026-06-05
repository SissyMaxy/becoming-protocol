// Evasion-reactive intrusions — the react-decision rule. (Wish a1a46348, mig 605.)
//
// ENFORCEMENT is SQL: trg_evasion_reactive_intrusion() schedules a sharper
// intrusion when an 'evasion' signal lands. This is the tested parity mirror
// of the gate (persona + safeword + 1/day cap) so the rule is documented and
// locked. PARITY: keep shouldReactToEvasion() in sync with mig 605.

export interface EvasionReactInputs {
  /** the signal's event_type */
  eventType: string
  persona: string | null | undefined
  /** user_state.gaslight_cooldown_until */
  cooldownUntil: Date | string | null | undefined
  /** count of triggered_by='evasion' intrusions already scheduled today */
  evasionIntrusionsToday: number
  now?: Date
}

export function shouldReactToEvasion(input: EvasionReactInputs): boolean {
  if (input.eventType !== 'evasion') return false
  if ((input.persona ?? 'therapist') !== 'dommy_mommy') return false

  const now = (input.now ?? new Date()).getTime()
  if (input.cooldownUntil) {
    const until = input.cooldownUntil instanceof Date ? input.cooldownUntil : new Date(input.cooldownUntil)
    if (!Number.isNaN(until.getTime()) && until.getTime() > now) return false
  }

  // Hard cap: at most one evasion-triggered intrusion per day (breaks the
  // evasion → intrusion → evasion circularity).
  if (input.evasionIntrusionsToday >= 1) return false

  return true
}
