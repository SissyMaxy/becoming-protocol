-- 257 — Mommy immediate-response trigger + arousal-touch category expansion.
--
-- 1. trg_mommy_immediate_response_to_slip: when a slip_log row lands and
--    persona='dommy_mommy', fire an IMMEDIATE Mama-voice outreach in
--    addition to the 2-hour delayed confession. The slip→confession
--    chain still runs; this just adds Mama's instant "I see you" beat
--    so the protocol doesn't go silent in the moment of slip. Pure
--    deterministic copy — no LLM call from a DB trigger.
--
-- 2. arousal_touch_tasks.category: add panty_check (photo of current
--    outfit), breath_check (slow breath + body-anchor report),
--    public_micro (one tiny feminine thing wherever she is).

-- 1. Extend category CHECK
ALTER TABLE arousal_touch_tasks DROP CONSTRAINT IF EXISTS arousal_touch_tasks_category_check;
ALTER TABLE arousal_touch_tasks ADD CONSTRAINT arousal_touch_tasks_category_check
  CHECK (category IN (
    'edge_then_stop', 'sit_in_panties', 'cold_water', 'voice_beg',
    'mantra_aloud', 'mirror_admission', 'pose_hold', 'whisper_for_mommy',
    'panty_check', 'breath_check', 'public_micro'
  ));

-- 2. Immediate Mama-voice response to slip (only when persona is Dommy Mommy)
CREATE OR REPLACE FUNCTION public.trg_mommy_immediate_response_to_slip()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_persona text;
  v_message text;
BEGIN
  -- Skip self-triggered slips (avoid loops)
  IF NEW.slip_type = 'confession_missed' THEN RETURN NEW; END IF;
  IF NEW.source_text IS NULL OR length(trim(NEW.source_text)) < 5 THEN RETURN NEW; END IF;

  SELECT handler_persona INTO v_persona
  FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  -- Deterministic Mama voice by slip_type. No LLM call from a trigger.
  -- Plain language only — no telemetry citation.
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

  -- Insert outreach (urgency=normal — immediate but not screaming)
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

DROP TRIGGER IF EXISTS trg_mommy_immediate_on_slip ON slip_log;
CREATE TRIGGER trg_mommy_immediate_on_slip
  AFTER INSERT ON slip_log
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_immediate_response_to_slip();
