#!/usr/bin/env node
// Read-only: list migration versions recorded in the live DB at/after a floor.
// Does NOT print secrets. Usage: node scripts/ops/check-applied-migrations.mjs [floor]
import 'dotenv/config'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
  || process.env.SUPABASE_PERSONAL_ACCESS_TOKEN
  || process.env.SUPABASE_PAT
  || process.env.SUPABASE_MANAGEMENT_TOKEN
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF
  || process.env.SUPABASE_PROJECT_ID
  || 'atevwvexapiykchvqvhm'

if (!TOKEN) { console.error('NO_TOKEN'); process.exit(2) }

const floor = process.argv[2] || '600'
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

async function q(sql) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 500)}`)
  return JSON.parse(t)
}

// Match either bare NNN or zero-padded 00000000000NNN, and normal 14-digit ts.
const rows = await q(
  `select version, name from supabase_migrations.schema_migrations ` +
  `order by version desc limit 60;`)
console.log('LAST 60 APPLIED (version desc):')
for (const row of rows) console.log(' ', row.version, row.name)
console.log('count shown:', rows.length)
// Also: which of our target files 624..653 are present?
const want = []
for (let n = 620; n <= 655; n++) want.push(n)
const padded = new Set(rows.map(r => String(r.version)))
const names = rows.map(r => String(r.name))
console.log('\nTARGET 620-655 presence (by padded version or name match):')
for (const n of want) {
  const pad = String(n).padStart(14, '0')
  const hit = padded.has(pad) || padded.has(String(n)) || names.some(nm => nm.includes(String(n)))
  if (hit) console.log('  APPLIED', n)
}
