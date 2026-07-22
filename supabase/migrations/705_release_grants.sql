-- 705 — release grants: the reward-only release economy (WS6).
--
-- A release grant is issued by the conductor / orchestrator ONLY on arc-aligned
-- completions (a practice drill, a consolidated rung, a scene debrief). It
-- surfaces through the EXISTING release_checkin Focus path; Mommy speaks it via
-- chastityToPhrase.
--
-- REWARD-ONLY, by construction: a grant only ever GIVES a release window. No
-- grant is a baseline denial, none is a penalty, and absence of a grant is not a
-- consequence — denial_day stays derived from last_release, untouched. This is
-- the container rule (reward-only release grants, no absence penalties).
--
-- Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.release_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_for text NOT NULL CHECK (granted_for IN ('practice_drill','turnout_rung','scene_debrief')),
  source_ref uuid,                         -- the drill/rung/debrief that earned it
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.release_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_grants_self ON public.release_grants;
CREATE POLICY release_grants_self ON public.release_grants
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS release_grants_service ON public.release_grants;
CREATE POLICY release_grants_service ON public.release_grants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS release_grants_user_open
  ON public.release_grants (user_id, expires_at)
  WHERE redeemed_at IS NULL;

COMMIT;
