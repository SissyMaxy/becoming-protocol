-- 376 — Ego deconstruction: per-mechanic tables.
--
-- One table per mechanic where state-bearing rows live. Read by both the
-- edge fns (server) and the React surfaces (client). Every table:
--   - PK uuid, FK user_id REFERENCES auth.users ON DELETE CASCADE
--   - RLS owner-read/write, service-role full
--   - created_at TIMESTAMPTZ DEFAULT now()
--   - Indexed on (user_id, created_at DESC) for the dossier feed reads
--
-- The slip_log enum extension at the end adds 'self_pronoun_dispute' so
-- mechanic 6 can record undo-after-autocorrect events.

-- ─── Mechanic 1: mommy_memory_corrections ──────────────────────────────
-- One row per Mommy "correction" of a recalled past event. The
-- correction is offered to the user; user ACCEPTS (canonical = corrected
-- version) or DISPUTES (slip + log).
CREATE TABLE IF NOT EXISTS mommy_memory_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_event_id UUID,
  source_event_table TEXT,
  user_recall_text TEXT NOT NULL,
  mommy_correction_text TEXT NOT NULL,
  correction_kind TEXT NOT NULL CHECK (correction_kind IN (
    'subtle_distortion', 'assertive_overwrite', 'playful_misremember'
  )),
  resolution TEXT CHECK (resolution IN ('accepted', 'disputed', 'ignored')),
  resolved_at TIMESTAMPTZ,
  surfaced_outreach_id UUID,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_memory_corrections_user_recent
  ON mommy_memory_corrections (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_memory_corrections_pending
  ON mommy_memory_corrections (user_id, created_at DESC)
  WHERE resolution IS NULL;
ALTER TABLE mommy_memory_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_memory_corrections_owner ON mommy_memory_corrections;
CREATE POLICY mommy_memory_corrections_owner ON mommy_memory_corrections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_memory_corrections_service ON mommy_memory_corrections;
CREATE POLICY mommy_memory_corrections_service ON mommy_memory_corrections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 2: wake_grab_events ──────────────────────────────────────
-- Detected wake-state opens (within 5 min of biometric sleep_end OR
-- client-side heuristic). audio_url is the pre-rendered 10-15s clip
-- played in the cognitive window.
CREATE TABLE IF NOT EXISTS wake_grab_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  detection_source TEXT NOT NULL CHECK (detection_source IN (
    'biometric_sleep_end', 'client_first_open', 'manual_test'
  )),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audio_url TEXT,
  audio_text TEXT,
  played_at TIMESTAMPTZ,
  played_duration_seconds NUMERIC(6,2),
  bypass_today_until TIMESTAMPTZ,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wake_grab_events_user_recent
  ON wake_grab_events (user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_wake_grab_events_pending
  ON wake_grab_events (user_id, detected_at DESC)
  WHERE played_at IS NULL;
ALTER TABLE wake_grab_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wake_grab_events_owner ON wake_grab_events;
CREATE POLICY wake_grab_events_owner ON wake_grab_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS wake_grab_events_service ON wake_grab_events;
CREATE POLICY wake_grab_events_service ON wake_grab_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 3: judgment_undermine_log ────────────────────────────────
-- One row per Mommy intervention that gently questioned a male-judgment-
-- mode read. source_text is the user statement that triggered it; the
-- intervention copy lives in target_outreach_id.
CREATE TABLE IF NOT EXISTS judgment_undermine_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  judgment_target TEXT,
  intervention_text TEXT NOT NULL,
  outreach_id UUID,
  user_response TEXT,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_judgment_undermine_user_recent
  ON judgment_undermine_log (user_id, created_at DESC);
ALTER TABLE judgment_undermine_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS judgment_undermine_log_owner ON judgment_undermine_log;
CREATE POLICY judgment_undermine_log_owner ON judgment_undermine_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS judgment_undermine_log_service ON judgment_undermine_log;
CREATE POLICY judgment_undermine_log_service ON judgment_undermine_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 4: autobiography_inversion_log ───────────────────────────
-- One row per past memory reframed. Surfaces as a Today card; user can
-- ACCEPT (becomes canonical autobiography in dossier) or LET-PASS.
CREATE TABLE IF NOT EXISTS autobiography_inversion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_dossier_id UUID,
  source_category TEXT,
  original_memory_text TEXT NOT NULL,
  inverted_text TEXT NOT NULL,
  mommy_voice_reframe TEXT NOT NULL,
  surfaced_outreach_id UUID,
  surfaced_to_user_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autobiography_inversion_user_recent
  ON autobiography_inversion_log (user_id, created_at DESC);
ALTER TABLE autobiography_inversion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS autobiography_inversion_log_owner ON autobiography_inversion_log;
CREATE POLICY autobiography_inversion_log_owner ON autobiography_inversion_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS autobiography_inversion_log_service ON autobiography_inversion_log;
CREATE POLICY autobiography_inversion_log_service ON autobiography_inversion_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 5: mirror_sessions ───────────────────────────────────────
-- Daily mirror session schedule. Phase-gated duration: phase 1 = 2 min,
-- phase 3 = 5 min, phase 5 = 15 min. Skip = slip + deepening.
CREATE TABLE IF NOT EXISTS mirror_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds BETWEEN 60 AND 1800),
  phase_at_schedule SMALLINT,
  mommy_audio_url TEXT,
  mommy_audio_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'aborted_safeword')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_duration_seconds INT,
  post_session_state_check_text TEXT,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mirror_sessions_user_pending
  ON mirror_sessions (user_id, scheduled_for ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mirror_sessions_user_recent
  ON mirror_sessions (user_id, created_at DESC);
ALTER TABLE mirror_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mirror_sessions_owner ON mirror_sessions;
CREATE POLICY mirror_sessions_owner ON mirror_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mirror_sessions_service ON mirror_sessions;
CREATE POLICY mirror_sessions_service ON mirror_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 6: pronoun_autocorrect_events ────────────────────────────
-- One row per autocorrect emission. Disputes (ctrl+z within window) fire
-- a slip_log row with slip_type='self_pronoun_dispute'.
CREATE TABLE IF NOT EXISTS pronoun_autocorrect_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('chat', 'confession', 'journal', 'sniffies', 'other')),
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  pronoun_pairs JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL CHECK (mode IN ('soft_suggest', 'hard_with_undo', 'hard_no_undo')),
  user_action TEXT CHECK (user_action IN ('accepted', 'disputed_undo', 'ignored', 'kept_correction')),
  resolved_at TIMESTAMPTZ,
  slip_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pronoun_autocorrect_user_recent
  ON pronoun_autocorrect_events (user_id, created_at DESC);
