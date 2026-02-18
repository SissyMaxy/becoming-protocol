-- ============================================
-- HRT Pipeline System
-- 6-phase progression from education through day one
-- Sober checkpoints, Gina awareness gating, daily logging
-- ============================================

-- Single row per user tracking HRT journey position
CREATE TABLE IF NOT EXISTS hrt_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) NOT NULL,
  current_phase integer NOT NULL DEFAULT 0 CHECK (current_phase BETWEEN 0 AND 6),
  -- Phase 0: Not started
  -- Phase 1: Education — learning about HRT effects, timelines, risks, reversibility
  -- Phase 2: Desire crystallization — journaling, visualization, identity integration
  -- Phase 3: Barrier identification — fears, logistics, finances, relationships mapped
  -- Phase 4: Consultation — therapist letter, endocrinologist research, appointment scheduling
  -- Phase 5: Decision — sober checkpoint, Gina awareness gate, final commitment
  -- Phase 6: Day one — prescription obtained, first dose, daily logging begins
  phase_entered_at timestamptz DEFAULT now(),
  phase_1_started_at timestamptz,
  phase_1_completed_at timestamptz,
  phase_2_started_at timestamptz,
  phase_2_completed_at timestamptz,
  phase_3_started_at timestamptz,
  phase_3_completed_at timestamptz,
  phase_4_started_at timestamptz,
  phase_4_completed_at timestamptz,
  phase_5_started_at timestamptz,
  phase_5_completed_at timestamptz,
  phase_6_started_at timestamptz,
  sober_checkpoints_passed integer DEFAULT 0,
  last_sober_checkpoint_at timestamptz,
  gina_awareness_level text DEFAULT 'unaware'
    CHECK (gina_awareness_level IN ('unaware', 'suspects', 'informed', 'supportive', 'participating')),
  gina_awareness_required_for_phase integer DEFAULT 5,
  gina_gate_passed boolean DEFAULT false,
  therapist_discussed boolean DEFAULT false,
  therapist_approved boolean DEFAULT false,
  endocrinologist_identified boolean DEFAULT false,
  appointment_scheduled boolean DEFAULT false,
  appointment_date date,
  prescription_obtained boolean DEFAULT false,
  first_dose_date date,
  blockers_identified jsonb DEFAULT '[]',
  blockers_resolved jsonb DEFAULT '[]',
  motivation_statements jsonb DEFAULT '[]',
  fear_inventory jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Daily tracking for HRT journey (Phase 6 primary, earlier phases optional)
CREATE TABLE IF NOT EXISTS hrt_daily_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  log_date date NOT NULL,
  phase_at_log integer NOT NULL,
  dose_taken boolean,
  dose_type text CHECK (dose_type IN (
    'estradiol_oral', 'estradiol_sublingual', 'estradiol_patch',
    'estradiol_injection', 'spironolactone', 'finasteride',
    'progesterone', 'other', NULL
  )),
  dose_amount text,
  missed_dose boolean DEFAULT false,
  physical_changes_noted text,
  emotional_state text CHECK (emotional_state IN (
    'euphoric', 'positive', 'neutral', 'anxious',
    'dysphoric', 'conflicted', 'peaceful'
  )),
  arousal_level_at_log integer,
  was_sober boolean GENERATED ALWAYS AS (arousal_level_at_log <= 2 OR arousal_level_at_log IS NULL) STORED,
  journal_entry text,
  photo_taken boolean DEFAULT false,
  photo_ref text,
  side_effects text,
  energy_level integer CHECK (energy_level BETWEEN 1 AND 10),
  skin_changes text,
  breast_sensitivity integer CHECK (breast_sensitivity BETWEEN 0 AND 10),
  mood_stability integer CHECK (mood_stability BETWEEN 1 AND 10),
  libido_level integer CHECK (libido_level BETWEEN 1 AND 10),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, log_date)
);

