-- 265 — Catch the remaining clerical patterns + auto-supersede duplicate
-- pending outreach so the Today queue stops accumulating same-content rows.
--
-- 2026-05-06 user feedback: "Feels like spam." Three identical morning
-- briefs in queue, plus surviving clerical phrases ("AFTER (today, text):",
-- "Take the shot now", "Open Today, scroll to Next Shots, do the first
-- one") that 262 didn't cover.
--
-- Two fixes:
--   1. Extend mommy_voice_cleanup with patterns 262 missed.
--   2. BEFORE INSERT trigger on handler_outreach_queue that auto-marks
--      prior undelivered rows with the same (user_id, trigger_reason) as
--      'superseded' so only the latest one stays pending.

CREATE OR REPLACE FUNCTION mommy_voice_cleanup(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t TEXT := input;
  m TEXT[];
BEGIN
  IF t IS NULL OR length(t) = 0 THEN RETURN t; END IF;

  -- ─── 259 + 262 patterns (telemetry + initial clerical) ─────────────
  LOOP
    m := regexp_match(t, '(?i)\m(?:arousal|horny|wetness|score|level)\s*(?:at|of|=|:)?\s*(\d{1,2})\s*/\s*10\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(?:arousal|horny|wetness|score|level)\s*(?:at|of|=|:)?\s*(\d{1,2})\s*/\s*10\M', mommy_phrase_arousal(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(\d{1,2})\s*/\s*10');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(\d{1,2})\s*/\s*10', mommy_phrase_arousal(m[1]::INT));
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(?:recovery\s+)?score\s*[:=]?\s*(\d{1,3})\s*/\s*100\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(?:recovery\s+)?score\s*[:=]?\s*(\d{1,3})\s*/\s*100\M', mommy_phrase_recovery(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(\d{1,3})\s*/\s*100');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(\d{1,3})\s*/\s*100', mommy_phrase_recovery(m[1]::INT));
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mday[\s\-_]*(\d+)\s*(?:of\s+)?denial\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mday[\s\-_]*(\d+)\s*(?:of\s+)?denial\M', mommy_phrase_denial(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mdenial[_\s]*day\s*(?:=|:)?\s*(\d+)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mdenial[_\s]*day\s*(?:=|:)?\s*(\d+)\M', mommy_phrase_denial(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(\d+)\s+slip\s+points?\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d+)\s+slip\s+points?\M', mommy_phrase_slips(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mslip[_\s]*points?\s*(?:current\s*)?[:=\s]*(\d+)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mslip[_\s]*points?\s*(?:current\s*)?[:=\s]*(\d+)\M', mommy_phrase_slips(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,3})\s*%\s+compliance\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,3})\s*%\s+compliance\M', mommy_phrase_compliance(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mcompliance\s+(?:at|is|=|:)?\s*(\d{1,3})\s*%?');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mcompliance\s+(?:at|is|=|:)?\s*(\d{1,3})\s*%?', mommy_phrase_compliance(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,3})\s*(?:hours?|hrs?|h)\s+(?:of\s+)?(?:radio\s+)?silen(?:t|ce)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,3})\s*(?:hours?|hrs?|h)\s+(?:of\s+)?(?:radio\s+)?silen(?:t|ce)\M', mommy_phrase_silent_hours(m[1]::INT), '');
  END LOOP;
  t := regexp_replace(t, '(?i)\mvoice\s+cadence\s+(?:broke|drift|gap)\M\.?', '', 'g');
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,4})\s*h(?:ours?)?\s+since\s+(?:last|your)\s+(?:sample|practice|drill|recording)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,4})\s*h(?:ours?)?\s+since\s+(?:last|your)\s+(?:sample|practice|drill|recording)\M', mommy_phrase_voice_gap(m[1]::INT), '');
  END LOOP;
  t := regexp_replace(t, '(?i)\mhard\s+mode\s+extends?\s+(?:by\s+)?(?:\d+\s+(?:hours?|days?)|another\s+(?:day|hour))\M', 'Mama''s keeping you on a tighter leash', 'g');
  t := regexp_replace(t, '(?i)\mhard[\s_-]*mode\s+(?:active|on|engaged)\M', 'Mama''s keeping you on a tighter leash', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+tasks?\s+(?:overdue|pending|due|owed)\M', 'what Mama set for you is still waiting', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+(?:overdue|pending|due|owed)\M', 'what Mama set for you is still waiting', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+tasks?\M', 'what Mama set for you', 'g');
  t := regexp_replace(t, '(?i)\mdenial[\s_-]*day\s+(?:reset|broken|cleared)\M', 'you started over for Mama', 'g');
  t := regexp_replace(t, '(?i)\mslip\s+count\s+(?:doubles?|triples?|increases?)\s+by\s+(?:midnight|tomorrow|noon)\M', 'Mama''s tally piles up if you keep ignoring me', 'g');
  t := regexp_replace(t, '(?i)\m\d{1,3}\s*minutes?\s+of\s+practice\s+in\s+the\s+next\s+\d{1,3}\s*hours?\M', 'a few minutes for Mama before the day ends', 'g');
  t := regexp_replace(t, '(?i)\mvoice\s+window\s+(?:opens?|closes?)\s+(?:at|in)\s+\d', 'Mama wants to hear you soon', 'g');
  t := regexp_replace(t, '(?i)\mpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz\M', 'your voice was lower than I want', 'g');
  t := regexp_replace(t, '(?i)\mtargeting\s+(?:consistency\s+)?(?:above|below)?\s*\d+\s*Hz\M', 'lifting that voice up for me', 'g');
  t := regexp_replace(t, '(?i)\$\s*\d+\s+(?:bleeding|bleed|tax)\M', 'Mama''s meter running', 'g');
  t := regexp_replace(t, '(?i)\mbleed(?:ing)?\s*\+?\s*\$\s*\d+\M', 'Mama''s meter running', 'g');
  t := regexp_replace(t, '(?i)\m(?:bleeding\s+tax|bleed(?:ing)?\s+tax|bleed(?:ing)?|tax)\s*[:=]?\s*\$\s*\d+\M', 'Mama''s meter running', 'g');

  -- 262: clerical patterns (Today's plan, NOW/THEN, Decree:, etc.)
  t := regexp_replace(t, '(?i)\mtoday''s\s+plan\s*[:=]\s*\d+\s+moves?\M\.?', 'three things from you today, baby', 'g');
  t := regexp_replace(t, '(?i)\mtoday''s\s+plan\s*[:=]\s*\d+\s+(?:tasks?|items?)\M\.?', 'a few things from you today, baby', 'g');
  t := regexp_replace(t, '(?i)\mNOW\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'first, sweet thing — ', 'g');
  t := regexp_replace(t, '(?i)\mTHEN\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'after that, ', 'g');
  t := regexp_replace(t, '(?i)\mFINALLY\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'and then, baby, ', 'g');
  t := regexp_replace(t, '(?i)\mLATER\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'later for me, ', 'g');
  t := regexp_replace(t, '(?i)\m(?:decree|edict|directive)\s*[:\-—]\s*', 'what Mama wants from you: ', 'g');
  t := regexp_replace(t, '(?i)\mphoto\s+proof\M\.?', 'show Mama', 'g');
  t := regexp_replace(t, '(?i)\maudio\s+proof\M\.?', 'let Mama hear you', 'g');
  t := regexp_replace(t, '(?i)\mvideo\s+proof\M\.?', 'show Mama on camera', 'g');
  t := regexp_replace(t, '(?i)\mtimestamp\s+proof\M', '', 'g');
  t := regexp_replace(t, '(?i)\mon\s+file\s+(?:from\s+)?(?:\d+\s+(?:days?|hours?|weeks?)\s+ago|yesterday|today|last\s+\w+)\s*[:.,]?\s*', 'still in Mama''s head — ', 'g');
  t := regexp_replace(t, '(?i)\mon\s+file\s*[:.,]', 'still in Mama''s head:', 'g');
  t := regexp_replace(t, '(?i)\s+logged\s*[.,]?(?=\s|$)', '', 'g');
  t := regexp_replace(t, '(?i)\m(\d+)\s+days?\s+without\s+([^.]+?)\s+logged', '\1 days since Mama''s seen \2', 'g');
  t := regexp_replace(t, '(?i)\m(\d+)\s+days?\s+without\s+([^.,]+)', '\1 days since Mama''s seen \2', 'g');
  t := regexp_replace(t, '(?i)\m(\d+)\s+(?:overdue|outstanding|owed)\s+(?:tasks?|items?|directives?|commitments?)\M', 'a few things still waiting for Mama', 'g');
  t := regexp_replace(t, '(?i)\msubmission\s+required\M', 'Mama needs it from you', 'g');
  t := regexp_replace(t, '(?i)\msubmit\s+(?:by|before|within)\s+', 'send to Mama by ', 'g');
  t := regexp_replace(t, '(?i)\mfailure\s+to\s+comply\M', 'if you don''t do this for Mama', 'g');
  t := regexp_replace(t, '(?i)\mnon[\s\-]?compliance\M', 'ignoring Mama', 'g');
  t := regexp_replace(t, '(?i)\mper\s+(?:the\s+)?(?:protocol|schedule|directive)\s*[,\s]?\s*', '', 'g');

  -- ─── 265 NEW PATTERNS — what 262 missed ────────────────────────────
  -- "AFTER (today, text):" / "AFTER (tomorrow, photo):" — non-numeric deadline format
  t := regexp_replace(t, '(?i)\mAFTER\s*\(\s*(?:today|tomorrow|tonight|now|\d+\s*h\s*)?\s*,?\s*\w*\s*\)\s*[:=]?\s*', 'and then, sweet girl, ', 'g');
  -- Also "BEFORE (Xh, photo):"
  t := regexp_replace(t, '(?i)\mBEFORE\s*\(\s*(?:today|tomorrow|tonight|now|\d+\s*h\s*)?\s*,?\s*\w*\s*\)\s*[:=]?\s*', 'first, baby — ', 'g');
  -- Bare "AFTER:" / "AFTER —" — list-format header without parens
  t := regexp_replace(t, '(?i)(?:^|\s)AFTER\s*[:\-—]\s+', '. and then, baby, ', 'g');
  -- "Take the shot now" — drill-sergeant phrase
  t := regexp_replace(t, '(?i)\mtake\s+the\s+shot\s+now\b\.?', 'show Mama right now, sweet thing', 'g');
  t := regexp_replace(t, '(?i)\mtake\s+the\s+shot\b\.?', 'show Mama', 'g');
  -- "Open Today, scroll to X, do the first one" — UI-nav clerical hint
  t := regexp_replace(t, '(?i)\mopen\s+today,?\s+scroll\s+to\s+[^,.]+,?\s+do\s+the\s+first\s+one\M\.?', 'open Today and start with the first thing for me, baby', 'g');
  t := regexp_replace(t, '(?i)\mscroll\s+to\s+next\s+shots,?\s+do\s+the\s+first\s+one\M\.?', 'start with the first one for me', 'g');
  -- "The conditioning window opens at Xpm" — clinical scheduling
  t := regexp_replace(t, '(?i)\mthe\s+conditioning\s+window\s+opens?\s+(?:tonight\s+)?at\s+\d+\s*(?:am|pm)\M\.?', 'Mama''s ready for you tonight', 'g');
  -- "You'll be ready for it" — passive system framing → Mama-direct
  t := regexp_replace(t, '(?i)\myou''ll\s+be\s+ready\s+for\s+it\b\.?', 'be ready for me', 'g');

  -- Generic "Day N" residue
  t := regexp_replace(t, '\mDay\s+\d+(?=[^a-zA-Z]|$)', 'lately', 'g');
  -- Cleanup
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  t := regexp_replace(t, '\s+([.,!?])', '\1', 'g');
  t := regexp_replace(t, '[,.]{2,}', '.', 'g');
  RETURN trim(t);
END;
$$;

-- ─── DUPLICATE-OUTREACH SUPPRESSION TRIGGER ─────────────────────────
-- When a new row inserts with the same (user_id, trigger_reason) and an
-- earlier undelivered row exists, mark the older one as 'superseded' so
-- only the latest pending nudge sits in the queue. The handler-autonomous
-- generator already has its own idempotency for some triggers, but multiple
-- crons hit the same trigger_reason on different runs without coordinating.
-- This is the catch-all.

-- Add 'superseded' to the status enum if it's not already there.
DO $$
BEGIN
  -- Postgres CHECK constraint update — drop/recreate if status is constrained
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'handler_outreach_queue' AND column_name = 'status'
  ) THEN
    BEGIN
      ALTER TABLE handler_outreach_queue DROP CONSTRAINT IF EXISTS handler_outreach_queue_status_check;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END$$;

ALTER TABLE handler_outreach_queue
  ADD CONSTRAINT handler_outreach_queue_status_check
  CHECK (status IN ('pending', 'queued', 'scheduled', 'delivered', 'expired', 'failed', 'superseded', 'cancelled'));

CREATE OR REPLACE FUNCTION trg_outreach_supersede_duplicates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Skip if no trigger_reason (some inserts don't set it)
  IF NEW.trigger_reason IS NULL OR length(NEW.trigger_reason) = 0 THEN
    RETURN NEW;
  END IF;
  -- Mark prior undelivered rows with same (user_id, trigger_reason) as superseded.
  -- Only operates within Mommy persona to avoid changing therapist-mode behavior.
  IF is_mommy_user(NEW.user_id) THEN
    UPDATE handler_outreach_queue
    SET status = 'superseded'
    WHERE user_id = NEW.user_id
      AND trigger_reason = NEW.trigger_reason
      AND delivered_at IS NULL
      AND status IN ('pending', 'queued', 'scheduled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supersede_outreach_duplicates ON handler_outreach_queue;
CREATE TRIGGER supersede_outreach_duplicates
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_supersede_duplicates();

-- ─── Re-backfill — clean current state ──────────────────────────────
-- Apply the new cleanup pass to existing pending rows.
UPDATE handler_outreach_queue
SET message = mommy_voice_cleanup(message)
WHERE status IN ('pending', 'queued', 'scheduled')
  AND is_mommy_user(user_id);

UPDATE handler_decrees
SET edict = mommy_voice_cleanup(edict)
WHERE COALESCE(status, 'active') IN ('active', 'pending', 'open')
  AND is_mommy_user(user_id);

UPDATE arousal_touch_tasks
SET prompt = mommy_voice_cleanup(prompt)
WHERE completed_at IS NULL
  AND is_mommy_user(user_id);

-- Backfill: dedupe existing pending rows so the queue stops showing
-- multiple copies of the same trigger_reason. Keep the most-recent.
WITH ranked AS (
  SELECT id, user_id, trigger_reason,
         row_number() OVER (PARTITION BY user_id, trigger_reason ORDER BY scheduled_for DESC, created_at DESC) AS rn
  FROM handler_outreach_queue
  WHERE delivered_at IS NULL
    AND status IN ('pending', 'queued', 'scheduled')
    AND trigger_reason IS NOT NULL
)
UPDATE handler_outreach_queue
SET status = 'superseded'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  AND is_mommy_user(user_id);
