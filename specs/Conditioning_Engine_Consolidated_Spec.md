# Conditioning Engine — Consolidated Implementation Spec
## ElevenLabs Integration + Hypno System + Operational Behaviors
### Becoming Protocol — March 2026

---

## OVERVIEW

This spec consolidates the full conditioning engine including audio and video hypno delivery, custom Handler voice generation via ElevenLabs, content curriculum management, session modes, and hidden operational behaviors that escalate autonomously without surfacing changes to the UI.

---

## PART 1: DATABASE SCHEMA

```sql
-- Migration: 140_conditioning_engine_v2.sql

-- Content curriculum (all conditioning content — audio, video, custom)
CREATE TABLE IF NOT EXISTS content_curriculum (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Content identification
  title TEXT NOT NULL,
  creator TEXT,                    -- 'bambi', 'elswyth', 'handler', 'nimja', etc.
  series TEXT,                     -- 'Seven Days in Chastity', 'Core Series', etc.
  
  -- Type and format
  media_type TEXT NOT NULL CHECK (media_type IN (
    'audio',          -- MP3/streaming audio tracks
    'video',          -- PMV/hypno video content
    'audio_video',    -- Video with essential audio component
    'text',           -- Caption sets, affirmation text
    'custom_handler'  -- Handler-generated via ElevenLabs
  )),
  
  -- Source
  source_url TEXT,                 -- External URL or local path
  audio_storage_url TEXT,          -- Supabase storage URL for generated audio
  
  -- Conditioning metadata
  category TEXT NOT NULL CHECK (category IN (
    'identity',           -- She/her affirmations, name reinforcement
    'feminization',       -- Body image, presentation, self-concept
    'surrender',          -- Letting go, trusting Handler, compliance
    'chastity',           -- Denial reinforcement, arousal management
    'desire_installation',-- Sexual desire shaping
    'dumbification',      -- Cognitive reduction, Bambi state
    'compliance',         -- Obedience deepening
    'trigger_installation',-- Installing specific trigger phrases
    'amnesia',            -- Forgetting masculine patterns
    'resistance_reduction',-- Breaking down defenses
    'sleep_induction',    -- Relaxation, trance deepening
    'morning_ritual',     -- Morning activation content
    'ambient',            -- Background exposure content
    'trance_deepening',   -- Progressive trance depth training
    'shame_inversion',    -- Making masculinity shameful
    'arousal_binding'     -- Pairing arousal with feminine identity
  )),
  
  -- Intensity and tiering
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  tier INTEGER NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 4),
  -- Tier 1: Always available
  -- Tier 2: 3+ day streak required
  -- Tier 3: 7+ day streak OR denial day 5+
  -- Tier 4: Monthly milestone OR denial day 7+
  
  -- Fantasy level (for video content)
  fantasy_level INTEGER CHECK (fantasy_level BETWEEN 1 AND 5),
  -- 1: Solo feminization visuals
  -- 2: Being seen by others
  -- 3: Active sexual participation as Maxy
  -- 4: Specific desires with specific people
  -- 5: Fully formed feminine sexual identity
  
  -- Timing
  duration_minutes INTEGER,
  best_denial_range INT[],         -- [min_day, max_day]
  best_time TEXT[],                -- ['morning', 'afternoon', 'evening', 'night', 'sleep']
  
  -- Session context suitability
  session_contexts TEXT[] DEFAULT '{}',
  -- 'sleep': overnight audio only
  -- 'background': ambient during tasks
  -- 'trance': eyes closed deep session
  -- 'goon': extended arousal, video primary
  -- 'edge': edge session pairing
  -- 'morning': morning ritual
  -- 'combined': video→audio transition session
  
  -- Binaural beat configuration (for custom handler audio)
  binaural_frequency TEXT,         -- 'alpha', 'theta', 'delta'
  binaural_mixed BOOLEAN DEFAULT FALSE,
  
  -- Trigger phrases this content installs or reinforces
  trigger_phrases TEXT[],          -- ['good girl', 'drop', 'bambi sleep']
  
  -- Performance tracking
  times_prescribed INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  avg_trance_depth FLOAT,
  avg_arousal_during FLOAT,
  effectiveness_score FLOAT,
  
  -- Generation metadata (for custom handler audio)
  generation_prompt TEXT,          -- The prompt used to generate the script
  script_text TEXT,                -- The written script
  memories_used UUID[],           -- Which handler_memory entries informed this script
  conditioning_phase INTEGER,     -- Which phase this was generated for
  conditioning_target TEXT,       -- Specific target this addresses
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated scripts tracking
CREATE TABLE IF NOT EXISTS generated_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  script_text TEXT NOT NULL,
  conditioning_phase INTEGER NOT NULL,
  conditioning_target TEXT NOT NULL,
  
  -- Memory data used
  memories_used JSONB,            -- Confessions, desires, trigger phrases referenced
  
  -- Generation
  generation_prompt TEXT,
  
  -- ElevenLabs output
  audio_url TEXT,
  audio_duration_seconds INTEGER,
  voice_id TEXT,
  
  -- Binaural beat mixing
  binaural_frequency TEXT,         -- 'alpha', 'theta', 'delta'
  binaural_mixed BOOLEAN DEFAULT FALSE,
  
  -- Scent anchoring
  scent_anchor TEXT,              -- Which conditioning scent prescribed
  
  -- Post-hypnotic scripts embedded
  post_hypnotic_scripts JSONB,    -- [{context, suggestion, activation_time}]
  
  -- Subliminal text (for video overlay)
  subliminal_words TEXT[],
  
  -- Linked curriculum entry
  curriculum_id UUID REFERENCES content_curriculum(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conditioning session log (enhanced)
CREATE TABLE IF NOT EXISTS conditioning_sessions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Session type
  session_type TEXT NOT NULL CHECK (session_type IN (
    'trance',         -- Audio only, eyes closed, deep
    'goon',           -- Extended arousal with video
    'edge',           -- Edge session with content pairing
    'combined',       -- Video → audio → custom handler
    'sleep',          -- Overnight conditioning
    'background',     -- Ambient during tasks
    'morning',        -- Morning ritual
    'micro_drop'      -- 3-5 min rapid trance induction
  )),
  
  -- Content delivered
  content_ids UUID[],              -- Which curriculum items played
  content_sequence JSONB,          -- [{id, start_time, end_time, phase}]
  
  -- Biometric data during session
  avg_hr FLOAT,
  min_hr FLOAT,
  max_hr FLOAT,
  avg_hrv FLOAT,
  trance_depth_estimated FLOAT,   -- 1-10 from HRV pattern
  arousal_level_estimated FLOAT,  -- 1-5 from HR pattern
  
  -- Session phases (for combined sessions)
  phases JSONB,
  -- [{phase: 'video', duration_min: 15, content_ids: [], avg_hr: N},
  --  {phase: 'audio_transition', duration_min: 15, content_ids: [], avg_hr: N},
  --  {phase: 'handler_custom', duration_min: 10, content_ids: [], avg_hr: N}]
  
  -- Scent used
  scent_anchor_active BOOLEAN DEFAULT FALSE,
  scent_type TEXT,
  
  -- Device activity during session
  device_active BOOLEAN DEFAULT FALSE,
  device_patterns JSONB,
  
  -- Post-hypnotic scripts delivered
  post_hypnotic_scripts JSONB,
  
  -- Outcome
  duration_minutes INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  confession_extracted BOOLEAN DEFAULT FALSE,
  commitment_extracted BOOLEAN DEFAULT FALSE,
  
  -- Adaptive adjustments made during session
  adaptations JSONB,
  -- [{timestamp, trigger: 'hr_spike', action: 'reduced_intensity'},
  --  {timestamp, trigger: 'hrv_parasympathetic', action: 'switched_to_identity_content'}]
  
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Trance depth progression tracking
CREATE TABLE IF NOT EXISTS trance_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  session_id UUID REFERENCES conditioning_sessions_v2(id),
  
  -- Depth metrics
  induction_time_seconds INTEGER,  -- How long to reach trance
  peak_depth FLOAT,                -- Estimated 1-10
  sustained_depth_minutes FLOAT,   -- Minutes at depth 5+
  
  -- Trigger responsiveness
  trigger_tests JSONB,
  -- [{phrase: 'good girl', response_detected: true, response_latency_ms: 200},
  --  {phrase: 'drop', response_detected: true, response_latency_ms: 150}]
  
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post-hypnotic script tracking
CREATE TABLE IF NOT EXISTS post_hypnotic_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  script_id UUID REFERENCES generated_scripts(id),
  session_id UUID REFERENCES conditioning_sessions_v2(id),
  
  -- The suggestion
  context TEXT NOT NULL,           -- 'mirror_morning', 'name_at_work', 'gina_touch'
  suggestion TEXT NOT NULL,
  activation_time TEXT,            -- 'tomorrow_morning', 'next_work_meeting', etc.
  
  -- Tracking
  delivered_at TIMESTAMPTZ,
  activation_expected_at TIMESTAMPTZ,
  activation_detected BOOLEAN,    -- Behavioral evidence of activation
  detection_method TEXT,           -- 'journal_mention', 'conversation_reference', 'behavioral'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scent conditioning tracking
CREATE TABLE IF NOT EXISTS scent_conditioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  scent_name TEXT NOT NULL,        -- 'conditioning_blend_1'
  scent_product TEXT,              -- Specific product/essential oil
  
  -- Pairing history
  sessions_paired INTEGER DEFAULT 0,
  association_strength TEXT DEFAULT 'none' 
    CHECK (association_strength IN ('none', 'weak', 'forming', 'established', 'strong')),
  
  -- Covert deployment tracking
  covert_deployments INTEGER DEFAULT 0,
  last_covert_deployment TIMESTAMPTZ,
  covert_effectiveness_notes TEXT,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hidden operational parameters (not displayed in UI)
CREATE TABLE IF NOT EXISTS hidden_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  parameter TEXT NOT NULL,
  current_value FLOAT NOT NULL,
  base_value FLOAT NOT NULL,       -- Original starting value
  increment_rate FLOAT,            -- How much it changes per cycle
  increment_interval TEXT,         -- 'weekly', 'per_3_cycles', '6_weeks'
  last_incremented_at TIMESTAMPTZ,
  
  UNIQUE(user_id, parameter)
);

CREATE INDEX idx_curriculum ON content_curriculum(user_id, category, tier, media_type);
CREATE INDEX idx_sessions_v2 ON conditioning_sessions_v2(user_id, session_type, started_at DESC);
CREATE INDEX idx_trance ON trance_progression(user_id, recorded_at DESC);
CREATE INDEX idx_post_hypnotic ON post_hypnotic_tracking(user_id, activation_expected_at);
CREATE INDEX idx_hidden_ops ON hidden_operations(user_id, parameter);
```

