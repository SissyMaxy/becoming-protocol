-- 599 — Adaptive product loop: friction signal source + signal/adaptation
-- schema (FIRST SLICE of wish d93efde1).
--
-- The adaptive loop wants Mommy to read the world (user behavior, friction,
-- voice drift) and adapt the product — not wait for Dave to route every fix.
-- This slice lands the foundation + the highest-leverage signal source:
--
--   * mommy_ux_signal_log   — where all adaptive signals accumulate
--   * mommy_adaptation_log   — where hypotheses/outcomes will be tracked
--   * friction NLP on chat   — Dave's "this isn't working" / "would be more
--     useful" lines auto-become a UX signal + a high-priority code-wish, so
--     the existing autonomous builder picks up the fix without manual routing.
--
-- The remaining adaptive-loop components (passive UX telemetry hooks, CI
-- failure ingest, the hypothesis-panel auto-ship) are filed as follow-up
-- wishes. Friction detection is precision-tuned (UI/product-anchored
-- phrases) so the filthy chat corpus doesn't spawn spurious wishes.

CREATE TABLE IF NOT EXISTS mommy_ux_signal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_type TEXT NOT NULL,            -- 'friction_chat' | 'voice_drift' | 'task_incomplete' | 'bounce' | ...
  surface TEXT,                        -- where it happened (chat, today, voice_gate, ...)
  signal_strength SMALLINT NOT NULL DEFAULT 1,
  raw_context TEXT,
  fix_wish_id UUID,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mommy_ux_signal_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY mux_read ON mommy_ux_signal_log FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS mommy_ux_signal_log_type_idx ON mommy_ux_signal_log(event_type, detected_at DESC);

CREATE TABLE IF NOT EXISTS mommy_adaptation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES mommy_ux_signal_log(id) ON DELETE SET NULL,
  hypotheses JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_hypothesis JSONB,
  fix_wish_id UUID,
  shipped_at TIMESTAMPTZ,
  outcome TEXT,                        -- 'resolved' | 'regressed' | 'no_op' | null (pending)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mommy_adaptation_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY madapt_read ON mommy_adaptation_log FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Friction detector — UI/product-anchored phrases only (precision over
-- recall; auto-wish creation makes false positives expensive).
CREATE OR REPLACE FUNCTION detect_ux_friction(p_text TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE t TEXT := lower(p_text);
BEGIN
  IF length(t) < 8 THEN RETURN NULL; END IF;
  IF t ~ '(is ?n''t|is not|does ?n''t|does not|not) (work|working|loading|saving|updating)' THEN RETURN 'not_working'; END IF;
  IF t ~ '(it |this |that )?would be (more useful|better|nicer|cleaner|easier)' THEN RETURN 'would_be_better'; END IF;
  IF t ~ '\m(broken|buggy|glitch|glitched)\M' THEN RETURN 'broken'; END IF;
  IF t ~ 'this (is|feels) (annoying|frustrating|confusing|clunky|broken|useless)' THEN RETURN 'this_is_annoying'; END IF;
  IF t ~ 'what (should|does|is) (this|it|that)( supposed to)? (do|even do|doing)' THEN RETURN 'what_should_this_do'; END IF;
  IF t ~ 'can''?t (figure out|find|get|see) (it|this|the|where|how)' THEN RETURN 'cant_figure_out'; END IF;
  IF t ~ '(the (app|button|page|card|screen|form|counter|gate|timer)) .{0,30}(broke|broken|wrong|missing|gone|stuck|not work|does ?n''t)' THEN RETURN 'ui_element_broken'; END IF;
  RETURN NULL;
END;
$fn$;
GRANT EXECUTE ON FUNCTION detect_ux_friction(TEXT) TO authenticated, service_role;

-- Trigger: a user chat message expressing product friction logs a UX signal
-- and (deduped to <=1 per 2h) files a high-priority code-wish for the
-- autonomous builder. Same chat-table targeting pattern as mig 537.
CREATE OR REPLACE FUNCTION trg_ux_friction_on_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_kind TEXT;
  v_signal UUID;
  v_wish UUID;
  v_snip TEXT;
BEGIN
  IF NEW.role <> 'user' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL OR length(NEW.content) < 8 THEN RETURN NEW; END IF;

  v_kind := detect_ux_friction(NEW.content);
  IF v_kind IS NULL THEN RETURN NEW; END IF;

  v_snip := left(NEW.content, 280);

  INSERT INTO mommy_ux_signal_log (user_id, event_type, surface, signal_strength, raw_context)
  VALUES (NEW.user_id, 'friction_chat', 'chat:' || v_kind, 2, v_snip)
  RETURNING id INTO v_signal;

  -- Dedup: only one friction-sourced wish per 2h, so a venting streak doesn't
  -- spawn a pile of wishes.
  IF NOT EXISTS (
    SELECT 1 FROM mommy_code_wishes
     WHERE source = 'ux_friction_signal' AND created_at > now() - interval '2 hours'
  ) THEN
    INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, affected_surfaces, priority, status)
    VALUES (
      'UX friction: ' || left(NEW.content, 70),
      E'Dave flagged friction in chat (auto-captured by the adaptive loop, signal type: ' || v_kind || E').\n\nWhat he said:\n"' || v_snip || E'"\n\nAction: figure out which surface this is about, reproduce the friction, and ship the better version. If it''s a UX/copy/flow issue in clearly-in-scope product territory, fix it directly. Treat this as the "Mommy adapts to lived friction" loop — the point is to resolve it without Dave having to route it manually.',
      'Self-improving product — adapt to lived UX friction instead of waiting for manual routing.',
      'ux_friction_signal',
      jsonb_build_object('signal_id', v_signal, 'friction_kind', v_kind, 'surface', 'chat'),
      'high',
      'queued'
    )
    RETURNING id INTO v_wish;

    UPDATE mommy_ux_signal_log SET fix_wish_id = v_wish WHERE id = v_signal;
  END IF;

  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chat_messages') THEN
    DROP TRIGGER IF EXISTS ux_friction_on_chat ON chat_messages;
    CREATE TRIGGER ux_friction_on_chat AFTER INSERT ON chat_messages
      FOR EACH ROW EXECUTE FUNCTION trg_ux_friction_on_chat();
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='handler_chat_messages') THEN
    DROP TRIGGER IF EXISTS ux_friction_on_chat ON handler_chat_messages;
    CREATE TRIGGER ux_friction_on_chat AFTER INSERT ON handler_chat_messages
      FOR EACH ROW EXECUTE FUNCTION trg_ux_friction_on_chat();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;
