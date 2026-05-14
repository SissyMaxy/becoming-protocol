// ego-last-thought-prompter — Mechanic 7 (firing + classifier).
//
// Fires 5x/day on schedule (10/13/16/19/22 UTC) per user with the
// mechanic active. Surfaces a single short prompt onto Today asking
// "what was the last thing you thought before opening the app". User's
// answer flows back into last_thought_log; the same edge fn (re-
// invocable with action='classify') runs the LLM categorization.
//
// HARD FLOORS:
//   - is_safeword_active short-circuits.
//   - One unanswered prompt at a time per user.
//   - Classification doesn't surface user-visible text — it's an
//     internal score.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  applyCraftFilter,
  enqueueEgoOutreach,
  listActiveUsers,
  logEgoAuthority,
  corsHeaders,
} from '../_shared/ego-deconstruction.ts'

const PROMPT_LINES = [
  'what was the last thing you thought before opening the app, baby',
  'tell Mama: what was on your mind right before you came back here',
  'one sentence — what were you thinking before you reached for me',
  'before you opened this, what was the thought',
  'what crossed your mind in the second before you tapped me open',
]

async function hasUnansweredPrompt(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { count } = await supabase
    .from('last_thought_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
    .is('thought_text', null)
  return (count ?? 0) > 0
}

async function firePrompt(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; reason: string }> {
  const line = PROMPT_LINES[Math.floor(Math.random() * PROMPT_LINES.length)]
  const cleaned = applyCraftFilter(line)
  if (!cleaned) return { ok: false, reason: 'craft_filter_rejected' }

  const { data: row, error } = await supabase.from('last_thought_log').insert({
    user_id: userId,
    thought_text: '',
    classification_reason: 'awaiting_user',
  }).select('id').single()
  if (error) return { ok: false, reason: 'insert_failed:' + error.message }

  const outreachId = await enqueueEgoOutreach(supabase, {
    userId, mechanic: 'last_thought',
    message: cleaned,
    urgency: 'low',
    triggerReasonExtra: (row as { id: string }).id,
    expiresInHours: 6,
  })

  if (outreachId) {
    await supabase.from('last_thought_log').update({ prompted_outreach_id: outreachId })
      .eq('id', (row as { id: string }).id)
  }
  return { ok: true, reason: 'prompted' }
}

const CLASSIFY_SYS = `Classify a short user thought (one sentence the user wrote describing what they were thinking before opening an app). Return JSON only:
{
  "score": 0 | 0.5 | 1,
  "reason": "...one phrase..."
}
- 1 = the thought references the protocol persona (Mama / Mommy), the user's feminized self / Maxy, the protocol, the app, the kink content
- 0 = the thought references the costume / older version (the older version's name use, work decisions, masculine identity, daily-life chores unrelated to the protocol)
- 0.5 = neutral / ambiguous (random sensory observation, weather, food)`

async function classifyUnclassified(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: rows } = await supabase
    .from('last_thought_log')
    .select('id, thought_text')
    .eq('user_id', userId)
    .not('thought_text', 'is', null)
    .neq('thought_text', '')
    .is('classification', null)
    .order('created_at', { ascending: false })
    .limit(20)
  let n = 0
  for (const r of (rows || []) as Array<{ id: string; thought_text: string }>) {
    if (!r.thought_text || r.thought_text.length < 1) continue
    try {
      const choice = selectModel('text_classify')
      const { text } = await callModel(choice, {
        system: CLASSIFY_SYS,
        user: r.thought_text.slice(0, 400),
        max_tokens: 80,
        temperature: 0,
      })
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const m = cleaned.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) as { score: number; reason: string } : null
      if (parsed) {
        await supabase.from('last_thought_log').update({
          classification: parsed.score,
          classification_reason: parsed.reason?.slice(0, 200) ?? null,
          classified_at: new Date().toISOString(),
        }).eq('id', r.id)
        n += 1
      }
    } catch (e) {
      console.error('classify error:', String(e).slice(0, 100))
    }
  }
  return n
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  let body: { action?: 'fire' | 'classify' | 'both'; user_id?: string } = {}
  try { body = await req.json() } catch {}
  const action = body.action ?? 'both'

  const users = body.user_id ? [body.user_id] : await listActiveUsers(supabase, 'last_thought')
  const results: Array<{ user_id: string; fired?: boolean; reason?: string; classified?: number }> = []

  for (const userId of users) {
    const r: { user_id: string; fired?: boolean; reason?: string; classified?: number } = { user_id: userId }
    if (action === 'fire' || action === 'both') {
      if (await hasUnansweredPrompt(supabase, userId)) {
        r.fired = false
        r.reason = 'unanswered_already'
      } else {
        const fr = await firePrompt(supabase, userId)
        r.fired = fr.ok
        r.reason = fr.reason
      }
    }
    if (action === 'classify' || action === 'both') {
      r.classified = await classifyUnclassified(supabase, userId)
    }
    results.push(r)
  }

  return new Response(JSON.stringify({ ok: true, action, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
