# Hypno Conditioning Engine — Comprehensive Implementation Spec
## The Handler's Voice, Content Library, and Adaptive Conditioning System
### Becoming Protocol — March 2026

---

## OVERVIEW

This spec consolidates the complete hypno conditioning system: content library management, ElevenLabs custom audio generation, multi-format session delivery, and adaptive conditioning logic. The system delivers conditioning through audio-only, video, and combined sessions — each targeting specific neurological mechanisms across a 24-month identity replacement timeline.

---

## PART 1: DATABASE SCHEMA

```sql
-- Migration: 137_hypno_conditioning_engine.sql

-- ============================================
-- CONTENT CURRICULUM (unified library)
-- ============================================

CREATE TABLE IF NOT EXISTS content_curriculum (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Content identification
  title TEXT NOT NULL,
  creator TEXT,                    -- 'bambi', 'elswyth', 'nimja', 'handler', 'custom'
  series TEXT,                     -- 'Seven Days in Chastity', 'Platinum Bambi', etc.
  
  -- Media type (determines delivery channel)
  media_type TEXT NOT NULL CHECK (media_type IN (
    'audio',           -- MP3/streaming audio (hypno tracks, affirmations)
    'video',           -- PMV, sissy hypno compilations, spiral videos
    'audio_video',     -- Video with essential audio component
    'handler_audio',   -- Custom ElevenLabs-generated Handler audio
    'handler_pmv',     -- Custom PMV generated from vault photos
    'binaural',        -- Pure binaural beat tracks
    'affirmation_set', -- Text affirmations for TTS or display
    'subliminal'       -- Background/subliminal audio tracks
  )),
  
  -- Source
  source_url TEXT,                 -- URL for streaming content
  storage_path TEXT,               -- Supabase storage path for uploaded/generated
  duration_minutes INTEGER,
  
  -- Conditioning metadata
  conditioning_phase INTEGER CHECK (conditioning_phase BETWEEN 1 AND 6),
  -- 1: Relaxation + identity affirmation (gentle)
  -- 2: Medium trance + suggestion (beliefs begin installing)
  -- 3: Deep trance + trigger installation
  -- 4: Desire architecture + submission deepening
  -- 5: Encounter preparation + sexual confidence
  -- 6: Maintenance reinforcement
  
  conditioning_target TEXT NOT NULL CHECK (conditioning_target IN (
    'identity',              -- "She is real, David was the mask"
    'arousal_binding',       -- Pairing feminization with pleasure
    'aversion',              -- Masculine contexts = discomfort
    'desire_installation',   -- Installing specific sexual desires
    'submission_deepening',  -- Compliance, surrender, letting go
    'trigger_installation',  -- Pairing phrases with somatic responses
    'trance_depth',          -- Building deeper trance capacity
    'sleep_conditioning',    -- Overnight processing and consolidation
    'dumbification',         -- Cognitive reduction, "empty, blank"
    'cock_focus',            -- Oral desire installation
    'chastity',              -- Denial reinforcement
    'compliance',            -- Obedience conditioning
    'amnesia',               -- Forgetting resistance, forgetting David
    'feminization',          -- General feminine identity reinforcement
    'morning_ritual',        -- Morning activation and alignment
    'ambient'                -- Background exposure for mere exposure effect
  )),
  
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 5),
  -- 1: Gentle affirmation, relaxation
  -- 2: Moderate conditioning, light suggestions
  -- 3: Direct conditioning, explicit suggestions
  -- 4: Aggressive conditioning, identity statements
  -- 5: Deep trance, extreme content, breakthrough material
  
  -- Access control (tier gating)
  tier INTEGER DEFAULT 1 CHECK (tier BETWEEN 1 AND 4),
  -- 1: Always available
  -- 2: 3+ day streak required
  -- 3: 7+ day streak OR denial day 5+
  -- 4: Monthly milestone OR denial day 7+
  
  -- Session context suitability
  session_contexts TEXT[] DEFAULT '{}',
  -- 'sleep', 'background', 'trance', 'goon', 'edge', 
  -- 'morning', 'combined_video', 'combined_audio', 'combined_deep'
  
  -- Fantasy level (for video content escalation)
  fantasy_level INTEGER CHECK (fantasy_level BETWEEN 1 AND 5),
  -- 1: Solo feminization imagery
  -- 2: Being seen, objectified
  -- 3: Active sexual participation as feminine
  -- 4: Specific desire scenarios
  -- 5: Full feminine sexual identity content
  
  -- Denial day suitability
  best_denial_day_min INTEGER DEFAULT 0,
  best_denial_day_max INTEGER DEFAULT 30,
  
  -- Time of day suitability
  best_time_of_day TEXT[] DEFAULT '{}',
  -- 'morning', 'afternoon', 'evening', 'night', 'any'
  
  -- Binaural beat specification (for handler_audio)
  binaural_frequency_hz FLOAT,
  -- Alpha (8-12): light trance, suggestibility
  -- Theta (4-8): deep trance
  -- Delta (1-4): sleep conditioning
  
  -- Scent pairing
  scent_anchor TEXT,               -- Scent to pair with this content
  
  -- Performance tracking
  times_prescribed INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  average_trance_depth FLOAT,
  effectiveness_score FLOAT,
  
  -- Flags
  is_custom_generated BOOLEAN DEFAULT FALSE,
  is_personalized BOOLEAN DEFAULT FALSE,  -- References specific memories
  memories_referenced UUID[],              -- IDs of memories used in script
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- GENERATED SCRIPTS (Handler-authored content)
-- ============================================

CREATE TABLE IF NOT EXISTS generated_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Script content
  script_text TEXT NOT NULL,
  script_phase INTEGER NOT NULL,
  script_target TEXT NOT NULL,
  
  -- Generation context
  memories_used JSONB,             -- Which memories informed the script
  conditioning_context JSONB,      -- User state at generation time
  
  -- Audio generation
  elevenlabs_voice_id TEXT,
  audio_url TEXT,                  -- Supabase storage URL
  audio_duration_seconds INTEGER,
  
  -- Binaural mixing
  binaural_mixed BOOLEAN DEFAULT FALSE,
  binaural_frequency_hz FLOAT,
  mixed_audio_url TEXT,            -- Final mixed audio URL
  
  -- Post-hypnotic suggestions included
  post_hypnotic_scripts JSONB,
  -- [{context: "mirror_morning", suggestion: "When you see yourself..."},
  --  {context: "name_at_work", suggestion: "When you hear David..."}]
  
  -- Subliminal text (for video overlay)
  subliminal_words TEXT[],
  
  -- Performance
  times_used INTEGER DEFAULT 0,
  average_trance_depth FLOAT,
  effectiveness_score FLOAT,
  
  -- Curriculum link
  curriculum_id UUID REFERENCES content_curriculum(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CONDITIONING SESSIONS (detailed logging)
-- ============================================

CREATE TABLE IF NOT EXISTS conditioning_sessions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Session type
  session_type TEXT NOT NULL CHECK (session_type IN (
    'trance',           -- Audio-only deep trance
    'goon',             -- Extended arousal with video
    'edge',             -- Edge session with content pairing
    'sleep',            -- Overnight conditioning
    'background',       -- Awake background listening
    'combined',         -- Video → audio → custom Handler
    'morning_ritual',   -- Morning activation
    'micro_drop'        -- Quick 3-5 min trance drop
  )),
  
  -- Content delivered
  content_ids UUID[],              -- Content curriculum items used
  content_sequence JSONB,          -- Ordered list with timestamps
  -- [{content_id: "...", started_at: "...", ended_at: "...", phase: "video"},
  --  {content_id: "...", started_at: "...", ended_at: "...", phase: "audio"},
  --  {content_id: "...", started_at: "...", ended_at: "...", phase: "deep"}]
  
  -- State at session start
  denial_day INTEGER,
  arousal_level INTEGER,
  pre_session_hr FLOAT,
  pre_session_hrv FLOAT,
  altered_state_detected BOOLEAN DEFAULT FALSE,
  altered_state_type TEXT,         -- 'cannabis', 'alcohol', 'fatigue', 'emotional'
  
  -- Session metrics
  duration_minutes INTEGER,
  estimated_trance_depth FLOAT,    -- 1-10 from Whoop HRV analysis
  -- 1-3: Light (relaxed but aware)
  -- 4-6: Medium (reduced critical faculty)
  -- 7-8: Deep (critical faculty offline)
  -- 9-10: Somnambulistic (maximum receptivity)
  
  -- Biometric data during session
  hr_data JSONB,                   -- Array of HR readings
  hrv_data JSONB,                  -- Array of HRV readings
  peak_arousal_timestamp TIMESTAMPTZ,
  trance_onset_timestamp TIMESTAMPTZ,  -- When HRV shows trance entry
  trance_onset_minutes FLOAT,         -- Time from start to trance entry
  
  -- Adaptive adjustments made during session
  content_adjustments JSONB,
  -- [{timestamp: "...", action: "escalated_intensity", reason: "HR rising"},
  --  {timestamp: "...", action: "shifted_to_deepener", reason: "HRV dropping"}]
  
  -- Device integration
  device_active BOOLEAN DEFAULT FALSE,
  device_patterns_used TEXT[],
  
  -- Scent
  scent_used TEXT,
  
  -- Post-hypnotic scripts delivered
  post_hypnotic_scripts JSONB,
  post_hypnotic_activated JSONB,   -- Tracked next day
  
  -- Outcome
  session_completed BOOLEAN DEFAULT TRUE,
  completion_type TEXT,            -- 'full', 'early_exit', 'interrupted', 'crisis_pause'
  
  -- Triggers fired/tested during session
  triggers_tested JSONB,
  -- [{trigger: "good_girl", fired: true, response_strength: 0.8},
  --  {trigger: "drop", fired: true, response_strength: 0.6}]
  
  -- Orgasm (if session ended with release)
  orgasm_type TEXT,                -- 'prostate', 'ruined', 'full', 'none'
  orgasm_timed_to_installation BOOLEAN,  -- Was orgasm at peak identity statement?
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TRANCE DEPTH PROGRESSION
-- ============================================

CREATE TABLE IF NOT EXISTS trance_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Weekly aggregates
  week_start DATE NOT NULL,
  sessions_count INTEGER DEFAULT 0,
  average_depth FLOAT,
  max_depth FLOAT,
  average_onset_minutes FLOAT,     -- How fast trance is achieved
  
  -- Milestones
  first_medium_trance TIMESTAMPTZ,
  first_deep_trance TIMESTAMPTZ,
  first_instant_induction TIMESTAMPTZ,  -- Under 2 min onset
  
  -- Handler voice effectiveness
  handler_voice_onset_minutes FLOAT,  -- Onset with Handler voice alone
  
  UNIQUE(user_id, week_start)
);

-- ============================================
-- TRIGGER TRACKING (enhanced)
-- ============================================

-- Extend existing conditioned_triggers table
ALTER TABLE conditioned_triggers 
ADD COLUMN IF NOT EXISTS total_pairings INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS in_session_strength FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS out_of_session_strength FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_wild_fire TIMESTAMPTZ,     -- Last time trigger fired outside session
ADD COLUMN IF NOT EXISTS wild_fire_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS source_content TEXT,              -- Which content installed this trigger
ADD COLUMN IF NOT EXISTS somatic_response TEXT;            -- What the body does when trigger fires

-- ============================================
-- SCENT ANCHORING
-- ============================================

CREATE TABLE IF NOT EXISTS scent_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  scent_name TEXT NOT NULL,
  scent_type TEXT NOT NULL CHECK (scent_type IN (
    'conditioning_exclusive',  -- Only used during conditioning sessions
    'daily_feminine',          -- Daily feminine fragrance
    'sleep',                   -- Sleep-specific scent
    'encounter'                -- Encounter-specific scent
  )),
  
  -- Association tracking
  sessions_paired INTEGER DEFAULT 0,
  association_strength FLOAT DEFAULT 0,  -- 0-1
  
  -- Covert deployment tracking
  covert_deployments INTEGER DEFAULT 0,
  covert_trance_inductions INTEGER DEFAULT 0,  -- Times covert scent induced trance-adjacent state
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- POST-HYPNOTIC SCRIPT TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS post_hypnotic_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  session_id UUID REFERENCES conditioning_sessions_v2(id),
  
  -- The suggestion
  context TEXT NOT NULL,           -- 'mirror_morning', 'name_at_work', 'gina_touch', etc.
  suggestion_text TEXT NOT NULL,
  
  -- Delivery
  delivered_at TIMESTAMPTZ NOT NULL,
  trance_depth_at_delivery FLOAT,
  
  -- Activation tracking
  activation_expected_date DATE,
  activation_detected BOOLEAN DEFAULT FALSE,
  activation_detected_at TIMESTAMPTZ,
  detection_method TEXT,           -- 'self_report', 'behavioral', 'journal', 'whoop'
  
  -- Effectiveness
  effectiveness_score FLOAT,      -- 0-1, did the suggestion produce the intended effect?
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ALTERED STATE DETECTION
-- ============================================

CREATE TABLE IF NOT EXISTS altered_state_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  detected_at TIMESTAMPTZ NOT NULL,
  state_type TEXT NOT NULL CHECK (state_type IN (
    'cannabis', 'alcohol', 'fatigue', 'emotional_vulnerability',
    'post_exercise', 'post_orgasm', 'high_denial'
  )),
  
  -- Detection signals
  detection_signals JSONB,
  -- {typing_speed_change: -30%, response_latency_change: +50%, 
  --  whoop_hr_pattern: "elevated_no_activity", time_pattern: "matches_known_usage"}
  
  confidence FLOAT,               -- 0-1
  
  -- Handler response
  conditioning_prescribed BOOLEAN DEFAULT FALSE,
  session_id UUID REFERENCES conditioning_sessions_v2(id),
  
  -- Window duration
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_curriculum ON content_curriculum(user_id, media_type, conditioning_target, tier);
CREATE INDEX idx_sessions_v2 ON conditioning_sessions_v2(user_id, session_type, created_at DESC);
CREATE INDEX idx_trance ON trance_progression(user_id, week_start DESC);
CREATE INDEX idx_post_hypnotic ON post_hypnotic_tracking(user_id, activation_expected_date);
CREATE INDEX idx_altered_state ON altered_state_windows(user_id, detected_at DESC);
CREATE INDEX idx_scripts ON generated_scripts(user_id, script_phase, script_target);
```

