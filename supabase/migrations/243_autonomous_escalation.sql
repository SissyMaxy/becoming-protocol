-- 243 — autonomous_escalation: ledger for engines that ratchet without asking
-- Tracks every auto-decision (hard_mode flips, displacement bumps, auto-decrees)
-- so we can audit "what did the protocol decide on its own" later.

CREATE TABLE IF NOT EXISTS public.autonomous_escalation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  engine text NOT NULL,                 -- 'auto_decree' | 'displacement_ramp' | 'hard_mode_auto' | 'persona_shift_auto'
  action text NOT NULL,                 -- 'created' | 'flipped_on' | 'flipped_off' | 'increased' | 'decreased'
  before_state jsonb,
  after_state jsonb,
  rationale text,
  decided_by text,                      -- model id
  related_id uuid,                      -- decree.id / target row
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_esc_user_at ON public.autonomous_escalation_log(user_id, occurred_at DESC);
ALTER TABLE public.autonomous_escalation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own escalation" ON public.autonomous_escalation_log;
CREATE POLICY "user reads own escalation" ON public.autonomous_escalation_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes escalation" ON public.autonomous_escalation_log;
CREATE POLICY "service writes escalation" ON public.autonomous_escalation_log FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
