-- Migration 229: Handler hardening + evidence collection
-- Four tables: patch effectiveness scores, weekly evidence reports, neglect
-- gap events, phase graduation log. Support the autonomous hardening loop.

CREATE TABLE IF NOT EXISTS patch_effectiveness_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_id UUID NOT NULL REFERENCES handler_prompt_patches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_active INTEGER NOT NULL,
  applied_count_at_score INTEGER NOT NULL,
  metric_deltas JSONB NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL CHECK (score BETWEEN -10 AND 10),
  verdict TEXT NOT NULL CHECK (verdict IN ('effective','neutral','ineffective','harmful')),
  reasoning TEXT,
  UNIQUE (patch_id, scored_at)
);
CREATE INDEX IF NOT EXISTS idx_patch_eff_user ON patch_effectiveness_scores(user_id, scored_at DESC);
ALTER TABLE patch_effectiveness_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patch_eff_owner" ON patch_effectiveness_scores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS evidence_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_week_start DATE NOT NULL,
  narrative TEXT NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}',
  metrics_snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, report_week_start)
);
CREATE INDEX IF NOT EXISTS idx_evidence_user_time ON evidence_reports(user_id, report_week_start DESC);
ALTER TABLE evidence_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evidence_owner" ON evidence_reports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS neglect_gap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gap_type TEXT NOT NULL,
  last_signal_at TIMESTAMPTZ,
  days_since INTEGER,
  action_taken TEXT NOT NULL,
  commitment_id UUID REFERENCES handler_commitments(id) ON DELETE SET NULL,
  directive_id UUID REFERENCES handler_directives(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gap_events_user ON neglect_gap_events(user_id, created_at DESC);
ALTER TABLE neglect_gap_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gap_events_owner" ON neglect_gap_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS phase_graduations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  graduated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics_at_graduation JSONB NOT NULL DEFAULT '{}',
  triggered_by TEXT NOT NULL DEFAULT 'auto_cron'
);
CREATE INDEX IF NOT EXISTS idx_phase_grads_user ON phase_graduations(user_id, graduated_at DESC);
ALTER TABLE phase_graduations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase_grads_owner" ON phase_graduations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
