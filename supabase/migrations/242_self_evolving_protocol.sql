-- 242 — handler_prompt_amendments + auto-loophole-closer audit
--
-- Two self-evolving systems:
-- (a) handler_prompt_amendments — chat.ts reads active rows and appends them
--     to the system prompt as "BANNED OPENINGS LEARNED THIS WEEK". Replaces
--     the manual "I add new patterns when she catches a leak" loop.
-- (b) loophole_closer_log — when auto-loophole-closer creates a decree or
--     punishment from a finding, it logs the action so we can audit.

CREATE TABLE IF NOT EXISTS public.handler_prompt_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  amendment_kind text NOT NULL,        -- 'banned_opening' | 'voice_correction' | 'directive_shape'
  amendment_text text NOT NULL,        -- the literal line to append to the system prompt
  source_phrase text,                  -- the leaked phrase that triggered this
  source_grade_id uuid REFERENCES handler_reply_grades(id) ON DELETE SET NULL,
  active boolean DEFAULT true,
  hit_count int DEFAULT 0,             -- how often we've added this since
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_by text                    -- model id that drafted the amendment
);
CREATE INDEX IF NOT EXISTS idx_handler_prompt_amendments_user_active ON public.handler_prompt_amendments(user_id, active, created_at DESC);
ALTER TABLE public.handler_prompt_amendments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own amendments" ON public.handler_prompt_amendments;
CREATE POLICY "user reads own amendments" ON public.handler_prompt_amendments FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes amendments" ON public.handler_prompt_amendments;
CREATE POLICY "service writes amendments" ON public.handler_prompt_amendments FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.loophole_closer_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  loophole_id uuid REFERENCES loophole_findings(id) ON DELETE CASCADE,
  action_kind text NOT NULL,           -- 'decree' | 'punishment' | 'commitment'
  action_id uuid,                      -- handler_decrees.id / punishment_queue.id
  action_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text                      -- model that drafted the closing action
);
ALTER TABLE public.loophole_closer_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own closer log" ON public.loophole_closer_log;
CREATE POLICY "user reads own closer log" ON public.loophole_closer_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes closer log" ON public.loophole_closer_log;
CREATE POLICY "service writes closer log" ON public.loophole_closer_log FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
