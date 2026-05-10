// auto-healer github_actions resolver — pure decision logic.
//
// Given a set of currently-open github_actions rows from deploy_health_log
// and a window of recent GitHub workflow runs on main, decide which open
// rows can be auto-closed.
//
// Two patterns close an open row:
//
//   1. SAME-SHA RE-RUN — the failed run's commit got re-run and the later
//      run on the SAME head_sha succeeded for the same workflow name.
//
//   2. LATER-COMMIT ON MAIN — a later commit on main triggered the same
//      workflow name and succeeded. This catches the recurring-failure
//      pattern where every push fails for 24h+ until a fix lands; the fix
//      passes, but every prior commit's row stays open forever because
//      same-sha never sees a successor.
//
// Pattern 2 was added 2026-05-10 after the 'preflight' + 'Mommy deploy on
// merge' workflows accumulated 20+ open rows across distinct shas while a
// single-source bug stayed unfixed.
//
// Pure function — no I/O, no Deno imports — so it's testable from vitest.

export interface OpenGhRow {
  id: string;
  user_id: string;
  raw: {
    sha?: string;
    name?: string;
    run_id?: number;
  } | null;
  detected_at?: string;
  title?: string;
}

export interface GhRun {
  id: number;
  name: string;
  conclusion: string;
  head_sha: string;
  head_branch?: string;
  created_at?: string;
}

export interface ResolveDecision {
  rowId: string;
  successorRunId: number;
  reason: 'same_sha_rerun' | 'later_commit_on_main';
  detail: string;
}

/**
 * Decide which open rows to close given the current GitHub run window.
 *
 * @param openRows  rows from deploy_health_log where status='open' AND source='github_actions'
 * @param runs      recent workflow_runs from the GitHub API (any branch ok; we filter)
 * @param mainBranch which branch counts as "main" for pattern 2. Default 'main'.
 */
export function resolveOpenGithubRows(
  openRows: OpenGhRow[],
  runs: GhRun[],
  mainBranch: string = 'main',
): ResolveDecision[] {
  const decisions: ResolveDecision[] = [];

  // Index runs by workflow name for O(1) lookups.
  const runsByName = new Map<string, GhRun[]>();
  for (const r of runs) {
    if (!r.name) continue;
    const list = runsByName.get(r.name) ?? [];
    list.push(r);
    runsByName.set(r.name, list);
  }

  for (const row of openRows) {
    const sha = row.raw?.sha;
    const name = row.raw?.name;
    const failedRunId = row.raw?.run_id ?? 0;
    if (!name) continue;

    const candidates = runsByName.get(name) ?? [];

    // Pattern 1: same-sha re-run succeeded.
    if (sha) {
      const sameShaSuccess = candidates.find(r =>
        r.head_sha === sha && r.conclusion === 'success' && r.id > failedRunId,
      );
      if (sameShaSuccess) {
        decisions.push({
          rowId: row.id,
          successorRunId: sameShaSuccess.id,
          reason: 'same_sha_rerun',
          detail: `${name} on ${sha.slice(0, 7)} re-ran green (run ${sameShaSuccess.id})`,
        });
        continue;
      }
    }

    // Pattern 2: a later commit on main succeeded the same workflow.
    // Only count successful runs on the main branch with id > failedRunId.
    // We sort to pick the EARLIEST passing successor so the "detail" string
    // points at the actual fix commit, not whatever happens to be latest.
    const laterMainSuccess = candidates
      .filter(r =>
        r.conclusion === 'success' &&
        r.id > failedRunId &&
        (r.head_branch === mainBranch || r.head_branch === undefined),
      )
      .sort((a, b) => a.id - b.id)[0];

    if (laterMainSuccess) {
      const headFrag = laterMainSuccess.head_sha
        ? laterMainSuccess.head_sha.slice(0, 7)
        : 'unknown';
      decisions.push({
        rowId: row.id,
        successorRunId: laterMainSuccess.id,
        reason: 'later_commit_on_main',
        detail: `${name} passed on later ${mainBranch} commit ${headFrag} (run ${laterMainSuccess.id})`,
      });
    }
  }

  return decisions;
}
