-- 248 — quality gate on bridge_loopholes_to_confessions.
--
-- Bug: the strategist (handler-strategist-v2) sometimes returns "loopholes"
-- whose pattern_evidence is written as a third-party audit observation
-- ("Subject can avoid protocol entirely by not opening app", "No mention
-- of emotional support…", "Critical audit finding: …", "Multiple
-- commitments show 'cancelled' status…") instead of as a first-person user
-- behavior. The bridge then wraps it with "What is the easier story you
-- tell yourself when you do this?" — producing prompts the user cannot
-- answer because they refer to protocol-design gaps, not her actions.
--
-- Fix: bridge skips entries whose evidence text matches an audit-style
-- prefix, lacks any first-person/behavior signal, or starts with a
-- third-person noun like "Subject"/"Multiple"/"Critical". The strategist
-- prompt is also tightened (edge-fn, separate deploy) to require
-- first-person framing — this gate is the defensive backstop.
--
-- The function shape and signature are preserved so callers don't change.

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
    IF v_evidence = '' THEN CONTINUE; END IF;

    v_lower := lower(v_evidence);
    v_first_word := lower(split_part(v_evidence, ' ', 1));

    -- Quality gate: skip strategist outputs that read as protocol-design
    -- audits rather than user-behavior observations.
    --
    -- Reject if the evidence is third-person about the protocol/subject,
    -- or is framed as an audit memo, or starts with a numeric quantifier
    -- (e.g. "14 current slip points…"). These cannot be answered by "what
    -- is the easier story you tell yourself when you do this" because
    -- they're not things the user *did*.
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

    -- Dedupe by evidence text (existing behavior).
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
