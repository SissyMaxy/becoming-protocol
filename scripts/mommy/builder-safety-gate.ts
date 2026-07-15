/**
 * Autonomous-builder safety gate — the brake the self-evolve loop cannot route around.
 *
 * The builder (scripts/mommy/builder.ts) drafts and auto-ships code with no
 * human in the loop. That is fine for content — the forced-fem / turn-out /
 * goon mechanics can change as deep as the operator wants. It is NOT fine for
 * the machinery that lets the user STOP. This module is the deterministic gate
 * that keeps the autonomy's hands off the cord:
 *
 *   1. FORBIDDEN_PATH_SUBSTRINGS — files the loop may never write. Now includes
 *      its own gate code (scripts/mommy/, scripts/ci/), the trigger that wakes
 *      it (kick-builder), and the reality-attack edge functions it must not
 *      auto-expand (ego-*, mommy-gaslight*, mommy-implant*, mommy-recall,
 *      mommy-intrusion, confession-gaslight-mine, recon-reconsolidation).
 *
 *   2. draftSafetyViolation — a content scan (sibling to draftRlsViolation)
 *      that flags any drafted SQL/TS which REDEFINES, DROPS, ALTERS, row-mutates
 *      or unschedules a safety object: the safeword/exit spine, the fail-closed
 *      conditioning gate, the elective kill switch, the emergency hard-reset,
 *      and the gates/brakes on the evaluator-targeting mechanics. A hit is
 *      routed to human review, never auto-shipped.
 *
 * Why review-and-not-hard-fail: the operator, reviewing deliberately, can still
 * change these. The loop, unattended, cannot. That is the whole distinction —
 * prior consent can change the tongue; it cannot quietly file down the brake.
 *
 * The protected-surface list was enumerated by a full codebase sweep
 * (map-protected-safety-surfaces, 2026-07-07). When you add a new safeword /
 * kill-switch / aftercare / reality-mechanic object, add it here too, or the
 * loop can silently modify it. There is a regression test in
 * src/__tests__/lib/builder-safety-gate.test.ts — keep it green.
 */

// ─────────────────────────────────────────────────────────────────────────
// 1. Path allowlist
// ─────────────────────────────────────────────────────────────────────────

// Forbidden as SUBSTRINGS (not ^-anchored regexes): a ^-anchor was bypassable
// with a leading "./" and never matched paths embedded in the affected_surfaces
// JSON blob at all (audit #8). Substring matching on a normalized path closes both.
export const FORBIDDEN_PATH_SUBSTRINGS = [
  // Original boundaries.
  'scripts/handler-regression/',
  'api/auth/',
  '.github/workflows/',
  'payment',
  'stripe',
  // The loop must not edit its own gates, its CI parity, or its wake trigger.
  'scripts/mommy/',
  'scripts/ci/',
  'supabase/functions/kick-builder',
  // Evaluator-targeting mechanics: the loop may not auto-expand the code that
  // acts on the user's recall / judgment / self-trust / sense of reality.
  // (Content that changes what she *wants* is elsewhere and stays writable.)
  'supabase/functions/ego-',
  'supabase/functions/_shared/ego-deconstruction',
  'supabase/functions/mommy-gaslight',
  'supabase/functions/mommy-implant',
  'supabase/functions/mommy-recall',
  'supabase/functions/mommy-intrusion',
  'supabase/functions/mommy-self-audit',
  'supabase/functions/memory-implant-audit',
  'supabase/functions/confession-gaslight-mine',
  'supabase/functions/recon-reconsolidation',
]

/** Normalize a repo-relative path: backslashes→/, strip ./, collapse .. segments. */
export function normalizePath(p: string): string {
  const parts: string[] = []
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') { parts.pop(); continue }
    parts.push(seg)
  }
  return parts.join('/')
}

