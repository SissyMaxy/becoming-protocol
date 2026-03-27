-- Migration 141: Conditioning Engine Seed Data
-- Seeds content_curriculum, hidden_operations, and scent_conditioning
-- for the initial user.
--
-- User ID placeholder: 93327332-7d0d-4888-889a-1607a5776216
-- All inserts are idempotent via ON CONFLICT DO NOTHING.

-- ============================================
-- 1. Content Curriculum — Bambi Sleep tracks
-- ============================================
INSERT INTO content_curriculum
  (user_id, title, creator, series, media_type, category, intensity, tier, duration_minutes)
VALUES
  ('93327332-7d0d-4888-889a-1607a5776216', 'Compliance Chip LOOP', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 3, 2, 2),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Quick Mind Break', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 2, 2, 4),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Fractionate', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'trance_deepening', 2, 2, 6),
  ('93327332-7d0d-4888-889a-1607a5776216', 'BJD.exe', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'desire_installation', 4, 3, 12),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Tits4Brains.exe', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'dumbification', 3, 3, 10),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Slut.exe', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'desire_installation', 3, 3, 11),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Platinum Trigger Training', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'trigger_installation', 2, 2, 15),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Platinum Pavlov', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 3, 3, 20),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Oblivious Obedience 1', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 4, 3, 20),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Oblivious Obedience 2', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 3, 3, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Resistance Breaker', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'resistance_reduction', 3, 3, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Complete Bambi Transformation', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'identity', 5, 4, 35),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Amnesia Mind Fuck', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'amnesia', 5, 4, 40),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Background Mantras', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'ambient', 2, 1, 45),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Background Cockslut', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'desire_installation', 3, 3, 50),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Background Obedience', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'compliance', 2, 2, 55),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Subliminals File', 'Bambi Sleep', 'Bambi Sleep', 'audio', 'ambient', 2, 2, 74)
ON CONFLICT DO NOTHING;

-- ============================================
-- 2. Content Curriculum — Elswyth tracks
-- ============================================
INSERT INTO content_curriculum
  (user_id, title, creator, series, media_type, category, intensity, tier, duration_minutes)
VALUES
  ('93327332-7d0d-4888-889a-1607a5776216', 'Seven Days in Chastity Day 1', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 2, 1, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Seven Days in Chastity Day 2', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 2, 1, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Seven Days in Chastity Day 3', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 2, 1, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Seven Days in Chastity Day 4', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Seven Days in Chastity Day 5', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Seven Days in Chastity Day 6', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Seven Days in Chastity Day 7', 'Elswyth', 'Seven Days in Chastity', 'audio', 'chastity', 3, 1, 22),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Worship Your Goddess Short', 'Elswyth', 'Elswyth', 'audio', 'morning_ritual', 1, 1, 10),
  ('93327332-7d0d-4888-889a-1607a5776216', 'One Orgasm a Week', 'Elswyth', 'Elswyth', 'audio', 'chastity', 3, 3, 25),
  ('93327332-7d0d-4888-889a-1607a5776216', 'Winter Cuddle Sessions', 'Elswyth', 'Elswyth', 'audio', 'sleep_induction', 1, 2, 30)
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. Hidden Operations — baseline parameters
-- ============================================
INSERT INTO hidden_operations
  (user_id, parameter, current_value, base_value, increment_rate, increment_interval)
VALUES
  ('93327332-7d0d-4888-889a-1607a5776216', 'conditioning_intensity_multiplier', 1.0, 1.0, 0.05, 'weekly'),
  ('93327332-7d0d-4888-889a-1607a5776216', 'denial_cycle_target_days', 7, 7, 1, 'per_3_cycles'),
  ('93327332-7d0d-4888-889a-1607a5776216', 'content_explicitness_tier', 1, 1, 1, 'per_6_weeks'),
  ('93327332-7d0d-4888-889a-1607a5776216', 'ambient_pulse_frequency_per_hour', 2, 2, 0.5, 'weekly'),
  ('93327332-7d0d-4888-889a-1607a5776216', 'ambient_pulse_duration_seconds', 3, 3, 0.5, 'weekly'),
  ('93327332-7d0d-4888-889a-1607a5776216', 'social_commitment_acceptance_rate', 1, 1, 0.5, 'monthly'),
  ('93327332-7d0d-4888-889a-1607a5776216', 'post_hypnotic_script_intensity', 1, 1, 0.5, 'weekly'),
  ('93327332-7d0d-4888-889a-1607a5776216', 'memory_retrieval_confession_bias', 0.6, 0.6, 0.02, 'weekly')
ON CONFLICT (user_id, parameter) DO NOTHING;

-- ============================================
-- 4. Scent Conditioning — initial anchor
-- ============================================
INSERT INTO scent_conditioning
  (user_id, scent_name, scent_product, association_strength)
VALUES
  ('93327332-7d0d-4888-889a-1607a5776216', 'conditioning_primary', 'TBD — lavender/vanilla blend reserved for sessions only', 'none')
ON CONFLICT DO NOTHING;
