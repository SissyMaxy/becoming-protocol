-- 380 — outreach → push bridge.
--
-- Bug observed 2026-05-13: handler_outreach_queue accumulates ~170 rows/day,
-- 75% expire with status='expired' and surfaced_at=NULL. engagement_quota in
-- particular: 843/843 unsurfaced over 14d. Root cause: the push pipeline
-- (web-push-dispatch) reads `scheduled_notifications`, but the dozens of
-- outreach generators (handler-autonomous, mommy-immediate triggers,
-- engagement_quota, random_reward, morning_brief, ...) write to
-- `handler_outreach_queue`. The bridge between the two tables was never
-- wired, so idle users — the exact users engagement_quota is meant to
-- recover — never receive the push and never load the in-app surface.
-- 2349 outreach rows in 14d, 0 with a matching scheduled_notifications.
--
-- Fix: AFTER INSERT trigger on handler_outreach_queue that emits a
-- scheduled_notifications row for any high/normal/critical urgency insert.
-- Idempotent via the new `push_dispatched_at` column. Low urgency is
-- intentionally not bridged — those are confessional/ambient and shouldn't
-- buzz the phone.
--
-- Stealth/payload neutralization happens downstream in web-push-dispatch
-- (see _shared/stealth.ts) — the trigger just emits the plain text title
-- and body; the dispatcher rewrites under stealth_settings.

-- ─── 1. Relax scheduled_notifications.notification_type CHECK ──────
-- The existing CHECK only allowed 11 hard-coded values (micro_task,
-- affirmation, content_unlock, challenge, jackpot, anchor_reminder,
-- zepbound_injection, hrt_dose, dysphoria_diary, measurement_check,
-- workout_reminder). Every later edge function — handler-autonomous's
-- commitment_deadline / gina_playbook / gina_warmup inserts, and now
-- this bridge — gets silently rejected. The downstream consumer
-- (web-push-dispatch) doesn't validate against this list either, so
-- the constraint is doing no real work besides hiding bugs.
ALTER TABLE scheduled_notifications
  DROP CONSTRAINT IF EXISTS scheduled_notifications_notification_type_check;

-- ─── 2. Dispatch tracking column ────────────────────────────────────
ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS push_dispatched_at timestamptz;

CREATE INDEX IF NOT EXISTS handler_outreach_queue_undispatched_idx
  ON handler_outreach_queue (user_id, scheduled_for)
  WHERE push_dispatched_at IS NULL AND status = 'pending';

COMMENT ON COLUMN handler_outreach_queue.push_dispatched_at IS
  'Set when scheduled_notifications row was emitted for this outreach via trg_outreach_to_push. NULL = not yet bridged. Idempotency guard for the trigger and the backfill loop.';

-- ─── 2. Bridge function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bridge_outreach_to_push(
  p_outreach_id UUID,
  p_user_id UUID,
  p_message TEXT,
  p_urgency TEXT,
  p_source TEXT,
  p_kind TEXT,
  p_trigger_reason TEXT,
  p_expires_at TIMESTAMPTZ,
  p_scheduled_for TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_persona TEXT;
BEGIN
  -- Skip low/null urgency. Those are ambient receipts, not phone-buzz.
  IF p_urgency IS NULL OR p_urgency NOT IN ('high', 'critical', 'normal') THEN
    RETURN;
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RETURN;
  END IF;

  -- Idempotency: bail if a notification already references this outreach.
  IF EXISTS (
    SELECT 1 FROM scheduled_notifications
    WHERE (payload->'data'->>'outreach_id') = p_outreach_id::text
  ) THEN
    -- Mark dispatched so backfill doesn't keep finding it.
    UPDATE handler_outreach_queue
    SET push_dispatched_at = COALESCE(push_dispatched_at, now())
    WHERE id = p_outreach_id;
    RETURN;
  END IF;

  v_persona := COALESCE((SELECT handler_persona FROM user_state WHERE user_id = p_user_id), '');

  -- Title: persona for Mommy users; source-aware for therapist/handler.
  v_title := CASE
    WHEN v_persona = 'dommy_mommy' THEN 'Mama'
    WHEN p_source LIKE 'mommy_%' OR p_kind LIKE 'mommy_%' THEN 'Mama'
    ELSE 'Handler'
  END;

  -- 140-char body for OS notification ellipsis budget.
  v_body := CASE
    WHEN length(p_message) <= 140 THEN p_message
    ELSE substring(p_message FROM 1 FOR 138) || '…'
  END;

  INSERT INTO scheduled_notifications (
    user_id, notification_type, scheduled_for, expires_at, payload, status
  ) VALUES (
    p_user_id,
    COALESCE(p_source, 'handler_outreach'),
    COALESCE(p_scheduled_for, now()),
    p_expires_at,
    jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'outreach_id', p_outreach_id,
        'kind', p_kind,
        'source', p_source,
        'trigger_reason', p_trigger_reason
      )
    ),
    'pending'
  );

  UPDATE handler_outreach_queue
  SET push_dispatched_at = now()
  WHERE id = p_outreach_id;
END;
$$;

-- ─── 3. AFTER INSERT trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_outreach_to_push()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only bridge fresh pending inserts that haven't already been dispatched.
  IF NEW.status = 'pending' AND NEW.push_dispatched_at IS NULL THEN
    PERFORM bridge_outreach_to_push(
      NEW.id, NEW.user_id, NEW.message, NEW.urgency,
      NEW.source, NEW.kind, NEW.trigger_reason,
      NEW.expires_at, NEW.scheduled_for
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_to_push ON handler_outreach_queue;
CREATE TRIGGER outreach_to_push
  AFTER INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_to_push();

-- ─── 4. Backfill ─────────────────────────────────────────────────────
-- Bridge still-pending rows so the user gets pushes she's owed RIGHT NOW.
-- Capped at 50 to avoid a huge transaction; the trigger handles future inserts.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, user_id, message, urgency, source, kind, trigger_reason,
           expires_at, scheduled_for
    FROM handler_outreach_queue
    WHERE status = 'pending'
      AND push_dispatched_at IS NULL
      AND urgency IN ('high', 'critical', 'normal')
      AND (expires_at IS NULL OR expires_at > now())
      AND (scheduled_for IS NULL OR scheduled_for <= now() + interval '5 minutes')
    ORDER BY
      CASE urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      scheduled_for ASC NULLS LAST
    LIMIT 50
  LOOP
    PERFORM bridge_outreach_to_push(
      r.id, r.user_id, r.message, r.urgency,
      r.source, r.kind, r.trigger_reason,
      r.expires_at, r.scheduled_for
    );
  END LOOP;
END $$;
