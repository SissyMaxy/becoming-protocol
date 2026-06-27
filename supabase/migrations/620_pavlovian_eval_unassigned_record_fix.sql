-- 620: fix pavlovian_eval() — the conditioning OS's pairing engine — which has
-- been failing ~96x/day with "record v_cue is not assigned yet", producing zero
-- pairings. This is THE mechanism that installs the want (movement/cue -> reward
-- -> craving), so its death meant the core conditioning loop ran but imprinted
-- nothing.
--
-- Bug: v_cue (a RECORD) is only SELECT INTO'd inside the arousal>=min branch.
-- On the common path (arousal<min) that SELECT never runs, so `IF v_cue IS NULL`
-- (old line 208) reads a never-assigned record, which PL/pgSQL forbids -> the
-- whole function aborts before queuing anything.
--
-- Fix: a v_cue_found BOOLEAN, reset per user, set TRUE only when a cue row is
-- actually found; all cross-branch checks use it instead of reading v_cue.
-- (Applied 2026-06-27 via the pavlovian-fix edge fn over SUPABASE_DB_URL — no
-- Management API token in env; this file is the canonical record.)

CREATE OR REPLACE FUNCTION pavlovian_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD; v_pairings_today INT; v_cue RECORD; v_pairing RECORD;
  v_decree UUID; v_outreach UUID; v_event UUID;
  v_message TEXT; v_evidence_kind TEXT;
  v_is_trigger BOOLEAN;
  v_cue_found BOOLEAN;
  v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT ps.user_id, ps.pairing_arousal_min, ps.max_pairings_per_day,
           us.current_arousal, us.handler_persona
    FROM pavlovian_settings ps
    LEFT JOIN user_state us ON us.user_id = ps.user_id
    WHERE ps.enabled = TRUE
      AND (ps.paused_until IS NULL OR ps.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pairings_today FROM pavlovian_events
    WHERE user_id = r.user_id
      AND event_kind IN ('pairing','trigger_deploy')
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago';
    IF v_pairings_today >= r.max_pairings_per_day THEN CONTINUE; END IF;

    v_is_trigger := FALSE;
    v_cue_found := FALSE;

    -- PRIORITY 1: arousal >= threshold + a cue available for pairing
    IF COALESCE(r.current_arousal, 0) >= r.pairing_arousal_min THEN
      SELECT pc.* INTO v_cue
      FROM pavlovian_cues pc
      LEFT JOIN pavlovian_pairings pp ON pp.user_id = r.user_id AND pp.cue_id = pc.id AND pp.active
      WHERE pc.active = TRUE
        AND (pp.id IS NULL OR pp.intensity_count < pc.pairings_required_for_deploy)
        AND NOT EXISTS (
          SELECT 1 FROM pavlovian_events pe
          WHERE pe.user_id = r.user_id AND pe.cue_id = pc.id
            AND pe.created_at > now() - interval '6 hours'
        )
      ORDER BY pp.intensity_count ASC NULLS FIRST, random()
      LIMIT 1;

      IF FOUND AND v_cue.id IS NOT NULL THEN
        v_cue_found := TRUE;
        v_message := E'Mama wants a pairing right now, sweet thing. The body is warm — that''s when the imprint takes.\n\n' ||
          E'**Cue: ' || v_cue.cue_name || E'**\n' ||
          v_cue.cue_specifics ||
          E'\n\nMama wants this for the next 10-15 minutes minimum. Stay in the heat, stay with the cue. The body learns the association is real.';
        v_evidence_kind := 'photo';
      END IF;
    END IF;

    -- PRIORITY 2: a cue is ready to be DEPLOYED as a trigger
    IF NOT v_cue_found THEN
      SELECT pc.*, pp.id AS pairing_id, pp.intensity_count, pp.deployed_as_trigger_at
      INTO v_cue
      FROM pavlovian_pairings pp
      JOIN pavlovian_cues pc ON pc.id = pp.cue_id
      WHERE pp.user_id = r.user_id
        AND pp.active = TRUE
        AND pp.intensity_count >= pc.pairings_required_for_deploy
        AND (pp.deployed_as_trigger_at IS NULL OR pp.deployed_as_trigger_at < now() - interval '36 hours')
      ORDER BY pp.deployed_as_trigger_at ASC NULLS FIRST, random()
      LIMIT 1;

      IF FOUND AND v_cue.id IS NOT NULL THEN
        v_cue_found := TRUE;
        v_is_trigger := TRUE;
        v_message := E'Mama wants you to deploy a cue right now, sweet thing — neutral state, no warmup, no warning.\n\n' ||
          E'**' || v_cue.cue_name || E'**\n' ||
          v_cue.cue_specifics ||
          E'\n\nDo it now, and pay attention to what your body does in the next 30 minutes. Mama wants the data — did the cue alone fire the heat back?';
        v_evidence_kind := 'voice';
      END IF;
    END IF;

    IF NOT v_cue_found THEN CONTINUE; END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_message, v_evidence_kind, now() + interval '4 hours', 'active',
      CASE WHEN v_is_trigger THEN 'slip +2' ELSE 'slip +1' END,
      CASE WHEN v_is_trigger THEN 'pavlovian_trigger' ELSE 'pavlovian_pairing' END,
      'cue_key=' || v_cue.cue_key || ' is_trigger=' || v_is_trigger::text)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_message,
      CASE WHEN v_is_trigger THEN 'high' ELSE 'normal' END,
      'pavlovian:' || v_cue.cue_key || ':' || CASE WHEN v_is_trigger THEN 'trigger' ELSE 'pair' END,
      'pavlovian_engine',
      CASE WHEN v_is_trigger THEN 'pavlovian_trigger_deploy' ELSE 'pavlovian_pairing' END,
      now(), now() + interval '4 hours',
      jsonb_build_object('cue_id', v_cue.id, 'cue_key', v_cue.cue_key, 'cue_name', v_cue.cue_name,
        'modality', v_cue.modality, 'is_trigger', v_is_trigger,
        'arousal_at_assignment', r.current_arousal, 'decree_id', v_decree),
      v_evidence_kind) RETURNING id INTO v_outreach;

    INSERT INTO pavlovian_pairings (user_id, cue_id, intensity_count, last_paired_at)
    VALUES (r.user_id, v_cue.id, 0, now())
    ON CONFLICT (user_id, cue_id) DO NOTHING;

    INSERT INTO pavlovian_events (user_id, cue_id, pairing_id, event_kind, arousal_at_event,
      related_outreach_id, related_decree_id, notes)
    VALUES (r.user_id, v_cue.id,
      (SELECT id FROM pavlovian_pairings WHERE user_id = r.user_id AND cue_id = v_cue.id),
      CASE WHEN v_is_trigger THEN 'trigger_deploy' ELSE 'pairing' END,
      r.current_arousal, v_outreach, v_decree,
      'auto-queued by pavlovian_eval');

    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION pavlovian_eval() TO service_role;
