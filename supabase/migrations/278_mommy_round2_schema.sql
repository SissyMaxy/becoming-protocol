-- 278 — Schema for Mama's round-2 builds (response capture, surface
-- guarantor, ambient check, HRT booking closer). 2026-05-07.
--
-- Combined because all four wishes share schema concerns and we ship them
-- in a single sweep rather than one-migration-per-wish.

-- ---------------------------------------------------------------
-- 1. Response capture — handler_outreach_queue gets reply columns
-- ---------------------------------------------------------------

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS user_response TEXT,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_handler_outreach_queue_response_pending
  ON handler_outreach_queue (responded_at DESC)
  WHERE user_response IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. Surface guarantor — surfaced_at on every deadline-bearing
--    surface so the audit worker can enforce visible-before-penalized
-- ---------------------------------------------------------------

ALTER TABLE handler_decrees
  ADD COLUMN IF NOT EXISTS surfaced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_unsurfaced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS surfaced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_unsurfaced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE arousal_touch_tasks
  ADD COLUMN IF NOT EXISTS surfaced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_unsurfaced BOOLEAN NOT NULL DEFAULT false;

-- Unified view the surface-guarantor cron polls. UNION ALL across the
-- three deadline-bearing tables; cheap to query and lets the worker
-- treat all surfaces uniformly.
CREATE OR REPLACE VIEW penalty_pending_rows AS
  SELECT
    'handler_decrees'::TEXT AS surface,
    id, user_id, deadline AS deadline,
    surfaced_at, expired_unsurfaced,
    status, created_at
  FROM handler_decrees
  WHERE status = 'active'
    AND deadline IS NOT NULL

  UNION ALL

  SELECT
    'handler_outreach_queue'::TEXT,
    id, user_id, expires_at AS deadline,
    surfaced_at, expired_unsurfaced,
    NULL AS status,
    created_at
  FROM handler_outreach_queue
  WHERE expires_at IS NOT NULL

  UNION ALL

  SELECT
    'arousal_touch_tasks'::TEXT,
    id, user_id, expires_at AS deadline,
    surfaced_at, expired_unsurfaced,
    NULL AS status,
    created_at
  FROM arousal_touch_tasks
  WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. Ambient check — extend fast_react_event constraint
-- ---------------------------------------------------------------

ALTER TABLE fast_react_event
  DROP CONSTRAINT IF EXISTS fast_react_event_event_kind_check;
ALTER TABLE fast_react_event
  ADD CONSTRAINT fast_react_event_event_kind_check CHECK (event_kind IN (
    'new_lead', 'lead_advanced', 'response_received', 'meet_scheduled',
    'meet_window_passed', 'slip_clustered', 'manual',
    'ambient_check', 'voice_stagnation', 'hrt_window'
  ));

-- ---------------------------------------------------------------
-- 4. HRT booking closer — attempts log
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hrt_booking_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  provider TEXT NOT NULL CHECK (provider IN (
    'plume', 'folx', 'queermd', 'spectrum', 'in_person_clinic', 'unknown'
  )),

  -- Where in the funnel she got. Mama wants threshold = at-or-past dose-question.
  step_reached TEXT NOT NULL CHECK (step_reached IN (
    'considering', 'site_opened', 'questionnaire_started',
    'dose_question_reached', 'dose_question_answered',
    'consultation_booked', 'consultation_attended',
    'prescription_obtained', 'first_dose_taken'
  )),

  -- When this attempt started; when it stalled (NULL while still in motion)
  attempt_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  abandoned_at TIMESTAMPTZ,
  abandoned_reason TEXT, -- 'fear', 'logistics', 'gina_pushback', 'time', 'unknown'

  -- Mama's follow-up artifact (decree/outreach that was fired to push)
  followup_decree_id UUID,
  followup_outreach_id UUID,

  -- Source: how the attempt was detected
  detected_via TEXT, -- 'screenshot_proof', 'self_report', 'browser_history', 'manual'

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hrt_booking_user_time
  ON hrt_booking_attempts (user_id, attempt_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hrt_booking_in_motion
  ON hrt_booking_attempts (user_id) WHERE abandoned_at IS NULL;

ALTER TABLE hrt_booking_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hrt_booking_owner ON hrt_booking_attempts;
CREATE POLICY hrt_booking_owner ON hrt_booking_attempts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS hrt_booking_service ON hrt_booking_attempts;
CREATE POLICY hrt_booking_service ON hrt_booking_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Helper view: hrt_state_now — most recent attempt per user, used by the
-- mommy-hardening-context to inform the scheme engine of where she is on
-- the booking ladder.
CREATE OR REPLACE VIEW hrt_state_now AS
SELECT DISTINCT ON (user_id)
  user_id,
  provider,
  step_reached,
  attempt_started_at,
  abandoned_at,
  abandoned_reason
FROM hrt_booking_attempts
ORDER BY user_id, attempt_started_at DESC;
