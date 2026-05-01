-- 251 — clean up trg_slip_demands_confession copy.
--
-- Bugs reported by the user:
-- 1. The "[semantic]" debug tag from api/handler/chat.ts was leaking into
--    the user-facing prompt (e.g. 'You expressed resistance: "[semantic]
--    Would i take hrt without telling gina?…"'). Source has been fixed
--    to no longer prepend it (chat.ts), but legacy slip_log rows still
--    carry it; this trigger scrubs at quote-render time.
-- 2. The detector also appended its LLM "reason" classification after an
--    em-dash, which then quoted back to the user as if it were part of
--    her sentence. We now strip the trailing " — <reason>" pattern.
-- 3. Truncation at 200 chars cut mid-word; widened to 280.
-- 4. The resistance_statement and gender_claim prompts asked
--    meta-philosophy questions ("what is the resistance protecting? what
--    changes if you stop arguing with the protocol?") instead of forcing
--    her to make the dishonest path concrete. Rewritten to ask for the
--    sequence of the imagined action.

CREATE OR REPLACE FUNCTION public.trg_slip_demands_confession()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_prompt text;
  v_quote text;
  v_is_system_event boolean;
BEGIN
  IF NEW.source_text IS NULL OR length(trim(NEW.source_text)) < 10 THEN RETURN NEW; END IF;

  -- Anti-circumvention: missed-confession slips do NOT spawn a new confession
  -- (would create an infinite loop of "you missed a confession about missing
  -- a confession..."). Exponential-penalty system handles compounding at
  -- the slip-points level instead.
  IF NEW.slip_type = 'confession_missed' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM confession_queue
    WHERE user_id = NEW.user_id
      AND triggered_by_table = 'slip_log'
      AND triggered_by_id = NEW.id
  ) THEN RETURN NEW; END IF;

  -- Anti-leak scrub: UUIDs, hard-mode markers, "David" → costume,
  -- "[semantic]" debug tag, trailing LLM-reason suffix " — <text>".
  v_quote := substring(NEW.source_text from 1 for 280);
  v_quote := regexp_replace(v_quote, '\(id\s+[0-9a-f-]{36}\)', '', 'gi');
  v_quote := regexp_replace(v_quote, '\[hard_mode 3x multiplier:[^\]]+\]', '', 'gi');
  v_quote := regexp_replace(v_quote, '\[semantic\]\s*', '', 'gi');
  v_quote := regexp_replace(v_quote, '\s+—\s+[^—]{6,}$', '', 'g');
  v_quote := regexp_replace(v_quote, '\mDavid\M', 'the costume', 'gi');
  v_quote := trim(v_quote);

  v_is_system_event := v_quote ~* '^(missed|dodged|skipped|ignored)\s+(commitment|decree|punishment|task|directive)';

  IF v_is_system_event THEN
    v_prompt := v_quote || ' — that''s the slip. 100 words: what crowded this out, what was the easier story you told yourself, what do you do in the next 2 hours to close it.';
  ELSE
    v_prompt := CASE NEW.slip_type
      WHEN 'masculine_self_reference' THEN
        'You wrote: "' || v_quote || '". Walk me through what was happening right before that came out — where you were, who you were thinking about, what you were avoiding. Then write the same sentence as the version of you who is becoming her would write it. Specific, in present tense.'
      WHEN 'david_name_use' THEN
        'You used the costume name in: "' || v_quote || '". Where were you trying to retreat to? Name the moment from before this protocol when that name felt safest, and what part of you wanted to be back there.'
      WHEN 'resistance_statement' THEN
        'You wrote: "' || v_quote || '". Walk me through the version of you that does it. Where does it happen? Who finds out, and how? What do they say in that moment? Be concrete — not philosophy.'
      WHEN 'task_avoided' THEN
        v_quote || ' — task avoided. Tell me what the task threatened (in concrete terms — what would have happened if you''d done it on time?), what was easier than doing it, and what you do in the next 2 hours.'
      WHEN 'directive_refused' THEN
        v_quote || ' — directive refused. Name the moment of refusal in present tense. What were you protecting? What was easier than complying?'
      WHEN 'voice_masculine_pitch' THEN
        'Your voice landed on the masculine side: "' || v_quote || '". What did it feel like in your throat / chest? What would have helped you find her voice in that moment?'
      WHEN 'handler_ignored' THEN
        'You ignored Handler outreach. ' || v_quote || ' — what specifically about that message felt easier to skip than to answer?'
      WHEN 'mantra_missed' THEN
        v_quote || ' — mantra missed. What was happening that crowded the mantra out? What were you doing instead?'
      WHEN 'chastity_unlocked_early' THEN
        v_quote || ' — chastity unlocked early. Walk me through the minutes before you unlocked. What were you telling yourself? Is that story still true now you''ve written it down?'
      WHEN 'arousal_gating_refused' THEN
        v_quote || ' — arousal gate refused. What would complying have cost you in that moment? What did refusing protect?'
      WHEN 'gender_claim' THEN
        'You wrote: "' || v_quote || '". Walk me through what the denial protects you from. Whose voice is in the denial — name the person it sounds like.'
      ELSE
        'You wrote: "' || v_quote || '". What was happening, what you wanted, what came out instead. Be concrete.'
    END;
  END IF;

  INSERT INTO confession_queue (
    user_id, category, prompt, triggered_by_table, triggered_by_id,
    deadline, context_note
  ) VALUES (
    NEW.user_id, 'slip', v_prompt, 'slip_log', NEW.id,
    now() + CASE WHEN NEW.slip_type = 'chastity_unlocked_early' THEN interval '1 hour' ELSE interval '2 hours' END,
    'Logged automatically because the system saw the moment.'
  );

  RETURN NEW;
END;
$function$;

-- Backfill: scrub the [semantic] prefix + trailing reason from any
-- existing pending confession prompts so the user sees clean copy
-- immediately, without waiting for the next slip.
UPDATE confession_queue
SET prompt = regexp_replace(
              regexp_replace(prompt, '\[semantic\]\s*', '', 'gi'),
              '\s+—\s+[^—"]{6,}\."',
              '."',
              'g'
             )
WHERE confessed_at IS NULL
  AND prompt LIKE '%[semantic]%';
