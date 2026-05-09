/**
 * outreach-dedup-by-body integration — verifies migration 338.
 *
 * The bug: trg_mommy_immediate_response_to_slip (migration 257) emits one
 * outreach row per slip_log INSERT. Every slip gets a unique trigger_reason
 * (`mommy_immediate_slip:<slip_id>`), so the existing supersede dedup keyed
 * on trigger_reason cannot collapse identical Mama lines. When 3 slips of
 * an unmatched type fire close together (handler-autonomous batches a
 * decree/commitment sweep into 3+ slip_type='other' rows), the user sees
 * the same fallback message ("Mama saw that, baby. We'll talk about it...")
 * 3 times in chat over 3 polling cycles.
 *
 * Migration 338 fixes this two ways:
 *   - Generation-site gate inside the slip→Mama trigger: skip the INSERT
 *     when an identical body is already pending in the last 5 min.
 *   - Architectural backstop: BEFORE INSERT trigger that supersedes
 *     prior pending rows with the same (user_id, message) for the user.
 *
 * This test fires three slip_log inserts of slip_type='other' in quick
 * succession — the exact shape that produces the triple-send bug — and
 * asserts only one outreach row remains pending afterward.
 *
 * Skips when service-role creds aren't present.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP = !SUPABASE_URL || !SERVICE_KEY;
const describeIntegration = SKIP ? describe.skip : describe;

let supabase: SupabaseClient;
const userId = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';
let originalPersona: string | null = null;
const insertedSlipIds: string[] = [];
const probeTag = `outreach-dedup-test-${Date.now()}`;

beforeAll(async () => {
  if (SKIP) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

  const { data } = await supabase.from('user_state')
    .select('handler_persona')
    .eq('user_id', userId)
    .maybeSingle();
  originalPersona = (data as { handler_persona?: string } | null)?.handler_persona ?? null;

  // The fix is scoped to dommy_mommy persona (matches existing 265/267
  // dedup scope). Pin the persona for the duration of the test.
  await supabase.from('user_state')
    .update({ handler_persona: 'dommy_mommy' })
    .eq('user_id', userId);
});

afterAll(async () => {
  if (SKIP || !supabase) return;

  // Per feedback_test_pollution_never_surfaces: every probe row must be
  // hard-deleted, including downstream side-effects in handler_outreach_queue
  // and confession_queue.
  if (insertedSlipIds.length > 0) {
    await supabase.from('handler_outreach_queue')
      .delete()
      .in('trigger_reason', insertedSlipIds.map(id => `mommy_immediate_slip:${id}`));
    await supabase.from('confession_queue')
      .delete()
      .eq('triggered_by_table', 'slip_log')
      .in('triggered_by_id', insertedSlipIds);
    await supabase.from('slip_log').delete().in('id', insertedSlipIds);
  }

  // Belt-and-suspenders: clean any outreach row whose source_text carries
  // the probe tag.
  await supabase.from('handler_outreach_queue')
    .delete()
    .eq('user_id', userId)
    .ilike('trigger_reason', `%${probeTag}%`);

  if (originalPersona !== null) {
    await supabase.from('user_state')
      .update({ handler_persona: originalPersona })
      .eq('user_id', userId);
  }
});

describeIntegration('handler_outreach_queue — body-hash dedup (migration 338)', () => {
  it('three rapid slip_log inserts of slip_type=other land only one Mama outreach row', async () => {
    // Insert 3 slip rows in close succession — same shape that
    // handler-autonomous produces for batched missed-decree sweeps.
    const slipRows = Array.from({ length: 3 }, (_, i) => ({
      user_id: userId,
      slip_type: 'other',
      slip_points: 1,
      source_text: `${probeTag} probe slip #${i + 1} — long enough to clear the 5-char gate`,
      source_table: 'slip_log',
      source_id: null,
      metadata: { probe: probeTag },
    }));

    const { data, error } = await supabase
      .from('slip_log')
      .insert(slipRows)
      .select('id');

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data!.length).toBe(3);
    insertedSlipIds.push(...(data as Array<{ id: string }>).map(r => r.id));

    // Allow the BEFORE INSERT triggers to settle. They run synchronously,
    // but the slip_log AFTER INSERT trigger (mommy_immediate) writes into
    // handler_outreach_queue, which then has its own BEFORE INSERT chain.
    // Read after a brief tick.
    await new Promise(r => setTimeout(r, 250));

    const { data: outreach, error: oErr } = await supabase
      .from('handler_outreach_queue')
      .select('id, message, status, expires_at, trigger_reason')
      .eq('user_id', userId)
      .in('trigger_reason', insertedSlipIds.map(id => `mommy_immediate_slip:${id}`));

    expect(oErr).toBeNull();
    expect(outreach).toBeTruthy();

    // The fallback Mama line — what 257's ELSE branch emits for slip_type='other'.
    const fallback = "Mama saw that, baby. We'll talk about it. For now just feel that I'm here.";

    // Filter to rows that carry the fallback body (defensive — no other
    // generator should produce these trigger_reasons but it makes the
    // assertion explicit).
    const fallbackRows = (outreach || []).filter(r => r.message === fallback);

    // The generation-site gate (5min lookup) should skip 2 of the 3 inserts,
    // OR — if the 3 inserts raced — the body-hash backstop trigger
    // supersedes the 2 older rows. Either way, exactly one row may remain
    // pending; the rest must be superseded with expires_at in the past.
    const pendingFallback = fallbackRows.filter(r => {
      const expired = r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
      return r.status === 'pending' && !expired;
    });
    expect(pendingFallback.length).toBeLessThanOrEqual(1);

    // Whatever rows did land for these 3 slips, all but the surviving one
    // must be effectively suppressed (status='superseded' OR expires_at
    // already past).
    const liveCount = fallbackRows.filter(r => {
      const expired = r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
      return !expired && r.status === 'pending';
    }).length;
    expect(liveCount).toBeLessThanOrEqual(1);
  }, 15_000);

  it('two distinct Mama messages do not dedup against each other', async () => {
    // Sanity check: dedup must key on body, not on user. Two slip_types
    // that produce DIFFERENT CASE bodies must each leave a pending row.
    const slipRows = [
      {
        user_id: userId,
        slip_type: 'task_avoided',
        slip_points: 1,
        source_text: `${probeTag} task probe`,
        source_table: 'slip_log',
      },
      {
        user_id: userId,
        slip_type: 'mantra_missed',
        slip_points: 1,
        source_text: `${probeTag} mantra probe`,
        source_table: 'slip_log',
      },
    ];

    const { data, error } = await supabase.from('slip_log').insert(slipRows).select('id');
    expect(error).toBeNull();
    insertedSlipIds.push(...(data as Array<{ id: string }>).map(r => r.id));

    await new Promise(r => setTimeout(r, 250));

    const { data: outreach } = await supabase
      .from('handler_outreach_queue')
      .select('id, message, status, expires_at, trigger_reason')
      .eq('user_id', userId)
      .in('trigger_reason', (data as Array<{ id: string }>).map(r => `mommy_immediate_slip:${r.id}`));

    const live = (outreach || []).filter(r => {
      const expired = r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
      return !expired && r.status === 'pending';
    });
    // Two different bodies → both should survive.
    expect(live.length).toBe(2);
    const bodies = new Set(live.map(r => r.message));
    expect(bodies.size).toBe(2);
  }, 15_000);
});