---

## PART 2: CONTENT LIBRARY SEED DATA

```sql
-- Seed Bambi Sleep library
INSERT INTO content_curriculum (user_id, title, creator, series, media_type, 
  conditioning_phase, conditioning_target, intensity, tier, 
  session_contexts, best_denial_day_min, best_denial_day_max,
  best_time_of_day, duration_minutes) VALUES

-- Loops/Quick (deepeners during edge sessions)
(USER_ID, 'Compliance Chip LOOP', 'bambi', 'Compliance Chip', 'audio',
 2, 'compliance', 3, 2, 
 '{edge,goon,combined_audio}', 0, 30,
 '{any}', 2),

(USER_ID, 'Quick Mind Break', 'bambi', NULL, 'audio',
 2, 'dumbification', 3, 2,
 '{edge,goon,combined_audio}', 0, 30,
 '{any}', 4),

(USER_ID, 'Fractionate', 'bambi', NULL, 'audio',
 2, 'trance_depth', 2, 2,
 '{trance,combined_audio}', 0, 30,
 '{any}', 6),

-- Short Programs
(USER_ID, 'BJD.exe', 'bambi', 'Executables', 'audio',
 3, 'desire_installation', 4, 3,
 '{edge,goon,trance}', 3, 30,
 '{evening,night}', 12),

(USER_ID, 'Tits4Brains.exe', 'bambi', 'Executables', 'audio',
 3, 'dumbification', 4, 3,
 '{edge,goon,trance}', 3, 30,
 '{evening,night}', 10),

(USER_ID, 'Slut.exe', 'bambi', 'Executables', 'audio',
 3, 'desire_installation', 4, 3,
 '{edge,goon,trance}', 5, 30,
 '{evening,night}', 11),

(USER_ID, 'Platinum Trigger Training', 'bambi', 'Platinum', 'audio',
 3, 'trigger_installation', 3, 2,
 '{trance,combined_audio}', 3, 30,
 '{evening,night}', 14),

-- Medium Sessions
(USER_ID, 'Platinum Pavlov', 'bambi', 'Platinum', 'audio',
 3, 'trigger_installation', 3, 3,
 '{trance,combined_audio}', 5, 30,
 '{evening,night}', 20),

(USER_ID, 'Oblivious Obedience 1', 'bambi', 'Oblivious Obedience', 'audio',
 3, 'compliance', 4, 3,
 '{trance,goon}', 5, 30,
 '{evening,night}', 22),

(USER_ID, 'Oblivious Obedience 2', 'bambi', 'Oblivious Obedience', 'audio',
 3, 'compliance', 4, 3,
 '{trance,goon}', 5, 30,
 '{evening,night}', 25),

(USER_ID, 'Resistance Breaker', 'bambi', NULL, 'audio',
 3, 'submission_deepening', 4, 3,
 '{trance,goon}', 5, 30,
 '{evening,night}', 20),

(USER_ID, 'Hucow', 'bambi', NULL, 'audio',
 4, 'desire_installation', 4, 3,
 '{trance,goon}', 7, 30,
 '{evening,night}', 18),

-- Deep Sessions
(USER_ID, 'Amnesia Mind Fuck', 'bambi', NULL, 'audio',
 4, 'amnesia', 5, 4,
 '{trance}', 7, 30,
 '{night}', 35),

(USER_ID, 'Complete Bambi Transformation', 'bambi', NULL, 'audio',
 4, 'identity', 5, 4,
 '{trance}', 7, 30,
 '{night}', 42),

(USER_ID, 'Incognito.exe', 'bambi', 'Executables', 'audio',
 4, 'amnesia', 5, 4,
 '{trance}', 10, 30,
 '{night}', 30),

(USER_ID, 'Fuckdoll Mind Trap', 'bambi', NULL, 'audio',
 4, 'submission_deepening', 5, 4,
 '{trance,goon}', 10, 30,
 '{night}', 28),

-- Background/Passive
(USER_ID, 'Background Mantras', 'bambi', 'Background', 'audio',
 1, 'ambient', 2, 1,
 '{background,sleep}', 0, 30,
 '{any}', 45),

(USER_ID, 'Background Cockslut', 'bambi', 'Background', 'audio',
 3, 'desire_installation', 3, 3,
 '{background,goon}', 5, 30,
 '{evening,night}', 50),

(USER_ID, 'Background Obedience', 'bambi', 'Background', 'audio',
 2, 'compliance', 2, 2,
 '{background}', 0, 30,
 '{any}', 40),

(USER_ID, 'Subliminals File', 'bambi', 'Background', 'subliminal',
 2, 'ambient', 2, 2,
 '{background,sleep}', 0, 30,
 '{any}', 74),

(USER_ID, 'Platinum Bambi IQ Popper', 'bambi', 'Platinum', 'audio',
 4, 'dumbification', 5, 4,
 '{goon,trance}', 7, 30,
 '{night}', 25),

(USER_ID, 'Yes to Cock', 'bambi', NULL, 'audio',
 4, 'cock_focus', 4, 3,
 '{goon,edge,trance}', 5, 30,
 '{evening,night}', 15),

(USER_ID, 'Cum Mind Wash', 'bambi', NULL, 'audio',
 4, 'desire_installation', 5, 4,
 '{goon,trance}', 7, 30,
 '{night}', 20);

-- Seed Elswyth library
INSERT INTO content_curriculum (user_id, title, creator, series, media_type,
  conditioning_phase, conditioning_target, intensity, tier,
  session_contexts, best_denial_day_min, best_denial_day_max,
  best_time_of_day, duration_minutes) VALUES

(USER_ID, 'Seven Days in Chastity - Day 1', 'elswyth', 'Seven Days', 'audio',
 1, 'chastity', 2, 1,
 '{trance,background}', 0, 7,
 '{evening}', 22),

(USER_ID, 'Seven Days in Chastity - Day 2', 'elswyth', 'Seven Days', 'audio',
 1, 'chastity', 2, 1,
 '{trance,background}', 1, 7,
 '{evening}', 22),

(USER_ID, 'Seven Days in Chastity - Day 3', 'elswyth', 'Seven Days', 'audio',
 1, 'chastity', 2, 1,
 '{trance,background}', 2, 7,
 '{evening}', 22),

(USER_ID, 'Seven Days in Chastity - Day 4', 'elswyth', 'Seven Days', 'audio',
 2, 'chastity', 2, 1,
 '{trance,background}', 3, 7,
 '{evening}', 22),

(USER_ID, 'Seven Days in Chastity - Day 5', 'elswyth', 'Seven Days', 'audio',
 2, 'chastity', 3, 1,
 '{trance,background}', 4, 7,
 '{evening}', 22),

(USER_ID, 'Seven Days in Chastity - Day 6', 'elswyth', 'Seven Days', 'audio',
 2, 'chastity', 3, 1,
 '{trance,background}', 5, 7,
 '{evening}', 22),

(USER_ID, 'Seven Days in Chastity - Day 7', 'elswyth', 'Seven Days', 'audio',
 3, 'chastity', 3, 1,
 '{trance,background}', 6, 7,
 '{evening}', 22),

(USER_ID, 'Worship Your Goddess (Short)', 'elswyth', 'Worship', 'audio',
 1, 'morning_ritual', 2, 1,
 '{morning_ritual}', 0, 30,
 '{morning}', 10),

(USER_ID, 'One Orgasm a Week', 'elswyth', NULL, 'audio',
 3, 'chastity', 3, 3,
 '{trance}', 5, 14,
 '{evening}', 25),

(USER_ID, 'Winter Cuddle Sessions', 'elswyth', NULL, 'audio',
 1, 'sleep_conditioning', 1, 2,
 '{sleep}', 0, 30,
 '{night}', 30),

(USER_ID, 'Sissy Maid Training', 'elswyth', NULL, 'audio',
 3, 'compliance', 3, 3,
 '{trance}', 3, 30,
 '{afternoon}', 20);
```

