-- 258 — Mama acknowledges every confession as soon as it lands.
--
-- The existing flow: user types into ConfessionQueueCard, supabase
-- update sets confessed_at, the row is gone. Closes silent. Mama in
-- the dommy_mommy persona shouldn't go quiet on a confession — she
-- should reply with a brief plain-voice acknowledgment that
-- reinforces the act of confessing without asking another question.
-- (Praise that ramps; not release.)
--
-- Trigger: AFTER UPDATE on confession_queue when confessed_at flips
-- NULL → not-NULL. Inserts handler_outreach_queue row with
-- source='mommy_receipt'. Persona-gated. No LLM call from a trigger;
-- deterministic phrase pool with category-bias.

CREATE OR REPLACE FUNCTION public.trg_mommy_confession_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_persona text;
  v_message text;
  v_pet text[] := ARRAY[
    'baby', 'sweet girl', 'sweet thing', 'pretty thing',
    'good girl', 'my pretty princess', 'baby girl', 'my favorite girl'
  ];
  v_pick text;
BEGIN
  IF NEW.confessed_at IS NULL OR OLD.confessed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.response_text IS NULL OR length(trim(NEW.response_text)) < 10 THEN
    RETURN NEW;
  END IF;

  SELECT handler_persona INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  v_pick := v_pet[1 + (floor(random() * array_length(v_pet, 1)))::int];

  -- Category-biased plain-voice receipt. No telemetry, no questions.
  v_message := CASE NEW.category
    WHEN 'slip' THEN
      'There it is, ' || v_pick || '. Mama heard every word. We''re going to come back to this.'
    WHEN 'arousal_spike' THEN
      'Good ' || v_pick || '. That''s the truth Mama wanted. Sit with it for a minute.'
    WHEN 'rationalization' THEN
      'Mama sees it now, ' || v_pick || '. The story you were telling yourself. Good girl for naming it.'
    WHEN 'scheduled_daily' THEN
      'Beautiful, ' || v_pick || '. That''s what Mama was waiting for today. Carry it with you.'
    WHEN 'resistance' THEN
      'Mama hears the resistance, ' || v_pick || '. Naming it doesn''t dissolve it — but you don''t have to carry it alone.'
    WHEN 'desire_owning' THEN
      'There she is. Mama loves when you own it like that, ' || v_pick || '.'
    WHEN 'identity_acknowledgement' THEN
      'Yes. That''s the truth, ' || v_pick || '. Say it again later when you forget it.'
    WHEN 'handler_triggered' THEN
      'Good ' || v_pick || '. Mama got what she asked for.'
    WHEN 'cross_platform_inconsistency' THEN
      'Mama sees the gap, ' || v_pick || '. Now you''ve named it. We close it next.'
    ELSE
      'Mama got it, ' || v_pick || '. Good girl.'
  END;

  -- Append a body-anchor close (rotated)
  v_message := v_message || ' ' || (ARRAY[
    'Stay there for me.',
    'Don''t let go of that feeling.',
    'Mama''s in your head until tomorrow.',
    'You''re Mama''s good girl.',
    'Now go be a good girl until I want more from you.'
  ])[1 + (floor(random() * 5))::int];

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, scheduled_for, expires_at, source
  ) VALUES (
    NEW.user_id, v_message, 'low',
    'mommy_receipt:' || NEW.id::text,
    now(), now() + interval '6 hours',
    'mommy_receipt'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mommy_receipt_on_confession ON confession_queue;
CREATE TRIGGER trg_mommy_receipt_on_confession
  AFTER UPDATE ON confession_queue
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_confession_receipt();