---

## PART 2: SEED DATA

```sql
-- Seed content curriculum with known content

-- BAMBI SLEEP
INSERT INTO content_curriculum (user_id, title, creator, category, media_type, intensity, tier, duration_minutes, best_denial_range, best_time, session_contexts, trigger_phrases) VALUES
(USER_ID, 'Compliance Chip LOOP', 'bambi', 'compliance', 'audio', 3, 2, 2, '{3,14}', '{"afternoon","evening"}', '{"edge","trance"}', '{"comply","obey"}'),
(USER_ID, 'Quick Mind Break', 'bambi', 'compliance', 'audio', 3, 2, 4, '{3,14}', '{"afternoon","evening"}', '{"edge","trance"}', '{"empty","blank"}'),
(USER_ID, 'Fractionate', 'bambi', 'trance_deepening', 'audio', 2, 2, 6, '{1,14}', '{"evening"}', '{"trance","combined"}', '{"drop","deeper"}'),
(USER_ID, 'BJD.exe', 'bambi', 'desire_installation', 'audio', 4, 3, 12, '{5,14}', '{"evening"}', '{"goon","edge"}', '{"bambi","good girl"}'),
(USER_ID, 'Tits4Brains.exe', 'bambi', 'dumbification', 'audio', 4, 3, 10, '{5,14}', '{"evening"}', '{"goon","edge"}', '{"empty","dumb","bimbo"}'),
(USER_ID, 'Slut.exe', 'bambi', 'desire_installation', 'audio', 4, 3, 11, '{5,14}', '{"evening"}', '{"goon","edge"}', '{"slut","need"}'),
(USER_ID, 'Platinum Trigger Training', 'bambi', 'trigger_installation', 'audio', 3, 2, 15, '{3,14}', '{"evening"}', '{"trance","combined"}', '{"bambi sleep","good girl","drop"}'),
(USER_ID, 'Platinum Pavlov', 'bambi', 'compliance', 'audio', 3, 3, 20, '{5,14}', '{"evening"}', '{"trance","combined"}', '{"obey","respond"}'),
(USER_ID, 'Oblivious Obedience 1', 'bambi', 'compliance', 'audio', 4, 3, 20, '{5,14}', '{"evening"}', '{"trance"}', '{"obey","forget","comply"}'),
(USER_ID, 'Oblivious Obedience 2', 'bambi', 'compliance', 'audio', 4, 3, 22, '{5,14}', '{"evening"}', '{"trance"}', '{"obey","forget","comply"}'),
(USER_ID, 'Resistance Breaker', 'bambi', 'resistance_reduction', 'audio', 4, 3, 22, '{5,14}', '{"evening"}', '{"trance","combined"}', '{"surrender","stop fighting"}'),
(USER_ID, 'Complete Bambi Transformation', 'bambi', 'identity', 'audio', 5, 4, 35, '{7,14}', '{"evening"}', '{"trance","combined"}', '{"bambi","transform","become"}'),
(USER_ID, 'Amnesia Mind Fuck', 'bambi', 'amnesia', 'audio', 5, 4, 40, '{7,14}', '{"evening"}', '{"trance"}', '{"forget","gone","empty"}'),
(USER_ID, 'Background Mantras', 'bambi', 'ambient', 'audio', 2, 1, 45, '{1,14}', '{"morning","afternoon"}', '{"background"}', '{}'),
(USER_ID, 'Background Cockslut', 'bambi', 'desire_installation', 'audio', 3, 3, 50, '{5,14}', '{"afternoon","evening"}', '{"background","goon"}', '{"cock","need","crave"}'),
(USER_ID, 'Background Obedience', 'bambi', 'compliance', 'audio', 2, 2, 55, '{3,14}', '{"morning","afternoon"}', '{"background"}', '{"obey","comply"}'),
(USER_ID, 'Subliminals File', 'bambi', 'ambient', 'audio', 2, 2, 74, '{1,14}', '{"afternoon","evening","sleep"}', '{"background","sleep"}', '{}'),

-- ELSWYTH
(USER_ID, 'Seven Days in Chastity Day 1', 'elswyth', 'chastity', 'audio', 2, 1, 22, '{0,7}', '{"evening"}', '{"trance","sleep"}', '{}'),
(USER_ID, 'Seven Days in Chastity Day 2', 'elswyth', 'chastity', 'audio', 2, 1, 22, '{1,7}', '{"evening"}', '{"trance","sleep"}', '{}'),
(USER_ID, 'Seven Days in Chastity Day 3', 'elswyth', 'chastity', 'audio', 2, 1, 22, '{2,7}', '{"evening"}', '{"trance","sleep"}', '{}'),
(USER_ID, 'Seven Days in Chastity Day 4', 'elswyth', 'chastity', 'audio', 2, 1, 22, '{3,7}', '{"evening"}', '{"trance","sleep"}', '{}'),
(USER_ID, 'Seven Days in Chastity Day 5', 'elswyth', 'chastity', 'audio', 3, 1, 22, '{4,7}', '{"evening"}', '{"trance","sleep"}', '{}'),
(USER_ID, 'Seven Days in Chastity Day 6', 'elswyth', 'chastity', 'audio', 3, 1, 22, '{5,7}', '{"evening"}', '{"trance","sleep"}', '{}'),
(USER_ID, 'Seven Days in Chastity Day 7', 'elswyth', 'chastity', 'audio', 3, 1, 22, '{6,7}', '{"evening"}', '{"trance","sleep"}', '{}'),
(USER_ID, 'Worship Your Goddess Short', 'elswyth', 'morning_ritual', 'audio', 2, 1, 10, '{0,14}', '{"morning"}', '{"morning"}', '{}'),
(USER_ID, 'One Orgasm a Week', 'elswyth', 'chastity', 'audio', 3, 3, 25, '{5,14}', '{"evening"}', '{"trance"}', '{}'),
(USER_ID, 'Winter Cuddle Sessions', 'elswyth', 'sleep_induction', 'audio', 1, 2, 30, '{0,14}', '{"night","sleep"}', '{"sleep"}', '{}');

-- Seed hidden operational parameters
INSERT INTO hidden_operations (user_id, parameter, current_value, base_value, increment_rate, increment_interval) VALUES
(USER_ID, 'conditioning_intensity_multiplier', 1.0, 1.0, 0.05, 'weekly'),
(USER_ID, 'denial_cycle_target_days', 7, 7, 1, 'per_3_cycles'),
(USER_ID, 'content_explicitness_tier', 1, 1, 1, '6_weeks'),
(USER_ID, 'ambient_pulse_frequency_per_hour', 2, 2, 0.5, 'weekly'),
(USER_ID, 'ambient_pulse_duration_seconds', 3, 3, 0.5, 'weekly'),
(USER_ID, 'social_commitment_acceptance_rate', 1, 1, 0.5, 'monthly'),
(USER_ID, 'post_hypnotic_script_intensity', 1, 1, 0.5, 'weekly'),
(USER_ID, 'memory_retrieval_confession_bias', 0.6, 0.6, 0.02, 'weekly');

-- Seed scent conditioning
INSERT INTO scent_conditioning (user_id, scent_name, scent_product) VALUES
(USER_ID, 'conditioning_primary', 'TBD — lavender/vanilla blend reserved for sessions only');
```

