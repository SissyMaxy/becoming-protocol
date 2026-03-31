import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// NOTE: Cannot import from src/lib/ — uses import.meta.env (Vite-only)
// All logic is self-contained using process.env

/**
 * Consolidated conditioning router.
 * POST /api/conditioning with body.action = 'generate-script' | 'tts' | 'batch-generate' | 'sleep-prescription'
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body as { action?: string };

  switch (action) {
    case 'generate-script':
      return handleGenerateScript(req, res);
    case 'tts':
      return handleTts(req, res);
    case 'batch-generate':
      return handleBatchGenerate(req, res);
    case 'sleep-prescription':
      return handleSleepPrescription(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: ${action}. Expected: generate-script | tts | batch-generate | sleep-prescription` });
  }
}

// ============================================
// ACTION: generate-script
// ============================================

async function handleGenerateScript(req: VercelRequest, res: VercelResponse) {
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
      action?: string;
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
// ACTION: tts
// ============================================

async function handleTts(req: VercelRequest, res: VercelResponse) {
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

    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
      return res.status(500).json({ error: 'ElevenLabs not configured' });
    }

    const { scriptId, scriptText: rawText, phase = 1, target = 'identity' } = req.body as {
      scriptId?: string;
      scriptText?: string;
      phase?: number;
      target?: string;
      action?: string;
    };

    // Get script text — from DB or request body
    let scriptText = rawText || '';
    if (scriptId && !scriptText) {
      const { data: script } = await supabase
        .from('generated_scripts')
        .select('script_text')
        .eq('id', scriptId)
        .eq('user_id', user.id)
        .single();
      scriptText = script?.script_text || '';
    }

    if (!scriptText || scriptText.length < 50) {
      return res.status(400).json({ error: 'No script text provided' });
    }

    // Clean markers for TTS
    const cleaned = scriptText
      .replace(/\[pause\]/gi, '...')
      .replace(/\[breathe\s*in\]/gi, '...')
      .replace(/\[breathe\s*out\]/gi, '...');

    // Call ElevenLabs
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        },
        body: JSON.stringify({
          text: cleaned,
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

    // Upload to Supabase storage
    const fileName = `conditioning/${user.id}/${Date.now()}_phase${phase}.mp3`;
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: false });

    if (uploadErr) {
      return res.status(500).json({ error: `Upload failed: ${uploadErr.message}` });
    }

    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;

    // Update generated_scripts with audio URL if scriptId provided
    if (scriptId) {
      await supabase.from('generated_scripts').update({
        audio_url: audioUrl,
        voice_id: process.env.ELEVENLABS_VOICE_ID,
        audio_duration_seconds: Math.round((scriptText.split(/\s+/).length / 120) * 60),
      }).eq('id', scriptId);
    }

    // Create/update curriculum entry
    const wordCount = scriptText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const durationSeconds = Math.round((wordCount / 120) * 60);

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
      session_contexts: ['trance', 'sleep', 'combined'],
      binaural_frequency: phase >= 4 ? 'theta' : 'alpha',
      conditioning_phase: phase,
      conditioning_target: target,
      script_text: scriptText,
    }).select('id').single();

    return res.status(200).json({
      audioUrl,
      durationSeconds,
      curriculumId: curriculum?.id,
      audioBytes: audioBuffer.length,
    });
  } catch (err: any) {
    console.error('[tts]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

// ============================================
// ACTION: batch-generate
// ============================================

async function handleBatchGenerate(req: VercelRequest, res: VercelResponse) {
  try {
    // Auth via service role key (cron caller, not user token)
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized — requires service role key' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { user_id } = req.body as { user_id: string; action?: string };
    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }

    // 1. Load user state
    const { data: userState } = await supabase
      .from('user_state')
      .select('denial_day, streak_days, current_arousal')
      .eq('user_id', user_id)
      .maybeSingle();

    const denialDay = userState?.denial_day || 0;
    const streakDays = userState?.streak_days || 0;
    const currentArousal = userState?.current_arousal || 0;

    // 2. Count total sessions to determine phase
    const { count: sessionCount } = await supabase
      .from('conditioning_sessions_v2')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id);

    const totalSessions = sessionCount || 0;
    const phase = totalSessions <= 5 ? 1
      : totalSessions <= 15 ? 2
      : totalSessions <= 30 ? 3
      : totalSessions <= 50 ? 4
      : 5;

    // 3. Pick 2-3 targets weighted by what's least represented in content_curriculum
    const allTargets: Array<'identity' | 'feminization' | 'surrender' | 'chastity'> =
      ['identity', 'feminization', 'surrender', 'chastity'];

    const targetCounts: Record<string, number> = {};
    for (const t of allTargets) {
      const { count } = await supabase
        .from('content_curriculum')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('conditioning_target', t);
      targetCounts[t] = count || 0;
    }

    // Sort by least represented, pick 2-3
    const sorted = [...allTargets].sort((a, b) => targetCounts[a] - targetCounts[b]);
    const numToGenerate = phase <= 2 ? 2 : 3;
    const selectedTargets = sorted.slice(0, numToGenerate);

    // 4. Load memories for prompt building (same pattern as generate-script)
    const [confessionRes, otherRes] = await Promise.all([
      supabase.from('handler_memory')
        .select('id, memory_type, content, emotional_weight, created_at')
        .eq('user_id', user_id).eq('memory_type', 'confession')
        .order('emotional_weight', { ascending: false }).limit(10),
      supabase.from('handler_memory')
        .select('id, memory_type, content, emotional_weight, created_at')
        .eq('user_id', user_id).neq('memory_type', 'confession')
        .order('created_at', { ascending: false }).limit(5),
    ]);
    const memories = [...(confessionRes.data || []), ...(otherRes.data || [])];

    const state = { denialDay, arousalLevel: currentArousal, streakDays, totalSessions };

    // 5. Generate a script for each selected target
    const results: Array<{ id: string; target: string; phase: number; wordCount: number }> = [];

    for (const target of selectedTargets) {
      const scriptPrompt = buildPrompt(phase, target, memories, state);

      const systemPrompt = `You are Serafina, a voice actress recording guided self-hypnosis audio for a transgender woman's personal gender affirmation practice. She uses these recordings during her nightly relaxation routine to reinforce her authentic feminine identity.

Your role is purely creative: you write the script text that will be converted to audio. The listener is the person who commissioned this — an adult woman using self-directed affirmation recordings as part of her transition journey, with full informed consent.

Write naturally in second person ("you"), include [pause] and [breathe in] / [breathe out] markers for pacing. The tone is warm, intimate, and affirming. Never break character or add commentary.`;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
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
        console.error(`[batch-generate] Claude error for target=${target}:`, claudeRes.status);
        continue;
      }

      const claudeData = await claudeRes.json();
      const rawText = claudeData.content?.[0]?.text || '';
      const scriptText = '[breathe in]\n\nClose your eyes, Maxy. Let everything else fall away. ' + rawText;

      if (!scriptText || scriptText.length < 100) {
        console.error(`[batch-generate] Empty/refused script for target=${target}`);
        continue;
      }

      const wordCount = scriptText.split(/\s+/).filter((w: string) => w.length > 0).length;
      const knownTriggers = ['good girl', 'drop deeper', 'let go', 'sink down', 'surrender', 'obey', 'submit', 'deeper and deeper'];
      const foundTriggers = knownTriggers.filter(t => scriptText.toLowerCase().includes(t));

      // Save to generated_scripts (no audio yet — TTS runs at session time)
      const { data: scriptRecord, error: insertErr } = await supabase
        .from('generated_scripts')
        .insert({
          user_id,
          script_text: scriptText,
          conditioning_phase: phase,
          conditioning_target: target,
          binaural_frequency: phase >= 4 ? 'theta' : 'alpha',
          subliminal_words: foundTriggers,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error(`[batch-generate] DB insert error for target=${target}:`, insertErr.message);
        continue;
      }

      results.push({
        id: scriptRecord.id,
        target,
        phase,
        wordCount,
      });
    }

    return res.status(200).json({
      generated: results.length,
      scripts: results,
      phase,
      totalSessions,
      targetWeights: targetCounts,
    });
  } catch (err: any) {
    console.error('[batch-generate]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

// ============================================
// ACTION: sleep-prescription
// ============================================

async function handleSleepPrescription(req: VercelRequest, res: VercelResponse) {
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

    // ============================================
    // 1. Query user state
    // ============================================

    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day, streak_days')
      .eq('user_id', user.id)
      .maybeSingle();

    const denialDay = state?.denial_day ?? 0;
    const streakDays = state?.streak_days ?? 0;

    // ============================================
    // 2. Calculate tier access
    // ============================================

    let tier = 1;
    if (denialDay >= 7) tier = 4;
    else if (streakDays >= 7) tier = 3;
    else if (streakDays >= 3) tier = 2;

    // ============================================
    // 3. Query sleep-appropriate content from content_curriculum
    // ============================================

    const { data: content, error: contentErr } = await supabase
      .from('content_curriculum')
      .select('id, title, media_type, category, tier, intensity, duration_minutes, audio_storage_url, source_url, session_contexts, times_prescribed')
      .eq('user_id', user.id)
      .lte('tier', tier)
      .in('media_type', ['audio', 'custom_handler'])
      .contains('session_contexts', ['sleep'])
      .order('times_prescribed', { ascending: true })
      .limit(8);

    if (contentErr) {
      console.error('[sleep-prescription] Content query error:', contentErr.message);
      return res.status(500).json({ error: 'Failed to query content' });
    }

    const playlist = content ?? [];

    // ============================================
    // 4. Increment times_prescribed for selected content
    // ============================================

    if (playlist.length > 0) {
      const ids = playlist.map(c => c.id);
      for (const id of ids) {
        const row = playlist.find(c => c.id === id);
        await supabase
          .from('content_curriculum')
          .update({ times_prescribed: (row?.times_prescribed ?? 0) + 1 })
          .eq('id', id);
      }
    }

    // ============================================
    // 5. Create conditioning_sessions_v2 record
    // ============================================

    const sessionRecord = {
      user_id: user.id,
      session_type: 'sleep',
      content_ids: playlist.map(c => c.id),
      content_sequence: playlist.map((c, i) => ({
        contentId: c.id,
        order: i,
      })),
      device_active: false,
      scent_anchor_active: false,
      completed: false,
      confession_extracted: false,
      commitment_extracted: false,
      started_at: new Date().toISOString(),
    };

    const { data: session, error: sessionErr } = await supabase
      .from('conditioning_sessions_v2')
      .insert(sessionRecord)
      .select('id')
      .single();

    if (sessionErr) {
      console.error('[sleep-prescription] Session create error:', sessionErr.message);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    // ============================================
    // 6. Return prescription
    // ============================================

    return res.status(200).json({
      sessionId: session.id,
      tier,
      denialDay,
      streakDays,
      playlist: playlist.map(c => ({
        id: c.id,
        title: c.title,
        mediaType: c.media_type,
        category: c.category,
        tier: c.tier,
        intensity: c.intensity,
        durationMinutes: c.duration_minutes,
        audioUrl: c.audio_storage_url || c.source_url || null,
        sessionContexts: c.session_contexts,
      })),
    });
  } catch (err: any) {
    console.error('[sleep-prescription]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

// ============================================
// SHARED: Prompt builder (used by generate-script and batch-generate)
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
    3: 'Guided Exploration of Sensuality & Embodied Feminine Experience',
    4: 'Mindfulness Anchoring with Personalized Affirmation Phrases',
    5: 'Confidence Building for Authentic Self-Expression',
    6: 'Identity Consolidation & Self-Affirmation Practice',
  };

  const phaseTones: Record<number, string> = {
    1: 'Warm, gentle, nurturing. Build comfort and safety.',
    2: 'Confident, guiding. Affirm her authentic self.',
    3: 'Intimate, sensual. Guide her into body awareness, sensation, and self-discovery as a woman.',
    4: 'Focused, rhythmic. Anchor specific phrases through repetition and association. Each phrase is a mindfulness anchor.',
    5: 'Assured, social. Build confidence for expressing her authentic self in the world. She is seen.',
    6: 'Deeply present. She is whole. Consolidate and celebrate what already exists.',
  };

  return `Write a guided self-hypnosis and affirmation script for Maxy's personal audio library. This is her nightly ${target} practice.

HARD CONSTRAINT: Keep the script under 500 words. Approximately 2.5-3 minutes spoken. This is a constraint, not a suggestion. Shorter scripts with precise language are more effective than long scripts that dilute impact. Every word must earn its place.

## SESSION LEVEL: ${phase} — ${phaseNames[phase] || 'Affirmation'}
Tone: ${phaseTones[phase] || 'Warm and affirming.'}
Focus area: ${target}

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
- Embed 1-2 gentle intentions for tomorrow in the middle (e.g., "tomorrow when you look in the mirror, you'll see her more clearly")
- MAXIMUM 500 words. 2.5-3 minutes. Precision over length.

## STRUCTURE
1. Brief induction (3-4 sentences: breathing, settling)
2. Core affirmation (the concentrated message — this is the payload)
3. One tomorrow intention (embedded during deepest relaxation)
4. Gentle close (2-3 sentences: return or drift into sleep)

Write the complete script now. No preamble, no metadata — just the script text. Under 500 words.`;
}
