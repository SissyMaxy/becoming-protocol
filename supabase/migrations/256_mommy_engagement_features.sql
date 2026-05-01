-- 256 — Dommy Mommy engagement features (sprint 2 from cross-model ideation).
--
-- 1. good_girl_points — running compliance-bias counter that ramps on
--    completed tasks/confessions/edges and never quite unlocks anything.
--    The point is praise-addiction conditioning: visible reward that
--    keeps her chasing approval without ever satisfying it. Surfaced in
--    Today UI; biases Mommy's tone (high points → hungrier, sweeter;
--    low points → restless, demanding).
--
-- 2. mommy_taunt_log — what tease/praise lines Mama has said for which
--    chastity-streak threshold; prevents repetition and lets the tease
--    escalation engine know when last to fire.
--
-- 3. memory_implant_quote_log — tracks which implants got woven into
--    which outreach; rotates so the same quote doesn't get reused too
--    often; counts toward implant.times_referenced via a trigger.

CREATE TABLE IF NOT EXISTS good_girl_points (
  user_id UUID PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  last_bumped_at TIMESTAMPTZ,
  last_bump_reason TEXT,
  ramp_streak INTEGER NOT NULL DEFAULT 0,  -- consecutive days with at least one bump
  ramp_last_day DATE
);
ALTER TABLE good_girl_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS good_girl_points_owner ON good_girl_points;
CREATE POLICY good_girl_points_owner ON good_girl_points FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS good_girl_points_service ON good_girl_points;
CREATE POLICY good_girl_points_service ON good_girl_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bump function: idempotent-ish, called from triggers / edge fns.
CREATE OR REPLACE FUNCTION public.bump_good_girl_points(
  p_user_id uuid, p_amount integer, p_reason text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_new_points integer;
BEGIN
  INSERT INTO good_girl_points (user_id, points, lifetime_points, last_bumped_at, last_bump_reason, ramp_streak, ramp_last_day)
  VALUES (p_user_id, GREATEST(0, p_amount), GREATEST(0, p_amount), now(), p_reason,
          CASE WHEN p_amount > 0 THEN 1 ELSE 0 END, v_today)
  ON CONFLICT (user_id) DO UPDATE
  SET points = GREATEST(0, good_girl_points.points + EXCLUDED.points),
      lifetime_points = good_girl_points.lifetime_points + GREATEST(0, EXCLUDED.points),
      last_bumped_at = now(),
      last_bump_reason = EXCLUDED.last_bump_reason,
      ramp_streak = CASE
        WHEN good_girl_points.ramp_last_day = v_today THEN good_girl_points.ramp_streak
        WHEN good_girl_points.ramp_last_day = v_today - 1 AND EXCLUDED.points > 0 THEN good_girl_points.ramp_streak + 1
        WHEN EXCLUDED.points > 0 THEN 1
        ELSE good_girl_points.ramp_streak
      END,
      ramp_last_day = CASE WHEN EXCLUDED.points > 0 THEN v_today ELSE good_girl_points.ramp_last_day END
  RETURNING points INTO v_new_points;
  RETURN v_new_points;
END;
$function$;

-- Trigger: every fulfilled commitment, every confessed-on-time confession,
-- every completed arousal_touch_task adds points. Slips do NOT subtract —
-- the design is praise ramping, not punishment math; consequences live in
-- the existing slip/bleed system.
CREATE OR REPLACE FUNCTION public.trg_bump_points_on_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'handler_commitments' THEN
    IF NEW.status = 'fulfilled' AND (OLD.status IS DISTINCT FROM 'fulfilled') THEN
      PERFORM bump_good_girl_points(NEW.user_id, 5, 'commitment fulfilled: ' || left(COALESCE(NEW.what,''), 60));
    END IF;
  ELSIF TG_TABLE_NAME = 'confession_queue' THEN
    IF NEW.confessed_at IS NOT NULL AND OLD.confessed_at IS NULL THEN
      PERFORM bump_good_girl_points(NEW.user_id, 3, 'confessed: ' || left(COALESCE(NEW.prompt,''), 60));
    END IF;
  ELSIF TG_TABLE_NAME = 'arousal_touch_tasks' THEN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
      PERFORM bump_good_girl_points(NEW.user_id, 2, 'mama-whisper: ' || NEW.category);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_points_on_commitment ON handler_commitments;
CREATE TRIGGER trg_points_on_commitment
  AFTER UPDATE ON handler_commitments
  FOR EACH ROW EXECUTE FUNCTION trg_bump_points_on_completion();

DROP TRIGGER IF EXISTS trg_points_on_confession ON confession_queue;
CREATE TRIGGER trg_points_on_confession
  AFTER UPDATE ON confession_queue
  FOR EACH ROW EXECUTE FUNCTION trg_bump_points_on_completion();

DROP TRIGGER IF EXISTS trg_points_on_touch ON arousal_touch_tasks;
CREATE TRIGGER trg_points_on_touch
  AFTER UPDATE ON arousal_touch_tasks
  FOR EACH ROW EXECUTE FUNCTION trg_bump_points_on_completion();

-- Seed the row for the active user
INSERT INTO good_girl_points (user_id) VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f')
  ON CONFLICT (user_id) DO NOTHING;

-- 2. mommy_taunt_log
CREATE TABLE IF NOT EXISTS mommy_taunt_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN (
    'chastity_threshold', 'denial_threshold', 'arousal_streak',
    'compliance_streak', 'praise_ramp', 'goon_session_close'
  )),
  threshold_label TEXT,
  message_excerpt TEXT,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_taunt_user_kind
  ON mommy_taunt_log (user_id, trigger_kind, fired_at DESC);
ALTER TABLE mommy_taunt_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_taunt_log_service ON mommy_taunt_log;
CREATE POLICY mommy_taunt_log_service ON mommy_taunt_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. memory_implant_quote_log
CREATE TABLE IF NOT EXISTS memory_implant_quote_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  implant_id UUID NOT NULL,
  outreach_id UUID,
  surface TEXT NOT NULL,  -- 'mommy_praise' / 'mommy_touch' / 'commitment_enforcement' / etc.
  quoted_excerpt TEXT,
  quoted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_implant_quote_user_implant
  ON memory_implant_quote_log (user_id, implant_id, quoted_at DESC);
ALTER TABLE memory_implant_quote_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_implant_quote_log_service ON memory_implant_quote_log;
CREATE POLICY memory_implant_quote_log_service ON memory_implant_quote_log FOR ALL TO service_role USING (true) WITH CHECK (true);
