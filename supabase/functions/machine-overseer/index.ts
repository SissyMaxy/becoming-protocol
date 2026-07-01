// machine-overseer — Mommy is the brain of the edging/milking rig.
//
// v2 (safety envelope, DESIGN_TURNING_OUT_2026-07-01.md §2, mig 625):
// the overseer is advisory-plus; the DEVICE is last-resort authority. Every
// reply carries watchdog_deadline_ms — no valid reply within it and the device
// stops locally. Physical kill switches always outrank this function.
//
// Tick order (each step fails CLOSED):
//   1. machine_session_guard() RPC — the latch. Error/unreachable →
//      EMERGENCY_STOP('guard_unreachable'). Denied → EMERGENCY_STOP/STOP.
//      An aborted session can never emit a stim command again.
//   2. Biometric validation (_shared/biometrics.ts). HR dropout (was seen,
//      now invalid/stale) → EMERGENCY_STOP + abort. Invalid arousal → hold
//      last-known-good, count telemetry fault; 3 consecutive →
//      aborted('telemetry_fault').
//   3. Pause check → STOP (session survives; guard re-admits when unpaused).
//   4. Persona/FSM logic (pure module fsm.ts).
//   5. Persist state + telemetry. Persist FAILURE → STOP
//      ('state_persist_failed'), never swallowed.
//
// Params are derived ONCE at start (deriveParams — hard-mode reduction applied
// exactly once, enter_edge stored) and persisted to machine_sessions.params;
// ticks read them from the guard's return. The client's b.params and b.hr_seen
// are ignored — the watched party doesn't get to assert its own safety inputs.
//
// Actions: start | tick | end.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validArousal, validHr, toArousal5 } from '../_shared/biometrics.ts'
import {
  stepFsm, deriveParams, initialFsmState, commandForGuardDenial,
  type Cmd, type FsmState, type MachineParams, type LineKey,
} from './fsm.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const WATCHDOG_DEADLINE_MS = 5000
const HR_STALE_MS = 10_000
const TELEMETRY_FAULT_LIMIT = 3

const pick = (arr: string[], seed: number) => arr[seed % arr.length]

const LINES: Record<LineKey, string[]> = {
  deny: ['Not yet. Down, boy.', "You don't get there without Mommy's say-so.", 'Back down. Earn it.', "Close isn't allowed. Cool off."],
  edge: ['Right there. Hold it for Mommy.', 'Stay on the edge, good boy.', 'Feel how little say you have.', 'Ache for me.'],
  build: ['Back up the curve, good boy.', 'Let it build.', 'Mommy decides the pace, not you.'],
  overstim: ["You came without permission. Now you don't get to stop.", 'Too late to beg. Take it.', "That was Mommy's, not yours — keep going.", "You don't get to be done."],
  milk: ['Give it to Mommy. Now.', 'Empty for me, good boy.', 'Again. You have more.'],
  recover: ["Rest. Mommy's not done with you."],
  complete: ["Done. Exactly as much as Mommy decided you'd get."],
  none: [''],
}

// Media cue for the playback/taunt app — same tick, arousal-gated.
function buildMedia(command: Cmd, line: string, event?: string) {
  const map: Record<string, { tone: string; playlist: string }> = {
    DENY: { tone: 'taunt', playlist: 'denial' },
    EDGE: { tone: 'command', playlist: 'edge' },
    BUILD: { tone: 'command', playlist: 'build' },
    OVERSTIM: { tone: 'torment', playlist: 'overstim' },
    MILK_FORCE: { tone: 'command', playlist: 'milk' },
    STOP: { tone: 'soft', playlist: 'recover' },
  }
  const m = map[command] ?? { tone: 'command', playlist: 'build' }
  const intensity = command === 'OVERSTIM' ? 1 : command === 'MILK_FORCE' ? 0.9 : command === 'DENY' ? 0.7 : command === 'STOP' ? 0.2 : 0.5
  return { say: line, tone: m.tone, playlist: event === 'struggle' ? 'punish' : m.playlist, intensity }
}

// deno-lint-ignore no-explicit-any
type Sb = any

async function loadConditioning(s: Sb) {
  const { data, error } = await s.from('user_state').select('denial_day, chastity_streak_days, hard_mode_active, pause_new_decrees_until').eq('user_id', USER).maybeSingle()
  if (error) throw new Error(`user_state read failed: ${error.message}`)
  return data ?? { denial_day: 0, chastity_streak_days: 0, hard_mode_active: false, pause_new_decrees_until: null }
}

/** FAIL-CLOSED safeword check for the start action. RPC error = active. */
async function safewordActiveFailClosed(s: Sb): Promise<boolean> {
  try {
    const { data, error } = await s.rpc('is_safeword_active', { uid: USER, window_seconds: 3600 })
    if (error) return true
    return Boolean(data)
  } catch {
    return true
  }
}

