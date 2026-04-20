import type { VercelRequest, VercelResponse } from '@vercel/node';

// OpenAI Whisper transcription.
// Takes raw audio (webm/ogg/wav/mp4/m4a) from the client's MediaRecorder
// and returns a cleaned transcript. Vastly more accurate than the browser's
// Web Speech API — especially for soft, trans, or non-standard voices.

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  try {
    // Collect the raw request body as a Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
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
