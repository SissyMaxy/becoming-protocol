// decipher-gina-session — Supabase Edge Function
//
// Called after the user taps "Gina = Speaker X" in the review UI. This function:
//   1. Loads the tagged transcript from gina_session_recordings
//   2. Asks Claude to extract, in one pass:
//        - each of Gina's lines as a voice sample with inferred tone + topic
//        - each observed reaction to something Maxy said
//        - any trigger keywords that surfaced in her speech
//        - any soft-spot topics she naturally opened on
//        - a one-paragraph digest for the Handler's next turn
//   3. Writes the extractions to gina_voice_samples + gina_reactions
//   4. Updates the session row to status='processed'
//
// Required env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Req { session_id: string; gina_speaker: string }

interface Utterance { speaker: string; start_ms: number; end_ms: number; text: string; sentiment?: string | null }

interface Extraction {
  quotes: Array<{ text: string; tone: string | null; topic: string | null; channel: string }>
  reactions: Array<{ move_summary: string; reaction: 'positive'|'neutral'|'stalled'|'hostile'|'unknown'; reaction_detail: string | null; move_kind: string }>
  flagged_triggers: string[]
  flagged_soft_spots: string[]
  digest: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_id, gina_speaker }: Req = await req.json()
    if (!session_id || !gina_speaker) throw new Error('session_id and gina_speaker required')

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: session, error: loadErr } = await supabase
      .from('gina_session_recordings')
      .select('*')
      .eq('id', session_id)
      .single()
    if (loadErr || !session) throw new Error(`session not found: ${loadErr?.message}`)

    const utterances = (session.transcript_utterances || []) as Utterance[]
    if (utterances.length === 0) throw new Error('no transcript to decipher')

    const maxySpeakers = (session.speaker_ids || []).filter((s: string) => s !== gina_speaker)
    const maxySpeaker = maxySpeakers[0] ?? null

    await supabase.from('gina_session_recordings')
      .update({
        status: 'deciphering',
        gina_speaker,
        maxy_speaker: maxySpeaker,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session_id)

    // Load Gina profile for trigger/soft-spot vocabulary
    const { data: profile } = await supabase
      .from('gina_profile')
      .select('triggers, soft_spots, red_lines, affection_language, tone_register')
      .eq('user_id', session.user_id)
      .maybeSingle()

    const triggers = ((profile as any)?.triggers || []) as string[]
    const softSpots = ((profile as any)?.soft_spots || []) as string[]
    const redLines = ((profile as any)?.red_lines || []) as string[]

    // Format transcript with speaker labels (GINA / MAXY) for clarity in the prompt
    const labeledTranscript = utterances.map(u => {
      const label = u.speaker === gina_speaker ? 'GINA'
        : u.speaker === maxySpeaker ? 'MAXY'
        : `SPEAKER_${u.speaker}`
      return `[${label}] ${u.text}`
    }).join('\n')

    const prompt = `You are processing a discreetly-captured real conversation between Maxy (the user, pre-HRT, undergoing forced-feminization) and his wife Gina. Extract the following in ONE JSON response.

CONTEXT — Maxy's existing Gina profile:
- known triggers (avoid pushing on these): ${triggers.join(', ') || '(none logged yet)'}
- known soft spots (she opens on these): ${softSpots.join(', ') || '(none logged yet)'}
- red lines (inviolable consent boundaries): ${redLines.join(', ') || '(none logged yet)'}
- affection language: ${(profile as any)?.affection_language || '(unknown)'}

TRANSCRIPT (speaker labels already assigned):
${labeledTranscript}

Extract and return ONLY a JSON object matching this schema:
{
  "quotes": [
    { "text": "<Gina's exact words, verbatim>", "tone": "<one of: warm, sharp, dismissive, curious, annoyed, tender, sarcastic, neutral — infer from context>", "topic": "<one of: body, sex, money, daily life, feminization, work, family, feelings, other>", "channel": "in_person" }
  ],
  "reactions": [
    { "move_summary": "<what Maxy said/did that prompted her reaction, ≤100 chars>", "reaction": "<positive|neutral|stalled|hostile|unknown>", "reaction_detail": "<her response summarized in one sentence>", "move_kind": "<warmup|disclosure|hrt_reveal|ask|other>" }
  ],
  "flagged_triggers": ["<any trigger keyword Maxy's profile lists that surfaced in her speech>"],
  "flagged_soft_spots": ["<any soft-spot topic she naturally opened on>"],
  "digest": "<one-paragraph summary written in third person for the Handler: what was discussed, her emotional state, any openings or closings on the feminization track. 3-5 sentences.>"
}

Rules:
- Extract EVERY distinct Gina utterance as a quote. Do not paraphrase — copy exact words. Merge consecutive utterances from her only if they are one continuous thought.
- For reactions: only emit one when Maxy said/did something specific that she responded to. Do not fabricate reactions to things Maxy did not say.
- For flagged_triggers / flagged_soft_spots: match against the known lists above, not freelance inference.
- digest should give the Handler enough context to reference the conversation naturally on his next turn without summarizing Maxy's own lines.
- Return ONLY the JSON. No markdown fences, no prose before/after.`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const claudeJson = await claudeRes.json()
    if (!claudeRes.ok) throw new Error(`Anthropic error: ${JSON.stringify(claudeJson)}`)

    const textContent = claudeJson?.content?.[0]?.text ?? ''
    const jsonMatch = textContent.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`Claude returned no JSON: ${textContent.slice(0, 400)}`)

    let extraction: Extraction
    try {
      extraction = JSON.parse(jsonMatch[0])
    } catch (e) {
      throw new Error(`Claude JSON parse failed: ${(e as Error).message} — raw: ${jsonMatch[0].slice(0, 400)}`)
    }

    const userId = session.user_id

    // Insert quotes
    let quotesInserted = 0
    if (Array.isArray(extraction.quotes) && extraction.quotes.length > 0) {
      const rows = extraction.quotes
        .filter(q => q.text && q.text.trim().length >= 2)
        .map(q => ({
          user_id: userId,
          quote: q.text.trim(),
          tone: q.tone || null,
          topic: q.topic || null,
          channel: q.channel || 'in_person',
          context: `From captured session ${new Date(session.recorded_at).toISOString().slice(0, 10)}`,
          session_id,
        }))
      if (rows.length > 0) {
        const { error } = await supabase.from('gina_voice_samples').insert(rows)
        if (!error) quotesInserted = rows.length
      }
    }

    // Insert reactions
    let reactionsInserted = 0
    if (Array.isArray(extraction.reactions) && extraction.reactions.length > 0) {
      const rows = extraction.reactions
        .filter(r => r.move_summary && r.reaction)
        .map(r => ({
          user_id: userId,
          move_kind: r.move_kind || 'other',
          move_summary: r.move_summary.slice(0, 500),
          channel: 'in_person',
          reaction: ['positive','neutral','stalled','hostile','unknown'].includes(r.reaction) ? r.reaction : 'unknown',
          reaction_detail: r.reaction_detail ?? null,
          session_id,
        }))
      if (rows.length > 0) {
        const { error } = await supabase.from('gina_reactions').insert(rows)
        if (!error) reactionsInserted = rows.length
      }
    }

    await supabase.from('gina_session_recordings')
      .update({
        status: 'processed',
        digest: extraction.digest ?? null,
        extracted_quotes_count: quotesInserted,
        extracted_reactions_count: reactionsInserted,
        flagged_triggers: Array.isArray(extraction.flagged_triggers) ? extraction.flagged_triggers : [],
        flagged_soft_spots: Array.isArray(extraction.flagged_soft_spots) ? extraction.flagged_soft_spots : [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', session_id)

    // Kick the playbook planner so the Handler reacts to what she just said
    try {
      const url = Deno.env.get('SUPABASE_URL') ?? ''
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      await fetch(`${url}/functions/v1/gina-playbook-planner`, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: userId, trigger: `session_processed:${session_id}` }),
      })
    } catch (err) {
      console.error('playbook planner kick failed:', err)
    }

    return new Response(JSON.stringify({
      ok: true,
      session_id,
      quotes_inserted: quotesInserted,
      reactions_inserted: reactionsInserted,
      digest: extraction.digest ?? null,
    }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('decipher-gina-session failed:', message)

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