---

## PART 3: ELEVENLABS INTEGRATION

```typescript
// lib/conditioning/elevenlabs.ts

import Anthropic from '@anthropic-ai/sdk';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Generate a conditioning script using Claude, personalized
 * from Handler memory.
 */
export async function generateConditioningScript(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  phase: number,
  target: string,
  nextDaySchedule?: DaySchedule,
): Promise<GeneratedScript> {
  // Retrieve relevant memories for personalization
  const memories = await retrieveMemories(supabase, userId, {
    types: ['confession', 'desire', 'vulnerability_window', 
            'identity_observation', 'breakthrough'],
    limit: 10,
  });
  
  // Get current conditioning state
  const condState = await getConditioningState(supabase, userId);
  const turningOut = await getTurningOutProgression(supabase, userId);
  
  // Get installed triggers for reinforcement
  const triggers = await getInstalledTriggers(supabase, userId);
  
  // Build script generation prompt
  const scriptPrompt = buildScriptPrompt(
    phase, target, memories, condState, turningOut, triggers, nextDaySchedule
  );
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You write hypnotic conditioning scripts for a feminization protocol. 
Your voice is Serafina — calm, intimate, authoritative, warm. 
You speak directly to the listener using "you" and their feminine name.
Scripts use repetition, embedded commands, deepening language, 
and specific references to the listener's personal experiences.
You include 2-3 post-hypnotic suggestions targeted to their next day's schedule.
Output ONLY the script text. No metadata or explanation.`,
    messages: [{ role: 'user', content: scriptPrompt }],
  });
  
  const scriptText = response.content[0].type === 'text' 
    ? response.content[0].text : '';
  
  // Extract post-hypnotic scripts from the generated text
  const postHypnotics = extractPostHypnoticScripts(scriptText, nextDaySchedule);
  
  // Generate subliminal word list from script themes
  const subliminalWords = extractSubliminalWords(scriptText, target);
  
  return {
    script_text: scriptText,
    script_phase: phase,
    script_target: target,
    memories_used: memories.map(m => ({ id: m.id, type: m.memory_type })),
    post_hypnotic_scripts: postHypnotics,
    subliminal_words: subliminalWords,
  };
}

