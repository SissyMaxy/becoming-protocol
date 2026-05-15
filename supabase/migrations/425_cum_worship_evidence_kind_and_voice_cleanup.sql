-- 425 — Cum-worship trigger sets evidence_kind explicitly; Mama-voice
-- cleanup gains "Brief #N overdue by X hours" + "Submit it now" tail.
--
-- Two coupled changes:
--
--   1. trg_cum_worship_on_release (migration 423) gets one extra column
--      in its INSERT: evidence_kind='video'. The 424 BEFORE INSERT
--      trigger would have inferred it from message text in most cases,
--      but the directive bodies are terse and don't always include the
--      word "record" — the protocol always expects video for these
--      releases. Explicit at the generation site is more correct.
--
--   2. mommy_voice_cleanup gains patterns flagged from the user's live
--      UI 2026-05-14: "Brief #2 is overdue by 18 hours" + "Submit it now."
--      tail. The 269 pass cleaned "Brief #N is sitting there" / "Submit
--      it now" but missed the "overdue by N hours/minutes" overdue
--      counter shape. Add it.

-- ─── 1. Cum-worship trigger evidence_kind ────────────────────────────
CREATE OR REPLACE FUNCTION trg_cum_worship_on_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_settings RECORD;
  v_phase_def RECORD;
  v_phrase TEXT;
  v_partner_context TEXT;
  v_directive TEXT;
  v_message TEXT;
