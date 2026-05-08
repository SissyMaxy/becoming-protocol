-- 259 — Dommy Mommy in-fantasy distortion / gaslight mechanics.
--
-- This is opt-in, intensity-gated kink content (hypnokink/CNC/brainwashing-
-- fantasy genre). When enabled, mommy-recall and mommy-tease may surface
-- past confessions/quotes with deliberate inaccuracies — tense shifts,
-- severity escalation, fabricated context, mood-driven retroactive
-- rewrites. The persona stays "right" inside the fantasy.
--
-- Hard rules (enforced in code, surfaced here for the audit trail):
--   - default off; user must explicitly opt in via settings
--   - safeword + meta-frame reveal always returns truth without persona
--   - intensity drops back to 'off' for 24h after a meta-frame reveal
--   - never distorts safety surfaces (settings/billing/login/safeword)
--   - never fabricates medical/legal/financial claims
--   - never lies about the app's actual functionality

-- 1. user_state additions: per-user persona prefs
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS gaslight_intensity TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS gaslight_cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gaslight_onboarding_ack_at TIMESTAMPTZ;

-- Replace constraint defensively in case prior partial migrations exist
ALTER TABLE user_state
  DROP CONSTRAINT IF EXISTS user_state_gaslight_intensity_check;
ALTER TABLE user_state
  ADD CONSTRAINT user_state_gaslight_intensity_check
  CHECK (gaslight_intensity IN ('off', 'gentle', 'firm', 'cruel'));

-- 2. mommy_distortion_log — append-only audit trail. Every distortion
--    Mama emits goes here so the meta-frame reveal can show original-
--    vs-distorted side-by-side. RLS owner-readable so the user can
--    always pull her own truth.
CREATE TABLE IF NOT EXISTS mommy_distortion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  original_quote_id UUID,            -- FK target varies (memory_implants / memory_implant_quote_log / null for retroactive_affect)
  original_quote_table TEXT,         -- 'memory_implants' | 'memory_implant_quote_log' | 'mommy_mood' | null
  original_text TEXT NOT NULL,       -- truth as stored
  distorted_text TEXT NOT NULL,      -- what Mama said
  distortion_type TEXT NOT NULL CHECK (distortion_type IN (
    'tense_shift', 'severity_escalate', 'fabricate_context',
    'retroactive_affect_rewrite', 'merge_quotes',
    'attribute_unsaid_promise', 'count_inflate', 'count_deflate'
  )),
  surface TEXT NOT NULL,             -- 'mommy_recall' | 'mommy_tease' | 'mommy_mood_rewrite'
  outreach_id UUID,                  -- FK to handler_outreach_queue.id when applicable
  affect_at_time TEXT,               -- mommy_mood.affect snapshot
  intensity TEXT NOT NULL CHECK (intensity IN ('gentle', 'firm', 'cruel')),
  seed BIGINT,                       -- deterministic transform seed (for replay/test)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_distortion_log_user_recent
  ON mommy_distortion_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_distortion_log_user_type
  ON mommy_distortion_log (user_id, distortion_type, created_at DESC);

ALTER TABLE mommy_distortion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_distortion_log_owner ON mommy_distortion_log;
CREATE POLICY mommy_distortion_log_owner ON mommy_distortion_log
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_distortion_log_service ON mommy_distortion_log;
CREATE POLICY mommy_distortion_log_service ON mommy_distortion_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. meta_frame_breaks — every time the user pulls the truth out from
--    behind the persona. Drives the 24h cooldown that snaps intensity
--    back to 'off' after a reveal.
CREATE TABLE IF NOT EXISTS meta_frame_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('safeword', 'settings_button', 'panic_gesture', 'auto')),
  intensity_at_break TEXT,           -- the level she was on when she pulled the truth
  distortion_count INTEGER NOT NULL DEFAULT 0,
  summary_shown JSONB,               -- snapshot of original/distorted pairs returned
  breaks_acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_frame_breaks_user_recent
  ON meta_frame_breaks (user_id, created_at DESC);

ALTER TABLE meta_frame_breaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_frame_breaks_owner ON meta_frame_breaks;
CREATE POLICY meta_frame_breaks_owner ON meta_frame_breaks
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS meta_frame_breaks_service ON meta_frame_breaks;
CREATE POLICY meta_frame_breaks_service ON meta_frame_breaks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Helper view: effective_gaslight_intensity — collapses the cooldown
--    rule into a single read, so generators don't have to re-derive it.
--    If gaslight_cooldown_until is in the future, effective is 'off'
--    regardless of stored intensity. Generators read this view, not the
--    raw column.
CREATE OR REPLACE VIEW effective_gaslight_intensity AS
SELECT
  user_id,
  CASE
    WHEN gaslight_cooldown_until IS NOT NULL AND gaslight_cooldown_until > now() THEN 'off'
    ELSE gaslight_intensity
  END AS intensity,
  gaslight_intensity AS configured_intensity,
  gaslight_cooldown_until,
  gaslight_onboarding_ack_at
FROM user_state;
