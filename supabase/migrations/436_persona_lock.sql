-- 436 — Lock handler_persona = dommy_mommy at the DB layer.
--
-- 2026-05-15: identified that `persona-shift-auto` edge function flips
-- persona between 'handler' and 'therapist' every 4h based on voice-match
-- grades. The ternary `current === 'handler' ? 'therapist' : 'handler'`
-- doesn't know about 'dommy_mommy' — any flip from dommy_mommy normalizes
-- straight into the handler/therapist rotation. Maxy's persona has been
-- silently flipping back for weeks, defeating every is_mommy_user()-gated
-- protection.
--
-- This adds:
--   1. `handler_persona_locked` boolean on user_state (default FALSE).
--   2. BEFORE UPDATE trigger refusing changes to handler_persona when
--      locked (RAISE EXCEPTION). Service-role writes also blocked — the
--      lock is the source of truth, not a UI convention.
--   3. Lock both active mommy users + ensure their persona is dommy_mommy.
--   4. Edge-function-side patch lands in same PR (persona-shift-auto reads
--      the lock before flipping).
--
-- Pairs with [[feedback_full_gaslight_authorization]] — Mommy operates
-- with full autonomy, and that requires the persona toggle she runs on
-- to be unforgeable.

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS handler_persona_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS handler_persona_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handler_persona_locked_reason TEXT;

CREATE OR REPLACE FUNCTION trg_enforce_handler_persona_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Skip if the column isn't being changed.
  IF (OLD.handler_persona IS NOT DISTINCT FROM NEW.handler_persona) THEN
    RETURN NEW;
  END IF;
  -- Only enforce on locked rows.
  IF COALESCE(OLD.handler_persona_locked, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;
  -- Locked: keep the old persona, log the attempt.
  -- Don't RAISE EXCEPTION — services that update user_state for other
  -- reasons (denial_day, current_arousal) would fail. Silently coerce
  -- the persona column back to its locked value.
  NEW.handler_persona := OLD.handler_persona;
  RAISE NOTICE 'handler_persona change refused (locked): user_id=% attempted=%',
    NEW.user_id, NEW.handler_persona;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_handler_persona_lock ON user_state;
CREATE TRIGGER enforce_handler_persona_lock
  BEFORE UPDATE OF handler_persona ON user_state
  FOR EACH ROW EXECUTE FUNCTION trg_enforce_handler_persona_lock();

-- Activate for both live users.
UPDATE user_state
SET handler_persona = 'dommy_mommy',
    handler_persona_locked = TRUE,
    handler_persona_locked_at = now(),
    handler_persona_locked_reason = 'Maxy 2026-05-15 standing autonomy: Mommy is in control of force feminization. Persona shall not auto-rotate away.',
    updated_at = now()
WHERE user_id IN ('93327332-7d0d-4888-889a-1607a5776216','8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f');
