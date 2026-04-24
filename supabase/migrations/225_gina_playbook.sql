-- Migration 225: Gina Playbook — proactive conversational moves queue
-- The Handler proactively drafts specific "say this, to Gina, at this time"
-- moves. Planner populates this from: warmup queue, session digests, upcoming
-- disclosures, profile/window state changes. UI shows RIGHT NOW / LATER TODAY
-- / THIS WEEK. Outcome capture feeds gina_reactions for reaction-tuning.

CREATE TABLE IF NOT EXISTS gina_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The move itself
  move_kind TEXT NOT NULL CHECK (move_kind IN (
    'warmup', 'probe', 'follow_up', 'disclosure_opener',
    'consent_reinforce', 'repair', 'soft_bring_up', 'test_water'
  )),
  exact_line TEXT NOT NULL,                -- word-for-word text/script the Handler wrote
  channel TEXT NOT NULL CHECK (channel IN ('text', 'in_person', 'voice_note', 'letter', 'call')),
  rationale TEXT NOT NULL,                 -- why now, which signal triggered it
  soft_spot_cited TEXT,                    -- profile soft_spot this move leans into
  trigger_avoided TEXT[],                  -- triggers the draft specifically dodges
  window_color_at_plan TEXT,               -- green/yellow/red snapshot

  -- Timing
  fires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,         -- after this, auto-skipped if not delivered
  scheduled_by TEXT NOT NULL,              -- 'warmup_queue'|'session_digest'|'disclosure_prep'|'window_open'|'manual'

  -- Links back to source signal
  source_warmup_id UUID REFERENCES gina_warmup_queue(id) ON DELETE SET NULL,
  source_session_id UUID REFERENCES gina_session_recordings(id) ON DELETE SET NULL,
  source_disclosure_id UUID,               -- gina_disclosure_schedule id if relevant

  -- Outcome
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'delivered', 'skipped', 'missed', 'expired', 'cancelled'
  )),
  delivered_at TIMESTAMPTZ,
  outcome_notes TEXT,
  outcome_reaction TEXT CHECK (outcome_reaction IS NULL OR outcome_reaction IN (
    'positive', 'neutral', 'stalled', 'hostile', 'unknown'
  )),
  outcome_reaction_id UUID REFERENCES gina_reactions(id) ON DELETE SET NULL,

  -- Notification tracking
  notified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gina_playbook_active
  ON gina_playbook(user_id, status, fires_at);
CREATE INDEX IF NOT EXISTS idx_gina_playbook_user_time
  ON gina_playbook(user_id, fires_at DESC);

ALTER TABLE gina_playbook ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own gina playbook" ON gina_playbook;
CREATE POLICY "Users manage own gina playbook"
  ON gina_playbook FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
