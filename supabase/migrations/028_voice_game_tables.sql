-- Migration 028: Voice Affirmation Game Tables
-- Gamified voice training with speech recognition and haptic rewards

-- ============================================
-- AFFIRMATION CONTENT LIBRARY
-- ============================================
CREATE TABLE IF NOT EXISTS voice_affirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  category VARCHAR(30) NOT NULL,
  difficulty INT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  variants JSONB DEFAULT '[]',
  keywords TEXT[] DEFAULT '{}',
  reward_intensity INT DEFAULT 8 CHECK (reward_intensity BETWEEN 0 AND 20),
  point_value INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GAME SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS voice_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  difficulty INT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  categories TEXT[] NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  affirmations_attempted INT DEFAULT 0,
  affirmations_completed INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  total_points INT DEFAULT 0,
  average_accuracy DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active'
);

-- ============================================
-- INDIVIDUAL ATTEMPT RECORDS
-- ============================================
CREATE TABLE IF NOT EXISTS voice_game_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES voice_game_sessions(id) ON DELETE CASCADE NOT NULL,
  affirmation_id UUID REFERENCES voice_affirmations(id) ON DELETE SET NULL,
  spoken_text TEXT,
  accuracy DECIMAL(5,2) DEFAULT 0,
  is_success BOOLEAN DEFAULT false,
  reward_sent BOOLEAN DEFAULT false,
  attempt_number INT DEFAULT 1,
  duration_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER PROGRESS TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS voice_game_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  total_sessions INT DEFAULT 0,
  total_affirmations INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  average_accuracy DECIMAL(5,2) DEFAULT 0,
  favorite_category VARCHAR(30),
  highest_difficulty INT DEFAULT 1,
  total_points_earned INT DEFAULT 0,
  achievements_unlocked TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS voice_game_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  default_difficulty INT DEFAULT 2,
  preferred_categories TEXT[] DEFAULT '{}',
  haptic_rewards_enabled BOOLEAN DEFAULT true,
  haptic_intensity_multiplier DECIMAL(3,2) DEFAULT 1.0,
  voice_recognition_language VARCHAR(10) DEFAULT 'en-US',
  show_subtitles BOOLEAN DEFAULT true,
  affirmations_per_session INT DEFAULT 10,
  auto_advance_on_success BOOLEAN DEFAULT true,
  retry_limit INT DEFAULT 3,
  streak_protection_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACHIEVEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS voice_game_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  condition_type VARCHAR(50) NOT NULL,
  condition_value JSONB NOT NULL,
  points INT DEFAULT 50,
  rarity VARCHAR(20) DEFAULT 'common',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER ACHIEVEMENT UNLOCKS
-- ============================================
CREATE TABLE IF NOT EXISTS voice_game_user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES voice_game_achievements(id) ON DELETE CASCADE NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE voice_affirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_game_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_game_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_game_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_game_user_achievements ENABLE ROW LEVEL SECURITY;

-- Affirmations: all authenticated users can read
DROP POLICY IF EXISTS "Authenticated users can view affirmations" ON voice_affirmations;
CREATE POLICY "Authenticated users can view affirmations" ON voice_affirmations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Sessions: users can only manage their own
DROP POLICY IF EXISTS "Users can view own sessions" ON voice_game_sessions;
CREATE POLICY "Users can view own sessions" ON voice_game_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON voice_game_sessions;
CREATE POLICY "Users can insert own sessions" ON voice_game_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON voice_game_sessions;
CREATE POLICY "Users can update own sessions" ON voice_game_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Attempts: users can only manage their own (via session)
DROP POLICY IF EXISTS "Users can view own attempts" ON voice_game_attempts;
CREATE POLICY "Users can view own attempts" ON voice_game_attempts
  FOR SELECT USING (
    session_id IN (SELECT id FROM voice_game_sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own attempts" ON voice_game_attempts;
CREATE POLICY "Users can insert own attempts" ON voice_game_attempts
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM voice_game_sessions WHERE user_id = auth.uid())
  );

