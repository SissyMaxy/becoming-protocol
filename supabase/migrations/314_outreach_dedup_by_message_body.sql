-- 314 — Body-hash dedup for handler_outreach_queue.
--
-- Bug (2026-04-30 incident): live chat showed the same Mama line three times
-- in a row:
--   "Mama saw that, baby. We'll talk about it. For now just feel that I'm here."
--
-- Root cause: trg_mommy_immediate_response_to_slip (migration 257) writes
-- one outreach row per slip_log INSERT, with trigger_reason
--   'mommy_immediate_slip:' || NEW.id::text
-- so every slip gets a UNIQUE trigger_reason. The existing supersede dedup
-- (265, refined by 267) keys on (user_id, trigger_reason) and therefore
-- cannot collapse these. When 3+ slips of an unmatched type fire in close
-- succession (handler-autonomous's missed-decree / missed-commitment
-- processor inserts multiple slip_type='other' rows in one run), the trigger
-- queues 3 outreach rows with IDENTICAL body — the ELSE-branch fallback in
-- 257's CASE statement. useHandlerChat polls every 60s, so they appear as
-- 3 identical assistant messages over ~3 minutes.
--
-- Rate-limit (268) caps mommy_immediate at 4/hour. 3 still passes.
--
-- Two-layer fix (defense in depth):
--   1. Generation-site gate inside trg_mommy_immediate_response_to_slip:
--      skip the INSERT if an identical Mama line is already pending for the
--      user within the last 5 minutes. Each slip still gets its slip_log
--      row + downstream confession-queue chain; only the user-facing chat
--      message dedups.
--   2. Architectural backstop: trg_outreach_dedup_by_body BEFORE INSERT
--      supersedes any prior pending row with the same (user_id, message)
--      in the last 60 minutes. Catches every future generator that hits
--      the same bug class without per-callsite refactor — same chokepoint
--      pattern as mommy_voice_db_gate.

-- ─── 1. Architectural backstop: body-hash dedup ─────────────────────
CREATE OR REPLACE FUNCTION trg_outreach_dedup_by_body()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.message IS NULL OR length(NEW.message) = 0 THEN
    RETURN NEW;
  END IF;
  -- If a prior trigger (e.g. rate_limit) already marked this row as
  -- superseded, don't bother running the older-row scan.
  IF NEW.status = 'superseded' THEN
    RETURN NEW;
  END IF;
  IF NOT is_mommy_user(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  -- Supersede prior pending rows with the same body for the same user in
  -- the last 60 minutes. Latest-wins, matching the semantics of
  -- trg_outreach_supersede_duplicates (265/267).
  UPDATE handler_outreach_queue
  SET status = 'superseded',
      expires_at = now() - interval '1 second'
  WHERE user_id = NEW.user_id
    AND message = NEW.message
    AND delivered_at IS NULL
    AND status IN ('pending', 'queued', 'scheduled')
    AND created_at >= now() - interval '60 minutes';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_dedup_by_body ON handler_outreach_queue;
CREATE TRIGGER outreach_dedup_by_body
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_dedup_by_body();

-- ─── 2. Generation-site gate inside the slip→Mama trigger ───────────
-- Re-create trg_mommy_immediate_response_to_slip from 257 verbatim, with
-- one added idempotency check before the INSERT. CASE bodies are
-- intentionally byte-identical to 257 — persona language is intentional and
-- must not change.
CREATE OR REPLACE FUNCTION public.trg_mommy_immediate_response_to_slip()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_persona text;
  v_message text;
  v_dup_count int;
BEGIN
  IF NEW.slip_type = 'confession_missed' THEN RETURN NEW; END IF;
  IF NEW.source_text IS NULL OR length(trim(NEW.source_text)) < 5 THEN RETURN NEW; END IF;

  SELECT handler_persona INTO v_persona
  FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  v_message := CASE NEW.slip_type
    WHEN 'masculine_self_reference' THEN
      'I caught that, baby. The old voice slipped out. Mama saw it. We''ll talk about it — but for now, just feel that I noticed.'
    WHEN 'david_name_use' THEN
      'You said the costume name, sweet thing. Mama heard you. That part of you is allowed to be tired — but you don''t live there anymore.'
    WHEN 'resistance_statement' THEN
      'Oh, baby. You think I didn''t hear that? I heard every word. Mama is going to want to hear more about it later. For now, sit with it.'
    WHEN 'task_avoided' THEN
      'I see you slipped past one, sweet thing. Don''t hide from Mama — I always know.'
    WHEN 'directive_refused' THEN
      'You said no to me, baby. That''s allowed. But Mama is going to want to know exactly why, and Mama is going to want it in your own words.'
    WHEN 'voice_masculine_pitch' THEN
      'Your voice came down low for me, sweet thing. Mama heard that. Find your girl voice and bring her back.'
    WHEN 'handler_ignored' THEN
      'You went quiet on Mama, baby. I''m patient — but I''m also still here. Come back when you''re ready, but don''t pretend Mama isn''t waiting.'
    WHEN 'mantra_missed' THEN
      'You skipped the words today, baby. Mama notices the silences as much as the sounds.'
    WHEN 'chastity_unlocked_early' THEN
      'You came out of the cage early, my needy little thing. Mama is going to want every second of the story. And Mama is going to make you wait twice as long for it.'
    WHEN 'arousal_gating_refused' THEN
      'You wouldn''t hold for Mama, baby. I see you. We''re going to find out what it costs.'
    WHEN 'gender_claim' THEN
      'You said something about yourself that wasn''t true, sweet thing. Mama heard you. We both know what''s true. Sit with it.'
    ELSE
      'Mama saw that, baby. We''ll talk about it. For now just feel that I''m here.'
  END;

  -- Generation-site gate. Most slip_types have unique CASE bodies, so this
  -- only ever filters when the SAME slip_type fires multiple times in 5
  -- minutes — most often the ELSE fallback for batches of slip_type='other'
  -- (handler-autonomous decree/commitment processor) or batches of
  -- 'hrt_dose_missed' / 'immersion_session_broken' / 'disclosure_deadline_missed'.
  SELECT count(*) INTO v_dup_count
  FROM handler_outreach_queue
  WHERE user_id = NEW.user_id
    AND message = v_message
    AND delivered_at IS NULL
    AND status IN ('pending', 'queued', 'scheduled')
    AND created_at >= now() - interval '5 minutes';
  IF v_dup_count > 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, scheduled_for, expires_at, source
  ) VALUES (
    NEW.user_id, v_message, 'normal',
    'mommy_immediate_slip:' || NEW.id::text,
    now(), now() + interval '4 hours',
    'mommy_immediate'
  );

  RETURN NEW;
END;
$function$;

-- ─── 3. Backfill: collapse current pending duplicates by body ───────
-- Any pending Mommy outreach row whose body matches a more-recent pending
-- sibling for the same user gets superseded and expired immediately so the
-- queue clears for the user before they next refresh.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, message
           ORDER BY scheduled_for DESC, created_at DESC
         ) AS rn
  FROM handler_outreach_queue
  WHERE delivered_at IS NULL
    AND status IN ('pending', 'queued', 'scheduled')
    AND message IS NOT NULL
)
UPDATE handler_outreach_queue
SET status = 'superseded',
    expires_at = now() - interval '1 second'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  AND is_mommy_user(user_id);
