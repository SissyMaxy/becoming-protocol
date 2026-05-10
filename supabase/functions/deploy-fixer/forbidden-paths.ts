// forbidden-paths.ts — paths the deploy-fixer must NEVER auto-patch.
//
// Mirrors scripts/mommy/builder.ts:60-66 (FORBIDDEN_PATH_PATTERNS) so the
// two autonomous shippers respect the same authority boundary. If you add
// a path to one, add it to the other — there is no shared module across
// the Node/Deno boundary.
//
// Drift check: src/__tests__/lib/deploy-fixer-patterns.test.ts asserts the
// expected pattern set so accidental divergence triggers a test failure.

export const FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /^scripts\/handler-regression\//,
  /^api\/auth\//,
  /payment/i,
  /stripe/i,
  /\.github\/workflows\//,
  // Schema migrations: data risk. Pattern 6 already escalates failed
  // migrations, but the path guard is the second line of defence in case
  // a TS pattern's patch site happens to land in supabase/migrations/.
  /^supabase\/migrations\//,
  // RLS policy files (none currently — policies live in migrations — but
  // the guard is here in case future policy refactors split them out).
  /\/rls(?:[_-]policies?)?\.(?:sql|ts)$/,
  // Billing surfaces (sibling to payment but worth listing explicitly).
  /\/billing\//i,
]

export function pathIsAllowed(path: string): boolean {
  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(path)) return false
  }
  return true
}

export function refuseReason(path: string): string | null {
  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(path)) return `forbidden_path:${pattern.source}`
  }
  return null
}
