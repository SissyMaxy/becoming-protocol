import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Text-to-Speech endpoint — converts an existing script to audio.
 * Accepts either a scriptId (loads from DB) or raw scriptText.
 * Runs ElevenLabs TTS + uploads to Supabase storage.
 */
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

    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
      return res.status(500).json({ error: 'ElevenLabs not configured' });
    }

    const { scriptId, scriptText: rawText, phase = 1, target = 'identity' } = req.body as {
      scriptId?: string;
      scriptText?: string;
      phase?: number;
      target?: string;
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
