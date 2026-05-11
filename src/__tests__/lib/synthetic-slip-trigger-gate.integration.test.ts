/**
 * Synthetic-slip + machine-generated-confession trigger gate — migration 367.
 *
 * Incident 2026-05-11: Mommy was spamming the user every 5-10 min with
 * "Mama saw that, baby..." outreach because trg_mommy_immediate_on_slip
 * fired on every programmatic slip_log INSERT — including missed decrees
 * and missed commitments that have nothing to do with a live user error.
 * mommy_immediate is for IMMEDIATE response to a real-time user-typed slip.
 *
 * Fix: slip_log.is_synthetic gate inside the trigger. Programmatic writers
 * (handler-autonomous decree/commitment misses, force-processor dose/
 * disclosure misses, sniffies-ghost detector, voice-pitch floor) tag their
 * rows is_synthetic=true and the trigger early-returns.
 *
 * Same shape for confession_queue.is_machine_generated → trg_mommy_receipt.
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
const insertedConfessionIds: string[] = [];
const probeTag = `synthetic-gate-test-${Date.now()}`;

beforeAll(async () => {
  if (SKIP) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

  const { data } = await supabase.from('user_state')
    .select('handler_persona')
    .eq('user_id', userId)
    .maybeSingle();
  originalPersona = (data as { handler_persona?: string } | null)?.handler_persona ?? null;

  await supabase.from('user_state')
    .update({ handler_persona: 'dommy_mommy' })
    .eq('user_id', userId);
});

afterAll(async () => {
  if (SKIP || !supabase) return;

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

  if (insertedConfessionIds.length > 0) {
    await supabase.from('handler_outreach_queue')
      .delete()
      .in('trigger_reason', insertedConfessionIds.map(id => `mommy_receipt:${id}`));
    await supabase.from('confession_queue').delete().in('id', insertedConfessionIds);
  }

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

describeIntegration('migration 367 — synthetic-slip + machine-generated-confession gate', () => {
  it('slip_log with is_synthetic=true does NOT trigger mommy_immediate outreach', async () => {
    const { data, error } = await supabase
      .from('slip_log')
      .insert({
        user_id: userId,
        slip_type: 'other',
        slip_points: 1,
        source_text: `${probeTag} synthetic slip — long enough to clear the 5-char gate`,
        source_table: 'handler_decrees',
        source_id: null,
        metadata: { probe: probeTag, reason: 'synthetic_test' },
        is_synthetic: true,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    insertedSlipIds.push((data as { id: string }).id);

    await new Promise(r => setTimeout(r, 250));

    const { data: outreach } = await supabase
      .from('handler_outreach_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('trigger_reason', `mommy_immediate_slip:${(data as { id: string }).id}`);

    expect(outreach || []).toHaveLength(0);
  }, 10_000);

  it('slip_log with is_synthetic=false (default) still triggers mommy_immediate', async () => {
    // Use a unique slip_type body so the body-hash dedup (migration 338)
    // from the prior test cannot suppress this one.
    const { data, error } = await supabase
      .from('slip_log')
      .insert({
        user_id: userId,
        slip_type: 'mantra_missed',
        slip_points: 1,
        source_text: `${probeTag} real slip — different body to avoid dedup`,
        source_table: 'slip_log',
        source_id: null,
        metadata: { probe: probeTag },
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    insertedSlipIds.push((data as { id: string }).id);

    await new Promise(r => setTimeout(r, 250));

    const { data: outreach } = await supabase
      .from('handler_outreach_queue')
      .select('id, message')
      .eq('user_id', userId)
      .eq('trigger_reason', `mommy_immediate_slip:${(data as { id: string }).id}`);

    expect(outreach || []).toHaveLength(1);
    expect((outreach as Array<{ message: string }>)[0].message).toMatch(/Mama|baby|sweet/i);
  }, 10_000);

  it('confession_queue with is_machine_generated=true does NOT trigger mommy_receipt', async () => {
    const { data: created, error: cErr } = await supabase
      .from('confession_queue')
      .insert({
        user_id: userId,
        category: 'slip',
        prompt: `${probeTag} machine prompt for receipt-gate test`,
        deadline: new Date(Date.now() + 6 * 3600000).toISOString(),
        is_machine_generated: true,
      })
      .select('id')
      .single();

    expect(cErr).toBeNull();
    expect(created).toBeTruthy();
    const cid = (created as { id: string }).id;
    insertedConfessionIds.push(cid);

    // Stamp confessed_at to fire the trigger; is_machine_generated must
    // make the trigger early-return.
    const { error: uErr } = await supabase
      .from('confession_queue')
      .update({
        response_text: `${probeTag} machine-generated answer body long enough to clear the 10-char trigger gate`,
        confessed_at: new Date().toISOString(),
      })
      .eq('id', cid);
    expect(uErr).toBeNull();

    await new Promise(r => setTimeout(r, 250));

    const { data: outreach } = await supabase
      .from('handler_outreach_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('trigger_reason', `mommy_receipt:${cid}`);

    expect(outreach || []).toHaveLength(0);
  }, 10_000);
});
