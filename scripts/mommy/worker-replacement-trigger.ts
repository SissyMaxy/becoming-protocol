/**
 * worker-replacement-trigger — operator CLI over the nudge pattern analyzer.
 * (Wish ce25ad0b.)
 *
 * The nudge-pattern-analyzer edge fn runs weekly and auto-files fix-wishes
 * for degrading workers. This script is the manual lever:
 *
 *   npm run mommy:workers                 — print worker health (worst first)
 *   npm run mommy:workers -- --run        — run the analyzer now (live)
 *   npm run mommy:workers -- --dry        — analyzer dry-run (no writes)
 *   npm run mommy:workers -- --trigger <worker>
 *                                         — force a replacement-worker wish
 *
 * Reduces operator dependency: most of the time the cron handles this; the
 * CLI is for when the operator wants to look or force a replacement.
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

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

async function invokeAnalyzer(dryRun: boolean): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/nudge-pattern-analyzer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ dry_run: dryRun }),
  })
  const j = await res.json()
  console.log(`\nAnalyzer (${dryRun ? 'dry-run' : 'live'}):`, JSON.stringify(j, null, 2))
}

async function printHealth(): Promise<void> {
  const { data: scores } = await supabase
    .from('worker_health_scores')
    .select('worker, health_score, nudges_7d, last_classification, last_nudge_at')
    .order('health_score', { ascending: true })
  const rows = scores ?? []
  console.log(`\n${'='.repeat(64)}`)
  console.log(`WORKER HEALTH — ${rows.length} tracked (worst first)`)
  console.log('='.repeat(64))
  if (rows.length === 0) {
    console.log('  (no scores yet — run with --run to populate)')
  }
  for (const r of rows as Array<{ worker: string; health_score: number; nudges_7d: number; last_classification: string | null; last_nudge_at: string | null }>) {
    const bar = '█'.repeat(Math.round(r.health_score / 10)).padEnd(10, '·')
    const flag = r.health_score < 50 ? '  ⚠' : ''
    console.log(`  ${bar} ${String(r.health_score).padStart(3)}  ${r.worker}  (${r.nudges_7d} nudges/7d${r.last_classification ? `, ${r.last_classification}` : ''})${flag}`)
  }

  const { data: patterns } = await supabase
    .from('worker_nudge_patterns')
    .select('worker, nudge_count, classification, action_taken, fix_wish_id, analyzed_at')
    .order('analyzed_at', { ascending: false })
    .limit(10)
  if ((patterns ?? []).length) {
    console.log(`\nRECENT PATTERNS:`)
    for (const p of patterns as Array<{ worker: string; nudge_count: number; classification: string; action_taken: string; fix_wish_id: string | null; analyzed_at: string }>) {
      console.log(`  ${new Date(p.analyzed_at).toLocaleString()}  ${p.worker} — ${p.nudge_count}x → ${p.classification} → ${p.action_taken}${p.fix_wish_id ? ` (wish ${p.fix_wish_id.slice(0, 8)})` : ''}`)
    }
  }
}

async function triggerReplacement(worker: string): Promise<void> {
  // Don't stack on an open wish for this worker.
  const { data: existing } = await supabase
    .from('mommy_code_wishes')
    .select('id').ilike('wish_title', `%'${worker}'%`).in('status', ['queued', 'in_progress']).limit(1).maybeSingle()
  if (existing) {
    console.log(`An open fix-wish for '${worker}' already exists (${(existing as { id: string }).id.slice(0, 8)}). Skipping.`)
    return
  }
  const { data: health } = await supabase.from('worker_health_scores').select('nudges_7d').eq('worker', worker).maybeSingle()
  const nudges = (health as { nudges_7d?: number } | null)?.nudges_7d ?? 0
  const { data: wish, error } = await supabase.from('mommy_code_wishes').insert({
    wish_title: `Replace/repair worker '${worker}' — operator-triggered`,
    wish_body: `Operator forced a replacement trigger for worker '${worker}' (${nudges} nudges in the last 7d). Read the failing path in '${worker}', reproduce, and repair or rewrite the worker. Add a regression test + generation-site gate. Verify the supervisor stops nudging it.`,
    protocol_goal: `Repair or replace worker ${worker} that keeps needing operator intervention.`,
    source: 'worker_replacement_trigger',
    affected_surfaces: { worker, operator_triggered: true },
    priority: 'high',
    status: 'queued',
  }).select('id').single()
  if (error) { console.error('Failed to create wish:', error.message); process.exit(1) }
  console.log(`Replacement wish created for '${worker}': ${(wish as { id: string }).id}`)
}

;(async () => {
  const trigger = arg('--trigger')
  if (trigger) { await triggerReplacement(trigger); return }
  if (process.argv.includes('--run')) { await invokeAnalyzer(false); await printHealth(); return }
  if (process.argv.includes('--dry')) { await invokeAnalyzer(true); return }
  await printHealth()
})().catch((err) => { console.error('Failed:', err); process.exit(1) })
