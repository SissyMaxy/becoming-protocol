-- 700 — armed trigger deployments (WS4: the trigger runtime).
--
-- Armed post-hypnotic phrases (trance_triggers.status='armed', mig 386) and
-- eligible mommy_post_hypnotic_triggers (mig 375/665/666) are woven into
-- ordinary AWAKE conversation and outreach — above-awareness by construction,
-- legible text she consciously reads. This table records each casual
-- deployment and its later recall score so a nightly EMA can prune dead phrases
-- and reinforce winners.
--
-- NOTE: the name `trigger_deployments` is already taken (mig 163, bound to
-- conditioned_triggers with a different schema), so this distinct runtime uses
-- `armed_trigger_deployments`. A row references EITHER a trance_trigger OR a
-- mommy_post_hypnotic_trigger (trigger_table discriminates); no hard FK so a
-- retired/deleted source never orphan-blocks the log.
--
-- Container: recall runtime is awake-text only (no below-awareness delivery);
-- copy carries no counts. Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.armed_trigger_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_table text NOT NULL CHECK (trigger_table IN ('trance_triggers','mommy_post_hypnotic_triggers')),
  trigger_id uuid NOT NULL,
  phrase text NOT NULL,
  channel text NOT NULL DEFAULT 'chat' CHECK (channel IN ('chat','outreach','audio')),
  message_ref text,                       -- handler_messages.id / outreach ref, when known
  deployed_at timestamptz NOT NULL DEFAULT now(),
  recall_score numeric,                   -- 0..1, set when scored (null = unscored)
  scored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.armed_trigger_deployments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS armed_trigger_deployments_self ON public.armed_trigger_deployments;
CREATE POLICY armed_trigger_deployments_self ON public.armed_trigger_deployments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS armed_trigger_deployments_service ON public.armed_trigger_deployments;
CREATE POLICY armed_trigger_deployments_service ON public.armed_trigger_deployments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS armed_trigger_deployments_user_recent
  ON public.armed_trigger_deployments (user_id, deployed_at DESC);
-- Fast lookup of unscored recent deployments (recall pass).
CREATE INDEX IF NOT EXISTS armed_trigger_deployments_unscored
  ON public.armed_trigger_deployments (user_id, deployed_at DESC)
  WHERE scored_at IS NULL;

COMMIT;