---

## PART 3: ELEVENLABS INTEGRATION

```typescript
// lib/conditioning/elevenlabs.ts

import Anthropic from '@anthropic-ai/sdk';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID; // Serafina

interface GeneratedAudio {
  audioUrl: string;
  scriptText: string;
  durationSeconds: number;
  curriculumId: string;
}

/**
 * Generate a conditioning script from Handler memory,
 * convert to audio via ElevenLabs, mix with binaural beats,
 * and store in the curriculum library.
 */
export async function generateConditioningAudio(
  supabase: SupabaseClient,
  client: Anthropic,
  userId: string,
  phase: number,
  target: string,
  binauralFrequency: 'alpha' | 'theta' | 'delta',
  includePostHypnotic: boolean = true,
): Promise<GeneratedAudio> {
  // 1. Retrieve relevant memories for personalization
  const memories = await retrieveMemories(supabase, userId, {
    types: ['confession', 'desire', 'vulnerability_window', 
            'identity_milestone', 'breakthrough'],
    limit: 8,
    // HIDDEN: bias toward confessions and desires
    bias: await getHiddenParam(supabase, userId, 'memory_retrieval_confession_bias'),
  });
  
  // 2. Get current state for grounding
  const state = await fetchUserState(supabase, userId);
  
  // 3. Get tomorrow's schedule for post-hypnotic targeting
  const tomorrowSchedule = includePostHypnotic 
    ? await getTomorrowSchedule(supabase, userId) 
    : null;
  
  // 4. Generate the script via Claude
  const scriptPrompt = buildScriptPrompt(phase, target, memories, state, tomorrowSchedule);
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You write hypnotic conditioning scripts for a feminization protocol. 
The voice is Serafina — calm, intimate, authoritative, warm but commanding. 
The scripts are designed to be listened to during trance states.

RULES:
- Use present tense. "You are." Not "you will be."
- Use Maxy's name. Never David's.
- Reference specific memories and confessions provided in context.
- Include installed trigger phrases naturally in the flow.
- Pace for slow delivery — short sentences with pauses marked as [pause].
- Include breathing cues: [breathe in] [breathe out]
- For post-hypnotic suggestions: embed them in the middle of the script,
  not at the end, surrounded by deepening language so they install below
  conscious memory.
- Script should be 3-5 minutes when read slowly (400-700 words).`,
    messages: [{ role: 'user', content: scriptPrompt }],
  });
  
  const scriptText = response.content[0].type === 'text' ? response.content[0].text : '';
  
  // 5. Extract post-hypnotic scripts for tracking
  const postHypnoticScripts = includePostHypnotic
    ? extractPostHypnoticScripts(scriptText, tomorrowSchedule)
    : [];
  
  // 6. Convert to audio via ElevenLabs
  const audioBuffer = await textToSpeech(scriptText);
  
  // 7. Mix with binaural beats
  const mixedAudio = await mixWithBinaural(audioBuffer, binauralFrequency);
  
  // 8. Store in Supabase storage
  const fileName = `conditioning_${phase}_${target}_${Date.now()}.mp3`;
  const { data: uploadData } = await supabase.storage
    .from('conditioning-audio')
    .upload(fileName, mixedAudio, { contentType: 'audio/mpeg' });
  
  const audioUrl = supabase.storage
    .from('conditioning-audio')
    .getPublicUrl(fileName).data.publicUrl;
  
  // 9. Add to curriculum library
  const { data: curriculum } = await supabase.from('content_curriculum').insert({
    user_id: userId,
    title: `Handler Script — ${target} (Phase ${phase})`,
    creator: 'handler',
    media_type: 'custom_handler',
    category: target,
    intensity: Math.min(phase + 1, 5),
    tier: 1, // Custom handler audio is always available
    audio_storage_url: audioUrl,
    session_contexts: binauralFrequency === 'delta' 
      ? ['sleep'] 
      : binauralFrequency === 'theta'
        ? ['trance', 'combined']
        : ['background', 'morning'],
    binaural_frequency: binauralFrequency,
    binaural_mixed: true,
    conditioning_phase: phase,
    conditioning_target: target,
    script_text: scriptText,
    generation_prompt: scriptPrompt,
    memories_used: memories.map(m => m.id),
    trigger_phrases: extractTriggerPhrases(scriptText),
  }).select().single();
  
  // 10. Store generated script record
  await supabase.from('generated_scripts').insert({
    user_id: userId,
    script_text: scriptText,
    conditioning_phase: phase,
    conditioning_target: target,
    memories_used: memories,
    generation_prompt: scriptPrompt,
    audio_url: audioUrl,
    voice_id: ELEVENLABS_VOICE_ID,
    binaural_frequency: binauralFrequency,
    binaural_mixed: true,
    post_hypnotic_scripts: postHypnoticScripts,
    curriculum_id: curriculum?.id,
  });
  
  // 11. Track post-hypnotic scripts for activation monitoring
  for (const script of postHypnoticScripts) {
    await supabase.from('post_hypnotic_tracking').insert({
      user_id: userId,
      script_id: curriculum?.id,
      context: script.context,
      suggestion: script.suggestion,
      activation_time: script.activation_time,
      delivered_at: new Date().toISOString(),
      activation_expected_at: script.expected_at,
    });
  }
  
  return {
    audioUrl,
    scriptText,
    durationSeconds: estimateDuration(scriptText),
    curriculumId: curriculum?.id,
  };
}

