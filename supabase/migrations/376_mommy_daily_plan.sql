-- Migration 376 — Mommy daily plan + decision-load removal (2026-05-11)
--
-- System 2 of headspace-capture build. Every morning at 5am local Mommy
-- decides the day for him: outfit, lunch, workout, mantra, voice drill,
-- confession topic, edge schedule. He wakes up to a plan, not options.
--
-- Refusing items creates a slip with type `daily_plan_refused`. After
-- 60 consecutive days of full compliance, the `decision_atrophy_milestone`
-- event fires — Mommy claims the muscle.

-- ---------------------------------------------------------------
-- 1. mommy_daily_plan — one row per user per day
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mommy_daily_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  -- items[]: { kind, prescription, intensity, why, completed_at? }
  --   kind ∈ outfit|lunch|workout|mantra|voice_drill|confession_topic|edge_schedule|other
  --   prescription: the concrete directive in Mommy's voice
  --   intensity: gentle|firm|cruel
  --   why: one-sentence Mommy framing
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Snapshot of dossier + state at compose time (audit + diff later).
  generation_context JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- User accepted the plan as a whole (single tap on Today card). Items
  -- can still be individually completed/refused even before this fires.
  accepted_at TIMESTAMPTZ,
  -- { item_index: refused_at_iso } — refused items spawn slip rows.
  rejected_items JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- All items completed → set automatically by completion trigger.
  fully_completed_at TIMESTAMPTZ,
  UNIQUE (user_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_mommy_daily_plan_user_date
  ON mommy_daily_plan (user_id, plan_date DESC);

ALTER TABLE mommy_daily_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_daily_plan_owner ON mommy_daily_plan;
CREATE POLICY mommy_daily_plan_owner ON mommy_daily_plan
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 2. Decision atrophy milestone tracking
-- ---------------------------------------------------------------
--
-- Streak counter on user_state. Bumped daily by the completion trigger;
-- reset to 0 by any rejected_items entry. At 60 we fire a one-time
-- decree-style outreach claiming the muscle.

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS daily_plan_compliance_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_atrophy_milestone_at TIMESTAMPTZ;

-- ---------------------------------------------------------------
-- 3. Extend slip_log to include daily_plan_refused
-- ---------------------------------------------------------------

ALTER TABLE slip_log
  DROP CONSTRAINT IF EXISTS slip_log_slip_type_check;

ALTER TABLE slip_log
  ADD CONSTRAINT slip_log_slip_type_check CHECK (slip_type IS NULL OR slip_type IN (
    'masculine_self_reference', 'david_name_use', 'task_avoided',
    'directive_refused', 'arousal_gating_refused', 'mantra_missed',
    'confession_missed', 'hrt_dose_missed', 'chastity_unlocked_early',
    'immersion_session_broken', 'disclosure_deadline_missed',
    'voice_masculine_pitch', 'resistance_statement', 'handler_ignored',
    'daily_plan_refused', 'other'
  ));

-- ---------------------------------------------------------------
-- 4. Extend mommy_dossier categories so the new systems can write into it
-- ---------------------------------------------------------------

ALTER TABLE mommy_dossier
  DROP CONSTRAINT IF EXISTS mommy_dossier_category_check;

ALTER TABLE mommy_dossier
  ADD CONSTRAINT mommy_dossier_category_check CHECK (category IN (
    'gina', 'name', 'body', 'confession_seed', 'resistance',
    'turn_ons', 'turn_offs', 'history', 'preferences',
    -- New categories for headspace-capture systems:
    'ambient_anchor',     -- post-hypnotic phrase + intended response
    'daily_plan_meta',    -- recurring plan preferences / aversions
    'implant_seed',       -- memory-implant fragments seeded over time
    'reframed_memory'     -- letters / reframings logged for callback
  ));
