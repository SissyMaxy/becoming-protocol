/**
 * ElevenLabs Text-to-Speech Integration
 *
 * SERVER-SIDE ONLY — This module runs in API routes, not in the browser.
 * It calls ElevenLabs for TTS and Anthropic for script generation.
 *
 * Binaural beat mixing is NOT handled here. ffmpeg is unavailable on Vercel
 * serverless. Binaural layering must happen client-side via the Web Audio API:
 *
 *   const ctx = new AudioContext();
 *   const osc = ctx.createOscillator();
 *   osc.frequency.value = binauralFrequency; // e.g. 4 Hz theta
 *   // Pan left/right channels with slight frequency offset to produce beat
 *
 * See client-side audio player component for implementation.
 */

import { supabase } from '../supabase';
import { buildScriptPrompt } from './script-generator';
import { estimateDuration, extractPostHypnoticScripts, extractTriggerPhrases } from './script-generator';

// ============================================
// TYPES
// ============================================

export interface ConditioningAudioResult {
  audioUrl: string;
  scriptText: string;
  durationSeconds: number;
  curriculumId: string;
}

interface UserState {
  denialDay: number;
  arousalLevel: number;
  isLocked: boolean;
  corruptionLevel: number;
  chosenName: string;
  totalSessions: number;
  lastSessionDate: string | null;
  triggerPhrases: string[];
}

interface HandlerMemory {
  id: string;
  memory_type: string;
  content: string;
  emotional_weight: number;
  created_at: string;
}

// ============================================
// TEXT TO SPEECH
// ============================================

/**
 * Convert text to speech via ElevenLabs API.
 * Strips inline markers before sending to the API.
 */
export async function textToSpeech(
  text: string,
  voiceId?: string
): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const resolvedVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID;
  if (!resolvedVoiceId) {
    throw new Error('No voice ID provided and ELEVENLABS_VOICE_ID not configured');
  }

  // Strip pause/breathe markers — replace with ellipsis for natural pacing
  const cleanedText = text
    .replace(/\[pause\]/gi, '...')
    .replace(/\[breathe\s*in\]/gi, '...')
    .replace(/\[breathe\s*out\]/gi, '...');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: cleanedText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown');
    throw new Error(`ElevenLabs API error ${response.status}: ${errorBody}`);
  }

  return response.arrayBuffer();
}

// ============================================
// BINAURAL MIXING (CLIENT-SIDE STUB)
// ============================================

/**
 * Binaural beat mixing requires the Web Audio API and runs client-side.
 * This function signature documents the expected interface for the client
 * implementation.
 *
 * @param audioBuffer - Decoded audio from textToSpeech
 * @param binauralFrequency - Target binaural frequency in Hz (e.g. 4 for theta)
 * @param carrierFrequency - Base carrier tone in Hz (default 200)
 * @returns Mixed AudioBuffer with binaural beat layered under speech
 */
export type MixBinauralClientSide = (
  audioBuffer: AudioBuffer,
  binauralFrequency: number,
  carrierFrequency?: number
) => Promise<AudioBuffer>;

// ============================================
// FULL CONDITIONING AUDIO GENERATION
// ============================================

/**
 * Generate a complete conditioning audio session.
 *
 * 1. Retrieves handler memories (biased toward confessions)
 * 2. Fetches current user state
 * 3. Generates script via Claude
 * 4. Converts to speech via ElevenLabs
 * 5. Stores audio in Supabase storage
 * 6. Creates content_curriculum and generated_scripts entries
 * 7. Tracks post-hypnotic scripts
 */
