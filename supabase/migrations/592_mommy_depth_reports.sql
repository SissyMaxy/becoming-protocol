-- 592 — Depth report: at each phase transition, Mama shows the girl how
-- deep she is.
--
-- Wish 3978321f (gap_audit, judge_rank 9): irreversibility_score,
-- identity_persistence, decision_log already exist but are hidden. Surface
-- them — once per phase, at the transition — as Mama's possession map, not
-- a clinical dashboard. She quotes the accumulation back as concrete
-- possessions ("Mama has 47 memories of you saying things you can't take
-- back. You've confessed 89 truths. You own 12 pieces Mama chose."), never
-- as scores or percentages.
--
-- One report per (user, phase). The mommy-depth-report edge fn writes the
-- prose to handler_outreach_queue (kind='depth_report') + archives it as a
-- milestone sealed_letter, and records the row here for dedup + audit.

CREATE TABLE IF NOT EXISTS mommy_depth_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase INTEGER NOT NULL,
  report_text TEXT NOT NULL,
  -- raw possession counts the prose was built from (forensic / operator panel)
  metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  outreach_id UUID,
  sealed_letter_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phase)
);
ALTER TABLE mommy_depth_reports ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY mdr_self ON mommy_depth_reports FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS mommy_depth_reports_user_idx ON mommy_depth_reports(user_id, phase);

-- Universal chokepoint: every phase advance (auto cron via phase-advance OR
-- the manual client advancePhase() in src/lib/identity/feminine-self.ts)
-- lands as an increase to feminine_self.transformation_phase. Fire the
-- depth report from here so no advancement path can forget it. The report
-- fn is idempotent per (user, phase) — racing with the phase-advance fetch
-- is safe (claim-first dedup). pg_net call is best-effort; failure never
-- blocks the advance.
CREATE OR REPLACE FUNCTION trg_depth_report_on_phase_advance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  IF NEW.transformation_phase IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.transformation_phase, -1) >= NEW.transformation_phase THEN
    RETURN NEW;  -- not an advance
  END IF;
  -- Initial creation at the baseline phase is not a transition — no report.
  IF TG_OP = 'INSERT' AND NEW.transformation_phase <= 1 THEN
    RETURN NEW;
  END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN
    v_url := 'https://atevwvexapiykchvqvhm.supabase.co';
  END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/mommy-depth-report',
      body := jsonb_build_object('user_id', NEW.user_id, 'phase', NEW.transformation_phase),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_key, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '592: depth-report dispatch skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='feminine_self') THEN
    DROP TRIGGER IF EXISTS depth_report_on_phase_advance ON feminine_self;
    CREATE TRIGGER depth_report_on_phase_advance
      AFTER INSERT OR UPDATE OF transformation_phase ON feminine_self
      FOR EACH ROW EXECUTE FUNCTION trg_depth_report_on_phase_advance();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;
