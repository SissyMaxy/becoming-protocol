-- 702 — turn-out text scenes ("the man" in chat) (WS6).
--
-- A fantasy rung: Mommy plays the man in an explicitly-framed, fantasy-only
-- scene in the chat channel. A scene OPENS (status 'open'), the overlay runs
-- with scene-open/scene-close framing she can always see, safeword exits
-- instantly, and on CLOSE it flows into the existing mig 679 aroused-debrief and
-- consolidates via the orchestrator path only when the rung is a text rung.
--
-- CRITICAL container distinction: the scene trigger_source is
-- 'turnout_scene:<rung>', kept DISTINCT from 'turnout_rung:<rung>' (the
-- orchestrator's documented false-consolidation incident) — a fantasy scene can
-- never be mistaken for the real rung action. Never a claim about her real
-- surroundings; the act stays hers behind the unchanged gates.
--
-- Additive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.turnout_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rung_code text NOT NULL,
  arc_stage int NOT NULL DEFAULT 1,        -- 1 looking .. 4 taken (theming)
  scenario_brief text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','debriefed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  debrief_ref uuid,                        -- turnout_rung_debriefs.id when debriefed
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.turnout_scenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS turnout_scenes_self ON public.turnout_scenes;
CREATE POLICY turnout_scenes_self ON public.turnout_scenes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS turnout_scenes_service ON public.turnout_scenes;
CREATE POLICY turnout_scenes_service ON public.turnout_scenes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- At most one open scene per user (the overlay reads it; one scene at a time).
CREATE UNIQUE INDEX IF NOT EXISTS turnout_scenes_one_open
  ON public.turnout_scenes (user_id)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS turnout_scenes_user_recent
  ON public.turnout_scenes (user_id, opened_at DESC);

COMMIT;
