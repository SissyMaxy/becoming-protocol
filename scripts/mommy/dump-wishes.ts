/** Compact dump of ALL queued mommy_code_wishes, for triage analysis. */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } },
)

function kind(s: Record<string, unknown> | null): string {
  if (!s) return ''
  const k = (s.kind ?? s.panel_wish_class ?? '') as string
  const t = (s.target ?? s.panel_phase_gate ?? '') as string
  const gate = (s.phase_gate ?? s.panel_phase_gate ?? '') as string
  return [k, t, gate].filter(Boolean).join('/').slice(0, 40)
}

async function run() {
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .select('id, wish_title, source, priority, created_at, affected_surfaces')
    .eq('status', 'queued')
    .order('source', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) { console.error(error.message); process.exit(1) }
  const rows = data || []
  console.log(`TOTAL QUEUED: ${rows.length}\n`)
  // counts by source
  const bySource: Record<string, number> = {}
  for (const r of rows) bySource[r.source] = (bySource[r.source] || 0) + 1
  console.log('BY SOURCE:', JSON.stringify(bySource), '\n')
  let cur = ''
  for (const r of rows) {
    if (r.source !== cur) { cur = r.source; console.log(`\n--- ${cur} ---`) }
    const d = new Date(r.created_at)
    const date = `${d.getMonth() + 1}/${d.getDate()}`
    console.log(`${r.id.slice(0, 8)} [${r.priority[0]}] ${date.padEnd(5)} ${r.wish_title.slice(0, 52).padEnd(52)} :: ${kind(r.affected_surfaces as Record<string, unknown> | null)}`)
  }
}
run().catch(e => { console.error(e); process.exit(1) })
