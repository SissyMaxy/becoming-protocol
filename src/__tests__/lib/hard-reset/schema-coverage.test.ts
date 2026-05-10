// CI gate: every public.* table that holds user data MUST be covered by
// the hard reset, OR explicitly listed in the EXCLUDED set.
//
// The runtime wipe uses `information_schema.columns` to discover tables with
// a `user_id` column at execution time, so the production code is forward-
// compatible automatically. This test parses the migration SQL files and
// asserts that the EXCLUDED constant in the migration matches what the
// codebase actually intends to exclude — i.e. that no engineer has snuck a
// table onto the EXCLUDED list without justification.
//
// If a new table with a user_id column appears, it will be included in the
// wipe by default. To opt out, the engineer must:
//   1. Add the table to hard_reset_excluded_tables() in a new migration
//   2. Update EXPECTED_EXCLUDES below with a comment explaining why

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../../../../')
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')
const HARD_RESET_MIGRATION = path.join(MIGRATIONS_DIR, '353_hard_reset.sql')

// Tables we're allowed to exclude from the wipe. Each entry must have a
// short justification — adding a table here means user data will SURVIVE a
// hard reset, which is a privacy decision.
const EXPECTED_EXCLUDES = new Set<string>([
  // The audit log itself — must survive the wipe to record that the wipe happened.
  'hard_reset_audit',
  // Reset-to-defaults instead of delete; auth_users FK + cooldown column.
  'user_state',
  // Framework table; never user data.
  'schema_migrations',
])

function readAllMigrations(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
  return files
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n')
}

function extractCreatedTables(sql: string): Set<string> {
  // Match: CREATE TABLE [IF NOT EXISTS] [schema.]name (...)
  // ignoring `CREATE TABLE foo AS ...` (no parens-decl), and tables with explicit
  // `auth.` / `storage.` schemas.
  const tables = new Set<string>()
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    const name = m[1]
    if (name.toUpperCase() === 'IF') continue // CREATE TABLE IF (corner case from one stray match)
    tables.add(name)
  }
  return tables
}

function tablesWithUserIdColumn(sql: string, tableNames: Set<string>): Set<string> {
  // Heuristic: for each `CREATE TABLE foo (... user_id ...)` block, capture the
  // table name. Also catches `ALTER TABLE foo ADD COLUMN user_id` after the fact.
  const result = new Set<string>()

  // Pass 1: parse CREATE TABLE bodies for user_id mentions.
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/gi
  let m
  while ((m = createRe.exec(sql)) !== null) {
    const tableName = m[1]
    const body = m[2]
    if (tableName.toUpperCase() === 'IF') continue
    if (/\buser_id\b/.test(body)) result.add(tableName)
  }

  // Pass 2: ALTER TABLE foo ADD COLUMN [IF NOT EXISTS] user_id ...
  const alterRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?user_id\b/gi
  while ((m = alterRe.exec(sql)) !== null) {
    const tableName = m[1]
    if (tableNames.has(tableName)) result.add(tableName)
  }

  return result
}

describe('hard-reset schema coverage', () => {
  const allSql = readAllMigrations()
  const allTables = extractCreatedTables(allSql)
  const userTables = tablesWithUserIdColumn(allSql, allTables)

  it('discovers a meaningful number of user-data tables', () => {
    // Sanity: the codebase has hundreds of user-keyed tables. If this drops
    // dramatically, the parser broke.
    expect(userTables.size).toBeGreaterThan(100)
  })

  it('hard_reset_audit itself has user_id and is correctly excluded', () => {
    expect(userTables.has('hard_reset_audit')).toBe(true)
    expect(EXPECTED_EXCLUDES.has('hard_reset_audit')).toBe(true)
  })

  it('user_state itself has user_id and is correctly excluded', () => {
    expect(userTables.has('user_state')).toBe(true)
    expect(EXPECTED_EXCLUDES.has('user_state')).toBe(true)
  })

  it('migration excluded list matches EXPECTED_EXCLUDES', () => {
    const migrationSql = fs.readFileSync(HARD_RESET_MIGRATION, 'utf8')
    const fnMatch = migrationSql.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+hard_reset_excluded_tables[\s\S]*?\$\$;/i
    )
    expect(fnMatch).not.toBeNull()
    const fnBody = fnMatch![0]

    // Pull every quoted bareword from the function body — these are the
    // table names in the array literal.
    const quoted = Array.from(fnBody.matchAll(/'([a-zA-Z_][a-zA-Z0-9_]*)'/g)).map(
      x => x[1]
    )
    const migrationExcludes = new Set(quoted)

    expect([...migrationExcludes].sort()).toEqual([...EXPECTED_EXCLUDES].sort())
  })

  it('every excluded table actually exists', () => {
    for (const table of EXPECTED_EXCLUDES) {
      if (table === 'schema_migrations') continue // framework, may not be in our migrations
      expect(allTables.has(table)).toBe(true)
    }
  })

  it('a representative sample of expected wipe targets is NOT excluded', () => {
    // Tables explicitly called out in the spec must end up in the wipe.
    const mustBeWiped = [
      'verification_photos',
      'mommy_dossier',
      'memory_implant_quote_log',
      'arousal_touch_tasks',
      'chastity_sessions',
      'slip_log',
      'handler_outreach_queue',
      'handler_conversations',
      'handler_messages',
      'mommy_mood',
      'mommy_praise_cooldown',
    ]
    for (const t of mustBeWiped) {
      expect(userTables.has(t)).toBe(true)
      expect(EXPECTED_EXCLUDES.has(t)).toBe(false)
    }
  })
})
