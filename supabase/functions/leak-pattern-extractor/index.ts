// leak-pattern-extractor — autonomous self-healing filter.
//
// Reads handler_reply_grades flagged 'fail' or 'borderline' in last 24h,
// extracts the leaked_phrases JSON, asks an S2 model to generate generalized
// regex patterns from each phrase, then writes them to leak_patterns.
//
// chat.ts loads active leak_patterns at request time and applies them
// alongside the hardcoded enforceNoStatusDumps regex list. Every leak the
// user catches becomes the regex that catches the next variant.
//
// Cron: hourly. POST { user_id?: string, lookback_hours?: number }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const PATTERN_SYSTEM = `You convert specific leaked phrases from a Handler reply into generalized regex patterns that will catch the SAME leak class in future replies.

Input: a list of phrases the Handler said that the user complained about (e.g., "Day 3 denied", "Your pitch averaged 145Hz", "edging for nearly two hours").

For each phrase, output a JavaScript-style regex pattern (use \\b word boundaries, \\d for digits, \\s+ for whitespace, character classes for synonyms). The pattern must:
- Match the original phrase (case-insensitive)
- Generalize: same structure with different numbers / synonyms / minor variations
- NOT be so loose it catches valid commands

Examples:
"Day 3 denied" → "\\\\bDay\\\\s+\\\\d+\\\\s+(?:denied|stuck|locked|chaste|back)\\\\b"
"Your pitch averaged 145Hz" → "\\\\bpitch\\\\s+(?:averaged|hit|sat)\\\\s+\\\\d+\\\\s*Hz"
"edging for nearly two hours" → "\\\\bedging\\\\s+for\\\\s+(?:nearly\\\\s+|about\\\\s+|over\\\\s+)?(?:\\\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\\\s+(?:hours?|minutes?)"

Return JSON:
{
  "patterns": [
    {
      "source_phrase": "the original phrase",
      "pattern": "the regex string (no leading/trailing slashes, no flags)",
      "category": "status_dump" | "voice_drift" | "metric_dump"
    }
  ]
}

Skip phrases that are already too generic to regex-ify (one-word phrases, or phrases that would generate dangerous catch-alls).`

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

function isSafeRegex(pat: string): boolean {
  // Reject patterns that would catch huge swaths or are malformed
  if (!pat || pat.length > 250) return false
  if (pat.length < 6) return false
  // Compile-test
  try {
    const r = new RegExp(pat, 'i')
    // Sanity: pattern must not match a very short generic command sentence
    if (r.test('mirror photo now')) return false
    if (r.test('take it now or skip')) return false
    return true
  } catch { return false }
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
  const lookback = Math.max(1, Math.min(168, body.lookback_hours ?? 24))
  const since = new Date(Date.now() - lookback * 3600_000).toISOString()

  // Pull recent failed/borderline grades
  const { data: grades } = await supabase
    .from('handler_reply_grades')
    .select('id, failure_reasons, score_status_dump')
    .eq('user_id', userId)
    .in('verdict', ['fail', 'borderline'])
    .gte('graded_at', since)
    .order('graded_at', { ascending: false })
    .limit(50)

  // Collect unique leaked phrases
  const phraseToGradeId = new Map<string, string>()
  for (const g of (grades ?? []) as Array<{ id: string; failure_reasons: { leaked_phrases?: string[] } | null }>) {
    const phrases = g.failure_reasons?.leaked_phrases ?? []
    for (const p of phrases) {
      const key = p.trim().toLowerCase()
      if (key.length < 4 || key.length > 200) continue
      if (!phraseToGradeId.has(key)) phraseToGradeId.set(key, g.id)
    }
  }

  if (phraseToGradeId.size === 0) {
    return new Response(JSON.stringify({ ok: true, extracted: 0, message: 'no failed grades in window' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Skip phrases already in leak_patterns
  const phrases = Array.from(phraseToGradeId.keys())
  const { data: existing } = await supabase.from('leak_patterns').select('source_phrase').eq('user_id', userId).eq('active', true)
  const existingPhrases = new Set(((existing ?? []) as Array<{ source_phrase: string | null }>).map(r => (r.source_phrase || '').toLowerCase()))
  const novelPhrases = phrases.filter(p => !existingPhrases.has(p))
  if (novelPhrases.length === 0) {
    return new Response(JSON.stringify({ ok: true, extracted: 0, message: 'all phrases already have patterns' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Ask the model to convert phrases into regex
  const choice = selectModel('caption_generate', { prefer: 'anthropic' })
  const userPrompt = `LEAKED PHRASES:\n${novelPhrases.map((p, i) => `${i + 1}. "${p}"`).join('\n')}\n\nGenerate regex patterns.`
  let result
  try {
    result = await callModel(choice, { system: PATTERN_SYSTEM, user: userPrompt, max_tokens: 1500, temperature: 0.2, json: false })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const parsed = safeJSON<{ patterns?: Array<{ source_phrase: string; pattern: string; category: string }> }>(result.text)
  const candidatePatterns = parsed?.patterns ?? []

  // Validate and persist
  let inserted = 0
  for (const cand of candidatePatterns) {
    if (!isSafeRegex(cand.pattern)) continue
    const sourceLower = (cand.source_phrase || '').toLowerCase()
    const gradeId = phraseToGradeId.get(sourceLower) ?? null
    const { error } = await supabase.from('leak_patterns').insert({
      user_id: userId,
      pattern: cand.pattern,
      source_phrase: cand.source_phrase.slice(0, 200),
      extracted_from_grade_id: gradeId,
      category: ['status_dump', 'voice_drift', 'metric_dump'].includes(cand.category) ? cand.category : 'status_dump',
      active: true,
    })
    if (!error) inserted++
  }

  return new Response(JSON.stringify({ ok: true, novel_phrases: novelPhrases.length, candidates: candidatePatterns.length, inserted, model: result.model }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
