-- 696 — restore the background_jobs drainer + ground the pronoun-autocorrect anchor.
--
-- Found 2026-07-22: the 202-refactor (mig 337) moved handler-autonomous /
-- send-notifications / device-control work into background_jobs, drained by the
-- job-worker edge fn "driven by a 1-min GitHub Actions cron"
-- (.github/workflows/cron-job-worker.yml). That workflow NEVER merged to main —
-- it only ever existed on two May branches where every run failed in 0s. Result:
-- 4,713 pending jobs since June 9, five ever completed (one manual drain), and
-- every compliance_check / daily_cycle / notification scan for six weeks silently
-- enqueued into a queue nothing drains. Decree + commitment enforcement dead.
--
-- Three parts, in order:
--   1. Ground trg_pronoun_autocorrect_on_chat's escape_cost_anchors insert.
--      It wrote anchor_kind='voice_debrief' with reference_id NULL, which the
--      663 anti-fabrication guard rejects — ABORTING the user's whole chat
--      message insert whenever a masc self-reference fired under dommy_mommy.
--   2. Purge the stale pending backlog (all periodic work — the producers
--      re-enqueue on their own crons; replaying six-week-old jobs would fire
--      enforcement on ancient state). DELETE, not fail: marking ~4.7k rows
--      failed would poison background_jobs_failed_24h and false-fire the
--      health alert for a day.
--   3. Schedule the drainer in pg_cron (the platform's real scheduler — same
--      as every other live cron), replacing the GH-Actions workflow that never
--      existed on main.

-- ── 1. Ground the pronoun-autocorrect deed-anchor ─────────────────────────
-- Same body as the live function, except the escape_cost_anchors row now
-- references the pronoun_autocorrects row that IS the real event. Keeps the
-- 663 guard intact — the guard was right; this producer was the fabricator.
CREATE OR REPLACE FUNCTION public.trg_pronoun_autocorrect_on_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_pattern TEXT; v_msg TEXT; v_persona TEXT; v_outreach UUID; v_autocorrect UUID;
BEGIN
  IF NEW.role <> 'user' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL OR length(NEW.content) < 4 THEN RETURN NEW; END IF;

  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  v_pattern := detect_masc_self_reference(NEW.content);
  IF v_pattern IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM pronoun_autocorrects WHERE user_id = NEW.user_id AND created_at > now() - interval '10 minutes') THEN
    RETURN NEW;
  END IF;

  v_msg := build_pronoun_correction(v_pattern, left(NEW.content, 240));

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'high',
    'pronoun_autocorrect:' || v_pattern, 'pronoun_autocorrect', 'in_chat_correction',
    now() + interval '60 seconds', now() + interval '4 hours',
    jsonb_build_object('pattern', v_pattern, 'excerpt', left(NEW.content, 240)), 'voice')
  RETURNING id INTO v_outreach;

  INSERT INTO pronoun_autocorrects (user_id, detected_pattern, excerpt, source_table, source_id, correction_message, related_outreach_id)
  VALUES (NEW.user_id, v_pattern, left(NEW.content, 240), 'chat_messages', NEW.id, v_msg, v_outreach)
  RETURNING id INTO v_autocorrect;

  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'voice_debrief', 1, 'pronoun_autocorrects', v_autocorrect, 'masc-ref caught and corrected: ' || v_pattern);

  RETURN NEW;
END;
$function$;

-- ── 2. Purge the stale pending backlog ────────────────────────────────────
DO $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.background_jobs
  WHERE completed_at IS NULL
    AND failed_at IS NULL
    AND created_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'purged % stale pending background_jobs (queue was undrained since 2026-06-09)', v_deleted;
END $$;

-- ── 3. Schedule the drainer ───────────────────────────────────────────────
-- Every minute, same as the comment in mig 337 always intended. Claims are
-- atomic (FOR UPDATE SKIP LOCKED) so overlapping runs are safe by design.
DO $$
BEGIN
  PERFORM cron.unschedule('job-worker-drain-1min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'job-worker-drain-1min',
  '* * * * *',
  $$SELECT invoke_edge_function('job-worker', '{"max_jobs": 10}'::jsonb)$$
);