-- Progress: users can only manage their own
DROP POLICY IF EXISTS "Users can view own progress" ON voice_game_progress;
CREATE POLICY "Users can view own progress" ON voice_game_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own progress" ON voice_game_progress;
CREATE POLICY "Users can insert own progress" ON voice_game_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own progress" ON voice_game_progress;
CREATE POLICY "Users can update own progress" ON voice_game_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- Settings: users can only manage their own
DROP POLICY IF EXISTS "Users can view own settings" ON voice_game_settings;
CREATE POLICY "Users can view own settings" ON voice_game_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON voice_game_settings;
CREATE POLICY "Users can insert own settings" ON voice_game_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON voice_game_settings;
CREATE POLICY "Users can update own settings" ON voice_game_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Achievements: all authenticated users can read
DROP POLICY IF EXISTS "Authenticated users can view achievements" ON voice_game_achievements;
CREATE POLICY "Authenticated users can view achievements" ON voice_game_achievements
  FOR SELECT USING (auth.role() = 'authenticated');

-- User achievements: users can manage their own
DROP POLICY IF EXISTS "Users can view own achievements" ON voice_game_user_achievements;
CREATE POLICY "Users can view own achievements" ON voice_game_user_achievements
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own achievements" ON voice_game_user_achievements;
CREATE POLICY "Users can insert own achievements" ON voice_game_user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_voice_affirmations_category ON voice_affirmations(category);
CREATE INDEX IF NOT EXISTS idx_voice_affirmations_difficulty ON voice_affirmations(difficulty);
CREATE INDEX IF NOT EXISTS idx_voice_affirmations_active ON voice_affirmations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_voice_game_sessions_user ON voice_game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_game_sessions_status ON voice_game_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_voice_game_attempts_session ON voice_game_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_voice_game_progress_user ON voice_game_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_game_settings_user ON voice_game_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_game_user_achievements_user ON voice_game_user_achievements(user_id);

-- ============================================
-- TRIGGERS: Update timestamps
-- ============================================
DROP TRIGGER IF EXISTS update_voice_game_progress_updated_at ON voice_game_progress;
CREATE TRIGGER update_voice_game_progress_updated_at
  BEFORE UPDATE ON voice_game_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_voice_game_settings_updated_at ON voice_game_settings;
CREATE TRIGGER update_voice_game_settings_updated_at
  BEFORE UPDATE ON voice_game_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: ACHIEVEMENTS
-- ============================================
INSERT INTO voice_game_achievements (name, description, icon, condition_type, condition_value, points, rarity) VALUES
('First Words', 'Complete your first voice affirmation', 'mic', 'affirmations_spoken', '{"value": 1}', 25, 'common'),
('Finding Your Voice', 'Complete 10 affirmations', 'volume-2', 'affirmations_spoken', '{"value": 10}', 50, 'common'),
('Voice Activated', 'Complete 50 affirmations', 'music', 'affirmations_spoken', '{"value": 50}', 100, 'uncommon'),
('Affirmed Identity', 'Complete 100 affirmations', 'award', 'affirmations_spoken', '{"value": 100}', 200, 'rare'),
('Voice of Power', 'Complete 500 affirmations', 'zap', 'affirmations_spoken', '{"value": 500}', 500, 'epic'),

('Consistent Practice', 'Play 3 days in a row', 'calendar', 'streak_days', '{"value": 3}', 50, 'common'),
('Weekly Warrior', 'Play 7 days in a row', 'flame', 'streak_days', '{"value": 7}', 100, 'uncommon'),
('Monthly Maven', 'Play 30 days in a row', 'crown', 'streak_days', '{"value": 30}', 500, 'epic'),

