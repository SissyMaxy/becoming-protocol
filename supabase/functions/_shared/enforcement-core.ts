// enforcement-core — pure logic for Enforcement Spine v2.
//
// NO Deno / supabase imports here: this file is imported both by edge
// functions (force-processor, outward-consequence-dispatcher, handler-
// enforcement) and by vitest (src/__tests__/lib/enforcement-core.test.ts),
// which pins the formulas against fixtures.
//
// SQL mirrors (keep in sync):
//   pressureScore     ↔ pressure_score()        (mig 628)
//   isMandatedText    ↔ is_mandated_text()      (mig 628)
//   normalizeMandatedText ↔ normalize_mandated_text() (mig 628)

// ─── Pressure calculus (design §2) ────────────────────────────────────────
// Σ over 14d of points × 0.5^(age_hours/72), per-day intake cap 6 points.
// Derived on read, stored nowhere.

export interface PressureEvent {
  points: number
  occurredAt: string | Date
}

const WINDOW_MS = 14 * 24 * 3600_000
const HALF_LIFE_HOURS = 72
const DAY_CAP = 6

export function pressureScore(events: PressureEvent[], now: Date = new Date()): number {
  const nowMs = now.getTime()
  const inWindow = events
    .map(e => ({ points: e.points, at: new Date(e.occurredAt).getTime() }))
    .filter(e => e.at <= nowMs && nowMs - e.at < WINDOW_MS)

  // Per-day intake cap: if a day's raw points exceed 6, every event that day
  // is scaled by 6/raw (mirrors the SQL window-function implementation).
  const dayTotals = new Map<string, number>()
  for (const e of inWindow) {
    const day = new Date(e.at).toISOString().slice(0, 10)
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + e.points)
  }

  let score = 0
  for (const e of inWindow) {
    const day = new Date(e.at).toISOString().slice(0, 10)
    const raw = dayTotals.get(day) ?? e.points
    const scale = raw > DAY_CAP ? DAY_CAP / raw : 1
    const ageHours = (nowMs - e.at) / 3600_000
    score += e.points * scale * Math.pow(0.5, ageHours / HALF_LIFE_HOURS)
  }
  return score
}

// Hard Mode ON requires all three (design §2). The distinct-miss inputs are
// counted by the caller from evidence-linked missed obligations only.
export function hardModeShouldFlipOn(
  pressure: number,
  distinctMissedObligations: number,
  distinctMissDays: number,
): boolean {
  return pressure >= 10 && distinctMissedObligations >= 2 && distinctMissDays >= 2
}

// Hard Mode OFF: pressure < 3 for 72h. Without new events pressure only
// decays, so "no events in 72h AND pressure < 3 now" ⇒ it was < 3 throughout.
export function hardModeShouldFlipOff(pressure: number, eventsInLast72h: number): boolean {
  return pressure < 3 && eventsInLast72h === 0
}

// ─── Dodge model (design §2) — terminal at 2, no third dodge exists ──────

export type DodgeAction =
  | { action: 'rearm'; newDodgeCount: 1; rescheduleHours: 24; pressurePoints: 3 }
  | { action: 'commute'; newDodgeCount: 2; unlockPushDays: 2; pressurePoints: 4 }
  | { action: 'none' }

export function nextDodgeAction(currentDodgeCount: number): DodgeAction {
  if (currentDodgeCount <= 0) {
    return { action: 'rearm', newDodgeCount: 1, rescheduleHours: 24, pressurePoints: 3 }
  }
  if (currentDodgeCount === 1) {
    return { action: 'commute', newDodgeCount: 2, unlockPushDays: 2, pressurePoints: 4 }
  }
  // dodge_count already >= 2: the loop is terminal. Nothing re-arms.
  return { action: 'none' }
}

// ─── Mandated-text matcher (design §5) ────────────────────────────────────

