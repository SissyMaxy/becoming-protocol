-- 659 — Coming-Out Journey: Mommy conditions you toward coming out to Gina
-- YOURSELF, via graduated exposure therapy. NOT a decree, NOT a deadline.
--
-- Operator amendment 2026-07-04 ([[never-disclose-to-gina]]): Mommy never outs
-- her / never contacts Gina / never schedules or penalizes disclosure. But Mommy
-- MAY condition the user toward coming out THEMSELVES — self-acceptance + a
-- graduated exposure ladder to the fear of telling Gina + courage/momentum. The
-- act stays user-initiated; the read on WHEN stays hers.
--
-- Design constraints baked into this schema (the guardrail is the point):
--   * NO deadline column, NO penalty, NO consequence. Advancement is user-only.
--   * No Gina contact/recipient anywhere. Rehearsal is to MOMMY, never to Gina.
--   * The milestone (told_gina_at) is set by the USER when she has done it.
--   * Gated behind an explicit opt-in (default OFF); safeword pauses the arc.

-- ─── 1. stage catalog (the exposure ladder) ────────────────────────────────
CREATE TABLE IF NOT EXISTS coming_out_stages (
  stage_key TEXT PRIMARY KEY,
  ordinal SMALLINT NOT NULL,
  title TEXT NOT NULL,             -- plain, stranger-readable
  mommy_focus TEXT NOT NULL,       -- what Mommy works on in dialogue at this stage
  exposure_note TEXT NOT NULL,     -- the therapeutic intent (internal)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE coming_out_stages ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY coming_out_stages_read ON coming_out_stages FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY coming_out_stages_service ON coming_out_stages FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

INSERT INTO coming_out_stages (stage_key, ordinal, title, mommy_focus, exposure_note) VALUES
  ('naming', 1, 'Say it to Mommy',
   'Get her to name the woman underneath, out loud, to Mommy — until it stops feeling like a confession and starts feeling like a fact.',
   'Self-acceptance. Baseline: the truth said safely, repeatedly, to a safe listener.'),
  ('wanting', 2, 'Want her to know',
   'Get her to own the wish itself: "I want Gina to know me." Sit with the wanting, not the doing.',
   'Owning the desire to be seen — separating the want (safe) from the act (feared).'),
  ('imagining', 3, 'Picture telling her',
   'Walk her through imagining the moment of telling Gina — the room, the words starting. Stay in the picture; let the fear rise and pass.',
   'Imaginal exposure. Approach the feared scene in imagination until the spike drops.'),
  ('rehearsing', 4, 'Rehearse the words (to Mommy)',
   'Have her say the actual words she would say to Gina — OUT LOUD, TO MOMMY, never to Gina. Again and again until they come without shaking.',
   'Rehearsal / response practice. Builds fluency with the feared utterance in a safe container.'),
  ('facing', 5, 'Sit with her reaction',
   'Have her picture Gina''s reaction — the worst she fears AND the hope — and stay with both without flinching.',
   'Exposure to the feared outcome. Tolerance for uncertainty; both catastrophe and hope held.'),
  ('choosing', 6, 'Choose your moment',
   'Help her decide, on HER terms, the conditions she''d want for it — when, where, how. Her call, fully. Mommy holds the courage, not the calendar.',
   'Agency. The user sets the terms; readiness is self-assessed, never imposed.'),
  ('ready', 7, 'You''re ready',
   'She is ready and she knows it. Mommy is in her ear for courage; she picks the moment and walks to Gina herself.',
   'Consolidated readiness. The act is imminent and entirely user-initiated.'),
  ('told', 8, 'You told her yourself',
   'She did it — she came out to Gina, in her own words, on her own two feet. Mommy debriefs and holds her through the after.',
   'Milestone (user-marked). Aftercare + integration, whatever the outcome.')
ON CONFLICT (stage_key) DO NOTHING;

-- ─── 2. per-user journey state ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coming_out_journey (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'naming' REFERENCES coming_out_stages(stage_key),
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,     -- opt-in; the user starts the arc
  reflections JSONB NOT NULL DEFAULT '{}'::jsonb,  -- per-stage notes she leaves
  told_gina_at TIMESTAMPTZ,                   -- the milestone — USER-set only
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE coming_out_journey ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY coming_out_journey_self ON coming_out_journey FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY coming_out_journey_service ON coming_out_journey FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ─── 3. user-only advancement (no deadlines, no auto-advance) ──────────────
-- Advancement is ALWAYS the user's action. There is deliberately no system path
-- that pushes her forward — the whole guardrail is that the pace is hers.
CREATE OR REPLACE FUNCTION coming_out_advance(p_user UUID, p_reflection TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_cur TEXT; v_ord SMALLINT; v_next TEXT;
BEGIN
  SELECT current_stage INTO v_cur FROM coming_out_journey WHERE user_id = p_user;
  IF v_cur IS NULL THEN
    INSERT INTO coming_out_journey (user_id, enabled) VALUES (p_user, TRUE)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN 'naming';
  END IF;
  SELECT ordinal INTO v_ord FROM coming_out_stages WHERE stage_key = v_cur;
  SELECT stage_key INTO v_next FROM coming_out_stages WHERE ordinal = v_ord + 1;
  IF v_next IS NULL THEN RETURN v_cur; END IF;  -- already at the last stage
  UPDATE coming_out_journey
     SET current_stage = v_next, stage_entered_at = now(),
         reflections = CASE WHEN p_reflection IS NOT NULL AND length(trim(p_reflection)) > 0
                            THEN reflections || jsonb_build_object(v_cur, p_reflection)
                            ELSE reflections END
   WHERE user_id = p_user;
  RETURN v_next;
END;
$fn$;
GRANT EXECUTE ON FUNCTION coming_out_advance(UUID, TEXT) TO authenticated, service_role;

-- The milestone: she came out to Gina herself. USER action only.
CREATE OR REPLACE FUNCTION coming_out_mark_told(p_user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO coming_out_journey (user_id, current_stage, told_gina_at, enabled)
  VALUES (p_user, 'told', now(), TRUE)
  ON CONFLICT (user_id) DO UPDATE SET current_stage = 'told', told_gina_at = COALESCE(coming_out_journey.told_gina_at, now());
END;
$fn$;
GRANT EXECUTE ON FUNCTION coming_out_mark_told(UUID) TO authenticated, service_role;

-- Let her step back to an earlier stage too — readiness isn't monotonic.
CREATE OR REPLACE FUNCTION coming_out_set_stage(p_user UUID, p_stage TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM coming_out_stages WHERE stage_key = p_stage) THEN RETURN NULL; END IF;
  INSERT INTO coming_out_journey (user_id, current_stage, enabled) VALUES (p_user, p_stage, TRUE)
  ON CONFLICT (user_id) DO UPDATE SET current_stage = p_stage, stage_entered_at = now();
  RETURN p_stage;
END;
$fn$;
GRANT EXECUTE ON FUNCTION coming_out_set_stage(UUID, TEXT) TO authenticated, service_role;
