// Aftercare client library — types + the internal trigger seam.
//
// Aftercare is the OFF switch — post-intensity comfort layer. NO persona
// voice, NO pet names, NO kink, NO distortion, NO telemetry. Always
// available; unconditional 60s minimum dwell before the user can exit.
//
// Integration seam for feature/gaslight-mechanics-2026-04-30:
// when that branch's safeword exit fires, it should call
// `enterAftercare({ trigger: 'post_safeword', intensity })`. That fn is
// the ONLY agreed-upon contract — they don't depend on our edge fn URL,
// our table layout, or our overlay's mount point. If they ship before
// us, they can call this fn safely (it no-ops if the migration hasn't
// run, returning an error code without throwing).

import { supabase } from './supabase'

export type AftercareEntryTrigger = 'post_safeword' | 'post_session' | 'post_cruel' | 'manual'
export type AftercareIntensity = 'none' | 'soft' | 'standard' | 'cruel'
export type AftercareCategory =
  | 'validation' | 'safety' | 'softness' | 'reality_anchor'
  | 'hydration' | 'breath_cue' | 'grounding'

export interface AftercareSequenceItem {
  id: string
  text: string
  category: AftercareCategory
  min_dwell_seconds: number
}

export interface AftercareEnterResult {
  ok: boolean
  session_id?: string
  sequence?: AftercareSequenceItem[]
  total_min_dwell_seconds?: number
  voice_hint?: { voice_profile: string; stability: number; style: number; similarity_boost: number }
  error?: string
}

interface EnterArgs {
  userId: string
  trigger: AftercareEntryTrigger
  intensity?: AftercareIntensity
}

const AFTERCARE_FN = 'mommy-aftercare'

// EXIT GATE — minimum 60s in aftercare before "I'm done" enables.
// Non-bypassable from UI. The exit gate is REAL.
export const AFTERCARE_MIN_DWELL_MS = 60_000

// 4-7-8 breath cadence in milliseconds. UI uses these to synchronize
// the optional breath-circle visualization. One full cycle = 19s.
export const BREATH_CADENCE_4_7_8 = {
  inhale_ms: 4_000,
  hold_ms: 7_000,
  exhale_ms: 8_000,
  cycle_ms: 19_000,
} as const

// Internal trigger seam. Callers (Settings button, gaslight branch's
// safeword exit, session-close hook) all funnel through here. Never
// throws — returns a structured error if the edge fn is unavailable.
export async function enterAftercare(args: EnterArgs): Promise<AftercareEnterResult> {
  try {
    const { data, error } = await supabase.functions.invoke(AFTERCARE_FN, {
      body: {
        user_id: args.userId,
        entry_trigger: args.trigger,
        entry_intensity: args.intensity ?? (args.trigger === 'post_cruel' ? 'cruel' : 'none'),
      },
    })
    if (error) return { ok: false, error: error.message || 'edge_fn_error' }
    return data as AftercareEnterResult
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' }
  }
}

// Mark an in-progress aftercare session complete. The exit gate is
// enforced in the UI (the button stays disabled for 60s); this fn
// just records the timestamp + final breath-cycle count.
export async function exitAftercare(args: {
  sessionId: string
  breathCyclesCompleted: number
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('aftercare_sessions')
    .update({
      exited_at: new Date().toISOString(),
      breath_cycles_completed: args.breathCyclesCompleted,
    })
    .eq('id', args.sessionId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Auto-route on cruel-session exit: caller passes the just-ended
// session's intensity + duration; we route to aftercare iff the
// session was cruel AND lasted longer than the configured threshold.
//
// `minMinutes` is the configurable N from the spec — defaults to 10.
// Callers can tune per surface (e.g. settings can lower it for
// testing, prod cron can raise it).
export function shouldAutoRouteAftercare(args: {
  sessionIntensity: AftercareIntensity
  sessionDurationMs: number
  minMinutes?: number
}): boolean {
  if (args.sessionIntensity !== 'cruel') return false
  const threshold = (args.minMinutes ?? 10) * 60_000
  return args.sessionDurationMs >= threshold
}
