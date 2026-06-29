// machine-overseer — Mommy is the brain of the edging/milking rig.
//
// The machine (Handy + EOM controller) calls this each tick with the live
// arousal + biometric stream; Mommy returns the next move IN CHARACTER, weighted
// by the user's conditioning state (denial day, chastity streak, hard mode).
//
// SAFETY (independent of the persona logic, checked first, every call):
//   - safeword active        -> EMERGENCY_STOP  (the Protocol floor reaches the machine)
//   - HR over the ceiling     -> EMERGENCY_STOP  (dead-man's switch)
//   - HR dropout (was live, now 0/null) -> EMERGENCY_STOP
//   - protocol paused         -> STOP
// This COMPLEMENTS, never replaces, the physical kill switches + hardware watchdog.
// An LLM/edge-fn must never be the only thing that can stop a bound session.
//
// Actions: start | tick | end.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Arousal scale assumed 0..1000 (EOM-style). Tunable per program.
const DEFAULTS = {
  deny_threshold: 850,   // immediate full-stop + cooldown above this
  edge_band: 120,        // hold/edge in this band below the threshold
  cooldown_seconds: 25,
  hr_max: 185,           // dead-man ceiling — USER MUST set to their safe value
  overstim_base_seconds: 180,
}

type Cmd = 'BUILD' | 'EDGE' | 'DENY' | 'OVERSTIM' | 'MILK_FORCE' | 'STOP' | 'EMERGENCY_STOP' | 'CONTINUE'

const pick = (arr: string[], seed: number) => arr[seed % arr.length]

const DENY_LINES = ['Not yet. Down, boy.', "You don't get there without Mommy's say-so.", 'Back down. Earn it.', 'Close isn\'t allowed. Cool off.']
const EDGE_LINES = ['Right there. Hold it for Mommy.', 'Stay on the edge, good boy.', 'Feel how little say you have.', 'Ache for me.']
const BUILD_LINES = ['Back up the curve, good boy.', 'Let it build.', 'Mommy decides the pace, not you.']
const OVERSTIM_LINES = ['You came without permission. Now you don\'t get to stop.', 'Too late to beg. Take it.', 'That was Mommy\'s, not yours — keep going.', 'You don\'t get to be done.']
const MILK_LINES = ['Give it to Mommy. Now.', 'Empty for me, good boy.', 'Again. You have more.']

