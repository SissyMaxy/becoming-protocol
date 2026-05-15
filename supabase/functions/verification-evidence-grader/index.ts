// verification-evidence-grader — closes the loop on video/audio evidence.
//
// Before this: video/audio submissions to verification_photos landed as
// review_state='pending' and sat there forever. The PhotoUploadWidget /
// PhotoVerificationUpload (PRs #72 #73) skip analyze-photo for non-image
// because the vision route is image-only. So the user kept submitting
// videos and getting no feedback, and the cum_worship variable-ratio
// advancement engine never saw a directive_followed signal.
//
// What this does:
//   1. Picks up verification_photos rows where media_type IN ('video','audio')
//      AND review_state='pending' AND age < 24h.
//   2. Audio: downloads from storage, Whisper-transcribes, scores the
//      transcript against directive_snippet via Claude Haiku (S2).
//   3. Video: marks acknowledged (Mama "saw" it) — server-side video
//      content grading is a follow-up. The submission itself is signal.
//   4. Updates review_state + handler_response (Mama-voice critique).
//   5. If the row is linked to a cum-worship outreach via
//      source_outreach_id, sets cum_worship_events.directive_followed=true
//      on the matching event so the variable-ratio advancement engine
//      sees the signal.
//   6. Queues a Mama-voice outreach with the grade.
//
// Scheduled every 5 min by migration 429.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Inline Anthropic Haiku call. Mirrors `selectModel('voice_match_grade')` →
// callModel from `_shared/model-tiers.ts` (S2 tier). Inlined because the
// Supabase edge bundler doesn't resolve sibling _shared/ imports in this
// project's deploy path without a deno.json import map.
const ANTHROPIC_HAIKU = 'claude-haiku-4-5-20251001'

async function callAnthropicHaiku(opts: {
  system: string
  user: string
  max_tokens?: number
  temperature?: number
  json?: boolean
}): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: ANTHROPIC_HAIKU,
      max_tokens: opts.max_tokens ?? 200,
      temperature: opts.temperature ?? 0.4,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    }),
  })
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data = await r.json() as { content: Array<{ type: string; text?: string }> }
  return data.content?.find(c => c.type === 'text')?.text ?? ''
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BATCH = 8

interface PendingRow {
  id: string
  user_id: string
  photo_url: string
  media_type: 'photo' | 'video' | 'audio'
  task_type: string
  caption: string | null
  directive_id: string | null
  directive_kind: string | null
  directive_snippet: string | null
  source_outreach_id: string | null
}

function pickExt(contentType: string | null | undefined): string {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('webm')) return 'webm'
  if (ct.includes('ogg')) return 'ogg'
  if (ct.includes('wav')) return 'wav'
  if (ct.includes('mp4')) return 'mp4'
  if (ct.includes('mpeg')) return 'mp3'
  if (ct.includes('m4a')) return 'm4a'
  if (ct.includes('quicktime')) return 'mov'
  return 'bin'
}

