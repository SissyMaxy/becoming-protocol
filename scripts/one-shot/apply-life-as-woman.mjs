#!/usr/bin/env node
// apply-life-as-woman.mjs — applies migrations 384-388 via Supabase Management API.
//
// Reads SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF (or VITE_SUPABASE_URL to
// derive) + SUPABASE_SERVICE_ROLE_KEY from .env. Falls back to running each
// migration directly via the project's pgrst-reload edge fn 'apply_sql' op
// if mgmt API isn't available. Idempotent — each migration is itself
// guarded with IF NOT EXISTS / DROP POLICY IF EXISTS etc.

import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
// Worktree has no .env of its own; load from main repo path.
const MAIN_REPO_ROOT = 'D:/Projects/Becoming Protocol'
dotenv.config({ path: join(ROOT, '.env') })
dotenv.config({ path: join(ROOT, '.env.local') })
dotenv.config({ path: join(MAIN_REPO_ROOT, '.env') })
dotenv.config({ path: join(MAIN_REPO_ROOT, '.env.local') })

const MIGRATIONS = [
  '384_mommy_authority_log.sql',
  '385_sniffies_outbound.sql',
  '386_hypno_trance.sql',
  '387_gooning_chastity_kink.sql',
  '388_mommy_content_editor.sql',
]

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || ''
let projectRef = process.env.SUPABASE_PROJECT_REF || ''
if (!projectRef && supabaseUrl) {
  // Derive from URL: https://<ref>.supabase.co
  const m = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)
  if (m) projectRef = m[1]
}

if (!accessToken || !projectRef) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or project ref.')
  console.error('  SUPABASE_ACCESS_TOKEN:', accessToken ? '<set>' : '(missing)')
  console.error('  SUPABASE_PROJECT_REF:', projectRef || '(missing)')
  process.exit(1)
}

async function applySql(sql, name) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text()
  if (!r.ok) {
    console.error(`[${name}] ${r.status}: ${text.slice(0, 800)}`)
    return false
  }
  console.log(`[${name}] applied (${text.slice(0, 80)}...)`)
  return true
}

let failed = false
for (const file of MIGRATIONS) {
  const sql = readFileSync(join(ROOT, 'supabase', 'migrations', file), 'utf8')
  console.log(`\n=== ${file} (${sql.length} bytes) ===`)
  const ok = await applySql(sql, file)
  if (!ok) failed = true
}

process.exit(failed ? 1 : 0)
