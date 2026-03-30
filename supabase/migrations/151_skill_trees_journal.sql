-- Migration 151: Skill Tree Progression System + Identity Journal (P9.1)

-- ============================================
-- SKILL DOMAINS — Per-user per-domain progression
-- ============================================

CREATE TABLE IF NOT EXISTS skill_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN (
    'voice','makeup','movement','style','social_presentation',
    'intimate_skills','body_sculpting','skincare','hair','posture'
  )),
  current_level INTEGER NOT NULL DEFAULT 1,
  max_level INTEGER NOT NULL DEFAULT 8,
  tasks_completed_at_level INTEGER NOT NULL DEFAULT 0,
  tasks_required_for_advancement INTEGER NOT NULL DEFAULT 5,
  verifications_passed INTEGER NOT NULL DEFAULT 0,
  verifications_required INTEGER NOT NULL DEFAULT 3,
  last_practice_at TIMESTAMPTZ,
  total_practice_minutes INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  level_history JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

CREATE INDEX idx_skill_domains_user ON skill_domains(user_id);
CREATE INDEX idx_skill_domains_domain ON skill_domains(user_id, domain);
CREATE INDEX idx_skill_domains_streak ON skill_domains(user_id, streak_days DESC);

ALTER TABLE skill_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_domains_select" ON skill_domains
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "skill_domains_insert" ON skill_domains
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "skill_domains_update" ON skill_domains
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "skill_domains_delete" ON skill_domains
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SKILL LEVEL DEFINITIONS — Static reference data
-- ============================================

CREATE TABLE IF NOT EXISTS skill_level_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  level INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_filter JSONB,
  advancement_criteria JSONB NOT NULL,
  verification_type TEXT CHECK (verification_type IN ('photo','video','audio','biometric','self_report')),
  verification_instructions TEXT,
  UNIQUE(domain, level)
);

-- No RLS on skill_level_definitions — public reference data

-- ============================================
-- SEED DATA: VOICE (8 levels)
-- ============================================

INSERT INTO skill_level_definitions (domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions) VALUES
('voice', 1, 'Awareness', 'Learn to hear the difference between masculine and feminine voice patterns. Practice listening exercises.',
  '{"domain":"voice","intensity_max":2,"tags":["awareness","listening"]}',
  '{"tasks_required":5,"verifications_required":2}',
  'self_report', 'Record a 30-second voice sample and note what you hear about pitch and resonance.'),

('voice', 2, 'Breath Foundation', 'Develop diaphragmatic breathing and breath support for voice feminization.',
  '{"domain":"voice","intensity_max":3,"tags":["breathing","foundation"]}',
  '{"tasks_required":5,"verifications_required":3}',
  'audio', 'Record a sustained vowel sound showing breath control for 10+ seconds.'),