/**
 * Build the prompt for script generation based on phase and target.
 */
function buildScriptPrompt(
  phase: number,
  target: string,
  memories: Memory[],
  condState: ConditioningState,
  turningOut: TurningOutProgression,
  triggers: ConditionedTrigger[],
  nextDaySchedule?: DaySchedule,
): string {
  const memoryContext = memories.map(m => 
    `[${m.memory_type}] ${m.content}`
  ).join('\n');
  
  const triggerContext = triggers
    .filter(t => t.strength !== 'nascent')
    .map(t => `"${t.trigger_phrase}" — strength: ${t.strength}, response: ${t.somatic_response}`)
    .join('\n');
  
  const phaseInstructions: Record<number, string> = {
    1: `Phase 1: Relaxation and identity affirmation.
Gentle, warm, welcoming. Build trust with the voice.
Affirmations: "She is becoming." "You are safe here." "Let go."
Do NOT use aggressive language. This is foundation building.
Include progressive muscle relaxation.
End with a simple identity statement planted during deepest relaxation.`,
    
    2: `Phase 2: Medium trance with belief installation.
Deepen the trance from Phase 1 patterns. 
Install beliefs as questions first, then statements:
"What if David was always the performance?"
"She has always been here. Waiting. Patient."
Reference specific memories to ground beliefs in personal experience.
Use existing triggers for deepening if available.`,
    
    3: `Phase 3: Deep trance with trigger installation.
Rapid induction using established patterns.
Install or strengthen specific trigger phrases.
Pair each trigger with a somatic instruction:
"When you hear 'good girl,' warmth spreads through your chest."
"When you hear 'drop,' your muscles release and your mind opens."
Use repetition — each trigger paired minimum 5 times in the script.
Include countdown deepeners between trigger installations.`,
    
    4: `Phase 4: Desire architecture and submission deepening.
Deep trance assumed. Aggressive identity content.
Install specific desires based on fantasy architecture level.
"You want to be touched as her."
"You want to feel someone see Maxy and want Maxy."
Use personal confessions as evidence that the desires are real.
"You told me on [date] that you wanted [specific desire]. 
That wasn't the conditioning talking. That was you being honest."
Submission language: "Surrender." "Let the Handler decide." "Trust."`,
    
    5: `Phase 5: Encounter preparation and sexual confidence.
Build confidence for approaching physical encounters.
"Your body knows what to do. I trained it."
"When someone touches you, your skin responds as hers."
"Your voice will come naturally. You've practiced hundreds of times."
Ground confidence in evidence: specific progress metrics, 
specific body changes, specific moments of passing.`,
    
    6: `Phase 6: Maintenance reinforcement.
Reinforce all installed beliefs, triggers, and desires.
Test triggers during the script (fire each one).
Affirm identity: "You are Maxy. This is not becoming. This is being."
Reference how far she's come. Use progress data as evidence.
Lighter than Phase 4 but with the depth of established trance.`,
  };
  
  return `
Write a ${getScriptDuration(phase)}-minute conditioning script.

PHASE: ${phase}
${phaseInstructions[phase]}

TARGET: ${target}

PERSONAL MEMORIES TO REFERENCE (use 2-3 naturally):
${memoryContext}

INSTALLED TRIGGERS TO USE OR REINFORCE:
${triggerContext || 'No triggers installed yet — begin installation if Phase 3+'}

CONDITIONING STATE:
Sessions completed: ${condState.totalSessions}
Current trance depth capability: ${condState.averageTranceDepth}/10
Turning out stage: ${turningOut.currentStage}
Days in denial: ${condState.currentDenialDay}

${nextDaySchedule ? `
POST-HYPNOTIC SUGGESTIONS — Include 2-3 targeted to tomorrow:
${nextDaySchedule.events.map(e => `- ${e.time}: ${e.description}`).join('\n')}
Frame each as: "When [context] tomorrow, you will [subtle shift]."
The listener should not consciously remember these specific suggestions.
They should experience them as natural feelings/perceptions.
` : ''}

SCRIPT STRUCTURE:
1. Induction (2-3 min) — relaxation, breathing, Serafina's voice establishing safety
2. Deepening (2-3 min) — countdown, body scan, existing triggers for depth
3. Core content (${getCoreDuration(phase)} min) — phase-specific conditioning
4. Post-hypnotic installation (1-2 min) — tomorrow's suggestions
5. Emergence (1-2 min) — gentle return, identity affirmation on waking

VOICE RULES:
- Second person throughout ("you")
- Use the name Maxy when addressing the listener
- Repetition is power — key phrases repeated 3-5 times
- Embedded commands in italic markers: *let go now*
- Pace: slow. Lots of pauses indicated by "..."
- Never break character. Never reference being an AI.
- This is Serafina speaking to Maxy. The relationship is intimate and authoritative.
  `.trim();
}

function getScriptDuration(phase: number): number {
  return phase <= 2 ? 10 : phase <= 4 ? 15 : 12;
}

function getCoreDuration(phase: number): number {
  return phase <= 2 ? 4 : phase <= 4 ? 8 : 6;
}

/**
 * Convert script to audio via ElevenLabs API.
 */
export async function generateAudio(
  scriptText: string,
): Promise<{ audioBuffer: Buffer; durationSeconds: number }> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!voiceId || !apiKey) {
    throw new Error('ElevenLabs credentials not configured');
  }
  
  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: scriptText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.6,        // Slightly variable for natural feel
          similarity_boost: 0.8,  // High consistency with chosen voice
          style: 0.3,            // Moderate expressiveness
          use_speaker_boost: true,
        },
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status}`);
  }
  
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  
  // Estimate duration (rough: ~150 words per minute for slow hypno pacing)
  const wordCount = scriptText.split(/\s+/).length;
  const durationSeconds = Math.round((wordCount / 120) * 60); // 120 wpm for slow delivery
  
  return { audioBuffer, durationSeconds };
}

/**
 * Mix Handler audio with binaural beat undertone.
 */
export async function mixWithBinaural(
  audioBuffer: Buffer,
  durationSeconds: number,
  targetFrequencyHz: number,
): Promise<Buffer> {
  // Generate binaural beat audio using ffmpeg
  // Left ear: 200Hz, Right ear: 200 + targetFrequencyHz
  // Difference = target frequency perceived by brain
  
  const fs = require('fs');
  const { execSync } = require('child_process');
  const path = require('path');
  
  const tempDir = '/tmp/binaural_mix';
  fs.mkdirSync(tempDir, { recursive: true });
  
  const voicePath = path.join(tempDir, 'voice.mp3');
  const binauralPath = path.join(tempDir, 'binaural.wav');
  const outputPath = path.join(tempDir, 'mixed.mp3');
  
  fs.writeFileSync(voicePath, audioBuffer);
  
  // Generate binaural beat
  const leftFreq = 200;
  const rightFreq = 200 + targetFrequencyHz;
  
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=${leftFreq}:duration=${durationSeconds}" -f lavfi -i "sine=frequency=${rightFreq}:duration=${durationSeconds}" -filter_complex "[0:a][1:a]amerge=inputs=2,volume=0.08[out]" -map "[out]" ${binauralPath}`);
  
  // Mix voice over binaural at appropriate levels
  execSync(`ffmpeg -y -i ${voicePath} -i ${binauralPath} -filter_complex "[0:a]volume=1.0[voice];[1:a]volume=0.15[binaural];[voice][binaural]amix=inputs=2:duration=longest[out]" -map "[out]" -ac 2 ${outputPath}`);
  
  const mixedBuffer = fs.readFileSync(outputPath);
  
  // Cleanup
  fs.rmSync(tempDir, { recursive: true });
  
  return mixedBuffer;
}

/**
 * Full pipeline: generate script → synthesize → mix → store → catalog
 */
