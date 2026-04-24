-- Migration 230: Rationalization detector + disclosure drafts + compliance trends
-- Feature set the Handler asked for: name the deflection patterns, pre-write
-- her Gina-facing messages, detect compliance decline before it crashes.

CREATE TABLE IF NOT EXISTS rationalization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id UUID,
  full_text TEXT NOT NULL,
  pattern_hit TEXT NOT NULL,
  pattern_category TEXT NOT NULL CHECK (pattern_category IN (
    'time_excuse', 'emotional_excuse', 'body_excuse', 'external_blame',
    'future_defer', 'false_agency', 'minimization', 'bargaining', 'intellectualizing'
  )),
  severity INTEGER NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  confronted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rationalization_user_time ON rationalization_events(user_id, created_at DESC);
ALTER TABLE rationalization_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rationalization_owner" ON rationalization_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS disclosure_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('text','in_person','letter','voice_note','call')),
  subject_rung INTEGER,
  context_block TEXT NOT NULL,
  draft_text TEXT NOT NULL,
  edited_text TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','edited','sent','skipped','expired')),
  soft_spot_cited TEXT,
  triggers_avoided TEXT[],
  sent_at TIMESTAMPTZ,
  reaction_id UUID REFERENCES gina_reactions(id) ON DELETE SET NULL,
  source_disclosure_id UUID,
  source_playbook_id UUID REFERENCES gina_playbook(id) ON DELETE SET NULL,
  generated_by TEXT NOT NULL DEFAULT 'handler_evolve',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disclosure_drafts_user_status ON disclosure_drafts(user_id, status, created_at DESC);
ALTER TABLE disclosure_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disclosure_drafts_owner" ON disclosure_drafts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS compliance_trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  commit_fulfill_rate_7d NUMERIC(5,2),
  commit_fulfill_rate_30d NUMERIC(5,2),
  slip_points_7d INTEGER,
  slip_points_30d INTEGER,
  directive_fire_count_7d INTEGER,
  outreach_response_rate_7d NUMERIC(5,2),
  trend_verdict TEXT NOT NULL CHECK (trend_verdict IN ('improving','stable','declining','crashing')),
  action_triggered TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, snapshot_date)
);
ALTER TABLE compliance_trend_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_trend_owner" ON compliance_trend_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
