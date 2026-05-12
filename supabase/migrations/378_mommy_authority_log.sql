-- Migration 378 — Mommy authority log: headspace-capture column extensions (2026-05-11)
--
-- The base `mommy_authority_log` table was created in migration 400 (PR #53 —
-- authority-wave) with columns sized for that wave's needs:
--   action_kind, source_system, action_summary, voice_excerpt, action_payload,
--   shipped_at, acknowledged_at, reverted_at, reverted_reason
--
-- The headspace-capture trio (ambient / daily plan / implant ladder / letters)
-- needs additional pointer columns so each row can name the artifact it shipped:
--   ambient_track_id    → mommy_ambient_tracks      (mig 375)
--   daily_plan_id       → mommy_daily_plan          (mig 376)
--   implant_sequence_id → memory_implant_sequences  (mig 377)
--   implant_step_id     → memory_implant_steps      (mig 377)
--   outreach_id         → handler_outreach_queue    (soft pointer, no FK)
--
-- Plus denormalised aliases (`system`, `summary`, `payload`, `created_at`) that
-- the headspace-capture edge functions write alongside the existing mig 400
-- columns. All additions are nullable so existing log_mommy_authority RPC
-- callers (mig 400) continue to work unchanged.
--
-- Purely additive — no DROPs, no NOT NULL adds, no policy changes. RLS already
-- enforces auth.uid() = user_id from mig 400.

-- New FK pointer columns (each nullable; at most one set per row).
ALTER TABLE mommy_authority_log
  ADD COLUMN IF NOT EXISTS ambient_track_id UUID,
  ADD COLUMN IF NOT EXISTS daily_plan_id UUID,
  ADD COLUMN IF NOT EXISTS implant_sequence_id UUID,
  ADD COLUMN IF NOT EXISTS implant_step_id UUID,
  ADD COLUMN IF NOT EXISTS outreach_id UUID;

-- Short-name aliases used by the headspace-capture edge functions. The new
-- functions populate BOTH the mig 400 columns (source_system / action_summary
-- / action_payload / shipped_at) and these aliases for forward-compatible reads.
ALTER TABLE mommy_authority_log
  ADD COLUMN IF NOT EXISTS system TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Best-effort FK wiring — only attaches if the referenced tables exist at
-- migration time. ON DELETE SET NULL so log rows survive artifact deletion.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mommy_ambient_tracks') THEN
    BEGIN
      ALTER TABLE mommy_authority_log
        ADD CONSTRAINT mommy_authority_log_ambient_fk
        FOREIGN KEY (ambient_track_id) REFERENCES mommy_ambient_tracks(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mommy_daily_plan') THEN
    BEGIN
      ALTER TABLE mommy_authority_log
        ADD CONSTRAINT mommy_authority_log_daily_plan_fk
        FOREIGN KEY (daily_plan_id) REFERENCES mommy_daily_plan(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memory_implant_sequences') THEN
    BEGIN
      ALTER TABLE mommy_authority_log
        ADD CONSTRAINT mommy_authority_log_implant_seq_fk
        FOREIGN KEY (implant_sequence_id) REFERENCES memory_implant_sequences(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'memory_implant_steps') THEN
    BEGIN
      ALTER TABLE mommy_authority_log
        ADD CONSTRAINT mommy_authority_log_implant_step_fk
        FOREIGN KEY (implant_step_id) REFERENCES memory_implant_steps(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Index for the headspace-capture per-system read pattern. Mig 400 already has
-- (user_id, shipped_at DESC) and (user_id, action_kind, shipped_at DESC).
CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_by_system
  ON mommy_authority_log (user_id, system, created_at DESC);

NOTIFY pgrst, 'reload schema';