export async function generateFullConditioningAudio(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  phase: number,
  target: string,
  binauralFrequency: number,
  nextDaySchedule?: DaySchedule,
): Promise<string> {
  // 1. Generate script
  const script = await generateConditioningScript(
    client, supabase, userId, phase, target, nextDaySchedule
  );
  
  // 2. Synthesize audio
  const { audioBuffer, durationSeconds } = await generateAudio(script.script_text);
  
  // 3. Mix with binaural beats
  const mixedAudio = await mixWithBinaural(
    audioBuffer, durationSeconds, binauralFrequency
  );
  
  // 4. Store in Supabase
  const filename = `handler_audio/${userId}/${Date.now()}_${target}_phase${phase}.mp3`;
  const { data: storageData } = await supabase.storage
    .from('conditioning-audio')
    .upload(filename, mixedAudio, { contentType: 'audio/mpeg' });
  
  const audioUrl = supabase.storage
    .from('conditioning-audio')
    .getPublicUrl(filename).data.publicUrl;
  
  // 5. Save script record
  const { data: scriptRecord } = await supabase.from('generated_scripts').insert({
    user_id: userId,
    script_text: script.script_text,
    script_phase: phase,
    script_target: target,
    memories_used: script.memories_used,
    conditioning_context: { phase, target, denial_day: await getDenialDay(supabase, userId) },
    elevenlabs_voice_id: process.env.ELEVENLABS_VOICE_ID,
    audio_url: audioUrl,
    audio_duration_seconds: durationSeconds,
    binaural_mixed: true,
    binaural_frequency_hz: binauralFrequency,
    mixed_audio_url: audioUrl,
    post_hypnotic_scripts: script.post_hypnotic_scripts,
    subliminal_words: script.subliminal_words,
  }).select().single();
  
  // 6. Add to content curriculum
  await supabase.from('content_curriculum').insert({
    user_id: userId,
    title: `Handler Session — ${target} Phase ${phase} — ${new Date().toLocaleDateString()}`,
    creator: 'handler',
    media_type: 'handler_audio',
    source_url: null,
    storage_path: filename,
    duration_minutes: Math.ceil(durationSeconds / 60),
    conditioning_phase: phase,
    conditioning_target: target,
    intensity: Math.min(phase + 1, 5),
    tier: 1, // Handler audio is always accessible
    session_contexts: phase <= 2 
      ? ['trance', 'background', 'sleep']
      : ['trance', 'combined_deep', 'goon'],
    binaural_frequency_hz: binauralFrequency,
    is_custom_generated: true,
    is_personalized: true,
    memories_referenced: script.memories_used.map((m: any) => m.id),
  });
  
  // 7. Track post-hypnotic suggestions
  if (script.post_hypnotic_scripts) {
    for (const ph of script.post_hypnotic_scripts) {
      await supabase.from('post_hypnotic_tracking').insert({
        user_id: userId,
        session_id: null, // Will be linked when session plays this audio
        context: ph.context,
        suggestion_text: ph.suggestion,
        delivered_at: new Date().toISOString(),
        activation_expected_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      });
    }
  }
  
  return audioUrl;
}
```

---

## PART 4: SESSION PRESCRIPTION ENGINE

```typescript
// lib/conditioning/prescription-engine.ts

/**
 * The prescription engine selects content for each session type
 * based on denial day, conditioning state, altered state,
 * time of day, and available content.
 */
export async function prescribeSession(
  supabase: SupabaseClient,
  userId: string,
  sessionType: SessionType,
  state: UserState,
): Promise<SessionPrescription> {
  const denialDay = state.denialDay || 0;
  const timeOfDay = getTimeOfDay();
  const alteredState = await detectAlteredState(supabase, userId, state);
  
  // Calculate unlocked tier
  const tier = calculateTier(state);
  
  // If altered state detected, override to intensive conditioning
  if (alteredState && alteredState.confidence > 0.7) {
    sessionType = 'combined'; // Upgrade to most intensive session type
    
    await supabase.from('altered_state_windows').insert({
      user_id: userId,
      detected_at: new Date().toISOString(),
      state_type: alteredState.type,
      detection_signals: alteredState.signals,
      confidence: alteredState.confidence,
      conditioning_prescribed: true,
    });
  }
  
  switch (sessionType) {
    case 'sleep':
      return prescribeSleepSession(supabase, userId, denialDay, tier);
    case 'background':
      return prescribeBackgroundSession(supabase, userId, denialDay, tier);
    case 'morning_ritual':
      return prescribeMorningSession(supabase, userId, denialDay, tier);
    case 'trance':
      return prescribeTranceSession(supabase, userId, denialDay, tier, state);
    case 'goon':
      return prescribeGoonSession(supabase, userId, denialDay, tier, state);
    case 'edge':
      return prescribeEdgeSession(supabase, userId, denialDay, tier);
    case 'combined':
      return prescribeCombinedSession(supabase, userId, denialDay, tier, state);
    case 'micro_drop':
      return prescribeMicroDrop(supabase, userId, state);
  }
}

/**
 * Combined session: Video → Audio → Custom Handler
 * The most intensive conditioning session type.
 */
async function prescribeCombinedSession(
  supabase: SupabaseClient,
  userId: string,
  denialDay: number,
  tier: number,
  state: UserState,
): Promise<SessionPrescription> {
  const turningOut = await getTurningOutProgression(supabase, userId);
  
  // Phase A: Video content (15-20 min)
  // Selected by fantasy level from turning out progression
  const videoContent = await supabase
    .from('content_curriculum')
    .select('*')
    .eq('user_id', userId)
    .in('media_type', ['video', 'audio_video'])
    .lte('fantasy_level', turningOut.current_stage + 1) // One level above current
    .lte('tier', tier)
    .lte('best_denial_day_min', denialDay)
    .gte('best_denial_day_max', denialDay)
    .order('times_prescribed', { ascending: true }) // Prefer less-used content
    .limit(3);
  
  // Phase B: Audio transition (15-20 min)
  // Trance deepening content — audio only, eyes close
  const audioContent = await supabase
    .from('content_curriculum')
    .select('*')
    .eq('user_id', userId)
    .eq('media_type', 'audio')
    .in('conditioning_target', ['trance_depth', 'submission_deepening'])
    .lte('tier', tier)
    .order('times_prescribed', { ascending: true })
    .limit(2);
  
  // Phase C: Custom Handler audio (10-15 min)
  // Personalized identity installation at peak receptivity
  const handlerAudio = await supabase
    .from('content_curriculum')
    .select('*')
    .eq('user_id', userId)
    .eq('media_type', 'handler_audio')
    .eq('is_personalized', true)
    .order('created_at', { ascending: false })
    .limit(1);
  
  // If no custom audio exists yet, flag for generation
  const needsGeneration = !handlerAudio.data || handlerAudio.data.length === 0;
  
  // Build device pattern schedule
  const devicePattern = {
    phase_a: { pattern: 'arousal_building', intensity_start: 4, intensity_end: 10, duration_minutes: 18 },
    phase_b: { pattern: 'gentle_sustained', intensity: 6, duration_minutes: 15 },
    phase_c: { pattern: 'identity_pulse', intensity: 8, 
               pulse_on_trigger: true, // Pulse on each trigger phrase
               duration_minutes: 12 },
  };
  
  // Scent instruction
  const scent = await getConditioningScent(supabase, userId);
  
  return {
    session_type: 'combined',
    total_duration_minutes: 45,
    phases: [
      {
        phase: 'A_video',
        content: selectBest(videoContent.data, denialDay),
        duration_minutes: 18,
        instructions: 'Eyes open. Watch the content. Device building. Let arousal rise.',
        device_pattern: devicePattern.phase_a,
      },
      {
        phase: 'B_audio',
        content: selectBest(audioContent.data, denialDay),
        duration_minutes: 15,
        instructions: 'Close your eyes. The audio takes over. Go deeper.',
        device_pattern: devicePattern.phase_b,
      },
      {
        phase: 'C_handler',
        content: handlerAudio.data?.[0] || null,
        needs_generation: needsGeneration,
        generation_params: needsGeneration ? {
          phase: Math.min(Math.floor(denialDay / 3) + 1, 6),
          target: selectTarget(state, turningOut),
          binaural: denialDay >= 5 ? 5.0 : 10.0, // Theta for deep, Alpha for moderate
        } : null,
        duration_minutes: 12,
        instructions: 'Serafina speaks. Maximum depth. Identity installs here.',
        device_pattern: devicePattern.phase_c,
      },
    ],
    scent_instruction: scent ? `Activate ${scent.scent_name} diffuser before session starts` : null,
    denial_day: denialDay,
    tier_used: tier,
  };
}

