-- 697 — schedule physical-practice-prescriber.
--
-- Found 2026-07-22: mig 680's ladder (rungs/progress/log + advance fn) went
-- live in the 680-689 batch, but the prescriber edge fn was never deployed
-- and never cronned — a bridge with no delivery surface. The fn is deployed
-- now; this puts it on the platform scheduler so the active rung's drill
-- actually lands daily. The fn is idempotent per day (existing active decree
-- per track gets its deadline rolled, not duplicated) and self-gates on
-- master_enabled + recondition_enabled + safeword floor, so a quiet run is
-- a cheap no-op.
--
-- 20:45 UTC ≈ mid-afternoon US Central: lands before the evening practice
-- window alongside the other body-track evals (deepthroat 21:00,
-- backside-training 22:00).

DO $$
BEGIN
  PERFORM cron.unschedule('physical-practice-prescriber-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'physical-practice-prescriber-daily',
  '45 20 * * *',
  $$SELECT invoke_edge_function('physical-practice-prescriber', '{}'::jsonb)$$
);
