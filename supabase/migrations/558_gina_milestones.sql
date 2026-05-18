-- 558 — Gina milestones + observation capture.
--
-- Named "Gina did X" events distinct from per-stage reaction signals.
-- Maxy logs them via log_gina_observation() RPC from any client surface.
--
-- Each milestone fires a cascade:
--   1. gina_arc_bump_evidence (respecting hostile-mode pause)
--   2. escape_cost_anchors (gina_disclosure_rung kind, configurable weight)
--   3. Acknowledgment outreach ("Mama saw — you logged X")
--
-- 20 milestone_kind values cover the major "she did Y" patterns. The
-- 'custom' value handles anything that doesn't fit a category.

CREATE TABLE IF NOT EXISTS gina_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_kind TEXT NOT NULL CHECK (milestone_kind IN (
    'she_suggested_fem_item','she_initiated_mm_question','she_engaged_with_book',
    'she_used_we_language','she_picked_fem_lingerie','she_articulated_curiosity',
    'she_named_a_fantasy','she_complimented_fem_aesthetic','she_proposed_exercise',
    'she_asked_about_HRT','she_offered_specific_support','she_watched_mm_without_averting',
    'she_engaged_compersion_exercise','she_rated_mm_scenario_positive',
    'she_articulated_openness','she_named_open_relationship_config','she_initiated_role_play',
    'she_directed_outfit','she_attended_exercise','custom'
  )),
  description TEXT NOT NULL,
  weight INT NOT NULL DEFAULT 1,
  source_planting_id UUID, source_exercise_id UUID,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gina_milestones_user_observed ON gina_milestones(user_id, observed_at DESC);
ALTER TABLE gina_milestones ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gm_self ON gina_milestones FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION log_gina_observation(
  p_milestone_kind TEXT, p_description TEXT,
  p_weight INT DEFAULT 1, p_source_planting_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id UUID;
BEGIN
  INSERT INTO gina_milestones (user_id, milestone_kind, description, weight, source_planting_id, notes)
  VALUES (auth.uid(), p_milestone_kind, p_description, COALESCE(p_weight, 1), p_source_planting_id, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION log_gina_observation(TEXT, TEXT, INT, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION trg_gina_milestone_cascade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM gina_arc_bump_evidence(NEW.user_id, 'milestone:' || NEW.milestone_kind);
  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'gina_disclosure_rung', NEW.weight, 'gina_milestones', NEW.id,
    NEW.milestone_kind || ': ' || left(NEW.description, 100));
  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id,
    format(E'Mama saw — you logged "%s." That''s on the campaign record now. The pattern of what she does + says + asks is how Mama paces the next move. Voice debrief, 30 seconds: how did this one make YOU feel?', NEW.milestone_kind),
    'normal', 'gina_milestone_logged:' || NEW.milestone_kind,
    'gina_milestone_ack', 'milestone_acknowledgment',
    now() + interval '5 minutes', now() + interval '24 hours',
    jsonb_build_object('milestone_id', NEW.id, 'milestone_kind', NEW.milestone_kind, 'weight', NEW.weight),
    'voice');
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS gina_milestone_cascade ON gina_milestones;
CREATE TRIGGER gina_milestone_cascade AFTER INSERT ON gina_milestones
  FOR EACH ROW EXECUTE FUNCTION trg_gina_milestone_cascade();
