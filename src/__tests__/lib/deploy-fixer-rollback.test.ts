/**
 * Rollback decision pure-function tests.
 *
 * decideRollback() takes all inputs as parameters so it's testable
 * without API mocks. The integration of the rollback module with the
 * GitHub Tree API is exercised in deploy-fixer-integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { decideRollback } from '../../../supabase/functions/deploy-fixer/rollback';

const NOW = new Date('2026-05-08T12:00:00Z').toISOString();

function vercelFailure(id: string, status: 'open' | 'resolved' | 'autopatched' = 'open') {
  return { id, source: 'vercel', status, detected_at: NOW, raw: null };
}

const RECENT_COMMITS = [
  { sha: 'aaaaaaa1', date: '2026-05-08T11:00:00Z' },
  { sha: 'bbbbbbb2', date: '2026-05-08T10:00:00Z' },
  { sha: 'ccccccc3', date: '2026-05-08T09:00:00Z' },
  { sha: 'ddddddd4', date: '2026-05-08T08:00:00Z' },
  { sha: 'eeeeeee5', date: '2026-05-08T07:00:00Z' },  // last green
  { sha: 'fffffff6', date: '2026-05-08T06:00:00Z' },
];

describe('decideRollback()', () => {
  it('does NOT roll back below threshold (2 unresolved)', () => {
    const decision = decideRollback({
      recentVercelHealthRows: [vercelFailure('h1'), vercelFailure('h2')],
      recentFixerAttempts: [],
      lastGreenSha: 'eeeeeee5',
      recentMainCommits: RECENT_COMMITS,
    });
    expect(decision.shouldRollback).toBe(false);
    expect(decision.consecutiveFailures).toBe(2);
    expect(decision.reason).toMatch(/below|need|2/i);
  });

  it('rolls back when 3 unresolved vercel failures exist with last green known', () => {
    const decision = decideRollback({
      recentVercelHealthRows: [vercelFailure('h1'), vercelFailure('h2'), vercelFailure('h3')],
      recentFixerAttempts: [],
      lastGreenSha: 'eeeeeee5',
      recentMainCommits: RECENT_COMMITS,
    });
    expect(decision.shouldRollback).toBe(true);
    expect(decision.consecutiveFailures).toBe(3);
    expect(decision.lastGreenSha).toBe('eeeeeee5');
    expect(decision.suspectedBreakingShas).toEqual(['aaaaaaa1', 'bbbbbbb2', 'ccccccc3', 'ddddddd4']);
  });

  it('does NOT roll back when streak was broken by an auto-merge', () => {
    // Three failures, but ONE was auto_merged by the fixer — that means
    // we ourselves restored green at some point. The streak is broken.
    const decision = decideRollback({
      recentVercelHealthRows: [vercelFailure('h1'), vercelFailure('h2'), vercelFailure('h3')],
      recentFixerAttempts: [
        { outcome: 'auto_merged', health_log_id: 'h2', pattern_matched: 'ts_coercion_null_undefined' },
      ],
      lastGreenSha: 'eeeeeee5',
      recentMainCommits: RECENT_COMMITS,
    });
    expect(decision.shouldRollback).toBe(false);
    expect(decision.reason).toMatch(/auto-merged|streak/i);
  });

  it('still rolls back when only 2 of 3 were auto-merged but 3 unresolved remain', () => {
    // Five failures total, 2 auto-merged → 3 stuck → still triggers.
    const decision = decideRollback({
      recentVercelHealthRows: [
        vercelFailure('h1'), vercelFailure('h2'), vercelFailure('h3'),
        vercelFailure('h4'), vercelFailure('h5'),
      ],
      recentFixerAttempts: [
        { outcome: 'auto_merged', health_log_id: 'h2', pattern_matched: 'ts_coercion_null_undefined' },
        { outcome: 'auto_merged', health_log_id: 'h5', pattern_matched: 'ts_spread_widened_type' },
      ],
      lastGreenSha: 'eeeeeee5',
      recentMainCommits: RECENT_COMMITS,
    });
    expect(decision.shouldRollback).toBe(true);
    expect(decision.consecutiveFailures).toBe(3);
  });

  it('does NOT roll back when last green sha is unknown', () => {
    const decision = decideRollback({
      recentVercelHealthRows: [vercelFailure('h1'), vercelFailure('h2'), vercelFailure('h3')],
      recentFixerAttempts: [],
      lastGreenSha: null,
      recentMainCommits: RECENT_COMMITS,
    });
    expect(decision.shouldRollback).toBe(false);
    expect(decision.reason).toMatch(/no last-green/i);
  });

  it('falls back gracefully when last green sha is not in recent commits', () => {
    const decision = decideRollback({
      recentVercelHealthRows: [vercelFailure('h1'), vercelFailure('h2'), vercelFailure('h3')],
      recentFixerAttempts: [],
      lastGreenSha: 'unknownsha',
      recentMainCommits: RECENT_COMMITS,
    });
    expect(decision.shouldRollback).toBe(true);
    // Suspected commits = first 5 (default fallback) when green not located.
    expect((decision.suspectedBreakingShas ?? []).length).toBeLessThanOrEqual(5);
  });

  it('ignores non-vercel sources (github_actions does not trip rollback)', () => {
    const decision = decideRollback({
      recentVercelHealthRows: [
        { id: 'h1', source: 'github_actions', status: 'open', detected_at: NOW, raw: null },
        { id: 'h2', source: 'github_actions', status: 'open', detected_at: NOW, raw: null },
        { id: 'h3', source: 'github_actions', status: 'open', detected_at: NOW, raw: null },
      ],
      recentFixerAttempts: [],
      lastGreenSha: 'eeeeeee5',
      recentMainCommits: RECENT_COMMITS,
    });
    expect(decision.shouldRollback).toBe(false);
  });
});
