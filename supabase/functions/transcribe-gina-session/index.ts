// transcribe-gina-session — Supabase Edge Function
//
// Called right after the client uploads a Gina session recording to the
// `gina-sessions` private bucket. This function:
//   1. Signs a download URL for the uploaded audio
//   2. Submits it to AssemblyAI with speaker diarization enabled
//   3. Polls until done (AssemblyAI typical ~0.5x real-time)
//   4. Writes diarized utterances + speaker_ids back into gina_session_recordings
//   5. Deletes the audio blob (transcript is the persistent artifact)
//
// The user then reviews the transcript in the UI, taps "Gina = Speaker B",
// which kicks off decipher-gina-session.
//
// Required env: ASSEMBLYAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Req { session_id: string }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_id }: Req = await req.json()
    if (!session_id) throw new Error('session_id required')

    const aaKey = Deno.env.get('ASSEMBLYAI_API_KEY')
    if (!aaKey) throw new Error('ASSEMBLYAI_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Load the session row
    const { data: session, error: loadErr } = await supabase
      .from('gina_session_recordings')
      .select('*')
      .eq('id', session_id)
      .single()
    if (loadErr || !session) throw new Error(`session not found: ${loadErr?.message}`)
    if (!session.storage_path) throw new Error('session has no storage_path')

    await supabase.from('gina_session_recordings')
      .update({ status: 'transcribing', updated_at: new Date().toISOString() })
      .eq('id', session_id)

    // Signed URL for AssemblyAI to fetch
    const { data: signed, error: signErr } = await supabase.storage
      .from('gina-sessions')
      .createSignedUrl(session.storage_path, 3600)
    if (signErr || !signed?.signedUrl) throw new Error(`signed url failed: ${signErr?.message}`)

    // Submit to AssemblyAI
    const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { 'authorization': aaKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        speaker_labels: true,
        sentiment_analysis: true,
        language_detection: true,
        disfluencies: false,
      }),
    })
    const submitJson = await submitRes.json()
    if (!submitRes.ok || !submitJson.id) {
      throw new Error(`AssemblyAI submit failed: ${JSON.stringify(submitJson)}`)
    }

    // Poll up to ~4 minutes
    const transcriptId = submitJson.id
    let result: Record<string, unknown> | null = null
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise(r => setTimeout(r, 2000))
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'authorization': aaKey },
      })
      const pollJson = await pollRes.json()
      if (pollJson.status === 'completed') { result = pollJson; break }
      if (pollJson.status === 'error') {
        throw new Error(`AssemblyAI transcription error: ${pollJson.error}`)
      }
    }
    if (!result) throw new Error('AssemblyAI polling timeout')

    // Extract utterances
    const utterances = Array.isArray((result as any).utterances) ? (result as any).utterances : []
    const speakerSet = new Set<string>()
    const normalized = utterances.map((u: any) => {
      speakerSet.add(u.speaker)
      return {
        speaker: u.speaker,
        start_ms: u.start,
        end_ms: u.end,
        text: u.text,
        sentiment: u.sentiment ?? null,
        confidence: u.confidence ?? null,
      }
    })

    const duration = (result as any).audio_duration
      ? Math.round((result as any).audio_duration)
      : session.duration_seconds

    // Write transcript back
    await supabase.from('gina_session_recordings')
      .update({
        status: 'pending_review',
        transcript_text: (result as any).text ?? normalized.map((u: any) => `[${u.speaker}] ${u.text}`).join('\n'),
        transcript_utterances: normalized,
        speaker_ids: Array.from(speakerSet),
        duration_seconds: duration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session_id)

    // Delete the audio blob — transcript is canonical from here on
    await supabase.storage.from('gina-sessions').remove([session.storage_path])
    await supabase.from('gina_session_recordings')
      .update({ storage_path: null })
      .eq('id', session_id)

    return new Response(JSON.stringify({
      ok: true,
      session_id,
      utterance_count: normalized.length,
      speakers: Array.from(speakerSet),
      duration_seconds: duration,
    }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('transcribe-gina-session failed:', message)

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      const body = await req.clone().json().catch(() => ({})) as { session_id?: string }
      if (body.session_id) {
        await supabase.from('gina_session_recordings')
          .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
          .eq('id', body.session_id)
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
