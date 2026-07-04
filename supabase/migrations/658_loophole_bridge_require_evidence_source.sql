-- 658 — bridge_loopholes_to_confessions now REQUIRES a grounded evidence_source.
--
-- The mig-248 gate only rejected audit-memo PHRASING. It could not catch a
-- fabricated-but-first-person stat like "You skipped voice drills 4 of the last
-- 7 days. All 4 misses fell on weekends" — which reads as a real behavior and
-- sailed through, guilt-tripping the user with a statistic that never happened.
--
-- Structural fix: the strategist prompt now emits an `evidence_source` per
-- loophole (the exact snapshot field+value it's derived from), and this bridge
-- REFUSES to build a confession from any loophole whose evidence_source is
-- missing or trivial. No named data source => the claim is not grounded => it
-- never reaches her as a confession. Belt (prompt) + suspenders (this gate).
--
-- Signature preserved.

CREATE OR REPLACE FUNCTION public.bridge_loopholes_to_confessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_plan_id uuid;
  v_loops jsonb;
  v_l jsonb;
  v_inserted int := 0;
  v_existing int;
  v_prompt text;
  v_evidence text;
  v_source text;
  v_lower text;
  v_first_word text;
BEGIN
  SELECT id, loopholes INTO v_plan_id, v_loops
  FROM handler_strategic_plans
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_plan_id IS NULL THEN RETURN 0; END IF;

  FOR v_l IN SELECT * FROM jsonb_array_elements(v_loops)
  LOOP
    v_evidence := trim(COALESCE(v_l->>'pattern_evidence', ''));
    v_source   := trim(COALESCE(v_l->>'evidence_source', ''));
    IF v_evidence = '' THEN CONTINUE; END IF;

    -- NEW: require a grounded evidence_source. No named data source (or a
    -- trivially-short one) => not grounded => never surfaced. This is what
    -- stops a fabricated first-person stat from becoming a confession.
    IF length(v_source) < 6
       OR lower(v_source) IN ('n/a', 'none', 'unknown', 'the data', 'snapshot', 'state', 'behavior')
    THEN
      CONTINUE;
    END IF;

    v_lower := lower(v_evidence);
    v_first_word := lower(split_part(v_evidence, ' ', 1));

    -- Existing gate: reject audit-memo / third-person framing.
    IF v_first_word IN ('subject', 'multiple', 'critical', 'no', 'lack', 'absence', 'missing')
       OR v_evidence ~ '^[0-9]'
       OR v_lower LIKE 'critical audit finding%'
       OR v_lower LIKE 'no mention of%'
       OR v_lower LIKE 'subject can%'
       OR v_lower LIKE 'subject may%'
       OR v_lower LIKE 'the user can%'
       OR v_lower LIKE 'the user may%'
       OR v_lower LIKE 'audit finding%'
       OR v_lower LIKE 'system allows%'
       OR v_lower LIKE 'protocol allows%'
       OR v_lower LIKE 'lack of%'
    THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_existing
    FROM confession_queue
    WHERE user_id = p_user_id
      AND triggered_by_table = 'handler_strategic_plans'
      AND triggered_by_id = v_plan_id
      AND prompt LIKE '%' || v_evidence || '%';
    IF v_existing > 0 THEN CONTINUE; END IF;

    v_prompt := v_evidence || '. What is the easier story you tell yourself when you do this? 4 sentences. Be specific.';

    INSERT INTO confession_queue (
      user_id, category, prompt, context_note, deadline,
      triggered_by_table, triggered_by_id
    ) VALUES (
      p_user_id, 'rationalization', v_prompt, NULL,
      now() + interval '4 days',
      'handler_strategic_plans', v_plan_id
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;