// growth-loop — shared helpers for the four mommy growth-loop edge fns
// (capability-gap-aggregator, pattern-library-curator, architecture-self-
// review, intervention-rate-tracker).
//
// Pure module: no Deno.* imports here, only types + utility functions, so
// it can be tested in node and shared between functions without coupling.
//
// Conventions baked in:
//   - signature() is stable across runs for the same gap shape
//   - isForbiddenPath() echoes the same patterns as scripts/mommy/builder.ts
//   - if a path is forbidden, the gap is recorded but NEVER linked to a wish

export const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Same forbidden patterns as scripts/mommy/builder.ts FORBIDDEN_PATH_PATTERNS.
// Keep these two lists synced; if a path is added there, add it here too.
const FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /^scripts\/handler-regression\//,
  /^api\/auth\//,
  /payment/i,
  /stripe/i,
  /\.github\/workflows\//,
  /supabase\/migrations\/.+rls/i,
  /\bbilling\b/i,
]

export function isForbiddenPath(path: string): boolean {
  if (!path) return false
  return FORBIDDEN_PATH_PATTERNS.some((re) => re.test(path))
}

export function forbiddenReason(paths: string[]): string | null {
  for (const p of paths) {
    for (const re of FORBIDDEN_PATH_PATTERNS) {
      if (re.test(p)) return `path "${p}" matches forbidden pattern ${re}`
    }
  }
  return null
}

// Deterministic hash so the same gap shape collapses on repeat runs.
// djb2 — same algorithm deploy-health-monitor uses. Don't switch to a
// crypto hash; the value lands in indexed unique keys.
export function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

export function gapSignature(category: string, key: string): string {
  return `${category}:${djb2(key)}`
}

// ---- date / window helpers ----
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString()
}

export function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString()
}