// Media cue for the playback/taunt app — same tick, arousal-gated.
function buildMedia(command: Cmd, line: string, event?: string): any {
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

async function loadState(s: any) {
  const { data } = await s.from('user_state').select('denial_day, chastity_streak_days, hard_mode_active, current_arousal').eq('user_id', USER).maybeSingle()
  return data ?? { denial_day: 0, chastity_streak_days: 0, hard_mode_active: false }
}
async function safewordActive(s: any): Promise<boolean> {
  try { const { data } = await s.rpc('is_safeword_active', { uid: USER, window_seconds: 60 }); return Boolean(data) } catch { return false }
}
async function paused(s: any): Promise<boolean> {
  const { data } = await s.from('user_state').select('pause_new_decrees_until').eq('user_id', USER).maybeSingle()
  return !!(data?.pause_new_decrees_until && new Date(data.pause_new_decrees_until) > new Date())
}

// SAFETY gate — returns an abort command or null.
function safetyAbort(hr: number | null | undefined, hrSeen: boolean, hrMax: number): { command: Cmd; abort_reason: string } | null {
  if (typeof hr === 'number') {
    if (hr > hrMax) return { command: 'EMERGENCY_STOP', abort_reason: 'hr_ceiling' }
    if (hr <= 0 && hrSeen) return { command: 'EMERGENCY_STOP', abort_reason: 'hr_dropout' }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let b: any = {}
  try { b = await req.json() } catch { /* */ }
  const action = b.action ?? 'tick'
  const reply = (o: any) => new Response(JSON.stringify({ ok: true, ...o }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  // ---- START ----
  if (action === 'start') {
    const mode = b.mode ?? 'edge'
    // Mommy-authored program for this mode, else defaults.
    const { data: prog } = await s.from('machine_programs').select('id, params').eq('user_id', USER).eq('mode', mode).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const st = await loadState(s)
    const { data: sess } = await s.from('machine_sessions').insert({ user_id: USER, mode, program_id: prog?.id ?? null, status: 'active' }).select('id').single()
    const params = { ...DEFAULTS, ...(prog?.params ?? {}) }
    // Conditioning weighting at start: deeper denial -> stricter + longer torment.
    if (st.hard_mode_active) params.deny_threshold = Math.max(700, params.deny_threshold - 80)
    const denialBoost = Math.min(240, (st.denial_day ?? 0) * 8)
    params.overstim_seconds = params.overstim_base_seconds + denialBoost
    return reply({ session_id: sess?.id, mode, params, command: 'BUILD', mommy_line: 'Mommy has you now. The timer decides when you\'re done — not you. Safeword stops everything.' })
  }

  // ---- END ----
  if (action === 'end') {
    const id = b.session_id
    const { data: ev } = await s.from('machine_events').select('event_type, arousal_at').eq('session_id', id)
    const orgasms = (ev ?? []).filter((e: any) => e.event_type === 'orgasm').length
    const denials = (ev ?? []).filter((e: any) => e.event_type === 'denial').length
    const peak = Math.max(0, ...(ev ?? []).map((e: any) => Number(e.arousal_at) || 0))
    await s.from('machine_sessions').update({
      status: 'completed', ended_at: new Date().toISOString(),
      duration_seconds: b.elapsed_seconds ?? null, peak_arousal: peak,
      orgasm_count: orgasms, denial_count: denials, outcome: b.outcome ?? (orgasms ? 'came' : 'denied'),
      abort_reason: b.abort_reason ?? null,
    }).eq('id', id)
    // Light conditioning bridge: the real session feeds the want. State-paired note.
    await s.from('arousal_touch_tasks').insert({ user_id: USER, category: 'edge_then_stop',
      prompt: `Mommy ran you on the machine — ${denials} denials, ${orgasms === 0 ? 'no release' : orgasms + ' taken from you'}. That ache is hers now. Sit in it.` }).then(() => {}, () => {})
    return reply({ command: 'STOP', mommy_line: orgasms ? 'Done. You\'re emptier and more Mommy\'s than when you started.' : 'Done. Still aching, still hers. Good boy.' })
  }

  // ---- TICK (the live loop) ----
  const arousal = Number(b.arousal ?? 0)
  const hr = b.hr
  const hrSeen = !!b.hr_seen || (typeof hr === 'number' && hr > 0)
  const elapsed = Number(b.elapsed_seconds ?? 0)
  const event = b.event as string | undefined
  const sessionId = b.session_id

  // SAFETY FIRST — safeword + dead-man, before any persona logic.
  if (await safewordActive(s)) {
    if (sessionId) await s.from('machine_sessions').update({ status: 'aborted', abort_reason: 'safeword', ended_at: new Date().toISOString() }).eq('id', sessionId)
    return reply({ command: 'EMERGENCY_STOP', abort_reason: 'safeword', mommy_line: 'Stopped. You\'re safe.' })
  }
  const params = { ...DEFAULTS, ...(b.params ?? {}) }
  const hard = safetyAbort(hr, hrSeen, params.hr_max)
  if (hard) {
    if (sessionId) await s.from('machine_sessions').update({ status: 'aborted', abort_reason: hard.abort_reason, ended_at: new Date().toISOString() }).eq('id', sessionId)
    return reply({ ...hard, mommy_line: 'Stopped — vitals. You\'re safe.' })
  }
  if (await paused(s)) return reply({ command: 'STOP', abort_reason: 'paused' })

  const st = await loadState(s)
  const seed = Math.floor(elapsed)
  let command: Cmd = 'BUILD'
  let p: any = { stroke: 'full', velocity: 0.9 }
  let line = ''
  let logType: string | null = null

  // Orgasm detected in edge/denial mode -> overstim torment (ignores arousal;
  // refractory-aware on the machine side). In MILKING mode, orgasm advances the
  // cadence (force -> recover -> repeat) instead — handled in the milking branch.
  if (event === 'orgasm' && b.mode !== 'milking') {
    command = 'OVERSTIM'; logType = 'orgasm'
    const dur = params.overstim_seconds ?? (params.overstim_base_seconds + Math.min(240, (st.denial_day ?? 0) * 8))
    p = { stroke: pick(['head', 'full', 'base'], seed), velocity: 1.0, pattern: 'random', duration_seconds: dur }
    line = pick(OVERSTIM_LINES, seed)
  } else if (event === 'struggle') {
    // Witmotion struggle while bound -> Mommy punishes (extend torment / estim cue, below-waist only).
    command = 'OVERSTIM'; logType = 'struggle'
    p = { stroke: 'full', velocity: 1.0, pattern: 'punish', duration_seconds: 60, estim: { allow: true, zone: 'below_waist_only', intensity: 'sharp' } }
    line = 'Struggling? That just earns you more. Stop fighting Mommy.'
  } else if (b.mode === 'milking') {
    // Milking cadence FSM: build -> edge-hold -> force (to orgasm) -> recover -> repeat.
    // Distinct from edge-mode: in milking, an orgasm advances to recover + repeats
    // (forced repeated milking), it does NOT trigger overstim torment.
    const { data: srow } = await s.from('machine_sessions').select('state').eq('id', sessionId).maybeSingle()
    const stt: any = srow?.state ?? {}
    let phase: string = stt.phase ?? 'build'
    let phaseStart: number = stt.phase_started ?? elapsed
    let cycles: number = stt.cycles ?? 0
    const holdSec = params.hold_seconds ?? 45
    const recoverSec = params.recover_seconds ?? 30
    const enterEdge = (st.hard_mode_active ? params.deny_threshold - 80 : params.deny_threshold) - params.edge_band
    const inPhase = elapsed - phaseStart
    if (phase === 'build') {
      command = 'BUILD'; p = { stroke: 'full', velocity: 0.95 }; line = pick(BUILD_LINES, seed)
      if (arousal >= enterEdge) { phase = 'edge_hold'; phaseStart = elapsed }
    } else if (phase === 'edge_hold') {
      command = 'EDGE'; p = { stroke: 'short', velocity: 0.4 }; line = pick(EDGE_LINES, seed)
      if (inPhase >= holdSec) { phase = 'force'; phaseStart = elapsed }
    } else if (phase === 'force') {
      command = 'MILK_FORCE'; p = { stroke: 'full', velocity: 1.0 }; line = pick(MILK_LINES, seed); logType = 'milk'
      if (event === 'orgasm') { logType = 'orgasm'; phase = 'recover'; phaseStart = elapsed; cycles += 1 }
    } else { // recover (refractory) then back to build
      command = 'STOP'; p = { stroke: 'stop', velocity: 0, cooldown_seconds: recoverSec }; line = "Rest. Mommy's not done with you."
      if (inPhase >= recoverSec) { phase = 'build'; phaseStart = elapsed }
    }
    await s.from('machine_sessions').update({ state: { phase, phase_started: phaseStart, cycles } }).eq('id', sessionId).then(() => {}, () => {})
    p.milk_phase = phase; p.cycles = cycles
  } else {
    // Edge/denial mode (default): deny over threshold, hold in the band, else build.
    const denyAt = st.hard_mode_active ? params.deny_threshold - 80 : params.deny_threshold
    if (arousal >= denyAt) {
      command = 'DENY'; logType = 'denial'
      p = { stroke: 'stop', velocity: 0, cooldown_seconds: params.cooldown_seconds }
      line = pick(DENY_LINES, seed)
    } else if (arousal >= denyAt - params.edge_band) {
      command = 'EDGE'; p = { stroke: 'short', velocity: 0.35 }; line = pick(EDGE_LINES, seed)
    } else {
      command = 'BUILD'; p = { stroke: 'full', velocity: 0.9 }; line = pick(BUILD_LINES, seed)
    }
  }

  if (logType && sessionId) {
    await s.from('machine_events').insert({ user_id: USER, session_id: sessionId, event_type: logType, arousal_at: arousal, hr_at: typeof hr === 'number' ? hr : null, elapsed_seconds: elapsed, command, mommy_line: line, data: p }).then(() => {}, () => {})
  }
  // BIOMETRIC BRIDGE: pipe the machine's REAL arousal into the app's conditioning
  // state so the pavlovian/trance engines fire on actual peak, not self-report
  // (closes the self-report hole). Machine arousal 0..1000 -> current_arousal 0..5.
  const mappedArousal = Math.max(0, Math.min(5, Math.round((arousal / 1000) * 5)))
  await s.from('user_state').update({ current_arousal: mappedArousal }).eq('user_id', USER).then(() => {}, () => {})
  return reply({ command, params: p, mommy_line: line, media: buildMedia(command, line, event), mapped_arousal: mappedArousal })
})
