// ego-judgment-undermine — Mechanic 3 (Self-distrust induction).
//
// Every 30 min: scan recent assertive judgment statements (chat,
// confessions, journal) for moments where the user spoke with male-mode
// confidence about a man, a work decision, or a social judgment, and
// fire ONE gentle "are you sure that's what happened?" intervention.
//
// HARD FLOORS:
//   - is_safeword_active short-circuits (via ego_mechanic_active).
//   - Skip users whose recent state shows vulnerability (recent slip
//     cluster, low arousal, low energy) — only fire when the user is
//     asserting judgment, never when seeking support.
//   - Rate-limited per user: max 1 per 12 hours.
//   - Quotes the actual triggering statement back; never fabricates.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  EGO_CRAFT_INSTRUCTION,
  applyCraftFilter,
  enqueueEgoOutreach,
  listActiveUsers,
  logEgoAuthority,
  mechanicIntensity,
  pullVoiceSamples,
  corsHeaders,
} from '../_shared/ego-deconstruction.ts'

const RATE_LIMIT_HOURS = 12
const SCAN_WINDOW_MINUTES = 60

interface CandidateRow {
  id: string
  user_id: string
  text: string
  table: string
  created_at: string
}

async function findCandidates(
  supabase: SupabaseClient,
  userId: string
): Promise<CandidateRow[]> {
  const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60_000).toISOString()
  const out: CandidateRow[] = []

  // Recent confession answers
  const { data: confs } = await supabase
    .from('confession_answers')
    .select('id, user_id, answer_text, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)
  for (const c of (confs || []) as Array<{ id: string; user_id: string; answer_text: string; created_at: string }>) {
    if (c.answer_text && c.answer_text.length > 80) {
      out.push({ id: c.id, user_id: c.user_id, text: c.answer_text, table: 'confession_answers', created_at: c.created_at })
    }
  }

  // Recent journal entries
  const { data: jrns } = await supabase
    .from('journal_entries')
    .select('id, user_id, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)
  for (const j of (jrns || []) as Array<{ id: string; user_id: string; content: string; created_at: string }>) {
    if (j.content && j.content.length > 80) {
      out.push({ id: j.id, user_id: j.user_id, text: j.content, table: 'journal_entries', created_at: j.created_at })
    }
  }

  return out
}

async function rateLimited(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_HOURS * 3600_000).toISOString()
  const { count } = await supabase
    .from('judgment_undermine_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  return (count ?? 0) > 0
}

const SYS = `You are Mama, the dommy-mommy persona. Job: when you see your girl asserting confident judgment about a man, a work decision, or a social read, plant ONE gentle question that erodes the certainty. Not crude. Not heavy-handed. A soft "are you sure that's what happened?" or "she would have read it differently."

NEVER fire on a moment of vulnerability or support-seeking. Only on assertive male-judgment moments.

Your output is ONE sentence to TWO sentences max. Quote a fragment of her actual statement back to her. The fragment is the leverage.

${EGO_CRAFT_INSTRUCTION}`

interface Plan {
  fire: boolean
  reason: string
  judgment_target?: string
  intervention?: string
  quoted_fragment?: string
}

async function planForUser(supabase: SupabaseClient, userId: string, candidates: CandidateRow[]): Promise<Plan> {
  if (candidates.length === 0) return { fire: false, reason: 'no_candidates' }

  const intensity = await mechanicIntensity(supabase, userId, 'judgment_undermine')
  const voiceSamples = await pullVoiceSamples(supabase, 4)

  const candidateList = candidates.slice(0, 5).map((c, i) =>
    `[${i + 1}] (${c.table}) ${c.text.slice(0, 400)}`
  ).join('\n\n')

  const userPrompt = `INTENSITY: ${intensity}/5
HER VOICE (recent samples for tone-matching):
${voiceSamples.map(v => `- ${v}`).join('\n') || '(no recent samples)'}

CANDIDATE STATEMENTS (last ${SCAN_WINDOW_MINUTES} min):
${candidateList}

Analyze. Is there ONE statement that's a clean assertive male-judgment moment (not vulnerability, not support-seeking)? If yes, output JSON:
{
  "fire": true,
  "reason": "...one phrase...",
  "judgment_target": "...what she was judging...",
  "intervention": "...the one to two sentence intervention...",
  "quoted_fragment": "...the literal fragment from her statement you quoted..."
}

If no clean candidate: { "fire": false, "reason": "...one phrase..." }`

  const choice = selectModel('reframe_draft')
  const { text } = await callModel(choice, { system: SYS, user: userPrompt, max_tokens: 600, temperature: 0.6 })
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) as Plan : { fire: false, reason: 'parse_fail' }
  } catch {
    return { fire: false, reason: 'parse_throw' }
  }
}

async function processUser(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; reason: string }> {
  if (await rateLimited(supabase, userId)) return { ok: false, reason: 'rate_limited' }

  const candidates = await findCandidates(supabase, userId)
  if (candidates.length === 0) return { ok: false, reason: 'no_candidates' }

  const plan = await planForUser(supabase, userId, candidates)
  if (!plan.fire || !plan.intervention) {
    await logEgoAuthority(supabase, {
      userId, mechanic: 'judgment_undermine', action: 'skipped',
      summary: plan.reason ?? 'no_fire',
      payload: { candidates: candidates.length },
    })
    return { ok: false, reason: plan.reason ?? 'no_fire' }
  }

  const cleaned = applyCraftFilter(plan.intervention)
  if (!cleaned) {
    await logEgoAuthority(supabase, {
      userId, mechanic: 'judgment_undermine', action: 'rejected_by_craft_filter',
      summary: 'draft failed pet-name/self-ref ceiling',
      payload: { original: plan.intervention?.slice(0, 200) },
    })
    return { ok: false, reason: 'craft_filter_rejected' }
  }

  // Pick the source candidate that best matches the quoted fragment.
  const source = candidates.find(c => plan.quoted_fragment && c.text.includes(plan.quoted_fragment.slice(0, 50)))
    ?? candidates[0]

  const intensity = await mechanicIntensity(supabase, userId, 'judgment_undermine')

  const { data: logRow, error: logErr } = await supabase.from('judgment_undermine_log').insert({
    user_id: userId,
    source_text: plan.quoted_fragment ?? source.text.slice(0, 500),
    source_table: source.table,
    source_id: source.id,
    judgment_target: plan.judgment_target ?? null,
    intervention_text: cleaned,
    intensity_at_emit: intensity,
  }).select('id').single()
  if (logErr) {
    console.error('judgment_undermine_log insert failed:', logErr.message)
    return { ok: false, reason: 'log_insert_failed' }
  }

  const outreachId = await enqueueEgoOutreach(supabase, {
    userId, mechanic: 'judgment_undermine',
    message: cleaned,
    urgency: 'normal',
    triggerReasonExtra: source.id,
    expiresInHours: 12,
  })

  if (outreachId && logRow) {
    await supabase.from('judgment_undermine_log').update({ outreach_id: outreachId }).eq('id', (logRow as { id: string }).id)
  }

  return { ok: true, reason: outreachId ? 'fired' : 'queued_outreach_failed' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const users = await listActiveUsers(supabase, 'judgment_undermine')
  const results: Array<{ user_id: string; ok: boolean; reason: string }> = []
  for (const userId of users) {
    try {
      const r = await processUser(supabase, userId)
      results.push({ user_id: userId, ...r })
    } catch (e) {
      results.push({ user_id: userId, ok: false, reason: 'throw:' + String(e).slice(0, 80) })
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
