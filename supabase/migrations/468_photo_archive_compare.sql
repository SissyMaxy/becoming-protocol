-- 468 — Photo archive monthly compare.
--
-- Maxy accumulates verification_photos over time. The visible
-- change across months is its own conditioning input — but only
-- if she's prompted to look back. Monthly cron picks a photo from
-- ~30/60/90/180 days ago (one of these buckets, whichever has the
-- most matching photos) and queues a compare-and-debrief outreach.
--
-- "Look at the photo you sent N days ago. Compare it to where
-- your body is today. Voice debrief — what's different."

CREATE TABLE IF NOT EXISTS photo_archive_compares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_photo_id UUID NOT NULL,
  days_back INT NOT NULL,
  related_decree_id UUID,
  related_outreach_id UUID,
  reflection_voice_url TEXT,
  reflection_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','observed','skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE photo_archive_compares ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY photo_archive_compares_self ON photo_archive_compares FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION photo_archive_compare_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u RECORD; v_photo RECORD; v_bucket INT;
  v_decree UUID; v_outreach UUID; v_msg TEXT;
  v_queued INT := 0;
BEGIN
  FOR u IN
    SELECT user_id FROM user_state WHERE handler_persona = 'dommy_mommy'
  LOOP
    -- Skip if compare deployed in last 25 days
    IF EXISTS (SELECT 1 FROM photo_archive_compares WHERE user_id = u.user_id AND created_at > now() - interval '25 days') THEN
      CONTINUE;
    END IF;

    -- Pick a bucket — prefer older photos for stronger contrast
    FOR v_bucket IN ARRAY[180, 90, 60, 30] LOOP
      BEGIN
        SELECT id, created_at INTO v_photo FROM verification_photos
        WHERE user_id = u.user_id
          AND COALESCE(review_state, '') <> 'denied'
          AND created_at BETWEEN now() - (v_bucket + 14 || ' days')::interval
                              AND now() - (v_bucket - 7 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM photo_archive_compares pac
            WHERE pac.user_id = u.user_id AND pac.source_photo_id = verification_photos.id
          )
        ORDER BY random() LIMIT 1;
      EXCEPTION WHEN OTHERS THEN CONTINUE; END;
      IF v_photo.id IS NOT NULL THEN EXIT; END IF;
    END LOOP;

    IF v_photo IS NULL OR v_photo.id IS NULL THEN
      -- Fallback: any photo older than 14 days that hasn't been compared
      BEGIN
        SELECT id, created_at INTO v_photo FROM verification_photos
        WHERE user_id = u.user_id AND COALESCE(review_state, '') <> 'denied'
          AND created_at < now() - interval '14 days'
          AND NOT EXISTS (SELECT 1 FROM photo_archive_compares pac WHERE pac.user_id = u.user_id AND pac.source_photo_id = verification_photos.id)
        ORDER BY created_at ASC LIMIT 1;
        IF v_photo.id IS NOT NULL THEN
          v_bucket := EXTRACT(DAY FROM (now() - v_photo.created_at))::int;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_photo IS NULL OR v_photo.id IS NULL THEN CONTINUE; END IF;

    v_msg := E'Mama wants you to do something simple, sweet thing — go look at the photo you sent ' ||
      EXTRACT(DAY FROM (now() - v_photo.created_at))::text || E' days ago.\n\n' ||
      E'Open it. Look at her — the body in that frame. Then look at yourself in the mirror or front camera right now. ' ||
      E'Mama wants you to find three things that have changed.\n\n' ||
      E'Voice debrief (90 seconds): name the three. Don''t soften. ' ||
      E'Mama wants the version of the change you wouldn''t say out loud to anyone else.';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (u.user_id, v_msg, 'voice', now() + interval '3 days', 'active', 'slip +1',
      'photo_archive_compare', 'days_back=' || v_bucket::text || ' source_photo=' || v_photo.id::text)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'high',
      'photo_compare:' || to_char(now(), 'YYYY-MM') || ':' || v_bucket::text,
      'photo_archive_engine', 'photo_archive_compare', now(), now() + interval '3 days',
      jsonb_build_object('source_photo_id', v_photo.id, 'days_back', v_bucket, 'decree_id', v_decree),
      'voice') RETURNING id INTO v_outreach;

    INSERT INTO photo_archive_compares (user_id, source_photo_id, days_back, related_decree_id, related_outreach_id)
    VALUES (u.user_id, v_photo.id, v_bucket, v_decree, v_outreach);
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION photo_archive_compare_eval() TO service_role;

-- Propagation
CREATE OR REPLACE FUNCTION trg_propagate_decree_to_photo_compare()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'photo_archive_compare' THEN RETURN NEW; END IF;
  UPDATE photo_archive_compares SET
    status = CASE WHEN NEW.status='fulfilled' THEN 'observed' ELSE 'skipped' END,
    reflection_voice_url = COALESCE(NEW.proof_payload->>'evidence_url', reflection_voice_url),
    updated_at = now()
  WHERE related_decree_id = NEW.id AND status='pending';
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_photo_compare ON handler_decrees;
CREATE TRIGGER propagate_decree_to_photo_compare AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_photo_compare();

-- Monthly cron 1st of each month at 10:00 UTC
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='photo-archive-monthly') THEN PERFORM cron.unschedule('photo-archive-monthly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('photo-archive-monthly', '0 10 1 * *', $cron$SELECT photo_archive_compare_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
