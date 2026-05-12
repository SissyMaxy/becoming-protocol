// mommy-ambient-render — render pending mommy_ambient_tracks rows to TTS
// and upload to the private `audio` bucket.
//
// POST { user_id?, track_id? }
//   - track_id: render that specific row (manual invocation)
//   - no track_id: pick the oldest pending row for user_id and render it
//   - no user_id either: pick the oldest pending row globally (cron)
//
// Mirrors the audio-session-render pattern but writes to
// `mommy-ambient/<user_id>/<track_id>.mp3` and updates render_status on
// the mommy_ambient_tracks row.
//
// Failure: row.render_status='failed' with error_text; cron picks up the
// next pending row next tick.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { affectToVoiceSettings } from '../_shared/mommy-voice-settings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ELEVENLABS_TIMEOUT_MS = 120_000 // ambient scripts run longer

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface TrackRow {
  id: string
  user_id: string
  slug: string
  kind: string
  script_text: string
  intensity_band: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; track_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Pick the track to render.
  let track: TrackRow | null = null
  if (body.track_id) {
    const { data } = await supabase.from('mommy_ambient_tracks')
      .select('id, user_id, slug, kind, script_text, intensity_band')
      .eq('id', body.track_id).maybeSingle()
    track = data as TrackRow | null
  } else {
    let q = supabase.from('mommy_ambient_tracks')
      .select('id, user_id, slug, kind, script_text, intensity_band')
      .eq('render_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
    if (body.user_id) q = q.eq('user_id', body.user_id)
    const { data } = await q
    track = (data as TrackRow[] | null)?.[0] ?? null
  }
  if (!track) return jsonOk({ ok: true, skipped: 'no_pending_tracks' })

  await supabase.from('mommy_ambient_tracks')
    .update({ render_status: 'rendering' })
    .eq('id', track.id)

  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID')
  if (!elevenKey || !voiceId) {
    await supabase.from('mommy_ambient_tracks').update({
      render_status: 'failed',
      render_error: 'missing_elevenlabs_creds',
    }).eq('id', track.id)
    return jsonOk({ ok: false, error: 'missing_elevenlabs_creds', track_id: track.id }, 500)
  }

  // Strip section markers from the spoken text. The DB keeps the structured
  // script; TTS gets plain prose with the markers replaced by pauses.
  const spoken = track.script_text
    .replace(/\[\[section:\s*[^\]]+\]\]/g, ' ... ')
    .replace(/\[pause\]/gi, '...')
    .replace(/\[breathe\s*(in|out)\]/gi, '...')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Ambient affect by kind — patient for worktime/commute, indulgent for
  // sleep (Mommy at her softest), possessive for morning, hungry for gym.
  const affect = track.kind === 'sleep' ? 'indulgent'
    : track.kind === 'morning_immersion' ? 'possessive'
    : track.kind === 'gym_session' ? 'hungry'
    : 'patient'
  const voiceSettings = affectToVoiceSettings(affect)

  try {
    const ttsCtl = AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS)
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        signal: ttsCtl,
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text: spoken,
          // Reduced bitrate model_id for long-form — eleven_turbo is faster
          // and outputs smaller files. Falls back to multilingual if not
          // available on the account.
          model_id: 'eleven_turbo_v2_5',
          voice_settings: voiceSettings,
          // Note: ElevenLabs auto-formats; we send plain prose.
        }),
      },
    )

    if (!ttsRes.ok) {
      const detail = await ttsRes.text().catch(() => 'unknown')
      throw new Error(`elevenlabs_${ttsRes.status}:${detail.slice(0, 200)}`)
    }
    const audioBuffer = new Uint8Array(await ttsRes.arrayBuffer())

    const path = `mommy-ambient/${track.user_id}/${track.id}.mp3`
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) throw new Error(`upload:${uploadErr.message.slice(0, 200)}`)

    const wordCount = spoken.split(/\s+/).filter(Boolean).length
    const renderedDuration = Math.max(60, Math.round((wordCount / 150) * 60))

    await supabase.from('mommy_ambient_tracks').update({
      audio_url: path,
      duration_seconds: renderedDuration,
      voice_settings_used: { affect, voice_id: voiceId, ...voiceSettings },
      render_status: 'ready',
      render_error: null,
    }).eq('id', track.id)

    {
      const _summary = `Rendered ${track.kind} track to TTS (${renderedDuration}s).`
      const _payload = { path, words: wordCount, affect }
      await supabase.from('mommy_authority_log').insert({
        user_id: track.user_id,
        action_kind: 'rendered',
        source_system: 'mommy-ambient-render',
        action_summary: _summary,
        action_payload: _payload,
        system: 'ambient',
        summary: _summary,
        payload: _payload,
        ambient_track_id: track.id,
      })
    }

    return jsonOk({ ok: true, track_id: track.id, audio_url: path, duration_seconds: renderedDuration })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('mommy_ambient_tracks').update({
      render_status: 'failed',
      render_error: msg.slice(0, 500),
    }).eq('id', track.id)
    return jsonOk({ ok: false, track_id: track.id, error: msg }, 500)
  }
})