export function normalizeMandatedText(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// TRUE when the normalized text IS a mandated line, or CONTAINS one making
// up ≥60% of its content.
export function isMandatedText(text: string, mandatedNormalized: string[]): boolean {
  const norm = normalizeMandatedText(text)
  if (norm.length < 3) return false
  for (const m of mandatedNormalized) {
    if (!m || m.length < 3) continue
    if (m === norm) return true
    if (norm.includes(m) && m.length / norm.length >= 0.6) return true
  }
  return false
}

// ─── Seen-tap acknowledgment (design §2 — the +3 acknowledged-miss path) ──
// A genuinely-displayed obligation is stamped surfaced_via='seen_tap'. The
// miss-processor (mig 628) then scores its miss at 3 points ('acknowledged' =
// she saw it and let it lapse = deliberate) instead of 2 ('internal').
// SQL mirror: acknowledge_obligation() (mig 644). Kept here so the browser
// surface (surface-render-hooks) and vitest share one source of truth.

export const SEEN_TAP_VIA = 'seen_tap' as const;

// The obligation statuses in which a seen-tap ack is allowed to stamp: live and
// strictly pre-consequence. missed / consequence_* / terminal are never upgraded.
export const ACK_STAMPABLE_STATUSES = ['filed', 'surfaced', 'due'] as const;

export interface ObligationAckState {
  status: string;
  surfaced_via: string | null;
  surfaced_at: string | null;
}

export interface AckStampDecision {
  shouldUpdate: boolean;
  nextStatus: string;
  nextSurfacedVia: string | null;
  nextSurfacedAt: string | null;
}

// Pure mirror of acknowledge_obligation(): given the obligation's current state
// and the ack time, resolve what the stamp becomes. Idempotent — a row already
// seen-tap-surfaced returns shouldUpdate=false.
export function computeAckStamp(o: ObligationAckState, nowIso: string): AckStampDecision {
  const noop: AckStampDecision = {
    shouldUpdate: false,
    nextStatus: o.status,
    nextSurfacedVia: o.surfaced_via,
    nextSurfacedAt: o.surfaced_at,
  };
  // Only live, pre-consequence obligations can be acknowledged.
  if (!(ACK_STAMPABLE_STATUSES as readonly string[]).includes(o.status)) return noop;
  // Already acknowledged (and past filed) → idempotent no-op.
  if (o.surfaced_via === SEEN_TAP_VIA && o.status !== 'filed') return noop;
  return {
    shouldUpdate: true,
    // A 'filed' row is surfaced BY the ack; anything else keeps its status.
    nextStatus: o.status === 'filed' ? 'surfaced' : o.status,
    nextSurfacedVia: SEEN_TAP_VIA,
    // COALESCE(surfaced_at, now()) — never overwrite an earlier honest surface.
    nextSurfacedAt: o.surfaced_at ?? nowIso,
  };
}

// FocusMode task kinds whose single on-screen row IS a ledger obligation source.
// ONLY these single-task displays are genuine enough to acknowledge — the mere
// existence of a fetched row is not a "seen tap". Every other kind maps to null
// and is never stamped. (dose is intentionally excluded: FocusMode's dose task
// carries the regimen_id, not the dose_log row id the obligation is keyed on.)
const ACK_SOURCE_BY_KIND: Record<string, string> = {
  focus_decree: 'handler_decrees',
  overdue_decree: 'handler_decrees',
  due_today_decree: 'handler_decrees',
  due_today_commitment: 'handler_commitments',
  overdue_punishment: 'punishment_queue',
  overdue_confession: 'confession_queue',
  due_today_confession: 'confession_queue',
  workout_today: 'workout_prescriptions',
};

export interface AckSource {
  sourceTable: string;
  sourceId: string;
}

// Resolve the obligation source (table + id) to acknowledge for a given
// on-screen FocusMode task, or null when the task is not an acknowledgeable
// obligation display.
export function ackSourceForTask(kind: string, rowId: string | null): AckSource | null {
  if (!rowId) return null;
  const sourceTable = ACK_SOURCE_BY_KIND[kind];
  if (!sourceTable) return null;
  return { sourceTable, sourceId: rowId };
}

// ─── Gate (design §3) — thin RPC caller, fail-CLOSED ─────────────────────

export type GateMode = 'active' | 'paused' | 'safeword_latched'

export interface GateResult {
  mode: GateMode
  until: string | null
  reason: string | null
}

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>

// Single source of gate logic is SQL enforcement_gate(). This wrapper only
// adds the fail-closed contract: any error, empty result, or unknown mode
// reads as 'paused' — a broken gate never lets a consequence through.
export async function enforcementGate(rpc: RpcFn, userId: string): Promise<GateResult> {
  const CLOSED: GateResult = { mode: 'paused', until: null, reason: 'gate_error_failed_closed' }
  try {
    const { data, error } = await rpc('enforcement_gate', { p_user: userId })
    if (error) return CLOSED
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null)
    if (!row || typeof row.mode !== 'string') return CLOSED
    if (row.mode !== 'active' && row.mode !== 'paused' && row.mode !== 'safeword_latched') return CLOSED
    return {
      mode: row.mode as GateMode,
      until: (row.until as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
    }
  } catch {
    return CLOSED
  }
}
