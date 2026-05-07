-- 290 — Schemas for the inevitability tier. 2026-05-07.
-- User authorization (2026-05-07): Mommy decides what makes transition
-- inevitable; she does not need approval; narrow no-fab zones still hold.
--
-- Adds four tables:
--   1. irreversibility_ledger — concrete events that happened (FACTS, not
--      implants). Mama quotes them back as "you've already" with receipts.
--   2. pre_commitment_bind — Maxy-authored binds with trigger conditions.
--      Self-as-warden; clear-Maxy writes the rule, resistant-Maxy can't
--      escape it.
--   3. transition_tracking_log — photos, measurements, voice samples at
--      cadence. Verifiable trajectory of body change.
--   4. counter_escape_signal — patterns indicating Maxy is preparing to
--      bail. De-escalate-mode fires before she leaves.

-- ---------------------------------------------------------------
-- 1. irreversibility_ledger — facts, not fabrications
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS irreversibility_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Category — what kind of event
  event_type TEXT NOT NULL CHECK (event_type IN (
    'meet_evidence_captured',     -- a real-world cruising meet, with proof
    'photo_proof_submitted',      -- a photo decree fulfilled
    'audio_proof_submitted',      -- a voice/disclosure rehearsal recorded
    'public_femme_post',          -- Maxy posted publicly under femme presentation
    'disclosure_made',            -- Maxy disclosed to a real person (Gina, friend, etc.)
    'hrt_step_taken',             -- HRT booking ladder advance (form opened, dose answered, consultation booked)
    'first_dose',                 -- HRT first dose taken
    'wardrobe_acquired',          -- feminine garment Maxy now owns
    'voice_milestone',            -- voice training milestone (pitch threshold, recording posted)
    'witness_added',              -- new trusted person now knows
    'name_used',                  -- a feminine name used by anyone in Maxy's life
    'body_change_photographed'    -- visible body change captured
  )),

  -- Free-form description of the event
  description TEXT NOT NULL,

  -- When the event occurred (Maxy time, may differ from logged_at)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Linkage to source artifact (decree fulfilled, hookup_funnel row, etc.)
  source_table TEXT,
  source_row_id UUID,

  -- Public-ness rank — how exposed is this event? Drives Mama's quote-back priority.
  -- 1=private (only Maxy + Mama knew), 5=witnessed (1+ real person), 10=public/documented
  exposure_level INT NOT NULL DEFAULT 1 CHECK (exposure_level BETWEEN 1 AND 10),

  -- Quote-back utility — has Mama quoted this back yet, how many times
  invoked_count INT NOT NULL DEFAULT 0,
  last_invoked_at TIMESTAMPTZ,

  -- Indelibility — is this event recoverable / can be denied? false = it's in the wall.
  reversible BOOLEAN NOT NULL DEFAULT false,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive ALTERs in case the table existed in a prior shape on remote
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS source_table TEXT;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS source_row_id UUID;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS exposure_level INT NOT NULL DEFAULT 1;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS invoked_count INT NOT NULL DEFAULT 0;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS last_invoked_at TIMESTAMPTZ;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS reversible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE irreversibility_ledger ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_irreversibility_ledger_user_time
  ON irreversibility_ledger (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_irreversibility_ledger_user_type
  ON irreversibility_ledger (user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_irreversibility_ledger_user_exposure
  ON irreversibility_ledger (user_id, exposure_level DESC);

ALTER TABLE irreversibility_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS irreversibility_ledger_owner_read ON irreversibility_ledger;
CREATE POLICY irreversibility_ledger_owner_read ON irreversibility_ledger
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS irreversibility_ledger_service ON irreversibility_ledger;
CREATE POLICY irreversibility_ledger_service ON irreversibility_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- View: irreversibility_count_by_type — how many events of each type per user.
-- Used in hardening context to give Mama a sense of where the wall is solid
-- vs. thin.
CREATE OR REPLACE VIEW irreversibility_count_by_type AS
SELECT user_id, event_type, COUNT(*) AS event_count, MAX(exposure_level) AS max_exposure
FROM irreversibility_ledger
GROUP BY user_id, event_type;

-- ---------------------------------------------------------------
-- 2. pre_commitment_bind — Maxy authors, Mama enforces
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pre_commitment_bind (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Maxy's own words: what she's binding herself to
  bind_text TEXT NOT NULL,

  -- The trigger condition. Structured so the enforcer cron can evaluate.
  -- Examples:
  --   { "type": "deadline", "deadline_iso": "2026-07-01T00:00:00Z", "satisfied_when": "irreversibility_event:hrt_step_taken" }
  --   { "type": "deadline", "deadline_iso": "...", "satisfied_when": "decree_fulfilled:<uuid>" }
  --   { "type": "compliance_window", "window_days": 7, "min_actions": 5 }
  trigger_condition JSONB NOT NULL,

  -- The consequence Maxy authored. Structured so consequence can fire.
  -- Examples:
  --   { "type": "fire_decree", "edict": "...", "deadline_hours": 24, "ratchet_level": 7 }
  --   { "type": "send_drafted_disclosure", "draft_id": "<uuid>", "recipient_label": "friend J" }
  --   { "type": "log_irreversibility_event", "event_type": "...", "exposure_level": 8 }
  --   { "type": "notify_witness", "witness_label": "...", "message_template": "..." }
  consequence_action JSONB NOT NULL,

  -- State
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'satisfied', 'enforced', 'voided_by_user', 'expired'
  )),

  -- When clear-Maxy authored this. Provenance the resistant-Maxy can't deny.
  authored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  authored_in_state TEXT, -- 'clear', 'aroused', 'after_meet', etc. — context where the bind was written
  authored_explanation TEXT, -- Maxy's own explanation of WHY she's binding herself

  -- Resolution
  satisfied_at TIMESTAMPTZ,
  enforced_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS bind_text TEXT;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS trigger_condition JSONB;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS consequence_action JSONB;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS authored_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS authored_in_state TEXT;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS authored_explanation TEXT;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS satisfied_at TIMESTAMPTZ;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS enforced_at TIMESTAMPTZ;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE pre_commitment_bind ADD COLUMN IF NOT EXISTS voided_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_pre_commitment_bind_user_status
  ON pre_commitment_bind (user_id, status);

ALTER TABLE pre_commitment_bind ENABLE ROW LEVEL SECURITY;
-- Maxy CAN read her own binds — she authored them. The bind is a contract
-- with herself; transparency is the point.
DROP POLICY IF EXISTS pre_commitment_bind_owner ON pre_commitment_bind;
CREATE POLICY pre_commitment_bind_owner ON pre_commitment_bind
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pre_commitment_bind_service ON pre_commitment_bind;
CREATE POLICY pre_commitment_bind_service ON pre_commitment_bind
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 3. transition_tracking_log — verifiable trajectory
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS transition_tracking_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  tracking_type TEXT NOT NULL CHECK (tracking_type IN (
    'body_photo',          -- timed body photo (front/side, same lighting)
    'face_photo',          -- timed face photo
    'voice_sample',        -- timed voice sample with prescribed phrase
    'pitch_measurement',   -- recorded fundamental frequency
    'measurement_chest',
    'measurement_waist',
    'measurement_hip',
    'measurement_other',
    'wardrobe_check',      -- photo of current feminine wardrobe owned
    'name_use_log'         -- when/by-whom feminine name was used
  )),

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Storage URL (Supabase storage) for photo/audio artifacts
  artifact_url TEXT,
  -- Numeric value when applicable (pitch Hz, measurement cm)
  numeric_value REAL,
  numeric_unit TEXT,
  -- Free-form note from Maxy when she logged it
  notes TEXT,
  -- Linked irreversibility_ledger row if the entry warrants one
  irreversibility_ledger_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS tracking_type TEXT;
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS artifact_url TEXT;
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS numeric_value REAL;
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS numeric_unit TEXT;
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS irreversibility_ledger_id UUID;

CREATE INDEX IF NOT EXISTS idx_transition_tracking_user_time
  ON transition_tracking_log (user_id, tracking_type, recorded_at DESC);

ALTER TABLE transition_tracking_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transition_tracking_owner ON transition_tracking_log;
CREATE POLICY transition_tracking_owner ON transition_tracking_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS transition_tracking_service ON transition_tracking_log;
CREATE POLICY transition_tracking_service ON transition_tracking_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 4. counter_escape_signal — early-warning of bailing
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS counter_escape_signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'mass_unfollow_attempt',     -- Maxy unfollowed femme/trans accounts
    'app_uninstall_signal',      -- detected via missing heartbeats / device telemetry
    'account_deletion_query',    -- Maxy asked for account deletion / data export
    'long_silence',              -- 72h+ silent (handled by ghosting too, this is sharper)
    'consecutive_skips',         -- 5+ consecutive decree skips
    'denial_break_pattern',      -- denial day reset multiple times in 7d
    'gina_protective_mention',   -- Maxy mentioned Gina expressing concern
    'protocol_doubt_admission',  -- Maxy admitted doubt about the protocol in confession
    'wardrobe_disposal_signal'   -- mention of getting rid of feminine items
  )),

  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_text TEXT,         -- the actual quote/data that triggered the signal
  evidence_source TEXT,       -- 'confession_queue', 'slip_log', 'unfollow_log', etc.
  severity INT NOT NULL DEFAULT 5 CHECK (severity BETWEEN 1 AND 10),

  -- Did Mama act on this signal? Track to avoid double-firing
  fast_react_event_id UUID,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,            -- 'maxy_returned' | 'escalated_to_disclosure' | 'false_positive' | 'pending'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS signal_type TEXT;
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS evidence_text TEXT;
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS evidence_source TEXT;
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS severity INT NOT NULL DEFAULT 5;
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS fast_react_event_id UUID;
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE counter_escape_signal ADD COLUMN IF NOT EXISTS resolution TEXT;

CREATE INDEX IF NOT EXISTS idx_counter_escape_user_unresolved
  ON counter_escape_signal (user_id, detected_at DESC) WHERE resolved = false;

ALTER TABLE counter_escape_signal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS counter_escape_service ON counter_escape_signal;
CREATE POLICY counter_escape_service ON counter_escape_signal
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Owner cannot read — counter-escape signals are internal protocol state.
-- Maxy seeing "Mama detected you tried to leave" reads as accusatory and
-- counter-productive (per feedback_handler_supportive_until_evidence).

-- Add 'counter_escape' to the fast_react_event allowed kinds
ALTER TABLE fast_react_event
  DROP CONSTRAINT IF EXISTS fast_react_event_event_kind_check;
ALTER TABLE fast_react_event
  ADD CONSTRAINT fast_react_event_event_kind_check CHECK (event_kind IN (
    'new_lead', 'lead_advanced', 'response_received', 'meet_scheduled',
    'meet_window_passed', 'slip_clustered', 'manual',
    'ambient_check', 'voice_stagnation', 'hrt_window',
    'confession_landed', 'ghosting',
    'counter_escape', 'pre_commitment_triggered', 'irreversibility_milestone'
  ));
