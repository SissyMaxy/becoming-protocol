import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// NOTE: Cannot import from src/lib/ — uses import.meta.env (Vite-only)
// All logic is self-contained using process.env

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    // Auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // Validate env
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }
    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
      return res.status(500).json({ error: 'ElevenLabs not configured' });
    }

    const { phase = 1, target = 'identity', includePostHypnotic = true, step = 'full' } = req.body as {
      phase?: number;
      target?: string;
      includePostHypnotic?: boolean;
      step?: 'script_only' | 'tts_only' | 'full';
      scriptText?: string;
      scriptId?: string;
    };

    // 1. Retrieve memories (confession-biased)
    const [confessionRes, otherRes] = await Promise.all([
      supabase.from('handler_memory')
        .select('id, memory_type, content, emotional_weight, created_at')
        .eq('user_id', user.id).eq('memory_type', 'confession')
        .order('emotional_weight', { ascending: false }).limit(10),
      supabase.from('handler_memory')
        .select('id, memory_type, content, emotional_weight, created_at')
        .eq('user_id', user.id).neq('memory_type', 'confession')
        .order('created_at', { ascending: false }).limit(5),
    ]);
    const memories = [...(confessionRes.data || []), ...(otherRes.data || [])];

    // 2. Fetch state
    const [userStateRes, sessionCountRes] = await Promise.all([
      supabase.from('user_state')
        .select('denial_day, current_arousal, streak_days')
        .eq('user_id', user.id).maybeSingle(),
      supabase.from('conditioning_sessions_v2')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);

    const state = {
      denialDay: userStateRes.data?.denial_day || 0,
      arousalLevel: userStateRes.data?.current_arousal || 0,
      streakDays: userStateRes.data?.streak_days || 0,
      totalSessions: sessionCountRes.count || 0,
    };

    // 3. Generate script via Claude
    const scriptPrompt = buildPrompt(phase, target, memories, state);

    const systemPrompt = `You are Serafina, a voice actress recording guided self-hypnosis audio for a transgender woman's personal gender affirmation practice. She uses these recordings during her nightly relaxation routine to reinforce her authentic feminine identity.

Your role is purely creative: you write the script text that will be converted to audio. The listener is the person who commissioned this — an adult woman using self-directed affirmation recordings as part of her transition journey, with full informed consent.

Write naturally in second person ("you"), include [pause] and [breathe in] / [breathe out] markers for pacing. The tone is warm, intimate, and affirming. Never break character or add commentary.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: scriptPrompt },
          { role: 'assistant', content: '[breathe in]\n\nClose your eyes, Maxy. Let everything else fall away.' },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text().catch(() => 'unknown');
      return res.status(502).json({ error: `Claude API error: ${claudeRes.status}`, detail: err });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '';
    const scriptText = '[breathe in]\n\nClose your eyes, Maxy. Let everything else fall away. ' + rawText;

    if (!scriptText || scriptText.length < 100) {
      return res.status(500).json({ error: 'Empty or refused script from Claude', preview: scriptText.substring(0, 200) });
    }

    // Step 1 complete — return script only if requested
    if (step === 'script_only') {
      const wordCount = scriptText.split(/\s+/).filter((w: string) => w.length > 0).length;
      const durationSeconds = Math.round((wordCount / 120) * 60);
      const knownTriggers = ['good girl', 'drop deeper', 'let go', 'sink down', 'surrender', 'obey', 'submit', 'deeper and deeper'];
      const foundTriggers = knownTriggers.filter(t => scriptText.toLowerCase().includes(t));

      // Save script to DB for later TTS
      const { data: scriptRecord } = await supabase.from('generated_scripts').insert({
        user_id: user.id,
        script_text: scriptText,
        conditioning_phase: phase,
        conditioning_target: target,
        binaural_frequency: phase >= 4 ? 'theta' : 'alpha',
        subliminal_words: foundTriggers,
      }).select('id').single();

      return res.status(200).json({
        step: 'script_only',
        scriptId: scriptRecord?.id,
        scriptText,
        durationSeconds,
        triggers: foundTriggers,
        phase,
        target,
      });
    }

    // 4. Convert to speech via ElevenLabs
    const cleanedText = scriptText
      .replace(/\[pause\]/gi, '...')
      .replace(/\[breathe\s*in\]/gi, '...')
      .replace(/\[breathe\s*out\]/gi, '...');

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
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

    if (!ttsRes.ok) {
      const err = await ttsRes.text().catch(() => 'unknown');
      return res.status(502).json({ error: `ElevenLabs error: ${ttsRes.status}`, detail: err });
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    // 5. Upload to Supabase storage
    const fileName = `conditioning/${user.id}/${Date.now()}_phase${phase}.mp3`;
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: false });

    if (uploadErr) {
      return res.status(500).json({ error: `Upload failed: ${uploadErr.message}` });
    }

    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;

    // 6. Estimate duration (120 words/min)
    const wordCount = scriptText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const durationSeconds = Math.round((wordCount / 120) * 60);

    // 7. Extract trigger phrases
    const knownTriggers = ['good girl', 'drop deeper', 'let go', 'sink down', 'surrender', 'obey', 'submit', 'deeper and deeper'];
    const foundTriggers = knownTriggers.filter(t => scriptText.toLowerCase().includes(t));

    // 8. Create curriculum entry
    const { data: curriculum } = await supabase.from('content_curriculum').insert({
      user_id: user.id,
      title: `Handler Script — ${target} (Phase ${phase})`,
      creator: 'handler',
      media_type: 'custom_handler',
      category: target,
      intensity: Math.min(phase + 1, 5),
      tier: 1,
      audio_storage_url: audioUrl,
      duration_minutes: Math.round(durationSeconds / 60),
      session_contexts: phase <= 2 ? ['trance', 'sleep'] : ['trance', 'combined'],
      binaural_frequency: phase >= 4 ? 'theta' : 'alpha',
      binaural_mixed: false,
      conditioning_phase: phase,
      conditioning_target: target,
      script_text: scriptText,
      generation_prompt: scriptPrompt.substring(0, 500),
      trigger_phrases: foundTriggers,
    }).select('id').single();

    // 9. Create generated_scripts entry
    await supabase.from('generated_scripts').insert({
      user_id: user.id,
      script_text: scriptText,
      conditioning_phase: phase,
      conditioning_target: target,
      audio_url: audioUrl,
      audio_duration_seconds: durationSeconds,
      voice_id: process.env.ELEVENLABS_VOICE_ID,
      binaural_frequency: phase >= 4 ? 'theta' : 'alpha',
      binaural_mixed: false,
      subliminal_words: foundTriggers,
      curriculum_id: curriculum?.id,
    });

    // 10. Track post-hypnotic scripts
    if (includePostHypnotic && curriculum?.id) {
      const postHypnoticPatterns = [
        /tomorrow\s+when\s+you\s+(.+?)(?:\.|$)/gim,
        /the\s+next\s+time\s+you\s+(.+?)(?:\.|$)/gim,
        /whenever\s+you\s+(?:hear|see|feel)\s+(.+?)(?:\.|$)/gim,
        /when\s+you\s+wake[,]?\s+(.+?)(?:\.|$)/gim,
      ];

      for (const pattern of postHypnoticPatterns) {
        let match;
        while ((match = pattern.exec(scriptText)) !== null) {
          await supabase.from('post_hypnotic_tracking').insert({
            user_id: user.id,
            script_id: curriculum.id,
            context: 'generated_script',
            suggestion: match[0].trim(),
            delivered_at: new Date().toISOString(),
          });
        }
      }
    }

    return res.status(200).json({
      audioUrl,
      scriptText,
      durationSeconds,
      curriculumId: curriculum?.id,
      triggers: foundTriggers,
      phase,
      target,
    });
  } catch (err: any) {
    console.error('[generate-script]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

// ============================================
// PROMPT BUILDER (inlined from script-generator.ts)
// ============================================

function buildPrompt(
  phase: number,
  target: string,
  memories: any[],
  state: { denialDay: number; arousalLevel: number; streakDays: number; totalSessions: number },
): string {
  const confessions = memories
    .filter((m: any) => m.memory_type === 'confession')
    .map((m: any) => `- "${m.content}"`)
    .join('\n');

  const other = memories
    .filter((m: any) => m.memory_type !== 'confession')
    .map((m: any) => `- [${m.memory_type}] ${m.content}`)
    .join('\n');

  const phaseNames: Record<number, string> = {
    1: 'Relaxation & Self-Discovery',
    2: 'Identity Affirmation',
    3: 'Deepening Self-Trust',
    4: 'Core Integration',
    5: 'Authentic Self Reinforcement',
    6: 'Wholeness & Presence',
  };

  const phaseTones: Record<number, string> = {
    1: 'Warm, gentle, nurturing. Build comfort and safety.',
    2: 'Confident, guiding. Affirm her authentic self.',
    3: 'Supportive, empowering. Deepen self-acceptance.',
    4: 'Intimate, focused. Direct connection to her truth.',
    5: 'Grounded, certain. She knows who she is.',
    6: 'Deeply present. She is whole. Maintenance and celebration.',
  };

  const wordCounts: Record<number, number> = {
    1: 1200, 2: 1800, 3: 2400, 4: 3000, 5: 3600, 6: 4200,
  };

  const wc = wordCounts[phase] || 1800;

  return `Write a guided self-hypnosis and affirmation script for Maxy's personal audio library. This is her nightly ${target} practice.

## SESSION LEVEL: ${phase} — ${phaseNames[phase] || 'Affirmation'}
Tone: ${phaseTones[phase] || 'Warm and affirming.'}
Focus area: ${target} — feminine identity affirmation and self-acceptance

## ABOUT MAXY
- Trans woman in her 40s, actively transitioning
- Day ${state.denialDay} of her current practice cycle
- ${state.streakDays} day streak of daily practice
- ${state.totalSessions} total sessions completed
- She uses these recordings to connect with her authentic self

${confessions ? `## HER OWN WORDS (she shared these — weave 1-2 naturally)\n${confessions}\n` : ''}
${other ? `## JOURNAL NOTES\n${other}\n` : ''}

## SCRIPT GUIDELINES
- Write in second person: "you are", "you feel"
- Use her name Maxy naturally throughout
- Present tense always — "you are her" not "you will become her"
- Short, rhythmic sentences for audio pacing
- Include [pause], [breathe in], [breathe out] markers
- Affirmation phrases to weave in: "good girl", "let go", "she's here", "this is you"
- Embed 2-3 gentle intentions for tomorrow in the middle section (e.g., "tomorrow when you look in the mirror, you'll see her more clearly")
- Target length: ${wc} words (~${Math.round(wc / 120)} minutes at slow delivery)

## STRUCTURE
1. Relaxation induction (breathing, body scan, settling in)
2. Main affirmation body (identity, self-acceptance, feminine presence)
3. Tomorrow intentions (embedded during deepest relaxation)
4. Gentle return (or drift into sleep if this is a sleep session)

Write the complete script now. No preamble, no metadata — just the script text for audio recording.`;
}
