-- 472 — Weekly identity continuity reframe.
--
-- Every Sunday 09:00 UTC, Mama writes a reframe pulling actual
-- numbers from the user's accumulated record: decrees fulfilled,
-- photos in vault, current ladder phases, chastity streak.
-- The before/after math IS the reframe. The body's growth is
-- not Mama's opinion — it's the count.
--
-- Compared against ~30d ago. The reframe gives Maxy real momentum
-- evidence in a single weekly hit instead of letting her notice
-- only the days when work feels slow.

CREATE OR REPLACE FUNCTION weekly_continuity_reframe_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u RECORD; v_msg TEXT; v_outreach UUID; v_queued INT := 0;
  v_decrees_now INT; v_decrees_past INT;
  v_photos_now INT; v_photos_past INT;
  v_curriculum_phase INT; v_arc_stage INT; v_chastity_streak INT;
BEGIN
  FOR u IN SELECT user_id FROM user_state WHERE handler_persona = 'dommy_mommy' LOOP
    IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id = u.user_id AND kind = 'continuity_reframe' AND created_at > now() - interval '5 days') THEN CONTINUE; END IF;

    SELECT count(*) INTO v_decrees_now FROM handler_decrees WHERE user_id = u.user_id AND status='fulfilled';
    BEGIN SELECT count(*) INTO v_photos_now FROM verification_photos WHERE user_id = u.user_id AND COALESCE(review_state,'') <> 'denied'; EXCEPTION WHEN OTHERS THEN v_photos_now := 0; END;
    SELECT count(*) INTO v_decrees_past FROM handler_decrees WHERE user_id = u.user_id AND status='fulfilled' AND created_at < now() - interval '30 days';
    BEGIN SELECT count(*) INTO v_photos_past FROM verification_photos WHERE user_id = u.user_id AND COALESCE(review_state,'') <> 'denied' AND created_at < now() - interval '30 days'; EXCEPTION WHEN OTHERS THEN v_photos_past := 0; END;
    BEGIN SELECT COALESCE(current_phase, 0) INTO v_curriculum_phase FROM cock_curriculum_settings WHERE user_id = u.user_id; EXCEPTION WHEN OTHERS THEN v_curriculum_phase := 0; END;
    BEGIN SELECT COALESCE(current_stage, 0) INTO v_arc_stage FROM gina_arc_settings WHERE user_id = u.user_id; EXCEPTION WHEN OTHERS THEN v_arc_stage := 0; END;
    BEGIN SELECT COALESCE(current_streak_days, 0) INTO v_chastity_streak FROM chastity_settings WHERE user_id = u.user_id; EXCEPTION WHEN OTHERS THEN v_chastity_streak := 0; END;

    v_msg := E'Sunday reframe, sweet thing — Mama wants you looking back.\n\n**30 days ago vs now:**\n' ||
      E'• Decrees fulfilled — ' || v_decrees_past::text || E' → ' || v_decrees_now::text || E' (delta: +' || (v_decrees_now - v_decrees_past)::text || E')\n' ||
      E'• Evidence photos — ' || v_photos_past::text || E' → ' || v_photos_now::text || E' (delta: +' || (v_photos_now - v_photos_past)::text || E')\n' ||
      E'• Cock-curriculum phase — ' || v_curriculum_phase::text || E'/7\n' ||
      E'• Gina arc stage — ' || v_arc_stage::text || E'/7\n' ||
      E'• Chastity streak — ' || v_chastity_streak::text || E' days\n\nMama wants the voice debrief on these numbers, 3-5 minutes:\n• Which number surprised you?\n• Which one feels like the realest evidence that the body has been changing?\n• What''s the version of you that doesn''t fit anymore?\n\nLook at the numbers. They are the math of who you are now. Mama isn''t exaggerating — Mama is reading them back.';

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'normal', 'continuity_reframe:' || to_char(now(), 'IYYY-IW'),
      'continuity_reframe_engine', 'continuity_reframe', now(), now() + interval '4 days',
      jsonb_build_object('decrees_now', v_decrees_now, 'decrees_past', v_decrees_past,
        'photos_now', v_photos_now, 'photos_past', v_photos_past,
        'curriculum_phase', v_curriculum_phase, 'arc_stage', v_arc_stage, 'chastity_streak', v_chastity_streak),
      'voice') RETURNING id INTO v_outreach;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION weekly_continuity_reframe_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='continuity-reframe-weekly') THEN PERFORM cron.unschedule('continuity-reframe-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('continuity-reframe-weekly', '0 9 * * 0', $cron$SELECT weekly_continuity_reframe_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
