/**
 * Integration tests for the voice-leak penalty cascade.
 *
 * Skipped automatically when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * are missing. CI runs with secrets set.
 *
 * Covers the core invariants from the spec:
 *  - Insert leak → cascade fires → arousal_touch_task created with linked_leak_id
 *  - Mark task complete → leak resolved (resolution trigger)
 *  - Backfill idempotency: re-running cascade produces no duplicates
 *  - Negative: penalties_enabled=false → no task created
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP = !SUPABASE_URL || !SERVICE_KEY;
const describeIntegration = SKIP ? describe.skip : describe;

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';

let supabase: SupabaseClient;
const insertedLeakIds: string[] = [];
const insertedTaskIds: string[] = [];

beforeAll(() => {
  if (SKIP) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
});

afterEach(async () => {
  if (SKIP) return;
  if (insertedTaskIds.length > 0) {
    await supabase.from('arousal_touch_tasks').delete().in('id', insertedTaskIds);
    insertedTaskIds.length = 0;
  }
  if (insertedLeakIds.length > 0) {
    await supabase.from('mommy_voice_leaks').delete().in('id', insertedLeakIds);
    insertedLeakIds.length = 0;
  }
});

async function callCascade(payload: object) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/mommy-leak-cascade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json() };
}

async function insertLeak(text: string): Promise<string> {
  const { data, error } = await supabase
    .from('mommy_voice_leaks')
    .insert({
      user_id: HANDLER_USER_ID,
      source_table: 'test_leak',
      source_id: '00000000-0000-0000-0000-000000000000',
      leaked_text: text,
      detected_pattern: 'integration_test',
      resolved: false,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`leak insert: ${error?.message}`);
  insertedLeakIds.push((data as { id: string }).id);
  return (data as { id: string }).id;
}

describeIntegration('voice-leak-cascade — end-to-end', () => {
  it('insert leak → cascade fires → arousal_touch_task created, linked, resolved on complete', async () => {
    const leakId = await insertLeak('Your arousal at 8/10 — Mama is watching');

    const { status, body } = await callCascade({
      user_id: HANDLER_USER_ID, leak_id: leakId, max: 1,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    if (body.skipped?.[0]?.reason === 'persona_not_dommy_mommy') {
      // The user has been swapped out of dommy_mommy for some reason —
      // can't exercise this test; flag it loudly rather than passing.
      throw new Error('handler user is not on dommy_mommy persona; can\'t verify cascade');
    }
    expect(body.fired).toBe(1);
    expect(body.fired_detail?.[0]?.severity).toBe('medium');

    const taskId = body.fired_detail[0].task_id as string;
    insertedTaskIds.push(taskId);

    // Verify task linked back to leak
    const { data: task } = await supabase
      .from('arousal_touch_tasks')
      .select('id, linked_leak_id, category, generated_by')
      .eq('id', taskId)
      .single();
    expect((task as { linked_leak_id?: string } | null)?.linked_leak_id).toBe(leakId);
    expect((task as { generated_by?: string } | null)?.generated_by).toBe('mommy-leak-cascade');

    // Verify severity stamped on leak
    const { data: leak } = await supabase
      .from('mommy_voice_leaks')
      .select('penalty_severity, resolved')
      .eq('id', leakId)
      .single();
    expect((leak as { penalty_severity?: string } | null)?.penalty_severity).toBe('medium');
    expect((leak as { resolved?: boolean } | null)?.resolved).toBe(false);

    // Mark task complete → trigger resolves the leak
    await supabase
      .from('arousal_touch_tasks')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', taskId);

    const { data: leakAfter } = await supabase
      .from('mommy_voice_leaks')
      .select('resolved, resolved_at, resolved_via_touch_task_id')
      .eq('id', leakId)
      .single();
    type LeakState = { resolved?: boolean; resolved_at?: string | null; resolved_via_touch_task_id?: string | null };
    const ls = (leakAfter as LeakState | null) ?? {};
    expect(ls.resolved).toBe(true);
    expect(ls.resolved_at).toBeTruthy();
    expect(ls.resolved_via_touch_task_id).toBe(taskId);
  });

  it('idempotent: cascading the same leak twice produces no duplicate tasks', async () => {
    const leakId = await insertLeak('arousal at 6/10');

    const r1 = await callCascade({ user_id: HANDLER_USER_ID, leak_id: leakId, max: 1 });
    if (r1.body.skipped?.[0]?.reason === 'persona_not_dommy_mommy') {
      throw new Error('handler user is not on dommy_mommy persona');
    }
    expect(r1.body.fired).toBe(1);
    insertedTaskIds.push(r1.body.fired_detail[0].task_id as string);

    // Re-run; cascade should skip because resolved_via_touch_task_id is now
    // set OR the just-in-time check finds the existing linked task.
    // (After complete trigger fires we'd also flip resolved=true, but here
    // we deliberately don't complete; just verify the per-leak idempotency.)
    const r2 = await callCascade({ user_id: HANDLER_USER_ID, leak_id: leakId, max: 1 });
    expect(r2.body.fired).toBe(0);
    expect(r2.body.skipped_count).toBeGreaterThanOrEqual(0);

    const { count } = await supabase
      .from('arousal_touch_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('linked_leak_id', leakId);
    expect(count).toBe(1);
  });

  it('toggle off → no task created', async () => {
    const leakId = await insertLeak('Day 4 of denial');

    // Snapshot current toggle, flip off
    const { data: before } = await supabase
      .from('user_state')
      .select('voice_leak_penalties_enabled')
      .eq('user_id', HANDLER_USER_ID)
      .maybeSingle();
    const original = (before as { voice_leak_penalties_enabled?: boolean } | null)?.voice_leak_penalties_enabled !== false;

    await supabase
      .from('user_state')
      .update({ voice_leak_penalties_enabled: false })
      .eq('user_id', HANDLER_USER_ID);

    try {
      const { body } = await callCascade({ user_id: HANDLER_USER_ID, leak_id: leakId });
      if (body.skipped !== 'persona_not_dommy_mommy') {
        expect(body.skipped).toBe('penalties_disabled');
      }

      const { count } = await supabase
        .from('arousal_touch_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('linked_leak_id', leakId);
      expect(count).toBe(0);
    } finally {
      await supabase
        .from('user_state')
        .update({ voice_leak_penalties_enabled: original })
        .eq('user_id', HANDLER_USER_ID);
    }
  });

  it('dry_run: no inserts, but preview returned', async () => {
    const leakId = await insertLeak('your arousal at 9/10 today');

    const { body } = await callCascade({
      user_id: HANDLER_USER_ID, leak_id: leakId, max: 1, dry_run: true,
    });
    if (body.skipped?.[0]?.reason === 'persona_not_dommy_mommy' || body.skipped === 'persona_not_dommy_mommy') {
      throw new Error('handler user is not on dommy_mommy persona');
    }
    expect(body.dry_run).toBe(true);
    expect(body.fired).toBe(0);
    expect(body.dry_run_preview?.[0]?.severity).toBe('medium');

    const { count } = await supabase
      .from('arousal_touch_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('linked_leak_id', leakId);
    expect(count).toBe(0);
  });
});
