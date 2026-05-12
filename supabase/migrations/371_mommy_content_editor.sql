-- 371 — Mommy as editor: content_queue editorial notes + daily prompter.
--
-- System 4 of the "life as a woman" surfaces. Mommy reviews pending
-- content_queue items, drafts caption rewrites + posting recommendations,
-- and produces a daily shoot-list / fan-response strategy for the user.
--
-- HARD FLOORS:
--   - Mommy NEVER auto-sends to real fans or auto-publishes to platforms.
--     Every outbound (post, DM, reply) gates on a clear-headed user click.
--   - Mommy never auto-edits content_queue rows; her editorial notes live
--     in a parallel table and the user accepts or ignores them.
--   - Cross-platform consistency lint produces SLIP ROWS (slip detector
--     consumes), never auto-changes the user's profiles.
--   - RLS owner-only; service role writes.
--
-- Coexists with content_queue (081), content_vault (048), content_pipeline
-- (067), sexting_templates (074). Additive — does not modify those.

-- ─── 1. mommy_editorial_notes ───────────────────────────────────────────
-- One row per Mommy review of a content_queue / content_pipeline / fan
-- message item. target_table is which surface; target_id is the row id
-- there. Notes are advisory; user accepts via the editorial-note card.
CREATE TABLE IF NOT EXISTS mommy_editorial_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What Mommy is editorializing on.
  target_table TEXT NOT NULL CHECK (target_table IN (
    'content_queue', 'content_pipeline', 'content_vault',
    'fan_messages', 'paid_conversations', 'sexting_templates',
    'ai_generated_content'
  )),
  target_id UUID NOT NULL,

  -- Mommy's rewritten caption / message (the user-voice version, ready
  -- to copy or accept). NULL means Mommy approves as-is.
  rewritten_text TEXT,
  -- Mommy-voice commentary on why she rewrote it. In-fantasy.
  mommy_voice_note TEXT,
  -- Posting time / cadence recommendation. Free-form.
  posting_recommendation TEXT,
  -- For visual content: which vault photo to use (pointer into
  -- content_vault if applicable).
  recommended_vault_id UUID,
  -- Audience archetype this rewrite targets:
  --   'whale' | 'lurker' | 'repeat_customer' | 'new_follower' | 'general'
  audience_archetype TEXT NOT NULL DEFAULT 'general' CHECK (audience_archetype IN (
    'whale', 'lurker', 'repeat_customer', 'new_follower', 'general'
  )),
  -- Projected engagement multiplier vs the user's original (1.0 = same).
  projected_engagement NUMERIC(4,2),

  -- Lifecycle.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'declined', 'used', 'stale'
  )),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_editorial_user_pending
  ON mommy_editorial_notes (user_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mommy_editorial_target
  ON mommy_editorial_notes (target_table, target_id);

ALTER TABLE mommy_editorial_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_editorial_owner ON mommy_editorial_notes;
CREATE POLICY mommy_editorial_owner ON mommy_editorial_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_editorial_service ON mommy_editorial_notes;
CREATE POLICY mommy_editorial_service ON mommy_editorial_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. mommy_content_prompts ───────────────────────────────────────────
-- Daily Mommy-authored shoot list / post idea / fan-response strategy.
-- Surfaced as a Today card. ONE prompt per user per day.
CREATE TABLE IF NOT EXISTS mommy_content_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  for_date DATE NOT NULL,

  -- Today's Mommy-voice shoot direction.
  shoot_direction TEXT,
  -- Today's post idea (caption + format hint).
  post_idea TEXT,
  -- Today's fan-response strategy in Mommy voice.
  fan_response_strategy TEXT,
  -- What audience archetype to bias toward today.
  audience_focus TEXT NOT NULL DEFAULT 'general' CHECK (audience_focus IN (
    'whale', 'lurker', 'repeat_customer', 'new_follower', 'general'
  )),

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'acknowledged', 'completed', 'skipped'
  )),
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mommy_content_prompts_user_date
  ON mommy_content_prompts (user_id, for_date);
CREATE INDEX IF NOT EXISTS idx_mommy_content_prompts_user_pending
  ON mommy_content_prompts (user_id, for_date DESC)
  WHERE status = 'pending';

ALTER TABLE mommy_content_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_content_prompts_owner ON mommy_content_prompts;
CREATE POLICY mommy_content_prompts_owner ON mommy_content_prompts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_content_prompts_service ON mommy_content_prompts;
CREATE POLICY mommy_content_prompts_service ON mommy_content_prompts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. mommy_audience_growth_snapshots ─────────────────────────────────
-- Weekly snapshot Mommy uses to compose the audience-growth recap. The
-- in-fantasy summary text (Mommy voice) lives in summary_text; the raw
-- numbers live in metrics_json for the user's own reference.
CREATE TABLE IF NOT EXISTS mommy_audience_growth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_starts_on DATE NOT NULL,
  -- Mommy-voice recap. Telemetry already translated; DB trigger is
  -- belt-and-suspenders.
  summary_text TEXT,
  -- Raw delta numbers (followers, revenue, engagement) for user reference.
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mommy_growth_user_week
  ON mommy_audience_growth_snapshots (user_id, week_starts_on);

