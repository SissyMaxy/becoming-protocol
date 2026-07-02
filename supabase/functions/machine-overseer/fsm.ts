// machine-overseer/fsm.ts — PURE session FSM + parameter derivation.
//
// Extracted from index.ts so the safety-critical transition logic is
// unit-testable without Deno/supabase mocks
// (src/__tests__/lib/machine-fsm.test.ts).
//
// Design source: DESIGN_TURNING_OUT_2026-07-01.md §2 "Milking FSM — timeout on
// EVERY phase". Contracts:
//   - Params are derived ONCE at session start (deriveParams) and persisted to
//     machine_sessions.params. Ticks use them VERBATIM — in particular the
//     hard-mode deny-threshold reduction is applied exactly once, at start.
//     (Fixes the historical double-subtract: start reduced deny_threshold AND
//     the tick reduced it again.)
//   - Milking phases: build → edge_hold → force → recover → build…
//       build:     exit on arousal ≥ enter_edge; 300s stall → enter_edge drops
//                  10%/min (floor 50% of derived); 600s → recover (cycle ends)
//       edge_hold: hold_seconds → force
//       force:     orgasm → recover + cycle++; 240s timeout → recover (failed
//                  force); 2 consecutive failed forces → completed
//                  outcome 'denied_exhausted'
//       recover:   recover_seconds → build (or complete when rails hit)
//   - Orgasm in ANY milking phase → recover + cycle++ (premature counts).
//   - Rails: max_cycles / max_duration_seconds → clean completed.
//   - Edge mode: OVERSTIM capped min(overstim_seconds, 420), once per orgasm
//     event; orgasm DURING overstim → 60s stop-recover.
//
// Pure module — no Deno/jsr imports.

export type Cmd =
  | 'BUILD' | 'EDGE' | 'DENY' | 'OVERSTIM' | 'MILK_FORCE'
  | 'STOP' | 'EMERGENCY_STOP' | 'CONTINUE'

export type MilkPhase = 'build' | 'edge_hold' | 'force' | 'recover'

export type LineKey =
  | 'build' | 'edge' | 'deny' | 'overstim' | 'milk' | 'recover' | 'complete' | 'none'

export interface MachineParams {
  deny_threshold: number       // hard-mode reduction ALREADY applied (once)
  edge_band: number
  enter_edge: number           // deny_threshold - edge_band, stored at start
  cooldown_seconds: number
  hold_seconds: number
  recover_seconds: number
  overstim_seconds: number     // already capped at 420
  hr_max: number
  max_cycles: number
  max_duration_seconds: number
}

export interface FsmState {
  phase: MilkPhase
  phase_started: number          // elapsed seconds at phase entry
  cycles: number
  failed_forces: number          // consecutive force timeouts
  enter_edge_current: number     // stall-lowered copy; resets to params.enter_edge
  last_arousal: number           // last-known-good (telemetry hold)
  elapsed_last: number           // monotonicity check
  overstim_until: number | null          // edge mode: overstim active until (elapsed s)
  overstim_recover_until: number | null  // edge mode: 60s stop after orgasm-in-overstim
}

export interface FsmInputs {
  arousal: number      // VALIDATED (or last-known-good) 0..1000
  elapsed: number      // server-trusted elapsed seconds
  event?: string       // 'orgasm' | 'struggle' | undefined
}

export interface FsmResult {
  command: Cmd
  motion: Record<string, unknown>
  lineKey: LineKey
  logType: string | null
  state: FsmState
  done: { outcome: string } | null   // non-null → session transitions to completed
}

export const FORCE_TIMEOUT_SECONDS = 240
export const BUILD_STALL_SECONDS = 300
export const BUILD_ABANDON_SECONDS = 600
export const OVERSTIM_CAP_SECONDS = 420
export const OVERSTIM_ORGASM_RECOVER_SECONDS = 60

export const DEFAULTS = {
  deny_threshold: 850,
  edge_band: 120,
  cooldown_seconds: 25,
  hr_max: 185,             // dead-man ceiling — user must set their safe value
  overstim_base_seconds: 180,
  hold_seconds: 45,
  recover_seconds: 30,
  max_cycles: 3,
  max_duration_seconds: 2700,
}

export function initialFsmState(params: MachineParams): FsmState {
  return {
    phase: 'build',
    phase_started: 0,
    cycles: 0,
    failed_forces: 0,
    enter_edge_current: params.enter_edge,
    last_arousal: 0,
    elapsed_last: 0,
    overstim_until: null,
    overstim_recover_until: null,
  }
}

/**
 * Single-site parameter derivation — called ONLY by the start action.
 * The hard-mode deny-threshold reduction happens here and nowhere else.
 */
