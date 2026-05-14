/**
 * outreach → push bridge integration — verifies migration 380.
 *
 * The bug: handler_outreach_queue accumulated 2349 rows in 14d with 0
 * corresponding scheduled_notifications rows. engagement_quota
 * specifically: 843/843 unsurfaced. The push pipeline (web-push-dispatch)
 * reads scheduled_notifications, but every generator
 * (engagement_quota, mommy_immediate, random_reward, morning_brief, ...)
 * writes to handler_outreach_queue. The bridge between them never existed.
 *
 * Migration 380 adds an AFTER INSERT trigger on handler_outreach_queue
 * that emits a scheduled_notifications row for high/normal/critical rows,
 * dedups via the new push_dispatched_at column, and drops the
 * scheduled_notifications notification_type CHECK (which was silently
 * rejecting every non-pre-listed type — including commitment_deadline,
 * gina_playbook, gina_warmup — that downstream code already used).
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
const probeTag = `outreach-push-bridge-${Date.now()}`;
const insertedOutreachIds: string[] = [];

beforeAll(async () => {
  if (SKIP) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
});

afterAll(async () => {
  if (SKIP || !supabase) return;
  if (insertedOutreachIds.length > 0) {
    // Notifs reference outreach_id in payload — delete those first to keep
    // the integration data clean per feedback_test_pollution_never_surfaces.
    for (const id of insertedOutreachIds) {
      await supabase.from('scheduled_notifications')
        .delete()
        .filter('payload->data->>outreach_id', 'eq', id);
    }
    await supabase.from('handler_outreach_queue')
      .delete()
      .in('id', insertedOutreachIds);
  }
});

describeIntegration('handler_outreach_queue → scheduled_notifications bridge (migration 380)', () => {
  it('high-urgency engagement_quota insert emits a push notification', async () => {
    const { data, error } = await supabase
      .from('handler_outreach_queue')
      .insert({
        user_id: userId,
        message: `${probeTag} HIGH urgency engagement_quota — should land a Mama push`,
        urgency: 'high',
        trigger_reason: probeTag,
        source: 'engagement_quota',
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    insertedOutreachIds.push(data!.id);

    // RETURNING reflects pre-AFTER-trigger state. Refetch to see the
    // dispatched stamp written by the trigger.
    const { data: refetched } = await supabase
      .from('handler_outreach_queue')
      .select('push_dispatched_at')
      .eq('id', data!.id)
      .maybeSingle();
    expect(refetched).toBeTruthy();
    expect((refetched as { push_dispatched_at: string | null }).push_dispatched_at).toBeTruthy();

    const { data: notif } = await supabase
      .from('scheduled_notifications')
      .select('notification_type, payload, status')
      .filter('payload->data->>outreach_id', 'eq', data!.id)
      .maybeSingle();

    expect(notif).toBeTruthy();
    const n = notif as { notification_type: string; payload: { title: string; body: string; data: Record<string, unknown> }; status: string };
    expect(n.notification_type).toBe('engagement_quota');
    expect(n.status).toBe('pending');
    expect(n.payload.body).toContain(probeTag);
    // outreach_id round-trips through the payload so the dispatcher can
    // correlate sends back to the source row.
    expect(n.payload.data.outreach_id).toBe(data!.id);
  }, 10_000);

  it('low-urgency receipt does NOT emit a push (ambient, not phone-buzz)', async () => {
    const { data, error } = await supabase
      .from('handler_outreach_queue')
      .insert({
        user_id: userId,
        message: `${probeTag} LOW urgency receipt — should stay quiet`,
        urgency: 'low',
        trigger_reason: `${probeTag}-low`,
        source: 'mommy_receipt',
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    insertedOutreachIds.push(data!.id);

    const { data: refetched } = await supabase
      .from('handler_outreach_queue')
      .select('push_dispatched_at')
      .eq('id', data!.id)
      .maybeSingle();
    // Low urgency → bridge skipped → push_dispatched_at remains NULL.
    expect((refetched as { push_dispatched_at: string | null }).push_dispatched_at).toBeNull();

    const { data: notif } = await supabase
      .from('scheduled_notifications')
      .select('id')
      .filter('payload->data->>outreach_id', 'eq', data!.id)
      .maybeSingle();
    expect(notif).toBeNull();
  }, 10_000);

  it('persona swap shapes the title (dommy_mommy → Mama, otherwise → Handler)', async () => {
    // Look up the existing persona; we'll temporarily flip it then restore.
    const { data: stateRow } = await supabase
      .from('user_state')
      .select('handler_persona')
      .eq('user_id', userId)
      .maybeSingle();
    const original = (stateRow as { handler_persona?: string | null } | null)?.handler_persona ?? null;

    try {
      await supabase.from('user_state')
        .update({ handler_persona: 'therapist' })
        .eq('user_id', userId);

      const { data } = await supabase
        .from('handler_outreach_queue')
        .insert({
          user_id: userId,
          message: `${probeTag} therapist-persona — title should be Handler not Mama`,
          urgency: 'high',
          trigger_reason: `${probeTag}-therapist`,
          source: 'morning_brief',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
        })
        .select('id')
        .single();
      insertedOutreachIds.push(data!.id);

      const { data: notif } = await supabase
        .from('scheduled_notifications')
        .select('payload')
        .filter('payload->data->>outreach_id', 'eq', data!.id)
        .maybeSingle();
      expect(notif).toBeTruthy();
      expect((notif as { payload: { title: string } }).payload.title).toBe('Handler');
    } finally {
      if (original !== null) {
        await supabase.from('user_state')
          .update({ handler_persona: original })
          .eq('user_id', userId);
      }
    }
  }, 10_000);
});
