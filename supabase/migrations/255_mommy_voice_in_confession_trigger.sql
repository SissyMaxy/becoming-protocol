-- 255 — Persona-aware copy in trg_slip_demands_confession.
--
-- When user_state.handler_persona='dommy_mommy', the trigger composes the
-- confession prompt in Mommy voice (sweet open → filthy specific).
-- Falls back to the existing Handler-voice prompts otherwise so the
-- therapist persona behavior is unchanged for any future user.

CREATE OR REPLACE FUNCTION public.trg_slip_demands_confession()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_prompt text;
  v_quote text;
  v_is_system_event boolean;
  v_persona text;
BEGIN
  IF NEW.source_text IS NULL OR length(trim(NEW.source_text)) < 10 THEN RETURN NEW; END IF;
  IF NEW.slip_type = 'confession_missed' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM confession_queue
    WHERE user_id = NEW.user_id
      AND triggered_by_table = 'slip_log'
      AND triggered_by_id = NEW.id
  ) THEN RETURN NEW; END IF;

  -- Scrub: UUIDs, hard-mode markers, [semantic], trailing reason, "David"
  v_quote := substring(NEW.source_text from 1 for 280);
  v_quote := regexp_replace(v_quote, '\(id\s+[0-9a-f-]{36}\)', '', 'gi');
  v_quote := regexp_replace(v_quote, '\[hard_mode 3x multiplier:[^\]]+\]', '', 'gi');
  v_quote := regexp_replace(v_quote, '\[semantic\]\s*', '', 'gi');
  v_quote := regexp_replace(v_quote, '\s+—\s+[^—]{6,}$', '', 'g');
  v_quote := regexp_replace(v_quote, '\mDavid\M', 'the costume', 'gi');
  v_quote := trim(v_quote);

  v_is_system_event := v_quote ~* '^(missed|dodged|skipped|ignored)\s+(commitment|decree|punishment|task|directive)';

  SELECT handler_persona INTO v_persona
  FROM user_state WHERE user_id = NEW.user_id;

  IF v_is_system_event THEN
    IF v_persona = 'dommy_mommy' THEN
      v_prompt := 'Oh, baby. ' || v_quote || ' — that one slipped, sweet thing. Tell Mama what was actually happening: what you wanted, what was easier than doing this, what made you choose the easier thing. Then tell me what you''re doing in the next two hours to make it up to me. Don''t skip the wanting part — Mama wants to hear it.';
    ELSE
      v_prompt := v_quote || ' — that''s the slip. 100 words: what crowded this out, what was the easier story you told yourself, what do you do in the next 2 hours to close it.';
    END IF;
  ELSIF v_persona = 'dommy_mommy' THEN
    v_prompt := CASE NEW.slip_type
      WHEN 'masculine_self_reference' THEN
        'My sweet girl wrote: "' || v_quote || '". That''s the costume slipping back on, baby. Take it off for Mama. Walk me through what was happening right before the old voice came out — where, who, what you were avoiding. Then write the same sentence as the version of you who is becoming her. Present tense, in her voice, sweetheart.'
      WHEN 'david_name_use' THEN
        'You used the costume name in: "' || v_quote || '". Where were you trying to retreat to, baby? Tell Mama the moment from before this protocol when that name felt safest. Then tell me which part of you wanted to hide there. Mama is listening.'
      WHEN 'resistance_statement' THEN
        'Look what my pretty thing wrote: "' || v_quote || '". Mama wants every detail of the version of you that does it. Where does it happen? Who finds out — and how? What do they say in that moment? Be specific, baby — concrete sequence, not philosophy. Mama is going to enjoy reading this.'
      WHEN 'task_avoided' THEN
        'Sweet girl. ' || v_quote || ' — task avoided. Tell Mama what the task threatened: what would have happened if you''d actually done it on time? What was easier than doing it? And what are you going to do in the next two hours to fix it for me?'
      WHEN 'directive_refused' THEN
        v_quote || ' — directive refused, baby. Not asking why, asking what: name the moment of refusal in present tense. What were you protecting? What was easier than complying? Mama is patient but Mama wants the answer.'
      WHEN 'voice_masculine_pitch' THEN
        'Your voice landed on the masculine side, baby: "' || v_quote || '". What did it feel like in your throat, in your chest, when those words came out? What would have helped you find your girl voice in that moment? Tell Mama like the soft thing you are.'
      WHEN 'handler_ignored' THEN
        'You ignored Mama, sweet thing. ' || v_quote || ' — what was it about that message specifically that felt easier to skip than to answer? Mama isn''t mad. Mama just wants to know which part of you was hiding.'
      WHEN 'mantra_missed' THEN
        v_quote || ' — mantra missed, baby. What was happening that crowded the words out? What were you doing instead? Tell Mama in present tense, specific.'
      WHEN 'chastity_unlocked_early' THEN
        v_quote || ' — you came out of chastity early, my needy little thing. Walk Mama through the minutes before you unlocked. What were you telling yourself? Is that story still true now you''ve written it down for me? Don''t lie, baby — Mama can read between the lines.'
      WHEN 'arousal_gating_refused' THEN
        v_quote || ' — arousal gate refused. What would complying have cost you in that moment, sweet girl? What did refusing protect? Mama wants both halves of the answer.'
      WHEN 'gender_claim' THEN
        'You wrote: "' || v_quote || '". Tell Mama what the denial protects you from. Whose voice is in the denial — name the person it sounds like, baby. Don''t soften it. Mama wants the truth.'
      ELSE
        'You wrote: "' || v_quote || '". Tell Mama what was happening, what you wanted, what came out instead. Be concrete, baby — your skin remembers; tell Mama what it was doing.'
    END;
  ELSE
    -- Therapist/handler voice (existing behavior)
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
