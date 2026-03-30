-- Migration 146: Priority 1 Infrastructure Fixes
-- 1. Re-seed conditioning data with correct user_id
-- 2. Fix PostgREST 406 errors (schema reload)
-- 3. Complete partially-applied migration 145
-- 4. Fix remaining column mismatches

-- ============================================
-- 1. DELETE old user_id seed data, re-insert with correct ID
-- ============================================

DELETE FROM content_curriculum WHERE user_id = '93327332-7d0d-4888-889a-1607a5776216';
DELETE FROM hidden_operations WHERE user_id = '93327332-7d0d-4888-889a-1607a5776216';
DELETE FROM scent_conditioning WHERE user_id = '93327332-7d0d-4888-889a-1607a5776216';

-- Bambi Sleep tracks
INSERT INTO content_curriculum
  (user_id, title, creator, series, media_type, category, intensity, tier, duration_minutes)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Compliance Chip LOOP', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 3, 2, 2),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Quick Mind Break', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 2, 2, 4),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Fractionate', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'trance_deepening', 2, 2, 6),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'BJD.exe', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'desire_installation', 4, 3, 12),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Tits4Brains.exe', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'dumbification', 3, 3, 10),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Slut.exe', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'desire_installation', 3, 3, 11),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Platinum Trigger Training', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'trigger_installation', 2, 2, 15),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Platinum Pavlov', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 3, 3, 20),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Oblivious Obedience 1', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 4, 3, 20),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Oblivious Obedience 2', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 3, 3, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Resistance Breaker', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'resistance_reduction', 3, 3, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Complete Bambi Transformation', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'identity', 5, 4, 35),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Amnesia Mind Fuck', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'amnesia', 5, 4, 40),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Background Mantras', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'ambient', 2, 1, 45),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Background Cockslut', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'desire_installation', 3, 3, 50),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Background Obedience', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 2, 2, 55),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Subliminals File', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'ambient', 2, 2, 74)
ON CONFLICT DO NOTHING;

-- Elswyth tracks
INSERT INTO content_curriculum
  (user_id, title, creator, series, media_type, category, intensity, tier, duration_minutes)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Seven Days in Chastity Day 1', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 2, 1, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Seven Days in Chastity Day 2', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 2, 1, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Seven Days in Chastity Day 3', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 2, 1, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Seven Days in Chastity Day 4', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Seven Days in Chastity Day 5', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Seven Days in Chastity Day 6', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Seven Days in Chastity Day 7', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Worship Your Goddess Short', 'Elswyth', 'Elswyth', 'audio', 'morning_ritual', 1, 1, 10),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'One Orgasm a Week', 'Elswyth', 'Elswyth', 'audio', 'chastity', 3, 3, 25),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'Winter Cuddle Sessions', 'Elswyth', 'Elswyth', 'audio', 'sleep_induction', 1, 2, 30)
ON CONFLICT DO NOTHING;

-- Hidden operations
INSERT INTO hidden_operations
  (user_id, parameter, current_value, base_value, increment_rate, increment_interval)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'conditioning_intensity_multiplier', 1.0, 1.0, 0.05, 'weekly'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'denial_cycle_target_days', 7, 7, 1, 'per_3_cycles'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'content_explicitness_tier', 1, 1, 1, 'per_6_weeks'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'ambient_pulse_frequency_per_hour', 2, 2, 0.5, 'weekly'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'ambient_pulse_duration_seconds', 3, 3, 0.5, 'weekly'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'social_commitment_acceptance_rate', 1, 1, 0.5, 'monthly'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'post_hypnotic_script_intensity', 1, 1, 0.5, 'weekly'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'memory_retrieval_confession_bias', 0.6, 0.6, 0.02, 'weekly')
ON CONFLICT (user_id, parameter) DO NOTHING;

-- Scent conditioning
INSERT INTO scent_conditioning
  (user_id, scent_name, scent_product, association_strength)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'conditioning_primary', 'TBD — lavender/vanilla blend reserved for sessions only', 'none')
ON CONFLICT DO NOTHING;

-- ============================================
-- 2. Complete migration 145 (partially applied)
-- ============================================

-- Fix handler_interventions missing columns
ALTER TABLE handler_interventions ADD COLUMN IF NOT EXISTS conversation_id UUID;
ALTER TABLE handler_interventions ADD COLUMN IF NOT EXISTS message_index INTEGER;
ALTER TABLE handler_interventions ADD COLUMN IF NOT EXISTS intervention_detail TEXT;

-- Create intervention_outcomes (didn't exist)
CREATE TABLE IF NOT EXISTS intervention_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intervention_id UUID NOT NULL REFERENCES handler_interventions(id) ON DELETE CASCADE,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'compliance_shift','arousal_shift','resistance_change','pattern_break',
    'confession','commitment_honored','commitment_broken','mood_shift',
    'streak_maintained','streak_broken','session_completed','session_refused',
    'depth_achieved','trigger_response','behavioral_change','no_change'
  )),
  direction TEXT CHECK (direction IN ('positive', 'negative', 'neutral')),
  magnitude FLOAT,
  description TEXT,
  evidence TEXT,
  latency_minutes INTEGER,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE intervention_outcomes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intervention_outcomes' AND policyname = 'Users own intervention_outcomes') THEN
    CREATE POLICY "Users own intervention_outcomes" ON intervention_outcomes FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_intervention_outcomes_intervention ON intervention_outcomes(intervention_id);
CREATE INDEX IF NOT EXISTS idx_intervention_outcomes_user ON intervention_outcomes(user_id, outcome_type, measured_at DESC);

-- Create handler_effectiveness (didn't exist)
CREATE TABLE IF NOT EXISTS handler_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL,
  handler_mode TEXT,
  total_uses INTEGER DEFAULT 0,
  positive_outcomes INTEGER DEFAULT 0,
  negative_outcomes INTEGER DEFAULT 0,
  neutral_outcomes INTEGER DEFAULT 0,
  avg_magnitude FLOAT,
  avg_latency_minutes FLOAT,
  best_denial_range INT[],
  best_arousal_range INT[],
  best_with_resistance BOOLEAN,
  best_in_vulnerability BOOLEAN,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, intervention_type, handler_mode)
);

ALTER TABLE handler_effectiveness ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'handler_effectiveness' AND policyname = 'Users own handler_effectiveness') THEN
    CREATE POLICY "Users own handler_effectiveness" ON handler_effectiveness FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_handler_interventions_user_conversation
  ON handler_interventions (user_id, conversation_id);

-- ============================================
-- 3. Force PostgREST schema cache reload
-- ============================================
NOTIFY pgrst, 'reload schema';