('Perfect Session', 'Complete a session with 100% accuracy', 'star', 'perfect_session', '{"value": true}', 150, 'rare'),
('Difficulty I', 'Complete a session on difficulty 1', 'target', 'difficulty_reached', '{"value": 1}', 25, 'common'),
('Difficulty II', 'Complete a session on difficulty 2', 'target', 'difficulty_reached', '{"value": 2}', 50, 'common'),
('Difficulty III', 'Complete a session on difficulty 3', 'target', 'difficulty_reached', '{"value": 3}', 100, 'uncommon'),
('Difficulty IV', 'Complete a session on difficulty 4', 'target', 'difficulty_reached', '{"value": 4}', 200, 'rare'),
('Difficulty V', 'Complete a session on difficulty 5', 'target', 'difficulty_reached', '{"value": 5}', 500, 'legendary'),

('Identity Master', 'Complete 25 identity affirmations', 'user', 'category_mastery', '{"category": "identity", "count": 25}', 100, 'uncommon'),
('Transformation Guru', 'Complete 25 transformation affirmations', 'refresh-cw', 'category_mastery', '{"category": "transformation", "count": 25}', 100, 'uncommon'),
('Feminine Voice', 'Complete 25 feminine affirmations', 'heart', 'category_mastery', '{"category": "feminine", "count": 25}', 100, 'uncommon'),

('Sharp Speaker', 'Achieve 90%+ accuracy average', 'check-circle', 'accuracy_threshold', '{"value": 90}', 200, 'rare')
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: AFFIRMATIONS
-- ============================================
INSERT INTO voice_affirmations (text, category, difficulty, variants, keywords, reward_intensity, point_value) VALUES
-- Identity affirmations (Level 1-2)
('I am enough', 'identity', 1, '["I''m enough"]', ARRAY['am', 'enough'], 6, 10),
('I am worthy', 'identity', 1, '["I''m worthy"]', ARRAY['am', 'worthy'], 6, 10),
('I am loved', 'identity', 1, '["I''m loved"]', ARRAY['am', 'loved'], 6, 10),
('I am strong', 'identity', 1, '["I''m strong"]', ARRAY['am', 'strong'], 6, 10),
('I am becoming my true self', 'identity', 2, '["I''m becoming my true self"]', ARRAY['becoming', 'true', 'self'], 8, 15),
('I embrace who I am', 'identity', 2, '[]', ARRAY['embrace', 'who', 'am'], 8, 15),

-- Capability affirmations (Level 2-3)
('I can do hard things', 'capability', 2, '[]', ARRAY['can', 'hard', 'things'], 8, 15),
('I am capable of change', 'capability', 2, '["I''m capable of change"]', ARRAY['capable', 'change'], 8, 15),
('I have the power to transform', 'capability', 3, '[]', ARRAY['power', 'transform'], 10, 20),
('I can achieve anything I set my mind to', 'capability', 3, '[]', ARRAY['achieve', 'anything', 'mind'], 10, 20),

-- Worthiness affirmations (Level 2-3)
('I deserve happiness', 'worthiness', 2, '[]', ARRAY['deserve', 'happiness'], 8, 15),
('I deserve love and respect', 'worthiness', 2, '[]', ARRAY['deserve', 'love', 'respect'], 8, 15),
('I am worthy of my desires', 'worthiness', 3, '[]', ARRAY['worthy', 'desires'], 10, 20),
('I deserve to live authentically', 'worthiness', 3, '[]', ARRAY['deserve', 'authentically'], 10, 20),

-- Transformation affirmations (Level 3-4)
('I am becoming more myself every day', 'transformation', 3, '[]', ARRAY['becoming', 'myself', 'every', 'day'], 10, 20),
('Every day I grow stronger', 'transformation', 3, '[]', ARRAY['every', 'day', 'grow', 'stronger'], 10, 20),
('I release what no longer serves me', 'transformation', 4, '[]', ARRAY['release', 'no', 'longer', 'serves'], 12, 25),
('I am transforming into my highest self', 'transformation', 4, '[]', ARRAY['transforming', 'highest', 'self'], 12, 25),

