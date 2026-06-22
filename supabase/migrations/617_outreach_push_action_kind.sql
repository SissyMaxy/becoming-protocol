-- 617 — actionable push: carry action_kind + requires_photo into the payload.
--
-- 2026-06-22: pushes are now one-tap-actionable from the lock screen. The SW
-- (public/sw.js) builds a NotificationOptions.actions array — "Reply" (inline
-- text) for confessions, "Snap it" for photo demands, "Mark done" for plain
-- tasks — and routes the tap to /api/outreach/{reply,complete}. For the SW to
-- pick the right action set it needs a COARSE routing token in payload.data:
--
--   action_kind    'confession' | 'photo' | 'plain'   — shape of the task
--   requires_photo  bool                               — explicit photo gate
--
-- These are SHAPES, never content, so they survive stealth neutralization
-- (see the allowlist in supabase/functions/_shared/stealth.ts +
-- src/lib/stealth/notifications.ts). Under stealth the SW still hides the
-- action LABELS — it only keeps a neutral "Open" — so a coarse shape token on
-- the lock screen reveals nothing.
--
-- This re-CREATEs bridge_outreach_to_push + its trigger. It re-bakes BOTH
-- prior behaviours that must not regress:
--   - the regression-probe skip from migration 416 (which 613 accidentally
--     dropped when it re-CREATEd from 380's body, not 416's), and
--   - the word-boundary body cut from migration 613.
-- New: a p_requires_photo arg + the derived action_kind, the trigger now
-- passes NEW.requires_photo through, and a completed_at column so the new
-- /api/outreach/complete "Mark done" action can stamp completion (the table
-- only had delivered_at before). No extension block needed.

-- ─── completed_at column — stamped by the "Mark done" action ────────
-- The base table (migration 156) had status + delivered_at but no explicit
-- completion timestamp; the one-tap "Mark done" path needs one distinct from
-- delivered_at so audits can tell "I saw it" from "I did it".
ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ─── Bridge function (adds p_requires_photo + action_kind) ──────────
CREATE OR REPLACE FUNCTION bridge_outreach_to_push(
  p_outreach_id UUID,
  p_user_id UUID,
  p_message TEXT,
  p_urgency TEXT,
  p_source TEXT,
  p_kind TEXT,
  p_trigger_reason TEXT,
  p_expires_at TIMESTAMPTZ,
  p_scheduled_for TIMESTAMPTZ,
  p_requires_photo BOOLEAN DEFAULT FALSE
) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_persona TEXT;
  v_cut TEXT;
  v_action_kind TEXT;
  v_k TEXT;
BEGIN
  -- Regression probes never buzz a real phone (preserved from migration 416).
  IF p_source IS NOT NULL AND (p_source LIKE 'regression_%' OR p_source = 'test_probe') THEN
    UPDATE handler_outreach_queue
    SET push_dispatched_at = COALESCE(push_dispatched_at, now())
    WHERE id = p_outreach_id;
    RETURN;
  END IF;

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

  -- action_kind: the COARSE shape the SW uses to pick its action buttons.
  --   photo       — explicit requires_photo flag OR a photo/snap-shaped kind.
  --   confession  — confession / whisper / reply / disclosure-shaped kinds,
  --                 which want an inline text "Reply" action.
  --   plain       — everything else: a single "Mark done" action.
  v_k := lower(COALESCE(p_kind, ''));
  v_action_kind := CASE
    WHEN p_requires_photo IS TRUE OR v_k LIKE '%photo%' OR v_k LIKE '%snap%' THEN 'photo'
    WHEN v_k LIKE '%confession%' OR v_k LIKE '%whisper%'
         OR v_k LIKE '%reply%' OR v_k LIKE '%disclosure%' OR v_k LIKE '%answer%' THEN 'confession'
    ELSE 'plain'
  END;

  -- 140-char body budget; cut at the last word boundary so it never ends
  -- mid-word (preserved from migration 613).
  IF length(p_message) <= 140 THEN
    v_body := p_message;
  ELSE
    v_cut := substring(p_message FROM 1 FOR 138);
    v_cut := regexp_replace(v_cut, '\s+\S*$', '');
    IF v_cut IS NULL OR length(v_cut) = 0 THEN
      v_cut := substring(p_message FROM 1 FOR 138);
    END IF;
    v_body := rtrim(v_cut) || '…';
  END IF;

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
        'trigger_reason', p_trigger_reason,
        'action_kind', v_action_kind,
        'requires_photo', COALESCE(p_requires_photo, FALSE)
      )
    ),
    'pending'
  );

  UPDATE handler_outreach_queue
  SET push_dispatched_at = now()
  WHERE id = p_outreach_id;
END;
$$;

-- ─── AFTER INSERT trigger — pass NEW.requires_photo through ─────────
CREATE OR REPLACE FUNCTION trg_outreach_to_push()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.push_dispatched_at IS NULL THEN
    PERFORM bridge_outreach_to_push(
      NEW.id, NEW.user_id, NEW.message, NEW.urgency,
      NEW.source, NEW.kind, NEW.trigger_reason,
      NEW.expires_at, NEW.scheduled_for,
      COALESCE(NEW.requires_photo, FALSE)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_to_push ON handler_outreach_queue;
CREATE TRIGGER outreach_to_push
  AFTER INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_to_push();
