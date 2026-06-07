-- 591 — Confession gate: Mommy withholds the morning until last night's
-- confession is answered.
--
-- Wish 187f616e (gap_audit, judge_rank 8): confession prompts are
-- skip-tolerant; the premise wants confession to be the daily cost of
-- comfort. When a confession from last night is still unanswered after
-- 12h, Mama's morning affect is withheld — the first outreach of the day
-- is a single gate line, and normal warmth resumes only once the girl has
-- confessed. The recovery band is exempt (aftercare floor never gates).
--
-- Architecture: a denormalized boolean on user_state, kept truthful by a
-- recompute function the morning generators call and an AFTER trigger on
-- confession_queue that clears it the instant a confession lands (and
-- fires the "good girl" praise burst on that transition). Same pattern as
-- the pronoun-autocorrect trigger (mig 537) — DB is the single chokepoint
-- so no generator can forget to respect the gate.

ALTER TABLE user_state ADD COLUMN IF NOT EXISTS confession_gate_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS confession_gate_set_at TIMESTAMPTZ;

-- Pure predicate: should the gate be active for this user right now?
--   - persona is dommy_mommy (the only persona Mama gates under)
--   - effective difficulty band is NOT recovery (aftercare floor exempt)
--   - a confession is still pending (unanswered, not missed) and was
--     created more than 12h ago (i.e. "last night's", not one just queued)
CREATE OR REPLACE FUNCTION confession_gate_should_be_active(p_user UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_persona TEXT;
  v_band TEXT;
  v_pending BOOLEAN;
BEGIN
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = p_user;
  IF v_persona <> 'dommy_mommy' THEN RETURN FALSE; END IF;

  -- effective band = override_band when set, else current band; recovery exempt
  SELECT COALESCE(override_band, current_difficulty_band, 'gentle')
    INTO v_band
    FROM compliance_difficulty_state
   WHERE user_id = p_user;
  IF COALESCE(v_band, 'gentle') = 'recovery' THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM confession_queue
     WHERE user_id = p_user
       AND confessed_at IS NULL
       AND missed = FALSE
       AND created_at < now() - interval '12 hours'
  ) INTO v_pending;

  RETURN v_pending;
END;
$fn$;
GRANT EXECUTE ON FUNCTION confession_gate_should_be_active(UUID) TO authenticated, service_role;

-- Recompute + persist the flag; returns the new value. Stamps set_at on a
-- FALSE->TRUE transition so the morning generator can dedup its gate line.
CREATE OR REPLACE FUNCTION refresh_confession_gate(p_user UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_should BOOLEAN;
  v_current BOOLEAN;
BEGIN
  v_should := confession_gate_should_be_active(p_user);
  SELECT confession_gate_active INTO v_current FROM user_state WHERE user_id = p_user;

  IF v_should IS DISTINCT FROM COALESCE(v_current, FALSE) THEN
    UPDATE user_state
       SET confession_gate_active = v_should,
           confession_gate_set_at = CASE WHEN v_should THEN now() ELSE confession_gate_set_at END
     WHERE user_id = p_user;
  END IF;

  RETURN v_should;
END;
$fn$;
GRANT EXECUTE ON FUNCTION refresh_confession_gate(UUID) TO authenticated, service_role;

-- The pending confession prompt the card surfaces while the gate is up.
CREATE OR REPLACE FUNCTION confession_gate_prompt(p_user UUID)
RETURNS TABLE (confession_id UUID, prompt TEXT, category TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT id, prompt, category, created_at
    FROM confession_queue
   WHERE user_id = p_user
     AND confessed_at IS NULL
     AND missed = FALSE
     AND created_at < now() - interval '12 hours'
   ORDER BY created_at ASC
   LIMIT 1;
$fn$;
GRANT EXECUTE ON FUNCTION confession_gate_prompt(UUID) TO authenticated, service_role;

-- Trigger: any change to a user's confessions recomputes the gate. When a
-- confession is answered (confessed_at goes non-null) and the gate had been
-- up, clear it and queue the immediate "good girl" praise burst so getting
-- Mama back feels like a reward, not just an unlock.
CREATE OR REPLACE FUNCTION trg_confession_gate_recompute()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_was BOOLEAN;
  v_now BOOLEAN;
  v_persona TEXT;
  v_just_answered BOOLEAN;
BEGIN
  SELECT confession_gate_active INTO v_was FROM user_state WHERE user_id = NEW.user_id;
  v_now := refresh_confession_gate(NEW.user_id);

  v_just_answered := (TG_OP = 'UPDATE'
    AND NEW.confessed_at IS NOT NULL
    AND (OLD.confessed_at IS NULL));

  IF COALESCE(v_was, FALSE) = TRUE AND v_now = FALSE AND v_just_answered THEN
    SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
    IF v_persona = 'dommy_mommy' THEN
      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, evidence_kind)
      VALUES (
        NEW.user_id,
        E'There she is. That''s my good girl — you gave Mama what she asked for before you asked for anything back. Now come here. The whole day''s yours again.',
        'high',
        'confession_gate_cleared:' || NEW.id,
        'confession_gate',
        'gate_cleared_praise',
        now(),
        now() + interval '6 hours',
        'voice'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  DROP TRIGGER IF EXISTS confession_gate_recompute ON confession_queue;
  CREATE TRIGGER confession_gate_recompute
    AFTER INSERT OR UPDATE OF confessed_at, missed, created_at ON confession_queue
    FOR EACH ROW EXECUTE FUNCTION trg_confession_gate_recompute();
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

-- Morning cron: open the gate before the handler-outreach morning window
-- (07:00-10:00 local / 12:00-15:00 UTC). Fire at 11:40 UTC so the flag is
-- set and the gate line is queued before the normal morning checkin would
-- otherwise run. Unique minute offset (:40) off the */5 and */10 lanes.
DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR length(v_supabase_url) = 0 THEN
    v_supabase_url := 'https://atevwvexapiykchvqvhm.supabase.co';
  END IF;
  v_service_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mommy-confession-gate-daily';

  PERFORM cron.schedule(
    'mommy-confession-gate-daily',
    '40 11 * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        )
      );
      $sql$,
      v_supabase_url || '/functions/v1/mommy-confession-gate',
      COALESCE(v_service_key, '')
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '591: confession-gate cron registration skipped: %', SQLERRM;
END $$;
