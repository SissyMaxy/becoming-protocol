-- 525 — Weekly Mama review outreach.
--
-- Sunday 09:00 UTC sweep: per-user fulfillment/miss stats over the
-- previous 7 days, identifies the top-momentum ladder, generates a
-- Mommy-voice review summary, queues a high-urgency outreach with
-- voice-debrief invitation.
--
-- Branching message logic handles 5 cases: quiet week (no decrees),
-- all missed, all clean, heavy-momentum, mixed. Each lands a different
-- voice from Mama — patience for quiet, curiosity for all-miss, praise
-- for all-clean, specific-pointing for heavy-momentum, story-invite
-- for mixed.
--
-- Idempotent: mama_weekly_reviews has UNIQUE (user_id, week_starting)
-- so re-running the cron mid-week is a no-op.

CREATE TABLE IF NOT EXISTS mama_weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_starting DATE NOT NULL,
  fulfilled_count INT NOT NULL DEFAULT 0,
  missed_count INT NOT NULL DEFAULT 0,
  ladders_progressed JSONB NOT NULL DEFAULT '[]',
  message TEXT NOT NULL,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_starting)
);
ALTER TABLE mama_weekly_reviews ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY mwr_self ON mama_weekly_reviews FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION mama_weekly_review_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_week_start DATE; v_fulfilled INT; v_missed INT; v_ladders JSONB;
  v_msg TEXT; v_outreach UUID; v_count INT := 0;
  v_top_ladder TEXT; v_top_count INT;
BEGIN
  v_week_start := date_trunc('week', now())::date;

  FOR u IN SELECT DISTINCT us.user_id FROM user_state us
    WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM mama_weekly_reviews WHERE user_id = u.user_id AND week_starting = v_week_start) THEN CONTINUE; END IF;

    SELECT
      COUNT(*) FILTER (WHERE status='fulfilled' AND updated_at > now() - interval '7 days'),
      COUNT(*) FILTER (WHERE status='missed' AND updated_at > now() - interval '7 days')
    INTO v_fulfilled, v_missed
    FROM handler_decrees WHERE user_id = u.user_id;

    SELECT trigger_source, COUNT(*)
    INTO v_top_ladder, v_top_count
    FROM handler_decrees
    WHERE user_id = u.user_id AND status='fulfilled' AND updated_at > now() - interval '7 days'
      AND trigger_source IS NOT NULL
    GROUP BY trigger_source ORDER BY COUNT(*) DESC LIMIT 1;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('trigger_source', trigger_source, 'fulfilled', cnt)), '[]'::jsonb)
    INTO v_ladders
    FROM (
      SELECT trigger_source, COUNT(*) AS cnt
      FROM handler_decrees
      WHERE user_id = u.user_id AND status='fulfilled' AND updated_at > now() - interval '7 days'
        AND trigger_source IS NOT NULL
      GROUP BY trigger_source ORDER BY cnt DESC LIMIT 10
    ) t;

    v_msg := CASE
      WHEN v_fulfilled = 0 AND v_missed = 0 THEN
        E'A whole week and the protocol stayed quiet on you. Mama didn''t push. You didn''t come. Sit with that. Voice debrief, 60 seconds: did the silence feel like rest or like avoidance?'
      WHEN v_fulfilled = 0 AND v_missed > 0 THEN
        format(E'%s deadlines, zero fulfilled. Mama isn''t mad — Mama wants to know what got in the way. Voice debrief: name the actual obstacle, not the excuse.', v_missed)
      WHEN v_fulfilled >= 5 AND v_missed = 0 THEN
        format(E'%s things done. Zero dropped. Good girl. The body is starting to recognize the cadence as its own. Voice debrief: which one surprised you when you actually did it?', v_fulfilled)
      WHEN v_top_ladder IS NOT NULL THEN
        format(E'%s done, %s missed this week. Heaviest momentum on %s — %s of those. Voice debrief: is that the one the body wants, or just the easiest one?',
          v_fulfilled, v_missed, v_top_ladder, v_top_count)
      ELSE
        format(E'%s fulfilled, %s missed. The numbers are the numbers — Mama wants the story. Voice debrief on the week.', v_fulfilled, v_missed)
    END;

    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      u.user_id, v_msg, 'high',
      'mama_weekly_review:' || v_week_start::text,
      'mama_weekly_review', 'weekly_review',
      now(), now() + interval '48 hours',
      jsonb_build_object('week_starting', v_week_start, 'fulfilled', v_fulfilled, 'missed', v_missed, 'ladders', v_ladders),
      'voice'
    ) RETURNING id INTO v_outreach;

    INSERT INTO mama_weekly_reviews (user_id, week_starting, fulfilled_count, missed_count, ladders_progressed, message, related_outreach_id)
    VALUES (u.user_id, v_week_start, v_fulfilled, v_missed, v_ladders, v_msg, v_outreach);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;
GRANT EXECUTE ON FUNCTION mama_weekly_review_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='mama-weekly-review') THEN PERFORM cron.unschedule('mama-weekly-review'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('mama-weekly-review', '0 9 * * 0', $cron$SELECT mama_weekly_review_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
