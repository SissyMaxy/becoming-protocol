-- Migration 207: Immersion Protocol + Gina Disclosure Forcing Function (idempotent)

-- ============================================================================
-- Immersion sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS immersion_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE immersion_sessions
  ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS committed_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS session_type TEXT,
  ADD COLUMN IF NOT EXISTS content_plan JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chastity_required BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS phone_locked BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS blackout_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS headphones_required BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS broken_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broken_reason TEXT,
  ADD COLUMN IF NOT EXISTS early_exit_consequences JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS debrief_resistance_notes TEXT,
  ADD COLUMN IF NOT EXISTS debrief_breakthroughs TEXT,
  ADD COLUMN IF NOT EXISTS handler_followup_notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'immersion_sessions_duration_check') THEN
    ALTER TABLE immersion_sessions ADD CONSTRAINT immersion_sessions_duration_check
      CHECK (committed_duration_minutes IS NULL OR committed_duration_minutes BETWEEN 30 AND 1440);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'immersion_sessions_type_check') THEN
    ALTER TABLE immersion_sessions ADD CONSTRAINT immersion_sessions_type_check
      CHECK (session_type IS NULL OR session_type IN ('hypno_loop', 'maxy_mantra', 'goon_queue', 'handler_directive_cycle', 'sleep_overnight', 'mixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'immersion_sessions_status_check') THEN
    ALTER TABLE immersion_sessions ADD CONSTRAINT immersion_sessions_status_check
      CHECK (status IN ('scheduled', 'active', 'completed', 'broken_early', 'missed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_immersion_user_scheduled ON immersion_sessions(user_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_immersion_active ON immersion_sessions(user_id, status) WHERE status IN ('scheduled', 'active');

ALTER TABLE immersion_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own immersion" ON immersion_sessions;
CREATE POLICY "Users own immersion" ON immersion_sessions FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Gina disclosure schedule
-- ============================================================================

CREATE TABLE IF NOT EXISTS gina_disclosure_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE gina_disclosure_schedule
  ADD COLUMN IF NOT EXISTS rung INTEGER,
  ADD COLUMN IF NOT EXISTS disclosure_domain TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS script_draft TEXT,
  ADD COLUMN IF NOT EXISTS ask TEXT,
  ADD COLUMN IF NOT EXISTS capability_unlocked_on_yes TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_by_date DATE,
  ADD COLUMN IF NOT EXISTS hard_deadline DATE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS disclosed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gina_response TEXT,
  ADD COLUMN IF NOT EXISTS gina_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gina_exact_words TEXT,
  ADD COLUMN IF NOT EXISTS escalation_applied BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalation_details JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gina_disclosure_schedule_status_check') THEN
    ALTER TABLE gina_disclosure_schedule ADD CONSTRAINT gina_disclosure_schedule_status_check
      CHECK (status IN ('scheduled', 'disclosed', 'gina_accepted', 'gina_rejected', 'gina_deferred', 'missed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gds_user_rung ON gina_disclosure_schedule(user_id, rung);
CREATE INDEX IF NOT EXISTS idx_gds_deadline ON gina_disclosure_schedule(user_id, hard_deadline) WHERE status = 'scheduled';

ALTER TABLE gina_disclosure_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own disclosure schedule" ON gina_disclosure_schedule;
CREATE POLICY "Users own disclosure schedule" ON gina_disclosure_schedule FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Gina capability grants
-- ============================================================================

CREATE TABLE IF NOT EXISTS gina_capability_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE gina_capability_grants
  ADD COLUMN IF NOT EXISTS capability TEXT,
  ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS granted_via_disclosure_id UUID REFERENCES gina_disclosure_schedule(id),
  ADD COLUMN IF NOT EXISTS granted_exact_words TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_uses INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_gcg_active ON gina_capability_grants(user_id, capability) WHERE active = TRUE;

ALTER TABLE gina_capability_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own grants" ON gina_capability_grants;
CREATE POLICY "Users own grants" ON gina_capability_grants FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
