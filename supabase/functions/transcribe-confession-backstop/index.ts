// transcribe-confession-backstop — picks up confession_queue rows whose
// audio uploaded successfully but whose transcription never landed (the
// inline path in /api/voice/confession-upload either timed out or hit a
// transient Whisper error). Cron every minute via pg_cron (mig 314).
//
// Selection: audio_storage_path IS NOT NULL
//            AND transcription_status = 'pending'
//            AND created_at > now() - 24h     (don't grind on ancient rows)
//            AND transcription_attempt_count < 3
//
// Per row: download audio from storage via service role, post to Whisper,
// update transcribed_text + transcribed_at + transcription_status='done'.
// Failure increments the attempt count; after 3 strikes mark 'failed'.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ATTEMPTS = 3

interface PendingRow {
  id: string
  user_id: string
  audio_storage_path: string
  audio_mime_type: string | null
  transcription_attempt_count: number
}

function pickExt(contentType: string): string {
  if (contentType.includes('ogg')) return 'ogg'
  if (contentType.includes('wav')) return 'wav'
  if (contentType.includes('mp4')) return 'mp4'
  if (contentType.includes('mpeg')) return 'mp3'
  if (contentType.includes('m4a')) return 'm4a'
  return 'webm'
}

async function whisper(buf: Uint8Array, contentType: string, apiKey: string): Promise<string> {
  const ext = pickExt(contentType)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: contentType }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'en')
  form.append('response_format', 'json')
  form.append(
    'prompt',
    'Maxy is speaking to her Handler about transition, voice practice, feminization, outfits, and daily tasks.',
  )
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`whisper:${resp.status}:${txt.slice(0, 200)}`)
  }
  const data = await resp.json() as { text?: string }
  return (data.text || '').trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: rows } = await supabase
    .from('confession_queue')
    .select('id, user_id, audio_storage_path, audio_mime_type, transcription_attempt_count')
    .not('audio_storage_path', 'is', null)
    .eq('transcription_status', 'pending')
    .gte('created_at', since24h)
    .lt('transcription_attempt_count', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(10)

  const pending = (rows ?? []) as PendingRow[]
  let done = 0
  let failed = 0

  for (const r of pending) {
    const newAttempt = (r.transcription_attempt_count ?? 0) + 1
    try {
      const { data: blob, error: dlErr } = await supabase
        .storage.from('audio').download(r.audio_storage_path)
      if (dlErr || !blob) throw new Error(`download:${dlErr?.message ?? 'no_blob'}`)

      const buf = new Uint8Array(await blob.arrayBuffer())
      const contentType = r.audio_mime_type || 'audio/webm'
      const text = await whisper(buf, contentType, apiKey)

      await supabase.from('confession_queue').update({
        transcribed_text: text,
        transcribed_at: new Date().toISOString(),
        transcription_status: 'done',
        transcription_attempt_count: newAttempt,
      }).eq('id', r.id)
      done++
    } catch (err) {
      const finalStatus = newAttempt >= MAX_ATTEMPTS ? 'failed' : 'pending'
      await supabase.from('confession_queue').update({
        transcription_status: finalStatus,
        transcription_attempt_count: newAttempt,
      }).eq('id', r.id)
      if (finalStatus === 'failed') failed++
      console.error(`[transcribe-backstop] ${r.id} attempt=${newAttempt} err=`, err instanceof Error ? err.message : err)
    }
  }

  return new Response(JSON.stringify({
    ok: true, processed: pending.length, done, failed,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
