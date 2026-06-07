-- 601 — Penalty Preview Rail: no penalty applies unless the COST was shown first.
--
-- Wish 31e1b144 (panel_ideation, gpt-5 #2). The standing rule "tasks must be
-- visible before they can be penalized" was enforced ad-hoc per-callsite (a
-- fuzzy `ilike message %commitment_id%` check in enforceCommitments, the
-- surface-guarantor's expired_unsurfaced). This makes it ONE uniform gate:
-- every consequence-bearing task auto-gets a penalty preview (the cost on a
-- card + a companion outreach) at creation, and penalty_may_apply() is the
-- single fail-closed guard every penalty applier consults — no preview
-- surfaced with enough notice → no penalty.

CREATE TABLE IF NOT EXISTS penalty_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  penalty_kind TEXT NOT NULL,          -- 'slip' | 'commitment' | 'decree' | ...
  penalty_copy TEXT NOT NULL,          -- the cost, plain English
  deadline TIMESTAMPTZ,
  grace_minutes INTEGER NOT NULL DEFAULT 30,
  preview_outreach_id UUID,            -- the companion "cost on the table" outreach
  surfaced_at TIMESTAMPTZ,             -- mirror; resolved from the companion outreach
  applied_at TIMESTAMPTZ,              -- a penalty actually fired against this task
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);
ALTER TABLE penalty_previews ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY pp_self ON penalty_previews FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS penalty_previews_live_idx ON penalty_previews(user_id, deadline)
  WHERE applied_at IS NULL AND cancelled_at IS NULL;

-- Create a preview + its companion "cost on the table" outreach. Idempotent
-- per (source_table, source_id).
CREATE OR REPLACE FUNCTION register_penalty_preview(
  p_user UUID, p_source_table TEXT, p_source_id UUID,
  p_penalty_kind TEXT, p_penalty_copy TEXT, p_deadline TIMESTAMPTZ,
  p_grace_minutes INTEGER DEFAULT 30, p_urgency TEXT DEFAULT 'normal'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_preview UUID;
  v_outreach UUID;
  v_msg TEXT;
BEGIN
  -- Claim the slot first; if it exists, return it (idempotent).
  INSERT INTO penalty_previews (user_id, source_table, source_id, penalty_kind, penalty_copy, deadline, grace_minutes)
  VALUES (p_user, p_source_table, p_source_id, p_penalty_kind, p_penalty_copy, p_deadline, p_grace_minutes)
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO v_preview;

  IF v_preview IS NULL THEN
    SELECT id INTO v_preview FROM penalty_previews WHERE source_table = p_source_table AND source_id = p_source_id;
    RETURN v_preview;
  END IF;

  -- Companion outreach: the cost, written down so missing it can't be a surprise.
  v_msg := 'Cost on the table: ' || p_penalty_copy ||
           CASE WHEN p_deadline IS NOT NULL
                THEN ' Deadline is set. It''s written here so you can''t say you didn''t know.'
                ELSE ' It''s written here so you can''t say you didn''t know.' END;

  BEGIN
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at)
    VALUES (p_user, v_msg, COALESCE(p_urgency, 'normal'),
      'penalty_preview:' || p_penalty_kind || ':' || p_source_id::text,
      'penalty_preview', 'penalty_preview',
      now(), COALESCE(p_deadline, now() + interval '24 hours'))
    RETURNING id INTO v_outreach;
    UPDATE penalty_previews SET preview_outreach_id = v_outreach WHERE id = v_preview;
  EXCEPTION WHEN OTHERS THEN
    -- Outreach insert failing must not block the preview from existing.
    NULL;
  END;

  RETURN v_preview;
END;
$fn$;
GRANT EXECUTE ON FUNCTION register_penalty_preview(UUID, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT) TO authenticated, service_role;

