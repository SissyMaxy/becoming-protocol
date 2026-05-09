/**
 * background_jobs / live integration. Runs against the same Supabase instance
 * the worker drains, so we can verify:
 *   - Schema is in place (migration 337 applied).
 *   - claim_background_jobs(N) is atomic (no dupe-claim across two callers).
 *   - complete_background_job / release_background_job / fail_background_job
 *     drive the row through the right state transitions.
 *
 * Test rows are tagged with kind = `_test:background-jobs:<run-id>` so a
 * partial run never collides with prod and the tail cleanup is unambiguous.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SKIP_INTEGRATION = !SUPABASE_URL || !SERVICE_KEY;
const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

let supabase: SupabaseClient;
let runTag: string;

beforeAll(() => {
  if (SKIP_INTEGRATION) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
  runTag = `_test:background-jobs:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
});

afterAll(async () => {
  if (SKIP_INTEGRATION) return;
  // Clean up every row this run created — the tag is unique so this is safe.
  await supabase.from('background_jobs').delete().like('kind', `${runTag}%`);
});

describeIntegration('background_jobs schema', () => {
  it('table is queryable', async () => {
    const { error } = await supabase.from('background_jobs').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('background_jobs_active view is queryable', async () => {
    const { error } = await supabase.from('background_jobs_active').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('background_jobs_failed_24h view is queryable', async () => {
    const { error } = await supabase.from('background_jobs_failed_24h').select('id').limit(1);
    expect(error).toBeNull();
  });
});

describeIntegration('claim_background_jobs / atomic claim semantics', () => {
  it('claims a row exactly once across concurrent callers', async () => {
    const kind = `${runTag}:claim-once`;
    const { data: inserted, error: insertErr } = await supabase
      .from('background_jobs')
      .insert({ kind, payload: { i: 0 }, priority: 9 })
      .select('id')
      .single();
    expect(insertErr).toBeNull();
    const seededId = inserted!.id;

    // Two concurrent claims of size 1. One should get the row, the other zero.
    const [a, b] = await Promise.all([
      supabase.rpc('claim_background_jobs', { p_limit: 1 }),
      supabase.rpc('claim_background_jobs', { p_limit: 1 }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();

    // Filter to just our seed; the queue may contain unrelated rows.
    const aRows = (a.data || []).filter((r: { id: string }) => r.id === seededId);
    const bRows = (b.data || []).filter((r: { id: string }) => r.id === seededId);

    expect(aRows.length + bRows.length).toBe(1);
  });

  it('increments attempts on claim', async () => {
    const kind = `${runTag}:attempts`;
    const { data: inserted } = await supabase
      .from('background_jobs')
      .insert({ kind, payload: {}, priority: 9 })
      .select('id, attempts')
      .single();
    expect(inserted!.attempts).toBe(0);

    // Drain repeatedly, releasing each time so we can re-claim.
    let last = inserted!;
    for (let i = 1; i <= 2; i++) {
      const { data: claimed } = await supabase.rpc('claim_background_jobs', { p_limit: 5 });
      const ours = (claimed || []).find((r: { id: string }) => r.id === last.id);
      expect(ours, `claim #${i} should return the seeded row`).toBeDefined();
      expect(ours.attempts).toBe(i);
      await supabase.rpc('release_background_job', { p_id: last.id, p_error: 'test release' });
      last = ours;
    }
  });
});

describeIntegration('lifecycle / complete + release + fail', () => {
  it('complete_background_job sets completed_at and stashes result', async () => {
    const kind = `${runTag}:complete`;
    const { data: inserted } = await supabase
      .from('background_jobs')
      .insert({ kind })
      .select('id')
      .single();

    await supabase.rpc('claim_background_jobs', { p_limit: 5 });
    await supabase.rpc('complete_background_job', {
      p_id: inserted!.id,
      p_result: { ok: true, n: 7 },
    });

    const { data: row } = await supabase
      .from('background_jobs')
      .select('id, completed_at, failed_at, result, error')
      .eq('id', inserted!.id)
      .single();
    expect(row!.completed_at).not.toBeNull();
    expect(row!.failed_at).toBeNull();
    expect(row!.result).toEqual({ ok: true, n: 7 });
    expect(row!.error).toBeNull();
  });

  it('release_background_job clears claimed_at and stashes error', async () => {
    const kind = `${runTag}:release`;
    const { data: inserted } = await supabase
      .from('background_jobs')
      .insert({ kind })
      .select('id')
      .single();

    await supabase.rpc('claim_background_jobs', { p_limit: 5 });
    await supabase.rpc('release_background_job', {
      p_id: inserted!.id,
      p_error: 'transient: ECONNRESET',
    });

    const { data: row } = await supabase
      .from('background_jobs')
      .select('claimed_at, failed_at, completed_at, error')
      .eq('id', inserted!.id)
      .single();
    expect(row!.claimed_at).toBeNull();
    expect(row!.failed_at).toBeNull();
    expect(row!.completed_at).toBeNull();
    expect(row!.error).toBe('transient: ECONNRESET');
  });

  it('fail_background_job sets failed_at (terminal)', async () => {
    const kind = `${runTag}:fail`;
    const { data: inserted } = await supabase
      .from('background_jobs')
      .insert({ kind })
      .select('id')
      .single();

    await supabase.rpc('claim_background_jobs', { p_limit: 5 });
    await supabase.rpc('fail_background_job', {
      p_id: inserted!.id,
      p_error: 'unknown action: bogus',
    });

    const { data: row } = await supabase
      .from('background_jobs')
      .select('failed_at, completed_at, error')
      .eq('id', inserted!.id)
      .single();
    expect(row!.failed_at).not.toBeNull();
    expect(row!.completed_at).toBeNull();
    expect(row!.error).toBe('unknown action: bogus');

    // Failed rows must NOT come back from the claim RPC.
    const { data: claimedAgain } = await supabase.rpc('claim_background_jobs', { p_limit: 50 });
    const stillThere = (claimedAgain || []).some((r: { id: string }) => r.id === inserted!.id);
    expect(stillThere).toBe(false);
  });

  it('check_background_jobs_health returns { failed_24h, active, oldest_age_seconds }', async () => {
    const { data, error } = await supabase.rpc('check_background_jobs_health');
    expect(error).toBeNull();
    expect(data).toHaveProperty('failed_24h');
    expect(data).toHaveProperty('active');
    expect(data).toHaveProperty('oldest_age_seconds');
    expect(typeof data.failed_24h).toBe('number');
  });
});

describeIntegration('priority ordering', () => {
  it('returns higher-priority rows before lower-priority rows in the same drain', async () => {
    const lowKind = `${runTag}:prio-low`;
    const highKind = `${runTag}:prio-high`;

    // Insert low first so created_at would otherwise win.
    const { data: low } = await supabase
      .from('background_jobs')
      .insert({ kind: lowKind, priority: 1 })
      .select('id')
      .single();
    await new Promise((r) => setTimeout(r, 10));
    const { data: high } = await supabase
      .from('background_jobs')
      .insert({ kind: highKind, priority: 12 })
      .select('id')
      .single();

    // Drain a large batch so both our rows come back. Filter to ours and
    // assert the high-priority row is claimed before the low-priority row.
    const { data: claimed } = await supabase.rpc('claim_background_jobs', { p_limit: 50 });
    const ours = (claimed || []).filter((r: { id: string }) =>
      r.id === high!.id || r.id === low!.id,
    );
    expect(ours.length).toBe(2);
    const highIdx = ours.findIndex((r: { id: string }) => r.id === high!.id);
    const lowIdx = ours.findIndex((r: { id: string }) => r.id === low!.id);
    expect(highIdx).toBeLessThan(lowIdx);
  });
});
