-- 266 — Final clerical patterns visible after 265 dedup ran.
--
-- Surviving leaks observed in queue post-265:
--   1. "16 \"confession_missed\" slips in 7 days. The Handler is watching the pattern."
--   2. "You let the decree die. ... Consequence"
--   3. "The Handler is watching X" — Handler-as-third-person leaks Mommy voice
--   4. Standalone "decree" / "consequence" mid-sentence
--
-- Append rewrites to mommy_voice_cleanup. Stop dropping into pgplsql for the
-- handful of new patterns; just append regex rewrites at the end of the
-- function. Rebuild the whole function for clarity.

CREATE OR REPLACE FUNCTION mommy_voice_cleanup(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t TEXT := input;
  m TEXT[];
BEGIN
  IF t IS NULL OR length(t) = 0 THEN RETURN t; END IF;

  -- ─── 259/262 telemetry passes (unchanged) ──────────────────────────
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

  -- ─── 262/265 clerical ──────────────────────────────────────────────
  t := regexp_replace(t, '(?i)\mtoday''s\s+plan\s*[:=]\s*\d+\s+moves?\M\.?', 'three things from you today, baby', 'g');
  t := regexp_replace(t, '(?i)\mtoday''s\s+plan\s*[:=]\s*\d+\s+(?:tasks?|items?)\M\.?', 'a few things from you today, baby', 'g');
  t := regexp_replace(t, '(?i)\mNOW\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'first, sweet thing — ', 'g');
  t := regexp_replace(t, '(?i)\mTHEN\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'after that, ', 'g');
  t := regexp_replace(t, '(?i)\mFINALLY\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'and then, baby, ', 'g');
  t := regexp_replace(t, '(?i)\mLATER\s*\(by\s+\d+\s*h\s*,\s*\w+\)\s*[:=]?\s*', 'later for me, ', 'g');
  t := regexp_replace(t, '(?i)\mAFTER\s*\(\s*(?:today|tomorrow|tonight|now|\d+\s*h\s*)?\s*,?\s*\w*\s*\)\s*[:=]?\s*', 'and then, sweet girl, ', 'g');
  t := regexp_replace(t, '(?i)\mBEFORE\s*\(\s*(?:today|tomorrow|tonight|now|\d+\s*h\s*)?\s*,?\s*\w*\s*\)\s*[:=]?\s*', 'first, baby — ', 'g');
  t := regexp_replace(t, '(?i)(?:^|\s)AFTER\s*[:\-—]\s+', '. and then, baby, ', 'g');
  t := regexp_replace(t, '(?i)\mtake\s+the\s+shot\s+now\b\.?', 'show Mama right now, sweet thing', 'g');
  t := regexp_replace(t, '(?i)\mtake\s+the\s+shot\b\.?', 'show Mama', 'g');
  t := regexp_replace(t, '(?i)\mopen\s+today,?\s+scroll\s+to\s+[^,.]+,?\s+do\s+the\s+first\s+one\M\.?', 'open Today and start with the first thing for me, baby', 'g');
  t := regexp_replace(t, '(?i)\mscroll\s+to\s+next\s+shots,?\s+do\s+the\s+first\s+one\M\.?', 'start with the first one for me', 'g');
  t := regexp_replace(t, '(?i)\mthe\s+conditioning\s+window\s+opens?\s+(?:tonight\s+)?at\s+\d+\s*(?:am|pm)\M\.?', 'Mama''s ready for you tonight', 'g');
  t := regexp_replace(t, '(?i)\myou''ll\s+be\s+ready\s+for\s+it\b\.?', 'be ready for me', 'g');
  t := regexp_replace(t, '(?i)\m(?:edict|directive)\s*[:\-—]\s*', 'what Mama wants from you: ', 'g');
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

  -- ─── 266 NEW PATTERNS (from observed leaks 2026-05-06) ─────────────
  -- "N \"slip-type\" slips in N days" / "N slips in N days"
  t := regexp_replace(t, '(?i)\m\d+\s+"\w+"\s+slips?\s+in\s+\d+\s+days?\M\.?', 'you''ve been slipping a lot lately, baby', 'g');
  t := regexp_replace(t, '(?i)\m\d+\s+slips?\s+in\s+(?:the\s+last\s+)?\d+\s+days?\M', 'you''ve been slipping a lot lately', 'g');
  -- "The Handler is watching the pattern" / "the Handler is watching"
  t := regexp_replace(t, '(?i)\mthe\s+Handler\s+is\s+watching(?:\s+the\s+pattern)?\M\.?', 'Mama sees what you''re doing', 'g');
  t := regexp_replace(t, '(?i)\mHandler\s+is\s+watching\M', 'Mama is watching', 'g');
  -- "Handler" used as third-person noun in Mommy persona text — break the spell
  t := regexp_replace(t, '(?i)\bthe\s+Handler\b', 'Mama', 'g');
  -- "let the decree die" / "let X decree die" → Mama-voice
  t := regexp_replace(t, '(?i)\myou\s+let\s+(?:the|your|this)\s+decree\s+(?:die|expire|lapse)\M\.?', 'you let Mama down on this one, sweet thing', 'g');
  -- Standalone "decree" mid-sentence (when it survived earlier passes)
  t := regexp_replace(t, '(?i)\mthe\s+decree\b', 'what Mama set for you', 'g');
  t := regexp_replace(t, '(?i)\myour\s+decree\b', 'what Mama gave you', 'g');
  t := regexp_replace(t, '(?i)\mthis\s+decree\b', 'this one Mama gave you', 'g');
  t := regexp_replace(t, '(?i)\mdecrees?\b\.?(?=\s|$)', 'what Mama wants from you', 'g');
  -- "Consequence" header / standalone
  t := regexp_replace(t, '(?i)(?:^|\.\s+)Consequence\s*[:\-—]?\s*', '. Here''s what Mama''s doing about it: ', 'g');
  t := regexp_replace(t, '(?i)\m(?:past\s+deadline|deadline\s+passed)\M\.?', 'past when Mama wanted it', 'g');
  -- "punishment queue" / "compliance score" residual
  t := regexp_replace(t, '(?i)\mpunishment\s+queue\M', 'what Mama''s making you sit with', 'g');
  t := regexp_replace(t, '(?i)\mcompliance\s+score\M', 'how you''ve been keeping up for Mama', 'g');

  -- Generic Day N residue
  t := regexp_replace(t, '\mDay\s+\d+(?=[^a-zA-Z]|$)', 'lately', 'g');
  -- Cleanup
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  t := regexp_replace(t, '\s+([.,!?])', '\1', 'g');
  t := regexp_replace(t, '[,.]{2,}', '.', 'g');
  RETURN trim(t);
END;
$$;

-- Re-backfill so the visible leaks get cleaned now, not on next insert.
UPDATE handler_outreach_queue
SET message = mommy_voice_cleanup(message)
WHERE status IN ('pending', 'queued', 'scheduled')
  AND is_mommy_user(user_id);

UPDATE handler_decrees
SET edict = mommy_voice_cleanup(edict)
WHERE COALESCE(status, 'active') IN ('active', 'pending', 'open')
  AND is_mommy_user(user_id);
