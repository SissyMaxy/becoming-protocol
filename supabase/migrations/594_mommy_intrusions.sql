-- 594 — Mommy intrusion check-ins: unpredictable proof-of-state.
--
-- Wish c7d35e7b (gap_audit, judge_rank 7): Mama doesn't only prompt on a
-- schedule — she intrudes. Random waking-hour moments: "Where are you right
-- now, baby? What are you wearing? Where are your hands?" The girl has 10
-- minutes to answer with text or photo. Miss the window → logged as evasion,
-- shifts Mama's mood to 'watching' and the next reach references it. Phase
-- 4+, firm/relentless band, 1-2x per week. The feeling: Mama is always able
-- to reach in.

CREATE TABLE IF NOT EXISTS mommy_intrusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intrusion_type TEXT NOT NULL DEFAULT 'proof_of_state',
  question_text TEXT NOT NULL,
  response_text TEXT,
  response_photo_url TEXT,           -- storage object path (verification-photos)
  scheduled_for TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  evaded BOOLEAN NOT NULL DEFAULT FALSE,
  evasion_handled_at TIMESTAMPTZ,     -- when the "you went quiet" follow-up fired
  outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mommy_intrusions ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY mi_self ON mommy_intrusions FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS mommy_intrusions_user_idx ON mommy_intrusions(user_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS mommy_intrusions_open_idx ON mommy_intrusions(user_id, responded_at, evaded)
  WHERE responded_at IS NULL AND evaded = FALSE;

-- Schedule cron: 11:50 UTC daily. The fn self-gates (phase/band/pause/
-- weekly-cap) and sweeps the prior day's missed windows for evasion.
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mommy-intrusion-schedule-daily';

  PERFORM cron.schedule('mommy-intrusion-schedule-daily', '50 11 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/mommy-intrusion-schedule', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '594: intrusion cron registration skipped: %', SQLERRM;
END $$;
