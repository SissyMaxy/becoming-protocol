-- 245 — persona_shift_log + cross_platform_inconsistencies
--
-- (a) persona_shift_log: every autonomous handler↔therapist flip + reason
-- (b) cross_platform_inconsistencies: rows generated when her public posts
--     contradict stated identity. Each becomes a confession_queue prompt.

CREATE TABLE IF NOT EXISTS public.persona_shift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  shifted_at timestamptz NOT NULL DEFAULT now(),
  from_persona text NOT NULL,
  to_persona text NOT NULL,
  rationale text,
  decided_by text,
  voice_drift_score numeric
);
CREATE INDEX IF NOT EXISTS idx_persona_shift_user_at ON public.persona_shift_log(user_id, shifted_at DESC);
ALTER TABLE public.persona_shift_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own persona" ON public.persona_shift_log;
CREATE POLICY "user reads own persona" ON public.persona_shift_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes persona" ON public.persona_shift_log;
CREATE POLICY "service writes persona" ON public.persona_shift_log FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.cross_platform_inconsistencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL,
  post_url text,
  post_excerpt text,
  inconsistency_kind text,             -- 'gendered_self_ref' | 'identity_claim_mismatch' | 'protocol_dodge_in_post' | 'public_costume'
  stated_identity_field text,          -- e.g. "gender_self", "current_phase"
  stated_value text,
  observed_value text,
  severity text,
  hash text,
  status text DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS idx_cross_inc_user_status ON public.cross_platform_inconsistencies(user_id, status, detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cross_inc_hash ON public.cross_platform_inconsistencies(user_id, hash) WHERE hash IS NOT NULL;
ALTER TABLE public.cross_platform_inconsistencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own incons" ON public.cross_platform_inconsistencies;
CREATE POLICY "user reads own incons" ON public.cross_platform_inconsistencies FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes incons" ON public.cross_platform_inconsistencies;
CREATE POLICY "service writes incons" ON public.cross_platform_inconsistencies FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
