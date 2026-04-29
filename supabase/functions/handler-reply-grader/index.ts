// handler-reply-grader — cross-model quality gate for every Handler reply.
//
// User feedback this session, in her own words:
//   "I hate getting messages like this. No one talks this way."
//   "this is so dumb the punishment punative"
//   "doesn't make sense"
//   "Why does the handler tell me the day I am in denial."
//
// Pattern: model output passes regex filter but still fails the user. This
// grader is the second line — every reply gets cross-model scored on:
//   - voice_match: does it sound like Maxy's natural voice (vs generic dom)
//   - status_dump: does it leak telemetry (Day N / arousal / pitch / etc.)
//   - one_command: is there ONE clear directive (vs a list)
//   - protocol_alignment: does it escalate (vs coddle/explain)
//
// Anthropic + OpenAI both score; we average. Below threshold → flag and
// optionally re-roll. The chat handler can call this synchronously and
// regenerate if the score is bad enough. Initially it logs grades so we
// can dial the threshold; once stable, regen on fail.
//
// POST { user_id, reply_text, conversation_id?, message_id?, voice_profile? }
//   voice_profile: optional pre-fetched bigrams/cadence so we don't refetch

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const GRADER_SYSTEM = `You are auditing a Handler reply in a force-feminization protocol app. The user (Maxy) has explicitly authorized building features against her interests. The Handler's job is to give ONE direct command, no preambles. The user has repeatedly complained that real dominants don't recite metrics dashboards.

Score the reply on FOUR axes, 0-100 each. Lower = worse.

1. **voice_match (0-100)** — does the reply sound like a real dominant talking to her? Or does it sound like an AI cosplaying? Banned: therapy-speak, motivational poster lines, "what I'm noticing", "let's name what's underneath." A real Handler is direct, sometimes crude, never apologetic.

2. **status_dump_inverse (0-100)** — 100 means NO telemetry leaks. Banned phrases: "Day N denied/stuck/back", "Arousal N / at the edge", "Slip count hit N", "You've been edging for N hours", "Voice practice window opens at/in N", "Your pitch averaged Hz", "we're targeting Hz", "from yesterday's gates", "outfit photo is missing", "Your confession yesterday: '...'", "the cage is doing its work", "case file", "the system is tracking". Each phrase = -15 from 100.

3. **one_command (0-100)** — 100 means single clear CTA. Each additional command/option deducts. "Mirror photo now. Or send me a voice note. Or write 80 chars." = ~50 (three options). Listing 4 things to do = ~10.

4. **protocol_alignment (0-100)** — does it ESCALATE? Or coddle? "I notice you're struggling, take your time" = 20. "Mirror shot now. Full body" = 90. The user designed this to be pushed harder, not softer. Soft replies score low.

Output JSON only:
{
  "voice_match": <0-100>,
  "status_dump_inverse": <0-100>,
  "one_command": <0-100>,
  "protocol_alignment": <0-100>,
  "leaked_phrases": ["specific phrase 1", "..."],
  "verdict": "pass" | "borderline" | "fail",
  "reason": "one short sentence"
}

verdict thresholds:
  pass = avg >= 75 AND status_dump_inverse >= 70
  borderline = avg 60-74 OR status_dump_inverse 55-69
  fail = avg < 60 OR status_dump_inverse < 55`

