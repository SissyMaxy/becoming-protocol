/**
 * Cull corny pending outreach.
 *
 * Re-grades every pending `handler_outreach_queue` row authored by the
 * Mommy generators (sources: mommy_acknowledge, mommy_immediate,
 * mommy_receipt, random_reward, mommy_fast_react, mommy_praise,
 * mommy_touch) against the craft rubric. Anything scoring >= the
 * configured threshold gets superseded — status set to 'expired' and
 * trigger_reason annotated with the craft score so the audit trail is
 * preserved.
 *
 * The user's queue gets cleared of the autoplay-flavored leftovers from
 * before the craft rubric landed. This is a one-shot cleanup; future
 * inserts pass through the craft filter at generation time.
 *
 * Usage:
 *   tsx scripts/mommy/cull-corny-outreach.ts                # dry-run
 *   tsx scripts/mommy/cull-corny-outreach.ts --apply        # actually update
 *   tsx scripts/mommy/cull-corny-outreach.ts --threshold 2  # tighter
 *   tsx scripts/mommy/cull-corny-outreach.ts --apply --user <uuid>
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { scoreCorny } from '../../src/lib/persona/mommy-craft-check'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const CULL_SOURCES = [
  'mommy_acknowledge',
  'mommy_immediate',
  'mommy_receipt',
  'random_reward',
  'mommy_fast_react',
  'mommy_praise',
  'mommy_touch',
  'mommy_recap_weekly',
  'mommy_bedtime',
  'mommy_aftercare',
  'mommy_recall',
  'mommy_mantra',
]

interface OutreachRow {
  id: string
  user_id: string
  message: string
  source: string | null
  trigger_reason: string | null
  status: string
  scheduled_for: string
  expires_at: string | null
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const threshold = Number(arg('--threshold') ?? '3')
  const userFilter = arg('--user')

  console.log(`[cull-corny-outreach] mode=${apply ? 'APPLY' : 'DRY-RUN'} threshold=${threshold}${userFilter ? ` user=${userFilter}` : ''}`)

  let query = supabase
    .from('handler_outreach_queue')
    .select('id, user_id, message, source, trigger_reason, status, scheduled_for, expires_at')
    .eq('status', 'pending')
    .in('source', CULL_SOURCES)
    .order('scheduled_for', { ascending: false })
    .limit(1000)
  if (userFilter) query = query.eq('user_id', userFilter)

  const { data, error } = await query
  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }
  const rows = (data ?? []) as OutreachRow[]
  console.log(`[cull-corny-outreach] ${rows.length} pending mommy-source rows`)

  const corny: Array<{ row: OutreachRow; score: number; rules: string[] }> = []
  for (const row of rows) {
    const result = scoreCorny(row.message ?? '')
    if (result.score >= threshold) {
      corny.push({ row, score: result.score, rules: result.hits.map(h => h.rule) })
    }
  }

  console.log(`[cull-corny-outreach] ${corny.length} rows above threshold (${threshold}) — would supersede`)
  console.log('')
  for (const c of corny.slice(0, 25)) {
    const preview = (c.row.message ?? '').slice(0, 120).replace(/\s+/g, ' ')
    console.log(`  [${c.score}]  ${c.row.source ?? '?'}  ${c.row.id.slice(0, 8)}  ${c.rules.join(',')}`)
    console.log(`         "${preview}"`)
  }
  if (corny.length > 25) console.log(`  ... and ${corny.length - 25} more`)

  if (!apply) {
    console.log('\n[cull-corny-outreach] DRY-RUN — pass --apply to update.')
    return
  }
  if (corny.length === 0) {
    console.log('\n[cull-corny-outreach] Nothing to do.')
    return
  }

  // Supersede: mark expired + annotate trigger_reason with craft score.
  // We avoid 'cancelled' because that has semantics in the outreach pipeline;
  // 'expired' is the existing sink and the surface checks expires_at + status.
  let updated = 0
  let failed = 0
  for (const c of corny) {
    const newReason = `${c.row.trigger_reason ?? c.row.source ?? 'unknown'} | craft_supersede=${c.score}:${c.rules.join(',')}`.slice(0, 500)
    const { error: upErr } = await supabase
      .from('handler_outreach_queue')
      .update({
        status: 'expired',
        trigger_reason: newReason,
      })
      .eq('id', c.row.id)
      .eq('status', 'pending')  // race-protect: only update if still pending
    if (upErr) {
      console.error(`  [fail] ${c.row.id.slice(0, 8)} ${upErr.message}`)
      failed++
    } else {
      updated++
    }
  }
  console.log(`\n[cull-corny-outreach] superseded ${updated} row(s), ${failed} failed.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
