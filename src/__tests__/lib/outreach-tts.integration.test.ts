/**
 * outreach-tts integration — verifies the trigger semantics installed by
 * migration 259. Skips when service-role creds aren't present.
 *
 * What this proves end-to-end:
 *   - The schema additions (audio_url, tts_status, voice_settings_used,
 *     prefers_mommy_voice) actually exist on the deployed DB.
 *   - The BEFORE INSERT trigger correctly gates renders by persona +
 *     opt-in: rows for non-mommy or opted-out users land at tts_status
 *     'skipped' instantly, no edge call attempted.
 *   - When persona=dommy_mommy AND prefers_mommy_voice=true, fresh inserts
 *     land at 'pending' (queued for the dispatch trigger to fire).
 *
 * Full audio_url population requires the edge function to be deployed and
 * ElevenLabs creds in the runtime env, so it's checked as a soft assertion
 * (best-effort poll) rather than a hard wait.
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
let userId: string;
let originalPersona: string | null = null;
let originalPrefersVoice: boolean | null = null;
const insertedIds: string[] = [];

beforeAll(async () => {
  if (SKIP) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

  // Pin to the live Handler API user so the test sits in a known persona
  // context. We restore the original state in afterAll.
  userId = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';

  const { data } = await supabase.from('user_state')
    .select('handler_persona, prefers_mommy_voice')
    .eq('user_id', userId)
    .maybeSingle();
  originalPersona = (data as { handler_persona?: string } | null)?.handler_persona ?? null;
  originalPrefersVoice = (data as { prefers_mommy_voice?: boolean } | null)?.prefers_mommy_voice ?? null;
});

afterAll(async () => {
  if (SKIP || !supabase) return;
  // Clean up rows we inserted.
  if (insertedIds.length > 0) {
    await supabase.from('handler_outreach_queue').delete().in('id', insertedIds);
  }
  // Restore the original persona / opt-in state.
  if (originalPersona !== null) {
    await supabase.from('user_state').update({
      handler_persona: originalPersona,
      prefers_mommy_voice: originalPrefersVoice ?? false,
    }).eq('user_id', userId);
  }
});

describeIntegration('handler_outreach_queue — TTS trigger semantics', () => {
  it('the new columns exist and are selectable', async () => {
    const { error } = await supabase.from('handler_outreach_queue')
      .select('id, audio_url, voice_settings_used, tts_status, tts_attempted_at, tts_error')
      .limit(1);
    expect(error).toBeNull();
  });

  it('user_state.prefers_mommy_voice exists and is writable', async () => {
    const { error } = await supabase.from('user_state')
      .select('prefers_mommy_voice')
      .eq('user_id', userId)
      .maybeSingle();
    expect(error).toBeNull();
  });

  it('inserts for non-mommy persona land at tts_status=skipped', async () => {
    await supabase.from('user_state').update({
      handler_persona: 'handler',
      prefers_mommy_voice: true,
    }).eq('user_id', userId);

    const { data, error } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: 'integration test — non-mommy persona should be skipped',
      urgency: 'low',
      trigger_reason: 'integration_test_skip_persona',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      source: 'integration_test',
    }).select('id, tts_status, audio_url').single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    if (data) {
      insertedIds.push(data.id as string);
      expect(data.tts_status).toBe('skipped');
      expect(data.audio_url).toBeNull();
    }
  });

  it('inserts for mommy persona without opt-in land at tts_status=skipped', async () => {
    await supabase.from('user_state').update({
      handler_persona: 'dommy_mommy',
      prefers_mommy_voice: false,
    }).eq('user_id', userId);

    const { data, error } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: 'integration test — opted-out should be skipped',
      urgency: 'low',
      trigger_reason: 'integration_test_skip_optout',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      source: 'integration_test',
    }).select('id, tts_status, audio_url').single();

    expect(error).toBeNull();
    if (data) {
      insertedIds.push(data.id as string);
      expect(data.tts_status).toBe('skipped');
      expect(data.audio_url).toBeNull();
    }
  });

  it('inserts for mommy persona with opt-in land at tts_status=pending and may populate audio_url', async () => {
    await supabase.from('user_state').update({
      handler_persona: 'dommy_mommy',
      prefers_mommy_voice: true,
    }).eq('user_id', userId);

    const { data, error } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: 'integration test — Mama opted in, this should queue a render. Long enough to clear the min-length gate.',
      urgency: 'low',
      trigger_reason: 'integration_test_pending_render',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      source: 'integration_test',
    }).select('id, tts_status, audio_url').single();

    expect(error).toBeNull();
    if (!data) return;
    insertedIds.push(data.id as string);

    // The BEFORE trigger leaves it at 'pending'; the AFTER trigger fires
    // pg_net which is async. Right after insert the row is pending with
    // no audio_url yet.
    expect(['pending', 'rendering', 'ready']).toContain(data.tts_status);

    // Best-effort poll for ~6s. If the edge function is deployed AND
    // ElevenLabs creds are live, the row should populate. If not, we
    // still want the test to pass — the trigger semantics above are
    // what we're really proving.
    let lastStatus = data.tts_status as string;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 500));
      const { data: poll } = await supabase.from('handler_outreach_queue')
        .select('tts_status, audio_url')
        .eq('id', data.id as string)
        .maybeSingle();
      const row = poll as { tts_status?: string; audio_url?: string | null } | null;
      if (!row) break;
      lastStatus = row.tts_status ?? lastStatus;
      if (row.audio_url || lastStatus === 'ready' || lastStatus === 'failed') break;
    }

    // Soft expectation: we observed a recognized terminal/in-flight state.
    expect(['pending', 'rendering', 'ready', 'failed']).toContain(lastStatus);
  }, 15_000);
});