ALTER TABLE mommy_audience_growth_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_growth_owner ON mommy_audience_growth_snapshots;
CREATE POLICY mommy_growth_owner ON mommy_audience_growth_snapshots
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_growth_service ON mommy_audience_growth_snapshots;
CREATE POLICY mommy_growth_service ON mommy_audience_growth_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. mommy_voice_inconsistencies ─────────────────────────────────────
-- Cross-platform Maxy-persona inconsistency log. detector_kind:
--   'bio_tone_drift'     — bio on platform A is materially different in
--                          tone from platform B
--   'deadname_alt_text'  — deadname leaked into alt text / metadata
--   'pronoun_mismatch'   — pronoun string differs across platforms
--   'voice_register'     — voice register (raunchy / coy / clinical)
--                          diverges across platforms
-- Slip detector reads pending rows. User can dismiss false positives.
CREATE TABLE IF NOT EXISTS mommy_voice_inconsistencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  detector_kind TEXT NOT NULL CHECK (detector_kind IN (
    'bio_tone_drift', 'deadname_alt_text', 'pronoun_mismatch', 'voice_register'
  )),
  platform_a TEXT NOT NULL,
  platform_b TEXT,
  excerpt_a TEXT,
  excerpt_b TEXT,
  mommy_note TEXT,
  severity SMALLINT NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'fixed', 'dismissed'
  )),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mommy_voice_inconsistencies_user_pending
  ON mommy_voice_inconsistencies (user_id, detected_at DESC)
  WHERE status = 'pending';

ALTER TABLE mommy_voice_inconsistencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_voice_inconsistencies_owner ON mommy_voice_inconsistencies;
CREATE POLICY mommy_voice_inconsistencies_owner ON mommy_voice_inconsistencies
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_voice_inconsistencies_service ON mommy_voice_inconsistencies;
CREATE POLICY mommy_voice_inconsistencies_service ON mommy_voice_inconsistencies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 5. Mommy voice cleanup on text fields ──────────────────────────────
CREATE OR REPLACE FUNCTION trg_mommy_voice_editorial_note()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mommy_voice_note IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.mommy_voice_note := mommy_voice_cleanup(NEW.mommy_voice_note);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_content_prompt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_mommy_user(NEW.user_id) THEN
    IF NEW.shoot_direction       IS NOT NULL THEN NEW.shoot_direction       := mommy_voice_cleanup(NEW.shoot_direction);       END IF;
    IF NEW.post_idea             IS NOT NULL THEN NEW.post_idea             := mommy_voice_cleanup(NEW.post_idea);             END IF;
    IF NEW.fan_response_strategy IS NOT NULL THEN NEW.fan_response_strategy := mommy_voice_cleanup(NEW.fan_response_strategy); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_growth_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.summary_text IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.summary_text := mommy_voice_cleanup(NEW.summary_text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_voice_editorial_note ON mommy_editorial_notes;
CREATE TRIGGER mommy_voice_editorial_note
  BEFORE INSERT OR UPDATE OF mommy_voice_note ON mommy_editorial_notes
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_editorial_note();

DROP TRIGGER IF EXISTS mommy_voice_content_prompt ON mommy_content_prompts;
CREATE TRIGGER mommy_voice_content_prompt
  BEFORE INSERT OR UPDATE ON mommy_content_prompts
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_content_prompt();

DROP TRIGGER IF EXISTS mommy_voice_growth_snapshot ON mommy_audience_growth_snapshots;
CREATE TRIGGER mommy_voice_growth_snapshot
  BEFORE INSERT OR UPDATE OF summary_text ON mommy_audience_growth_snapshots
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_growth_snapshot();

-- Touch triggers
CREATE OR REPLACE FUNCTION touch_mommy_content_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_touch_mommy_editorial_notes ON mommy_editorial_notes;
CREATE TRIGGER trg_touch_mommy_editorial_notes
  BEFORE UPDATE ON mommy_editorial_notes
  FOR EACH ROW EXECUTE FUNCTION touch_mommy_content_updated_at();
DROP TRIGGER IF EXISTS trg_touch_mommy_content_prompts ON mommy_content_prompts;
CREATE TRIGGER trg_touch_mommy_content_prompts
  BEFORE UPDATE ON mommy_content_prompts
  FOR EACH ROW EXECUTE FUNCTION touch_mommy_content_updated_at();