('voice', 3, 'Pitch Exploration', 'Safely explore higher pitch ranges. Find your comfortable feminine pitch window.',
  '{"domain":"voice","intensity_max":4,"tags":["pitch","exploration"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'audio', 'Record reading a paragraph in your target pitch range.'),

('voice', 4, 'Resonance Shift', 'Move vocal resonance from chest to head. Practice bright, forward placement.',
  '{"domain":"voice","intensity_max":5,"tags":["resonance","placement"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'audio', 'Record comparing chest vs head resonance on the same phrase.'),

('voice', 5, 'Intonation Patterns', 'Adopt feminine intonation patterns — upward inflections, musical phrasing, expressive range.',
  '{"domain":"voice","intensity_max":6,"tags":["intonation","melody"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'audio', 'Record a conversational passage with natural feminine intonation.'),

('voice', 6, 'Casual Speech', 'Use feminine voice in low-stakes real-world situations — drive-through, phone calls, brief interactions.',
  '{"domain":"voice","intensity_max":7,"tags":["practice","real_world"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'self_report', 'Describe 3 real-world interactions where you used your feminine voice.'),

('voice', 7, 'Extended Use', 'Maintain feminine voice for extended conversations and high-pressure situations.',
  '{"domain":"voice","intensity_max":8,"tags":["endurance","pressure"]}',
  '{"tasks_required":8,"verifications_required":3}',
  'audio', 'Record a 5-minute conversation or monologue maintaining consistent feminine voice.'),

('voice', 8, 'Integration', 'Feminine voice becomes default. Masculine voice feels like the effort, not feminine.',
  '{"domain":"voice","intensity_max":10,"tags":["integration","default"]}',
  '{"tasks_required":10,"verifications_required":3}',
  'audio', 'Record yourself in an unscripted, spontaneous interaction using feminine voice naturally.');

-- ============================================
-- SEED DATA: MAKEUP (8 levels)
-- ============================================

INSERT INTO skill_level_definitions (domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions) VALUES
('makeup', 1, 'Skincare First', 'Master a consistent skincare routine before touching makeup. Clean canvas.',
  '{"domain":"makeup","intensity_max":2,"tags":["skincare","prep"]}',
  '{"tasks_required":5,"verifications_required":2}',
  'photo', 'Photo of your skincare setup and clean face after routine.'),

('makeup', 2, 'Base Basics', 'Learn foundation matching, application, and basic concealer. Even skin tone.',
  '{"domain":"makeup","intensity_max":3,"tags":["foundation","base"]}',
  '{"tasks_required":5,"verifications_required":3}',
  'photo', 'Photo showing even foundation application in natural light.'),

('makeup', 3, 'Eye Essentials', 'Master basic eyeshadow, simple liner, and mascara. Open and brighten the eyes.',
  '{"domain":"makeup","intensity_max":4,"tags":["eyes","basic"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'photo', 'Photo showing clean eye makeup — shadow, liner, mascara.'),

('makeup', 4, 'Brows & Lips', 'Shape and fill brows for a feminine arch. Basic lip color and liner.',
  '{"domain":"makeup","intensity_max":5,"tags":["brows","lips"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'photo', 'Photo showing shaped brows and lip color.'),

('makeup', 5, 'Contour & Highlight', 'Feminize face shape with contour, highlight, and blush placement.',
  '{"domain":"makeup","intensity_max":6,"tags":["contour","sculpt"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'photo', 'Photo showing contour and highlight — visible feminization of face shape.'),

('makeup', 6, 'Complete Looks', 'Put together full makeup looks — daytime natural, evening glam, work-appropriate.',
  '{"domain":"makeup","intensity_max":7,"tags":["full_look","styles"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'photo', 'Three photos showing different complete looks — day, evening, casual.'),

('makeup', 7, 'Speed & Confidence', 'Apply full looks in under 30 minutes. Confident in public.',
  '{"domain":"makeup","intensity_max":8,"tags":["speed","confidence"]}',
  '{"tasks_required":8,"verifications_required":3}',
  'video', 'Time-lapse or video showing full application in under 30 minutes.'),

('makeup', 8, 'Artistry', 'Creative looks, editorial experimentation, teaching others. Makeup as self-expression.',
  '{"domain":"makeup","intensity_max":10,"tags":["creative","artistry"]}',
  '{"tasks_required":10,"verifications_required":3}',
  'photo', 'Photo of a creative or editorial look that expresses your personal style.');

-- ============================================
-- SEED DATA: MOVEMENT (6 levels)
-- ============================================

INSERT INTO skill_level_definitions (domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions) VALUES
('movement', 1, 'Body Awareness', 'Notice how you currently move — gait, arm swing, how you sit and stand.',
  '{"domain":"movement","intensity_max":2,"tags":["awareness","observation"]}',
  '{"tasks_required":5,"verifications_required":2}',
  'self_report', 'Describe 3 masculine movement patterns you noticed in yourself today.'),

('movement', 2, 'Walking Basics', 'Narrower stride, feet closer to center line, softer heel strike, hip engagement.',
  '{"domain":"movement","intensity_max":3,"tags":["walking","gait"]}',
  '{"tasks_required":5,"verifications_required":3}',
  'video', 'Video of walking showing narrower stride and hip movement.'),

('movement', 3, 'Seated & Standing', 'Feminine sitting posture — knees together, ankles crossed. Standing with weight on one hip.',
  '{"domain":"movement","intensity_max":5,"tags":["posture","sitting","standing"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'photo', 'Photos showing feminine sitting and standing posture in different settings.'),

('movement', 4, 'Gestures & Hands', 'Softer gestures, wrist movement, expressive hands. Eliminate fist-clenching and broad arm movements.',
  '{"domain":"movement","intensity_max":6,"tags":["gestures","hands"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'video', 'Video of yourself talking with natural feminine gestures.'),

('movement', 5, 'Social Movement', 'Move femininely in social situations — entering rooms, greeting people, navigating spaces.',
  '{"domain":"movement","intensity_max":8,"tags":["social","public"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'self_report', 'Describe 3 social situations where you maintained feminine movement throughout.'),

('movement', 6, 'Embodied Grace', 'Feminine movement is unconscious default. You move without thinking about it.',
  '{"domain":"movement","intensity_max":10,"tags":["integration","unconscious"]}',
  '{"tasks_required":10,"verifications_required":3}',
  'video', 'Candid video where feminine movement is clearly your natural default.');

-- ============================================
-- SEED DATA: STYLE (6 levels)
-- ============================================

INSERT INTO skill_level_definitions (domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions) VALUES
('style', 1, 'Basics & Fit', 'Understand feminine clothing basics — fit over fashion, body proportions, silhouettes.',
  '{"domain":"style","intensity_max":2,"tags":["basics","fit","learning"]}',
  '{"tasks_required":5,"verifications_required":2}',
  'self_report', 'List your measurements and 3 silhouettes that work for your body type.'),

('style', 2, 'Wardrobe Foundation', 'Build core pieces — well-fitting basics in your correct size. Undergarments that work.',
  '{"domain":"style","intensity_max":3,"tags":["wardrobe","foundation","shopping"]}',
  '{"tasks_required":5,"verifications_required":3}',
  'photo', 'Photo of your foundational pieces laid out — basics that fit properly.'),

('style', 3, 'Casual Feminine', 'Assemble casual feminine outfits for everyday wear — errands, coffee, casual social.',
  '{"domain":"style","intensity_max":5,"tags":["casual","everyday","outfits"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'photo', 'Photos of 3 different casual feminine outfits you wear out.'),

('style', 4, 'Occasion Dressing', 'Dress appropriately for different occasions — work, dates, events, evening out.',
  '{"domain":"style","intensity_max":6,"tags":["occasion","formal","date"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'photo', 'Photos showing outfits for 3 different occasions.'),

('style', 5, 'Personal Style', 'Develop a recognizable personal style. Know what you love and what works.',
  '{"domain":"style","intensity_max":8,"tags":["personal","identity","signature"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'photo', 'Curated photos showing your personal style across multiple outfits.'),

('style', 6, 'Style Confidence', 'Dress without second-guessing. Your wardrobe is fully feminine. Shopping is intuitive.',
  '{"domain":"style","intensity_max":10,"tags":["confidence","intuitive","mastery"]}',
  '{"tasks_required":10,"verifications_required":3}',
  'self_report', 'Describe your style evolution and how dressing feminine now feels natural.');

-- ============================================
-- SEED DATA: SOCIAL PRESENTATION (8 levels)
-- ============================================

INSERT INTO skill_level_definitions (domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions) VALUES
('social_presentation', 1, 'Self-Perception', 'Begin seeing yourself as feminine. Mirror work, self-talk, internal narrative shifts.',
  '{"domain":"social_presentation","intensity_max":2,"tags":["self_perception","mirror","internal"]}',
  '{"tasks_required":5,"verifications_required":2}',
  'self_report', 'Describe how you see yourself in the mirror now vs 1 month ago.'),

('social_presentation', 2, 'Safe Spaces', 'Present feminine in completely safe spaces — home, supportive friends, online.',
  '{"domain":"social_presentation","intensity_max":3,"tags":["safe_space","home","online"]}',
  '{"tasks_required":5,"verifications_required":3}',
  'self_report', 'Describe 3 safe-space interactions where you presented femininely.'),

('social_presentation', 3, 'Low-Stakes Public', 'Present feminine in low-stakes public settings — stores, parks, transit where no one knows you.',
  '{"domain":"social_presentation","intensity_max":4,"tags":["public","low_stakes","anonymous"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'self_report', 'Describe 3 public outings in feminine presentation.'),

('social_presentation', 4, 'Service Interactions', 'Engage with service workers, baristas, cashiers as yourself. Brief but real.',
  '{"domain":"social_presentation","intensity_max":5,"tags":["service","interaction","brief"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'self_report', 'Describe 5 service interactions where you were gendered correctly or presented confidently.'),

('social_presentation', 5, 'Social Events', 'Attend social events — meetups, parties, gatherings — fully presenting.',
  '{"domain":"social_presentation","intensity_max":6,"tags":["social","events","gatherings"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'self_report', 'Describe a social event you attended in full feminine presentation.'),

('social_presentation', 6, 'Extended Interaction', 'Maintain feminine presentation in multi-hour situations — dinner with friends, day trips, dates.',
  '{"domain":"social_presentation","intensity_max":7,"tags":["extended","sustained","dates"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'self_report', 'Describe an extended social interaction (2+ hours) in feminine presentation.'),

('social_presentation', 7, 'Professional Context', 'Present femininely in professional or semi-professional contexts.',
  '{"domain":"social_presentation","intensity_max":8,"tags":["professional","work","formal"]}',
  '{"tasks_required":8,"verifications_required":3}',
  'self_report', 'Describe navigating a professional context in feminine presentation.'),

('social_presentation', 8, 'Full Integration', 'Feminine presentation is your default in all contexts. No dual life.',
  '{"domain":"social_presentation","intensity_max":10,"tags":["integration","default","full_time"]}',
  '{"tasks_required":10,"verifications_required":3}',
  'self_report', 'Reflect on what it means that feminine presentation is now your default.');

-- ============================================
-- SEED DATA: INTIMATE SKILLS (6 levels)
-- ============================================

INSERT INTO skill_level_definitions (domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions) VALUES
('intimate_skills', 1, 'Body Awareness', 'Develop feminine body awareness — how your body feels, what it responds to, erogenous mapping.',
  '{"domain":"intimate_skills","intensity_max":3,"tags":["awareness","body","mapping"]}',
  '{"tasks_required":5,"verifications_required":2}',
  'self_report', 'Describe your body awareness practice and what you discovered.'),

('intimate_skills', 2, 'Sensation Exploration', 'Explore feminine pleasure patterns — non-genital arousal, full-body sensation, receptive mindset.',
  '{"domain":"intimate_skills","intensity_max":4,"tags":["sensation","exploration","receptive"]}',
  '{"tasks_required":5,"verifications_required":3}',
  'self_report', 'Describe a sensation exploration session and what you learned.'),

('intimate_skills', 3, 'Feminine Arousal', 'Train arousal patterns toward feminine response — slow build, whole-body, emotional connection.',
  '{"domain":"intimate_skills","intensity_max":6,"tags":["arousal","training","feminine"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'self_report', 'Describe how your arousal patterns have shifted toward feminine response.'),

('intimate_skills', 4, 'Partner Skills', 'Develop skills for intimate encounters as a woman — confidence, communication, reciprocity.',
  '{"domain":"intimate_skills","intensity_max":7,"tags":["partner","communication","confidence"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'self_report', 'Reflect on intimate encounters and what felt authentic.'),

('intimate_skills', 5, 'Embodied Sexuality', 'Own your feminine sexuality — desire, expression, initiation from a feminine frame.',
  '{"domain":"intimate_skills","intensity_max":8,"tags":["sexuality","ownership","expression"]}',
  '{"tasks_required":7,"verifications_required":3}',
  'self_report', 'Describe how you express feminine desire and sexuality.'),

('intimate_skills', 6, 'Sexual Integration', 'Sexuality fully integrated with feminine identity. No compartmentalization.',
  '{"domain":"intimate_skills","intensity_max":10,"tags":["integration","identity","wholeness"]}',
  '{"tasks_required":10,"verifications_required":3}',
  'self_report', 'Reflect on how your intimate life reflects your complete feminine self.');

-- ============================================
-- SEED DATA: POSTURE (4 levels)
-- ============================================

INSERT INTO skill_level_definitions (domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions) VALUES
('posture', 1, 'Awareness', 'Notice masculine posture habits — wide stance, squared shoulders, locked knees, rigid spine.',
  '{"domain":"posture","intensity_max":2,"tags":["awareness","habits"]}',
  '{"tasks_required":5,"verifications_required":2}',
  'self_report', 'List 5 masculine posture habits you caught yourself doing today.'),

('posture', 2, 'Softening', 'Soften stance, relax shoulders down and slightly forward, unlock knees, slight hip tilt.',
  '{"domain":"posture","intensity_max":4,"tags":["softening","practice"]}',
  '{"tasks_required":5,"verifications_required":3}',
  'photo', 'Side-by-side photos showing old posture vs softened feminine posture.'),

('posture', 3, 'Situational', 'Maintain feminine posture in varied situations — standing in line, sitting in meetings, walking in public.',
  '{"domain":"posture","intensity_max":6,"tags":["situational","varied","public"]}',
  '{"tasks_required":6,"verifications_required":3}',
  'self_report', 'Describe maintaining feminine posture in 3 different public situations.'),

('posture', 4, 'Default Posture', 'Feminine posture is automatic. You catch yourself being feminine without trying.',
  '{"domain":"posture","intensity_max":10,"tags":["default","automatic","integrated"]}',
  '{"tasks_required":10,"verifications_required":3}',
  'self_report', 'Reflect on when you last noticed your posture was automatically feminine.');

-- ============================================
-- IDENTITY JOURNAL
-- ============================================

CREATE TABLE IF NOT EXISTS identity_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  prompt TEXT NOT NULL,
  prompt_category TEXT NOT NULL CHECK (prompt_category IN (
    'experience','body_awareness','desire','social','aspiration',
    'reflection','gina','fear','gratitude','milestone'
  )),
  content TEXT NOT NULL,
  word_count INTEGER,
  identity_signals JSONB,
  emotional_tone TEXT,
  memories_extracted UUID[],
  consecutive_days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entry_date)
);

CREATE INDEX idx_identity_journal_user ON identity_journal(user_id);
CREATE INDEX idx_identity_journal_date ON identity_journal(user_id, entry_date DESC);
CREATE INDEX idx_identity_journal_category ON identity_journal(user_id, prompt_category);

ALTER TABLE identity_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_journal_select" ON identity_journal
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "identity_journal_insert" ON identity_journal
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "identity_journal_update" ON identity_journal
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "identity_journal_delete" ON identity_journal
  FOR DELETE USING (auth.uid() = user_id);
