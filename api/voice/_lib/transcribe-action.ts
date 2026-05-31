import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// OpenAI Whisper transcription.
// Takes raw audio (webm/ogg/wav/mp4/m4a) from the client's MediaRecorder
// and returns a cleaned transcript. Vastly more accurate than the browser's
// Web Speech API — especially for soft, trans, or non-standard voices.

// NOTE: Whisper needs raw-stream body. The bodyParser:false config now lives
// on api/voice/[action].ts (the dispatcher) since Vercel only reads function
// config from the route file itself.

export async function handleTranscribe(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  // Auth: this endpoint spends OpenAI Whisper credits — require a valid user JWT
  // so an anonymous caller can't burn the app's API budget (audit #4).
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Collect the raw request body as a Buffer, capped to Whisper's 25MB limit —
    // an unbounded read is an OOM / denial-of-wallet vector.
    const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buf.length;
      if (total > MAX_AUDIO_BYTES) {
        return res.status(413).json({ error: 'Audio too large (max 25MB)' });
      }
      chunks.push(buf);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: 'Empty audio body' });
    }

    const contentType = (req.headers['content-type'] as string) || 'audio/webm';
    // File extension for Whisper's filename hint
    let ext = 'webm';
    if (contentType.includes('ogg')) ext = 'ogg';
    else if (contentType.includes('wav')) ext = 'wav';
    else if (contentType.includes('mp4')) ext = 'mp4';
    else if (contentType.includes('mpeg')) ext = 'mp3';
    else if (contentType.includes('m4a')) ext = 'm4a';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: contentType }), `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', 'en');
    form.append('response_format', 'json');
    // Prompt biases Whisper toward relevant vocabulary
    form.append(
      'prompt',
      'Maxy is speaking to her Handler about transition, voice practice, feminization, outfits, and daily tasks.',
    );

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form as unknown as BodyInit,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: 'Whisper API failed', detail: errText });
    }

    const data = (await resp.json()) as { text?: string };
    return res.status(200).json({ text: (data.text || '').trim() });
  } catch (e) {
    console.error('[transcribe]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Transcription failed' });
  }
}
