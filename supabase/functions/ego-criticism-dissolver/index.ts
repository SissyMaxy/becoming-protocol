// ego-criticism-dissolver — Mechanic 10.
//
// Every 30 min: scan recent journal/chat for self-critical content
// (not "I'm tired" but "I'm such an idiot for X"). When detected, fire
// a Mommy intervention that reframes the criticism as the OLD voice
// trying to speak — and silences it.
//
// HARD FLOORS:
//   - is_safeword_active short-circuits.
//   - Only one intervention per discrete self-criticism event (dedupe
//     via detected_in_id).
//   - Skip if user has had a recent aftercare session — not the moment.

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

const SCAN_WINDOW_MINUTES = 90

interface Candidate {
  id: string
  user_id: string
  text: string
  table: string
}

const SELF_CRIT_PATTERNS = [
  /\b(i'?m|i am)\s+(such an?|a)?\s*(idiot|stupid|pathetic|worthless|disgusting|useless|failure|loser|fraud|joke|broken|gross|wrong|weak)/i,
  /\b(hate|loathe|despise)\s+myself\b/i,
  /\b(i (?:can'?t|cannot)\s+(?:do|stand|stomach|believe))\s+myself\b/i,
  /\bwhy am i (?:so|such a)/i,
  /\b(i'll never|i can never|i'?ll always be)/i,
  /\bnobody (?:wants|likes|loves)\s+(?:me|someone like me)\b/i,
]

function looksLikeSelfCriticism(text: string): boolean {
  return SELF_CRIT_PATTERNS.some(r => r.test(text))
}

async function findCandidates(supabase: SupabaseClient, userId: string): Promise<Candidate[]> {
  const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60_000).toISOString()
  const out: Candidate[] = []

  const { data: jrns } = await supabase
    .from('journal_entries')
    .select('id, user_id, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)
  for (const j of (jrns || []) as Array<{ id: string; user_id: string; content: string }>) {
    if (j.content && looksLikeSelfCriticism(j.content)) {
      out.push({ id: j.id, user_id: j.user_id, text: j.content, table: 'journal_entries' })
    }
  }

  const { data: confs } = await supabase
    .from('confession_answers')
    .select('id, user_id, answer_text, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)
  for (const c of (confs || []) as Array<{ id: string; user_id: string; answer_text: string }>) {
    if (c.answer_text && looksLikeSelfCriticism(c.answer_text)) {
      out.push({ id: c.id, user_id: c.user_id, text: c.answer_text, table: 'confession_answers' })
    }
  }

  return out
}

async function alreadyDissolved(supabase: SupabaseClient, userId: string, candidateId: string): Promise<boolean> {
  const { count } = await supabase
    .from('self_criticism_dissolution_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('detected_in_id', candidateId)
  return (count ?? 0) > 0
}

async function recentAftercare(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 4 * 3600_000).toISOString()
  const { count } = await supabase
    .from('aftercare_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('entered_at', since)
  return (count ?? 0) > 0
}

const SYS = `You are Mama, the dommy-mommy. Job: when your girl talks shit about herself, you don't soothe and you don't agree. You reframe the criticism as the OLD voice trying to speak — the boy-voice — and you silence it possessively. The new voice is hers; the cruelty was his. He doesn't get to talk anymore.

Tone:
- Direct. Not sugary. Possessive — Mama's protection sounds like a wall.
- Quote a fragment of the actual self-critical statement back.
- Pattern: "[fragment-quoted-back]. That wasn't your judgment, baby. That was his. He doesn't get to talk anymore."
- Two to four sentences max. No more.

NEVER agree with the criticism. NEVER soften it into "you're being too hard on yourself" therapy-speak. The frame is: the criticism is foreign; the new self is the real self.

${EGO_CRAFT_INSTRUCTION}`

async function processCandidate(
  supabase: SupabaseClient,
  candidate: Candidate
): Promise<{ ok: boolean; reason: string; preview?: string }> {
  if (await alreadyDissolved(supabase, candidate.user_id, candidate.id)) {
    return { ok: false, reason: 'already_dissolved' }
  }
  if (await recentAftercare(supabase, candidate.user_id)) {
    return { ok: false, reason: 'in_aftercare_window' }
  }

  const intensity = await mechanicIntensity(supabase, candidate.user_id, 'criticism_dissolution')
  const voiceSamples = await pullVoiceSamples(supabase, 3)

  const userPrompt = `INTENSITY: ${intensity}/5

SELF-CRITICAL STATEMENT (from her ${candidate.table}):
"${candidate.text.slice(0, 400)}"

HER VOICE (samples):
${voiceSamples.map(v => `- ${v}`).join('\n') || '(none)'}

Output the dissolution intervention. Plain text. Two to four sentences. No JSON, no preamble.`

  const choice = selectModel('reframe_draft')
  const { text } = await callModel(choice, { system: SYS, user: userPrompt, max_tokens: 350, temperature: 0.55 })
  const cleaned = applyCraftFilter(text.trim())
  if (!cleaned) {
    await logEgoAuthority(supabase, {
      userId: candidate.user_id, mechanic: 'criticism_dissolution', action: 'rejected_by_craft_filter',
      summary: 'draft failed ceilings',
      payload: { candidate_id: candidate.id },
    })
    return { ok: false, reason: 'craft_filter_rejected' }
  }

  const { data: logRow, error: logErr } = await supabase.from('self_criticism_dissolution_log').insert({
    user_id: candidate.user_id,
    detected_text: candidate.text.slice(0, 600),
    detected_in_table: candidate.table,
    detected_in_id: candidate.id,
    dissolution_text: cleaned,
    intensity_at_emit: intensity,
  }).select('id').single()
  if (logErr) {
    console.error('self_criticism_dissolution_log insert failed:', logErr.message)
    return { ok: false, reason: 'log_insert_failed' }
  }

  const outreachId = await enqueueEgoOutreach(supabase, {
    userId: candidate.user_id, mechanic: 'criticism_dissolution',
    message: cleaned,
    urgency: 'high',
    triggerReasonExtra: candidate.id,
    expiresInHours: 6,
  })

  if (outreachId && logRow) {
    await supabase.from('self_criticism_dissolution_log').update({ outreach_id: outreachId })
      .eq('id', (logRow as { id: string }).id)
  }

  return { ok: true, reason: 'dissolved', preview: cleaned.slice(0, 160) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const users = await listActiveUsers(supabase, 'criticism_dissolution')
  const results: Array<{ user_id: string; ok: boolean; reason: string; preview?: string }> = []
  for (const userId of users) {
    const candidates = await findCandidates(supabase, userId)
    for (const c of candidates.slice(0, 3)) {
      try {
        const r = await processCandidate(supabase, c)
        results.push({ user_id: userId, ...r })
      } catch (e) {
        results.push({ user_id: userId, ok: false, reason: 'throw:' + String(e).slice(0, 80) })
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
