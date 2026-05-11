import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Confession audio upload + transcription.
//
// Flow:
//   1. Auth via Bearer (same pattern as handler/chat).
//   2. Read query params: confession_id, duration_sec.
//   3. Read raw audio body (bodyParser disabled at the dispatcher).
//   4. Verify the row belongs to the user (RLS would also block, but we
//      check first to fail fast and not write to storage on a bad id).
//   5. Upload to audio bucket at `confessions/<user_id>/<confession_id>.webm`.
//   6. Stamp the row: audio_storage_path, audio_duration_sec,
//      audio_mime_type, audio_uploaded_at, transcription_status='pending',
//      and (since spec says "don't block the confession submission on
//      transcription") confessed_at if not already set.
//   7. Return 202 immediately so the client sees a fast confirmation.
//   8. After the response is queued, fire Whisper inline; on completion
//      update transcribed_text + transcribed_at + transcription_status='done'.
//      A 1-minute pg_cron backstop (`transcribe-confession-backstop`)
//      retries any rows still pending after Vercel kills the function.
//
// NOTE: Cannot import from src/lib — those use import.meta.env (Vite).

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB hard ceiling
const MAX_DURATION_SEC = 600; // 10 min hard ceiling

function pickExt(contentType: string): string {
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('mpeg')) return 'mp3';
  if (contentType.includes('m4a')) return 'm4a';
  return 'webm';
}

async function transcribeWithWhisper(buf: Buffer, contentType: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const ext = pickExt(contentType);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: contentType }), `audio.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  form.append('response_format', 'json');
  form.append(
    'prompt',
    'Maxy is speaking to her Handler about transition, voice practice, feminization, outfits, and daily tasks.',
  );
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form as unknown as BodyInit,
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`whisper:${resp.status}:${errText.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { text?: string };
  return (data.text || '').trim();
}

export async function handleConfessionUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  const { data: authData, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !authData.user) return res.status(401).json({ error: 'Invalid token' });
  const userId = authData.user.id;

  // Query params
  const confessionId = (req.query.confession_id as string) || '';
  const durationParam = parseInt((req.query.duration_sec as string) || '0', 10);
  const durationSec = Number.isFinite(durationParam) ? Math.max(0, Math.min(durationParam, MAX_DURATION_SEC)) : 0;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(confessionId)) {
    return res.status(400).json({ error: 'Bad confession_id' });
  }

  // Verify ownership of the row before writing storage
  const { data: row, error: rowErr } = await supabase
    .from('confession_queue')
    .select('id, user_id, audio_storage_path')
    .eq('id', confessionId)
    .maybeSingle();
  if (rowErr || !row) return res.status(404).json({ error: 'Confession not found' });
  if ((row as { user_id: string }).user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

  // Collect raw audio
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += b.length;
    if (total > MAX_AUDIO_BYTES) return res.status(413).json({ error: 'Audio too large' });
    chunks.push(b);
  }
  const audio = Buffer.concat(chunks);
  if (audio.length === 0) return res.status(400).json({ error: 'Empty audio body' });

  const contentType = (req.headers['content-type'] as string) || 'audio/webm';
  const ext = pickExt(contentType);
  const path = `confessions/${userId}/${confessionId}.${ext}`;

  // Upload to private audio bucket (service role bypasses RLS).
  const { error: upErr } = await supabase.storage.from('audio').upload(path, audio, {
    contentType,
    upsert: true,
  });
  if (upErr) {
    return res.status(500).json({ error: 'Storage upload failed', detail: upErr.message });
  }

  // Stamp the row. Confess timestamp lands now if not already set —
  // recording-and-releasing IS the act of confession; we don't make
  // her also click a Submit button.
  const stamp: Record<string, unknown> = {
    audio_storage_path: path,
    audio_duration_sec: durationSec || null,
    audio_mime_type: contentType,
    audio_uploaded_at: new Date().toISOString(),
    transcription_status: 'pending',
  };
  // Only set confessed_at if it was null — preserves any prior text submission timestamp.
  await supabase
    .from('confession_queue')
    .update({ ...stamp, confessed_at: new Date().toISOString() })
    .eq('id', confessionId)
    .is('confessed_at', null);
  // If confessed_at was already set, the above no-ops; still write the audio fields.
  await supabase
    .from('confession_queue')
    .update(stamp)
    .eq('id', confessionId)
    .not('confessed_at', 'is', null);

  // Fire transcription inline. Vercel keeps the function running long
  // enough for short clips; if it times out, the backstop cron picks
  // it up. Caller doesn't wait — we respond first so UI stays snappy.
  const transcribePromise = (async () => {
    try {
      const text = await transcribeWithWhisper(audio, contentType);
      await supabase
        .from('confession_queue')
        .update({
          transcribed_text: text,
          transcribed_at: new Date().toISOString(),
          transcription_status: 'done',
          transcription_attempt_count: 1,
        })
        .eq('id', confessionId);
    } catch (e) {
      await supabase
        .from('confession_queue')
        .update({
          transcription_status: 'pending', // backstop will retry
          transcription_attempt_count: 1,
        })
        .eq('id', confessionId);
      console.error('[confession-upload] inline transcribe failed:', e instanceof Error ? e.message : e);
    }
  })();

  // We could `res.status(202).json(...)` then await — but Vercel may
  // freeze the function the moment the response is flushed. Awaiting
  // BEFORE responding gives short clips a chance to land transcription
  // in the same request (so the client can show the transcript without
  // polling). Cap the wait at 7s; backstop handles overruns.
  const TIMED_OUT = Symbol('timed_out');
  const racy = await Promise.race([
    transcribePromise.then(() => 'done' as const),
    new Promise<typeof TIMED_OUT>(resolve => setTimeout(() => resolve(TIMED_OUT), 7_000)),
  ]);

  if (racy === TIMED_OUT) {
    return res.status(202).json({
      ok: true,
      confession_id: confessionId,
      audio_path: path,
      transcribing: true, // client should poll the row
    });
  }
  // racy === 'done' — read the just-written row so client gets transcript without a round-trip
  const { data: fresh } = await supabase
    .from('confession_queue')
    .select('transcribed_text, transcription_status, audio_storage_path')
    .eq('id', confessionId)
    .maybeSingle();
  return res.status(200).json({
    ok: true,
    confession_id: confessionId,
    audio_path: path,
    transcript: (fresh as { transcribed_text?: string } | null)?.transcribed_text ?? '',
    transcription_status: (fresh as { transcription_status?: string } | null)?.transcription_status ?? 'done',
  });
}
