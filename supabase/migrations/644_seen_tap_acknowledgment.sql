-- 644 — Seen-tap acknowledgment: wire the deliberate-miss signal.
--
-- Design: DESIGN_ENFORCEMENT_SPINE_2026-07-01.md §2.
--
-- The escalation calculus (mig 628, obligation_miss_processor) already scores a
-- missed obligation at 3 points ('obligation_missed_acknowledged') instead of 2
-- ('obligation_missed_internal') WHEN surfaced_via = 'seen_tap' — the semantics
-- being "she saw it and still let it lapse = deliberate". But nothing ever wrote
-- surfaced_via='seen_tap': the auto-file mirrors only ever stamp 'decree_render'
-- / 'outreach_render'. Live data: obligations.surfaced_via is NULL on ~1732 rows
-- and 'decree_render' on 1. The deliberate-dodge tooth was dead.
--
-- This migration adds the ONE thing missing: an RPC the single-task focus surface
-- (FocusMode) calls when it genuinely displays an obligation-backed task, stamping
-- surfaced_via='seen_tap'. RLS on obligations is SELECT-only for authenticated
-- (mig 627), so the stamp MUST go through a SECURITY DEFINER RPC scoped to
-- auth.uid()'s own rows.
--
-- Invariants preserved:
--   * Only live, pre-consequence rows (filed / surfaced / due) are upgraded. A
--     missed / fired / terminal row is never touched (idempotent no-op).
--   * surfaced_at = COALESCE(surfaced_at, now()) — an ack IS a genuine render
--     (mig 611 rule: surfaced_at is genuine render, never delivery). Acknowledging
--     an already-overdue row therefore stamps surfaced_at=now() > deadline-grace,
--     which the miss-processor VOIDS (unfair — she only just saw it), never
--     penalizes. Acknowledged-miss cannot manufacture a penalty.
--   * A 'filed' row (never surfaced) is walked to 'surfaced' by the ack, since the
--     ack is itself the surfacing event — visible-before-penalized, made MORE
--     honest, not less.
--   * Idempotent: a row already seen-tap-surfaced returns unchanged.
--
-- TS mirror: supabase/functions/_shared/enforcement-core.ts computeAckStamp() +
-- ackSourceForTask() (pinned by src/__tests__/lib/seen-tap.test.ts).

CREATE OR REPLACE FUNCTION acknowledge_obligation(
  p_source_table TEXT,
  p_source_id UUID
) RETURNS obligations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o obligations%ROWTYPE;
  v_from TEXT;
BEGIN
  -- Scope strictly to the caller's own obligation. SECURITY DEFINER does not
  -- change the request context, so auth.uid() is still the authenticated user.
  SELECT * INTO v_o FROM obligations
   WHERE source_table = p_source_table AND source_id = p_source_id
     AND user_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;                               -- not theirs / doesn't exist
  END IF;

  -- Only live, pre-consequence obligations can be acknowledged. missed /
  -- consequence_previewed / consequence_fired / fulfilled / voided / cancelled_*
  -- / paused are never upgraded — the acknowledged signal must land BEFORE the
  -- miss is scored to matter, and re-stamping a settled row would be noise.
  IF v_o.status NOT IN ('filed','surfaced','due') THEN
    RETURN v_o;
  END IF;

  -- Idempotent: already acknowledged and already surfaced → nothing to do.
  IF v_o.surfaced_via = 'seen_tap' AND v_o.status <> 'filed' THEN
    RETURN v_o;
  END IF;

  v_from := v_o.status;
  UPDATE obligations SET
    -- A 'filed' row is surfaced BY this ack (the ack is genuine render). A row
    -- already surfaced/due keeps its status; only the via is upgraded.
    status       = CASE WHEN status = 'filed' THEN 'surfaced' ELSE status END,
    -- Genuine render, once. Never overwrite an earlier honest surface time.
    surfaced_at  = COALESCE(surfaced_at, now()),
    surfaced_via = 'seen_tap'
  WHERE id = v_o.id
  RETURNING * INTO v_o;

  -- Log through the ledger's own audit trail so the seen-tap is inspectable
  -- (obligation_transition_log is the canonical transition history).
  INSERT INTO obligation_transition_log (obligation_id, from_status, to_status, via, actor, note)
  VALUES (v_o.id, v_from, v_o.status, 'seen_tap', 'user',
    CASE WHEN v_from = 'filed'
         THEN 'seen-tap ack surfaced a filed obligation (genuine render)'
         ELSE 'seen-tap ack: acknowledged-miss upgrade (deliberate if later lapsed)' END);

  RETURN v_o;
END;
$$;
GRANT EXECUTE ON FUNCTION acknowledge_obligation(TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