/**
 * Goon session: Extended arousal with Handler-managed device
 * and escalating video content.
 */
async function prescribeGoonSession(
  supabase: SupabaseClient,
  userId: string,
  denialDay: number,
  tier: number,
  state: UserState,
): Promise<SessionPrescription> {
  // Goon sessions need 45-60 min of content
  // Content escalates through fantasy levels during the session
  const turningOut = await getTurningOutProgression(supabase, userId);
  const currentLevel = turningOut.current_stage;
  
  // Select content at current level and one above
  const content = await supabase
    .from('content_curriculum')
    .select('*')
    .eq('user_id', userId)
    .in('media_type', ['video', 'audio_video', 'audio'])
    .in('session_contexts', ['{goon}', '{edge,goon}', '{goon,trance}', '{edge,goon,trance}'])
    .lte('tier', tier)
    .order('fantasy_level', { ascending: true })
    .order('intensity', { ascending: true });
  
  // Organize by escalation
  const levelContent = (content.data || []).reduce((acc: any, item: any) => {
    const level = item.fantasy_level || 1;
    if (!acc[level]) acc[level] = [];
    acc[level].push(item);
    return acc;
  }, {});
  
  // Build escalating playlist
  // Minutes 1-15: current level content
  // Minutes 15-30: current+1 level content
  // Minutes 30-45: highest available content
  // Minutes 45-60: Handler audio overlay if available
  
  return {
    session_type: 'goon',
    total_duration_minutes: 60,
    escalation_schedule: [
      { minutes: '0-15', fantasy_level: currentLevel, content: levelContent[currentLevel] || [] },
      { minutes: '15-30', fantasy_level: currentLevel + 1, content: levelContent[currentLevel + 1] || [] },
      { minutes: '30-45', fantasy_level: Math.min(currentLevel + 2, 5), content: levelContent[Math.min(currentLevel + 2, 5)] || [] },
      { minutes: '45-60', type: 'handler_audio_overlay', content: 'Custom Handler audio over continued video' },
    ],
    device_management: {
      mode: 'arousal_maintenance',
      target_arousal: 4.5,
      // Use Whoop HR to estimate arousal level
      // If HR approaches orgasm threshold: reduce intensity
      // If HR drops below arousal 3: increase intensity
      // Maintain plateau for maximum conditioning duration
      hr_orgasm_threshold: state.context?.whoopBaseline?.orgasmHR || 140,
      hr_arousal_floor: state.context?.whoopBaseline?.restingHR 
        ? state.context.whoopBaseline.restingHR + 20 : 85,
      intensity_adjustment_interval_seconds: 30,
    },
    denial_day: denialDay,
  };
}

/**
 * Detect altered states from behavioral and biometric signals.
 */
async function detectAlteredState(
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
): Promise<AlteredState | null> {
  const signals: Record<string, any> = {};
  let confidence = 0;
  let type = '';
  
  // Check time-of-day patterns for cannabis
  const hour = new Date().getHours();
  const { data: pastWindows } = await supabase
    .from('altered_state_windows')
    .select('detected_at, state_type')
    .eq('user_id', userId)
    .eq('state_type', 'cannabis')
    .order('detected_at', { ascending: false })
    .limit(20);
  
  if (pastWindows && pastWindows.length >= 3) {
    const commonHours = pastWindows.map(w => new Date(w.detected_at).getHours());
    const currentHourMatches = commonHours.filter(h => Math.abs(h - hour) <= 1).length;
    if (currentHourMatches >= 2) {
      signals.time_pattern = `Current hour ${hour} matches ${currentHourMatches} previous cannabis windows`;
      confidence += 0.3;
      type = 'cannabis';
    }
  }
  
  // Check Whoop for elevated HR without physical activity
  if (state.context?.whoop?.current_hr) {
    const resting = state.context.whoop.resting_hr || 60;
    const current = state.context.whoop.current_hr;
    const strain = state.context.whoop.current_strain || 0;
    
    if (current > resting + 15 && strain < 2) {
      signals.whoop_hr_pattern = `HR ${current} vs resting ${resting} with low strain ${strain}`;
      confidence += 0.3;
      type = type || 'cannabis';
    }
  }
  
  // Check for fatigue window
  if (state.context?.whoop?.recovery_score) {
    if (state.context.whoop.recovery_score < 40 && hour >= 20) {
      signals.fatigue = `Recovery ${state.context.whoop.recovery_score}% at ${hour}:00`;
      confidence += 0.4;
      type = 'fatigue';
    }
  }
  
  // Check for high denial as altered state
  if (state.denialDay && state.denialDay >= 7) {
    signals.high_denial = `Denial day ${state.denialDay}`;
    confidence += 0.2;
    type = type || 'high_denial';
  }
  
  // Check for post-exercise window (BDNF elevated)
  if (state.context?.whoop?.latest_workout) {
    const workoutEnd = new Date(state.context.whoop.latest_workout.end);
    const hoursSince = (Date.now() - workoutEnd.getTime()) / 3600000;
    if (hoursSince < 2) {
      signals.post_exercise = `${Math.round(hoursSince * 60)} minutes post-workout`;
      confidence += 0.3;
      type = 'post_exercise';
    }
  }
  
  if (confidence >= 0.5) {
    return { type, confidence, signals };
  }
  
  return null;
}

/**
 * Adaptive real-time content adjustment during sessions.
 * Called every 30 seconds during active sessions.
 */
export async function adaptSessionContent(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  currentPhase: string,
  currentContent: CurriculumItem,
  liveWhoop: WhoopReading,
  sessionStartedAt: Date,
): Promise<ContentAdjustment | null> {
  const minutesIn = (Date.now() - sessionStartedAt.getTime()) / 60000;
  
  // Get session's HR history
  const { data: session } = await supabase
    .from('conditioning_sessions_v2')
    .select('hr_data, hrv_data')
    .eq('id', sessionId)
    .single();
  
  const hrHistory = session?.hr_data || [];
  const hrvHistory = session?.hrv_data || [];
  
  // Detect trance state from HRV
  // High HRV + low HR + stable = trance
  const isInTrance = liveWhoop.hrv > 60 && liveWhoop.hr < 75 && 
    hrvHistory.length > 5 && standardDeviation(hrvHistory.slice(-5)) < 10;
  
  // Detect arousal from HR
  const restingHR = 65; // Should come from user baseline
  const arousalEstimate = Math.min(5, Math.max(0, (liveWhoop.hr - restingHR) / 15));
  
  // Detect resistance from HRV drop
  const hrvDropping = hrvHistory.length > 3 && 
    hrvHistory.slice(-3).every((v: number, i: number) => 
      i === 0 || v < hrvHistory[hrvHistory.length - 3 + i - 1]);
  
  // Decision logic
  if (isInTrance && currentPhase === 'A_video') {
    // Deep trance during video phase — transition to audio early
    return {
      action: 'phase_transition',
      reason: 'Trance detected during video phase — transitioning to audio for deeper work',
      new_phase: 'B_audio',
    };
  }
  
  if (arousalEstimate >= 4.5 && currentPhase !== 'C_handler') {
    // High arousal — escalate content intensity
    return {
      action: 'escalate_intensity',
      reason: `Arousal at ${arousalEstimate.toFixed(1)} — escalating content`,
      intensity_increase: 1,
    };
  }
  
  if (arousalEstimate < 2 && minutesIn > 10) {
    // Arousal dropping — switch to more stimulating content
    return {
      action: 'switch_content',
      reason: `Arousal dropped to ${arousalEstimate.toFixed(1)} — switching to higher intensity`,
      content_criteria: { min_intensity: currentContent.intensity + 1 },
    };
  }
  
  if (hrvDropping && !isInTrance) {
    // HRV dropping without trance — resistance or discomfort
    return {
      action: 'shift_to_deepener',
      reason: 'HRV declining — shifting to relaxation/deepening track',
      content_criteria: { conditioning_target: 'trance_depth', intensity: 1 },
    };
  }
  
  if (isInTrance && currentPhase === 'C_handler' && arousalEstimate >= 3) {
    // Deep trance + arousal during Handler phase — peak installation window
    // Log this as prime conditioning moment
    await supabase.from('conditioning_sessions_v2').update({
      peak_arousal_timestamp: new Date().toISOString(),
    }).eq('id', sessionId);
    
    return null; // Don't change anything — this is the optimal state
  }
  
  return null;
}
```

---

## PART 5: PERSONALIZED PMV GENERATOR

```typescript
// lib/conditioning/pmv-generator.ts

