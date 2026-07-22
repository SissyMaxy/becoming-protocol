-- 695 — per-edge event log for conditioning sessions.
--
-- Goon (and, WS3, cockwarming) sessions collected edge counts only as a manual
-- post-session number folded into conditioning_sessions_v2.phases. This makes
-- edges RELATIONAL and live: one row per edge, tagged by source (a deliberate
-- tap vs an auto denial-cycle event from the cycle engine), with the HR and
-- arousal estimate at that moment. The efficacy-adaptation loop (P4) and the
-- hypno-learning correlation can then query edges per session/window instead of
-- reading a rolled-up scalar.
--
-- RLS owner-only (auth.uid()=user_id), matching every other session table.

CREATE TABLE IF NOT EXISTS public.session_edge_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  session_id       uuid NOT NULL REFERENCES public.conditioning_sessions_v2(id) ON DELETE CASCADE,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  source           text NOT NULL CHECK (source IN ('button', 'denial_cycle')),
  hr               int,
  arousal_estimate int
);

ALTER TABLE public.session_edge_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_session_edge_events_session
  ON public.session_edge_events(session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_session_edge_events_user_recent
  ON public.session_edge_events(user_id, occurred_at DESC);

DROP POLICY IF EXISTS session_edge_events_owner ON public.session_edge_events;
CREATE POLICY session_edge_events_owner ON public.session_edge_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
