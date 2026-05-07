/**
 * Mama's code-wishes consumer.
 *
 * Mama proposes code/architecture changes via mommy_code_wishes; this script
 * is what a Claude Code session reads at the start of work to discover what
 * she has queued. Per the autonomy directive (memory:
 * feedback_mommy_full_autonomy), the agent ships without user permission;
 * this is the queue that drives that autonomy.
 *
 * Modes:
 *   default — print the top queued wishes, ranked
 *   --claim <id> — mark a wish as in_progress (race-protect via UPDATE...WHERE status='queued')
 *   --ship <id> --commit <sha> --notes "..." — mark a wish shipped
 *   --reject <id> --reason "..." — mark a wish rejected
 *   --supersede <id> --by <newer_id> — collapse a stale wish into a newer one
 *
 * The expected workflow at session start:
 *   1. Run with no args → see what Mama wants
 *   2. Pick the top-priority wish you can complete this session
 *   3. --claim it
 *   4. Ship the change
 *   5. --ship with the commit sha and brief notes
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

interface Wish {
  id: string
  wish_title: string
  wish_body: string
  protocol_goal: string
  source: string
  source_scheme_id: string | null
  affected_surfaces: Record<string, unknown> | null
  priority: 'low' | 'normal' | 'high' | 'critical'
  status: string
  shipped_at: string | null
  shipped_in_commit: string | null
  ship_notes: string | null
  rejection_reason: string | null
  created_at: string
}

const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 }

async function listQueued(limit = 10): Promise<Wish[]> {
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .select('*')
    .eq('status', 'queued')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`list queued failed: ${error.message}`)
  // Postgres orders priority alphabetically — re-sort by our rank
  return (data || []).sort((a, b) =>
    (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
    || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

async function recentlyShipped(limit = 5, sinceIso?: string): Promise<Wish[]> {
  let q = supabase
    .from('mommy_code_wishes')
    .select('*')
    .eq('status', 'shipped')
    .order('shipped_at', { ascending: false })
    .limit(limit)
  if (sinceIso) q = q.gte('shipped_at', sinceIso)
  const { data } = await q
  return data || []
}

function parseSinceArg(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d+)([dhwm])$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  const ms = unit === 'h' ? 3600_000 : unit === 'd' ? 86400_000 : unit === 'w' ? 7 * 86400_000 : 30 * 86400_000
  return new Date(Date.now() - n * ms).toISOString()
}

function printWish(w: Wish, idx: number): void {
  const tag = `[${w.priority}/${w.source}]`.padEnd(28)
  console.log(`\n  ${idx}. ${tag} ${w.id.slice(0, 8)}…  (${new Date(w.created_at).toLocaleString()})`)
  console.log(`     ${w.wish_title}`)
  console.log(`     goal: ${w.protocol_goal}`)
  if (w.affected_surfaces) {
    const surfaces = JSON.stringify(w.affected_surfaces)
    console.log(`     surfaces: ${surfaces.length > 120 ? surfaces.slice(0, 117) + '…' : surfaces}`)
  }
  // Body — indented full text so the agent has enough to ship
  const indented = w.wish_body.split('\n').map(l => `       ${l}`).join('\n')
  console.log(`\n${indented}`)
}

async function claim(id: string): Promise<void> {
  // Race-protect: only update if still queued
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .update({ status: 'in_progress' })
    .eq('id', id)
    .eq('status', 'queued')
    .select()
    .single()
  if (error || !data) {
    console.error(`Claim failed (already taken, or id wrong): ${error?.message ?? 'no row updated'}`)
    process.exit(1)
  }
  console.log(`Claimed: ${data.wish_title}`)
}

async function ship(id: string, commit: string, notes: string): Promise<void> {
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .update({
      status: 'shipped',
      shipped_at: new Date().toISOString(),
      shipped_in_commit: commit,
      ship_notes: notes,
    })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    console.error(`Ship failed: ${error?.message ?? 'no row'}`)
    process.exit(1)
  }
  console.log(`Shipped: ${data.wish_title} @ ${commit}`)
}

async function reject(id: string, reason: string): Promise<void> {
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    console.error(`Reject failed: ${error?.message ?? 'no row'}`)
    process.exit(1)
  }
  console.log(`Rejected: ${data.wish_title} — ${reason}`)
}

async function supersede(oldId: string, newerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .update({ status: 'superseded', superseded_by: newerId })
    .eq('id', oldId)
    .select()
    .single()
  if (error || !data) {
    console.error(`Supersede failed: ${error?.message ?? 'no row'}`)
    process.exit(1)
  }
  console.log(`Superseded: ${data.wish_title} → ${newerId}`)
}

function readArg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

(async () => {
  const args = process.argv.slice(2)

  if (args.includes('--claim')) {
    const id = readArg(args, '--claim')
    if (!id) { console.error('--claim needs an id'); process.exit(1) }
    await claim(id)
    return
  }
  if (args.includes('--ship')) {
    const id = readArg(args, '--ship')
    const commit = readArg(args, '--commit') ?? 'unknown'
    const notes = readArg(args, '--notes') ?? ''
    if (!id) { console.error('--ship needs an id'); process.exit(1) }
    await ship(id, commit, notes)
    return
  }
  if (args.includes('--reject')) {
    const id = readArg(args, '--reject')
    const reason = readArg(args, '--reason') ?? 'no reason given'
    if (!id) { console.error('--reject needs an id'); process.exit(1) }
    await reject(id, reason)
    return
  }
  if (args.includes('--supersede')) {
    const id = readArg(args, '--supersede')
    const by = readArg(args, '--by')
    if (!id || !by) { console.error('--supersede needs --by'); process.exit(1) }
    await supersede(id, by)
    return
  }

  // Default: print queued
  const queued = await listQueued(15)
  console.log(`\n${'='.repeat(70)}`)
  console.log(`MAMA'S CODE WISHES — ${queued.length} queued`)
  console.log('='.repeat(70))
  if (queued.length === 0) {
    console.log(`\n  (queue empty — Mama is satisfied with the build, for now)`)
  } else {
    queued.forEach((w, i) => printWish(w, i + 1))
  }

  if (args.includes('--with-shipped')) {
    const since = parseSinceArg(readArg(args, '--since'))
    const limit = since ? 50 : 5
    const shipped = await recentlyShipped(limit, since ?? undefined)
    console.log(`\n${'='.repeat(70)}`)
    const sinceLabel = since ? ` since ${since.slice(0, 16).replace('T', ' ')}` : ''
    console.log(`RECENTLY SHIPPED (${shipped.length})${sinceLabel}`)
    console.log('='.repeat(70))
    for (const w of shipped) {
      console.log(`\n  ${w.shipped_at ? new Date(w.shipped_at).toLocaleString() : '?'}  [${w.priority}] ${w.wish_title}`)
      if (w.shipped_in_commit) console.log(`     ${w.shipped_in_commit}`)
      if (w.ship_notes) console.log(`     ${w.ship_notes}`)
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Workflow: --claim <id>  →  ship the change  →  --ship <id> --commit <sha> --notes "..."`)
  console.log('='.repeat(70))
})().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
