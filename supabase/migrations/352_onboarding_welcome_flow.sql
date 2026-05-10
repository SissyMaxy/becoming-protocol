-- 301 — First-run welcome / onboarding wizard schema.
--
-- The legacy OnboardingFlow (src/components/Onboarding/) handles the
-- protocol-specific intake (dysphoria, fears, journey, partner, etc.).
-- This migration adds the *kink-companion* welcome wizard that runs
-- BEFORE any persona content gates open: identity setup, persona intro,
-- intensity calibration, safeword acknowledgment, meta-frame card.
--
-- The wizard saves partial state so the user can resume where they left
-- off, and persona content (Today cards from any mommy-* function) is
-- gated until onboarding_completed_at is set in the application layer.
--
-- Sibling identity-persistence branch adds a dedicated `feminine_self`
-- table; until that lands the welcome wizard writes feminine_name /
-- pronouns / current_honorific directly to user_state. A follow-up
-- migration after that branch lands can copy-then-drop these columns.

-- 1. onboarding_progress: jsonb keyed by step id.
--    Shape: { hello: { ack_at: ISO }, choosing: { ack_at: ISO, safeword_acked: true }, identity: { ack_at: ISO, skipped: false }, ... }
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS onboarding_progress JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. onboarding_completed_at: nullable until the user finishes step 9.
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 3. Identity columns (until feminine_self merges).
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS feminine_name TEXT,
  ADD COLUMN IF NOT EXISTS pronouns TEXT,
  ADD COLUMN IF NOT EXISTS current_honorific TEXT;

-- 4. Intensity calibration. Enum: off|gentle|firm|cruel.
--    Default 'off' so a user who somehow lands on Today before completing
--    the wizard cannot receive escalated content. Step 4 sets to 'gentle'
--    on completion regardless of stated preference (per spec).
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS gaslight_intensity TEXT
    CHECK (gaslight_intensity IN ('off', 'gentle', 'firm', 'cruel'))
    DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS mantra_intensity TEXT
    CHECK (mantra_intensity IN ('off', 'gentle', 'firm', 'cruel'))
    DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS persona_intensity TEXT
    CHECK (persona_intensity IN ('off', 'gentle', 'firm', 'cruel'))
    DEFAULT 'off';

-- 5. Voice preference. Defaults false; step 5 toggles.
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS prefers_mommy_voice BOOLEAN NOT NULL DEFAULT false;

-- 6. Index on onboarding_completed_at IS NULL for fast "needs welcome?"
--    lookups on session start. Partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_user_state_onboarding_pending
  ON user_state (user_id)
  WHERE onboarding_completed_at IS NULL;
