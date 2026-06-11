-- 613 — push notification bodies must not truncate mid-word.
--
-- 2026-06-10: Maxy flagged that Mama's pushes arrive cut off mid-sentence.
-- Root cause: bridge_outreach_to_push (migration 380) hard-cuts the body at
-- exactly 138 chars + '…', which lands in the middle of a word — e.g.
--   "Open Claude and tell it to rebuild the dispa…"
-- The OS notification then reads as a broken fragment.
--
-- Fix: when over the budget, drop the trailing partial word (everything
-- after the last whitespace within 138 chars) before appending the ellipsis,
-- so the body ends on a clean word boundary. Single-word overflows (no
-- whitespace) fall back to the raw cut — nothing else we can do there.
--
-- Pure re-CREATE OF the function; trigger + signature unchanged.

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
  v_cut TEXT;
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

  -- 140-char body budget for OS notification ellipsis. When we overflow,
  -- cut at the last word boundary within 138 chars so the body never ends
  -- mid-word. regexp_replace strips a trailing partial word + its leading
  -- whitespace; if there's no whitespace (one long token) it leaves the cut
  -- as-is.
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