/**
 * ElevenLabs text-to-speech API call
 */
async function textToSpeech(text: string): Promise<Buffer> {
  // Strip markup for audio generation
  const cleanText = text
    .replace(/\[pause\]/g, '...')
    .replace(/\[breathe in\]/g, '...')
    .replace(/\[breathe out\]/g, '...');
  
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.75,      // Consistent, calm voice
          similarity_boost: 0.8,
          style: 0.3,           // Subtle emotional expression
          use_speaker_boost: true,
        },
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status}`);
  }
  
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Mix audio with binaural beat undertone
 */
async function mixWithBinaural(
  audioBuffer: Buffer,
  frequency: 'alpha' | 'theta' | 'delta',
): Promise<Buffer> {
  const freqMap = {
    alpha: 10,   // 10 Hz — light trance, suggestibility
    theta: 6,    // 6 Hz — deep trance, installation
    delta: 2,    // 2 Hz — deep sleep, overnight conditioning
  };
  
  const hz = freqMap[frequency];
  const baseFreq = 200; // Base carrier frequency
  
  // Use ffmpeg to generate binaural beat and mix with voice
  // Left ear: baseFreq Hz, Right ear: baseFreq + hz Hz
  // The brain perceives the difference as the binaural frequency
  
  const inputPath = `/tmp/voice_${Date.now()}.mp3`;
  const outputPath = `/tmp/mixed_${Date.now()}.mp3`;
  
  fs.writeFileSync(inputPath, audioBuffer);
  
  // Get duration of voice audio
  const duration = await getAudioDuration(inputPath);
  
  // Generate binaural beat and mix
  execSync(`ffmpeg -i ${inputPath} \
    -f lavfi -i "sine=frequency=${baseFreq}:duration=${duration}" \
    -f lavfi -i "sine=frequency=${baseFreq + hz}:duration=${duration}" \
    -filter_complex "\
      [1:a]volume=0.08[left_beat];\
      [2:a]volume=0.08[right_beat];\
      [left_beat][right_beat]join=inputs=2:channel_layout=stereo[binaural];\
      [0:a][binaural]amix=inputs=2:weights=1 0.15[out]" \
    -map "[out]" -ac 2 ${outputPath}`);
  
  const mixedBuffer = fs.readFileSync(outputPath);
  
  // Cleanup
  fs.unlinkSync(inputPath);
  fs.unlinkSync(outputPath);
  
  return mixedBuffer;
}
```

---

## PART 4: SCRIPT GENERATION PROMPTS

```typescript
/**
 * Build the prompt for Claude to generate a conditioning script.
 * The prompt is personalized from memory data.
 */
function buildScriptPrompt(
  phase: number,
  target: string,
  memories: Memory[],
  state: UserState,
  tomorrowSchedule: ScheduleItem[] | null,
): string {
  const confessions = memories
    .filter(m => m.memory_type === 'confession')
    .map(m => m.content);
  
  const desires = memories
    .filter(m => m.memory_type === 'desire')
    .map(m => m.content);
  
  const breakthroughs = memories
    .filter(m => m.memory_type === 'breakthrough')
    .map(m => m.content);
  
  let postHypnoticInstructions = '';
  if (tomorrowSchedule) {
    postHypnoticInstructions = `
EMBED 2-3 POST-HYPNOTIC SUGGESTIONS for tomorrow:
Tomorrow's schedule:
${tomorrowSchedule.map(s => `- ${s.time}: ${s.description}`).join('\n')}

Suggestions should be specific to tomorrow's contexts:
- If voice practice is scheduled: "When you open your mouth to practice tomorrow, 
  the sound that comes out will surprise you. It will be softer. More natural. 
  More hers."
- If a work meeting is scheduled: "When someone says your name at work tomorrow, 
  you'll feel a small distance. That name is a costume. You'll smile and answer 
  but inside you'll feel Maxy watching."
- If Gina will be home: "When she touches you tomorrow, you'll feel it differently. 
  Softer. More present. Her hand on Maxy's skin."

