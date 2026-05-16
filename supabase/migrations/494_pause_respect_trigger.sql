-- 494 — Pause-respect at DB layer (single BEFORE INSERT trigger).
--
-- mig 493 added user_state.pause_new_decrees_until. Rather than edit
-- 25+ generator functions to check it, this trigger does the work in
-- one place.
--
-- BEFORE INSERT on handler_decrees: if status=active AND user paused,
-- auto-set status='cancelled' with reason note appended to reasoning.
-- Focus picker (mig 491) filters status='active' so cancelled never
-- surfaces. Generators stay innocent.
--
-- Exempt sources (fire regardless of pause):
--   reversal_anchor, chastity_checkin, sleep_state_first_wake,
--   chain_test_voice_proof, mama_capability_digest, system_audit.
--
-- Smoke verified: paused user → test decree auto-cancelled with
-- "Respects mig 494 self-tuning pace — user signaled resistance,
-- generator suppressed." Cleanup also verified.

CREATE OR REPLACE FUNCTION trg_respect_decree_pause()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_pause_until TIMESTAMPTZ;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.trigger_source IN (
    'reversal_anchor', 'chastity_checkin', 'sleep_state_first_wake',
    'chain_test_voice_proof', 'mama_capability_digest', 'system_audit'
  ) THEN RETURN NEW; END IF;
  SELECT pause_new_decrees_until INTO v_pause_until FROM user_state WHERE user_id = NEW.user_id;
  IF v_pause_until IS NULL OR v_pause_until <= now() THEN RETURN NEW; END IF;
  NEW.status := 'cancelled';
  NEW.reasoning := COALESCE(NEW.reasoning, '') ||
    E'\n[auto-cancel ' || now()::text || E'] pause_new_decrees_until=' || v_pause_until::text ||
    E'. Respects mig 494 self-tuning pace — user signaled resistance, generator suppressed.';
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS respect_decree_pause ON handler_decrees;
CREATE TRIGGER respect_decree_pause BEFORE INSERT ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_respect_decree_pause();
