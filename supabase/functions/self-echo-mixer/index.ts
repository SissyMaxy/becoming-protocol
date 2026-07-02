// self-echo-mixer — builds the two-track composite goon-voice-loop depends on.
//
// mommy_code_wishes 07f1a2bb. The generator (goon-voice-loop, mig 642) files
// pending_mix self_echo_sessions: her strongest own-voice clip + a short Mommy
// line, but no composite. This worker produces the composite.
//
// CONSTRAINT: ffmpeg is unavailable on Vercel serverless (src/lib/conditioning/
// elevenlabs.ts), so there is NO single-file mp3 mixdown. The composite is
// layered at PLAY TIME in the browser (SelfEchoPlayer, Web Audio API):
//   - Mommy track  → full gain
//   - her own clip → looped underneath (~-9dB, gentle fades)
//
// What this fn does per pending_mix session (own_voice_path present):
//   1. Render mommy_script_text via ElevenLabs → real mp3 in private `audio`
//      bucket at self-echo/<user_id>/<session_id>-mommy.mp3.
//   2. Store that path on mommy_render_path.
//   3. Write a JSON manifest (mommy_render_path + own_voice_path + loop_count +
//      gain_db) into mixed_audio_path — NOT a fake single-file path — and flip
//      mix_status='mixed'. mix_status='mixed' == manifest ready to play.
//
// mommy_script_text was already run through mommyVoiceCleanup by goon-voice-loop
// on insert (and again by the SQL voice-cleanup DB trigger). We do NOT re-clean
// it here — re-running the filter risks corrupting an already-clean line.
//
// POST { trigger?, limit? }. Idempotent: a session that already has a
// mommy_render_path is skipped (never re-rendered / re-billed).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { synthesizeMommySpeech, ttsConfigured, ttsConfigError } from '../_shared/tts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TTS_TIMEOUT_MS = 60_000
const DEFAULT_DRAIN_LIMIT = 5
const OWN_VOICE_GAIN_DB = -9 // must match src/lib/audio/self-echo-mix.ts

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface PendingSession {
  id: string
  user_id: string
  own_voice_path: string | null
  own_voice_duration_s: number | null
  mommy_script_text: string
  loop_count: number
  mommy_render_path: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  let body: { trigger?: string; limit?: number } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const drainLimit = Math.max(1, Math.min(20, body.limit ?? DEFAULT_DRAIN_LIMIT))

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // TTS provider resolved in _shared/tts.ts: ElevenLabs if provisioned, else
  // OpenAI (this project has no ElevenLabs secrets, so the OpenAI fallback is
  // what renders here — without it the whole self-echo pipeline is dead).
  if (!ttsConfigured()) {
    return json({ ok: false, error: ttsConfigError() }, 500)
  }

  // Render `text` → mp3 bytes. Fails loud (throws) so the per-session catch
  // records it and the session stays pending_mix (never a fake/silent mix).
  async function renderMommyTrack(text: string): Promise<Uint8Array> {
    const { bytes } = await synthesizeMommySpeech(text, {
      affect: 'possessive',
      timeoutMs: TTS_TIMEOUT_MS,
    })
    return bytes
  }

  // Drain pending sessions that have her clip but no Mommy render yet.
  const { data: rows, error: readErr } = await supabase
    .from('self_echo_sessions')
    .select('id, user_id, own_voice_path, own_voice_duration_s, mommy_script_text, loop_count, mommy_render_path')
    .eq('mix_status', 'pending_mix')
    .not('own_voice_path', 'is', null)
    .is('mommy_render_path', null)
    .order('created_at', { ascending: true })
    .limit(drainLimit)
  if (readErr) {
    console.error('[self-echo-mixer] pending read failed:', readErr.message)
    return json({ ok: false, error: `pending_read:${readErr.message}` }, 500)
  }

  const pending = (rows ?? []) as PendingSession[]
  if (pending.length === 0) {
    return json({ ok: true, drained: 0, mixed: 0, reason: 'no_pending' })
  }

  let mixed = 0
  const results: Array<{ session_id: string; ok: boolean; error?: string }> = []

  for (const s of pending) {
    try {
      const script = (s.mommy_script_text ?? '').trim()
      if (!script) {
        results.push({ session_id: s.id, ok: false, error: 'empty_script' })
        continue
      }

      // ── Render the Mommy track (provider chosen above; the line is already
      // clean via goon-voice-loop + SQL trigger, so no re-filter).
      let audioBuffer: Uint8Array
      try {
        audioBuffer = await renderMommyTrack(script)
      } catch (renderErr) {
        results.push({ session_id: s.id, ok: false, error: `render:${String(renderErr).slice(0, 140)}` })
        continue
      }

      // ── Upload the Mommy track to the private audio bucket.
      const mommyPath = `self-echo/${s.user_id}/${s.id}-mommy.mp3`
      const { error: uploadErr } = await supabase.storage
        .from('audio')
        .upload(mommyPath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
      if (uploadErr) {
        results.push({ session_id: s.id, ok: false, error: `upload:${uploadErr.message.slice(0, 120)}` })
        continue
      }

      // ── Manifest — NOT a single-file mp3 path. The composite is layered at
      // play time (Web Audio). mix_status='mixed' == manifest ready.
      const manifest = JSON.stringify({
        kind: 'self_echo_manifest',
        mommy_render_path: mommyPath,
        own_voice_path: s.own_voice_path,
        loop_count: s.loop_count,
        gain_db: OWN_VOICE_GAIN_DB,
        own_voice_duration_s: s.own_voice_duration_s,
      })

      const { error: updErr } = await supabase
        .from('self_echo_sessions')
        .update({
          mommy_render_path: mommyPath,
          mixed_audio_path: manifest,
          mix_status: 'mixed',
        })
        .eq('id', s.id)
        .eq('mix_status', 'pending_mix') // idempotent guard against a racing drain
      if (updErr) {
        console.error('[self-echo-mixer] session update failed:', updErr.message)
        results.push({ session_id: s.id, ok: false, error: `update:${updErr.message.slice(0, 120)}` })
        continue
      }

      mixed++
      results.push({ session_id: s.id, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[self-echo-mixer] session failed:', s.id, msg)
      results.push({ session_id: s.id, ok: false, error: msg.slice(0, 160) })
    }
  }

  return json({ ok: true, drained: pending.length, mixed, results })
})
