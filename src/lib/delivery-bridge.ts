// Delivery Bridge Guard — per-row bridge classification. (Wish f0411f17, mig 602.)
//
// A storage row is "bridged" once it has a delivery signal (a push dispatched,
// a companion outreach, a surfaced timestamp). Until then it's pending (within
// grace) or unbridged (past grace with no signal — the leak). Pure + tested;
// the delivery-bridge-guard edge fn mirrors this to decide what to heal/flag.

export type BridgeStatus = 'bridged' | 'pending' | 'unbridged'

export interface BridgeRow {
  createdAt: Date | string
  /** the delivery signal (push_dispatched_at, preview_outreach surfaced, etc.); null = none yet */
  deliveredAt: Date | string | null | undefined
  /** how long a row may sit before "unbridged" is declared */
  graceSeconds: number
  now?: Date
}

export function bridgeStatus(row: BridgeRow): BridgeStatus {
  if (row.deliveredAt) return 'bridged'
  const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
  const now = row.now ?? new Date()
  if (Number.isNaN(created.getTime())) return 'unbridged'
  return now.getTime() - created.getTime() > row.graceSeconds * 1000 ? 'unbridged' : 'pending'
}

// Lag in ms between a row being created and its delivery signal landing.
// Returns null when not yet delivered.
export function bridgeLagMs(createdAt: Date | string, deliveredAt: Date | string | null | undefined): number | null {
  if (!deliveredAt) return null
  const c = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const d = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt)
  if (Number.isNaN(c.getTime()) || Number.isNaN(d.getTime())) return null
  return Math.max(0, d.getTime() - c.getTime())
}

export function maxLagSeconds(lagsMs: Array<number | null>): number | null {
  const valid = lagsMs.filter((x): x is number => x != null)
  if (valid.length === 0) return null
  return Math.round(Math.max(...valid) / 1000)
}