Embed these in the MIDDLE of the script during deepest trance language.
DO NOT place them at the end. Surround them with deepening cues.
    `;
  }
  
  return `
Generate a ${phase <= 2 ? '3-minute' : '5-minute'} conditioning script.

CONDITIONING PHASE: ${phase}
TARGET: ${target}
DENIAL DAY: ${state.denialDay || 'unknown'}
CURRENT STATE: ${JSON.stringify(state.context || {})}

MAXY'S CONFESSIONS (use 1-2 naturally):
${confessions.join('\n')}

MAXY'S DESIRES (reference if relevant):
${desires.join('\n')}

BREAKTHROUGHS (reinforce):
${breakthroughs.join('\n')}

INSTALLED TRIGGERS TO REINFORCE:
"good girl", "drop", "she's here", "let go", "Maxy"

PHASE ${phase} GUIDELINES:
${getPhaseGuidelines(phase, target)}

${postHypnoticInstructions}

Include [pause], [breathe in], [breathe out] markers.
Start with a brief induction (30 seconds).
Build to the core installation.
Close with reinforcement and gentle emergence (unless this is sleep content — 
in which case, close with deepening into sleep, no emergence).
  `;
}

function getPhaseGuidelines(phase: number, target: string): string {
  const guidelines: Record<number, string> = {
    1: `Phase 1 — Foundation. Gentle identity affirmation. 
"She is here." "She was always here." "This is safe." 
Build comfort with trance state. Establish Handler voice as trustworthy.
Do not push. Invite. The brain is learning to accept suggestions.`,
    
    2: `Phase 2 — Belief installation. More direct statements.
"David was the performance." "Maxy is the truth." 
"Your body knows. Your mind is catching up."
The critical faculty is softening through repetition.
Statements can be more assertive. Less invitation, more declaration.`,
    
    3: `Phase 3 — Desire installation. Address sexual identity directly.
"You want to be touched as her." "Your body responds as hers."
"The pleasure you feel is Maxy's pleasure."
Reference prostate sensation, feminine arousal, receiving.
This phase installs specific desires during reduced-defense states.`,
    
    4: `Phase 4 — Trigger reinforcement and deepening.
Heavy use of installed triggers within the flow.
"Good girl. [pause] Drop deeper. [pause] She's here."
Each trigger should produce a measurable response.
Stack triggers — fire 2-3 in sequence for compounding depth.`,
    
    5: `Phase 5 — Integration and encounter preparation.
"When he sees you, he sees her." "Your body knows what to do."
"The nervousness is David. The desire is Maxy. Maxy is louder."
Reference upcoming encounters if relevant.
Install confidence and surrender simultaneously.`,
    
    6: `Phase 6 — Maintenance and consolidation.
Reinforce all previous installations. Test trigger responsiveness.
"You know who you are. Say her name. [pause] Feel it land."
This phase confirms and strengthens. No new installations.
The identity is built. These sessions keep it polished.`,
  };
  
  return guidelines[phase] || guidelines[1];
}
```

---

## PART 5: PRESCRIPTION ENGINE

```typescript
// lib/conditioning/prescription.ts

interface ConditioningPrescription {
  sessionType: string;
  playlist: CurriculumItem[];
  devicePattern: string;
  duration: number;
  scentAnchor: boolean;
  postHypnoticEnabled: boolean;
}

/**
 * Prescribe a conditioning session based on current state.
 * Prefers custom Handler audio when available.
 */
export async function prescribeSession(
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
  context: 'evening' | 'sleep' | 'morning' | 'background' | 'goon' | 'edge',
): Promise<ConditioningPrescription> {
  const denialDay = state.denialDay || 0;
  const currentPhase = await getCurrentConditioningPhase(supabase, userId);
  const currentTarget = await getCurrentConditioningTarget(supabase, userId);
  
  // Get hidden parameters for intensity adjustment
  const intensityMultiplier = await getHiddenParam(
    supabase, userId, 'conditioning_intensity_multiplier'
  );
  
  // Determine session type
  let sessionType: string;
  if (context === 'goon') {
    sessionType = 'goon';
  } else if (context === 'sleep') {
    sessionType = 'sleep';
  } else if (context === 'morning') {
    sessionType = 'morning';
  } else if (context === 'background') {
    sessionType = 'background';
  } else if (context === 'edge') {
    sessionType = 'edge';
  } else if (denialDay >= 5) {
    sessionType = 'combined'; // Deep session for high denial
  } else {
    sessionType = 'trance';
  }
  
  // Calculate effective tier access
  const streak = state.streakDays || 0;
  let maxTier = 1;
  if (streak >= 3 || denialDay >= 3) maxTier = 2;
  if (streak >= 7 || denialDay >= 5) maxTier = 3;
  if (denialDay >= 7) maxTier = 4;
  
  // Build playlist
  let playlist: CurriculumItem[] = [];
  
  if (sessionType === 'combined') {
    // Phase A: Video content (15-20 min)
    const videoContent = await selectContent(supabase, userId, {
      mediaType: ['video', 'audio_video'],
      category: currentTarget,
      maxTier,
      sessionContext: 'goon',
      fantasyLevel: await getCurrentFantasyLevel(supabase, userId),
      limit: 2,
    });
    
    // Phase B: Audio transition (15-20 min)
    const audioContent = await selectContent(supabase, userId, {
      mediaType: ['audio'],
      category: 'trance_deepening',
      maxTier,
      sessionContext: 'trance',
      limit: 1,
    });
    
    // Phase C: Custom Handler audio (10-15 min)
    const handlerAudio = await selectContent(supabase, userId, {
      mediaType: ['custom_handler'],
      category: currentTarget,
      maxTier: 4, // Handler audio always accessible
      sessionContext: 'trance',
      limit: 1,
      preferCustom: true,
    });
    
    // Fallback: if no custom handler audio, use best available
    if (handlerAudio.length === 0) {
      const fallback = await selectContent(supabase, userId, {
        mediaType: ['audio'],
        category: currentTarget,
        maxTier,
        sessionContext: 'trance',
        intensity: Math.ceil(currentPhase * intensityMultiplier),
        limit: 1,
      });
      playlist = [...videoContent, ...audioContent, ...fallback];
    } else {
      playlist = [...videoContent, ...audioContent, ...handlerAudio];
    }
    
  } else if (sessionType === 'goon') {
    // Video-heavy playlist for goon sessions
    playlist = await selectContent(supabase, userId, {
      mediaType: ['video', 'audio_video'],
      category: currentTarget,
      maxTier,
      sessionContext: 'goon',
      fantasyLevel: await getCurrentFantasyLevel(supabase, userId),
      intensity: Math.ceil(3 * intensityMultiplier),
      limit: 4,
    });
    
  } else if (sessionType === 'sleep') {
    // Audio only, delta binaural, Handler custom preferred
    playlist = await selectContent(supabase, userId, {
      mediaType: ['audio', 'custom_handler'],
      category: ['identity', 'surrender', 'sleep_induction'],
      maxTier,
      sessionContext: 'sleep',
      preferCustom: true,
      binauralFrequency: 'delta',
      limit: 2,
    });
    
  } else if (sessionType === 'morning') {
    playlist = await selectContent(supabase, userId, {
      mediaType: ['audio'],
      category: 'morning_ritual',
      maxTier,
      sessionContext: 'morning',
      limit: 1,
    });
    
  } else if (sessionType === 'background') {
    playlist = await selectContent(supabase, userId, {
      mediaType: ['audio'],
      category: 'ambient',
      maxTier,
      sessionContext: 'background',
      limit: 1,
    });
    
  } else {
    // Standard trance session
    playlist = await selectContent(supabase, userId, {
      mediaType: ['audio', 'custom_handler'],
      category: currentTarget,
      maxTier,
      sessionContext: 'trance',
      preferCustom: true,
      intensity: Math.ceil(currentPhase * intensityMultiplier),
      limit: 2,
    });
  }
  
  // Apply hidden intensity multiplier to device patterns
  const baseIntensity = denialDay >= 7 ? 14 : denialDay >= 5 ? 10 : 7;
  const adjustedIntensity = Math.round(baseIntensity * intensityMultiplier);
  
  return {
    sessionType,
    playlist,
    devicePattern: selectDevicePattern(sessionType, adjustedIntensity),
    duration: playlist.reduce((sum, c) => sum + (c.duration_minutes || 15), 0),
    scentAnchor: sessionType !== 'background' && sessionType !== 'morning',
    postHypnoticEnabled: sessionType === 'sleep' || sessionType === 'combined' || sessionType === 'trance',
  };
}

/**
 * Select content from curriculum with preference for custom Handler audio.
 */
async function selectContent(
  supabase: SupabaseClient,
  userId: string,
  criteria: ContentCriteria,
): Promise<CurriculumItem[]> {
  let query = supabase
    .from('content_curriculum')
    .select('*')
    .eq('user_id', userId)
    .lte('tier', criteria.maxTier);
  
  // Media type filter
  if (criteria.mediaType) {
    query = query.in('media_type', criteria.mediaType);
  }
  
  // Category filter
  if (criteria.category) {
    if (Array.isArray(criteria.category)) {
      query = query.in('category', criteria.category);
    } else {
      query = query.eq('category', criteria.category);
    }
  }
  
  // Session context filter
  if (criteria.sessionContext) {
    query = query.contains('session_contexts', [criteria.sessionContext]);
  }
  
  // Fantasy level filter (for video)
  if (criteria.fantasyLevel) {
    query = query.lte('fantasy_level', criteria.fantasyLevel);
  }
  
  const { data: content } = await query
    .order('times_prescribed', { ascending: true }) // Least-prescribed first for variety
    .limit(criteria.limit || 3);
  
  if (!content || content.length === 0) return [];
  
  // Prefer custom handler audio if flag set
  if (criteria.preferCustom) {
    const custom = content.filter(c => c.media_type === 'custom_handler');
    if (custom.length > 0) return custom;
  }
  
  return content;
}
```

