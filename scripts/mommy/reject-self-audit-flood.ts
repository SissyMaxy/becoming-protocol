/**
 * Bulk-reject the mommy-self-audit self-strengthening FLOOD (2026-05-26).
 *
 * mommy-self-audit (daily) proposes LLM-worded "self_strengthening" wishes
 * for the same handful of unfixed infra signals (never-run cron, CI failure,
 * builder drafter null-return, supervisor nudge, stale wish). Its soft
 * prompt-dedup fails because the LLM rewords each one, so the queue floods.
 *
 * Discriminator: source='gap_audit' AND wish_class IN
 * ('self_strengthening','redesign_question'). This SPARES the earlier 5/10
 * content wishes that were also tagged source='gap_audit' but have a real
 * wish_class / phase_gate (e.g. #6 wardrobe-photo reaction).
 *
 * Dry-run by default; pass --apply to actually reject.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } },
)

const REASON =
  'Self-audit flood (2026-05-26 triage). mommy-self-audit re-proposed the same ' +
  'unfixed infra signals daily (never-run cron / CI failure / builder drafter ' +
  'null-return / supervisor nudge / stale wish), reworded each run so the soft ' +
  'prompt-dedup never caught them — 60+ near-duplicates. The real fix is at the ' +
  'generator (hard theme-signature dedup + stop self-feeding on stale-wish signal), ' +
  'not 60 separate builds. The genuine underlying issues are tracked directly with ' +
  'the operator. If a signal is still real, the deduped generator will resurface it ' +
  'as ONE wish.'

async function run() {
  const apply = process.argv.includes('--apply')

  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .select('id, wish_title, source, wish_class, priority, created_at, affected_surfaces')
    .eq('status', 'queued')
  if (error) { console.error(error.message); process.exit(1) }
  const rows = data || []

  // Breakdown by (source, wish_class)
  const breakdown: Record<string, number> = {}
  for (const r of rows) {
    const key = `${r.source} / ${r.wish_class ?? '(null)'}`
    breakdown[key] = (breakdown[key] || 0) + 1
  }
  console.log(`TOTAL QUEUED: ${rows.length}\n`)
  console.log('BREAKDOWN (source / wish_class):')
  for (const [k, v] of Object.entries(breakdown).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)}  ${k}`)
  }

  const flood = rows.filter(
    r => r.source === 'gap_audit' &&
      (r.wish_class === 'self_strengthening' || r.wish_class === 'redesign_question'),
  )
  const spared = rows.filter(r => !flood.includes(r))

  console.log(`\nFLOOD to reject: ${flood.length}`)
  console.log(`SPARED (content / directive / critic / null-class): ${spared.length}`)
  console.log('\nSPARED rows (these survive for normal triage):')
  for (const r of spared) {
    console.log(`  ${r.id.slice(0, 8)} [${r.source}/${r.wish_class ?? 'null'}] ${r.wish_title.slice(0, 60)}`)
  }

  if (!apply) {
    console.log('\n(DRY RUN — re-run with --apply to reject the flood)')
    return
  }

  let rejected = 0
  for (const r of flood) {
    const { error: e } = await supabase
      .from('mommy_code_wishes')
      .update({ status: 'rejected', rejection_reason: REASON })
      .eq('id', r.id)
      .eq('status', 'queued')
    if (e) { console.log(`  ERR ${r.id.slice(0, 8)}: ${e.message}`); continue }
    rejected++
  }
  console.log(`\nREJECTED ${rejected} flood wishes.`)

  const { count } = await supabase
    .from('mommy_code_wishes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued')
  console.log(`Remaining queued: ${count ?? '?'}`)
}
run().catch(e => { console.error(e); process.exit(1) })
