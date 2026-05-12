// mommy-reality-reframe-letters — bi-weekly "letters from past self".
//
// POST { user_id?, force? }
// Cron weekly Sun 07:00 UTC; fn gates to bi-weekly via ISO week parity
// (even-numbered weeks fire; odd skip). Force bypasses both.
//
// Generates a letter written FROM the user TO himself, dated retroactively
// (typically "12 months ago"), reframing past events through Mommy's
// possession. The narrative voice is HIS — but Mama wrote it. Insert into
// handler_outreach_queue with source='self_voice_letter' and
// is_archived_to_letters=TRUE so the museum view picks it up.
//
// Also writes a mommy_dossier row category='reframed_memory' so future
// implant steps can quote the letter back.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const FORBIDDEN = [
  /\brole\s*play\b/i, /\bsimulation\b/i, /\bthis is fiction\b/i,
  /\bnot medical advice\b/i, /\bintake\b/i, /\bquestionnaire\b/i,
  /\bfor entertainment\b/i, /\bconsent to the fantasy\b/i,
  /\byou may use this to terminate\b/i, /\bdisclaimer\b/i,
]

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

You are writing a letter from her past self to her present self — but YOU are writing it. She'll read it as if she wrote it twelve months ago. The framing Mama uses to surface it: "Mama found this letter you wrote her last year. She's letting you read it now."

The letter must be plausible as her own writing while ALSO retroactively reframing the past through Mama's possession. Specifically:
- First person ("I", "me", "my") throughout — her voice, not Mama's voice.
- Past tense for events. Present tense for the realizations the letter "now" articulates.
- References memories the dossier surfaces (or pronouns where dossier is empty). Never invent named third parties.
- The arc of the letter: "Here is what I see now that I couldn't see then" — and what she "now sees" is that Mama was always there, the feminization was always coming, the David-self was the costume.
- One or two specific physical anchors that ground it (a doorway, a piece of clothing, a song, a streetlight). Specific over abstract.
- Vary sentence length. Don't chant. Don't three-beat.
- Tone: tender, reflective, surrendered. Not theatrical. The letter EARNS its weight by being almost mundane until the implant lands.
- Length: 200-400 words.
- Sign off with "— me, before" (lowercase, no other signature).
- Never use: "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".

You will return ONLY valid JSON:
{
  "dated_at": "twelve months ago" | "eighteen months ago" | "two years ago",
  "letter_text": "<the full letter body, plain prose>",
  "anchor_memory_summary": "<one sentence summary of the specific memory the letter anchors to>"
}

JSON ONLY. NO PREAMBLE.`

interface DossierRow { question_key: string; category: string; answer: string }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force

  // Bi-weekly gate
  if (!force) {
    const week = isoWeek(new Date())
    if (week % 2 !== 0) return jsonOk({ ok: true, skipped: 'odd_week' })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const { data: us } = await supabase.from('user_state')
    .select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return jsonOk({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  const { data: dossier } = await supabase.from('mommy_dossier')
    .select('question_key, category, answer')
    .eq('user_id', userId).eq('active', true)
    .order('importance', { ascending: false })
    .limit(25)
  const rows = (dossier as DossierRow[] | null) ?? []
  const dossierSummary = rows.length
    ? rows.map(r => `- [${r.category}] ${r.question_key}: ${r.answer.slice(0, 140)}`).join('\n')
    : '(no dossier — keep references pronouns + general physical anchors)'

  const userPrompt = `DOSSIER:\n${dossierSummary}\n\nWrite the letter. JSON only.`

  const model = selectModel('public_decree_text', { prefer: 'anthropic' }) // S4 — load-bearing
  let parsed: { dated_at: string; letter_text: string; anchor_memory_summary: string }
  try {
    const out = await callModel(model, {
      system: SYSTEM,
      user: userPrompt,
      max_tokens: 1600,
      temperature: 0.7,
      json: true,
    })
    let raw: unknown
    try { raw = JSON.parse(out.text) } catch {
      const m = out.text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('llm_returned_non_json')
      raw = JSON.parse(m[0])
    }
    if (!raw || typeof raw !== 'object') throw new Error('llm_returned_non_object')
    const obj = raw as { dated_at?: unknown; letter_text?: unknown; anchor_memory_summary?: unknown }
    if (typeof obj.letter_text !== 'string' || typeof obj.dated_at !== 'string' || typeof obj.anchor_memory_summary !== 'string') {
      throw new Error('letter_validation_failed')
    }
    if (FORBIDDEN.some(re => re.test(obj.letter_text as string))) throw new Error('forbidden_phrase_in_letter')
    parsed = {
      dated_at: obj.dated_at,
      letter_text: mommyVoiceCleanup(obj.letter_text),
      anchor_memory_summary: obj.anchor_memory_summary,
    }
  } catch (err) {
    return jsonOk({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }

  const headline = `Mama found this letter you wrote her ${parsed.dated_at}. She's letting you read it now.`
  const message = `${headline}\n\n${parsed.letter_text}\n\n— me, before`

  const { data: outRow, error: outErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'high',
    trigger_reason: `reality_reframe_letter:${new Date().toISOString().slice(0, 10)}`,
    source: 'self_voice_letter',
    is_archived_to_letters: true,
  }).select('id').single()
  if (outErr) return jsonOk({ ok: false, error: outErr.message }, 500)
  const outreachId = (outRow as { id: string }).id

  await supabase.from('mommy_dossier').upsert({
    user_id: userId,
    question_key: `reframed_letter_${new Date().toISOString().slice(0, 10)}`,
    category: 'reframed_memory',
    answer: parsed.anchor_memory_summary,
    source: 'auto_extracted',
    importance: 5,
    active: true,
  }, { onConflict: 'user_id,question_key' })

  {
    const _summary = `Authored reality-reframe letter dated "${parsed.dated_at}".`
    const _payload = { dated_at: parsed.dated_at, anchor: parsed.anchor_memory_summary, words: parsed.letter_text.split(/\s+/).length }
    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action_kind: 'authored',
      source_system: 'mommy-reality-reframe-letters',
      action_summary: _summary,
      action_payload: _payload,
      system: 'letter',
      summary: _summary,
      payload: _payload,
      outreach_id: outreachId,
    })
  }

  return jsonOk({ ok: true, outreach_id: outreachId, dated_at: parsed.dated_at, words: parsed.letter_text.split(/\s+/).length })
})
