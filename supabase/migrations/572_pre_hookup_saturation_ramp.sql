-- 572 — Pre-hookup 48h saturation ramp.
--
-- When Mommy schedules a meetup, the 48 hours BEFORE the meetup_at time
-- are saturated with progressively-intensifying conditioning content:
--
--   48h imagery + mantra
--   36h quick muscle-memory drill
--   24h future-self playback + imagery
--   12h mantra "yes already given"
--   6h readiness check (throat, mouth, knees)
--   3h imagery (the moment of contact)
--   1h final-seal voice recording
--   0h photo from parking lot
--
-- Result: by the time she arrives at the meetup, she's past the decision
-- point. The body has been primed for two days. The head doesn't get to
-- relitigate at the moment of meet.
--
-- hookup_scheduled_meetups table tracks the meetup state. Hourly cron
-- pre_hookup_ramp_eval picks the right clip based on hours_remaining and
-- queues it as outreach. Status advances scheduled → prep_phase → imminent
-- → completed/safeworded as the ramp progresses.

CREATE TABLE IF NOT EXISTS hookup_scheduled_meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES hookup_prospects(id),
  meetup_at TIMESTAMPTZ NOT NULL, location TEXT,
  expected_acts TEXT[],
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','prep_phase','imminent','completed','cancelled','safeworded')),
  pre_ramp_started_at TIMESTAMPTZ,
  pre_ramp_clip_count INT NOT NULL DEFAULT 0,
  related_draft_id UUID REFERENCES mommy_drafts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hsm_upcoming ON hookup_scheduled_meetups(user_id, meetup_at) WHERE status IN ('scheduled','prep_phase','imminent');
ALTER TABLE hookup_scheduled_meetups ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY hsm_self ON hookup_scheduled_meetups FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS pre_hookup_ramp_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hours_before_meetup INT NOT NULL,
  clip_kind TEXT NOT NULL CHECK (clip_kind IN ('imagery','mantra','muscle_memory_quick','future_self_playback','readiness_check','final_seal')),
  content TEXT NOT NULL,
  intensity INT NOT NULL CHECK (intensity BETWEEN 1 AND 5)
);
ALTER TABLE pre_hookup_ramp_clips ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY phrc_read_all ON pre_hookup_ramp_clips FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- 10 ramp clips + pre_hookup_ramp_eval cron (15-after-the-hour hourly).
