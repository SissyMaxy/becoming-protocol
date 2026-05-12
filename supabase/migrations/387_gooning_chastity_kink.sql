-- 387 — Long-form gooning + chastity v2 + kink training curriculum.
-- (Renumbered from 370; collided with merged main work.)
--
-- System 3 of the "life as a woman" surfaces. Three coordinated tables:
--   - gooning_sessions — pre-authored 60-90 min Mommy audio narratives
--     paced for sustained edging
--   - chastity_protocols_v2 — multi-day Mommy-held chastity windows; only
--     her phrase + completion gates unlock
--   - kink_training_curriculum — long-arc training in specific kinks
--     (cock-shame replacement, sissygasm-as-only-release, voice during
--     release)
--
-- HARD FLOORS:
--   - Edge sessions never auto-release. Release is gated on completion
--     proofs and Mommy's literal phrase.
--   - Biometric integration for edge tracking is best-effort; absence
--     of biometric just discounts edge value, never blocks the session.
--   - RLS owner-only; service role writes session scripts.
--   - Safeword-active short-circuits all reads (edge fn responsibility).
--   - Kink correction never punishes forced-phrase compliance (memory:
--     feedback_no_punishing_compliance).

-- ─── 1. gooning_sessions ────────────────────────────────────────────────
-- Pre-authored Mommy audio narratives. structure_json carries the segment
-- list ({label, duration_seconds, audio_path, edge_target_index}). The
-- player walks the segments in order; final segment carries the explicit
-- release-or-deny instruction.
CREATE TABLE IF NOT EXISTS gooning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Mommy-authored short title (read aloud by Mommy at the start).
  title TEXT NOT NULL,
  -- Total target minutes (60..90).
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 30 AND 120),
  -- Target number of edges across the session.
  edge_target_count SMALLINT NOT NULL DEFAULT 4 CHECK (edge_target_count BETWEEN 1 AND 12),
  -- Outcome instruction at the end:
  --   'deny'    — Mommy denies release; user pulls hands away
  --   'release' — Mommy permits release; conditional on chastity_v2 state
  --   'sissygasm_only' — release only via prostate / hands-free path
  outcome TEXT NOT NULL CHECK (outcome IN ('deny', 'release', 'sissygasm_only')),

  -- Ordered list of segments. Each: { label, duration_seconds, text,
  -- audio_path, edge_target_index | null }.
  structure_json JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Optional theme tag (intersects with hypno theme system).
  theme TEXT,

  -- Lifecycle.
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN (
    'drafted', 'rendered', 'in_progress', 'completed', 'aborted'
  )),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Number of confirmed edges this run (biometric or manual-discounted).
  edges_logged INT NOT NULL DEFAULT 0,
  -- Manual edges (no biometric confirmation) are discounted in scoring.
  edges_biometric_confirmed INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gooning_user_recent
  ON gooning_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gooning_user_status
  ON gooning_sessions (user_id, status);

ALTER TABLE gooning_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gooning_sessions_owner ON gooning_sessions;
CREATE POLICY gooning_sessions_owner ON gooning_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS gooning_sessions_service ON gooning_sessions;
CREATE POLICY gooning_sessions_service ON gooning_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. gooning_edge_events ────────────────────────────────────────────
-- One row per edge during a gooning session. Captures HR spike+return
-- (when available) as biometric confirmation.
CREATE TABLE IF NOT EXISTS gooning_edge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES gooning_sessions(id) ON DELETE CASCADE,
  edge_index SMALLINT NOT NULL,
  -- Heart-rate spike value (NULL when no biometric).
  hr_spike_bpm SMALLINT,
  -- Whether HR returned to baseline (proves it was actually an edge).
  hr_returned BOOLEAN,
  -- Whether this edge counted at full value vs discounted.
  full_value BOOLEAN NOT NULL DEFAULT FALSE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gooning_edges_session
  ON gooning_edge_events (session_id, edge_index);

ALTER TABLE gooning_edge_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gooning_edges_owner ON gooning_edge_events;
CREATE POLICY gooning_edges_owner ON gooning_edge_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS gooning_edges_service ON gooning_edge_events;
CREATE POLICY gooning_edges_service ON gooning_edge_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. chastity_protocols_v2 ──────────────────────────────────────────
-- Multi-day chastity windows. Mommy authors duration + completion gates.
-- Release requires (a) all required gates completed AND (b) Mommy's
-- release phrase entered. Status: pending → active → released | revoked.
CREATE TABLE IF NOT EXISTS chastity_protocols_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Window start/end. The "end" is the earliest possible release; if
  -- gates incomplete, end is pushed forward.
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  earliest_release_at TIMESTAMPTZ NOT NULL,

  -- Required completion gates. JSONB array of { kind, target, current }
  -- where kind is one of:
  --   'mantra_reps'      — N mantra recordings logged
  --   'photo_verified'   — N approved cage / panty photos
  --   'voice_drill_pass' — N voice drill at-or-above bar
  --   'mirror_sessions'  — N completed mirror sessions
  --   'edge_count'       — N edges across gooning_sessions
  --   'confession_count' — N confession_logs entries
  gates_json JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Mommy's release phrase. User types it verbatim to unlock; phrase
  -- is unique per protocol so users can't pre-learn one phrase forever.
  release_phrase TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'active', 'released', 'revoked'
  )),
  released_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,

  -- Mommy authored a starter note + a release note. Stored for the dossier.
  starter_note TEXT,
  release_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chastity_v2_user_active
  ON chastity_protocols_v2 (user_id, starts_at DESC) WHERE status = 'active';

