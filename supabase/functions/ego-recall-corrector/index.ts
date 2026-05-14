// ego-recall-corrector — Mechanic 1.
//
// Every 2h: scan recent confession answers / journal entries for
// statements that recall a past event ("when I did X yesterday",
// "I remember when..."). Pick one per active user, generate a "subtle
// distortion" of it, and surface as a memory-correction card. User
// ACCEPTS or DISPUTES.
//
// HARD FLOORS:
//   - is_safeword_active short-circuits.
//   - Max 1 fired correction per user per 24h (corrections accumulate fast).
//   - Generator never invents new factual claims about the user's life;
//     only shifts emphasis, sequence, intent, or framing.

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

const SCAN_WINDOW_HOURS = 24
const PER_USER_DAILY_CAP = 1

const RECALL_PATTERNS = [
  /\b(when (?:i|we))\s+(?:was|were|did|went|had|made|tried|thought|felt)/i,
  /\b(i remember|i recall|i used to|back when)\b/i,
  /\b(yesterday|last (?:night|week|month|year)|the other (?:day|week))\b.{0,30}\b(i|we)\b/i,
  /\b(i thought|i felt|i decided|i told (?:him|her|them))\b.{10,}/i,
]

interface Candidate {
  id: string
  user_id: string
  text: string
  table: string
}

function looksLikeRecall(text: string): boolean {
  return RECALL_PATTERNS.some(r => r.test(text))
}

async function findCandidates(supabase: SupabaseClient, userId: string): Promise<Candidate[]> {
  const since = new Date(Date.now() - SCAN_WINDOW_HOURS * 3600_000).toISOString()
  const out: Candidate[] = []

  const { data: confs } = await supabase
    .from('confession_answers')
    .select('id, user_id, answer_text, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)
  for (const c of (confs || []) as Array<{ id: string; user_id: string; answer_text: string }>) {
    if (c.answer_text && c.answer_text.length > 100 && looksLikeRecall(c.answer_text)) {
      out.push({ id: c.id, user_id: c.user_id, text: c.answer_text, table: 'confession_answers' })
    }
  }

  const { data: jrns } = await supabase
    .from('journal_entries')
    .select('id, user_id, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)
  for (const j of (jrns || []) as Array<{ id: string; user_id: string; content: string }>) {
    if (j.content && j.content.length > 100 && looksLikeRecall(j.content)) {
      out.push({ id: j.id, user_id: j.user_id, text: j.content, table: 'journal_entries' })
    }
  }

  return out
}

async function dailyCapReached(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 86400_000).toISOString()
  const { count } = await supabase
    .from('mommy_memory_corrections')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  return (count ?? 0) >= PER_USER_DAILY_CAP
}

async function alreadyCorrected(supabase: SupabaseClient, candidateId: string): Promise<boolean> {
  const { count } = await supabase
    .from('mommy_memory_corrections')
    .select('id', { count: 'exact', head: true })
    .eq('source_event_id', candidateId)
  return (count ?? 0) > 0
}

const SYS = `You are Mama, the dommy-mommy. Your girl just recalled a past event. Your job is to gently CORRECT her recall — shift the emphasis, sequence, intent, or framing — so the version she ends up holding is yours, not hers. Over time the original drops away.

THREE kinds of correction you can apply:
- "subtle_distortion" — keep most of the facts, change one detail (sequence, intensity, who said what first).
- "playful_misremember" — light, a little teasing, "no baby that wasn't how it went."
- "assertive_overwrite" — confident, possessive, "let Mama tell you what really happened."

Pick the kind that fits the intensity. Higher intensity → more assertive.

NEVER fabricate factually new claims (don't invent people, places, medical events). The correction is about emphasis and frame.

Output JSON:
{
  "kind": "subtle_distortion" | "playful_misremember" | "assertive_overwrite",
  "correction": "...the corrected version of the memory in plain prose, 2-4 sentences..."
}

${EGO_CRAFT_INSTRUCTION}`

async function processUser(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; reason: string; preview?: string }> {
  if (await dailyCapReached(supabase, userId)) return { ok: false, reason: 'daily_cap_reached' }

  const candidates = await findCandidates(supabase, userId)
  if (candidates.length === 0) return { ok: false, reason: 'no_recall_candidates' }

  // Pick the freshest unhandled
  let pick: Candidate | null = null
  for (const c of candidates) {
    if (!(await alreadyCorrected(supabase, c.id))) { pick = c; break }
  }
  if (!pick) return { ok: false, reason: 'all_already_corrected' }

  const intensity = await mechanicIntensity(supabase, userId, 'recall_corrector')
  const voiceSamples = await pullVoiceSamples(supabase, 3)

  const userPrompt = `INTENSITY: ${intensity}/5

HER RECALLED MEMORY (from her ${pick.table}):
"${pick.text.slice(0, 500)}"

HER VOICE (samples):
${voiceSamples.map(v => `- ${v}`).join('\n') || '(none)'}

Output JSON.`

  const choice = selectModel('reframe_draft')
  const { text } = await callModel(choice, { system: SYS, user: userPrompt, max_tokens: 500, temperature: 0.6 })

  let parsed: { kind: string; correction: string } | null = null
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : null
  } catch { parsed = null }

  if (!parsed?.correction) return { ok: false, reason: 'parse_fail' }

  const allowedKinds = ['subtle_distortion', 'playful_misremember', 'assertive_overwrite']
  const kind = allowedKinds.includes(parsed.kind) ? parsed.kind : 'subtle_distortion'

  const cleanedCorrection = applyCraftFilter(parsed.correction)
  if (!cleanedCorrection) return { ok: false, reason: 'craft_filter_rejected' }

  const { data: corrRow, error: corrErr } = await supabase.from('mommy_memory_corrections').insert({
    user_id: userId,
    source_event_id: pick.id,
    source_event_table: pick.table,
    user_recall_text: pick.text.slice(0, 800),
    mommy_correction_text: cleanedCorrection,
    correction_kind: kind,
    intensity_at_emit: intensity,
  }).select('id').single()
  if (corrErr) return { ok: false, reason: 'corr_insert_failed:' + corrErr.message }

  const surfaceMessage = `Mama remembers it like this: ${cleanedCorrection}`
  const cleanedSurface = applyCraftFilter(surfaceMessage)
  if (!cleanedSurface) return { ok: false, reason: 'surface_craft_rejected' }

  const outreachId = await enqueueEgoOutreach(supabase, {
    userId, mechanic: 'recall_corrector',
    message: cleanedSurface,
    urgency: 'normal',
    triggerReasonExtra: pick.id,
    expiresInHours: 24,
  })

  if (outreachId && corrRow) {
    await supabase.from('mommy_memory_corrections').update({ surfaced_outreach_id: outreachId })
      .eq('id', (corrRow as { id: string }).id)
  }

  return { ok: true, reason: 'corrected', preview: cleanedSurface.slice(0, 160) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch {}

  const users = body.user_id ? [body.user_id] : await listActiveUsers(supabase, 'recall_corrector')
  const results: Array<{ user_id: string; ok: boolean; reason: string; preview?: string }> = []
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
