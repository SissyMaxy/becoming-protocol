-- 249 — quality gate on bridge_strategist_to_decrees, partner of 248.
--
-- Bug: same failure mode as bridge_loopholes_to_confessions. The strategist
-- generates `escalation_moves[].concrete_action` strings that are sometimes
-- feature proposals ("Auto-charge $50 per missed commitment", "Lock all
-- app functions behind voice verification", "Develop a reward system",
-- "Implement financial penalty cascade") rather than user-doable tasks.
-- These got piped into handler_decrees as journal_entry-proof tasks the
-- user can't fulfill — there's no way to "answer" "Auto-charge $50" by
-- writing a journal entry. Result: the Today screen filled with
-- unanswerable typed-response tasks.
--
-- Fix: bridge skips concrete_actions that read as system/feature
-- proposals. Heuristic: starts with system-verb prefix (Auto-, Lock all,
-- Develop, Implement, Build, Eliminate, Integrate, Establish, Set up,
-- Create a system, Add a feature), or contains feature-machinery phrases
-- (app function, reward system, penalty cascade, automation). Strategist
-- prompt is also tightened (separate edge-fn deploy) to require
-- user-doable concrete_action — this gate is the defensive backstop.
--
-- Cleanup: also delete existing decrees that match the gate, scoped to
-- decrees triggered by a strategic plan (preserve manual/legitimate
-- decrees from other paths).

CREATE OR REPLACE FUNCTION public.bridge_strategist_to_decrees(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_plan_id uuid;
  v_moves jsonb;
  v_move jsonb;
  v_inserted int := 0;
  v_trigger_source text;
  v_existing int;
  v_action text;
  v_lower text;
  v_first_word text;
BEGIN
  SELECT id, escalation_moves INTO v_plan_id, v_moves
  FROM handler_strategic_plans
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_plan_id IS NULL THEN RETURN 0; END IF;

  FOR v_move IN SELECT * FROM jsonb_array_elements(v_moves)
  LOOP
    v_action := trim(COALESCE(v_move->>'concrete_action', v_move->>'title', ''));
    IF v_action = '' THEN CONTINUE; END IF;

    v_lower := lower(v_action);
    v_first_word := lower(split_part(v_action, ' ', 1));

    -- Quality gate: skip strategist outputs that propose protocol
    -- features/automation rather than user-doable actions. Cannot be
    -- "fulfilled" with a journal entry.
    IF v_first_word IN ('auto-charge', 'auto', 'develop', 'implement', 'build', 'eliminate', 'integrate', 'establish')
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
    THEN
      CONTINUE;
    END IF;

    v_trigger_source := format('strategist_plan:%s:%s', v_plan_id, md5(v_move->>'title'));

    SELECT COUNT(*) INTO v_existing
    FROM handler_decrees
    WHERE user_id = p_user_id AND trigger_source = v_trigger_source;
    IF v_existing > 0 THEN CONTINUE; END IF;

    INSERT INTO handler_decrees (
      user_id, edict, proof_type, deadline, consequence, reasoning,
      trigger_source, status
    ) VALUES (
      p_user_id, v_action, 'journal_entry',
      now() + interval '5 days',
      'Slip points if you do not.',
      'The Handler picked this as the next move because it is the highest-leverage thing you have been avoiding. 5 days.',
      v_trigger_source, 'active'
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- Cleanup: drop existing decrees that the new gate would have rejected,
-- but only those bridged from a strategist plan (trigger_source format).
DELETE FROM handler_decrees
WHERE status = 'active'
  AND trigger_source LIKE 'strategist_plan:%'
  AND (
    lower(split_part(edict, ' ', 1)) IN ('auto-charge', 'auto', 'develop', 'implement', 'build', 'eliminate', 'integrate', 'establish')
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
  );