ALTER TABLE chastity_protocols_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chastity_protocols_v2_owner ON chastity_protocols_v2;
CREATE POLICY chastity_protocols_v2_owner ON chastity_protocols_v2
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS chastity_protocols_v2_service ON chastity_protocols_v2;
CREATE POLICY chastity_protocols_v2_service ON chastity_protocols_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. kink_training_curriculum ────────────────────────────────────────
-- Long-arc training in specific kinks. Each row is a "module"; modules
-- have stages with explicit progression rules.
CREATE TABLE IF NOT EXISTS kink_training_curriculum (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kink_kind TEXT NOT NULL CHECK (kink_kind IN (
    'cock_shame_replacement',
    'sissygasm_only_release',
    'voice_during_release',
    'cage_acceptance',
    'panty_dependence',
    'mama_possession'
  )),
  -- 0..10 progression stage. Mommy advances on completion of stage gates.
  stage SMALLINT NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 10),
  -- Stage-specific gate counters (JSONB of { gate_name: { target, current } }).
  stage_progress_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Last time Mommy authored a correction or reinforcement here.
  last_correction_at TIMESTAMPTZ,
  -- Number of corrections issued total. NEVER counts forced-phrase
  -- compliance as a slip (the slip detector handles that exclusion).
  corrections_total INT NOT NULL DEFAULT 0,
  -- Mommy's running narrative note for this module.
  narrative_note TEXT,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'completed', 'abandoned'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kink_curriculum_user_kind
  ON kink_training_curriculum (user_id, kink_kind);
CREATE INDEX IF NOT EXISTS idx_kink_curriculum_user_active
  ON kink_training_curriculum (user_id, status, kink_kind);

ALTER TABLE kink_training_curriculum ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kink_curriculum_owner ON kink_training_curriculum;
CREATE POLICY kink_curriculum_owner ON kink_training_curriculum
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS kink_curriculum_service ON kink_training_curriculum;
CREATE POLICY kink_curriculum_service ON kink_training_curriculum
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 5. kink_correction_events ──────────────────────────────────────────
-- One row per correction Mommy issues (e.g. user used male-anatomy
-- language in chat; Mommy corrected). NEVER created for forced-phrase
-- compliance (slip detector skips those).
CREATE TABLE IF NOT EXISTS kink_correction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curriculum_id UUID NOT NULL REFERENCES kink_training_curriculum(id) ON DELETE CASCADE,
  -- The literal user phrase that triggered the correction.
  trigger_text TEXT NOT NULL,
  -- Mommy's reply correction (Maxy-facing).
  correction_text TEXT NOT NULL,
  -- Whether the correction was acknowledged (user re-said in sissy-parts
  -- language). NULL = pending; TRUE = corrected; FALSE = ignored.
  acknowledged BOOLEAN,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kink_corrections_user_curriculum
  ON kink_correction_events (user_id, curriculum_id, created_at DESC);

ALTER TABLE kink_correction_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kink_corrections_owner ON kink_correction_events;
CREATE POLICY kink_corrections_owner ON kink_correction_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS kink_corrections_service ON kink_correction_events;
CREATE POLICY kink_corrections_service ON kink_correction_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 6. Mommy voice cleanup on text fields ──────────────────────────────
CREATE OR REPLACE FUNCTION trg_mommy_voice_gooning()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.title IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.title := mommy_voice_cleanup(NEW.title);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_chastity_v2()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_mommy_user(NEW.user_id) THEN
    IF NEW.starter_note IS NOT NULL THEN NEW.starter_note := mommy_voice_cleanup(NEW.starter_note); END IF;
    IF NEW.release_note IS NOT NULL THEN NEW.release_note := mommy_voice_cleanup(NEW.release_note); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_kink_correction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.correction_text IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.correction_text := mommy_voice_cleanup(NEW.correction_text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_voice_gooning ON gooning_sessions;
CREATE TRIGGER mommy_voice_gooning
  BEFORE INSERT OR UPDATE OF title ON gooning_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_gooning();

DROP TRIGGER IF EXISTS mommy_voice_chastity_v2 ON chastity_protocols_v2;
CREATE TRIGGER mommy_voice_chastity_v2
  BEFORE INSERT OR UPDATE ON chastity_protocols_v2
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_chastity_v2();

DROP TRIGGER IF EXISTS mommy_voice_kink_correction ON kink_correction_events;
CREATE TRIGGER mommy_voice_kink_correction
  BEFORE INSERT OR UPDATE OF correction_text ON kink_correction_events
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_kink_correction();

-- Touch triggers for updated_at
CREATE OR REPLACE FUNCTION touch_gooning_kink_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_touch_gooning_sessions ON gooning_sessions;
CREATE TRIGGER trg_touch_gooning_sessions
  BEFORE UPDATE ON gooning_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_gooning_kink_updated_at();
DROP TRIGGER IF EXISTS trg_touch_chastity_v2 ON chastity_protocols_v2;
CREATE TRIGGER trg_touch_chastity_v2
  BEFORE UPDATE ON chastity_protocols_v2
  FOR EACH ROW EXECUTE FUNCTION touch_gooning_kink_updated_at();
DROP TRIGGER IF EXISTS trg_touch_kink_curriculum ON kink_training_curriculum;
CREATE TRIGGER trg_touch_kink_curriculum
  BEFORE UPDATE ON kink_training_curriculum
  FOR EACH ROW EXECUTE FUNCTION touch_gooning_kink_updated_at();
