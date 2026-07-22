-- 695 — Session edge events + play-log widening (WS1: close the dormant loops).
--
-- Two small, additive pieces that let live sessions feed the measurement loop:
--
-- 1. session_edge_events — one row per edge tapped inside a conditioning session
--    (goon v2, cockwarming). Relational so efficacy-adaptation + preference
--    learning can query edges by session, source, and time. Previously edges
--    were a single post-session integer (endGoonSession's manual count); this
--    makes each edge a timestamped, biometric-tagged fact.
--
-- 2. hypno_plays widening — every render played inside a session should log a
--    play row. Audio-session renders (audio_session_renders) are NOT hypno_sources,
--    so source_id (previously NOT NULL FK → hypno_sources) is relaxed to nullable
--    and a render_id (FK → audio_session_renders) is added. A play row now carries
--    EITHER a source_id (ingested hypno source) OR a render_id (authored audio
--    session). refresh_erotic_preference_profile's feature CTE inner-joins on
--    source_id, so render-only rows contribute arousal baseline but no feature
--    lift — non-breaking.
--
-- Additive + widen-only. No user UUIDs / private data in schema history.

BEGIN;

-- ─── 1. session_edge_events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_edge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES conditioning_sessions_v2(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'button' CHECK (source IN ('button', 'denial_cycle')),
  hr int,
  arousal_estimate int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_edge_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_edge_events_self ON public.session_edge_events;
CREATE POLICY session_edge_events_self ON public.session_edge_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS session_edge_events_service ON public.session_edge_events;
CREATE POLICY session_edge_events_service ON public.session_edge_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS session_edge_events_user_idx
  ON public.session_edge_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS session_edge_events_session_idx
  ON public.session_edge_events (session_id);

-- ─── 2. hypno_plays widening for audio-session renders ───────────────────
ALTER TABLE public.hypno_plays ALTER COLUMN source_id DROP NOT NULL;
ALTER TABLE public.hypno_plays
  ADD COLUMN IF NOT EXISTS render_id uuid REFERENCES audio_session_renders(id) ON DELETE SET NULL;
-- A play must reference exactly one provenance (a hypno source OR an audio render).
ALTER TABLE public.hypno_plays DROP CONSTRAINT IF EXISTS hypno_plays_provenance_ck;
ALTER TABLE public.hypno_plays
  ADD CONSTRAINT hypno_plays_provenance_ck
  CHECK (source_id IS NOT NULL OR render_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_hypno_plays_render ON public.hypno_plays (render_id);
CREATE INDEX IF NOT EXISTS idx_hypno_plays_session ON public.hypno_plays (session_id);

COMMIT;
