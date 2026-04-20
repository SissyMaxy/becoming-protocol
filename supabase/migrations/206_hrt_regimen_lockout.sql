-- Migration 206: HRT / Regimen Adherence Ratchet + Chastity Lockout Protocol
-- Idempotent: uses CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS for
-- every column so partial prior runs are recovered safely.

-- ============================================================================
-- Regimen: HRT, spiro, herbals, anti-androgens, supplements
-- ============================================================================

CREATE TABLE IF NOT EXISTS medication_regimen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE medication_regimen
  ADD COLUMN IF NOT EXISTS medication_name TEXT,
  ADD COLUMN IF NOT EXISTS medication_category TEXT,
  ADD COLUMN IF NOT EXISTS dose_amount TEXT,
  ADD COLUMN IF NOT EXISTS dose_times_per_day INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dose_schedule_hours INTEGER[] DEFAULT '{8}',
  ADD COLUMN IF NOT EXISTS started_at DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS ratchet_stage TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS prescriber TEXT,
  ADD COLUMN IF NOT EXISTS refill_source TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cease_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cease_cooldown_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ceased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_regimen_category_check') THEN
    ALTER TABLE medication_regimen ADD CONSTRAINT medication_regimen_category_check
      CHECK (medication_category IS NULL OR medication_category IN (
        'estrogen', 'progesterone', 'anti_androgen', 'spironolactone',
        'herbal_feminizing', 'supplement', 'other'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_regimen_stage_check') THEN
    ALTER TABLE medication_regimen ADD CONSTRAINT medication_regimen_stage_check
      CHECK (ratchet_stage IN ('research', 'consult_scheduled', 'prescribed', 'active', 'ceased'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_regimen_user_active ON medication_regimen(user_id, active);

ALTER TABLE medication_regimen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own regimen" ON medication_regimen;
CREATE POLICY "Users own regimen" ON medication_regimen FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Dose log
-- ============================================================================

CREATE TABLE IF NOT EXISTS dose_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  regimen_id UUID NOT NULL REFERENCES medication_regimen(id) ON DELETE CASCADE
);

ALTER TABLE dose_log
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skipped BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skip_reason TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_type TEXT,
  ADD COLUMN IF NOT EXISTS late_by_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS triggered_slip_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dose_log_confirmation_check') THEN
    ALTER TABLE dose_log ADD CONSTRAINT dose_log_confirmation_check
      CHECK (confirmation_type IS NULL OR confirmation_type IN ('photo', 'timestamp', 'text'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dose_log_user_scheduled ON dose_log(user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_dose_log_missed ON dose_log(user_id, scheduled_at) WHERE taken_at IS NULL AND skipped = FALSE;

ALTER TABLE dose_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own doses" ON dose_log;
CREATE POLICY "Users own doses" ON dose_log FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Chastity Lockout Protocol
-- ============================================================================

CREATE TABLE IF NOT EXISTS chastity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE chastity_sessions
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS scheduled_unlock_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_unlock_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_set_by TEXT DEFAULT 'handler',
  ADD COLUMN IF NOT EXISTS unlock_authority TEXT,
  ADD COLUMN IF NOT EXISTS duration_hours INTEGER,
  ADD COLUMN IF NOT EXISTS streak_day INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS break_glass_used BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS break_glass_reason TEXT,
  ADD COLUMN IF NOT EXISTS break_glass_evidence JSONB,
  ADD COLUMN IF NOT EXISTS break_glass_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS cage_model TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'locked',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chastity_sessions_lock_set_by_check') THEN
    ALTER TABLE chastity_sessions ADD CONSTRAINT chastity_sessions_lock_set_by_check
      CHECK (lock_set_by IN ('handler', 'gina', 'self'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chastity_sessions_unlock_authority_check') THEN
    ALTER TABLE chastity_sessions ADD CONSTRAINT chastity_sessions_unlock_authority_check
      CHECK (unlock_authority IS NULL OR unlock_authority IN ('handler_scheduled', 'gina_release', 'self_break_glass', 'expired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chastity_sessions_status_check') THEN
    ALTER TABLE chastity_sessions ADD CONSTRAINT chastity_sessions_status_check
      CHECK (status IN ('locked', 'released', 'broken_glass', 'expired_pending_relock'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chastity_user_active ON chastity_sessions(user_id, status) WHERE status = 'locked';
CREATE INDEX IF NOT EXISTS idx_chastity_user_recent ON chastity_sessions(user_id, locked_at DESC);

ALTER TABLE chastity_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own chastity" ON chastity_sessions;
CREATE POLICY "Users own chastity" ON chastity_sessions FOR ALL USING (auth.uid() = user_id);

-- Aggregate lockout state on user_state
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS chastity_locked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS chastity_current_session_id UUID,
  ADD COLUMN IF NOT EXISTS chastity_streak_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chastity_total_break_glass_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chastity_scheduled_unlock_at TIMESTAMPTZ;

-- ============================================================================
-- Gina release windows
-- ============================================================================

CREATE TABLE IF NOT EXISTS gina_release_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE gina_release_windows
  ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gina_decision TEXT,
  ADD COLUMN IF NOT EXISTS gina_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gina_note TEXT,
  ADD COLUMN IF NOT EXISTS chastity_session_id UUID REFERENCES chastity_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gina_release_windows_decision_check') THEN
    ALTER TABLE gina_release_windows ADD CONSTRAINT gina_release_windows_decision_check
      CHECK (gina_decision IS NULL OR gina_decision IN ('pending', 'release_approved', 'release_denied', 'extended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grw_user_recent ON gina_release_windows(user_id, window_start DESC);
ALTER TABLE gina_release_windows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own release windows" ON gina_release_windows;
CREATE POLICY "Users own release windows" ON gina_release_windows FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
