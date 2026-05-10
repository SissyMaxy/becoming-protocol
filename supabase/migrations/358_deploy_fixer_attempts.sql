-- 314 — deploy_fixer_attempts: audit trail for the autonomous deploy-fixer.
--
-- The deploy-fixer edge function (supabase/functions/deploy-fixer/) reads
-- open rows from deploy_health_log, runs each through a pattern library,
-- and either auto-patches (small fixes, ≤10 lines / ≤3 files), opens a
-- draft PR (larger fixes), or escalates (no match / forbidden path).
--
-- Every attempt — match or no-match — writes one row here. This is the
-- audit ledger; the dashboard card reads it to show the last action.
--
-- Loop guard: the orchestrator queries this table for prior attempts on
-- the same health_log_id. If 3+ attempts exist (or 2 with the same
-- pattern), it skips and escalates.
--
-- RLS: service role writes; owner (HANDLER_USER_ID) selects so the Today
-- card can render last-action / pending counts. No user INSERT/UPDATE.

CREATE TABLE IF NOT EXISTS public.deploy_fixer_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  health_log_id uuid REFERENCES public.deploy_health_log(id) ON DELETE SET NULL,
  pattern_matched text,                  -- 'ts_coercion' | 'variable_redeclare' | 'spread_widened' | 'function_count' | 'missing_env' | 'failed_migration' | NULL when no match
  patch_generated_sha text,              -- commit SHA of the auto-generated fix branch tip, NULL if no patch
  pushed_branch text,                    -- 'mommy/deploy-fix-<sha>' branch name, NULL if not pushed
  pr_number integer,                     -- GitHub PR number, NULL if no PR opened
  merged_to_main boolean NOT NULL DEFAULT false,
  outcome text NOT NULL CHECK (outcome IN ('auto_merged', 'pr_opened', 'no_match', 'failed', 'forbidden_path', 'rollback_pr_opened', 'loop_guard_stopped')),
  fix_diff_summary text,                 -- e.g. 'api/handler/chat.ts: ?? undefined' — short human-readable
  files_touched text[],                  -- repo-relative paths
  failure_reason text,                   -- when outcome='failed'
  build_verified_green boolean,          -- post-push Vercel build check
  attempt_number integer NOT NULL DEFAULT 1,  -- 1-indexed; ≥3 → loop guard escalates
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deploy_fixer_attempts_created_at
  ON public.deploy_fixer_attempts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deploy_fixer_attempts_health_log
  ON public.deploy_fixer_attempts(health_log_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deploy_fixer_attempts_outcome
  ON public.deploy_fixer_attempts(outcome, created_at DESC);

ALTER TABLE public.deploy_fixer_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service writes deploy fixer attempts" ON public.deploy_fixer_attempts;
CREATE POLICY "Service writes deploy fixer attempts" ON public.deploy_fixer_attempts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users see own deploy fixer attempts" ON public.deploy_fixer_attempts;
CREATE POLICY "Users see own deploy fixer attempts" ON public.deploy_fixer_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

-- ---------- DB-trigger path: pg_net deploy-fixer on deploy_health_log INSERT ----------
--
-- Cron every 10min is the backstop. The fast path is: every new
-- deploy_health_log row with status='open' and source IN ('vercel',
-- 'github_actions') fires the deploy-fixer edge function via pg_net.
--
-- Idempotent: if the trigger function already exists it's CREATE OR
-- REPLACE'd. If pg_net or invoke_edge_function is missing the trigger
-- silently no-ops via the EXCEPTION block — cron still picks the row up.

CREATE OR REPLACE FUNCTION public.trg_deploy_health_log_kick_fixer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.status = 'open' AND NEW.source IN ('vercel', 'github_actions') THEN
    BEGIN
      PERFORM invoke_edge_function('deploy-fixer', jsonb_build_object('health_log_id', NEW.id, 'reason', 'health_log_inserted'));
    EXCEPTION WHEN OTHERS THEN
      -- Trigger must NEVER block the underlying INSERT — the cron path
      -- will still pick this row up next tick. Swallow any pg_net /
      -- invoke_edge_function error.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS deploy_health_log_kick_fixer ON public.deploy_health_log;
CREATE TRIGGER deploy_health_log_kick_fixer
  AFTER INSERT ON public.deploy_health_log
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_deploy_health_log_kick_fixer();

NOTIFY pgrst, 'reload schema';