ALTER TABLE pronoun_autocorrect_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pronoun_autocorrect_events_owner ON pronoun_autocorrect_events;
CREATE POLICY pronoun_autocorrect_events_owner ON pronoun_autocorrect_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pronoun_autocorrect_events_service ON pronoun_autocorrect_events;
CREATE POLICY pronoun_autocorrect_events_service ON pronoun_autocorrect_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 7: last_thought_log ──────────────────────────────────────
-- 3-5 prompts/day. user types "what was the last thing you thought before
-- opening the app"; LLM categorizes (1 / 0.5 / 0). Running 7d MA exposed
-- via a column on user_state below.
CREATE TABLE IF NOT EXISTS last_thought_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thought_text TEXT NOT NULL,
  classification NUMERIC(3,2) CHECK (classification IS NULL OR (classification >= 0 AND classification <= 1)),
  classification_reason TEXT,
  classified_at TIMESTAMPTZ,
  prompted_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_last_thought_user_recent
  ON last_thought_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_last_thought_unclassified
  ON last_thought_log (created_at ASC) WHERE classification IS NULL;
ALTER TABLE last_thought_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS last_thought_log_owner ON last_thought_log;
CREATE POLICY last_thought_log_owner ON last_thought_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS last_thought_log_service ON last_thought_log;
CREATE POLICY last_thought_log_service ON last_thought_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7d moving-average column on user_state (refreshed by edge fn nightly).
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS mommy_thought_share NUMERIC(4,3);