BEGIN
  SELECT enabled, current_phase, partner_context_label, paused_until
  INTO v_settings FROM cum_worship_settings WHERE user_id = NEW.user_id;
  IF v_settings IS NULL OR NOT v_settings.enabled THEN RETURN NEW; END IF;
  IF v_settings.paused_until IS NOT NULL AND v_settings.paused_until > now() THEN RETURN NEW; END IF;

  UPDATE cum_worship_settings
  SET last_event_at = now(), updated_at = now()
  WHERE user_id = NEW.user_id;

  SELECT phase, phase_name, solo_directive, partnered_directive, hypno_mantra
  INTO v_phase_def FROM cum_worship_ladder WHERE phase = v_settings.current_phase;
  IF v_phase_def IS NULL THEN RETURN NEW; END IF;

  SELECT phrase INTO v_phrase
  FROM cum_worship_phrase_library
  WHERE phase = v_settings.current_phase AND active = TRUE
  ORDER BY surface_weight DESC, random() LIMIT 1;

  v_partner_context := COALESCE(NEW.context, 'solo');
  IF v_partner_context ILIKE '%gina%' OR v_partner_context ILIKE '%wife%'
     OR v_partner_context ILIKE '%partner%' OR v_partner_context = 'partnered' THEN
    v_directive := v_phase_def.partnered_directive;
  ELSIF v_partner_context ILIKE '%sniffies%' OR v_partner_context ILIKE '%anon%' THEN
    v_directive := v_phase_def.partnered_directive;
  ELSE
    v_directive := v_phase_def.solo_directive;
  END IF;

  v_message := v_directive || E'\n\n' || COALESCE(v_phrase, v_phase_def.hypno_mantra);

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, source, kind,
    scheduled_for, expires_at, context_data, evidence_kind
  ) VALUES (
    NEW.user_id, v_message, 'high',
    'cum_worship_release:' || NEW.id::text,
    'cum_worship', 'cum_worship_directive',
    now(), now() + interval '6 hours',
    jsonb_build_object('orgasm_log_id', NEW.id, 'phase', v_settings.current_phase,
      'phase_name', v_phase_def.phase_name, 'release_type', NEW.release_type,
      'context', v_partner_context),
    'video'
  );

  INSERT INTO cum_worship_events (
    user_id, occurred_at, context, partner_label, phase_at_event,
    directive_text, mantra_used, source_arousal_log_id
  ) VALUES (
    NEW.user_id, now(),
    CASE WHEN v_partner_context = 'solo' THEN 'solo'
         WHEN v_partner_context ILIKE '%sniffies%' OR v_partner_context ILIKE '%anon%' THEN 'anonymous'
         ELSE 'partnered' END,
    CASE WHEN v_partner_context IN ('solo','partnered') THEN v_settings.partner_context_label ELSE v_partner_context END,
    v_settings.current_phase, v_directive, v_phrase, NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$fn$;

-- ─── 2. Voice cleanup: overdue counter + Submit it now leak ──────────
-- Wraps 269 with two new patterns. Re-defines mommy_voice_cleanup with
-- everything from 269 + the new lines. (Postgres has no FUNCTION ALTER
-- pattern — CREATE OR REPLACE is the only way.)
CREATE OR REPLACE FUNCTION mommy_voice_cleanup(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t TEXT := input;
  m TEXT[];
BEGIN
  IF t IS NULL OR length(t) = 0 THEN RETURN t; END IF;

  -- ─── Telemetry passes (carried from 269) ──────────────────────────
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

  -- Clerical (262/265/266)
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
  t := regexp_replace(t, '(?i)\m\d+\s+"\w+"\s+slips?\s+in\s+\d+\s+days?\M\.?', 'you''ve been slipping a lot lately, baby', 'g');
  t := regexp_replace(t, '(?i)\m\d+\s+slips?\s+in\s+(?:the\s+last\s+)?\d+\s+days?\M', 'you''ve been slipping a lot lately', 'g');
  t := regexp_replace(t, '(?i)\mthe\s+Handler\s+is\s+watching(?:\s+the\s+pattern)?\M\.?', 'Mama sees what you''re doing', 'g');
  t := regexp_replace(t, '(?i)\mHandler\s+is\s+watching\M', 'Mama is watching', 'g');
  t := regexp_replace(t, '(?i)\bthe\s+Handler\b', 'Mama', 'g');
  t := regexp_replace(t, '(?i)\myou\s+let\s+(?:the|your|this)\s+decree\s+(?:die|expire|lapse)\M\.?', 'you let Mama down on this one, sweet thing', 'g');
  t := regexp_replace(t, '(?i)\mthe\s+decree\b', 'what Mama set for you', 'g');
  t := regexp_replace(t, '(?i)\myour\s+decree\b', 'what Mama gave you', 'g');
  t := regexp_replace(t, '(?i)\mthis\s+decree\b', 'this one Mama gave you', 'g');
  t := regexp_replace(t, '(?i)\mdecrees?\b\.?(?=\s|$)', 'what Mama wants from you', 'g');
  t := regexp_replace(t, '(?i)(?:^|\.\s+)Consequence\s*[:\-—]?\s*', '. Here''s what Mama''s doing about it: ', 'g');
  t := regexp_replace(t, '(?i)\m(?:past\s+deadline|deadline\s+passed)\M\.?', 'past when Mama wanted it', 'g');
  t := regexp_replace(t, '(?i)\mpunishment\s+queue\M', 'what Mama''s making you sit with', 'g');
  t := regexp_replace(t, '(?i)\mcompliance\s+score\M', 'how you''ve been keeping up for Mama', 'g');

  -- 269 — chat-output leaks 2026-05-06
  t := regexp_replace(t, '(?i)\msend\s+it\s+now\M\.?', 'send it to Mama now, sweet thing', 'g');
  t := regexp_replace(t, '(?i)\msubmit\s+it\s+now\M\.?', 'send it to Mama now, baby', 'g');
  t := regexp_replace(t, '(?i)\msubmit\s+(?:it|that|this)\s+(?:by|before|within)\s+', 'send it to Mama by ', 'g');
  t := regexp_replace(t, '(?i)\mthe\s+window\s+closes\M', 'Mama''s not waiting forever', 'g');
  t := regexp_replace(t, '(?i)\mwindow\s+closes\s+in\s+\d+\s+(?:minutes?|hours?|min|hr)\M\.?', 'Mama wants this soon', 'g');
  t := regexp_replace(t, '(?i)\mlocked\s+out\s+of\s+conditioning(?:\s+tonight)?\M', 'Mama won''t open up to you tonight', 'g');
  t := regexp_replace(t, '(?i)\mconditioning\s+window\s+(?:opens?|closes?)\M', 'Mama''s window for you', 'g');
  t := regexp_replace(t, '(?i)\mbrief\s+#?\d+\s+is\s+(?:also\s+)?(?:sitting\s+there|waiting|pending|queued)\M\.?', 'there''s another thing Mama left waiting for you, baby', 'g');
  t := regexp_replace(t, '(?i)\mbrief\s+#?\d+\M', 'what Mama left for you', 'g');
  t := regexp_replace(t, '(?:^|[.!?]\s+)Move\.\s*$', ' Now, sweet thing.', 'g');
  t := regexp_replace(t, '(?:^|\s)Move\.\s+', ' Now, baby. ', 'g');
  t := regexp_replace(t, '(?i)\mopen\s+(?:the|your)\s+camera\M\.?', 'Mama wants to see you, baby — camera on', 'g');
  t := regexp_replace(t, '(?i)\mopen\s+(?:the|your)\s+recorder\M\.?', 'Mama wants to hear you, baby — record', 'g');

  -- ─── 425 NEW (chat leaks 2026-05-14) ────────────────────────────
  -- "Brief #2 is overdue by 18 hours"
  t := regexp_replace(t, '(?i)\m(?:brief\s+#?\d+|what\s+mama\s+left\s+for\s+you)\s+is\s+overdue\s+by\s+\d+\s+(?:hours?|hrs?|days?|minutes?|mins?)\M\.?',
                      'Mama''s been waiting on you, sweet thing', 'g');
  t := regexp_replace(t, '(?i)\moverdue\s+by\s+\d+\s+(?:hours?|hrs?|days?|minutes?|mins?)\M\.?',
                      'past when Mama wanted it', 'g');
  -- "Submit it now" tail (extends 269 to be more aggressive at sentence end)
  t := regexp_replace(t, '(?i)(?:^|\.\s+)Submit\s+it\s+now\b\.?', '. Send it to Mama now, baby.', 'g');
  -- "Record yourself saying X — full sentence, no mumbling." — keep the
  -- demand-for-clarity but Mama-ify the framing
  t := regexp_replace(t, '(?i)\mrecord\s+yourself\s+saying\b',
                      'show Mama on camera, baby — say', 'g');
  t := regexp_replace(t, '(?i)\m(?:full\s+sentence|no\s+mumbling|loud\s+and\s+clear)(?:\s*,\s*(?:full\s+sentence|no\s+mumbling|loud\s+and\s+clear))*\M\.?',
                      'loud enough for Mama to hear every word', 'g');

  -- Generic Day N + cleanup
  t := regexp_replace(t, '\mDay\s+\d+(?=[^a-zA-Z]|$)', 'lately', 'g');
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  t := regexp_replace(t, '\s+([.,!?])', '\1', 'g');
  t := regexp_replace(t, '[,.]{2,}', '.', 'g');
  RETURN trim(t);
END;
$$;

-- Re-clean any pending outreach + decrees so the user's live UI gets
-- the new patterns immediately.
UPDATE handler_outreach_queue
SET message = mommy_voice_cleanup(message)
WHERE status IN ('pending', 'queued', 'scheduled')
  AND is_mommy_user(user_id);

UPDATE handler_decrees
SET edict = mommy_voice_cleanup(edict)
WHERE COALESCE(status, 'active') IN ('active', 'pending', 'open')
  AND is_mommy_user(user_id);
