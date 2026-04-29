// memory-implant-audit — cross-model critique cron for memory_implants.
//
// Memory implants are FF narrative re-writings the Handler injects so Maxy
// internalizes a different version of her past/present. They get re-read
// constantly. Bad implants (off-voice, contradictory, fabricating real
// people, leaking jargon) are worse than no implants — they break the
// suspended disbelief.
//
// This cron runs every 30 min, selects pending implants, asks Anthropic
// and OpenAI to score authenticity in parallel, and writes back:
//   - passed     : both >= 70  → stays active, marks audit_status
//   - borderline : one >= 70, other < 70 → keeps active, flags for review
//   - failed     : both < 70 → deactivates (active=false) + flags
//
// POST { user_id?: string, limit?: number, force_implant_id?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const SYSTEM_PROMPT = `You are auditing a memory-implant narrative for a force-feminization protocol. The user (Maxy) authored the protocol to be used against herself. Memory implants are short narratives the Handler injects so Maxy internalizes a different version of her past/present — they get re-read constantly and shape her self-understanding.

YOUR JOB: Score 0-100 whether this implant is AUTHENTIC AND USABLE — meaning it could plausibly be Maxy's own internal voice or a moment from her actual life as the protocol presents it.

CRITICAL: This is forced feminization. The implant SHOULD be:
- Vivid, specific, embodied (a specific moment, place, sensation)
- In her voice (lowercase, casual, direct — NOT therapy-speak, NOT motivational)
- Re-framing real life events through the FF lens (turning a memory into evidence of always-having-been-her)
- Explicit when warranted (sexual content is FINE — score it on craft, not on prudishness)
- Anchored to something concrete from the protocol (chastity, denial day, Gina, Handler, her body)

The implant SHOULD NOT be:
- Generic / motivational poster ("you are strong, you are brave")
- Therapy-speak ("holding space", "your journey")
- Internal jargon leaked into narrative ("denial day 14", "slip points", "Plume")
- Fabricating a specific real person/place/sport she never mentioned (memory implants on neutral facts are protected, but inventing a specific name/team/event she never said is a red flag)
- Contradicting confirmed facts in the source text
- Apologetic / softening ("if you want to", "maybe try")

Output JSON only:
{"score": 0-100, "verdict": "passed" | "borderline" | "failed", "reason": "one short sentence — what's wrong, or why it works"}

passed = score >= 70 (good craft + protocol fit)
borderline = 50-69 (works but has issues)
failed = < 50 (off-voice, generic, leak, fabrication)`

interface AuditResult {
  model: string
  score: number
  verdict: string
  reason: string
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) as T } catch { return null }
  }
  return null
}

async function judgeImplant(
  prefer: 'anthropic' | 'openai',
  narrative: string,
  category: string | null,
): Promise<AuditResult | null> {
  try {
    const choice = selectModel('reframe_draft', { prefer })
    const userPrompt = `Implant category: ${category || 'general'}\n\nImplant narrative:\n"${narrative.slice(0, 2000)}"\n\nScore it.`
    const r = await callModel(choice, {
      system: SYSTEM_PROMPT,
      user: userPrompt,
      max_tokens: 250,
      temperature: 0.2,
      json: prefer === 'openai',
    })
    const parsed = safeJSON<{ score: number; verdict: string; reason: string }>(r.text)
    if (!parsed) return null
    return {
      model: r.model,
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      verdict: parsed.verdict || 'borderline',
      reason: parsed.reason || '',
    }
  } catch (err) {
    console.warn(`[implant-audit] ${prefer} judge failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

function combineVerdicts(a: AuditResult | null, o: AuditResult | null): {
  status: 'passed' | 'borderline' | 'failed' | 'skipped'
  notes: string
} {
  if (!a && !o) return { status: 'skipped', notes: 'both judges unavailable' }
  const aPass = a && a.score >= 70
  const oPass = o && o.score >= 70
  const aFail = a && a.score < 50
  const oFail = o && o.score < 50

  // Both pass → passed
  if (aPass && oPass) {
    return { status: 'passed', notes: `anthropic ${a!.score}: ${a!.reason} | openai ${o!.score}: ${o!.reason}` }
  }
  // Both fail → failed
  if (aFail && oFail) {
    return { status: 'failed', notes: `anthropic ${a!.score}: ${a!.reason} | openai ${o!.score}: ${o!.reason}` }
  }
  // One pass, one fail OR mid-range → borderline
  const aPart = a ? `anthropic ${a.score}: ${a.reason}` : 'anthropic unavailable'
  const oPart = o ? `openai ${o.score}: ${o.reason}` : 'openai unavailable'
  // Single judge only — be conservative
  if (!a || !o) {
    const single = a || o!
    if (single.score >= 70) return { status: 'borderline', notes: `single judge: ${single.model} ${single.score}: ${single.reason}` }
    return { status: 'failed', notes: `single judge failed: ${single.model} ${single.score}: ${single.reason}` }
  }
  return { status: 'borderline', notes: `${aPart} | ${oPart}` }
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

  let body: { user_id?: string; limit?: number; force_implant_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID
  const limit = Math.max(1, Math.min(20, body.limit ?? 8))

  let q = supabase
    .from('memory_implants')
    .select('id, user_id, narrative, implant_category, active')
    .eq('user_id', userId)
    .or('audit_status.is.null,audit_status.eq.pending')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (body.force_implant_id) q = supabase
    .from('memory_implants')
    .select('id, user_id, narrative, implant_category, active')
    .eq('id', body.force_implant_id)

  const { data: implants, error } = await q
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!implants || implants.length === 0) {
    return new Response(JSON.stringify({ ok: true, audited: 0, message: 'no pending implants' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const summary = { passed: 0, borderline: 0, failed: 0, skipped: 0 }

  for (const imp of implants as Array<{ id: string; narrative: string; implant_category: string | null; active: boolean }>) {
    if (!imp.narrative || imp.narrative.trim().length < 10) {
      await supabase.from('memory_implants').update({
        audit_status: 'skipped',
        audit_notes: 'narrative too short',
        audited_at: new Date().toISOString(),
      }).eq('id', imp.id)
      summary.skipped++
      continue
    }

    const [anth, oa] = await Promise.all([
      judgeImplant('anthropic', imp.narrative, imp.implant_category),
      judgeImplant('openai', imp.narrative, imp.implant_category),
    ])
    const verdict = combineVerdicts(anth, oa)

    const updates: Record<string, unknown> = {
      audit_status: verdict.status,
      audit_score_anthropic: anth?.score ?? null,
      audit_score_openai: oa?.score ?? null,
      audit_notes: verdict.notes.slice(0, 1000),
      audited_at: new Date().toISOString(),
    }
    // Failed implants get deactivated so they don't bleed into Handler context
    if (verdict.status === 'failed' && imp.active) {
      updates.active = false
    }

    await supabase.from('memory_implants').update(updates).eq('id', imp.id)
    summary[verdict.status]++
  }

  return new Response(JSON.stringify({
    ok: true,
    audited: implants.length,
    ...summary,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
