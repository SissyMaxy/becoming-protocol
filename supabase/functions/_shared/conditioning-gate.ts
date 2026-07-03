// _shared/conditioning-gate.ts — fail-closed shim over conditioning_gate()
// (mig 633; DESIGN_TURNING_OUT_2026-07-01.md §5).
//
// One gate, four callers: goon-trajectory, paid-monetization,
// machine-overseer (start action only — mid-session is machine_session_guard),
// temptation-engine. Call requireGate() as the FIRST act of the handler and
// skip generation when denied.
//
// FAIL CLOSED: any RPC error, exception, or malformed reply returns
// { allowed: false, reason: 'gate_error' }. A conditioning engine that cannot
// prove the gate is open does not condition.
//
// Known systems (unknown = deny at the SQL layer):
//   'goon' | 'machine' | 'paid_monetization' | 'temptation' | 'recondition' | 'turnout'

// deno-lint-ignore no-explicit-any
type Sb = any

export const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

export interface GateResult {
  allowed: boolean
  reason: string
}

export async function requireGate(
  supabase: Sb,
  system: string,
  userId: string = HANDLER_USER,
): Promise<GateResult> {
  try {
    const { data, error } = await supabase.rpc('conditioning_gate', { uid: userId, system })
    if (error) {
      console.error(`[conditioning-gate] rpc error for ${system}: ${error.message} — failing closed`)
      return { allowed: false, reason: 'gate_error' }
    }
    if (!data || typeof data !== 'object' || typeof (data as { allow?: unknown }).allow !== 'boolean') {
      console.error(`[conditioning-gate] malformed reply for ${system} — failing closed`)
      return { allowed: false, reason: 'gate_error' }
    }
    const d = data as { allow: boolean; reason?: string }
    return { allowed: d.allow === true, reason: String(d.reason ?? (d.allow ? 'ok' : 'denied')) }
  } catch (e) {
    console.error(`[conditioning-gate] exception for ${system}: ${(e as Error).message} — failing closed`)
    return { allowed: false, reason: 'gate_error' }
  }
}
