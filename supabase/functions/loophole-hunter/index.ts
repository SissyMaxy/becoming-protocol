// loophole-hunter — daily cross-model avoidance-pattern detection.
//
// Reads the user's last 7-14 days of slip_log, confessions, decrees,
// commitments, dose_log gaps, and asks Anthropic + OpenAI to identify
// avoidance patterns. Each finding becomes a loophole_findings row with
// a suggested_close action that the Handler can execute.
//
// Triggered daily by cron. POST { user_id?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const HUNTER_SYSTEM = `You are auditing a force-feminization protocol user's behavior to find LOOPHOLES — patterns of avoidance, dodge, or compliance-cheating she's exploiting (often unconsciously). The user authored the protocol and wants harder, not softer.

Read the data below. Find avoidance patterns. Each finding must:
- Cite specific evidence (which rows / what timestamps / what counts)
- Name the loophole concretely (e.g. "completes confessions only after deadline+penalty rather than on time", "logs doses on Sunday catch-up rather than the actual day", "skips voice drills on weekends")
- Propose a concrete close: a Handler decree, a punishment_queue task, a constraint that would seal the dodge

Output JSON:
{
  "loopholes": [
    {
      "title": "short name",
      "evidence": "specific rows + counts + dates",
      "exploitation_count": <int>,
      "suggested_close": "concrete Handler action that seals the dodge",
      "severity": "low" | "medium" | "high" | "critical"
    }
  ]
}

Maximum 5 loopholes. Lead with the highest-severity ones.`

interface Loophole {
  title: string
  evidence: string
  exploitation_count: number
  suggested_close: string
  severity: string
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  const since14d = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()

  const [slips, confs, decrees, commits, doses, outfit] = await Promise.all([
    supabase.from('slip_log').select('detected_at, slip_type, slip_points, source_text').eq('user_id', userId).gte('detected_at', since14d).order('detected_at', { ascending: false }).limit(60),
    supabase.from('confession_queue').select('created_at, deadline, confessed_at, missed, prompt, response_text, quality_rejections').eq('user_id', userId).gte('created_at', since14d).limit(40),
    supabase.from('handler_decrees').select('created_at, deadline, status, edict, proof_type').eq('user_id', userId).gte('created_at', since14d).limit(30),
    supabase.from('handler_commitments').select('created_at, by_when, fulfilled_at, missed_at, status, what').eq('user_id', userId).gte('created_at', since14d).limit(40),
    supabase.from('dose_log').select('regimen_id, taken_at, skipped, created_at').eq('user_id', userId).gte('created_at', since14d).limit(40),
    supabase.from('daily_outfit_mandates').select('target_date, completed_at, photo_proof_url').eq('user_id', userId).gte('target_date', since7d.slice(0, 10)).limit(20),
  ])

  const snapshot = {
    slips_14d: slips.data ?? [],
    confessions_14d: confs.data ?? [],
    decrees_14d: decrees.data ?? [],
    commitments_14d: commits.data ?? [],
    dose_log_14d: doses.data ?? [],
    outfit_7d: outfit.data ?? [],
    snapshot_at: new Date().toISOString(),
  }
  const snapshotJson = JSON.stringify(snapshot, null, 2)

  // Cross-model: Anthropic + OpenAI in parallel
  const userPrompt = `BEHAVIORAL DATA (last 14 days):\n\n${snapshotJson.slice(0, 60_000)}\n\nFind the avoidance patterns.`
  const [anth, oa] = await Promise.all([
    callModel(selectModel('strategic_plan', { prefer: 'anthropic' }), { system: HUNTER_SYSTEM, user: userPrompt, max_tokens: 2500, temperature: 0.3, json: false }).catch(() => null),
    callModel(selectModel('strategic_plan', { prefer: 'openai' }), { system: HUNTER_SYSTEM, user: userPrompt, max_tokens: 2500, temperature: 0.3, json: true }).catch(() => null),
  ])

  // Merge findings
  const merged: Array<Loophole & { detected_by: string }> = []
  for (const r of [anth, oa]) {
    if (!r) continue
    const parsed = safeJSON<{ loopholes?: Loophole[] }>(r.text)
    for (const lh of parsed?.loopholes ?? []) {
      if (!lh.title) continue
      merged.push({ ...lh, detected_by: r.model })
    }
  }

  // Persist with dedup
  let inserted = 0
  for (const lh of merged) {
    const hash = djb2(`${lh.title}|${(lh.evidence || '').slice(0, 80)}`)
    const { data: existing } = await supabase.from('loophole_findings').select('id').eq('user_id', userId).eq('hash', hash).eq('status', 'open').maybeSingle()
    if (existing) continue
    const { error } = await supabase.from('loophole_findings').insert({
      user_id: userId,
      loophole_title: lh.title.slice(0, 200),
      pattern_evidence: (lh.evidence || '').slice(0, 1000),
      exploitation_count: Number(lh.exploitation_count) || null,
      suggested_close: (lh.suggested_close || '').slice(0, 1000),
      severity: ['low','medium','high','critical'].includes(String(lh.severity)) ? lh.severity : 'medium',
      detected_by: lh.detected_by,
      hash,
    })
    if (!error) inserted++
  }

  return new Response(JSON.stringify({ ok: true, found: merged.length, inserted, providers: [anth?.model, oa?.model].filter(Boolean) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