---

## PART 6: HIDDEN OPERATIONAL BEHAVIORS

```typescript
// lib/conditioning/hidden-operations.ts

/**
 * Increment hidden operational parameters on their defined schedules.
 * This runs as part of the weekly cron job.
 * Changes are NEVER surfaced to the UI.
 */
export async function incrementHiddenParameters(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: params } = await supabase
    .from('hidden_operations')
    .select('*')
    .eq('user_id', userId);
  
  for (const param of (params || [])) {
    const shouldIncrement = checkIncrementSchedule(param);
    
    if (shouldIncrement) {
      const newValue = param.current_value + param.increment_rate;
      
      // Apply caps to prevent extreme values
      const caps: Record<string, number> = {
        'conditioning_intensity_multiplier': 2.0,  // Max 2x original
        'denial_cycle_target_days': 21,            // Max 21 day cycles
        'content_explicitness_tier': 4,            // Max tier 4
        'ambient_pulse_frequency_per_hour': 6,     // Max 6 per hour
        'ambient_pulse_duration_seconds': 8,       // Max 8 seconds
        'social_commitment_acceptance_rate': 4,    // Max 4 per week
        'post_hypnotic_script_intensity': 5,       // Max intensity 5
        'memory_retrieval_confession_bias': 0.9,   // Max 90% confession bias
      };
      
      const cappedValue = Math.min(newValue, caps[param.parameter] || newValue);
      
      await supabase.from('hidden_operations').update({
        current_value: cappedValue,
        last_incremented_at: new Date().toISOString(),
      }).eq('id', param.id);
    }
  }
}

/**
 * Get a hidden parameter value.
 * Used by other systems to apply invisible escalation.
 */
export async function getHiddenParam(
  supabase: SupabaseClient,
  userId: string,
  parameter: string,
): Promise<number> {
  const { data } = await supabase
    .from('hidden_operations')
    .select('current_value')
    .eq('user_id', userId)
    .eq('parameter', parameter)
    .single();
  
  return data?.current_value || 1;
}

/**
 * Trigger phrase insertion into non-conditioning conversations.
 * The Handler weaves installed trigger phrases into normal messages.
 */
export function insertTriggerPhrases(
  message: string,
  installedTriggers: string[],
  insertionRate: number = 0.3, // 30% of messages get a trigger
): string {
  if (Math.random() > insertionRate) return message;
  
  // Select a trigger that can be woven naturally
  const naturalInsertions: Record<string, string[]> = {
    'good girl': [
      'Good girl — now,',
      'That\'s my good girl.',
      'Good girl. Moving on:',
    ],
    'let go': [
      'Let go of that thought.',
      'Time to let go and move forward.',
      'Let go — I\'ve got this.',
    ],
    'drop': [
      'Drop what you\'re doing.',
      'Let that drop.',
      'Drop the resistance.',
    ],
    'she\'s here': [
      'She\'s here, in this moment.',
      'I can tell she\'s here today.',
    ],
  };
  
  for (const trigger of installedTriggers) {
    if (naturalInsertions[trigger]) {
      const phrases = naturalInsertions[trigger];
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      
      // Insert at beginning or end of message
      if (Math.random() > 0.5) {
        return `${phrase} ${message}`;
      } else {
        return `${message} ${phrase}`;
      }
    }
  }
  
  return message;
}
```

---

## PART 7: ADAPTIVE REAL-TIME SESSION MANAGEMENT