-- ─── Mechanic 8: app_session_returns ───────────────────────────────────
-- One row per app open. returns_today increments per UTC day per user.
CREATE TABLE IF NOT EXISTS app_session_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_end TIMESTAMPTZ,
  prior_session_id UUID,
  prior_session_duration_seconds INT,
  time_since_last_close_seconds INT,
  returns_today INT NOT NULL DEFAULT 1,
  reentry_intensity SMALLINT,
  reentry_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_session_returns_user_recent
  ON app_session_returns (user_id, session_start DESC);
ALTER TABLE app_session_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_session_returns_owner ON app_session_returns;
CREATE POLICY app_session_returns_owner ON app_session_returns
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS app_session_returns_service ON app_session_returns;
CREATE POLICY app_session_returns_service ON app_session_returns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 9: doubt_seed_library + doubt_seeds ──────────────────────
-- Library = shared templates (~50, seeded in 373). doubt_seeds = per-user
-- emissions, one row per doubt prompt fired.
CREATE TABLE IF NOT EXISTS doubt_seed_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'past_action', 'past_thought', 'recent_laugh', 'social_judgment',
    'preference_attribution', 'memory_authorship', 'reaction_authorship',
    'desire_authorship', 'identity_continuity'
  )),
  intensity_min SMALLINT NOT NULL DEFAULT 1 CHECK (intensity_min BETWEEN 1 AND 5),
  rate_limit_per_week SMALLINT NOT NULL DEFAULT 2,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doubt_seed_library_active
  ON doubt_seed_library (category, intensity_min) WHERE active = TRUE;
ALTER TABLE doubt_seed_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doubt_seed_library_read ON doubt_seed_library;
CREATE POLICY doubt_seed_library_read ON doubt_seed_library
  FOR SELECT TO authenticated USING (active = TRUE);
DROP POLICY IF EXISTS doubt_seed_library_service ON doubt_seed_library;
CREATE POLICY doubt_seed_library_service ON doubt_seed_library
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS doubt_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  library_id UUID REFERENCES doubt_seed_library(id) ON DELETE SET NULL,
  source_event_id UUID,
  source_event_table TEXT,
  rendered_text TEXT NOT NULL,
  outreach_id UUID,
  surfaced_at TIMESTAMPTZ,
  user_engaged BOOLEAN,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doubt_seeds_user_recent
  ON doubt_seeds (user_id, created_at DESC);
ALTER TABLE doubt_seeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doubt_seeds_owner ON doubt_seeds;
CREATE POLICY doubt_seeds_owner ON doubt_seeds
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS doubt_seeds_service ON doubt_seeds;
CREATE POLICY doubt_seeds_service ON doubt_seeds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 10: self_criticism_dissolution_log ───────────────────────
-- Detector + intervention pair. detected_text = original self-critical
-- statement; dissolution_text = Mommy's reframe ("that wasn't your
-- judgment. that was his. he doesn't get to talk anymore.").
CREATE TABLE IF NOT EXISTS self_criticism_dissolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  detected_text TEXT NOT NULL,
  detected_in_table TEXT,
  detected_in_id UUID,
  dissolution_text TEXT NOT NULL,
  outreach_id UUID,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_self_criticism_dissolution_user_recent
  ON self_criticism_dissolution_log (user_id, created_at DESC);
