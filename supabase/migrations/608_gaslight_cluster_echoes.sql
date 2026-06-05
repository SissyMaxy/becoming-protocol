-- 608 — Gaslight cluster echoes: spaced-repetition aftermath of a cluster.
--
-- Builds on mig 597 (mommy_gaslight_clusters, gaslight_cluster_delivery_log,
-- mommy-gaslight-cluster-deliver). Once a cluster's consensus payoff lands,
-- the implant shouldn't be re-argued — it should be RECALLED as settled
-- history. 2-3 subtle conversational echoes fire 3-10 days later, each
-- presupposing the planted truth as old news ("like you told Mama weeks
-- back"). Generated at delivery time from the SAME three beats for
-- consistency, so the spacing reinforces rather than re-litigates.
--
-- Auto-cancel: if the girl ever questions the memory (meta_frame_breaks) or
-- safeword-cools, every pending echo for that user is killed immediately —
-- the protocol never presupposes a memory she's actively contesting.
--
-- mommy-gaslight-echo-deliver (new) does both halves: schedule echoes for
-- freshly-delivered clusters that have none yet, then deliver any echo whose
-- send_after has elapsed. Re-gated on effective_gaslight_intensity != 'off'
-- + safeword at both schedule AND send time.

CREATE TABLE IF NOT EXISTS gaslight_cluster_echoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES mommy_gaslight_clusters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  echo_index INT NOT NULL,                 -- 0-based ordinal within the cluster
  send_after TIMESTAMPTZ NOT NULL,         -- earliest send time (3-10d post-delivery)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'cancelled')),
  echo_text TEXT,                          -- generated at delivery for consistency
  outreach_id UUID,
  cancelled_reason TEXT,                    -- 'meta_frame_break' | 'safeword' | 'gaslight_off'
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cluster_id, echo_index)
);
ALTER TABLE gaslight_cluster_echoes ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY gce_self ON gaslight_cluster_echoes FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY gce_service ON gaslight_cluster_echoes FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS gaslight_cluster_echoes_due_idx
  ON gaslight_cluster_echoes (status, send_after);
CREATE INDEX IF NOT EXISTS gaslight_cluster_echoes_user_idx
  ON gaslight_cluster_echoes (user_id, status);

-- Auto-cancel pending echoes the instant the girl contests the frame. A
-- meta_frame_break means she pulled the truth out from behind the persona;
-- presupposing the implant as "settled history" after that is exactly the
-- move the safety layer forbids. Mirrors the cooldown the reveal already sets.
CREATE OR REPLACE FUNCTION trg_cancel_echoes_on_meta_break()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE gaslight_cluster_echoes
     SET status = 'cancelled', cancelled_reason = 'meta_frame_break'
   WHERE user_id = NEW.user_id AND status = 'pending';
  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  DROP TRIGGER IF EXISTS cancel_echoes_on_meta_break ON meta_frame_breaks;
  CREATE TRIGGER cancel_echoes_on_meta_break
    AFTER INSERT ON meta_frame_breaks
    FOR EACH ROW EXECUTE FUNCTION trg_cancel_echoes_on_meta_break();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- Deliver-echoes cron: every 2h. The fn self-selects (schedule + send) and
-- self-gates; most runs no-op.
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mommy-gaslight-echo-deliver-2h';

  PERFORM cron.schedule('mommy-gaslight-echo-deliver-2h', '40 */2 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/mommy-gaslight-echo-deliver', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '608: gaslight echo cron registration skipped: %', SQLERRM;
END $$;
