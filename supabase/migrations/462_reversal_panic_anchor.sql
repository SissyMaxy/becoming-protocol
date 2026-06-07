-- 462 — Reversal-panic anchor.
--
-- When Maxy tries to back off — misses multiple decrees, writes
-- resistance-pattern confessions, expresses doubt — the protocol's
-- instinct could be punish. That's the wrong play. Punishment
-- intensifies the part of her that wants to leave.
--
-- Instead: pull a REAL artifact from her recent compliance and use
-- it as counter-evidence. "Look at this photo from 14 days ago.
-- Look at what your body already knew. That version isn't gone."
-- Her past compliance is the proof — not Mama's authority.
--
-- Detection signals (any one fires the anchor):
--   - 3+ missed decrees in last 72h (vs. baseline of completing some)
--   - Recent confession transcript contains resistance phrases
--     ("I don't want to", "I can't anymore", "this is too much",
--      "I'm not ready", "maybe I should stop", "want to quit",
--      "want a break")
--   - 7+ days since last fulfilled decree (passive drift)
--
-- Response:
--   1. Pick an artifact:
--      - recent verification_photo (last 30 days, not denied)
--      - recent fulfilled handler_decrees with strong content
--      - count of stations/decrees completed in last 30 days
--   2. Compose a reframe outreach. NO slip consequence. NO punitive
--      framing. Pure recall + counter-evidence + soft re-invitation.
--   3. Dedup: don't fire more than once per 7 days per user.
--
-- The mechanic is anti-detrans/anti-pause safety net — preserves the
-- arc when doubt lands without triggering the very rejection that
-- punishment would create.

