// Regression tests for auto-healer FIX 6's github_actions resolver.
//
// Reproduces the 2026-05-10 incident: 'preflight' + 'Mommy deploy on merge'
// failed on every push for 24+ hours. Each push generated a new open row
// in deploy_health_log. The original FIX 6 only matched successors on the
// SAME head_sha, so even after the fix landed, every prior commit's row
// stayed open forever — no successor on the broken commits' shas would
// ever run, by definition.
//
// The hardened resolver also recognises "later commit on main succeeded"
// as a close signal, so once one good commit lands, all prior open rows
// for the same workflow name auto-close on the next auto-healer tick.

import { describe, it, expect } from 'vitest';
import {
  resolveOpenGithubRows,
  type OpenGhRow,
  type GhRun,
} from '../../../supabase/functions/auto-healer/github-resolver';

const sha = (n: number) => `sha${String(n).padStart(7, '0')}deadbeef`;

const makeRow = (
  id: string,
  workflowName: string,
  failedRunId: number,
  headSha: string,
): OpenGhRow => ({
  id,
  user_id: 'u1',
  raw: { sha: headSha, name: workflowName, run_id: failedRunId },
  detected_at: '2026-05-10T00:00:00Z',
  title: `${workflowName} failed`,
});

const makeRun = (
  id: number,
  workflowName: string,
  conclusion: string,
  headSha: string,
  branch: string = 'main',
): GhRun => ({
  id,
  name: workflowName,
  conclusion,
  head_sha: headSha,
  head_branch: branch,
});

