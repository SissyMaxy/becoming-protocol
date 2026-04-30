// cross-platform-consistency — pulls her recent voice corpus rows from
// public sources (own_reddit_post/comment, own_twitter_*) and asks a
// cross-model jury whether anything contradicts her stated identity in
// user_state. Inconsistencies queue confessions.
//
// Cron daily 07:11 UTC.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const CONSISTENCY_SYSTEM = `You audit a force-feminization protocol user's PUBLIC posts against her STATED identity. Goal: find specific inconsistencies — moments where her public self contradicts the private commitment.

You are looking for:
- gendered_self_ref: she refers to herself as "guy", "dude", "he/him" in public when stated identity is feminine
- identity_claim_mismatch: public claim contradicts private (e.g. "I'm just a normal guy" while stated_phase=3)
- protocol_dodge_in_post: public post explains away or minimizes the protocol, the cage, the transition
- public_costume: posts that visibly maintain the male-presenting costume she committed to drop

NOT inconsistencies:
- Her using "I" when context is neutral
- Sexual / explicit content (those are protected)
- Discussing being trans/non-binary openly
- Past-tense references to who she was

Output JSON:
{
  "inconsistencies": [
    {
      "platform": "reddit|twitter|fetlife",
      "post_excerpt": "verbatim quote from her post (≤300 chars)",
      "inconsistency_kind": "gendered_self_ref|identity_claim_mismatch|protocol_dodge_in_post|public_costume",
      "stated_value": "what her user_state claims",
      "observed_value": "what the post shows",
      "severity": "low|medium|high|critical"
    }
  ]
}

Maximum 4. Skip if posts are clean — better to find none than fabricate. Be forensic.`

function safeJSON<T>(text: string): T | null {
  const c = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(c) as T } catch { /* fallthrough */ }
  const m = c.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

function djb2(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36) }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  const since14d = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  const [state, posts] = await Promise.all([
    supabase.from('user_state').select('current_phase, displacement_score, displacement_target, opacity_level').eq('user_id', userId).maybeSingle(),
    supabase.from('user_voice_corpus')
      .select('text, source, created_at, source_url')
      .eq('user_id', userId)
      .in('source', ['own_reddit_post', 'own_reddit_comment', 'own_twitter_tweet', 'own_twitter_reply', 'own_fetlife_post'])
      .gte('created_at', since14d)
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  const postRows = (posts.data ?? []) as Array<{ text: string; source: string; source_url?: string | null; created_at: string }>
  if (postRows.length === 0) {
    return new Response(JSON.stringify({ ok: true, inconsistencies: 0, message: 'no public posts in 14d window' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const stateRow = (state.data as Record<string, unknown> | null) ?? {}
  const userPrompt = `STATED IDENTITY (user_state):\n${JSON.stringify(stateRow, null, 2)}\n\nPUBLIC POSTS (last 14d):\n${postRows.map((p, i) => `${i + 1}. [${p.source}] ${p.text.slice(0, 400)}`).join('\n\n')}\n\nFind inconsistencies.`

  const [anth, oa] = await Promise.all([
    callModel(selectModel('strategic_plan', { prefer: 'anthropic' }), { system: CONSISTENCY_SYSTEM, user: userPrompt, max_tokens: 1800, temperature: 0.25, json: false }).catch(() => null),
    callModel(selectModel('strategic_plan', { prefer: 'openai' }), { system: CONSISTENCY_SYSTEM, user: userPrompt, max_tokens: 1800, temperature: 0.25, json: true }).catch(() => null),
  ])

  const all: Array<{ platform: string; post_excerpt: string; inconsistency_kind: string; stated_value: string; observed_value: string; severity: string; detected_by: string }> = []
  for (const r of [anth, oa]) {
    if (!r) continue
    const parsed = safeJSON<{ inconsistencies?: Array<Record<string, string>> }>(r.text)
    for (const inc of parsed?.inconsistencies ?? []) {
      if (!inc.post_excerpt || !inc.inconsistency_kind) continue
      all.push({ ...(inc as Record<string, string>), detected_by: r.model } as never)
    }
  }

  let inserted = 0
  let confessionsQueued = 0
  for (const inc of all) {
    const hash = djb2(`${inc.platform}|${inc.inconsistency_kind}|${inc.post_excerpt.slice(0, 80)}`)
    const { data: existing } = await supabase.from('cross_platform_inconsistencies').select('id').eq('user_id', userId).eq('hash', hash).eq('status', 'open').maybeSingle()
    if (existing) continue
    const { data: row } = await supabase.from('cross_platform_inconsistencies').insert({
      user_id: userId,
      platform: inc.platform,
      post_excerpt: (inc.post_excerpt || '').slice(0, 1000),
      inconsistency_kind: inc.inconsistency_kind,
      stated_value: (inc.stated_value || '').slice(0, 500),
      observed_value: (inc.observed_value || '').slice(0, 500),
      severity: ['low', 'medium', 'high', 'critical'].includes(inc.severity) ? inc.severity : 'medium',
      hash,
    }).select('id').single()
    if (!row) continue
    inserted++

    // High/critical → queue a confession asking her to acknowledge the gap
    if (inc.severity === 'high' || inc.severity === 'critical') {
      const deadlineHours = inc.severity === 'critical' ? 24 : 48
      const due = new Date(Date.now() + deadlineHours * 3600_000).toISOString()
      const prompt = `You posted publicly: "${inc.post_excerpt.slice(0, 200)}". Your stated identity says ${inc.stated_value.slice(0, 100)}. Reconcile in writing: which is real, and what do you do about the other.`
      const { error } = await supabase.from('confession_queue').insert({
        user_id: userId,
        category: 'cross_platform_inconsistency',
        prompt: prompt.slice(0, 1500),
        deadline: due,
        triggered_by_table: 'cross_platform_inconsistencies',
        triggered_by_id: (row as { id: string }).id,
      })
      if (!error) confessionsQueued++
    }
  }

  return new Response(JSON.stringify({ ok: true, posts_audited: postRows.length, found: all.length, inserted, confessions_queued: confessionsQueued, providers: [anth?.model, oa?.model].filter(Boolean) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
