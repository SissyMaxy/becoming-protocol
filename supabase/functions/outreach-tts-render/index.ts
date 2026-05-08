// outreach-tts-render — render Mommy's outreach text to ElevenLabs audio.
//
// Invoked fire-and-forget by the AFTER INSERT trigger on
// handler_outreach_queue (migration 259) and by the backfill script.
//
// POST { outreach_id: string }
//   - loads the row, looks up today's mommy_mood.affect, computes per-affect
//     ElevenLabs voice settings, calls TTS, uploads to the audio bucket,
//     updates the row with audio_url + voice_settings_used + tts_status.
//   - idempotent: skips rows already marked rendering / ready / skipped.
//   - never throws to the caller; failures land as tts_status='failed' +
//     tts_error so the queue stays drainable.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { affectToVoiceSettings } from '../_shared/mommy-voice-settings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Hard cap to keep ElevenLabs cost predictable + matches the chat-surface
// 500-char TTS cap. Outreach is short by design; longer messages get
// truncated at the last word boundary.
const MAX_TTS_CHARS = 600

function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
}

function cleanForTts(raw: string): string {
  // Strip pacing markers borrowed from the conditioning script format,
  // markdown bold/italic, and stray emojis that ElevenLabs reads aloud.
  return mommyVoiceCleanup(raw)
    .replace(/\[pause\]/gi, '...')
    .replace(/\[breathe\s*(in|out)\]/gi, '...')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

interface OutreachRow {
  id: string
  user_id: string
  message: string
  audio_url: string | null
  tts_status: string | null
}

interface MoodRow {
  affect: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { outreach_id?: string } = {}
  try { body = await req.json() } catch { /* empty */ }
  const outreachId = body.outreach_id
  if (!outreachId) {
    return new Response(JSON.stringify({ ok: false, error: 'outreach_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID')
  if (!elevenKey || !voiceId) {
    return new Response(JSON.stringify({ ok: false, error: 'ElevenLabs not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Atomically claim the row: only proceed if status is still 'pending' and
  // no audio_url present. This prevents double-render when both the trigger
  // and the backfill script touch the same row.
  const { data: claim } = await supabase
    .from('handler_outreach_queue')
    .update({ tts_status: 'rendering', tts_attempted_at: new Date().toISOString() })
    .eq('id', outreachId)
    .eq('tts_status', 'pending')
    .is('audio_url', null)
    .select('id, user_id, message, audio_url, tts_status')
    .maybeSingle()

  if (!claim) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_handled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const row = claim as OutreachRow

  try {
    // Pick today's affect to tune the voice. Fall back to defaults if no
    // mood row exists yet for this user/day.
    const today = new Date().toISOString().slice(0, 10)
    const { data: moodData } = await supabase
      .from('mommy_mood')
      .select('affect')
      .eq('user_id', row.user_id)
      .eq('mood_date', today)
      .maybeSingle()
    const affect = (moodData as MoodRow | null)?.affect ?? null
    const voiceSettings = affectToVoiceSettings(affect)

    const cleaned = cleanForTts(row.message)
    if (cleaned.length < 10) {
      await supabase.from('handler_outreach_queue').update({
        tts_status: 'skipped',
        tts_error: 'message_too_short_after_cleanup',
      }).eq('id', row.id)
      return new Response(JSON.stringify({ ok: true, skipped: 'too_short' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const text = truncateAtWordBoundary(cleaned, MAX_TTS_CHARS)

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: voiceSettings,
        }),
      },
    )

    if (!ttsRes.ok) {
      const detail = await ttsRes.text().catch(() => 'unknown')
      await supabase.from('handler_outreach_queue').update({
        tts_status: 'failed',
        tts_error: `elevenlabs_${ttsRes.status}:${detail.slice(0, 200)}`,
      }).eq('id', row.id)
      return new Response(JSON.stringify({ ok: false, error: `ElevenLabs ${ttsRes.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const audioBuffer = new Uint8Array(await ttsRes.arrayBuffer())
    const fileName = `mommy-outreach/${row.user_id}/${row.id}.mp3`

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) {
      await supabase.from('handler_outreach_queue').update({
        tts_status: 'failed',
        tts_error: `upload:${uploadErr.message.slice(0, 200)}`,
      }).eq('id', row.id)
      return new Response(JSON.stringify({ ok: false, error: `upload: ${uploadErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName)
    const audioUrl = urlData.publicUrl

    await supabase.from('handler_outreach_queue').update({
      audio_url: audioUrl,
      voice_settings_used: { affect, voice_id: voiceId, ...voiceSettings },
      tts_status: 'ready',
      tts_error: null,
    }).eq('id', row.id)

    return new Response(JSON.stringify({
      ok: true,
      outreach_id: row.id,
      audio_url: audioUrl,
      affect,
      voice_settings: voiceSettings,
      audio_bytes: audioBuffer.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('handler_outreach_queue').update({
      tts_status: 'failed',
      tts_error: `exception:${msg.slice(0, 200)}`,
    }).eq('id', row.id)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
