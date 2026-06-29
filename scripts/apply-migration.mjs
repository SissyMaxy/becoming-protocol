#!/usr/bin/env node
// Apply a single migration file to the linked Supabase project via the
// Management API. Generalized from apply-ego-migrations.mjs.
//
// Submits the whole file in one transaction; the Management API reports the
// first failing statement with line info. Migrations using IF NOT EXISTS /
// OR REPLACE / IF EXISTS are safe to re-run.
//
// Usage:
//   node scripts/apply-migration.mjs <NNN_name.sql> [--dry-run]
//   node scripts/apply-migration.mjs 315_health_monitor_extensions.sql

import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
  || process.env.SUPABASE_PERSONAL_ACCESS_TOKEN
  || process.env.SUPABASE_PAT
  || process.env.SUPABASE_MANAGEMENT_TOKEN
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF
  || process.env.SUPABASE_PROJECT_ID
  || 'atevwvexapiykchvqvhm'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const NAME = args.find(a => !a.startsWith('--'))

if (!NAME) {
  console.error('Usage: node scripts/apply-migration.mjs <NNN_name.sql> [--dry-run]')
  process.exit(1)
}

if (!TOKEN) {
  const candidates = Object.keys(process.env).filter(k =>
    /supabase|sb_|pat|access_token/i.test(k))
  console.error('Supabase Management API token missing.')
  console.error('Set one of: SUPABASE_ACCESS_TOKEN, SUPABASE_PERSONAL_ACCESS_TOKEN, SUPABASE_PAT, SUPABASE_MANAGEMENT_TOKEN')
  console.error('Related env vars I can see:', candidates.length ? candidates.join(', ') : '(none)')
  process.exit(1)
}

const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

async function runQuery(sql) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text()
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 800)}`)
  }
  return text
}

async function main() {
  const full = join(ROOT, 'supabase', 'migrations', NAME)
  const sql = await readFile(full, 'utf8')
  console.log(`Applying ${NAME} (${sql.length} chars) to project ${PROJECT_REF}`)
  console.log(`Dry-run: ${DRY}`)

  if (DRY) {
    console.log('[dry-run] would POST entire file as one query')
    return
  }

  await runQuery(sql)
  console.log('  OK — migration applied')

  // Record it so a later `supabase db push --linked` won't re-apply.
  const ts = NAME.split('_')[0]
  const stamp = ts.padStart(14, '0')
  const cleanName = NAME.replace(/\.sql$/, '').replace(/^[0-9]+_/, '')
  const recordSql =
    `INSERT INTO supabase_migrations.schema_migrations (version, name) ` +
    `VALUES ('${stamp}', '${cleanName}') ON CONFLICT (version) DO NOTHING;`
  try {
    await runQuery(recordSql)
    console.log('  recorded in schema_migrations')
  } catch (e) {
    console.log(`  (skip schema_migrations record: ${String(e).slice(0, 160)})`)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('\nFATAL:', String(err).slice(0, 1200))
  process.exit(1)
})
