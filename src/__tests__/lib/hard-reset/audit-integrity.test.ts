// Audit log integrity: the migration must lock the table down so that
// 1) authenticated users can read their own rows but cannot insert/update/delete
// 2) the audit log is in the EXCLUDED list so a hard reset never touches it
// 3) the wipe RPC is SECURITY DEFINER and rejects null user_id
// 4) the cooldown RPC is read-only / STABLE
//
// These checks parse the SQL text rather than running it. They catch text-
// level regressions; the actual constraint behavior is validated in a real
// supabase environment by the deploy.

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../../../../')
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '301_hard_reset.sql'
)

const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')

describe('hard-reset migration: audit table lockdown', () => {
  it('creates hard_reset_audit', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+hard_reset_audit/i)
  })

  it('enables RLS on hard_reset_audit', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+hard_reset_audit\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
  })

  it('owner can read own rows via RLS policy', () => {
    expect(sql).toMatch(/CREATE\s+POLICY\s+"Owner can read own hard reset audit"/i)
    expect(sql).toMatch(/auth\.uid\(\)\s*=\s*user_id/i)
  })

  it('REVOKEs INSERT/UPDATE/DELETE from authenticated', () => {
    expect(sql).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+hard_reset_audit\s+FROM\s+authenticated/i
    )
  })

  it('grants SELECT to authenticated', () => {
    expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+hard_reset_audit\s+TO\s+authenticated/i)
  })

  it('audit row records both triggered_at and completed_at', () => {
    expect(sql).toMatch(/triggered_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i)
    expect(sql).toMatch(/completed_at\s+TIMESTAMPTZ/i)
  })

  it('triggered_via and confirmed_via are typed enums', () => {
    expect(sql).toMatch(/triggered_via\s+hard_reset_trigger\s+NOT\s+NULL/i)
    expect(sql).toMatch(/confirmed_via\s+hard_reset_confirmation\s+NOT\s+NULL/i)
  })

  it('triggered_via enum carries the three documented values', () => {
    const m = sql.match(
      /CREATE\s+TYPE\s+hard_reset_trigger\s+AS\s+ENUM\s*\(([\s\S]*?)\)/i
    )
    expect(m).not.toBeNull()
    const values = (m![1].match(/'([^']+)'/g) ?? []).map(s => s.replace(/'/g, ''))
    expect(values.sort()).toEqual(['panic_gesture', 'scheduled', 'settings_button'])
  })

  it('confirmed_via enum covers typed_phrase / pin / both', () => {
    const m = sql.match(
      /CREATE\s+TYPE\s+hard_reset_confirmation\s+AS\s+ENUM\s*\(([\s\S]*?)\)/i
    )
    expect(m).not.toBeNull()
    const values = (m![1].match(/'([^']+)'/g) ?? []).map(s => s.replace(/'/g, ''))
    expect(values.sort()).toEqual(['both', 'pin', 'typed_phrase'])
  })
})

describe('hard-reset migration: wipe function safety', () => {
  it('hard_reset_user_data is SECURITY DEFINER', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+hard_reset_user_data[\s\S]*?SECURITY\s+DEFINER/i)
  })

  it('hard_reset_user_data raises if p_user_id is null (no accidental wipe-all)', () => {
    expect(sql).toMatch(/IF\s+p_user_id\s+IS\s+NULL\s+THEN\s+RAISE\s+EXCEPTION/i)
  })

  it('execute privilege is REVOKED from public/anon/authenticated (service-role only)', () => {
    expect(sql).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+hard_reset_user_data\(UUID\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i
    )
  })

  it('hard_reset_user_state is SECURITY DEFINER and revoked from clients', () => {
    expect(sql).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+hard_reset_user_state[\s\S]*?SECURITY\s+DEFINER/i
    )
    expect(sql).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+hard_reset_user_state\(UUID\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i
    )
  })

  it('hard_reset_user_state preserves the cooldown by setting last_hard_reset_at = NOW() after the wipe', () => {
    // Search the function body specifically.
    const m = sql.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+hard_reset_user_state[\s\S]*?\$\$;/i
    )
    expect(m).not.toBeNull()
    const fnSql = m![0]
    expect(fnSql).toMatch(/INSERT\s+INTO\s+user_state[\s\S]*last_hard_reset_at[\s\S]*NOW\(\)/i)
  })
})

describe('hard-reset migration: cooldown RPC', () => {
  it('hard_reset_check_cooldown is STABLE (no side effects)', () => {
    expect(sql).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+hard_reset_check_cooldown[\s\S]*?STABLE/i
    )
  })

  it('hard_reset_check_cooldown is callable by authenticated users', () => {
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+hard_reset_check_cooldown\(UUID\)\s+TO\s+authenticated/i
    )
  })

  it('hard_reset_check_cooldown enforces the 24-hour window', () => {
    // Match only inside the cooldown function body so we don't accidentally
    // pick up a different interval somewhere else in the migration.
    const m = sql.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+hard_reset_check_cooldown[\s\S]*?\$\$;/i
    )
    expect(m).not.toBeNull()
    const fn = m![0]
    expect(fn).toMatch(/INTERVAL\s+'24\s+hours'/i)
  })
})
