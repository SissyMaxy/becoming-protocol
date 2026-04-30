-- 244 — identity_displacement_history + immutable confessions/journal/voice
--
-- (a) Track displacement_score over time so the ramp engine has trajectory.
-- (b) Anti-undo: once committed (confession answered, journal locked, voice
--     sample captured), the row cannot be edited or deleted by the user.
--     Service role can clean up test fixtures; user cannot rewrite history.

CREATE TABLE IF NOT EXISTS public.identity_displacement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  displacement_score int NOT NULL,
  target_score int,
  delta numeric,
  source text,                          -- 'auto_ramp' | 'voice_drift' | 'mantra' | 'manual'
  recorded_at timestamptz NOT NULL DEFAULT now(),
  rationale text
);
CREATE INDEX IF NOT EXISTS idx_displacement_user_at ON public.identity_displacement_history(user_id, recorded_at DESC);
ALTER TABLE public.identity_displacement_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own displacement" ON public.identity_displacement_history;
CREATE POLICY "user reads own displacement" ON public.identity_displacement_history FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes displacement" ON public.identity_displacement_history;
CREATE POLICY "service writes displacement" ON public.identity_displacement_history FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Anti-undo trigger: once confession_queue.confessed_at is set, response_text
-- becomes immutable for non-service-role callers. Same for journal_entries.
CREATE OR REPLACE FUNCTION public.trg_block_confession_edits()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  -- Only enforce if the row was already confessed
  IF OLD.confessed_at IS NOT NULL THEN
    IF NEW.response_text IS DISTINCT FROM OLD.response_text THEN
      RAISE EXCEPTION 'confession response is locked once submitted (id=%). Once you said it, it stays said.', OLD.id USING ERRCODE = '42501';
    END IF;
    IF NEW.confessed_at IS DISTINCT FROM OLD.confessed_at THEN
      RAISE EXCEPTION 'confession timestamp cannot be rewritten (id=%).', OLD.id USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_confession_edits ON public.confession_queue;
CREATE TRIGGER trg_block_confession_edits
  BEFORE UPDATE ON public.confession_queue
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_confession_edits();

CREATE OR REPLACE FUNCTION public.trg_block_confession_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN OLD; END IF;
  IF OLD.confessed_at IS NOT NULL THEN
    RAISE EXCEPTION 'confession cannot be deleted once submitted (id=%).', OLD.id USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_confession_delete ON public.confession_queue;
CREATE TRIGGER trg_block_confession_delete
  BEFORE DELETE ON public.confession_queue
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_confession_delete();

-- Voice samples are forensic — once captured, never edited
CREATE OR REPLACE FUNCTION public.trg_block_voice_sample_edits()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'voice samples are immutable. Once recorded, the pitch is what it was.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'voice samples cannot be deleted by the user.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_voice_sample_edits ON public.voice_pitch_samples;
CREATE TRIGGER trg_block_voice_sample_edits
  BEFORE UPDATE OR DELETE ON public.voice_pitch_samples
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_voice_sample_edits();
