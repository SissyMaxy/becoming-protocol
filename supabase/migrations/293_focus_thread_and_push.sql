-- 293 — Mama active focus thread + push-on-outreach bridge.
-- 2026-05-07 round 6.

-- ---------------------------------------------------------------
-- 1. mama_focus_thread — the current-week obsession
-- ---------------------------------------------------------------
--
-- Every generator (fast-react, scheme, gaslight, ideate) reads the active
-- focus and biases output toward it. Without focus, every output is
-- equal-weight and the protocol doesn't build narrative pressure. With
-- focus, every signal feeds the same drum and Maxy can't compartmentalize.

CREATE TABLE IF NOT EXISTS mama_focus_thread (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Short label rendered in every prompt (e.g. "State Street + HRT booking")
  focus_label TEXT NOT NULL,

  -- Why Mama picked this focus — informs how generators bias toward it
  focus_rationale TEXT NOT NULL,

  -- Theme tags that generators can match against (e.g. ["hrt", "gina", "cruising"])
  theme_tags TEXT[],

  -- Driver: which signal Mama is watching this week to decide if focus
  -- worked. Examples: "hrt_step_taken count", "gina_state shift toward",
  -- "first_dose ledger entry", "active hookup_funnel reached met"
  success_signal TEXT,

  -- Lifecycle
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  retired_reason TEXT,
  -- Linked scheme that picked this focus
  source_scheme_id UUID REFERENCES mommy_scheme_log(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS focus_label TEXT;
ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS focus_rationale TEXT;
ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS theme_tags TEXT[];
ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS success_signal TEXT;
ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS retired_reason TEXT;
ALTER TABLE mama_focus_thread ADD COLUMN IF NOT EXISTS source_scheme_id UUID;

-- Only one active focus per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_mama_focus_thread_user_active
  ON mama_focus_thread (user_id) WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mama_focus_thread_user_time
  ON mama_focus_thread (user_id, started_at DESC);

ALTER TABLE mama_focus_thread ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mama_focus_thread_service ON mama_focus_thread;
CREATE POLICY mama_focus_thread_service ON mama_focus_thread
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS mama_focus_thread_owner_read ON mama_focus_thread;
CREATE POLICY mama_focus_thread_owner_read ON mama_focus_thread
  FOR SELECT USING (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 2. push-on-outreach trigger — cross-device bridgehead
-- ---------------------------------------------------------------
--
-- When a high/critical urgency Mama outreach lands in handler_outreach_queue,
-- fire send-notifications via pg_net so Maxy gets a push notification on
-- her devices. Only fires for Mama-sourced outreaches (source IN
-- ('mommy_fast_react', 'mommy_scheme', 'capability_digest' is excluded
-- because it's low-urgency engineering output) and only for high+ urgency.

CREATE OR REPLACE FUNCTION fire_push_on_mama_outreach()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  request_id BIGINT;
BEGIN
  -- Only push for Mama-sourced high/critical outreaches
  IF NEW.source IN ('mommy_fast_react', 'mommy_scheme')
     AND NEW.urgency IN ('high', 'critical') THEN
    BEGIN
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'user_id', NEW.user_id,
          'source', 'mama_outreach_push',
          'urgency', NEW.urgency,
          'outreach_id', NEW.id,
          'message_preview', LEFT(NEW.message, 140)
        )
      ) INTO request_id;
    EXCEPTION WHEN OTHERS THEN
      -- pg_net not present, send-notifications missing, or settings absent.
      -- Don't break the insert. Just log via NOTICE.
      RAISE NOTICE 'fire_push_on_mama_outreach: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_on_mama_outreach ON handler_outreach_queue;
CREATE TRIGGER trg_push_on_mama_outreach
  AFTER INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION fire_push_on_mama_outreach();