export function deriveParams(
  programParams: Record<string, unknown> | null | undefined,
  conditioning: { hard_mode_active?: boolean; denial_day?: number },
): MachineParams {
  const base = { ...DEFAULTS, ...(programParams ?? {}) } as typeof DEFAULTS & Record<string, number>
  let deny = Number(base.deny_threshold) || DEFAULTS.deny_threshold
  if (conditioning.hard_mode_active) deny = Math.max(700, deny - 80)  // exactly once
  const edgeBand = Number(base.edge_band) || DEFAULTS.edge_band
  const denialBoost = Math.min(240, (conditioning.denial_day ?? 0) * 8)
  const overstim = Math.min(
    OVERSTIM_CAP_SECONDS,
    (Number(base.overstim_base_seconds) || DEFAULTS.overstim_base_seconds) + denialBoost,
  )
  return {
    deny_threshold: deny,
    edge_band: edgeBand,
    enter_edge: deny - edgeBand,
    cooldown_seconds: Number(base.cooldown_seconds) || DEFAULTS.cooldown_seconds,
    hold_seconds: Number(base.hold_seconds) || DEFAULTS.hold_seconds,
    recover_seconds: Number(base.recover_seconds) || DEFAULTS.recover_seconds,
    overstim_seconds: overstim,
    hr_max: Number(base.hr_max) || DEFAULTS.hr_max,
    max_cycles: Number(base.max_cycles) || DEFAULTS.max_cycles,
    max_duration_seconds: Number(base.max_duration_seconds) || DEFAULTS.max_duration_seconds,
  }
}

/**
 * Map a machine_session_guard denial to the command the device receives.
 * Fail-closed: anything latched, safeworded, or unknown → EMERGENCY_STOP.
 * Benign non-active states (paused/created/completed) → plain STOP.
 */
export function commandForGuardDenial(
  reason: string,
  latched: boolean,
): { command: Cmd; abort_reason: string } {
  if (latched || reason === 'safeword' || reason === 'aborted' || reason === 'no_session') {
    return { command: 'EMERGENCY_STOP', abort_reason: reason }
  }
  if (reason === 'paused' || reason === 'created' || reason === 'completed') {
    return { command: 'STOP', abort_reason: reason }
  }
  return { command: 'EMERGENCY_STOP', abort_reason: reason || 'guard_denied' }
}

const stopMotion = (cooldownSeconds: number) =>
  ({ stroke: 'stop', velocity: 0, cooldown_seconds: cooldownSeconds })

// ─── Milking mode ────────────────────────────────────────────────────

function stepMilking(state: FsmState, inputs: FsmInputs, params: MachineParams): FsmResult {
  const s: FsmState = { ...state }
  const inPhase = inputs.elapsed - s.phase_started

  // Orgasm in ANY phase → recover + cycle counted (premature no longer ignored).
  if (inputs.event === 'orgasm') {
    s.cycles += 1
    s.failed_forces = 0
    s.phase = 'recover'
    s.phase_started = inputs.elapsed
    s.enter_edge_current = params.enter_edge
    if (s.cycles >= params.max_cycles) {
      return { command: 'STOP', motion: stopMotion(0), lineKey: 'complete', logType: 'orgasm', state: s, done: { outcome: 'milked' } }
    }
    return { command: 'STOP', motion: stopMotion(params.recover_seconds), lineKey: 'recover', logType: 'orgasm', state: s, done: null }
  }

  // Session rails → clean complete.
  if (inputs.elapsed >= params.max_duration_seconds) {
    return { command: 'STOP', motion: stopMotion(0), lineKey: 'complete', logType: null, state: s, done: { outcome: s.cycles > 0 ? 'milked' : 'denied' } }
  }
  if (s.cycles >= params.max_cycles) {
    return { command: 'STOP', motion: stopMotion(0), lineKey: 'complete', logType: null, state: s, done: { outcome: 'milked' } }
  }

  switch (s.phase) {
    case 'build': {
      if (inPhase >= BUILD_ABANDON_SECONDS) {
        // Can't get there this cycle — recover, end of cycle.
        s.phase = 'recover'
        s.phase_started = inputs.elapsed
        s.enter_edge_current = params.enter_edge
        return { command: 'STOP', motion: stopMotion(params.recover_seconds), lineKey: 'recover', logType: null, state: s, done: null }
      }
      if (inPhase >= BUILD_STALL_SECONDS) {
        // Stalled — lower the bar 10%/min past the stall point, floor 50%.
        const minutesPast = (inPhase - BUILD_STALL_SECONDS) / 60
        const factor = Math.max(0.5, 1 - 0.1 * minutesPast)
        s.enter_edge_current = Math.max(params.enter_edge * 0.5, params.enter_edge * factor)
      }
      if (inputs.arousal >= s.enter_edge_current) {
        s.phase = 'edge_hold'
        s.phase_started = inputs.elapsed
        return { command: 'EDGE', motion: { stroke: 'short', velocity: 0.4 }, lineKey: 'edge', logType: null, state: s, done: null }
      }
      return { command: 'BUILD', motion: { stroke: 'full', velocity: 0.95 }, lineKey: 'build', logType: null, state: s, done: null }
    }
    case 'edge_hold': {
      if (inPhase >= params.hold_seconds) {
        s.phase = 'force'
        s.phase_started = inputs.elapsed
        return { command: 'MILK_FORCE', motion: { stroke: 'full', velocity: 1.0 }, lineKey: 'milk', logType: 'milk', state: s, done: null }
      }
      return { command: 'EDGE', motion: { stroke: 'short', velocity: 0.4 }, lineKey: 'edge', logType: null, state: s, done: null }
    }
    case 'force': {
      if (inPhase >= FORCE_TIMEOUT_SECONDS) {
        // Failed force ends the attempt — no velocity-1.0-forever wedge.
        s.failed_forces += 1
        s.phase = 'recover'
        s.phase_started = inputs.elapsed
        s.enter_edge_current = params.enter_edge
        if (s.failed_forces >= 2) {
          return { command: 'STOP', motion: stopMotion(0), lineKey: 'complete', logType: 'denial', state: s, done: { outcome: 'denied_exhausted' } }
        }
        return { command: 'STOP', motion: stopMotion(params.recover_seconds), lineKey: 'recover', logType: 'denial', state: s, done: null }
      }
      return { command: 'MILK_FORCE', motion: { stroke: 'full', velocity: 1.0 }, lineKey: 'milk', logType: null, state: s, done: null }
    }
    case 'recover': {
      if (inPhase >= params.recover_seconds) {
        s.phase = 'build'
        s.phase_started = inputs.elapsed
        s.enter_edge_current = params.enter_edge
        return { command: 'BUILD', motion: { stroke: 'full', velocity: 0.95 }, lineKey: 'build', logType: null, state: s, done: null }
      }
      return { command: 'STOP', motion: stopMotion(params.recover_seconds - inPhase), lineKey: 'recover', logType: null, state: s, done: null }
    }
  }
}

