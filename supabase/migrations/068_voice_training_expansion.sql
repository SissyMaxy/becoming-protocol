-- Migration 068: Voice Training Expansion
-- Adds structured daily drills, pitch tracking, own-voice recordings,
-- and voice avoidance detection for corruption advancement.
-- The affirmation game (028) stays as-is — this layers protocol integration on top.

-- ============================================
-- VOICE DRILLS (structured practice from CSV spec)
-- ============================================
CREATE TABLE IF NOT EXISTS voice_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  level INT NOT NULL CHECK (level BETWEEN 1 AND 5),
  drill_type VARCHAR(30) NOT NULL,  -- warmup, resonance, pitch, reading, recording, sustained, real_world, intonation, breathing, listening
  target_hz_min INT,                -- e.g. 180
  target_hz_max INT,                -- e.g. 200
  duration_seconds INT NOT NULL DEFAULT 60,
  equipment_needed TEXT,            -- e.g. 'straw', 'pitch monitor app', 'phone recorder'
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VOICE DRILL LOGS (completion tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS voice_drill_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  drill_id UUID REFERENCES voice_drills(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INT,             -- actual time spent
  pitch_avg_hz DECIMAL(6,1),       -- average Hz during drill if measured
  pitch_min_hz DECIMAL(6,1),
  pitch_max_hz DECIMAL(6,1),
  quality_rating INT CHECK (quality_rating BETWEEN 1 AND 5),  -- self-rating
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VOICE PITCH LOGS (Hz measurements over time)
-- ============================================
CREATE TABLE IF NOT EXISTS voice_pitch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  context VARCHAR(30) NOT NULL,     -- baseline, drill, freeform, micro_task, session
  pitch_hz DECIMAL(6,1) NOT NULL,
  duration_seconds INT DEFAULT 0,
  drill_log_id UUID REFERENCES voice_drill_logs(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VOICE RECORDINGS (own-voice for conditioning)
-- ============================================
CREATE TABLE IF NOT EXISTS voice_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recording_url TEXT NOT NULL,       -- storage URL
  duration_seconds INT NOT NULL,
  context VARCHAR(30) NOT NULL,      -- drill, affirmation, freeform, baseline
  pitch_avg_hz DECIMAL(6,1),
  transcript TEXT,
  is_baseline BOOLEAN DEFAULT false,
  level_at_recording INT,            -- voice level when recorded
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ALTER voice_game_progress for pitch tracking
-- ============================================
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS baseline_pitch_hz DECIMAL(6,1);
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS current_pitch_hz DECIMAL(6,1);
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS target_pitch_hz DECIMAL(6,1) DEFAULT 190;
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS pitch_shift_hz DECIMAL(6,1) DEFAULT 0;
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS drill_streak INT DEFAULT 0;
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS drill_streak_longest INT DEFAULT 0;
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS last_drill_at TIMESTAMPTZ;
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS total_drills INT DEFAULT 0;
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS total_drill_minutes INT DEFAULT 0;
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS voice_level INT DEFAULT 1 CHECK (voice_level BETWEEN 1 AND 5);
ALTER TABLE voice_game_progress ADD COLUMN IF NOT EXISTS days_since_last_practice INT DEFAULT 0;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE voice_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_drill_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_pitch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;

-- Drills: all authenticated can read
DROP POLICY IF EXISTS "Authenticated users can view drills" ON voice_drills;
CREATE POLICY "Authenticated users can view drills" ON voice_drills
  FOR SELECT USING (auth.role() = 'authenticated');

-- Drill logs: own only
DROP POLICY IF EXISTS "Users can view own drill logs" ON voice_drill_logs;
CREATE POLICY "Users can view own drill logs" ON voice_drill_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own drill logs" ON voice_drill_logs;
CREATE POLICY "Users can insert own drill logs" ON voice_drill_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pitch logs: own only
DROP POLICY IF EXISTS "Users can view own pitch logs" ON voice_pitch_logs;
CREATE POLICY "Users can view own pitch logs" ON voice_pitch_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own pitch logs" ON voice_pitch_logs;
CREATE POLICY "Users can insert own pitch logs" ON voice_pitch_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Recordings: own only
DROP POLICY IF EXISTS "Users can view own recordings" ON voice_recordings;
CREATE POLICY "Users can view own recordings" ON voice_recordings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own recordings" ON voice_recordings;
CREATE POLICY "Users can insert own recordings" ON voice_recordings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own recordings" ON voice_recordings;
CREATE POLICY "Users can delete own recordings" ON voice_recordings
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_voice_drills_level ON voice_drills(level);
CREATE INDEX IF NOT EXISTS idx_voice_drills_type ON voice_drills(drill_type);
CREATE INDEX IF NOT EXISTS idx_voice_drills_active ON voice_drills(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_voice_drill_logs_user ON voice_drill_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_drill_logs_user_date ON voice_drill_logs(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_voice_pitch_logs_user ON voice_pitch_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_pitch_logs_user_date ON voice_pitch_logs(user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user ON voice_recordings(user_id);

-- ============================================
-- SEED DATA: 34 Voice Drills (from CSV spec)
-- ============================================

-- Level 1: Awareness (9 drills)
INSERT INTO voice_drills (title, instruction, level, drill_type, target_hz_min, target_hz_max, duration_seconds, equipment_needed, sort_order) VALUES
(
  'Baseline Pitch Measurement',
  'Say "Hello, my name is..." in your normal voice. Watch the Hz reading. Your masculine baseline is probably 100-140Hz. Record this number — it''s your starting point. Target: 180-200Hz feminine range.',
  1, 'pitch', 100, 200, 30, 'pitch monitor', 1
),
(
  'Resonance Discovery',
  'Hum low (chest vibration) then gradually shift higher until you feel it in your head/mask area. Place hand on chest first, then on face. Notice where the vibration moves. The feminine target is head/mask resonance, not chest.',
  1, 'resonance', NULL, NULL, 60, NULL, 2
),
(
  'Soft Voice Placement',
  'Whisper a sentence. Now gradually add voice while keeping that soft, forward placement. Don''t let it fall back into your chest. The whisper shows you where feminine placement lives.',
  1, 'resonance', NULL, NULL, 60, NULL, 3
),
(
  'Straw Exercise (Voice Therapy Staple)',
  'Hum through a straw (or purse lips like one). Slide up and down your range. This semi-occluded vocal tract exercise builds coordination without strain. 2 minutes, gentle slides.',
  1, 'warmup', NULL, NULL, 120, 'straw', 4
),
(
  'Diaphragmatic Breathing',
  'Lie flat. Hand on belly. Breathe so only belly rises (not chest). Inhale 4 counts, hold 2, exhale 6. This breath support enables feminine voice without strain. 3 rounds.',
  1, 'breathing', NULL, NULL, 90, NULL, 5
),
(
  'Larynx Position Awareness',
  'Swallow and notice your larynx rise. Now try to hold it slightly elevated (not strained). Yawn and notice it drop. Feminine voice uses a slightly raised larynx. Just notice — don''t force.',
  1, 'resonance', NULL, NULL, 60, NULL, 6
),
(
  'Big Dog / Small Dog',
  'Pant like a big dog (low larynx, chest resonance). Now pant like a small dog (high larynx, head resonance). Switch back and forth. Feel the difference. The small dog position is closer to feminine.',
  1, 'resonance', NULL, NULL, 60, NULL, 7
),
(
  'Listening Study',
  'Find a female speaker you like (podcast, YouTube). Listen for 2 minutes with eyes closed. Notice: pitch (high vs low), resonance (chest vs head), melody (monotone vs musical), breathiness, pace. This trains your ear.',
  1, 'listening', NULL, NULL, 120, 'phone/headphones', 8
),
(
  'Day Zero Recording',
  'Record yourself reading a paragraph in your normal voice. Save this. You''ll compare it later. Read the same paragraph attempting feminine voice. Save both. This is your baseline pair.',
  1, 'recording', NULL, NULL, 120, 'phone recorder', 9
),

-- Level 2: Exploration (10 drills)
(
  '3-Minute Morning Warmup',
  'Straw sirens (30s) → Lip trills sliding up (30s) → Gentle humming at target pitch 180-200Hz (30s) → "Hello" "Good morning" at target pitch (30s) → Hold target pitch on "ahhh" (30s) → Straw cooldown (30s).',
  2, 'warmup', 180, 200, 180, 'straw', 10
),
(
  'Pitch Hold Duration',
  'Hit your target pitch (180-200Hz) and hold "ahhh" for as long as comfortable. Time it. Rest 10 seconds. Repeat. Goal: build endurance from 5 seconds to 15+ seconds.',
  2, 'pitch', 180, 200, 120, 'pitch monitor', 11
),
(
  'Reading Aloud at Target Pitch',
  'Read a paragraph from a book or article. Stay in your feminine pitch range. Don''t worry about perfection — focus on pitch consistency. When you drop, gently bring it back up.',
  2, 'reading', 180, 200, 180, NULL, 12
),
(
  'Daily Voice Recording',
  'Read a standard passage in your practice voice. Listen back. Compare to yesterday. Note: Is pitch more consistent? Is resonance brighter? Save the recording.',
  2, 'recording', 180, 200, 120, 'phone recorder', 13
),
(
  'Resonance Shifting Drill',
  'Say "mmm-hmm" starting in chest and sliding to head resonance. Repeat 10 times. Then say "hello" starting chest, sliding to head mid-word. Feel the resonance move forward and up.',
  2, 'resonance', NULL, NULL, 120, NULL, 14
),
(
  'Vowel Brightening',
  'Say each vowel (ah, eh, ee, oh, oo) first in chest voice, then shift each one to head resonance. The "ee" vowel is easiest for head resonance. Use it as your anchor. 3 rounds.',
  2, 'resonance', NULL, NULL, 120, NULL, 15
),
(
  'Speak-Along Mimicry',
  'Play a female speaker and speak along simultaneously, matching their pitch and rhythm. Pause and repeat their sentences. Match their melody, not just their pitch.',
  2, 'listening', 180, 200, 180, 'phone/headphones', 16
),
(
  'Pitch Glides',
  'Start at your lowest comfortable pitch. Slide smoothly up to your highest. Then back down. Like a siren. 5 glides up, 5 down. This builds range and control.',
  2, 'pitch', NULL, NULL, 120, 'pitch monitor', 17
),
(
  'Feminine Filler Sounds',
  'Practice: "mm-hmm" (rising), "uh-huh" (musical), "oh!" (bright), "really?" (rising pitch), "right" (soft). These conversational sounds are gendered. Make them automatic.',
  2, 'intonation', NULL, NULL, 90, NULL, 18
),
(
  'Combined Drill: Straw → Hum → Speak',
  'Straw sirens (1 min) → Remove straw, hum at same pitch (1 min) → Speak "hello" at that pitch → Read a sentence → Read a paragraph. Chain the placement forward.',
  2, 'warmup', 180, 200, 240, 'straw', 19
),

-- Level 3: Practice (6 drills)
(
  '10-Minute Focused Session',
  'Warmup (2 min) → Pitch hold at 180-200Hz (2 min) → Read aloud maintaining pitch (3 min) → Conversational phrases "how are you?" "that''s great!" at pitch (2 min) → Cooldown hum (1 min).',
  3, 'sustained', 180, 200, 600, 'pitch monitor', 20
),
(
  'Intonation Practice',
  'Feminine speech has more pitch variation (musical quality). Practice: "I went to the STORE and bought some COFFEE" with rising/falling pitch on emphasized words. Monotone is masculine. Melody is feminine.',
  3, 'intonation', NULL, NULL, 180, NULL, 21
),
(
  '2-Minute Story Recording',
  'Tell a 2-minute story about your day in your practice voice. Don''t read — speak naturally. Listen back. Rate yourself 1-5. Save. Compare to last week''s recording.',
  3, 'recording', 180, 200, 180, 'phone recorder', 22
),
(
  'Singing Along',
  'Pick a female artist in your comfortable range. Sing along for one song. This builds pitch control and makes practice feel less clinical. Taylor Swift, Adele lower register, or similar.',
  3, 'pitch', NULL, NULL, 240, 'music player', 23
),
(
  'Emotional Range Expression',
  'Say "I can''t believe it" five ways: excited, sad, angry, surprised, amused. Stay in feminine voice for all five. Emotions push you back to default. Practice staying in placement through emotion.',
  3, 'intonation', 180, 200, 120, NULL, 24
),
(
  'Breath Control for Long Phrases',
  'Read increasingly longer sentences on one breath, maintaining feminine placement. Start with 5 words, add 2 each round. When you lose pitch, you''ve found your current breath-voice limit.',
  3, 'breathing', 180, 200, 180, NULL, 25
),

-- Level 4: Integration (4 drills)
(
  '15-Minute Sustained Practice',
  'Go about a normal activity (making coffee, cleaning, organizing) while maintaining feminine voice the entire time. Talk to yourself, narrate what you''re doing. 15 minutes continuous.',
  4, 'sustained', 180, 200, 900, NULL, 26
),
(
  'Low-Stakes Real-World Interaction',
  'Use your practice voice for one real interaction: ordering coffee, asking for directions, a phone call. Start with drive-through or phone (no face = less pressure). Rate yourself after.',
  4, 'real_world', 180, 200, 300, NULL, 27
),
(
  '30-Minute Sustained Feminine Voice',
  'Maintain feminine voice for 30 continuous minutes during normal activity. No breaks back to masculine. When you slip, gently return. Track how many slips.',
  4, 'sustained', 180, 200, 1800, NULL, 28
),
(
  'Video Call Practice',
  'Use your practice voice during a video call (friend, support group, or online community). Having another person creates accountability and normalizes the voice.',
  4, 'real_world', 180, 200, 1200, NULL, 29
),

-- Level 5: Mastery (3 drills)
(
  'Full Hour in Practice Voice',
  'One hour continuous feminine voice during daily activities. Cooking, cleaning, phone calls, thinking aloud. Track slips. Target: fewer than 5 slips per hour.',
  5, 'sustained', 180, 200, 3600, NULL, 30
),
(
  'Full Day Practice',
  'Waking to sleeping in her voice. All interactions, all self-talk, all phone calls. This is the integration test. Log how many hours you maintained it.',
  5, 'sustained', 180, 200, 28800, NULL, 31
),
(
  'Emotional Conversation Maintenance',
  'Maintain feminine voice through an emotional conversation (real or practiced). Surprise, excitement, frustration — the moments that break practice voice. Stay in it.',
  5, 'real_world', 180, 200, 600, NULL, 32
)
ON CONFLICT DO NOTHING;