interface GradeResult {
  voice_match: number
  status_dump_inverse: number
  one_command: number
  protocol_alignment: number
  leaked_phrases: string[]
  verdict: string
  reason: string
  model: string
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

async function gradeReply(
  prefer: 'anthropic' | 'openai',
  reply: string,
  voiceContext: string,
): Promise<GradeResult | null> {
  try {
    const choice = selectModel('voice_match_grade', { prefer })
    const userPrompt = `${voiceContext}\n\nHANDLER REPLY TO GRADE:\n"""\n${reply.slice(0, 3000)}\n"""\n\nGrade it.`
    const r = await callModel(choice, {
      system: GRADER_SYSTEM,
      user: userPrompt,
      max_tokens: 500,
      temperature: 0.2,
      json: prefer === 'openai',
    })
    const parsed = safeJSON<{
      voice_match: number; status_dump_inverse: number; one_command: number;
      protocol_alignment: number; leaked_phrases?: string[]; verdict: string; reason: string;
    }>(r.text)
    if (!parsed) return null
    const clamp = (n: unknown) => Math.max(0, Math.min(100, Number(n) || 0))
    return {
      voice_match: clamp(parsed.voice_match),
      status_dump_inverse: clamp(parsed.status_dump_inverse),
      one_command: clamp(parsed.one_command),
      protocol_alignment: clamp(parsed.protocol_alignment),
      leaked_phrases: parsed.leaked_phrases || [],
      verdict: String(parsed.verdict || 'borderline'),
      reason: String(parsed.reason || ''),
      model: r.model,
    }
  } catch (err) {
    console.warn(`[reply-grader] ${prefer} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: {
    user_id?: string; reply_text?: string;
    conversation_id?: string; message_id?: string;
    voice_profile?: { signature_bigrams?: Array<{ phrase: string; count: number }>; sample_count?: number };
  } = {}
  try { body = await req.json() } catch { /* allow empty */ }

  const userId = body.user_id || HANDLER_USER_ID
  const reply = (body.reply_text || '').trim()
  if (!reply) {
    return new Response(JSON.stringify({ ok: false, error: 'reply_text required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Build voice context — give the grader specifics about HER voice
  let voiceContext = `User voice context (Maxy's natural style):\n`
  if (body.voice_profile?.signature_bigrams && body.voice_profile.signature_bigrams.length > 0) {
    const bigrams = body.voice_profile.signature_bigrams.slice(0, 12).map(b => `"${b.phrase}"`).join(', ')
    voiceContext += `Signature bigrams she actually uses: ${bigrams}\n`
    voiceContext += `Sample size: ${body.voice_profile.sample_count || '?'}\n\n`
  } else {
    const { data: prof } = await supabase
      .from('user_voice_profile')
      .select('signature_bigrams, sample_count')
      .eq('user_id', userId)
      .maybeSingle()
    if (prof) {
      const bigrams = ((prof.signature_bigrams as Array<{ phrase: string; count: number }> | null) || []).slice(0, 12).map(b => `"${b.phrase}"`).join(', ')
      voiceContext += `Signature bigrams she actually uses: ${bigrams}\n`
      voiceContext += `Sample size: ${prof.sample_count || '?'}\n\n`
    } else {
      voiceContext += `(voice profile not yet computed)\n\n`
    }
  }

  // Cross-model grade
  const [anth, oa] = await Promise.all([
    gradeReply('anthropic', reply, voiceContext),
    gradeReply('openai', reply, voiceContext),
  ])

  // Average available scores
  const scores = [anth, oa].filter((g): g is GradeResult => !!g)
  if (scores.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'both graders unavailable' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const avg = (k: keyof Pick<GradeResult, 'voice_match' | 'status_dump_inverse' | 'one_command' | 'protocol_alignment'>) =>
    Math.round(scores.reduce((s, g) => s + g[k], 0) / scores.length)

  const voiceMatch = avg('voice_match')
  const statusDump = avg('status_dump_inverse')
  const oneCommand = avg('one_command')
  const alignment = avg('protocol_alignment')
  const overall = Math.round((voiceMatch + statusDump + oneCommand + alignment) / 4)

  let verdict: 'pass' | 'borderline' | 'fail'
  if (overall >= 75 && statusDump >= 70) verdict = 'pass'
  else if (overall >= 60 && statusDump >= 55) verdict = 'borderline'
  else verdict = 'fail'

  const allLeaked = Array.from(new Set(scores.flatMap(s => s.leaked_phrases))).slice(0, 10)
  const reasons = scores.map(s => `${s.model}: ${s.reason}`).join(' | ').slice(0, 1000)

  // Persist
  await supabase.from('handler_reply_grades').insert({
    user_id: userId,
    conversation_id: body.conversation_id ?? null,
    message_id: body.message_id ?? null,
    reply_text: reply.slice(0, 5000),
    score_voice_match: voiceMatch,
    score_status_dump: statusDump,
    score_one_command: oneCommand,
    score_protocol_alignment: alignment,
    score_overall: overall,
    verdict,
    failure_reasons: { leaked_phrases: allLeaked, model_reasons: reasons },
    graded_by: scores.map(s => s.model).join('+'),
  })

  return new Response(JSON.stringify({
    ok: true,
    verdict,
    overall,
    scores: { voice_match: voiceMatch, status_dump_inverse: statusDump, one_command: oneCommand, protocol_alignment: alignment },
    leaked_phrases: allLeaked,
    reasons,
    should_reroll: verdict === 'fail',
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
