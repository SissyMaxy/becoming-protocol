/**
 * mommy-tts-budget integration — verifies migration 365.
 *
 * Architectural rule under test: every ElevenLabs render is gated by a
 * per-user daily char budget. Without this, auto-play scaling TTS to
 * every outreach surface burns the ElevenLabs balance unbounded.
 *
 * What this proves:
 *   - user_state.mommy_tts_daily_char_cap exists and is writable.
 *   - mommy_tts_usage table exists with the expected shape.
 *   - mommy_tts_budget_remaining() returns the cap when no usage logged.
 *   - mommy_tts_record_usage() inserts and accumulates correctly.
 *   - Budget remaining decreases as usage accumulates.
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
let originalCap: number | null = null;
let originalAutoplay: boolean | null = null;

beforeAll(async () => {
  if (SKIP) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

  const { data } = await supabase.from('user_state')
    .select('mommy_tts_daily_char_cap, mommy_outreach_autoplay')
    .eq('user_id', userId)
    .maybeSingle();
  originalCap = (data as { mommy_tts_daily_char_cap?: number } | null)?.mommy_tts_daily_char_cap ?? null;
  originalAutoplay = (data as { mommy_outreach_autoplay?: boolean } | null)?.mommy_outreach_autoplay ?? null;

  // Clear today's usage so the test starts clean.
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from('mommy_tts_usage')
    .delete()
    .eq('user_id', userId)
    .eq('usage_date', today);
});

afterAll(async () => {
  if (SKIP || !supabase) return;
  if (originalCap !== null) {
    await supabase.from('user_state').update({
      mommy_tts_daily_char_cap: originalCap,
      mommy_outreach_autoplay: originalAutoplay ?? true,
    }).eq('user_id', userId);
  }
});

describeIntegration('mommy TTS daily budget (migration 365)', () => {
  it('user_state.mommy_tts_daily_char_cap exists and is writable', async () => {
    const { error } = await supabase.from('user_state')
      .update({ mommy_tts_daily_char_cap: 5000 })
      .eq('user_id', userId);
    expect(error).toBeNull();
  });

  it('mommy_tts_usage table exists with expected columns', async () => {
    const { error } = await supabase.from('mommy_tts_usage')
      .select('id, user_id, usage_date, chars_used, renders_count, first_render_at, last_render_at')
      .limit(1);
    expect(error).toBeNull();
  });

  it('budget_remaining returns the cap when no usage logged today', async () => {
    await supabase.from('user_state')
      .update({ mommy_tts_daily_char_cap: 5000 })
      .eq('user_id', userId);

    const { data, error } = await supabase.rpc('mommy_tts_budget_remaining', { p_user: userId });
    expect(error).toBeNull();
    expect(data).toBe(5000);
  });

  it('record_usage accumulates chars and renders_count', async () => {
    await supabase.rpc('mommy_tts_record_usage', { p_user: userId, p_chars: 200 });
    await supabase.rpc('mommy_tts_record_usage', { p_user: userId, p_chars: 350 });

    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('mommy_tts_usage')
      .select('chars_used, renders_count')
      .eq('user_id', userId)
      .eq('usage_date', today)
      .maybeSingle();

    expect(data).toBeTruthy();
    if (data) {
      expect((data as { chars_used: number }).chars_used).toBe(550);
      expect((data as { renders_count: number }).renders_count).toBe(2);
    }
  });

  it('budget_remaining decreases by the chars billed', async () => {
    const { data } = await supabase.rpc('mommy_tts_budget_remaining', { p_user: userId });
    // After 550 chars billed against a 5000 cap → 4450 remaining.
    expect(data).toBe(4450);
  });

  it('budget_remaining returns 0 (not negative) when cap exceeded', async () => {
    await supabase.rpc('mommy_tts_record_usage', { p_user: userId, p_chars: 10_000 });

    const { data } = await supabase.rpc('mommy_tts_budget_remaining', { p_user: userId });
    expect(data).toBe(0);
  });
});
