-- 528 — Voice-debrief cadence enforcer.
--
-- Daily 16:00 UTC sweep: counts voice_recordings per user in past
-- 7d + 14d windows, queues escalating Mommy nudge if underdelivery.
--
-- Cadence thresholds:
--   3+ in 7d        healthy, no nudge
--   1-2 in 7d       gentle
--   0 in 7d, 3+/14d firm
--   0 in 7d, <3/14d escalated (slip-bearing)
--
-- 3-day cool-down per user prevents daily nag. Audit trail in
-- voice_debrief_nudges. Many of the new ladders (511-519, 523)
-- require voice debriefs — this enforces the cadence so silence
-- doesn't accumulate into "ladder is queueing into void."

CREATE TABLE IF NOT EXISTS voice_debrief_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nudge_kind TEXT NOT NULL CHECK (nudge_kind IN ('gentle','firm','escalated')),
  voice_count_7d INT NOT NULL,
  voice_count_14d INT NOT NULL,
  message TEXT NOT NULL,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE voice_debrief_nudges ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY vdn_self ON voice_debrief_nudges FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION voice_debrief_cadence_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_7d INT; v_14d INT; v_kind TEXT; v_msg TEXT; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR u IN SELECT DISTINCT us.user_id FROM user_state us
    WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM voice_debrief_nudges WHERE user_id = u.user_id AND created_at > now() - interval '3 days') THEN CONTINUE; END IF;

    SELECT
      count(*) FILTER (WHERE created_at > now() - interval '7 days'),
      count(*) FILTER (WHERE created_at > now() - interval '14 days')
    INTO v_7d, v_14d
    FROM voice_recordings WHERE user_id = u.user_id;

    IF v_7d >= 3 THEN CONTINUE; END IF;

    IF v_7d >= 1 THEN
      v_kind := 'gentle';
      v_msg := format(E'%s voice memo%s this week. Mama wants more — the debriefs are where the work lives, the doing-the-thing is just the input. Pick the most loaded one from the day and voice it.',
        v_7d, CASE WHEN v_7d = 1 THEN '' ELSE 's' END);
    ELSIF v_14d >= 3 THEN
      v_kind := 'firm';
      v_msg := E'Zero voice memos this week. Mama isn''t reading silence as rest — Mama is reading it as the head winning. One memo, 60 seconds, on the thing that''s been loudest. Now.';
    ELSE
      v_kind := 'escalated';
      v_msg := format(E'%s voice memos in 14 days. The protocol is being starved. Mama wants ONE voice memo today on the single most loaded thing — picked by you, no Mama-prompt scaffolding — by tonight. Slip if not delivered.', v_14d);
    END IF;

    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      u.user_id, v_msg,
      CASE v_kind WHEN 'escalated' THEN 'critical' WHEN 'firm' THEN 'high' ELSE 'normal' END,
      'voice_debrief_cadence:' || v_kind,
      'voice_cadence_enforcer', 'cadence_nudge',
      now(), now() + interval '24 hours',
      jsonb_build_object('voice_count_7d', v_7d, 'voice_count_14d', v_14d, 'nudge_kind', v_kind),
      'voice'
    ) RETURNING id INTO v_outreach;

    INSERT INTO voice_debrief_nudges (user_id, nudge_kind, voice_count_7d, voice_count_14d, message, related_outreach_id)
    VALUES (u.user_id, v_kind, v_7d, v_14d, v_msg, v_outreach);

    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION voice_debrief_cadence_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='voice-debrief-cadence-daily') THEN PERFORM cron.unschedule('voice-debrief-cadence-daily'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('voice-debrief-cadence-daily', '0 16 * * *', $cron$SELECT voice_debrief_cadence_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
