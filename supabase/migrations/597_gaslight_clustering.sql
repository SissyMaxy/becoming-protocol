-- 597 — Gaslight memory clustering: fabricate witness consensus.
--
-- Wish 3b2e8147 (gap_audit, judge_rank 4 — highest deepen-impact): Mama
-- doesn't just plant one memory — she plants three related ones across a
-- week (seed → witness → reinforcement), then quotes all three back as
-- "everyone noticed". The girl experiences manufactured consensus that her
-- own memory is the outlier: "you've told Mama this three times now, and
-- Gina mentioned it too — this isn't a maybe anymore, this is who you are."
--
-- mommy-gaslight-cluster-author builds the 3-implant cluster (staggered
-- surface_after, mig 595); mommy-gaslight-cluster-deliver fires the
-- consensus outreach once the cluster is complete. Gated on the user's
-- gaslight opt-in (effective_gaslight_intensity != 'off') + safeword.

ALTER TABLE memory_implants ADD COLUMN IF NOT EXISTS cluster_id UUID;
ALTER TABLE memory_implants ADD COLUMN IF NOT EXISTS cluster_role TEXT
  CHECK (cluster_role IS NULL OR cluster_role IN ('seed', 'witness', 'reinforcement'));

CREATE INDEX IF NOT EXISTS memory_implants_cluster_idx ON memory_implants(cluster_id) WHERE cluster_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mommy_gaslight_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  seed_confession_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'delivered', 'cancelled')),
  deliver_after TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  consensus_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mommy_gaslight_clusters ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY mgc_self ON mommy_gaslight_clusters FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS mommy_gaslight_clusters_deliver_idx ON mommy_gaslight_clusters(status, deliver_after);

CREATE TABLE IF NOT EXISTS gaslight_cluster_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES mommy_gaslight_clusters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  outreach_id UUID,
  implant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  consensus_text TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE gaslight_cluster_delivery_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY gcdl_self ON gaslight_cluster_delivery_log FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Deliver cron: 13:20 UTC daily — fire any cluster whose week has elapsed.
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('mommy-gaslight-cluster-deliver-daily', 'mommy-gaslight-cluster-author-weekly');

  PERFORM cron.schedule('mommy-gaslight-cluster-deliver-daily', '20 13 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/mommy-gaslight-cluster-deliver', COALESCE(v_key, '')));

  -- Author cron: twice a week (Mon + Thu 18:00 UTC). The fn self-selects a
  -- recent confession theme and self-gates; most runs may no-op.
  PERFORM cron.schedule('mommy-gaslight-cluster-author-weekly', '0 18 * * 1,4', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/mommy-gaslight-cluster-author', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '597: gaslight cluster cron registration skipped: %', SQLERRM;
END $$;