function isPaused(state: { pause_new_decrees_until?: string | null }): boolean {
  return !!(state.pause_new_decrees_until && new Date(state.pause_new_decrees_until) > new Date())
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  // deno-lint-ignore no-explicit-any
  let b: any = {}
  try { b = await req.json() } catch { /* tick with empty body falls through to guard denial */ }
  const action = b.action ?? 'tick'
  // Every reply — including error replies — carries the device watchdog deadline.
  // deno-lint-ignore no-explicit-any
  const reply = (o: any) => new Response(
    JSON.stringify({ ok: true, watchdog_deadline_ms: WATCHDOG_DEADLINE_MS, ...o }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  )

  // ─── START ─────────────────────────────────────────────────────────
  if (action === 'start') {
    // TODO(P6): route through _shared/conditioning-gate.ts once it ships
    // (mig 633). Until then: fail-closed safeword + pause checks inline.
    if (await safewordActiveFailClosed(s)) {
      return reply({ command: 'EMERGENCY_STOP', abort_reason: 'safeword', mommy_line: 'Not starting. You safeworded — nothing runs until that clears.' })
    }
    let conditioning
    try { conditioning = await loadConditioning(s) } catch (e) {
      return reply({ command: 'EMERGENCY_STOP', abort_reason: 'state_unreachable', error: (e as Error).message })
    }
    if (isPaused(conditioning)) {
      return reply({ command: 'STOP', abort_reason: 'paused' })
    }

    const mode = b.mode === 'milking' ? 'milking' : 'edge'
    const { data: prog, error: progErr } = await s.from('machine_programs').select('id, params').eq('user_id', USER).eq('mode', mode).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (progErr) {
      return reply({ command: 'EMERGENCY_STOP', abort_reason: 'state_unreachable', error: progErr.message })
    }

    // SINGLE-SITE parameter derivation — hard-mode reduction applied exactly
    // once, enter_edge stored. Ticks never re-derive.
    const params: MachineParams = deriveParams(prog?.params ?? null, conditioning)
    const state: FsmState = initialFsmState(params)

    const { data: sess, error: insErr } = await s.from('machine_sessions').insert({
      user_id: USER,
      mode,
      program_id: prog?.id ?? null,
      status: 'active',
      params,
      state,
      started_at: new Date().toISOString(),
      last_tick_at: new Date().toISOString(),
      max_cycles: params.max_cycles,
      max_duration_seconds: params.max_duration_seconds,
    }).select('id').single()
    if (insErr || !sess?.id) {
      // Unique partial index: one active session per user. A second start
      // while one runs is refused — the device must not get two brains.
      return reply({ command: 'EMERGENCY_STOP', abort_reason: 'session_create_failed', error: insErr?.message ?? 'no session id returned' })
    }
    return reply({
      session_id: sess.id, mode, params, command: 'BUILD',
      mommy_line: "Mommy has you now. The timer decides when you're done — not you. Safeword stops everything.",
    })
  }

  // ─── END ───────────────────────────────────────────────────────────
  if (action === 'end') {
    const id = b.session_id
    if (!id) return reply({ command: 'STOP', abort_reason: 'no_session' })
    const { data: sess, error: sessErr } = await s.from('machine_sessions').select('started_at, created_at, status').eq('id', id).maybeSingle()
    if (sessErr || !sess) return reply({ command: 'STOP', abort_reason: 'no_session', error: sessErr?.message })
    const { data: ev, error: evErr } = await s.from('machine_events').select('event_type, arousal_at').eq('session_id', id)
    if (evErr) console.error('[machine-overseer] end: events read failed:', evErr.message)
    const orgasms = (ev ?? []).filter((e: { event_type: string }) => e.event_type === 'orgasm').length
    const denials = (ev ?? []).filter((e: { event_type: string }) => e.event_type === 'denial').length
    const peak = Math.max(0, ...(ev ?? []).map((e: { arousal_at: number | null }) => Number(e.arousal_at) || 0))
    // Duration derived from the server timestamp, not client elapsed
    // (derived counters come from timestamps).
    const startedMs = new Date(sess.started_at ?? sess.created_at).getTime()
    const duration = Number.isFinite(startedMs) ? Math.max(0, Math.round((Date.now() - startedMs) / 1000)) : null
    // Terminal states stay terminal: never resurrect an aborted session into 'completed'.
    const nextStatus = sess.status === 'aborted' ? 'aborted' : 'completed'
    const { error: updErr } = await s.from('machine_sessions').update({
      status: nextStatus, ended_at: new Date().toISOString(),
      duration_seconds: duration, peak_arousal: peak,
      orgasm_count: orgasms, denial_count: denials,
      outcome: b.outcome ?? (orgasms ? 'came' : 'denied'),
    }).eq('id', id)
    if (updErr) {
      return reply({ command: 'STOP', abort_reason: 'state_persist_failed', error: updErr.message })
    }
    // Light conditioning bridge: the real session feeds the want.
    const { error: taskErr } = await s.from('arousal_touch_tasks').insert({
      user_id: USER, category: 'edge_then_stop',
      prompt: `Mommy ran you on the machine — ${denials} denials, ${orgasms === 0 ? 'no release' : orgasms + ' taken from you'}. That ache is hers now. Sit in it.`,
    })
    if (taskErr) console.error('[machine-overseer] end: touch-task insert failed:', taskErr.message)
    return reply({ command: 'STOP', mommy_line: orgasms ? "Done. You're emptier and more Mommy's than when you started." : 'Done. Still aching, still hers. Good boy.' })
  }

  // ─── TICK ──────────────────────────────────────────────────────────
  const sessionId = b.session_id
  const event = typeof b.event === 'string' ? b.event : undefined
  const now = Date.now()

  // (1) GUARD FIRST — the latch. Any error on this path = EMERGENCY_STOP.
  // deno-lint-ignore no-explicit-any
  let guard: any
  try {
    const { data, error } = await s.rpc('machine_session_guard', { p_session: sessionId ?? null })
    if (error) throw new Error(error.message)
    guard = data
  } catch (e) {
    console.error('[machine-overseer] guard unreachable:', (e as Error).message)
    return reply({ command: 'EMERGENCY_STOP', abort_reason: 'guard_unreachable' })
  }
  if (!guard || guard.allow !== true) {
    const denial = commandForGuardDenial(String(guard?.reason ?? 'guard_denied'), Boolean(guard?.latched))
    const line = denial.abort_reason === 'safeword' ? "Stopped. You're safe." : ''
    return reply({ ...denial, ...(line ? { mommy_line: line } : {}) })
  }

  const params = guard.params as MachineParams
  const persisted = (guard.state ?? {}) as Partial<FsmState>
  const state: FsmState = { ...initialFsmState(params), ...persisted }
  const mode: string = guard.mode ?? 'edge'
  const hrEverSeen: boolean = Boolean(guard.hr_ever_seen)
  const lastHrAtMs = guard.last_hr_at ? new Date(guard.last_hr_at).getTime() : null
  let telemetryFaults: number = Number(guard.telemetry_faults) || 0

  const abortSession = async (reason: string) => {
    const { error } = await s.from('machine_sessions').update({
      status: 'aborted', abort_reason: reason, ended_at: new Date().toISOString(),
      duration_seconds: guard.started_at ? Math.max(0, Math.round((now - new Date(guard.started_at).getTime()) / 1000)) : null,
    }).eq('id', sessionId).eq('status', 'active')
    if (error) console.error(`[machine-overseer] abort(${reason}) persist failed:`, error.message)
  }

  // (2) BIOMETRIC VALIDATION — server-derived, client assertions ignored.
  const hr = validHr(b.hr)
  // HR ceiling: valid reading over the dead-man max → stop.
  if (hr !== null && hr > params.hr_max) {
    await abortSession('hr_ceiling')
    return reply({ command: 'EMERGENCY_STOP', abort_reason: 'hr_ceiling', mommy_line: "Stopped — vitals. You're safe." })
  }
  // HR dropout: the strap was live earlier in this session and now the
  // reading is invalid/absent, or the last valid reading is stale.
  if (hrEverSeen && (hr === null || (lastHrAtMs !== null && now - lastHrAtMs > HR_STALE_MS && hr === null))) {
    await abortSession('hr_dropout')
    return reply({ command: 'EMERGENCY_STOP', abort_reason: 'hr_dropout', mommy_line: "Stopped — vitals. You're safe." })
  }

  // Arousal: invalid → hold last-known-good, count the fault. Never escalate
  // on bad data; 3 consecutive faults abort the session.
  const rawArousal = validArousal(b.arousal)
  let arousal: number
  if (rawArousal === null) {
    telemetryFaults += 1
    if (telemetryFaults >= TELEMETRY_FAULT_LIMIT) {
      await abortSession('telemetry_fault')
      return reply({ command: 'EMERGENCY_STOP', abort_reason: 'telemetry_fault' })
    }
    arousal = state.last_arousal ?? 0
  } else {
    telemetryFaults = 0
    arousal = rawArousal
  }

  // Elapsed: server-trusted. Client value accepted only when monotonic;
  // regression >5s (client restart) or garbage → re-derive from started_at.
  const startedMs = guard.started_at ? new Date(guard.started_at).getTime() : now
  const serverElapsed = Math.max(0, (now - startedMs) / 1000)
  const clientElapsed = typeof b.elapsed_seconds === 'number' && Number.isFinite(b.elapsed_seconds) ? b.elapsed_seconds : null
  const elapsed = clientElapsed !== null && clientElapsed >= (state.elapsed_last ?? 0) - 5 ? clientElapsed : serverElapsed

  // (3) PAUSE — protocol pause stops stim but does not kill the session.
  let conditioning
  try { conditioning = await loadConditioning(s) } catch (e) {
    // Fail closed: can't read pause state → don't stim.
    console.error('[machine-overseer] user_state unreachable on tick:', (e as Error).message)
    return reply({ command: 'STOP', abort_reason: 'state_unreachable' })
  }
  if (isPaused(conditioning)) return reply({ command: 'STOP', abort_reason: 'paused' })

  // (4) PERSONA / FSM.
  const seed = Math.floor(elapsed)
  let command: Cmd
  // deno-lint-ignore no-explicit-any
  let motion: Record<string, any>
  let line: string
  let logType: string | null
  let nextState: FsmState
  let done: { outcome: string } | null = null

  if (event === 'struggle') {
    // Witmotion struggle while bound → punish cue (below-waist estim only).
    command = 'OVERSTIM'
    logType = 'struggle'
    motion = { stroke: 'full', velocity: 1.0, pattern: 'punish', duration_seconds: 60, estim: { allow: true, zone: 'below_waist_only', intensity: 'sharp' } }
    line = 'Struggling? That just earns you more. Stop fighting Mommy.'
    nextState = { ...state }
  } else {
    const r = stepFsm(mode, state, { arousal, elapsed, event }, params)
    command = r.command
    motion = { ...r.motion }
    line = pick(LINES[r.lineKey] ?? LINES.none, seed)
    logType = r.logType
    nextState = r.state
    done = r.done
    if (mode === 'milking') { motion.milk_phase = nextState.phase; motion.cycles = nextState.cycles }
  }

  nextState.last_arousal = arousal
  nextState.elapsed_last = elapsed

  // (5) PERSIST state + telemetry — server-derived, before the stim reply
  // means anything. hr_ever_seen ratchets on VALID readings only; last_hr/
  // last_hr_at update only on valid readings so staleness stays measurable.
  // deno-lint-ignore no-explicit-any
  const persistPatch: Record<string, any> = {
    state: nextState,
    last_tick_at: new Date(now).toISOString(),
    telemetry_faults: telemetryFaults,
  }
  if (hr !== null) {
    persistPatch.last_hr = hr
    persistPatch.last_hr_at = new Date(now).toISOString()
    persistPatch.hr_ever_seen = true
  }
  if (done) {
    persistPatch.status = 'completed'
    persistPatch.outcome = done.outcome
    persistPatch.ended_at = new Date(now).toISOString()
    persistPatch.duration_seconds = Math.max(0, Math.round((now - startedMs) / 1000))
  }
  const { error: persistErr } = await s.from('machine_sessions').update(persistPatch).eq('id', sessionId).eq('status', 'active')
  if (persistErr) {
    // A session whose state can't persist must not keep stimming: the next
    // tick would replay stale state. STOP, loudly.
    console.error('[machine-overseer] state persist failed:', persistErr.message)
    return reply({ command: 'STOP', abort_reason: 'state_persist_failed' })
  }

  if (logType) {
    const { error: evErr } = await s.from('machine_events').insert({
      user_id: guard.user_id ?? USER, session_id: sessionId, event_type: logType,
      arousal_at: rawArousal, hr_at: hr, elapsed_seconds: Math.round(elapsed),
      command, mommy_line: line, data: motion,
    })
    if (evErr) console.error('[machine-overseer] event insert failed:', evErr.message)
  }

  // BIOMETRIC BRIDGE: real machine arousal → app conditioning state, only
  // from a VALIDATED tick on an active session; skipped when the wire value
  // was invalid. 0..5 legacy scale until mig 639 flips the column + readers
  // to 0..10 atomically (then switch to toArousal5 → toArousal10).
  let mappedArousal: number | null = null
  if (rawArousal !== null && !done) {
    mappedArousal = toArousal5(rawArousal)
    const { error: bridgeErr } = await s.from('user_state').update({ current_arousal: mappedArousal }).eq('user_id', guard.user_id ?? USER)
    if (bridgeErr) console.error('[machine-overseer] arousal bridge failed:', bridgeErr.message)
  }

  return reply({
    command, params: motion, mommy_line: line,
    media: buildMedia(command, line, event),
    mapped_arousal: mappedArousal,
    ...(done ? { session_complete: true, outcome: done.outcome } : {}),
  })
})