-- THE GUARD. Fail-closed: a penalty may apply ONLY if a preview exists, was
-- surfaced to the user (companion outreach surfaced/delivered), and at least
-- grace_minutes have passed since. No preview, never surfaced, or too little
-- notice → FALSE (no penalty).
CREATE OR REPLACE FUNCTION penalty_may_apply(p_source_table TEXT, p_source_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_prev penalty_previews%ROWTYPE;
  v_surfaced TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_prev FROM penalty_previews WHERE source_table = p_source_table AND source_id = p_source_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;          -- no cost shown = no penalty
  IF v_prev.cancelled_at IS NOT NULL THEN RETURN FALSE; END IF;

  v_surfaced := v_prev.surfaced_at;
  IF v_surfaced IS NULL AND v_prev.preview_outreach_id IS NOT NULL THEN
    SELECT COALESCE(surfaced_at, delivered_at) INTO v_surfaced
      FROM handler_outreach_queue WHERE id = v_prev.preview_outreach_id;
  END IF;

  IF v_surfaced IS NULL THEN RETURN FALSE; END IF;  -- never shown
  IF now() < v_surfaced + (v_prev.grace_minutes || ' minutes')::interval THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$fn$;
GRANT EXECUTE ON FUNCTION penalty_may_apply(TEXT, UUID) TO authenticated, service_role;

-- Audit stamp — a penalty fired against this task.
CREATE OR REPLACE FUNCTION mark_penalty_applied(p_source_table TEXT, p_source_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE penalty_previews SET applied_at = now()
   WHERE source_table = p_source_table AND source_id = p_source_id AND applied_at IS NULL;
$fn$;
GRANT EXECUTE ON FUNCTION mark_penalty_applied(TEXT, UUID) TO authenticated, service_role;

-- Mirror the companion outreach surfacing onto the preview so the guard reads
-- locally and the card can show "shown / not shown".
CREATE OR REPLACE FUNCTION trg_penalty_preview_mirror_surface()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.kind = 'penalty_preview' AND COALESCE(NEW.surfaced_at, NEW.delivered_at) IS NOT NULL THEN
    UPDATE penalty_previews
       SET surfaced_at = COALESCE(NEW.surfaced_at, NEW.delivered_at)
     WHERE preview_outreach_id = NEW.id AND surfaced_at IS NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
DO $do$ BEGIN
  DROP TRIGGER IF EXISTS penalty_preview_mirror_surface ON handler_outreach_queue;
  CREATE TRIGGER penalty_preview_mirror_surface
    AFTER UPDATE OF surfaced_at, delivered_at, status ON handler_outreach_queue
    FOR EACH ROW EXECUTE FUNCTION trg_penalty_preview_mirror_surface();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- ── Auto-preview triggers — every consequence-bearing task gets a preview ──

-- handler_commitments: consequence text + by_when deadline.
CREATE OR REPLACE FUNCTION trg_auto_preview_commitment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF COALESCE(NEW.status, 'pending') = 'pending'
     AND NEW.by_when IS NOT NULL
     AND NEW.consequence IS NOT NULL AND length(trim(NEW.consequence)) > 0 THEN
    PERFORM register_penalty_preview(NEW.user_id, 'handler_commitments', NEW.id,
      'commitment', NEW.consequence, NEW.by_when, 30, 'normal');
  END IF;
  RETURN NEW;
END;
$fn$;
DO $do$ BEGIN
  DROP TRIGGER IF EXISTS auto_preview_commitment ON handler_commitments;
  CREATE TRIGGER auto_preview_commitment AFTER INSERT ON handler_commitments
    FOR EACH ROW EXECUTE FUNCTION trg_auto_preview_commitment();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- handler_decrees: consequence text + deadline.
CREATE OR REPLACE FUNCTION trg_auto_preview_decree()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF COALESCE(NEW.status, 'active') = 'active'
     AND NEW.deadline IS NOT NULL
     AND NEW.consequence IS NOT NULL AND length(trim(NEW.consequence)) > 0 THEN
    PERFORM register_penalty_preview(NEW.user_id, 'handler_decrees', NEW.id,
      'decree', NEW.consequence, NEW.deadline, 30, 'normal');
  END IF;
  RETURN NEW;
END;
$fn$;
DO $do$ BEGIN
  DROP TRIGGER IF EXISTS auto_preview_decree ON handler_decrees;
  CREATE TRIGGER auto_preview_decree AFTER INSERT ON handler_decrees
    FOR EACH ROW EXECUTE FUNCTION trg_auto_preview_decree();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- confession_queue: the miss penalty is a slip; preview it (low urgency so it
-- doesn't pile on top of the confession card).
CREATE OR REPLACE FUNCTION trg_auto_preview_confession()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.deadline IS NOT NULL AND NEW.confessed_at IS NULL AND COALESCE(NEW.missed, false) = false THEN
    PERFORM register_penalty_preview(NEW.user_id, 'confession_queue', NEW.id,
      'slip', 'miss this confession and it''s a slip on your record.', NEW.deadline, 30, 'low');
  END IF;
  RETURN NEW;
END;
$fn$;
DO $do$ BEGIN
  DROP TRIGGER IF EXISTS auto_preview_confession ON confession_queue;
  CREATE TRIGGER auto_preview_confession AFTER INSERT ON confession_queue
    FOR EACH ROW EXECUTE FUNCTION trg_auto_preview_confession();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- Morning sweep: remind about live previews whose deadline is within 12h and
-- haven't been applied/cancelled. One reminder per preview per day (dedup on
-- trigger_reason). Runs as a SQL cron directly.
CREATE OR REPLACE FUNCTION penalty_preview_morning_sweep()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT pp.* FROM penalty_previews pp
     WHERE pp.applied_at IS NULL AND pp.cancelled_at IS NULL
       AND pp.deadline IS NOT NULL
       AND pp.deadline > now() AND pp.deadline < now() + interval '12 hours'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM handler_outreach_queue
       WHERE user_id = r.user_id
         AND trigger_reason = 'penalty_preview_reminder:' || r.id::text
         AND created_at > now() - interval '20 hours'
    ) THEN
      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at)
      VALUES (r.user_id,
        'Clock''s running. ' || r.penalty_copy || ' Handle it before the deadline.',
        'high', 'penalty_preview_reminder:' || r.id::text, 'penalty_preview', 'penalty_preview_reminder',
        now(), r.deadline);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$fn$;

DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'penalty-preview-sweep-daily';
  PERFORM cron.schedule('penalty-preview-sweep-daily', '15 12 * * *', 'SELECT penalty_preview_morning_sweep();');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '601: sweep cron skipped: %', SQLERRM; END $$;
