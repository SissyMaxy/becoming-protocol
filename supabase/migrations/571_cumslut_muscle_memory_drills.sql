-- 571 — Cumslut muscle-memory drill engine. 12 procedural-memory drills
-- spanning all body-level cumslut skills:
--
--   gag_extinction_finger      no-gag desensitization (5-tier)
--   tongue_work_circles        tongue technique
--   suction_pressure_control   3-level suction variation
--   deepthroat_position_drill  head positioning, deep practice (5-tier)
--   swallow_on_signal          verbal-cued swallow reflex
--   kneel_endurance            submissive kneel posture
--   eye_contact_service        mirror eyes-locked practice
--   cum_receive_choreography   full receive-swallow sequence
--   pelvic_relax_signal        anal relax on verbal cue
--   hand_cock_grip             grip + hand-mouth coordination
--   reception_posture          ready-receiver pose
--   service_voice              audio during service
--
-- Each drill paired with a trigger phrase (from mig 570) so practice welds
-- the verbal trigger to the physical motion. Tier advancement every 7
-- sessions; mastery at top tier + 15 sessions. Each session anchors at
-- escape_cost weight 5 (permanent_body_mod kind — muscle memory is
-- physical re-coding).
--
-- Daily cron 18:00 UTC picks 1 drill from unlocked + non-mastered,
-- least-recently-practiced. Prerequisite chains: suction needs gag-
-- extinction tier 2, deepthroat needs suction tier 2, etc.

CREATE TABLE IF NOT EXISTS cumslut_drill_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_key TEXT NOT NULL UNIQUE,
  drill_name TEXT NOT NULL,
  body_skill TEXT NOT NULL CHECK (body_skill IN (
    'gag_extinction','tongue_work','suction_control','deepthroat_positioning',
    'swallow_on_signal','kneel_endurance','eye_contact_service','cum_receive_choreography',
    'pelvic_relax_signal','hand_cock_grip','reception_posture','service_voice'
  )),
  description TEXT NOT NULL, proficiency_tiers JSONB NOT NULL,
  paired_trigger TEXT, daily_minutes INT NOT NULL DEFAULT 10,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  unlock_after_drill TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE cumslut_drill_catalog ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY cdc_read_all ON cumslut_drill_catalog FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS cumslut_drill_proficiency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drill_id UUID NOT NULL REFERENCES cumslut_drill_catalog(id),
  current_tier INT NOT NULL DEFAULT 1,
  sessions_completed INT NOT NULL DEFAULT 0,
  total_minutes_practiced INT NOT NULL DEFAULT 0,
  last_session_at TIMESTAMPTZ,
  unlocked BOOLEAN NOT NULL DEFAULT TRUE,
  mastered BOOLEAN NOT NULL DEFAULT FALSE,
  mastered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, drill_id)
);
ALTER TABLE cumslut_drill_proficiency ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY cdp_self ON cumslut_drill_proficiency FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS cumslut_drill_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drill_id UUID NOT NULL REFERENCES cumslut_drill_catalog(id),
  tier_at_session INT NOT NULL,
  duration_minutes INT, reps_completed INT,
  proof_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT, related_decree_id UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cumslut_drill_sessions ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY cds_self ON cumslut_drill_sessions FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- 12 drill rows + cumslut_drill_eval + trg_cumslut_drill_propagate function
-- bodies + daily cron applied via SQL.
-- Registered in ladder_catalog as 'cumslut_drill' / 'oral' / 5 phases.