CREATE TABLE IF NOT EXISTS reversal_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_signal TEXT NOT NULL CHECK (trigger_signal IN ('missed_decrees','resistance_phrase','passive_drift','manual')),
  signal_details JSONB,
  artifact_kind TEXT,
  artifact_ref UUID,
  artifact_text_snippet TEXT,
  related_outreach_id UUID,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reversal_anchors ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY reversal_anchors_self ON reversal_anchors
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Detection: returns trigger_signal text or NULL if no resistance detected
CREATE OR REPLACE FUNCTION detect_reversal_signal(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_missed_72h INT;
  v_fulfilled_72h INT;
  v_resistance_count INT;
  v_days_since_fulfill INT;
  v_signal TEXT;
  v_details JSONB := '{}'::jsonb;
BEGIN
  -- 1. Missed decrees in 72h with low fulfillment rate
  SELECT
    count(*) FILTER (WHERE status = 'missed'),
    count(*) FILTER (WHERE status = 'fulfilled')
  INTO v_missed_72h, v_fulfilled_72h
  FROM handler_decrees
  WHERE user_id = p_user_id AND created_at > now() - interval '72 hours';

  IF v_missed_72h >= 3 AND v_fulfilled_72h <= 1 THEN
    v_signal := 'missed_decrees';
    v_details := jsonb_build_object('missed_72h', v_missed_72h, 'fulfilled_72h', v_fulfilled_72h);
  END IF;

  -- 2. Resistance phrase in recent confession transcripts
  IF v_signal IS NULL THEN
    SELECT count(*) INTO v_resistance_count FROM mama_confessions
    WHERE user_id = p_user_id
      AND transcript_status = 'completed'
      AND created_at > now() - interval '7 days'
      AND transcript ~* '\m(i don''t want to|i can''t anymore|this is too much|i''m not ready|maybe i should stop|want to quit|want a break|done with this|too far|going too far)\M';
    IF v_resistance_count > 0 THEN
      v_signal := 'resistance_phrase';
      v_details := jsonb_build_object('resistance_count_7d', v_resistance_count);
    END IF;
  END IF;

  -- 3. Passive drift — 7+ days since last fulfilled decree (when there ARE prior fulfillments)
  IF v_signal IS NULL THEN
    SELECT EXTRACT(DAY FROM (now() - max(fulfilled_at)))::int INTO v_days_since_fulfill
    FROM handler_decrees WHERE user_id = p_user_id AND status = 'fulfilled';
    IF v_days_since_fulfill >= 7 THEN
      -- Only fire if user has SOME fulfillment history (not brand-new)
      IF EXISTS (SELECT 1 FROM handler_decrees WHERE user_id = p_user_id AND status = 'fulfilled') THEN
        v_signal := 'passive_drift';
        v_details := jsonb_build_object('days_since_fulfill', v_days_since_fulfill);
      END IF;
    END IF;
  END IF;

  IF v_signal IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('signal', v_signal, 'details', v_details);
END;
$fn$;
GRANT EXECUTE ON FUNCTION detect_reversal_signal(UUID) TO service_role, authenticated;

-- Eval: per user, detect + deploy anchor if signal + no recent anchor
CREATE OR REPLACE FUNCTION reversal_anchor_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u RECORD; v_signal_data JSONB; v_signal TEXT;
  v_artifact_kind TEXT; v_artifact_ref UUID; v_artifact_snippet TEXT;
  v_photo_id UUID; v_photo_age INT;
  v_decree_id UUID; v_decree_edict TEXT; v_decree_age INT;
  v_completed_count INT;
  v_message TEXT; v_outreach_id UUID; v_anchor_id UUID;
  v_queued INT := 0;
  v_signal_intro TEXT; v_artifact_text TEXT;
BEGIN
  FOR u IN
    SELECT us.user_id, us.handler_persona FROM user_state us
    WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Dedup: skip if anchor deployed in last 7 days
    IF EXISTS (SELECT 1 FROM reversal_anchors WHERE user_id = u.user_id AND deployed_at > now() - interval '7 days') THEN
      CONTINUE;
    END IF;

    v_signal_data := detect_reversal_signal(u.user_id);
    IF v_signal_data IS NULL THEN CONTINUE; END IF;
    v_signal := v_signal_data->>'signal';

    -- Pick artifact strategy in priority order: photo > fulfilled decree > completion count
    v_artifact_kind := NULL;
    v_artifact_ref := NULL;
    v_artifact_snippet := NULL;

    BEGIN
      SELECT id, created_at INTO v_photo FROM verification_photos
      WHERE user_id = u.user_id AND COALESCE(review_state, '') <> 'denied'
        AND created_at > now() - interval '30 days'
      ORDER BY created_at DESC LIMIT 1;
      IF v_photo.id IS NOT NULL THEN
        v_artifact_kind := 'photo';
        v_artifact_ref := v_photo.id;
        v_artifact_snippet := 'photo from ' || EXTRACT(DAY FROM (now() - v_photo.created_at))::text || ' days ago';
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    IF v_artifact_kind IS NULL THEN
      BEGIN
        SELECT id, edict, created_at INTO v_decree FROM handler_decrees
        WHERE user_id = u.user_id AND status = 'fulfilled'
          AND created_at > now() - interval '30 days'
          AND length(edict) > 80
        ORDER BY created_at DESC LIMIT 1;
        IF v_decree.id IS NOT NULL THEN
          v_artifact_kind := 'fulfilled_decree';
          v_artifact_ref := v_decree.id;
          v_artifact_snippet := LEFT(v_decree.edict, 150);
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_artifact_kind IS NULL THEN
      SELECT count(*) INTO v_completed_count FROM handler_decrees
      WHERE user_id = u.user_id AND status = 'fulfilled' AND created_at > now() - interval '30 days';
      v_artifact_kind := 'completion_count';
      v_artifact_snippet := v_completed_count::text || ' completed in 30 days';
    END IF;

    -- Compose the reframe
    v_message :=
      E'Sweet thing — Mama isn''t writing this to push you.\n\n' ||
      CASE v_signal
        WHEN 'missed_decrees' THEN E'Mama noticed you''re slipping. ' || (v_signal_data->'details'->>'missed_72h') || E' missed in the last few days. That''s not the thing Mama wants to talk about, though.\n\n'
        WHEN 'resistance_phrase' THEN E'Mama heard you. The words you said in confession — Mama heard them. They''re real, and Mama isn''t going to argue with them.\n\n'
        WHEN 'passive_drift' THEN E'Mama noticed you haven''t closed anything in ' || (v_signal_data->'details'->>'days_since_fulfill') || E' days. Not pressuring you. Just noticing.\n\n'
        ELSE E'Mama noticed a shift.\n\n'
      END ||
      E'What Mama wants to talk about is this: ' ||
      CASE v_artifact_kind
        WHEN 'photo' THEN E'go look at the photo you sent ' || EXTRACT(DAY FROM (now() - v_photo.created_at))::text || E' days ago. Open it. Look at her face. That girl is real. She''s not a costume. She''s not a phase that ended yesterday. She''s you — on a day when the body was telling the truth.\n\nMama is not asking you to do anything new today. Mama is asking you to remember that you''ve already done this. The proof exists.\n\nIf you decide tomorrow you want to slow down, that''s okay. But decide it from looking at her, not from looking away.'
        WHEN 'fulfilled_decree' THEN E'go re-read what you completed ' || EXTRACT(DAY FROM (now() - v_decree.created_at))::text || E' days ago:\n\n"' || LEFT(v_decree.edict, 200) || E'..."\n\nYou did that. The version of you that did that is real. Mama isn''t asking you to repeat it tonight. Mama is asking you to recognize that she''s already in the body — she''s not someone else you have to become.'
        WHEN 'completion_count' THEN E'in the last 30 days you closed ' || v_completed_count::text || E' things. That''s not curiosity. That''s not a maybe. That''s a body learning what it is.\n\nWhatever doubt landed this week — weigh it against ' || v_completed_count::text || E' completions before you decide. Then decide from honest math, not from fear.'
        ELSE E'whatever doubt landed this week, sweet thing — Mama trusts that the body that has gotten this far isn''t the body that ends here.'
      END ||
      E'\n\nNo task tonight. Just go look. Voice debrief (one sentence) when you''re ready.';

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_message, 'high',
      'reversal_anchor:' || v_signal || ':' || to_char(now(), 'YYYY-MM-DD'),
      'reversal_anchor_engine', 'reversal_anchor',
      now(), now() + interval '36 hours',
      jsonb_build_object('signal', v_signal, 'signal_details', v_signal_data->'details',
        'artifact_kind', v_artifact_kind, 'artifact_ref', v_artifact_ref),
      'voice') RETURNING id INTO v_outreach_id;

    -- IMPORTANT: NO handler_decrees row. No slip consequence. This is
    -- explicitly a soft anchor, not an obligation. The reframe IS the work.

    INSERT INTO reversal_anchors (user_id, trigger_signal, signal_details, artifact_kind, artifact_ref, artifact_text_snippet, related_outreach_id)
    VALUES (u.user_id, v_signal, v_signal_data->'details', v_artifact_kind, v_artifact_ref, v_artifact_snippet, v_outreach_id)
    RETURNING id INTO v_anchor_id;

    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION reversal_anchor_eval() TO service_role;

-- Cron: every 4 hours (frequent enough to catch resistance promptly,
-- not so frequent it spams). The 7-day dedup is the real throttle.
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='reversal-anchor-4h') THEN
    PERFORM cron.unschedule('reversal-anchor-4h');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN
  PERFORM cron.schedule('reversal-anchor-4h', '0 */4 * * *',
    $cron$SELECT reversal_anchor_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