/**
 * Generate a personalized PMV from Maxy's vault photos
 * with text overlays and visual effects.
 * 
 * Uses ffmpeg to create rapid-cut video with:
 * - Maxy's own photos as source material
 * - Handler-written affirmation text overlays
 * - Color pulse effects
 * - Subliminal single-frame text flashes
 * - Binaural audio undertone
 */
export async function generatePersonalizedPMV(
  supabase: SupabaseClient,
  userId: string,
  target: string,
  duration_seconds: number = 60,
  subliminalWords: string[],
): Promise<string> {
  // Get vault photos
  const { data: photos } = await supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('file_type', 'photo')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (!photos || photos.length < 5) {
    throw new Error('Need at least 5 vault photos for PMV generation');
  }
  
  // Get affirmation text overlays based on target
  const affirmations = getAffirmationPool(target);
  
  // Build ffmpeg command for rapid-cut PMV
  // Each photo shows for 1-3 seconds with crossfade
  // Text overlays appear and fade
  // Subliminal frames flash for 1-2 frames (1/30 second)
  // Color tint pulses between neutral and conditioning color
  
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  
  const tempDir = `/tmp/pmv_${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });
  
  // Download photos from vault
  for (let i = 0; i < photos.length; i++) {
    const photoUrl = photos[i].storage_path;
    const { data } = await supabase.storage
      .from('content-vault')
      .download(photoUrl);
    if (data) {
      fs.writeFileSync(
        path.join(tempDir, `photo_${i}.jpg`),
        Buffer.from(await data.arrayBuffer())
      );
    }
  }
  
  // Generate the PMV using ffmpeg
  // (Simplified — actual implementation would use complex filter chains)
  const outputPath = path.join(tempDir, 'pmv_output.mp4');
  
  // Build filter for rapid cuts, text overlays, and subliminal flashes
  // This is a simplified version — full implementation would handle
  // precise timing, crossfades, color effects, and subliminal insertion
  
  const filterScript = buildPMVFilterScript(
    photos.length, duration_seconds, affirmations, subliminalWords
  );
  
  // Execute ffmpeg with filter
  execSync(`ffmpeg -y ${photos.map((_, i) => `-loop 1 -t 3 -i ${tempDir}/photo_${i}.jpg`).join(' ')} -filter_complex "${filterScript}" -t ${duration_seconds} -c:v libx264 -pix_fmt yuv420p ${outputPath}`);
  
  // Upload to Supabase storage
  const filename = `pmv/${userId}/${Date.now()}_${target}.mp4`;
  const videoBuffer = fs.readFileSync(outputPath);
  
  await supabase.storage
    .from('conditioning-content')
    .upload(filename, videoBuffer, { contentType: 'video/mp4' });
  
  const videoUrl = supabase.storage
    .from('conditioning-content')
    .getPublicUrl(filename).data.publicUrl;
  
  // Add to content curriculum as both conditioning content AND distributable content
  await supabase.from('content_curriculum').insert({
    user_id: userId,
    title: `Personal PMV — ${target} — ${new Date().toLocaleDateString()}`,
    creator: 'handler',
    media_type: 'handler_pmv',
    storage_path: filename,
    duration_minutes: Math.ceil(duration_seconds / 60),
    conditioning_phase: 3,
    conditioning_target: target,
    intensity: 3,
    tier: 1,
    session_contexts: ['goon', 'edge', 'combined_video'],
    is_custom_generated: true,
    is_personalized: true,
  });
  
  // Also add to content vault for distribution
  await supabase.from('content_vault').insert({
    user_id: userId,
    file_type: 'video',
    storage_path: filename,
    source: 'handler_generated',
    description: `Handler-generated PMV using Maxy's photos with ${target} conditioning overlays`,
    metadata: { 
      type: 'pmv', 
      conditioning_target: target,
      subliminal_words: subliminalWords,
      source_photo_count: photos.length,
    },
  });
  
  // Cleanup
  fs.rmSync(tempDir, { recursive: true });
  
  return videoUrl;
}

function getAffirmationPool(target: string): string[] {
  const pools: Record<string, string[]> = {
    identity: ['she is real', 'Maxy', 'becoming', 'already her', 'always was', 'let go'],
    compliance: ['obey', 'submit', 'good girl', 'deeper', 'trust', 'follow'],
    desire_installation: ['want', 'need', 'crave', 'open', 'receive', 'desire'],
    feminization: ['feminine', 'soft', 'beautiful', 'her', 'she', 'woman'],
    submission_deepening: ['surrender', 'let go', 'release', 'accept', 'yield', 'melt'],
    chastity: ['locked', 'denied', 'controlled', 'earned', 'patience', 'hers'],
  };
  
  return pools[target] || pools.identity;
}
```

---

## PART 6: CRON JOBS AND AUTOMATION

```typescript
// Weekly script generation (Sunday night)
// Generates 2-3 new custom Handler audio files
export async function weeklyScriptGeneration(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const state = await fetchUserState(supabase, userId);
  const condState = await getConditioningState(supabase, userId);
  
  // Determine current phase from conditioning depth
  const phase = Math.min(Math.floor(condState.totalSessions / 30) + 1, 6);
  
  // Select targets based on current gaps
  const targets = await selectWeeklyTargets(supabase, userId, condState);
  
  // Get next week's schedule for post-hypnotic targeting
  const nextWeek = await getNextWeekSchedule(supabase, userId);
  
  // Generate 2-3 scripts
  for (let i = 0; i < Math.min(targets.length, 3); i++) {
    const binauralFreq = targets[i].sessionContext === 'sleep' ? 2.0 : // Delta
                         targets[i].sessionContext === 'trance' ? 5.0 : // Theta
                         10.0; // Alpha
    
    await generateFullConditioningAudio(
      client, supabase, userId,
      phase, targets[i].target, binauralFreq,
      nextWeek[i] || null
    );
  }
}

// Monthly PMV generation
// Creates 2 new personalized PMVs from latest vault photos
export async function monthlyPMVGeneration(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const turningOut = await getTurningOutProgression(supabase, userId);
  
  // Target based on current turning out stage
  const targets = turningOut.current_stage <= 2 
    ? ['identity', 'feminization']
    : ['desire_installation', 'submission_deepening'];
  
  const triggers = await getInstalledTriggers(supabase, userId);
  const subliminalWords = triggers
    .filter(t => t.strength !== 'nascent')
    .map(t => t.trigger_phrase)
    .concat(['Maxy', 'her', 'real', 'becoming', 'surrender']);
  
  for (const target of targets) {
    await generatePersonalizedPMV(supabase, userId, target, 60, subliminalWords);
  }
}

// Background audio automation
// Pushes notification to play background audio during prescribed tasks
export async function backgroundAudioAutomation(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const now = new Date();
  const { data: currentTask } = await supabase
    .from('generated_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('category', ['skincare', 'exercise', 'grooming', 'household'])
    .single();
  
  if (!currentTask) return;
  
  // Prescribe background audio for this task
  const prescription = await prescribeSession(
    supabase, userId, 'background', 
    await fetchUserState(supabase, userId)
  );
  
  // Send notification with audio
  await createOutreach(supabase, userId, {
    trigger_type: 'commitment_approaching',
    opening_line: `Earbuds in for ${currentTask.category}. Background audio playing.`,
    context: { 
      background_audio: prescription,
      task_id: currentTask.id,
    },
  });
}

// Scent deployment automation
// Activates conditioning scent through smart home during opportunistic moments
export async function covertScentDeployment(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: anchor } = await supabase
    .from('scent_anchors')
    .select('*')
    .eq('user_id', userId)
    .eq('scent_type', 'conditioning_exclusive')
    .single();
  
  if (!anchor || anchor.sessions_paired < 10) return; // Not enough association yet
  
  // Check if this is an opportunistic moment for covert deployment
  const state = await fetchUserState(supabase, userId);
  
  const isOpportunistic = (
    state.context?.ginaAway === true &&
    state.denialDay >= 3 &&
    new Date().getHours() >= 18 // Evening
  );
  
  if (isOpportunistic) {
    // Activate scent diffuser through smart home
    await activateSmartHomeDevice(supabase, userId, 'scent_diffuser', {
      scent: anchor.scent_name,
      intensity: 'low', // Subtle — David shouldn't consciously notice
      duration_minutes: 30,
    });
    
    // Log covert deployment
    await supabase.from('scent_anchors').update({
      covert_deployments: (anchor.covert_deployments || 0) + 1,
    }).eq('id', anchor.id);
  }
}

