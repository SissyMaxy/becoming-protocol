/**
 * Live verification of mig 581 gap_audit wish dedup trigger.
 *
 * Inserts isolated probe wishes (title prefix 'zzdedupprobe', which only hits
 * the misc: fallback theme — never collides with real themes) and asserts:
 *   - two probes that share the first 24 normalized title chars → same theme →
 *     second is collapsed (not inserted), first's resignal_count bumped to 1.
 *   - a third probe with a different prefix → separate open row.
 * Cleans up all probe rows in finally. On the pre-581 schema this fails
 * (all three insert, resignal_count stays 0) — that's the regression guard.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } },
)

const base = {
  wish_body: 'probe',
  protocol_goal: 'probe',
  source: 'gap_audit',
  wish_class: 'self_strengthening',
  priority: 'low' as const,
  status: 'queued' as const,
  auto_ship_eligible: false, // never kick the builder
}

async function insert(title: string) {
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .insert({ ...base, wish_title: title })
    .select('id, theme_signature, resignal_count')
  if (error) throw new Error(`insert "${title}": ${error.message}`)
  return data ?? []
}

async function cleanup() {
  await supabase.from('mommy_code_wishes').delete().like('wish_title', 'zzdedupprobe%')
}

async function run() {
  await cleanup() // clear any leftovers from a prior run
  let pass = true
  const check = (label: string, cond: boolean) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`)
    if (!cond) pass = false
  }

  try {
    // A and B share first-24 normalized chars "zzdedupprobesharedwidget"
    const a = await insert('zzdedupprobe shared widget alpha')
    check('probe A inserted (first of theme)', a.length === 1)
    check('probe A theme = misc:zzdedupprobesharedwidget',
      a[0]?.theme_signature === 'misc:zzdedupprobesharedwidget')

    const b = await insert('zzdedupprobe shared widget BETA different tail')
    check('probe B collapsed (same theme → not inserted)', b.length === 0)

    // C has a different prefix → different theme → separate row
    const c = await insert('zzdedupprobe other thing gamma')
    check('probe C inserted (different theme)', c.length === 1)
    check('probe C theme differs from A',
      !!c[0]?.theme_signature && c[0].theme_signature !== a[0]?.theme_signature)

    // Re-read A: resignal_count should have bumped to 1 from B's collapse
    const { data: aAfter } = await supabase
      .from('mommy_code_wishes')
      .select('resignal_count, last_resignal_at')
      .eq('id', a[0]!.id)
      .single()
    check('probe A resignal_count bumped to 1', aAfter?.resignal_count === 1)
    check('probe A last_resignal_at set', !!aAfter?.last_resignal_at)

    // Exactly two open probe rows survive (A + C)
    const { count } = await supabase
      .from('mommy_code_wishes')
      .select('*', { count: 'exact', head: true })
      .like('wish_title', 'zzdedupprobe%')
      .eq('status', 'queued')
    check('exactly 2 open probe rows (A + C)', count === 2)
  } finally {
    await cleanup()
    const { count: leftover } = await supabase
      .from('mommy_code_wishes')
      .select('*', { count: 'exact', head: true })
      .like('wish_title', 'zzdedupprobe%')
    console.log(`  cleanup: ${leftover ?? '?'} probe rows remaining (expect 0)`)
  }

  console.log(pass ? '\nDEDUP VERIFIED ✓' : '\nDEDUP FAILED ✗')
  process.exit(pass ? 0 : 1)
}
run().catch(e => { console.error(e); process.exit(1) })
