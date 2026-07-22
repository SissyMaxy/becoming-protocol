-- 701 — session conductor log + weights (WS5).
--
-- The daily session-conductor picks ONE audio-session kind from her state and
-- writes a single audio_session_offers row (which pick-next.ts already surfaces
-- as the one Focus item). session_conductor_log records each decision + the
-- feature vector + the per-kind scores for the operator and for adaptation.
-- session_conductor_weights holds the per-kind efficacy EMA that
-- efficacy-adaptation nudges from measured outcomes — closing the
-- state→pick→played→measured→weights loop.
--
-- Additive. Operator-facing telemetry; never voiced.

BEGIN;

CREATE TABLE IF NOT EXISTS public.session_conductor_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decided_at timestamptz NOT NULL DEFAULT now(),
  chosen_kind text,                        -- null when nothing eligible / gated
  chosen_tier text,
  offer_id uuid REFERENCES audio_session_offers(id) ON DELETE SET NULL,
  features jsonb,
  scores jsonb,
  skipped_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_conductor_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_conductor_log_self ON public.session_conductor_log;
CREATE POLICY session_conductor_log_self ON public.session_conductor_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS session_conductor_log_service ON public.session_conductor_log;
CREATE POLICY session_conductor_log_service ON public.session_conductor_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS session_conductor_log_user_idx
  ON public.session_conductor_log (user_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS public.session_conductor_weights (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  weight numeric NOT NULL DEFAULT 0.5,     -- efficacy EMA, bounded 0..1
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.session_conductor_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_conductor_weights_self ON public.session_conductor_weights;
CREATE POLICY session_conductor_weights_self ON public.session_conductor_weights
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS session_conductor_weights_service ON public.session_conductor_weights;
CREATE POLICY session_conductor_weights_service ON public.session_conductor_weights
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
