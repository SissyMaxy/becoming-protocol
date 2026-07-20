-- 684 - Efficacy engine Phase 4: autonomous adaptation log.
--
-- The efficacy-adaptation cron reads each target's measured state and, when a target
-- is engaged but stuck after every mechanism has been tried, enqueues a floor-gated
-- improvement WISH into the existing mommy_code_wishes queue (which already runs every
-- change through the safety cord + CI before shipping). Every autonomous decision —
-- acted or floor-blocked — is recorded here so the operator sees what the engine did
-- and why. Operator-facing record; never voiced.
--
-- Additive. No user UUIDs / private data in schema history.

BEGIN;

CREATE TABLE IF NOT EXISTS public.efficacy_adaptation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid REFERENCES reconditioning_targets(id) ON DELETE SET NULL,
  action text NOT NULL,                    -- none | rotate | enqueue_wish
  efficacy text,                           -- rising | flat | wrong | unknown
  rotation int,
  wish_id uuid REFERENCES mommy_code_wishes(id) ON DELETE SET NULL,
  floor_blocked boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.efficacy_adaptation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS efficacy_adaptation_log_self ON public.efficacy_adaptation_log;
CREATE POLICY efficacy_adaptation_log_self ON public.efficacy_adaptation_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS efficacy_adaptation_log_service ON public.efficacy_adaptation_log;
CREATE POLICY efficacy_adaptation_log_service ON public.efficacy_adaptation_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS efficacy_adaptation_log_user_idx
  ON public.efficacy_adaptation_log (user_id, created_at DESC);

COMMIT;