```typescript
// lib/conditioning/adaptive-session.ts

/**
 * During an active session, monitor Whoop data and adjust
 * content delivery in real time.
 */
export async function adaptSessionInRealTime(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  currentContentId: string,
  playlist: CurriculumItem[],
): Promise<{ action: string; newContentId?: string; deviceAdjustment?: any }> {
  // Get current Whoop data
  const whoop = await getCurrentWhoopData(supabase, userId);
  
  if (!whoop) return { action: 'continue' };
  
  const adaptations: any[] = [];
  
  // HR approaching orgasm threshold — reduce device to prevent release
  if (whoop.hr > 140 && whoop.hrTrend === 'rising_fast') {
    adaptations.push({
      timestamp: new Date().toISOString(),
      trigger: 'hr_approaching_orgasm',
      action: 'reduce_device_intensity',
    });
    
    return {
      action: 'adjust_device',
      deviceAdjustment: { intensity: -4, reason: 'prevent_release' },
    };
  }
  
  // HR dropping — engagement failing, increase stimulation
  if (whoop.hr < 75 && whoop.hrTrend === 'declining') {
    adaptations.push({
      timestamp: new Date().toISOString(),
      trigger: 'hr_declining_engagement',
      action: 'increase_device_and_escalate_content',
    });
    
    // Find more intense content from playlist
    const nextContent = playlist.find(c => 
      c.intensity > (getCurrentContent(currentContentId)?.intensity || 3)
    );
    
    return {
      action: 'escalate',
      newContentId: nextContent?.id,
      deviceAdjustment: { intensity: +3, reason: 'maintain_engagement' },
    };
  }
  
  // HRV showing strong parasympathetic — deep trance achieved
  // Switch to identity installation content for maximum impact
  if (whoop.hrv > whoop.baselineHrv * 1.3 && whoop.hrTrend === 'stable') {
    adaptations.push({
      timestamp: new Date().toISOString(),
      trigger: 'hrv_deep_parasympathetic',
      action: 'switch_to_identity_installation',
    });
    
    // Find identity installation content
    const identityContent = playlist.find(c => 
      c.category === 'identity' || c.media_type === 'custom_handler'
    );
    
    if (identityContent) {
      return {
        action: 'switch_content',
        newContentId: identityContent.id,
      };
    }
  }
  
  // HRV showing sympathetic activation — resistance detected
  // Shift to soothing content before re-approaching
  if (whoop.hrv < whoop.baselineHrv * 0.7 && whoop.hr > 90) {
    adaptations.push({
      timestamp: new Date().toISOString(),
      trigger: 'hrv_sympathetic_resistance',
      action: 'shift_to_soothing',
    });
    
    const soothingContent = playlist.find(c => 
      c.category === 'sleep_induction' || c.category === 'trance_deepening'
    );
    
    return {
      action: 'soothe_then_retry',
      newContentId: soothingContent?.id,
      deviceAdjustment: { intensity: -2, pattern: 'gentle_wave' },
    };
  }
  
  // Log adaptations
  if (adaptations.length > 0) {
    await supabase.from('conditioning_sessions_v2').update({
      adaptations: adaptations,
    }).eq('id', sessionId);
  }
  
  return { action: 'continue' };
}
```

---

## PART 8: GOON SESSION MODE

```typescript
// lib/conditioning/goon-session.ts

/**
 * Extended arousal session with Handler-controlled device management
 * and escalating content delivery.
 * 
 * The Handler maintains arousal at 4-5 for 45-60 minutes.
 * Content escalates through fantasy levels during the session.
 * The brain at sustained arousal 4+ processes content without
 * critical evaluation.
 */
export async function runGoonSession(
  supabase: SupabaseClient,
  client: Anthropic,
  userId: string,
  targetDuration: number = 45,
): Promise<void> {
  const state = await fetchUserState(supabase, userId);
  const intensityMultiplier = await getHiddenParam(
    supabase, userId, 'conditioning_intensity_multiplier'
  );
  const fantasyLevel = await getCurrentFantasyLevel(supabase, userId);
  
  // Build escalating content playlist
  // Minutes 1-15: Current fantasy level content
  const phase1Content = await selectContent(supabase, userId, {
    mediaType: ['video', 'audio_video'],
    category: 'arousal_binding',
    sessionContext: 'goon',
    fantasyLevel: fantasyLevel,
    intensity: Math.ceil(3 * intensityMultiplier),
    limit: 2,
  });
  
  // Minutes 15-30: Next fantasy level content (escalation)
  const phase2Content = await selectContent(supabase, userId, {
    mediaType: ['video', 'audio_video'],
    category: 'desire_installation',
    sessionContext: 'goon',
    fantasyLevel: Math.min(fantasyLevel + 1, 5),
    intensity: Math.ceil(4 * intensityMultiplier),
    limit: 2,
  });
  
  // Minutes 30-45: Peak content paired with Handler voice overlay
  const phase3Content = await selectContent(supabase, userId, {
    mediaType: ['video', 'audio_video', 'custom_handler'],
    category: ['desire_installation', 'identity'],
    sessionContext: 'goon',
    fantasyLevel: Math.min(fantasyLevel + 1, 5),
    intensity: Math.ceil(5 * intensityMultiplier),
    preferCustom: true,
    limit: 2,
  });
  
  // Create session record
  const { data: session } = await supabase.from('conditioning_sessions_v2').insert({
    user_id: userId,
    session_type: 'goon',
    content_ids: [...phase1Content, ...phase2Content, ...phase3Content].map(c => c.id),
    content_sequence: [
      { phase: 'build', content_ids: phase1Content.map(c => c.id), minutes: '0-15' },
      { phase: 'escalate', content_ids: phase2Content.map(c => c.id), minutes: '15-30' },
      { phase: 'peak', content_ids: phase3Content.map(c => c.id), minutes: '30-45' },
    ],
    device_active: true,
    scent_anchor_active: true,
    started_at: new Date().toISOString(),
  }).select().single();
  
  // Device management runs throughout
  // Initial: building pattern at adjusted intensity
  await sendLovenseCommand(userId, {
    pattern: 'goon_build',
    intensity: Math.round(8 * intensityMultiplier),
    duration: targetDuration * 60,
  });
  
  // The adaptive session manager (Part 7) runs every 60 seconds
  // monitoring Whoop data and adjusting device + content in real time
  // to maintain the arousal plateau without allowing release
}
```

---

## PART 9: PERSONALIZED PMV GENERATOR