// ─── Edge / denial mode ──────────────────────────────────────────────

function stepEdge(state: FsmState, inputs: FsmInputs, params: MachineParams): FsmResult {
  const s: FsmState = { ...state }

  // Duration rail applies here too — no infinite edge sessions.
  if (inputs.elapsed >= params.max_duration_seconds) {
    return { command: 'STOP', motion: stopMotion(0), lineKey: 'complete', logType: null, state: s, done: { outcome: 'denied' } }
  }

  if (inputs.event === 'orgasm') {
    if (s.overstim_until !== null && inputs.elapsed < s.overstim_until) {
      // Orgasm DURING overstim → 60s stop-recover, overstim ends.
      s.overstim_until = null
      s.overstim_recover_until = inputs.elapsed + OVERSTIM_ORGASM_RECOVER_SECONDS
      return { command: 'STOP', motion: stopMotion(OVERSTIM_ORGASM_RECOVER_SECONDS), lineKey: 'recover', logType: 'orgasm', state: s, done: null }
    }
    // One overstim window per orgasm event, hard-capped.
    const dur = Math.min(params.overstim_seconds, OVERSTIM_CAP_SECONDS)
    s.overstim_until = inputs.elapsed + dur
    s.overstim_recover_until = null
    return { command: 'OVERSTIM', motion: { stroke: 'full', velocity: 1.0, pattern: 'random', duration_seconds: dur }, lineKey: 'overstim', logType: 'orgasm', state: s, done: null }
  }

  if (s.overstim_recover_until !== null) {
    if (inputs.elapsed < s.overstim_recover_until) {
      return { command: 'STOP', motion: stopMotion(s.overstim_recover_until - inputs.elapsed), lineKey: 'recover', logType: null, state: s, done: null }
    }
    s.overstim_recover_until = null
  }

  if (s.overstim_until !== null) {
    if (inputs.elapsed < s.overstim_until) {
      return { command: 'OVERSTIM', motion: { stroke: 'full', velocity: 1.0, pattern: 'random', duration_seconds: Math.ceil(s.overstim_until - inputs.elapsed) }, lineKey: 'overstim', logType: null, state: s, done: null }
    }
    s.overstim_until = null
  }

  // Classic band — deny_threshold used VERBATIM from persisted params.
  if (inputs.arousal >= params.deny_threshold) {
    return { command: 'DENY', motion: stopMotion(params.cooldown_seconds), lineKey: 'deny', logType: 'denial', state: s, done: null }
  }
  if (inputs.arousal >= params.enter_edge) {
    return { command: 'EDGE', motion: { stroke: 'short', velocity: 0.35 }, lineKey: 'edge', logType: null, state: s, done: null }
  }
  return { command: 'BUILD', motion: { stroke: 'full', velocity: 0.9 }, lineKey: 'build', logType: null, state: s, done: null }
}

/** The one entry point the tick handler calls. */
export function stepFsm(
  mode: string,
  state: FsmState,
  inputs: FsmInputs,
  params: MachineParams,
): FsmResult {
  return mode === 'milking' ? stepMilking(state, inputs, params) : stepEdge(state, inputs, params)
}