describe('resolveOpenGithubRows', () => {
  it('returns no decisions for an empty input', () => {
    expect(resolveOpenGithubRows([], [])).toEqual([]);
  });

  it('closes a row when same-sha re-run succeeded (pattern 1)', () => {
    const rows = [makeRow('r1', 'preflight', 100, sha(1))];
    const runs = [
      makeRun(100, 'preflight', 'failure', sha(1)),
      makeRun(105, 'preflight', 'success', sha(1)),
    ];
    const out = resolveOpenGithubRows(rows, runs);
    expect(out).toHaveLength(1);
    expect(out[0].rowId).toBe('r1');
    expect(out[0].reason).toBe('same_sha_rerun');
    expect(out[0].successorRunId).toBe(105);
  });

  it('does NOT close on same-sha re-run if successor also failed', () => {
    const rows = [makeRow('r1', 'preflight', 100, sha(1))];
    const runs = [
      makeRun(100, 'preflight', 'failure', sha(1)),
      makeRun(105, 'preflight', 'failure', sha(1)),
    ];
    expect(resolveOpenGithubRows(rows, runs)).toEqual([]);
  });

  it('closes ALL stale rows when a later commit on main succeeds (pattern 2)', () => {
    // The 2026-05-10 incident shape: 5 distinct failing commits, each a
    // separate open row. A 6th commit lands the fix and passes. All five
    // priors should auto-close.
    const rows = [
      makeRow('r1', 'preflight', 100, sha(1)),
      makeRow('r2', 'preflight', 110, sha(2)),
      makeRow('r3', 'preflight', 120, sha(3)),
      makeRow('r4', 'preflight', 130, sha(4)),
      makeRow('r5', 'preflight', 140, sha(5)),
    ];
    const runs = [
      makeRun(100, 'preflight', 'failure', sha(1)),
      makeRun(110, 'preflight', 'failure', sha(2)),
      makeRun(120, 'preflight', 'failure', sha(3)),
      makeRun(130, 'preflight', 'failure', sha(4)),
      makeRun(140, 'preflight', 'failure', sha(5)),
      // The fix lands at sha 6 — passes.
      makeRun(150, 'preflight', 'success', sha(6)),
    ];
    const out = resolveOpenGithubRows(rows, runs);
    expect(out).toHaveLength(5);
    for (const dec of out) {
      expect(dec.reason).toBe('later_commit_on_main');
      expect(dec.successorRunId).toBe(150);
      expect(dec.detail).toContain('preflight');
      expect(dec.detail).toContain(sha(6).slice(0, 7));
    }
  });

  it('does NOT close on later-commit success if branch is not main', () => {
    const rows = [makeRow('r1', 'preflight', 100, sha(1))];
    // A success on a feature branch should not close a main-branch failure.
    const runs = [
      makeRun(100, 'preflight', 'failure', sha(1)),
      makeRun(150, 'preflight', 'success', sha(2), 'feature/foo'),
    ];
    expect(resolveOpenGithubRows(rows, runs)).toEqual([]);
  });

  it('does NOT close when later-commit run is for a different workflow', () => {
    const rows = [makeRow('r1', 'preflight', 100, sha(1))];
    const runs = [
      makeRun(100, 'preflight', 'failure', sha(1)),
      // Different workflow name passing on a later commit doesn't help.
      makeRun(150, 'Mommy deploy on merge', 'success', sha(6)),
    ];
    expect(resolveOpenGithubRows(rows, runs)).toEqual([]);
  });

  it('does NOT close when later-commit run id is older than the failed run id', () => {
    // Defensive: GitHub run ids are monotonic, but the resolver should
    // explicitly require id > failedRunId so a stale fetch can't trigger
    // a false-close.
    const rows = [makeRow('r1', 'preflight', 200, sha(1))];
    const runs = [
      makeRun(150, 'preflight', 'success', sha(0)),  // older successor
      makeRun(200, 'preflight', 'failure', sha(1)),
    ];
    expect(resolveOpenGithubRows(rows, runs)).toEqual([]);
  });

  it('picks the EARLIEST passing main-branch successor (so detail points at the fix)', () => {
    const rows = [makeRow('r1', 'preflight', 100, sha(1))];
    const runs = [
      makeRun(100, 'preflight', 'failure', sha(1)),
      makeRun(150, 'preflight', 'success', sha(6)),
      makeRun(180, 'preflight', 'success', sha(7)),
    ];
    const out = resolveOpenGithubRows(rows, runs);
    expect(out).toHaveLength(1);
    expect(out[0].successorRunId).toBe(150);
    expect(out[0].detail).toContain(sha(6).slice(0, 7));
  });

  it('handles rows with missing sha gracefully (skips pattern 1, still tries pattern 2)', () => {
    const rows: OpenGhRow[] = [{
      id: 'r1',
      user_id: 'u1',
      raw: { name: 'preflight', run_id: 100 },  // no sha
    }];
    const runs = [
      makeRun(150, 'preflight', 'success', sha(6)),
    ];
    const out = resolveOpenGithubRows(rows, runs);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('later_commit_on_main');
  });

  it('mixes both patterns when applicable', () => {
    const rows = [
      makeRow('rA', 'preflight', 100, sha(1)),         // → pattern 1 (same-sha rerun)
      makeRow('rB', 'preflight', 110, sha(2)),         // → pattern 2 (later commit)
      makeRow('rC', 'mommy-deploy', 120, sha(3)),      // → no successor at all
    ];
    const runs = [
      makeRun(100, 'preflight', 'failure', sha(1)),
      makeRun(105, 'preflight', 'success', sha(1)),    // same-sha rerun for rA
      makeRun(110, 'preflight', 'failure', sha(2)),
      makeRun(150, 'preflight', 'success', sha(6)),    // later commit fix for rB
      makeRun(120, 'mommy-deploy', 'failure', sha(3)),
    ];
    const out = resolveOpenGithubRows(rows, runs);
    expect(out).toHaveLength(2);
    const byRow = Object.fromEntries(out.map(d => [d.rowId, d]));
    expect(byRow.rA?.reason).toBe('same_sha_rerun');
    expect(byRow.rB?.reason).toBe('later_commit_on_main');
    expect(byRow.rC).toBeUndefined();
  });
});
