/**
 * mommy-mantra integration — runs against real Supabase to validate that:
 *  1. The migration ran (mommy_mantras + mantra_delivery_log exist).
 *  2. Seed catalog is queryable and has rows in every category / tier.
 *  3. The cron's intended write path (handler_outreach_queue +
 *     mantra_delivery_log linked via outreach_id) lands consistent state.
 *  4. Status flips (queued → spoken) work and survive a re-read.
 *
 * Skips the entire file when Supabase secrets aren't set so contributors
 * without credentials can run the rest of the suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP = !SUPABASE_URL || !SERVICE_KEY;
const describeOnline = SKIP ? describe.skip : describe;

let supabase: SupabaseClient;
let userId: string;
const cleanupOutreach: string[] = [];
const cleanupLog: string[] = [];

beforeAll(async () => {
  if (SKIP) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
  const { data } = await supabase.from('user_state').select('user_id').limit(1).maybeSingle();
  userId = (data as { user_id: string } | null)?.user_id ?? '';
  if (!userId) throw new Error('no user_state row to test against');
});

afterAll(async () => {
  if (SKIP) return;
  if (cleanupLog.length > 0) await supabase.from('mantra_delivery_log').delete().in('id', cleanupLog);
  if (cleanupOutreach.length > 0) await supabase.from('handler_outreach_queue').delete().in('id', cleanupOutreach);
});

describeOnline('mommy-mantra schema', () => {
  it('mommy_mantras table is queryable', async () => {
    const { error } = await supabase.from('mommy_mantras').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('mantra_delivery_log table is queryable', async () => {
    const { error } = await supabase.from('mantra_delivery_log').select('id').limit(1);
    expect(error).toBeNull();
  });
});

describeOnline('mommy-mantra seed catalog', () => {
  it('has at least one mantra in every category', async () => {
    const cats = ['identity', 'submission', 'desire', 'belonging', 'surrender', 'transformation', 'ritual'];
    for (const cat of cats) {
      const { count, error } = await supabase
        .from('mommy_mantras')
        .select('id', { count: 'exact', head: true })
        .eq('category', cat).eq('active', true);
      expect(error).toBeNull();
      expect(count ?? 0).toBeGreaterThan(0);
    }
  });

  it('has at least one mantra in every intensity tier', async () => {
    for (const tier of ['gentle', 'firm', 'cruel']) {
      const { count, error } = await supabase
        .from('mommy_mantras')
        .select('id', { count: 'exact', head: true })
        .eq('intensity_tier', tier).eq('active', true);
      expect(error).toBeNull();
      expect(count ?? 0).toBeGreaterThan(0);
    }
  });

  it('all phase ranges are valid (phase_min <= phase_max, both in [1,7])', async () => {
    const { data, error } = await supabase.from('mommy_mantras').select('phase_min, phase_max');
    expect(error).toBeNull();
    for (const row of (data || []) as Array<{ phase_min: number; phase_max: number }>) {
      expect(row.phase_min).toBeGreaterThanOrEqual(1);
      expect(row.phase_max).toBeLessThanOrEqual(7);
      expect(row.phase_min).toBeLessThanOrEqual(row.phase_max);
    }
  });
});

describeOnline('mommy-mantra write path consistency', () => {
  it('outreach + log insert lands consistent state (linked by outreach_id)', async () => {
    // 1. Pick any active gentle mantra
    const { data: cat, error: catErr } = await supabase
      .from('mommy_mantras')
      .select('id, text')
      .eq('active', true).eq('intensity_tier', 'gentle').limit(1).maybeSingle();
    expect(catErr).toBeNull();
    expect(cat).not.toBeNull();
    const mantra = cat as { id: string; text: string };

    // 2. Insert outreach row mirroring what the edge fn does
    const { data: outreach, error: outErr } = await supabase
      .from('handler_outreach_queue')
      .insert({
        user_id: userId,
        message: mantra.text,
        urgency: 'low',
        trigger_reason: `mommy_mantra:${mantra.id}`,
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 18 * 3600_000).toISOString(),
        source: 'mommy_mantra',
      })
      .select('id, source, message')
      .single();
    expect(outErr).toBeNull();
    expect(outreach).not.toBeNull();
    const outreachId = (outreach as { id: string }).id;
    cleanupOutreach.push(outreachId);
    expect((outreach as { source: string }).source).toBe('mommy_mantra');
    expect((outreach as { message: string }).message).toBe(mantra.text);

    // 3. Insert delivery log linked via outreach_id
    const { data: log, error: logErr } = await supabase
      .from('mantra_delivery_log')
      .insert({
        user_id: userId,
        mantra_id: mantra.id,
        outreach_id: outreachId,
        affect_at_time: 'patient',
        phase_at_time: 3,
        intensity_at_time: 'gentle',
        status: 'queued',
      })
      .select('id, mantra_id, outreach_id, status')
      .single();
    expect(logErr).toBeNull();
    expect(log).not.toBeNull();
    const logRow = log as { id: string; mantra_id: string; outreach_id: string; status: string };
    cleanupLog.push(logRow.id);
    expect(logRow.mantra_id).toBe(mantra.id);
    expect(logRow.outreach_id).toBe(outreachId);
    expect(logRow.status).toBe('queued');

    // 4. Re-read to confirm consistency
    const { data: confirm } = await supabase
      .from('mantra_delivery_log')
      .select('mantra_id, outreach_id, status')
      .eq('id', logRow.id).single();
    expect((confirm as { outreach_id: string }).outreach_id).toBe(outreachId);
  });

  it('status flip queued → spoken survives a re-read', async () => {
    // Seed a row to flip
    const { data: cat } = await supabase.from('mommy_mantras').select('id').limit(1).maybeSingle();
    const mantraId = (cat as { id: string }).id;
    const { data: log } = await supabase
      .from('mantra_delivery_log')
      .insert({ user_id: userId, mantra_id: mantraId, status: 'queued' })
      .select('id').single();
    const logId = (log as { id: string }).id;
    cleanupLog.push(logId);

    const { error: updErr } = await supabase
      .from('mantra_delivery_log')
      .update({ status: 'spoken', acknowledged_at: new Date().toISOString() })
      .eq('id', logId);
    expect(updErr).toBeNull();

    const { data: read } = await supabase
      .from('mantra_delivery_log')
      .select('status, acknowledged_at')
      .eq('id', logId).single();
    const r = read as { status: string; acknowledged_at: string | null };
    expect(r.status).toBe('spoken');
    expect(r.acknowledged_at).not.toBeNull();
  });

  it('rejects an invalid status value (CHECK constraint)', async () => {
    const { data: cat } = await supabase.from('mommy_mantras').select('id').limit(1).maybeSingle();
    const mantraId = (cat as { id: string }).id;
    const { error } = await supabase
      .from('mantra_delivery_log')
      .insert({ user_id: userId, mantra_id: mantraId, status: 'invalid_value' })
      .select('id').single();
    expect(error).not.toBeNull();
  });
});
