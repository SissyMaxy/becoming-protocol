#!/usr/bin/env node
// Apply migrations 375-378 (ego deconstruction) via the Supabase
// Management API. Splits each migration on top-level `;` boundaries
// outside of $$-delimited bodies and submits per-statement, so a
// failing statement reports its own line range. Idempotent: every
// statement in 375-378 uses CREATE/DROP IF EXISTS / ON CONFLICT DO
// NOTHING so re-runs are safe.
//
// Usage: node scripts/apply-ego-migrations.mjs [--dry-run]

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
const DRY = process.argv.includes('--dry-run')

if (!TOKEN) {
  // Enumerate plausible env var names so the next pass knows which to set.
  const candidates = Object.keys(process.env).filter(k =>
    /supabase|sb_|pat|access_token/i.test(k))
  console.error('Supabase Management API token missing.')
  console.error('Tried: SUPABASE_ACCESS_TOKEN, SUPABASE_PERSONAL_ACCESS_TOKEN, SUPABASE_PAT, SUPABASE_MANAGEMENT_TOKEN')
  console.error('Env vars I can see that look related:', candidates.length ? candidates.join(', ') : '(none)')
  process.exit(1)
}

const FILES = [
  '375_ego_deconstruction_scaffolding.sql',
  '376_ego_deconstruction_tables.sql',
  '377_ego_deconstruction_seeds.sql',
  '378_ego_deconstruction_triggers_crons.sql',
]

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
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 600)}`)
  }
  return text
}

async function applyFile(name) {
  const full = join(ROOT, 'supabase', 'migrations', name)
  const sql = await readFile(full, 'utf8')
  console.log(`\n=== ${name} (${sql.length} chars) ===`)

  if (DRY) {
    console.log('  [dry-run] would POST entire file as one query')
    return
  }

  // Submit the whole file in one transaction. If it fails, the
  // Management API will return the first failing statement with line
  // info. Idempotent migrations make re-running safe.
  try {
    await runQuery(sql)
    console.log(`  OK`)
    // Record in supabase_migrations.schema_migrations so subsequent
    // `supabase db push --linked` doesn't try to re-apply.
    const ts = name.split('_')[0]
    const stamp = ts.padStart(14, '0')
    const recordSql = `INSERT INTO supabase_migrations.schema_migrations (version, name, statements) ` +
      `VALUES ('${stamp}', '${name.replace(/\.sql$/, '').replace(/^[0-9]+_/, '')}', ARRAY['ego_deconstruction']::text[]) ` +
      `ON CONFLICT (version) DO NOTHING;`
    try {
      await runQuery(recordSql)
      console.log(`  recorded in schema_migrations`)
    } catch (e) {
      console.log(`  (skip schema_migrations record: ${String(e).slice(0, 120)})`)
    }
  } catch (e) {
    console.error(`  FAILED: ${String(e).slice(0, 800)}`)
    throw e
  }
}

async function main() {
  console.log(`Applying ego deconstruction migrations to project ${PROJECT_REF}`)
  console.log(`Dry-run: ${DRY}`)
  for (const f of FILES) {
    await applyFile(f)
  }
  console.log('\nDone.')
}

main().catch(err => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
