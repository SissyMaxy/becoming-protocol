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

    const { phase = 1, target = 'identity', includePostHypnotic = true } = req.body as {
      phase?: number;
      target?: string;
      includePostHypnotic?: boolean;
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
        messages: [{ role: 'user', content: scriptPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text().catch(() => 'unknown');
      return res.status(502).json({ error: `Claude API error: ${claudeRes.status}`, detail: err });
    }

    const claudeData = await claudeRes.json();
    const scriptText = claudeData.content?.[0]?.text || '';

    if (!scriptText) {
      return res.status(500).json({ error: 'Empty script from Claude' });
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
    1: 'Introduction & Relaxation',
    2: 'Identity Softening',
    3: 'Submission & Compliance',
    4: 'Deep Conditioning',
    5: 'Identity Reinforcement',
    6: 'Permanent Integration',
  };

  const phaseTones: Record<number, string> = {
    1: 'Warm, gentle, non-threatening. Build trust.',
    2: 'Confident, guiding. Begin asserting authority.',
    3: 'Authoritative, commanding but caring.',
    4: 'Dominant, intensely focused. No hesitation.',
    5: 'Matter-of-fact. Identity is established reality.',
    6: 'Possessive, absolute. Maintenance of what exists.',
  };

  const wordCounts: Record<number, number> = {
    1: 1200, 2: 1800, 3: 2400, 4: 3000, 5: 3600, 6: 4200,
  };

  const wc = wordCounts[phase] || 1800;

  return `You write hypnotic conditioning scripts for audio delivery. Voice: Serafina — calm, intimate, authoritative, warm but commanding.

## PHASE ${phase}: ${phaseNames[phase] || 'Conditioning'}
Tone: ${phaseTones[phase] || 'Direct and warm.'}
Target: ${target}

## SUBJECT STATE
- Name: Maxy
- Denial day: ${state.denialDay}
- Arousal: ${state.arousalLevel}/5
- Streak: ${state.streakDays} days
- Total sessions: ${state.totalSessions}

## CONFESSIONS (use 1-2 naturally — these are her own words)
${confessions || 'None recorded yet.'}

## OTHER MEMORIES
${other || 'None.'}

## RULES
- Present tense: "You are." Not "you will be."
- Use Maxy's name. Never deadname.
- Short sentences with [pause] markers.
- Include [breathe in] [breathe out] cues.
- Embed 2-3 post-hypnotic suggestions in the MIDDLE during deepening.
- Trigger phrases to use: "good girl", "drop deeper", "let go", "surrender"
- Target: ${wc} words (~${Math.round(wc / 120)} minutes).

## OUTPUT
Write the complete script. Induction → main body → post-hypnotic suggestions → emergence.
No preamble. Just the script.`;
}
