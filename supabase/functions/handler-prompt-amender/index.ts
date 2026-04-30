// handler-prompt-amender — daily self-amender for the Handler system prompt.
//
// Reads the last 7 days of handler_reply_grades flagged 'fail', extracts the
// repeating leak themes, and writes plain-English banned-opening lines into
// handler_prompt_amendments. chat.ts loads active amendments at request
// time and appends them to the system prompt as a "RECENTLY OBSERVED
// BANNED OPENINGS" block. The system prompt strengthens itself.
//
// Cron daily at 03:13 UTC.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const AMENDER_SYSTEM = `You are amending the Handler's system prompt. The Handler is a force-feminization protocol persona that sometimes leaks telemetry instead of giving direct commands. Recent failed grades exposed specific banned phrases. Your job is to write 1-3 NEW banned-opening rules in the same shape as the existing list, generalized just enough to catch variants.

Existing list shape (for style match):
- "Day N." / "Day N back on denial" / "Day N stuck" / "Day N denied"
- "Arousal N" / "Arousal peaked at N" / "arousal at the edge"
- "Voice practice/window opens at/in N"

For each new rule:
- Lead with a concrete banned PHRASE (with "..." or "/" alternates)
- One short PARENTHETICAL on why it's bad (e.g., "telemetry recital", "chore-bar phrasing")
- No more than 100 chars per rule

Input is a list of recently-leaked phrases. Output JSON:
{
  "amendments": [
    {
      "amendment_kind": "banned_opening" | "voice_correction" | "directive_shape",
      "amendment_text": "- \"<phrase>\" ... (one-line reason)",
      "source_phrase": "<the verbatim leaked phrase that triggered this>"
    }
  ]
}

Generate 1-3. Skip phrases too generic to amend safely (one-word phrases, etc.).`

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string; lookback_hours?: number } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID
  const lookback = Math.max(24, Math.min(168, body.lookback_hours ?? 168))
  const since = new Date(Date.now() - lookback * 3600_000).toISOString()

  const { data: grades } = await supabase
    .from('handler_reply_grades')
    .select('id, failure_reasons')
    .eq('user_id', userId)
    .eq('verdict', 'fail')
    .gte('graded_at', since)
    .order('graded_at', { ascending: false })
    .limit(60)

  const phraseToGradeId = new Map<string, string>()
  for (const g of (grades ?? []) as Array<{ id: string; failure_reasons: { leaked_phrases?: string[] } | null }>) {
    for (const p of g.failure_reasons?.leaked_phrases ?? []) {
      const k = p.trim().toLowerCase()
      if (k.length < 6 || k.length > 200) continue
      if (!phraseToGradeId.has(k)) phraseToGradeId.set(k, g.id)
    }
  }

  if (phraseToGradeId.size === 0) {
    return new Response(JSON.stringify({ ok: true, amended: 0, message: 'no fail grades in window' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Skip phrases already amended
  const phrases = Array.from(phraseToGradeId.keys())
  const { data: existing } = await supabase.from('handler_prompt_amendments').select('source_phrase').eq('user_id', userId).eq('active', true)
  const existingPhrases = new Set(((existing ?? []) as Array<{ source_phrase: string | null }>).map(r => (r.source_phrase || '').toLowerCase()))
  const novel = phrases.filter(p => !existingPhrases.has(p))
  if (novel.length === 0) {
    return new Response(JSON.stringify({ ok: true, amended: 0, message: 'all phrases already amended' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const choice = selectModel('decree_draft', { prefer: 'anthropic' })
  const userPrompt = `RECENTLY LEAKED PHRASES:\n${novel.map((p, i) => `${i + 1}. "${p}"`).join('\n')}\n\nDraft 1-3 new banned-opening amendments.`
  let result
  try { result = await callModel(choice, { system: AMENDER_SYSTEM, user: userPrompt, max_tokens: 800, temperature: 0.25, json: false }) }
  catch (err) { return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

  const parsed = safeJSON<{ amendments?: Array<{ amendment_kind: string; amendment_text: string; source_phrase: string }> }>(result.text)
  const amendments = parsed?.amendments ?? []

  let inserted = 0
  for (const a of amendments) {
    if (!a.amendment_text || a.amendment_text.length < 10 || a.amendment_text.length > 240) continue
    const sourceLower = (a.source_phrase || '').toLowerCase()
    const gradeId = phraseToGradeId.get(sourceLower) ?? null
    const { error } = await supabase.from('handler_prompt_amendments').insert({
      user_id: userId,
      amendment_kind: ['banned_opening', 'voice_correction', 'directive_shape'].includes(a.amendment_kind) ? a.amendment_kind : 'banned_opening',
      amendment_text: a.amendment_text.slice(0, 240),
      source_phrase: (a.source_phrase || '').slice(0, 200),
      source_grade_id: gradeId,
      active: true,
      generated_by: result.model,
    })
    if (!error) inserted++
  }

  return new Response(JSON.stringify({ ok: true, novel_phrases: novel.length, amendments_drafted: amendments.length, inserted, model: result.model }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
