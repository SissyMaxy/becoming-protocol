#!/usr/bin/env node
// Backfill supabase_migrations.schema_migrations for every numbered migration
// file at/under a confirmed-live ceiling. The DB schema is live through mig 645
// (verified by object existence), but schema_migrations only recorded through
// 336 — the out-of-band Management-API applies never ran the record step. Without
// this backfill, the deploy runner re-applies 591-645 on every push and dies on
// non-idempotent migrations (e.g. 601 ALTER TABLE ... ENABLE RLS on what is now a
// view). Recording them as applied lets the runner skip them.
//
// Version format matches scripts/apply-migration.mjs: 14-digit zero-padded number,
// name = filename minus numeric prefix and .sql. The skip check normalizes with a
// ^0*N$ regex so bare ('601') and padded ('00000000000601') both match.
//
// Usage: node scripts/ops/backfill-schema-migrations.mjs [ceiling=645] [--dry-run]
import 'dotenv/config'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(__dirname, '..', '..', 'supabase', 'migrations')
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'atevwvexapiykchvqvhm'
if (!TOKEN) { console.error('NO_TOKEN'); process.exit(2) }

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const ceiling = Number(args.find(a => !a.startsWith('--')) || '645')
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

async function q(sql) {
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 500)}`)
  return JSON.parse(t)
}

const files = (await readdir(MIGRATIONS))
  .filter(f => /^\d+_.*\.sql$/.test(f))
  .map(f => ({ f, n: parseInt(f.match(/^(\d+)/)[1], 10) }))
  .filter(x => x.n <= ceiling)
  .sort((a, b) => a.n - b.n)

// Which numbers are already recorded (normalized)?
const existing = await q(`select version from supabase_migrations.schema_migrations;`)
const haveNums = new Set(existing.map(r => String(r.version).replace(/^0+/, '') || '0'))

const toInsert = files.filter(x => !haveNums.has(String(x.n)))
console.log(`Files <= ${ceiling}: ${files.length}; already recorded: ${files.length - toInsert.length}; to insert: ${toInsert.length}`)
if (DRY) { for (const x of toInsert) console.log('  would record', x.n, x.f); process.exit(0) }
if (toInsert.length === 0) { console.log('Nothing to backfill.'); process.exit(0) }

const values = toInsert.map(x => {
  const version = String(x.n).padStart(14, '0')
  const name = x.f.replace(/\.sql$/, '').replace(/^\d+_/, '').replace(/'/g, "''")
  return `('${version}', '${name}')`
}).join(',\n  ')
await q(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES\n  ${values}\nON CONFLICT (version) DO NOTHING;`)
console.log(`Recorded ${toInsert.length} migration(s).`)