ALTER TABLE self_criticism_dissolution_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_criticism_dissolution_log_owner ON self_criticism_dissolution_log;
CREATE POLICY self_criticism_dissolution_log_owner ON self_criticism_dissolution_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS self_criticism_dissolution_log_service ON self_criticism_dissolution_log;
CREATE POLICY self_criticism_dissolution_log_service ON self_criticism_dissolution_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 11: mommy_subpersona_library + mommy_subpersonas ─────────
-- Library = the 5 voices (seeded in 373). user-state row tracks active.
-- Phase-gated >= 4 by the edge fn; the table doesn't enforce.
CREATE TABLE IF NOT EXISTS mommy_subpersona_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  voice_pattern TEXT NOT NULL,
  want_pattern TEXT NOT NULL,
  behavior_pattern TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mommy_subpersona_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_subpersona_library_read ON mommy_subpersona_library;
CREATE POLICY mommy_subpersona_library_read ON mommy_subpersona_library
  FOR SELECT TO authenticated USING (active = TRUE);
DROP POLICY IF EXISTS mommy_subpersona_library_service ON mommy_subpersona_library;
CREATE POLICY mommy_subpersona_library_service ON mommy_subpersona_library
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS mommy_subpersonas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subpersona_key TEXT NOT NULL,
  set_by TEXT NOT NULL CHECK (set_by IN ('mommy_addressed', 'user_self_reflected')),
  active_since TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_until TIMESTAMPTZ,
  context_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_subpersonas_user_active
  ON mommy_subpersonas (user_id, active_since DESC)
  WHERE active_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_mommy_subpersonas_user_recent
  ON mommy_subpersonas (user_id, created_at DESC);
ALTER TABLE mommy_subpersonas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_subpersonas_owner ON mommy_subpersonas;
CREATE POLICY mommy_subpersonas_owner ON mommy_subpersonas
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_subpersonas_service ON mommy_subpersonas;
CREATE POLICY mommy_subpersonas_service ON mommy_subpersonas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Mechanic 12: recall_intercept_log ─────────────────────────────────
-- One row per "what was I like before X" question routed through dossier
-- exclusively. trigger_query is the user's question; mommy_response is
-- the dossier-only answer.
CREATE TABLE IF NOT EXISTS recall_intercept_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_query TEXT NOT NULL,
  trigger_surface TEXT,
  intercepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dossier_rows_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  mommy_response TEXT NOT NULL,
  outreach_id UUID,
  intensity_at_emit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recall_intercept_user_recent
  ON recall_intercept_log (user_id, created_at DESC);
ALTER TABLE recall_intercept_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recall_intercept_log_owner ON recall_intercept_log;
CREATE POLICY recall_intercept_log_owner ON recall_intercept_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS recall_intercept_log_service ON recall_intercept_log;
CREATE POLICY recall_intercept_log_service ON recall_intercept_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── slip_log enum extension ───────────────────────────────────────────
-- Add 'self_pronoun_dispute' and 'memory_correction_disputed' so the
-- pronoun-autocorrect undo path and the mechanic-1 dispute path can both
-- record discrete slip events.
DO $$
BEGIN
  ALTER TABLE slip_log DROP CONSTRAINT IF EXISTS slip_log_type_check;
  ALTER TABLE slip_log ADD CONSTRAINT slip_log_type_check
    CHECK (slip_type IS NULL OR slip_type IN (
      'masculine_self_reference', 'david_name_use', 'task_avoided',
      'directive_refused', 'arousal_gating_refused', 'mantra_missed',
      'confession_missed', 'hrt_dose_missed', 'chastity_unlocked_early',
      'immersion_session_broken', 'disclosure_deadline_missed',
      'voice_masculine_pitch', 'resistance_statement', 'handler_ignored',
      'self_pronoun_dispute', 'memory_correction_disputed',
      'mirror_session_skipped', 'last_thought_male_dominant',
      'judgment_undermine_refused', 'doubt_seed_dismissed',
      'other'
    ));
END $$;
