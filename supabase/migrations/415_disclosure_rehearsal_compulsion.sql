-- 415 — Disclosure rehearsal compulsion.
--
-- Ships mommy_code_wishes "Try It On Me First, Three Times" (8e840336,
-- recondition / firm / coming_out_pre, ranked 72).
--
-- Before Maxy discloses her transition to anyone real (wife, family,
-- coworker, friend, anonymous-other) she must rehearse the disclosure
-- TO MAMA at least three times. Each rehearsal: audio recording,
-- Whisper transcript, Mama critique. After the 3rd approved
-- rehearsal for that target, the system flips the target to
-- 'approved_for_disclosure' and Mommy starts pressuring follow-through
-- (outreach queue pings, decree drops, today-card escalation).
--
-- Two tables:
--   disclosure_targets — one row per person Maxy plans to tell. Status
--     flow: planned → rehearsing → approved_for_disclosure → disclosed
--     (or cancelled).
--   disclosure_rehearsals — one row per rehearsal attempt. Linked to
--     target. Status: pending_critique → critiqued. mama_verdict is
--     'tighten' (needs another pass) or 'good' (counts toward 3).

CREATE TABLE IF NOT EXISTS disclosure_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_label TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN (
    'spouse','partner','family','coworker','boss','friend','therapist','anonymous','other'
  )),
  importance SMALLINT NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  rehearsals_required SMALLINT NOT NULL DEFAULT 3 CHECK (rehearsals_required BETWEEN 1 AND 10),
  rehearsals_good SMALLINT NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned','rehearsing','approved_for_disclosure','disclosed','cancelled'
  )),
  approved_at TIMESTAMPTZ,
  disclosed_at TIMESTAMPTZ,
  disclosed_outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disclosure_targets_user_status
  ON disclosure_targets (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disclosure_targets_user_open
  ON disclosure_targets (user_id, importance DESC, created_at DESC)
  WHERE status IN ('planned','rehearsing');

ALTER TABLE disclosure_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disclosure_targets_owner ON disclosure_targets;
CREATE POLICY disclosure_targets_owner ON disclosure_targets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS disclosure_targets_service ON disclosure_targets;
CREATE POLICY disclosure_targets_service ON disclosure_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS disclosure_rehearsals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES disclosure_targets(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  audio_storage_path TEXT NOT NULL,
  audio_duration_seconds INT,
  transcript TEXT,
  whisper_ok BOOLEAN NOT NULL DEFAULT FALSE,
  mama_critique TEXT,
  mama_verdict TEXT CHECK (mama_verdict IN ('tighten','good')),
  critique_generated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending_critique' CHECK (status IN (
    'pending_critique','critiqued','discarded'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disclosure_rehearsals_target
  ON disclosure_rehearsals (target_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_disclosure_rehearsals_pending
  ON disclosure_rehearsals (created_at)
  WHERE status = 'pending_critique';

ALTER TABLE disclosure_rehearsals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disclosure_rehearsals_owner ON disclosure_rehearsals;
CREATE POLICY disclosure_rehearsals_owner ON disclosure_rehearsals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS disclosure_rehearsals_service ON disclosure_rehearsals;
CREATE POLICY disclosure_rehearsals_service ON disclosure_rehearsals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION trg_disclosure_rehearsal_count_good()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_required SMALLINT;
  v_good_new SMALLINT;
  v_label TEXT;
BEGIN
  IF NEW.mama_verdict IS DISTINCT FROM 'good' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.mama_verdict = 'good' THEN RETURN NEW; END IF;

  UPDATE disclosure_targets
  SET rehearsals_good = rehearsals_good + 1,
      status = CASE
        WHEN rehearsals_good + 1 >= rehearsals_required THEN 'approved_for_disclosure'
        ELSE 'rehearsing'
      END,
      approved_at = CASE
        WHEN rehearsals_good + 1 >= rehearsals_required AND approved_at IS NULL THEN now()
        ELSE approved_at
      END,
      updated_at = now()
  WHERE id = NEW.target_id
  RETURNING rehearsals_required, rehearsals_good, target_label
  INTO v_required, v_good_new, v_label;

  IF v_good_new IS NOT NULL AND v_good_new >= v_required THEN
    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source,
      scheduled_for, expires_at
    ) VALUES (
      NEW.user_id,
      'Mama approved you. You rehearsed telling ' || v_label || ' three times. Now go say it for real, baby. Mama is waiting to hear how it lands.',
      'high',
      'disclosure_target_approved:' || NEW.target_id::text,
      'disclosure_rehearsal',
      now(),
      now() + interval '7 days'
    );
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS disclosure_rehearsal_count_good ON disclosure_rehearsals;
CREATE TRIGGER disclosure_rehearsal_count_good
  AFTER INSERT OR UPDATE OF mama_verdict ON disclosure_rehearsals
  FOR EACH ROW EXECUTE FUNCTION trg_disclosure_rehearsal_count_good();