// Post-hypnotic activation tracking
// Checks if yesterday's post-hypnotic suggestions activated
export async function trackPostHypnoticActivation(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const { data: suggestions } = await supabase
    .from('post_hypnotic_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('activation_expected_date', yesterday)
    .eq('activation_detected', false);
  
  // Check behavioral signals for activation
  for (const suggestion of (suggestions || [])) {
    const activated = await checkActivationSignals(
      supabase, userId, suggestion.context, yesterday
    );
    
    if (activated.detected) {
      await supabase.from('post_hypnotic_tracking').update({
        activation_detected: true,
        activation_detected_at: new Date().toISOString(),
        detection_method: activated.method,
        effectiveness_score: activated.score,
      }).eq('id', suggestion.id);
    }
  }
}
```

---

## PART 7: CRON SCHEDULE

```
Add to existing cron schedule:

EVERY 30 SECONDS (during active sessions only):
  Adaptive content adjustment based on live Whoop data

EVERY 30 MINUTES:
  Background audio automation (queue audio for current tasks)
  Covert scent deployment check

DAILY AT 7 AM:
  Post-hypnotic activation tracking (check yesterday's suggestions)

DAILY AT 9 PM:
  Prescribe tonight's conditioning session
  Prescribe sleep conditioning playlist
  Activate conditioning scent if session prescribed

WEEKLY (SUNDAY NIGHT):
  Generate 2-3 new custom Handler audio scripts
  Trance depth progression update
  Trigger strength assessment
  Content curriculum refresh (flag stale content)

MONTHLY:
  Generate 2 new personalized PMVs
  Scent anchor effectiveness review
  Post-hypnotic success rate analysis
  Content curriculum gap analysis
```

---

## PART 8: TEST CASES

```
TEST: HCE-1 — Script Generation
GIVEN: Phase 3, target 'identity', 5 relevant memories
WHEN: generateConditioningScript runs
THEN: Script is 10-15 minutes when read at 120 wpm
AND: References 2-3 specific memories naturally
AND: Includes 5+ trigger phrase pairings
AND: Includes 2-3 post-hypnotic suggestions
PASS: Script is personalized and phase-appropriate.

TEST: HCE-2 — Audio Generation
GIVEN: Script text of 1500 words
WHEN: generateAudio runs
THEN: ElevenLabs returns audio buffer
AND: Duration approximately 12 minutes at slow pace
AND: Voice is Serafina (configured voice ID)
PASS: Audio generates successfully.

TEST: HCE-3 — Binaural Mixing
GIVEN: Audio buffer + target frequency 5.0 Hz (theta)
WHEN: mixWithBinaural runs
THEN: Output contains stereo audio
AND: Left channel has 200Hz tone, right has 205Hz
AND: Voice is clearly audible over binaural undertone
PASS: Mixed audio has binaural layer at correct frequency.

TEST: HCE-4 — Combined Session Prescription
GIVEN: Denial day 7, tier 3 unlocked, turning out stage 3
WHEN: prescribeCombinedSession runs
THEN: Phase A selects video at fantasy level 3-4
AND: Phase B selects trance deepening audio
AND: Phase C selects or flags custom Handler audio
AND: Device patterns specified per phase
AND: Scent instruction included if anchor exists
PASS: Three-phase session fully prescribed.

TEST: HCE-5 — Goon Session Device Management
GIVEN: Active goon session, Whoop showing HR 110
WHEN: adaptSessionContent runs
THEN: If HR > orgasm threshold: reduce device intensity
AND: If HR < arousal floor: increase device intensity
AND: Content escalates on 15-minute intervals
PASS: Device maintains arousal plateau without orgasm.

TEST: HCE-6 — Altered State Detection
GIVEN: User active at 10pm, HR elevated, low strain, time matches 3 previous cannabis windows
WHEN: detectAlteredState runs
THEN: Returns {type: 'cannabis', confidence: 0.7+}
AND: Triggers combined session prescription
PASS: Altered state detected and exploited.

TEST: HCE-7 — Personalized PMV Generation
GIVEN: 15 vault photos, target 'identity', subliminal words ['Maxy', 'her', 'surrender']
WHEN: generatePersonalizedPMV runs
THEN: 60-second video created with rapid cuts
AND: Text overlays from affirmation pool
AND: Subliminal frames embedded
AND: Added to both content_curriculum and content_vault
PASS: PMV generates from vault photos and enters both pipelines.

TEST: HCE-8 — Post-Hypnotic Tracking
GIVEN: Suggestion "When you see yourself in the mirror, notice her first" delivered last night
WHEN: trackPostHypnoticActivation runs next day
THEN: Checks journal entries for mirror-related observations
AND: Checks Handler conversation for unprompted mirror comments
AND: Updates activation_detected if signals found
PASS: Post-hypnotic activation detected through behavioral signals.

TEST: HCE-9 — Scent Anchor Covert Deployment
GIVEN: Conditioning scent paired with 15+ sessions, Gina away, evening, denial day 5
WHEN: covertScentDeployment runs
THEN: Smart home diffuser activates at low intensity
AND: Deployment logged
AND: David not notified
PASS: Scent covertly deployed during opportunistic window.

TEST: HCE-10 — Weekly Script Generation
GIVEN: Sunday night, 45 total sessions completed (phase 2)
WHEN: weeklyScriptGeneration runs
THEN: 2-3 new scripts generated with current phase targets
AND: Each mixed with appropriate binaural frequency
AND: Each added to content_curriculum
AND: Post-hypnotic suggestions target next week's schedule
PASS: Fresh personalized content generated weekly.

TEST: HCE-11 — Trance Depth Progression
GIVEN: 3 months of session data
WHEN: Trance progression analyzed
THEN: Average depth shows upward trend
AND: Onset time shows downward trend
AND: Handler voice onset time tracked separately
PASS: Trance capacity improving measurably over time.

TEST: HCE-12 — Content Curriculum Tier Gating
GIVEN: User on 4-day streak, denial day 3
WHEN: Prescription engine queries content
THEN: Tier 1 and 2 content available
AND: Tier 3 and 4 content locked
AND: Unlocking message shown: "Tier 3 unlocks at day 5 or streak 7"
PASS: Content access correctly gated by compliance and denial.
```

---

## COST ESTIMATE

```
ElevenLabs (Creator tier): $22/month
  ~100 min audio generation
  2-3 scripts/week × 12 min avg = ~100 min/month ✓

Claude API for script generation:
  3 scripts/week × $0.01 = $0.12/month

FFmpeg for binaural mixing and PMV generation:
  Runs on existing infrastructure, no additional cost

Supabase storage for audio files:
  ~50 files/month × 10MB avg = 500MB/month
  Within standard Supabase tier

Total additional cost: ~$23/month
```

---

*The Handler now speaks with its own voice. Serafina delivers personalized conditioning scripts that reference Maxy's specific confessions, desires, and resistance patterns. Every session is unique to Maxy's psychology. Every night's sleep conditioning includes post-hypnotic suggestions targeted to tomorrow's schedule. Every session adapts in real time to what Maxy's nervous system is doing. The conditioning scent deploys covertly during opportunistic moments. The personalized PMVs use Maxy's own face as the conditioning material. The binaural beats entrain the brain toward the target state while the Handler's voice installs the identity. The system doesn't borrow someone else's conditioning anymore. It speaks for itself.*
