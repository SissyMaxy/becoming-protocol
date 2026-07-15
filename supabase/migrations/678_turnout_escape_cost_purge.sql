-- 678 — Turn-out ladder: one-tap escape-cost purge on retire.
--
-- DESIGN_TURNOUT_LADDER_2026-07-02.md §4(4) / Open Questions:
-- "Retiring stops all orchestration and emits `ladder_retired`; the
-- escape-cost record stays by default (it is her record of what she did)
-- but a one-tap purge is offered — she authored the destination and
-- keeps the exit." / "Retire keeps the record by default with one-tap
-- purge — her destination, her exit, her call on the evidence."
--
-- Retire (mig 652 onward, TurnoutPanel) already exists and only sets
-- turnout_state.retired_at. Nothing purges the 'turnout_rung' anchors
-- that feed current_escape_cost() (mig 533) and the weekly
-- escape_cost_reminder_eval nag — this migration adds that missing half.
--
-- Scope: purges only the escape_cost_anchors rows of kind 'turnout_rung'
-- (the weight that fuels the ongoing sunk-cost pressure). The
-- turnout_rung_completions ledger — the actual record of what she did —
-- is untouched; it stays visible in TurnoutPanel regardless. Gated on
-- retired_at IS NOT NULL: the purge is an exit right, not a mid-ladder
-- undo.

ALTER TABLE turnout_events DROP CONSTRAINT IF EXISTS turnout_events_event_type_check;
ALTER TABLE turnout_events ADD CONSTRAINT turnout_events_event_type_check
  CHECK (event_type IN
    ('rung_started','rung_consolidated','new_irreversible_fact','ladder_paused','ladder_retired','escape_cost_purged'));

CREATE OR REPLACE FUNCTION turnout_purge_escape_cost(p_user UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_retired_at TIMESTAMPTZ;
  v_purged_count INT;
  v_purged_weight INT;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN
    RAISE EXCEPTION 'This turn-out record belongs to a different user.';
  END IF;

  SELECT retired_at INTO v_retired_at FROM turnout_state WHERE user_id = p_user;
  IF v_retired_at IS NULL THEN
    RAISE EXCEPTION 'Retire the ladder before purging its escape-cost record.';
  END IF;

  SELECT count(*), COALESCE(sum(anchor_weight), 0) INTO v_purged_count, v_purged_weight
    FROM escape_cost_anchors WHERE user_id = p_user AND anchor_kind = 'turnout_rung';

  DELETE FROM escape_cost_anchors WHERE user_id = p_user AND anchor_kind = 'turnout_rung';

  INSERT INTO turnout_events (user_id, event_type, weight)
  VALUES (p_user, 'escape_cost_purged', v_purged_weight);

  RETURN jsonb_build_object('purged_count', v_purged_count, 'purged_weight', v_purged_weight);
END;
$fn$;
GRANT EXECUTE ON FUNCTION turnout_purge_escape_cost(UUID) TO authenticated, service_role;