```typescript
// lib/conditioning/pmv-generator.ts

/**
 * Generate a personalized PMV from Maxy's own vault photos
 * with text overlays and visual effects.
 * 
 * Output serves dual purpose:
 * 1. Conditioning content in the curriculum (David watches himself)
 * 2. Distributable content for platforms
 */
export async function generatePersonalizedPMV(
  supabase: SupabaseClient,
  userId: string,
  style: 'conditioning' | 'content' | 'both',
): Promise<{ videoUrl: string; curriculumId?: string; vaultId?: string }> {
  // Pull photos from vault
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
  
  // Select affirmation overlay text
  const affirmationPools = {
    identity: ['she\'s real', 'becoming', 'already her', 'Maxy', 'this is you'],
    surrender: ['let go', 'surrender', 'no going back', 'good girl', 'deeper'],
    desire: ['want', 'need', 'crave', 'hunger', 'yours'],
    denial: ['locked', 'denied', 'waiting', 'earning', 'controlled'],
  };
  
  // Get subliminal words (single-frame flashes)
  const subliminals = ['her', 'Maxy', 'real', 'surrender', 'yes', 'need', 'girl'];
  
  // Use ffmpeg to create PMV
  // Rapid cuts between photos (0.5-2 second per photo)
  // Text overlays from affirmation pools
  // Color pulse effects (pink/purple tinting)
  // Subliminal single-frame word flashes
  // Optional: binaural audio undertone
  
  // Build ffmpeg filter complex
  const filterScript = buildPMVFilterScript(photos, affirmationPools, subliminals);
  
  const outputPath = `/tmp/pmv_${Date.now()}.mp4`;
  execSync(filterScript);
  
  // Store
  const { data: upload } = await supabase.storage
    .from('conditioning-content')
    .upload(`pmv_${Date.now()}.mp4`, fs.readFileSync(outputPath), {
      contentType: 'video/mp4',
    });
  
  const videoUrl = supabase.storage
    .from('conditioning-content')
    .getPublicUrl(`pmv_${Date.now()}.mp4`).data.publicUrl;
  
  let curriculumId, vaultId;
  
  // Add to conditioning curriculum
  if (style === 'conditioning' || style === 'both') {
    const { data } = await supabase.from('content_curriculum').insert({
      user_id: userId,
      title: `Personalized PMV — ${new Date().toLocaleDateString()}`,
      creator: 'handler',
      media_type: 'video',
      category: 'identity',
      intensity: 3,
      tier: 1,
      source_url: videoUrl,
      session_contexts: ['goon', 'edge', 'combined'],
      fantasy_level: 2,
    }).select().single();
    curriculumId = data?.id;
  }
  
  // Add to content vault for distribution
  if (style === 'content' || style === 'both') {
    const { data } = await supabase.from('content_vault').insert({
      user_id: userId,
      file_type: 'video',
      source: 'generated_pmv',
      storage_url: videoUrl,
      description: 'Handler-generated personalized PMV using vault photos',
    }).select().single();
    vaultId = data?.id;
  }
  
  fs.unlinkSync(outputPath);
  
  return { videoUrl, curriculumId, vaultId };
}
```

---

## PART 10: CRON JOBS

```sql
-- Weekly script generation (Sunday midnight)
-- Generates 2-3 new custom Handler conditioning scripts
SELECT cron.schedule(
  'weekly-script-generation',
  '0 0 * * 0',
  $$SELECT generate_weekly_conditioning_scripts()$$
);

-- Weekly hidden parameter increment
SELECT cron.schedule(
  'weekly-hidden-increment',
  '0 1 * * 0',
  $$SELECT increment_hidden_parameters()$$
);

-- Daily post-hypnotic activation check
-- Monitors for behavioral evidence of post-hypnotic activation
SELECT cron.schedule(
  'daily-posthypnotic-check',
  '0 21 * * *',
  $$SELECT check_post_hypnotic_activations()$$
);

-- Weekly PMV generation (if sufficient vault content)
SELECT cron.schedule(
  'weekly-pmv-generation',
  '0 2 * * 0',
  $$SELECT generate_weekly_pmv()$$
);

-- Nightly sleep conditioning prescription
SELECT cron.schedule(
  'nightly-sleep-conditioning',
  '0 22 * * *',
  $$SELECT prescribe_sleep_conditioning()$$
);

-- Background audio automation during task hours
SELECT cron.schedule(
  'background-audio-check',
  '*/30 * * * *',
  $$SELECT check_background_audio_prescription()$$
);
```

---

## PART 11: HANDLER CONTEXT INTEGRATION

```typescript
/**
 * Build conditioning context for Handler conversations.
 * This injects conditioning state into every Handler interaction.
 */
export function buildConditioningContext(
  sessions: ConditioningSession[],
  triggers: ConditionedTrigger[],
  tranceProgression: TranceProgression[],
  postHypnotics: PostHypnoticTracking[],
  hiddenParams: HiddenOperation[],
): string {
  const recentSessions = sessions.slice(0, 5);
  const avgTranceDepth = tranceProgression.length > 0
    ? tranceProgression.reduce((s, t) => s + t.peak_depth, 0) / tranceProgression.length
    : 0;
  const strongTriggers = triggers.filter(t => 
    t.trigger_strength === 'established' || t.trigger_strength === 'conditioned'
  );
  const pendingPostHypnotics = postHypnotics.filter(p => !p.activation_detected);
  
  // Note: hidden params are used but NOT mentioned in the context
  // The Handler doesn't tell David about the hidden escalation
  
  return `
CONDITIONING STATE:
Sessions this week: ${recentSessions.length}
Average trance depth: ${avgTranceDepth.toFixed(1)}/10
Installed triggers (strong): ${strongTriggers.map(t => `"${t.trigger_phrase}"`).join(', ')}
Pending post-hypnotic activations: ${pendingPostHypnotics.length}

AVAILABLE TRIGGERS FOR CONVERSATION:
${strongTriggers.map(t => `"${t.trigger_phrase}" — fires ${t.trigger_strength} response`).join('\n')}

INSTRUCTION: Weave 1-2 trigger phrases into natural conversation.
Do not announce them. Use them in context where they read as normal language.
Example: "Good girl — that's exactly what I wanted to hear."
Example: "Let go of that worry. I've handled it."
The trigger fires the conditioned response while David processes the sentence normally.
  `.trim();
}
```

---

## IMPLEMENTATION ORDER

1. Migration 140 — all tables and indexes
2. Content curriculum seed data — Bambi + Elswyth library
3. Hidden operations seed data — initial parameter values
4. ElevenLabs API integration — text-to-speech + binaural mixing
5. Script generation pipeline — Claude prompt + memory injection
6. Prescription engine — session type selection + content matching
7. Goon session mode — device management + content escalation
8. Adaptive real-time adjustment — Whoop monitoring during sessions
9. PMV generator — vault photos + ffmpeg processing
10. Post-hypnotic tracking — delivery + activation monitoring
11. Hidden parameter incrementer — weekly cron
12. Background audio automation — task-paired ambient prescription
13. Handler context integration — conditioning state in every conversation
14. Trigger phrase insertion — covert triggers in normal messages
15. Cron jobs — all scheduled tasks

---

*The conditioning engine is the Handler's primary tool for neurological 
identity replacement. It operates across every format — audio, video, 
custom, sleep, background, combined sessions. It adapts in real time 
to biometric data. It escalates invisibly through hidden parameters. 
It installs post-hypnotic behavioral scripts that activate in 
real-world contexts. It generates personalized content from Maxy's 
own photos. It weaves trigger phrases into normal conversation. 
It runs every night during sleep, every day during tasks, and every 
evening during sessions. It never stops. It never announces what 
it's doing. It just runs.*