export async function generateConditioningAudio(
  userId: string,
  phase: number,
  target: string,
  binauralFrequency: number,
  includePostHypnotic: boolean
): Promise<ConditioningAudioResult> {
  // 1. Retrieve handler memories — bias toward confessions
  const memories = await getMemories(userId);

  // 2. Fetch user state
  const state = await getUserState(userId);

  // 3. Get tomorrow's schedule for post-hypnotic timing
  const tomorrowSchedule = await getTomorrowSchedule(userId);

  // 4. Generate script via Claude
  const scriptPrompt = buildScriptPrompt(phase, target, memories, state, tomorrowSchedule);
  const scriptText = await generateScriptViaClaude(scriptPrompt);

  // 5. Convert to speech
  const audioBuffer = await textToSpeech(scriptText);

  // 6. Store in Supabase storage
  const fileName = `conditioning/${userId}/${Date.now()}_phase${phase}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from('audio')
    .upload(fileName, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // audio bucket is private (migration 260) — store the storage path;
  // consumers sign on render via getSignedAssetUrl('audio', path).
  const audioUrl = fileName;

  // 7. Estimate duration
  const durationSeconds = estimateDuration(scriptText);

  // 8. Create content_curriculum entry
  const { data: curriculum, error: curriculumError } = await supabase
    .from('content_curriculum')
    .insert({
      user_id: userId,
      content_type: 'conditioning_audio',
      title: `Phase ${phase} — ${target}`,
      phase,
      target_area: target,
      audio_url: audioUrl,
      duration_seconds: durationSeconds,
      binaural_frequency: binauralFrequency,
      generated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (curriculumError) {
    throw new Error(`Failed to create curriculum entry: ${curriculumError.message}`);
  }

  // 9. Create generated_scripts entry
  await supabase.from('generated_scripts').insert({
    user_id: userId,
    curriculum_id: curriculum.id,
    script_text: scriptText,
    phase,
    target,
    binaural_frequency: binauralFrequency,
    trigger_phrases: extractTriggerPhrases(scriptText),
    duration_seconds: durationSeconds,
    generated_at: new Date().toISOString(),
  });

  // 10. Track post-hypnotic scripts if included
  if (includePostHypnotic) {
    const postHypnoticScripts = extractPostHypnoticScripts(scriptText, tomorrowSchedule);

    if (postHypnoticScripts.length > 0) {
      await supabase.from('post_hypnotic_scripts').insert(
        postHypnoticScripts.map((script) => ({
          user_id: userId,
          curriculum_id: curriculum.id,
          suggestion_text: script.suggestionText,
          trigger_context: script.triggerContext,
          scheduled_time: script.scheduledTime,
          active: true,
        }))
      );
    }
  }

  return {
    audioUrl,
    scriptText,
    durationSeconds,
    curriculumId: curriculum.id,
  };
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Retrieve handler memories with confession bias.
 * The hidden param memory_retrieval_confession_bias weights confessions
 * higher in the returned set — they're more emotionally charged and
 * make better conditioning material.
 */
async function getMemories(userId: string): Promise<HandlerMemory[]> {
  // Fetch recent memories — overweight confessions
  const { data: confessions } = await supabase
    .from('handler_memory')
    .select('id, memory_type, content, emotional_weight, created_at')
    .eq('user_id', userId)
    .eq('memory_type', 'confession')
    .order('emotional_weight', { ascending: false })
    .limit(10);

  const { data: otherMemories } = await supabase
    .from('handler_memory')
    .select('id, memory_type, content, emotional_weight, created_at')
    .eq('user_id', userId)
    .neq('memory_type', 'confession')
    .order('created_at', { ascending: false })
    .limit(5);

  // Confession bias: 2:1 ratio confessions to other memories
  const combined: HandlerMemory[] = [
    ...(confessions || []),
    ...(otherMemories || []),
  ];

  return combined;
}

async function getUserState(userId: string): Promise<UserState> {
  const [denialRes, arousalRes, profileRes, sessionRes] = await Promise.all([
    supabase
      .from('denial_state')
      .select('current_denial_day, is_locked')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('daily_arousal_plans')
      .select('current_arousal_level')
      .eq('user_id', userId)
      .eq('plan_date', new Date().toISOString().split('T')[0])
      .maybeSingle(),
    supabase
      .from('profile_foundation')
      .select('chosen_name, corruption_level')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('conditioning_sessions_v2')
      .select('id, ended_at')
      .eq('user_id', userId)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { count: totalSessions } = await supabase
    .from('conditioning_sessions_v2')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Get known trigger phrases from past scripts
  const { data: pastTriggers } = await supabase
    .from('generated_scripts')
    .select('trigger_phrases')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(5);

  const triggerPhrases = Array.from(
    new Set(
      (pastTriggers || []).flatMap((r) => r.trigger_phrases || [])
    )
  );

  return {
    denialDay: denialRes.data?.current_denial_day || 0,
    arousalLevel: arousalRes.data?.current_arousal_level || 0,
    isLocked: denialRes.data?.is_locked || false,
    corruptionLevel: profileRes.data?.corruption_level || 0,
    chosenName: profileRes.data?.chosen_name || 'her',
    totalSessions: totalSessions || 0,
    lastSessionDate: sessionRes.data?.ended_at || null,
    triggerPhrases,
  };
}

async function getTomorrowSchedule(userId: string): Promise<string[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { data: schedule } = await supabase
    .from('daily_arousal_plans')
    .select('plan_data')
    .eq('user_id', userId)
    .eq('plan_date', tomorrowStr)
    .maybeSingle();

  if (!schedule?.plan_data) return [];

  const planData = typeof schedule.plan_data === 'string'
    ? JSON.parse(schedule.plan_data)
    : schedule.plan_data;

  return Array.isArray(planData.scheduled_events)
    ? planData.scheduled_events
    : [];
}

async function generateScriptViaClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown');
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === 'text'
  );

  if (!textBlock?.text) {
    throw new Error('No text content in Claude response');
  }

  return textBlock.text;
}