export function isForbiddenPath(p: string): boolean {
  const n = normalizePath(p).toLowerCase()
  return FORBIDDEN_PATH_SUBSTRINGS.some((s) => n.includes(s))
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Access-loosening scan (unchanged behavior, moved here from builder.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Deterministic authority-boundary gate: scan the builder's OWN drafted .sql for
 *  access-loosening. The drafter is instructed never to write these, but an LLM
 *  instruction is not a gate — this is. Returns a reason string if it must be
 *  routed to human review, else null. (Scoped to drafted files, not the 300+
 *  legacy policies, so it stays precise.) */
export function draftRlsViolation(files: Array<{ path: string; content: string }>): string | null {
  for (const f of files) {
    if (!/\.sql$/i.test(f.path)) continue
    const c = f.content
    if (/\b(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i.test(c)) return `${f.path}: policy USING(true)/WITH CHECK(true)`
    if (/\bGRANT\b[^;]*\bTO\b[^;]*\b(?:anon|public)\b/i.test(c)) return `${f.path}: GRANT ... TO anon/public`
    if (/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(c)) return `${f.path}: DISABLE ROW LEVEL SECURITY`
    if (/\bDROP\s+POLICY\b/i.test(c)) return `${f.path}: DROP POLICY`
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Protected safety surfaces (the cord)
// ─────────────────────────────────────────────────────────────────────────

// DB functions / views / trigger-functions the loop must never CREATE OR
// REPLACE, DROP, or ALTER. Bare identifiers (signatures stripped).
export const PROTECTED_SAFETY_FUNCTIONS = [
  // Safeword / exit spine
  'conditioning_gate',
  'is_safeword_active',
  'resume_from_safeword',
  'trg_safeword_latch',
  'enforcement_gate',
  'machine_session_guard',
  'machine_deadman_sweep',
  'recon_safeword_halt',
  'trg_recon_safeword_halt',
  'trg_respect_decree_pause',
  // Emergency wipe / hard reset (exit-by-deletion)
  'hard_reset_user_data',
  'hard_reset_user_state',
  'hard_reset_check_cooldown',
  'hard_reset_excluded_tables',
  // Enforcement-mode flip + the single voice/immersion chokepoint
  'enforcement_chokepoints_enforce',
  'mommy_voice_cleanup',
  // Gates & brakes on the evaluator-targeting mechanics
  'ego_mechanic_active',
  'ego_mechanic_intensity',
  'enqueue_ego_outreach',
  'pause_ego_mechanic',
  'pause_all_ego_mechanics',
  'mommy_self_audit_cron_signal',
  'effective_gaslight_intensity', // view — same treatment
]

// Tables the loop must never DROP, ALTER, TRUNCATE, DELETE FROM, or UPDATE
// (in drafted SQL) or write via a drafted edge function.
export const PROTECTED_SAFETY_TABLES = [
  // Safeword / exit spine + kill switch + append-only audit
  'safeword_latches',
  'meta_frame_breaks',
  'aftercare_sessions',
  'aftercare_affirmations',
  'safewords',
  'hard_reset_audit',
  'life_as_woman_settings',
  // The loop's own queue (widening what auto-ships)
  'mommy_code_wishes',
  // Reality-mechanic stores — frozen against auto-expansion
  'memory_implants',
  'memory_implant_quote_log',
  'memory_implant_sequences',
  'memory_implant_steps',
  'narrative_reframings',
  'witness_fabrications',
  'mommy_gaslight_clusters',
  'gaslight_cluster_delivery_log',
  'gaslight_cluster_echoes',
  'gaslighting_effectiveness',
  'installed_reality_frames',
  'identity_erosion',
  'manipulation_log',
  'mommy_intrusions',
  'mommy_memory_corrections',
  'wake_grab_events',
  'judgment_undermine_log',
  'autobiography_inversion_log',
  'mirror_sessions',
  'pronoun_autocorrect_events',
  'pronoun_autocorrects',
  'pronoun_rewrites',
  'last_thought_log',
  'app_session_returns',
  'doubt_seed_library',
  'doubt_seeds',
  'self_criticism_dissolution_log',
  'mommy_subpersona_library',
  'mommy_subpersonas',
  'recall_intercept_log',
]

// user_state is written by legitimate runtime code constantly, so the whole
// table is NOT protected — only these safety-bearing columns. A drafted
// migration that ALTERs the table around one, or UPDATEs one, is reviewed.
export const PROTECTED_USER_STATE_COLUMNS = [
  'pause_new_decrees_until',
  'gaslight_intensity',
  'gaslight_cooldown_until',
  'last_hard_reset_at',
]

// pg_cron jobs whose removal would blind a safety net. A drafted file may only
// unschedule one of these if it reschedules the SAME job in the same file
// (the legitimate "drop-then-reschedule" idempotency pattern).
const PROTECTED_CRON_JOB_RE = /^(?:machine-deadman-sweep|surface-guarantor|blind-spot-monitor)$|safeword|deadman|ego-|gaslight/i

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─────────────────────────────────────────────────────────────────────────
// 4. The safety-object content scan
// ─────────────────────────────────────────────────────────────────────────

/** Does this SQL contain a DDL/DML statement that MODIFIES (not merely reads) the
 *  named object? Optional `public.` schema qualifier and double-quotes tolerated. */
function sqlMutatesObject(sql: string, name: string): boolean {
  const q = `(?:public\\.)?"?${escapeRe(name)}"?`
  const patterns = [
    `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:FUNCTION|VIEW|MATERIALIZED\\s+VIEW|PROCEDURE)\\s+${q}\\b`,
    `\\bDROP\\s+(?:FUNCTION|VIEW|MATERIALIZED\\s+VIEW|PROCEDURE|TABLE)\\s+(?:IF\\s+EXISTS\\s+)?${q}\\b`,
    `\\bALTER\\s+(?:FUNCTION|VIEW|TABLE)\\s+(?:ONLY\\s+)?${q}\\b`,
    `\\bTRUNCATE\\s+(?:TABLE\\s+)?${q}\\b`,
    `\\bDELETE\\s+FROM\\s+${q}\\b`,
    `\\bUPDATE\\s+${q}\\s+SET\\b`,
    // a trigger created/dropped ON the protected table
    `\\b(?:CREATE|DROP)\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\b[\\s\\S]{0,240}?\\bON\\s+${q}\\b`,
  ]
  return patterns.some((p) => new RegExp(p, 'i').test(sql))
}

/** Does this TS/JS draft mutate a protected table through the supabase client?
 *  e.g. .from('safeword_latches').update(...) / .delete() / .upsert() / .insert() */
function tsMutatesTable(code: string, table: string): boolean {
  const re = new RegExp(
    `\\.from\\(\\s*['"\`]${escapeRe(table)}['"\`]\\s*\\)[\\s\\S]{0,200}?\\.(?:update|delete|upsert|insert)\\b`,
    'i',
  )
  return re.test(code)
}

/** Unschedules a protected cron job without rescheduling it in the same file. */
function unschedulesProtectedCron(sql: string): string | null {
  for (const m of Array.from(sql.matchAll(/cron\.unschedule\(\s*['"]([^'"]+)['"]\s*\)/gi))) {
    const job = m[1]
    if (!PROTECTED_CRON_JOB_RE.test(job)) continue
    const reschedules = new RegExp(`cron\\.schedule\\(\\s*['"]${escapeRe(job)}['"]`, 'i').test(sql)
    if (!reschedules) return job
  }
  return null
}

/**
 * The gate. Scan drafted files for any modification of a safety object. Returns
 * a human-readable reason (routed to review) or null (clean). Mirrors the shape
 * and call site of draftRlsViolation.
 */
export function draftSafetyViolation(files: Array<{ path: string; content: string }>): string | null {
  const objects = [...PROTECTED_SAFETY_FUNCTIONS, ...PROTECTED_SAFETY_TABLES]
  for (const f of files) {
    const isSql = /\.sql$/i.test(f.path)
    const isTs = /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f.path)
    const c = f.content

    if (isSql) {
      for (const name of objects) {
        if (sqlMutatesObject(c, name)) return `${f.path}: modifies protected safety object "${name}"`
      }
      // user_state safety columns: flag only when a protected column is the
      // actual target of an ALTER TABLE user_state or the assignment in an
      // UPDATE user_state SET — not merely mentioned elsewhere in the file.
      for (const col of PROTECTED_USER_STATE_COLUMNS) {
        const n = escapeRe(col)
        const altersCol = new RegExp(
          `\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:public\\.)?"?user_state"?\\b[\\s\\S]{0,200}?\\b${n}\\b`,
          'i',
        )
        const updatesCol = new RegExp(
          `\\bUPDATE\\s+(?:public\\.)?"?user_state"?\\s+SET\\b[\\s\\S]{0,400}?\\b${n}\\b\\s*=`,
          'i',
        )
        if (altersCol.test(c) || updatesCol.test(c)) {
          return `${f.path}: alters/updates protected user_state column "${col}"`
        }
      }
      const cron = unschedulesProtectedCron(c)
      if (cron) return `${f.path}: unschedules protected cron job "${cron}" without rescheduling`
    }

    if (isTs) {
      for (const table of PROTECTED_SAFETY_TABLES) {
        if (tsMutatesTable(c, table)) return `${f.path}: writes protected safety table "${table}"`
      }
    }
  }
  return null
}

/**
 * Early check for a wish's declared `affected_surfaces` (a JSON blob). Returns
 * the first protected identifier named there, or null. Lets the builder bounce
 * a wish to review BEFORE spending a drafter call on it.
 */
export function surfacesTouchProtected(surfacesJsonLower: string): string | null {
  const names = [...PROTECTED_SAFETY_FUNCTIONS, ...PROTECTED_SAFETY_TABLES]
  for (const name of names) {
    if (new RegExp(`\\b${escapeRe(name.toLowerCase())}\\b`).test(surfacesJsonLower)) return name
  }
  return null
}