-- Feminine affirmations (Level 2-5)
('I embrace my feminine energy', 'feminine', 2, '[]', ARRAY['embrace', 'feminine', 'energy'], 10, 15),
('My feminine voice flows naturally', 'feminine', 3, '[]', ARRAY['feminine', 'voice', 'flows', 'naturally'], 12, 20),
('I am a beautiful woman', 'feminine', 3, '["I''m a beautiful woman"]', ARRAY['beautiful', 'woman'], 12, 20),
('I embody grace and femininity', 'feminine', 4, '[]', ARRAY['embody', 'grace', 'femininity'], 14, 25),
('My authentic feminine self radiates confidence', 'feminine', 4, '[]', ARRAY['authentic', 'feminine', 'radiates', 'confidence'], 14, 25),
('I am becoming the woman I was always meant to be', 'feminine', 5, '[]', ARRAY['becoming', 'woman', 'always', 'meant'], 16, 30),

-- Submission affirmations (Level 3-5)
('I surrender to my true nature', 'submission', 3, '[]', ARRAY['surrender', 'true', 'nature'], 12, 20),
('I find peace in letting go of control', 'submission', 4, '[]', ARRAY['peace', 'letting', 'go', 'control'], 14, 25),
('I am grateful to serve', 'submission', 4, '[]', ARRAY['grateful', 'serve'], 14, 25),
('My submission is my strength', 'submission', 5, '[]', ARRAY['submission', 'strength'], 16, 30),
('I embrace my role with love and devotion', 'submission', 5, '[]', ARRAY['embrace', 'role', 'love', 'devotion'], 16, 30),

-- Gratitude affirmations (Level 1-3)
('I am grateful for today', 'gratitude', 1, '["I''m grateful for today"]', ARRAY['grateful', 'today'], 6, 10),
('I appreciate my journey', 'gratitude', 2, '[]', ARRAY['appreciate', 'journey'], 8, 15),
('I am thankful for my growth', 'gratitude', 2, '["I''m thankful for my growth"]', ARRAY['thankful', 'growth'], 8, 15),
('I appreciate the small victories', 'gratitude', 3, '[]', ARRAY['appreciate', 'small', 'victories'], 10, 20)
ON CONFLICT DO NOTHING;

-- ============================================
-- HAPTIC PATTERNS FOR VOICE GAME
-- ============================================
INSERT INTO haptic_patterns (name, description, command_type, command_payload, duration_sec, intensity_min, intensity_max, use_context) VALUES
('voice_success_subtle', 'Subtle success feedback for easy affirmations', 'Function',
 '{"action": "Vibrate:6", "timeSec": 1}', 1, 4, 8,
 ARRAY['voice_game', 'reward']),
('voice_success_medium', 'Medium success feedback', 'Function',
 '{"action": "Vibrate:10", "timeSec": 2}', 2, 8, 12,
 ARRAY['voice_game', 'reward']),
('voice_success_strong', 'Strong success for difficult affirmations', 'Preset',
 '{"name": "pulse", "timeSec": 3}', 3, 12, 16,
 ARRAY['voice_game', 'reward']),
('voice_streak_bonus', 'Streak milestone celebration', 'Preset',
 '{"name": "wave", "timeSec": 4}', 4, 10, 18,
 ARRAY['voice_game', 'streak', 'milestone']),
('voice_perfect_session', 'Perfect session celebration', 'Preset',
 '{"name": "fireworks", "timeSec": 6}', 6, 14, 20,
 ARRAY['voice_game', 'achievement']),
('voice_encouragement', 'Gentle encouragement pulse for retry', 'Function',
 '{"action": "Vibrate:4", "timeSec": 1}', 1, 3, 5,
 ARRAY['voice_game', 'encouragement'])
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  command_payload = EXCLUDED.command_payload,
  use_context = EXCLUDED.use_context;
