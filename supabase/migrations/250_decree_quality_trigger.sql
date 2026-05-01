-- 250 — centralized quality gate on handler_decrees inserts.
--
-- Bug continuation from 248/249: even after gating bridge_loopholes_to_confessions
-- and bridge_strategist_to_decrees, decrees were still landing from
-- auto-loophole-closer (LLM converts loophole.suggested_close → decree).
-- The LLM happily produced policy-proposal decrees the user can't fulfill
-- ("Effective immediately: (1) Decrees cannot be cancelled within 6 hours…",
-- "Any resistance statement or avoidance regarding HRT must be followed
-- by a direct, honest conversation with Gina within 24 hours…"). These
-- read as governance memos, not user tasks.
--
-- Fix: BEFORE INSERT trigger on handler_decrees that rejects edicts which
-- match feature-proposal or governance-memo patterns. Centralizes the gate
-- so any caller (existing or future) is blocked at the row level. Logs to
-- handler_directives so the rejection is auditable.
--
-- Cleanup: delete existing matching active decrees from auto-bridge
-- sources (loophole:%, strategist_plan:%, auto-%).

CREATE OR REPLACE FUNCTION public.gate_handler_decree_quality()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_lower text;
  v_first_word text;
BEGIN
  -- Skip the gate for manually-authored decrees (no trigger_source or
  -- explicit 'manual'/'user'/'handler_chat' source). The gate only
  -- protects against bridge-/automation-generated text.
  IF NEW.trigger_source IS NULL
     OR NEW.trigger_source IN ('manual', 'user', 'handler_chat')
  THEN
    RETURN NEW;
  END IF;

  v_lower := lower(COALESCE(NEW.edict, ''));
  v_first_word := lower(split_part(NEW.edict, ' ', 1));

  -- Reject feature-proposal verbs (system would do this, not the user)
  IF v_first_word IN ('auto-charge', 'auto', 'develop', 'implement', 'build',
                      'eliminate', 'integrate', 'establish', 'configure',
                      'enable', 'disable', 'deploy')
     OR v_lower LIKE 'auto-%'
     OR v_lower LIKE 'lock all %'
     OR v_lower LIKE 'set up a %'
     OR v_lower LIKE 'set up an %'
     OR v_lower LIKE 'create a system%'
     OR v_lower LIKE 'create an automation%'
     OR v_lower LIKE 'add a feature%'
     OR v_lower LIKE 'add an automation%'
     OR v_lower LIKE '%all app function%'
     OR v_lower LIKE '%reward system%'
     OR v_lower LIKE '%penalty cascade%'
     OR v_lower LIKE '%automation cascade%'
  -- Reject governance-memo / policy-proposal phrasings
     OR v_lower LIKE 'effective immediately%'
     OR v_lower LIKE 'going forward%'
     OR v_lower LIKE 'henceforth%'
     OR v_lower LIKE 'any resistance%'
     OR v_lower LIKE 'any cancellation%'
     OR v_lower LIKE 'any future %'
     OR v_lower LIKE 'all future %'
     OR v_lower LIKE 'no extensions or %'
     OR v_lower LIKE 'no exceptions %'
  THEN
    INSERT INTO handler_directives (user_id, action, target, value, reasoning, status)
    VALUES (
      NEW.user_id,
      'decree_rejected_by_quality_gate',
      LEFT(NEW.edict, 200),
      jsonb_build_object('trigger_source', NEW.trigger_source, 'edict', NEW.edict),
      'Decree text matched feature-proposal/governance-memo pattern; cannot be fulfilled by the user.',
      'logged'
    );
    RETURN NULL;  -- skip the insert
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gate_handler_decree_quality ON handler_decrees;
CREATE TRIGGER trg_gate_handler_decree_quality
  BEFORE INSERT ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION gate_handler_decree_quality();

-- Cleanup: drop existing active decrees that match the gate, scoped to
-- automation-bridged sources only.
DELETE FROM handler_decrees
WHERE status = 'active'
  AND (
    trigger_source LIKE 'strategist_plan:%'
    OR trigger_source LIKE 'loophole:%'
    OR trigger_source LIKE 'auto-%'
  )
  AND (
    lower(split_part(edict, ' ', 1)) IN (
      'auto-charge', 'auto', 'develop', 'implement', 'build',
      'eliminate', 'integrate', 'establish', 'configure', 'enable', 'disable', 'deploy'
    )
    OR lower(edict) LIKE 'auto-%'
    OR lower(edict) LIKE 'lock all %'
    OR lower(edict) LIKE 'set up a %'
    OR lower(edict) LIKE 'set up an %'
    OR lower(edict) LIKE 'create a system%'
    OR lower(edict) LIKE 'create an automation%'
    OR lower(edict) LIKE 'add a feature%'
    OR lower(edict) LIKE 'add an automation%'
    OR lower(edict) LIKE '%all app function%'
    OR lower(edict) LIKE '%reward system%'
    OR lower(edict) LIKE '%penalty cascade%'
    OR lower(edict) LIKE '%automation cascade%'
    OR lower(edict) LIKE 'effective immediately%'
    OR lower(edict) LIKE 'going forward%'
    OR lower(edict) LIKE 'henceforth%'
    OR lower(edict) LIKE 'any resistance%'
    OR lower(edict) LIKE 'any cancellation%'
    OR lower(edict) LIKE 'any future %'
    OR lower(edict) LIKE 'all future %'
    OR lower(edict) LIKE 'no extensions or %'
    OR lower(edict) LIKE 'no exceptions %'
  );
