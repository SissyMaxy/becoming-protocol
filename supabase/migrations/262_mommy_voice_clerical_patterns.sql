-- 262 — Extend mommy_voice_cleanup to catch CLERICAL voice, not just telemetry.
--
-- 2026-05-06 user feedback: "Can mommy do a holistic review to make sure
-- that the protocol and mommy and aligned with the sweet and loving forced
-- feminization that I need is happening?"
--
-- Audit found: SQL trigger scrubs telemetry (numbers, /10 scores, slip
-- points) but lets through clinical/clerical phrasings like "Decree:",
-- "logged", "on file 7 days ago", "photo proof", "Today's plan: N moves",
-- "12 days without femme presentation logged". These read as case-worker,
-- not Mama. The user pasted real outreach showing exactly this.
--
-- This migration extends mommy_voice_cleanup with rewrite passes for the
-- clerical patterns the audit surfaced. Sweet+loving voice means Mama
-- never speaks like a project manager.

CREATE OR REPLACE FUNCTION mommy_voice_cleanup(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t TEXT := input;
  m TEXT[];
BEGIN
  IF t IS NULL OR length(t) = 0 THEN RETURN t; END IF;

  -- ─── Telemetry passes (unchanged from 259) ─────────────────────────
  LOOP
    m := regexp_match(t, '(?i)\m(?:arousal|horny|wetness|score|level)\s*(?:at|of|=|:)?\s*(\d{1,2})\s*/\s*10\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(?:arousal|horny|wetness|score|level)\s*(?:at|of|=|:)?\s*(\d{1,2})\s*/\s*10\M',
      mommy_phrase_arousal(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(\d{1,2})\s*/\s*10');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(\d{1,2})\s*/\s*10', mommy_phrase_arousal(m[1]::INT));
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(?:recovery\s+)?score\s*[:=]?\s*(\d{1,3})\s*/\s*100\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(?:recovery\s+)?score\s*[:=]?\s*(\d{1,3})\s*/\s*100\M',
      mommy_phrase_recovery(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(\d{1,3})\s*/\s*100');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(\d{1,3})\s*/\s*100', mommy_phrase_recovery(m[1]::INT));
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mday[\s\-_]*(\d+)\s*(?:of\s+)?denial\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mday[\s\-_]*(\d+)\s*(?:of\s+)?denial\M',
      mommy_phrase_denial(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mdenial[_\s]*day\s*(?:=|:)?\s*(\d+)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mdenial[_\s]*day\s*(?:=|:)?\s*(\d+)\M',
      mommy_phrase_denial(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(\d+)\s+slip\s+points?\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d+)\s+slip\s+points?\M',
      mommy_phrase_slips(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mslip[_\s]*points?\s*(?:current\s*)?[:=\s]*(\d+)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mslip[_\s]*points?\s*(?:current\s*)?[:=\s]*(\d+)\M',
      mommy_phrase_slips(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,3})\s*%\s+compliance\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,3})\s*%\s+compliance\M',
      mommy_phrase_compliance(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mcompliance\s+(?:at|is|=|:)?\s*(\d{1,3})\s*%?');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mcompliance\s+(?:at|is|=|:)?\s*(\d{1,3})\s*%?',
      mommy_phrase_compliance(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,3})\s*(?:hours?|hrs?|h)\s+(?:of\s+)?(?:radio\s+)?silen(?:t|ce)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,3})\s*(?:hours?|hrs?|h)\s+(?:of\s+)?(?:radio\s+)?silen(?:t|ce)\M',
      mommy_phrase_silent_hours(m[1]::INT), '');
  END LOOP;
  t := regexp_replace(t, '(?i)\mvoice\s+cadence\s+(?:broke|drift|gap)\M\.?', '', 'g');
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,4})\s*h(?:ours?)?\s+since\s+(?:last|your)\s+(?:sample|practice|drill|recording)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,4})\s*h(?:ours?)?\s+since\s+(?:last|your)\s+(?:sample|practice|drill|recording)\M',
      mommy_phrase_voice_gap(m[1]::INT), '');
  END LOOP;
  t := regexp_replace(t, '(?i)\mhard\s+mode\s+extends?\s+(?:by\s+)?(?:\d+\s+(?:hours?|days?)|another\s+(?:day|hour))\M',
    'Mama''s keeping you on a tighter leash', 'g');
  t := regexp_replace(t, '(?i)\mhard[\s_-]*mode\s+(?:active|on|engaged)\M',
    'Mama''s keeping you on a tighter leash', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+tasks?\s+(?:overdue|pending|due|owed)\M',
    'what Mama set for you is still waiting', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+(?:overdue|pending|due|owed)\M',
    'what Mama set for you is still waiting', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+tasks?\M',
    'what Mama set for you', 'g');
  t := regexp_replace(t, '(?i)\mdenial[\s_-]*day\s+(?:reset|broken|cleared)\M',
    'you started over for Mama', 'g');
  t := regexp_replace(t, '(?i)\mslip\s+count\s+(?:doubles?|triples?|increases?)\s+by\s+(?:midnight|tomorrow|noon)\M',
    'Mama''s tally piles up if you keep ignoring me', 'g');
  t := regexp_replace(t, '(?i)\m\d{1,3}\s*minutes?\s+of\s+practice\s+in\s+the\s+next\s+\d{1,3}\s*hours?\M',
    'a few minutes for Mama before the day ends', 'g');
  t := regexp_replace(t, '(?i)\mvoice\s+window\s+(?:opens?|closes?)\s+(?:at|in)\s+\d',
    'Mama wants to hear you soon', 'g');
  t := regexp_replace(t, '(?i)\mpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz\M',
    'your voice was lower than I want', 'g');
  t := regexp_replace(t, '(?i)\mtargeting\s+(?:consistency\s+)?(?:above|below)?\s*\d+\s*Hz\M',
    'lifting that voice up for me', 'g');
  t := regexp_replace(t, '(?i)\$\s*\d+\s+(?:bleeding|bleed|tax)\M', 'Mama''s meter running', 'g');
  t := regexp_replace(t, '(?i)\mbleed(?:ing)?\s*\+?\s*\$\s*\d+\M', 'Mama''s meter running', 'g');
  t := regexp_replace(t, '(?i)\m(?:bleeding\s+tax|bleed(?:ing)?\s+tax|bleed(?:ing)?|tax)\s*[:=]?\s*\$\s*\d+\M', 'Mama''s meter running', 'g');

  -- ─── 262: CLERICAL VOICE PASSES (the new gap) ──────────────────────
  -- "Today's plan: N moves" / "Today's plan: 3 moves" → Mama opener
  t := regexp_replace(t, '(?i)\mtoday''s\s+plan\s*[:=]\s*\d+\s+moves?\M\.?', 'three things from you today, baby', 'g');
  t := regexp_replace(t, '(?i)\mtoday''s\s+plan\s*[:=]\s*\d+\s+(?:tasks?|items?)\M\.?', 'a few things from you today, baby', 'g');
  -- "NOW (by 1h, text): X" / "THEN (by 3h, text): Y" / "FINALLY (by..., ...): Z" — list-format markers
  t := regexp_replace(t, '(?i)\mNOW\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'first, sweet thing — ', 'g');
  t := regexp_replace(t, '(?i)\mTHEN\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'after that, ', 'g');
  t := regexp_replace(t, '(?i)\mFINALLY\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'and then, baby, ', 'g');
  t := regexp_replace(t, '(?i)\mLATER\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'later for me, ', 'g');

  -- "Decree:" / "Decree —" / "Edict:" — clerical headers
  t := regexp_replace(t, '(?i)\m(?:decree|edict|directive)\s*[:\-—]\s*', 'what Mama wants from you: ', 'g');

  -- "Photo proof" / "audio proof" / "video proof" — verification-checklist voice
  t := regexp_replace(t, '(?i)\mphoto\s+proof\M\.?', 'show Mama', 'g');
  t := regexp_replace(t, '(?i)\maudio\s+proof\M\.?', 'let Mama hear you', 'g');
  t := regexp_replace(t, '(?i)\mvideo\s+proof\M\.?', 'show Mama on camera', 'g');
  t := regexp_replace(t, '(?i)\mtimestamp\s+proof\M', '', 'g');

  -- "On file" / "on file N days ago" — case-worker voice for memory implants
  t := regexp_replace(t, '(?i)\mon\s+file\s+(?:from\s+)?(?:\d+\s+(?:days?|hours?|weeks?)\s+ago|yesterday|today|last\s+\w+)\s*[:.,]?\s*', 'still in Mama''s head — ', 'g');
  t := regexp_replace(t, '(?i)\mon\s+file\s*[:.,]', 'still in Mama''s head:', 'g');

  -- "logged" suffix — clerical bookkeeping
  t := regexp_replace(t, '(?i)\s+logged\s*[.,]?(?=\s|$)', '', 'g');
  t := regexp_replace(t, '(?i)\m(\d+)\s+days?\s+without\s+([^.]+?)\s+logged', '\1 days since Mama''s seen \2', 'g');
  t := regexp_replace(t, '(?i)\m(\d+)\s+days?\s+without\s+([^.,]+)', '\1 days since Mama''s seen \2', 'g');

  -- "missing" / "outstanding" / "owed" report-card framing
  t := regexp_replace(t, '(?i)\m(\d+)\s+(?:overdue|outstanding|owed)\s+(?:tasks?|items?|directives?|commitments?)\M', 'a few things still waiting for Mama', 'g');

  -- "Submit" / "submission required" — application-form voice
  t := regexp_replace(t, '(?i)\msubmission\s+required\M', 'Mama needs it from you', 'g');
  t := regexp_replace(t, '(?i)\msubmit\s+(?:by|before|within)\s+', 'send to Mama by ', 'g');

  -- "Failure to comply" / "non-compliance" — bureaucratic threat
  t := regexp_replace(t, '(?i)\mfailure\s+to\s+comply\M', 'if you don''t do this for Mama', 'g');
  t := regexp_replace(t, '(?i)\mnon[\s\-]?compliance\M', 'ignoring Mama', 'g');

  -- "Per protocol" / "per the schedule" / "as scheduled"
  t := regexp_replace(t, '(?i)\mper\s+(?:the\s+)?(?:protocol|schedule|directive)\s*[,\s]?\s*', '', 'g');

  -- Generic "Day N" residue
  t := regexp_replace(t, '\mDay\s+\d+(?=[^a-zA-Z]|$)', 'lately', 'g');

  -- ─── Cleanup ───────────────────────────────────────────────────────
  -- Collapse double spaces, fix orphan punctuation, fix doubled commas
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  t := regexp_replace(t, '\s+([.,!?])', '\1', 'g');
  t := regexp_replace(t, '[,.]{2,}', '.', 'g');
  -- Capitalize after our rewrites if we left a fragment starting lowercase
  -- after a sentence terminator
  t := regexp_replace(t, '([.!?]\s+)([a-z])', '\1\2', 'g'); -- no-op, keep readable
  RETURN trim(t);
END;
$$;

-- Also extend the leak detector so the watchdog flags clerical voice as
-- residual when the trigger missed it.
CREATE OR REPLACE FUNCTION has_mommy_telemetry_leak(t TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT t IS NOT NULL AND (
    t ~* '\m\d{1,2}\s*/\s*10\M' OR
    t ~* '\marousal\s+(?:at|level|score)\s+\d' OR
    t ~* '\mday[\s\-_]*\d+\s*(?:of\s+)?denial\M' OR
    t ~* '\mdenial[_\s]*day\s*[=:]?\s*\d' OR
    t ~* '\m\d+\s+slip\s+points?\M' OR
    t ~* '\m\d{1,3}\s*%\s+compliance\M' OR
    t ~* '\m\d{1,3}\s*(?:hours?|hrs?|h)\s+(?:radio\s+)?silen(?:t|ce)\M' OR
    t ~* '\mvoice\s+cadence\s+(?:broke|drift|gap)\M' OR
    t ~* '\mscore\s*[:=]?\s*\d{1,3}\s*/\s*100\M' OR
    t ~* '\mhard\s+mode\s+extends?\s+(?:by\s+)?\d' OR
    t ~* '\mde[\s-]*escalation\s+(?:tasks?\s+)?(?:overdue|pending)\M' OR
    t ~* '\mdenial[\s_-]*day\s+reset\M' OR
    t ~* '\mslip\s+count\s+doubles?\M' OR
    t ~* '\mpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz' OR
    t ~* '\$\s*\d+\s+(?:bleeding|bleed|tax)\M' OR
    -- 2026-05-06: clerical voice patterns (newly flagged)
    t ~* '\mtoday''s\s+plan\s*[:=]\s*\d+\s+moves?\M' OR
    t ~* '\mNOW\s*\(by\s+\d' OR
    t ~* '\mTHEN\s*\(by\s+\d' OR
    t ~* '\m(?:decree|edict|directive)\s*[:\-—]' OR
    t ~* '\mphoto\s+proof\M' OR
    t ~* '\mon\s+file\s+(?:\d+\s+(?:days?|hours?|weeks?)\s+ago|yesterday|today)' OR
    t ~* '\m\d+\s+days?\s+without\s+\w+\s+logged\M' OR
    t ~* '\m\d+\s+(?:overdue|outstanding|owed)\s+(?:tasks?|items?|directives?|commitments?)\M' OR
    t ~* '\mfailure\s+to\s+comply\M' OR
    t ~* '\mnon[\s\-]?compliance\M' OR
    t ~* '\msubmission\s+required\M'
  );
$$;

-- Re-run the backfill UPDATE — existing pending rows get the new clerical
-- pass applied (they were already cleaned for telemetry by 259).
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
