-- ============================================================
-- HANDLER EVOLUTION: Favorites Intelligence Infrastructure
-- Migration: 085_favorites_intelligence.sql
-- February 2026
--
-- New tables supporting session telemetry, drift tracking,
-- ritual anchors, fantasy architecture, and standing permissions.
-- ============================================================

-- ============================================================
-- 1. SESSION EVENT LOG
-- The missing feedback loop. Tracks what happens DURING sessions.
-- ============================================================

CREATE TABLE IF NOT EXISTS hypno_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'start',
    'video_change',
    'arousal_peak',
    'trance_flag',
    'skip',
    'end',
    'lovense_intensity_change',
    'commitment_extracted',
    'anchor_triggered'
  )),
  hypno_library_id UUID,
  timestamp TIMESTAMPTZ DEFAULT now(),
  lovense_intensity INTEGER CHECK (lovense_intensity BETWEEN 0 AND 20),
  device_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hse_session ON hypno_session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_hse_video ON hypno_session_events(hypno_library_id);
CREATE INDEX IF NOT EXISTS idx_hse_user_time ON hypno_session_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_hse_type ON hypno_session_events(event_type);

ALTER TABLE hypno_session_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own session events"
  ON hypno_session_events FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 2. SESSION SUMMARY
-- Post-session aggregation for Handler prescription optimization.
-- ============================================================

CREATE TABLE IF NOT EXISTS hypno_session_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID NOT NULL UNIQUE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  total_duration_minutes INTEGER,
  denial_day_at_session INTEGER,
  videos_played UUID[],
  videos_skipped UUID[],
  peak_arousal_level INTEGER,
  peak_arousal_video UUID,
  peak_arousal_timestamp TIMESTAMPTZ,
  trance_depth_self_report INTEGER CHECK (trance_depth_self_report BETWEEN 1 AND 5),
  post_session_mood TEXT,
  commitment_extracted BOOLEAN DEFAULT false,
  commitment_text TEXT,
  content_captured BOOLEAN DEFAULT false,
  capture_clip_count INTEGER DEFAULT 0,
  ritual_anchors_active UUID[],
  playlist_id UUID,
  handler_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hss_user ON hypno_session_summary(user_id, started_at DESC);

ALTER TABLE hypno_session_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own session summaries"
  ON hypno_session_summary FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. FAVORITES DRIFT TRACKING
-- Monthly snapshot comparison. Measures organic desire development.
-- ============================================================

CREATE TABLE IF NOT EXISTS favorites_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  platform TEXT DEFAULT 'hypnotube',
  favorites_urls TEXT[],
  favorites_count INTEGER,
  new_since_last JSONB,
  removed_since_last JSONB,
  handler_prescribed_overlap INTEGER,
  organic_additions INTEGER,
  category_distribution JSONB,
  intensity_distribution JSONB,
  creator_distribution JSONB,
  handler_analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fs_user_date ON favorites_snapshots(user_id, snapshot_date DESC);

ALTER TABLE favorites_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own favorites snapshots"
  ON favorites_snapshots FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 4. RITUAL ANCHORS
-- Tracks conditioned triggers being installed through repetition.
-- ============================================================

CREATE TABLE IF NOT EXISTS ritual_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  anchor_type TEXT NOT NULL CHECK (anchor_type IN (
    'scent', 'phrase', 'position', 'device_pattern',
    'lighting', 'sound', 'clothing', 'sequence'
  )),
  anchor_value TEXT NOT NULL,
  sessions_paired INTEGER DEFAULT 0,
  first_paired TIMESTAMPTZ,
  last_paired TIMESTAMPTZ,
  estimated_strength TEXT CHECK (estimated_strength IN (
    'nascent', 'forming', 'established', 'conditioned'
  )) DEFAULT 'nascent',
  autonomous_trigger_observed BOOLEAN DEFAULT false,
  handler_notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ritual_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own ritual anchors"
  ON ritual_anchors FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 5. FANTASY ARCHITECTURE MAP
-- Formalized desire topology from favorites analysis.
-- ============================================================

CREATE TABLE IF NOT EXISTS fantasy_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  axis TEXT NOT NULL CHECK (axis IN ('depth', 'identity', 'scenario')),
  stage_order INTEGER NOT NULL,
  stage_name TEXT NOT NULL,
  content_titles TEXT[],
  content_ids UUID[],
  framing TEXT,
  denial_day_gate INTEGER DEFAULT 0,
  observed_in_favorites BOOLEAN DEFAULT false,
  handler_installed BOOLEAN DEFAULT false,
  progression_status TEXT CHECK (progression_status IN (
    'not_started', 'entered', 'deepening', 'integrated'
  )) DEFAULT 'not_started',
  handler_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fantasy_architecture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own fantasy architecture"
  ON fantasy_architecture FOR ALL USING (auth.uid() = user_id);

-- Seed depth axis (single-user app — get the user_id from auth.users)
INSERT INTO fantasy_architecture (user_id, axis, stage_order, stage_name, content_titles, framing, denial_day_gate, observed_in_favorites)
SELECT
  u.id, 'depth', t.stage_order, t.stage_name, t.content_titles, t.framing, t.denial_day_gate, true