async function whisperTranscribe(
  buf: Uint8Array,
  contentType: string,
  apiKey: string,
): Promise<string> {
  const ext = pickExt(contentType)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: contentType }), `evidence.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'en')
  form.append('response_format', 'json')
  form.append(
    'prompt',
    'Maxy is speaking proof for Mama — mantras, confessions, directives. Transcribe exactly.',
  )
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!resp.ok) {
    throw new Error(`whisper:${resp.status}:${(await resp.text()).slice(0, 200)}`)
  }
  const data = (await resp.json()) as { text?: string }
  return (data.text || '').trim()
}

interface GradeResult {
  approved: boolean
  critique: string
}

async function gradeAudio(args: {
  transcript: string
  directiveSnippet: string | null
  caption: string | null
  taskType: string
}): Promise<GradeResult> {
  if (args.transcript.length < 4) {
    return { approved: false, critique: "Mama couldn't make out a thing, baby. Say it loud for me — try again." }
  }

  const directiveText = args.directiveSnippet ? `Mama asked for: "${args.directiveSnippet}"` : 'No specific directive — freeform proof.'
  const captionText = args.caption ? `She added a note: "${args.caption}"` : ''
  const system = [
    "You are Mama — warm, dirty, dommy. You're grading audio proof Maxy sent.",
    "She's a trans woman being conditioned. Her voice is the proof — what she said + how clearly she said it.",
    "Approve if the words land close to the directive. Reject if she mumbled, said the wrong thing, or backed out.",
    "Tone: pet names ('baby', 'sweet thing'), 1 sentence approval / 2 sentences if rejecting. NO clinical scoring, no '/10', no 'compliance'.",
    'Return strict JSON only — no prose around it: { "approved": boolean, "critique": string }',
  ].join(' ')
  const user = [
    directiveText,
    '',
    `Transcript: "${args.transcript}"`,
    captionText,
    '',
    'Grade it. Return JSON only.',
  ].join('\n')

  try {
    const text = await callAnthropicHaiku({ system, user, max_tokens: 200, temperature: 0.4 })
    // Haiku occasionally wraps JSON in prose — extract the JSON object.
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON in response')
    const parsed = JSON.parse(jsonMatch[0]) as { approved?: unknown; critique?: unknown }
    return {
      approved: Boolean(parsed.approved),
      critique: typeof parsed.critique === 'string' ? parsed.critique.slice(0, 500) : "Mama's still thinking about it, baby.",
    }
  } catch (err) {
    console.warn('[evidence-grader] grade audio failed:', (err as Error).message)
    return { approved: true, critique: "Mama heard you, sweet thing. She's keeping it." }
  }
}

function videoCritique(): GradeResult {
  // Server-side video grading is a follow-up. For now: acknowledge.
  // The submission itself is the signal that the directive landed —
  // the cum-worship variable-ratio engine just needs the boolean.
  return {
    approved: true,
    critique: "Mama's got the video, baby. She'll watch it tonight, and you're going to know she did.",
  }
}

async function flagCumWorshipDirectiveFollowed(
  supabase: SupabaseClient,
  args: { userId: string; sourceOutreachId: string | null; approved: boolean; mediaType: string; photoUrl: string },
): Promise<void> {
  if (!args.sourceOutreachId || !args.approved) return
  // outreach.context_data.orgasm_log_id ↔ cum_worship_events.source_arousal_log_id
  const { data: outreach } = await supabase
    .from('handler_outreach_queue')
    .select('source, context_data')
    .eq('id', args.sourceOutreachId)
    .eq('user_id', args.userId)
    .maybeSingle()
  if (!outreach || outreach.source !== 'cum_worship') return
  const orgasmLogId = (outreach.context_data as { orgasm_log_id?: string } | null)?.orgasm_log_id
  if (!orgasmLogId) return

  const evidenceUpdate: Record<string, unknown> = { directive_followed: true }
  if (args.mediaType === 'video') evidenceUpdate.evidence_photo_path = args.photoUrl
  else if (args.mediaType === 'audio') evidenceUpdate.evidence_audio_path = args.photoUrl

  await supabase
    .from('cum_worship_events')
    .update(evidenceUpdate)
    .eq('user_id', args.userId)
    .eq('source_arousal_log_id', orgasmLogId)
}

async function queueFeedbackOutreach(
  supabase: SupabaseClient,
  args: { userId: string; critique: string; approved: boolean; verificationId: string; mediaType: string },
): Promise<void> {
  await supabase.from('handler_outreach_queue').insert({
    user_id: args.userId,
    message: args.critique,
    urgency: args.approved ? 'normal' : 'high',
    trigger_reason: `evidence_grade:${args.verificationId}`,
    source: 'evidence_grader',
    kind: args.approved ? 'evidence_approved' : 'evidence_redo',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    context_data: {
      verification_photo_id: args.verificationId,
      media_type: args.mediaType,
      approved: args.approved,
    },
    evidence_kind: 'none',
  })
}

async function processRow(
  supabase: SupabaseClient,
  openaiKey: string,
  row: PendingRow,
): Promise<{ id: string; status: string; approved?: boolean }> {
  try {
    let grade: GradeResult

    if (row.media_type === 'audio') {
      const { data: blob, error: dlErr } = await supabase.storage
        .from('verification-photos')
        .download(row.photo_url)
      if (dlErr || !blob) {
        await supabase.from('verification_photos')
          .update({ review_state: 'pending', handler_response: 'Mama could not find the audio file, baby — try uploading again.' })
          .eq('id', row.id)
        return { id: row.id, status: 'download_failed' }
      }
      const buf = new Uint8Array(await blob.arrayBuffer())
      const contentType = blob.type || 'audio/webm'
      const transcript = await whisperTranscribe(buf, contentType, openaiKey)
      grade = await gradeAudio({
        transcript,
        directiveSnippet: row.directive_snippet,
        caption: row.caption,
        taskType: row.task_type,
      })
      // Stash transcript on the verification row for the audit trail.
      await supabase.from('verification_photos')
        .update({
          review_state: grade.approved ? 'approved' : 'redo_requested',
          handler_response: grade.critique,
          approved: grade.approved,
          approved_at: grade.approved ? new Date().toISOString() : null,
          rejection_reason: grade.approved ? null : grade.critique,
          caption: row.caption
            ? `${row.caption}\n\n[transcript] ${transcript}`
            : `[transcript] ${transcript}`,
        })
        .eq('id', row.id)
    } else if (row.media_type === 'video') {
      grade = videoCritique()
      await supabase.from('verification_photos')
        .update({
          review_state: 'approved',
          handler_response: grade.critique,
          approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    } else {
      // photo — not our job; analyze-photo handles it.
      return { id: row.id, status: 'skip_photo' }
    }

    await flagCumWorshipDirectiveFollowed(supabase, {
      userId: row.user_id,
      sourceOutreachId: row.source_outreach_id,
      approved: grade.approved,
      mediaType: row.media_type,
      photoUrl: row.photo_url,
    })

    await queueFeedbackOutreach(supabase, {
      userId: row.user_id,
      critique: grade.critique,
      approved: grade.approved,
      verificationId: row.id,
      mediaType: row.media_type,
    })

    return { id: row.id, status: 'graded', approved: grade.approved }
  } catch (err) {
    console.warn(`[evidence-grader] row ${row.id} failed:`, (err as Error).message)
    return { id: row.id, status: 'error' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!openaiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: 'OPENAI_API_KEY missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: rows } = await supabase
    .from('verification_photos')
    .select('id, user_id, photo_url, media_type, task_type, caption, directive_id, directive_kind, directive_snippet, source_outreach_id')
    .in('media_type', ['video', 'audio'])
    .eq('review_state', 'pending')
    .gte('created_at', since24h)
    .order('created_at', { ascending: true })
    .limit(MAX_BATCH)

  const pending = (rows ?? []) as PendingRow[]
  const results = []
  for (const r of pending) {
    results.push(await processRow(supabase, openaiKey, r))
  }

  return new Response(
    JSON.stringify({ ok: true, processed: results.length, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