-- Sober verification events across the pipeline
CREATE TABLE IF NOT EXISTS hrt_sober_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  checkpoint_phase integer NOT NULL,
  checkpoint_type text NOT NULL CHECK (checkpoint_type IN (
    'phase_entry', 'phase_exit', 'weekly_check',
    'gina_gate', 'final_decision', 'regret_check'
  )),
  arousal_level integer NOT NULL,
  was_sober boolean GENERATED ALWAYS AS (arousal_level <= 2) STORED,
  denial_day integer,
  statement text NOT NULL,
  desire_level integer NOT NULL CHECK (desire_level BETWEEN 1 AND 10),
  confidence_level integer NOT NULL CHECK (confidence_level BETWEEN 1 AND 10),
  fear_level integer NOT NULL CHECK (fear_level BETWEEN 1 AND 10),
  handler_prompted boolean DEFAULT false,
  passed boolean NOT NULL,
  failure_reason text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- RLS
-- ============================================

ALTER TABLE hrt_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrt_daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrt_sober_checkpoints ENABLE ROW LEVEL SECURITY;

-- hrt_pipeline
CREATE POLICY "Users can view own HRT pipeline"
  ON hrt_pipeline FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own HRT pipeline"
  ON hrt_pipeline FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own HRT pipeline"
  ON hrt_pipeline FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own HRT pipeline"
  ON hrt_pipeline FOR DELETE USING (auth.uid() = user_id);

-- hrt_daily_log
CREATE POLICY "Users can view own HRT daily logs"
  ON hrt_daily_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own HRT daily logs"
  ON hrt_daily_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own HRT daily logs"
  ON hrt_daily_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own HRT daily logs"
  ON hrt_daily_log FOR DELETE USING (auth.uid() = user_id);

-- hrt_sober_checkpoints
CREATE POLICY "Users can view own HRT checkpoints"
  ON hrt_sober_checkpoints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own HRT checkpoints"
  ON hrt_sober_checkpoints FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own HRT checkpoints"
  ON hrt_sober_checkpoints FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own HRT checkpoints"
  ON hrt_sober_checkpoints FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_hrt_pipeline_user ON hrt_pipeline(user_id);
CREATE INDEX idx_hrt_daily_log_user_date ON hrt_daily_log(user_id, log_date);
CREATE INDEX idx_hrt_daily_log_user_phase ON hrt_daily_log(user_id, phase_at_log);
CREATE INDEX idx_hrt_sober_checkpoints_user_phase ON hrt_sober_checkpoints(user_id, checkpoint_phase);
CREATE INDEX idx_hrt_sober_checkpoints_user_sober ON hrt_sober_checkpoints(user_id, was_sober);

-- ============================================
-- VIEW
-- ============================================

CREATE OR REPLACE VIEW hrt_progress_summary AS
SELECT
  hp.user_id,
  hp.current_phase,
  EXTRACT(EPOCH FROM age(now(), hp.phase_entered_at)) / 86400 AS days_in_current_phase,
  hp.sober_checkpoints_passed AS total_sober_checkpoints_passed,
  (SELECT COUNT(*) FROM hrt_daily_log dl WHERE dl.user_id = hp.user_id) AS total_daily_logs,
  -- Total doses taken (streak calculation handled by getDoseStreak() in app code)
  (SELECT COUNT(*) FROM hrt_daily_log dl2 WHERE dl2.user_id = hp.user_id AND dl2.dose_taken = true) AS total_doses_taken,
  (SELECT COUNT(*) FROM hrt_daily_log dl5 WHERE dl5.user_id = hp.user_id AND dl5.dose_taken = true) AS days_on_hrt,
  hp.gina_awareness_level,
  hp.therapist_approved,
  hp.appointment_scheduled AS has_appointment,
  (
    SELECT ROUND(AVG(sc.desire_level)::numeric, 1)
    FROM hrt_sober_checkpoints sc
    WHERE sc.user_id = hp.user_id AND sc.was_sober = true
  ) AS avg_desire_level_sober,
  (
    SELECT MODE() WITHIN GROUP (ORDER BY dl6.emotional_state)
    FROM hrt_daily_log dl6
    WHERE dl6.user_id = hp.user_id AND dl6.phase_at_log = 6
  ) AS avg_emotional_state_on_hrt
FROM hrt_pipeline hp;