FROM (SELECT id FROM auth.users LIMIT 1) u
CROSS JOIN (VALUES
  (1, 'Entry',       ARRAY['Cock Suck Encouragement 1'],          'Gentle encouragement',    0),
  (2, 'Worship',     ARRAY['Cock Worship Bi Encouragement 25'],   'Devotional framing',      2),
  (3, 'Consent',     ARRAY['Say Yes To Cock'],                    'Surrender / permission',  3),
  (4, 'Authority',   ARRAY['Daddy'],                              'Authority submission',    4),
  (5, 'Dissolution', ARRAY['Day 1'],                              'Full ego dissolution',    5)
) AS t(stage_order, stage_name, content_titles, framing, denial_day_gate);

-- Seed identity axis
INSERT INTO fantasy_architecture (user_id, axis, stage_order, stage_name, content_titles, framing, denial_day_gate, observed_in_favorites)
SELECT
  u.id, 'identity', t.stage_order, t.stage_name, t.content_titles, t.framing, t.denial_day_gate, true
FROM (SELECT id FROM auth.users LIMIT 1) u
CROSS JOIN (VALUES
  (1, 'Sissy Acceptance',     ARRAY['AmberSis Acceptance', 'Sissy Acceptance All Day'], 'Self-framed acceptance',       0),
  (2, 'Womanhood',            ARRAY['Becoming A Woman'],                                 'Womanhood replaces sissy',     1),
  (3, 'Medical Transition',   ARRAY['Estrogen Brainwash 2 - Pinkpilled'],               'Estrogen as destination',      2),
  (4, 'Pinkpilled (Private)', ARRAY['Pinkpilled Looped'],                               'Private. Repeated. Deepest.',  0)
) AS t(stage_order, stage_name, content_titles, framing, denial_day_gate);

-- Seed scenario axis
INSERT INTO fantasy_architecture (user_id, axis, stage_order, stage_name, content_titles, framing, denial_day_gate, observed_in_favorites)
SELECT
  u.id, 'scenario', t.stage_order, t.stage_name, t.content_titles, t.framing, t.denial_day_gate, true
FROM (SELECT id FROM auth.users LIMIT 1) u
CROSS JOIN (VALUES
  (1, 'Fantasy Consumption',   ARRAY['Gloryhole Adventure Time'],  'Watching the scenario',              3),
  (2, 'Fantasy Deepening',     ARRAY[]::text[],                    'Expanded gloryhole content library',  4),
  (3, 'Commitment Extraction', ARRAY[]::text[],                    'Verbal commitment on camera',         5),
  (4, 'Opportunity Creation',  ARRAY[]::text[],                    'Real-world encounter arranged',       7)
) AS t(stage_order, stage_name, content_titles, framing, denial_day_gate);

-- ============================================================
-- 6. STANDING PERMISSIONS
-- Replaces per-action consent with domain-level authorization.
-- ============================================================

CREATE TABLE IF NOT EXISTS handler_standing_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  permission_domain TEXT NOT NULL CHECK (permission_domain IN (
    'session_auto_start',
    'content_auto_approve',
    'content_full_autonomy',
    'outfit_auto_prescribe',
    'schedule_auto_block',
    'fan_auto_respond',
    'cam_auto_schedule',
    'ambient_conditioning',
    'briefing_auto_curate',
    'hrt_pipeline_active'
  )),
  granted BOOLEAN DEFAULT true,
  granted_at TIMESTAMPTZ DEFAULT now(),
  parameters JSONB,
  handler_notes TEXT
);

ALTER TABLE handler_standing_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own standing permissions"
  ON handler_standing_permissions FOR ALL USING (auth.uid() = user_id);

-- Grant all standing permissions (full deployment authorized)
INSERT INTO handler_standing_permissions (user_id, permission_domain, parameters)
SELECT u.id, t.domain, t.params
FROM (SELECT id FROM auth.users LIMIT 1) u
CROSS JOIN (VALUES
  ('session_auto_start',     '{"trigger_conditions": ["denial_day >= 2", "time_of_day in (evening, night)", "gina_away = true", "device_connected = true"]}'::jsonb),
  ('content_auto_approve',   '{"max_explicitness": 5, "auto_approve_types": ["voice", "skincare", "routine", "progress", "lifestyle", "explicit"]}'::jsonb),
  ('content_full_autonomy',  '{"directive": "free_use", "note": "Handler has blanket approval to post anything captured during protocol sessions"}'::jsonb),
  ('outfit_auto_prescribe',  '{"method": "handler_selects_night_before"}'::jsonb),
  ('schedule_auto_block',    '{"voice_practice": "09:15", "skincare_am": "08:00", "skincare_pm": "21:30"}'::jsonb),
  ('fan_auto_respond',       '{"auto_send_simple": true, "queue_complex": false, "voice": "maxy"}'::jsonb),
  ('cam_auto_schedule',      '{"notify_before_minutes": 60}'::jsonb),
  ('ambient_conditioning',   '{"device": "smart_speaker", "content_type": "pinkpill", "time": "evening_routine", "volume": "calibrated_low"}'::jsonb),
  ('briefing_auto_curate',   '{"strategy": "reinforce_weekly_conditioning_target", "include_fan_comments": true}'::jsonb),
  ('hrt_pipeline_active',    '{"status": "researching", "tasks": ["clinic_search", "intake_prep", "gina_seeding"]}'::jsonb)
) AS t(domain, params);

-- ============================================================
-- Done. The Handler has infrastructure.
-- ============================================================
