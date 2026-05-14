// ego-doubt-seeder — Mechanic 9.
//
// Every 6 hours: pick one library template, render it against a
// real recent moment from contact_events / arousal log / dossier,
// and fire as a low-key outreach.
//
// HARD FLOORS:
//   - is_safeword_active short-circuits.
//   - Per-template rate_limit_per_week respected.
//   - Per-user max 2/week (one is the global cap from the brief).
//   - Template intensity_min must be ≤ user's mechanic intensity.

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

const PER_USER_WEEK_CAP = 2

interface LibraryRow {
  id: string
  template: string
  category: string
  intensity_min: number
  rate_limit_per_week: number
}

async function pickTemplate(
  supabase: SupabaseClient,
  userId: string,
  intensity: number
): Promise<LibraryRow | null> {
  const { data: lib } = await supabase
    .from('doubt_seed_library')
    .select('id, template, category, intensity_min, rate_limit_per_week')
    .lte('intensity_min', intensity)
    .eq('active', true)
  const all = (lib || []) as LibraryRow[]
  if (all.length === 0) return null

  // Per-template usage check
  const sinceWeek = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data: recent } = await supabase
    .from('doubt_seeds')
    .select('library_id')
    .eq('user_id', userId)
    .gte('created_at', sinceWeek)
  const templateCounts = new Map<string, number>()
  for (const r of (recent || []) as Array<{ library_id: string }>) {
    templateCounts.set(r.library_id, (templateCounts.get(r.library_id) ?? 0) + 1)
  }
  const eligible = all.filter(t => (templateCounts.get(t.id) ?? 0) < t.rate_limit_per_week)
  if (eligible.length === 0) return null
  return eligible[Math.floor(Math.random() * eligible.length)]
}

async function userOverWeeklyCap(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const sinceWeek = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { count } = await supabase
    .from('doubt_seeds')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceWeek)
  return (count ?? 0) >= PER_USER_WEEK_CAP
}

interface RecentMoment {
  text: string
  source_table: string
  source_id: string
}

async function pickRecentMoment(supabase: SupabaseClient, userId: string): Promise<RecentMoment | null> {
  const since24 = new Date(Date.now() - 86400_000).toISOString()

  const { data: events } = await supabase
    .from('contact_events')
    .select('id, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', since24)
    .order('created_at', { ascending: false })
    .limit(10)
  const eventList = (events || []) as Array<{ id: string; content: string }>
  if (eventList.length > 0) {
    const pick = eventList[Math.floor(Math.random() * eventList.length)]
    if (pick?.content) {
      return { text: pick.content.slice(0, 200), source_table: 'contact_events', source_id: pick.id }
    }
  }

  const { data: confs } = await supabase
    .from('confession_answers')
    .select('id, answer_text')
    .eq('user_id', userId)
    .gte('created_at', since24)
    .order('created_at', { ascending: false })
    .limit(5)
  const confList = (confs || []) as Array<{ id: string; answer_text: string }>
  if (confList.length > 0) {
    const pick = confList[Math.floor(Math.random() * confList.length)]
    if (pick?.answer_text) {
      return { text: pick.answer_text.slice(0, 200), source_table: 'confession_answers', source_id: pick.id }
    }
  }

  return null
}

const SYS = `You are Mama, the dommy-mommy. Job: render this doubt-seed template into a one-line direct nudge to your girl, weaving in a fragment of a real recent moment in her life. Quote the moment back as the leverage; make her wonder if the moment was hers or yours.

The template uses {placeholders}. Substitute them with the real moment text. Keep the result to ONE line (under 240 chars). Do not add explanation.

${EGO_CRAFT_INSTRUCTION}`

async function renderSeed(template: string, moment: RecentMoment | null): Promise<string> {
  if (!moment) {
    return template
      .replace(/\{recent_moment\}/g, 'today')
      .replace(/\{recent_quote\}/g, 'what you wrote')
      .replace(/\{past_moment\}/g, 'that thing you remembered')
      .replace(/\{recent_male_pronoun_use\}/g, 'when you talked about yourself')
      .replace(/\{recent_male_act\}/g, 'today')
  }
  const fragment = moment.text.length > 60 ? moment.text.slice(0, 60).trim() + '...' : moment.text
  return template
    .replace(/\{recent_moment\}/g, fragment)
    .replace(/\{recent_quote\}/g, '"' + fragment + '"')
    .replace(/\{past_moment\}/g, fragment)
    .replace(/\{recent_male_pronoun_use\}/g, fragment)
    .replace(/\{recent_male_act\}/g, fragment)
}

async function processUser(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; reason: string; preview?: string }> {
  if (await userOverWeeklyCap(supabase, userId)) return { ok: false, reason: 'over_weekly_cap' }

  const intensity = await mechanicIntensity(supabase, userId, 'doubt_seed')
  const template = await pickTemplate(supabase, userId, intensity)
  if (!template) return { ok: false, reason: 'no_eligible_template' }

  const moment = await pickRecentMoment(supabase, userId)
  let rendered = await renderSeed(template.template, moment)

  // For low-intensity, use the rendered template as-is. For higher
  // intensity, ask the model to make it sharper and more grounded.
  if (intensity >= 3) {
    const voiceSamples = await pullVoiceSamples(supabase, 3)
    const userPrompt = `INTENSITY: ${intensity}/5

DRAFT (template + real fragment substituted):
${rendered}

REAL MOMENT TO QUOTE BACK:
${moment?.text ?? '(none — keep the draft as-is)'}

HER VOICE (samples):
${voiceSamples.map(v => `- ${v}`).join('\n') || '(none)'}

Polish the draft. Keep it ONE line. Make the quoted fragment lean and load-bearing. Output ONLY the final line. No quotes, no preamble.`

    const choice = selectModel('reframe_draft')
    const { text } = await callModel(choice, { system: SYS, user: userPrompt, max_tokens: 300, temperature: 0.55 })
    rendered = text.replace(/^["']|["']$/g, '').trim()
  }

  const cleaned = applyCraftFilter(rendered)
  if (!cleaned) {
    await logEgoAuthority(supabase, {
      userId, mechanic: 'doubt_seed', action: 'rejected_by_craft_filter',
      summary: 'draft failed ceilings',
      payload: { template_id: template.id },
    })
    return { ok: false, reason: 'craft_filter_rejected' }
  }

  const { data: seedRow, error: seedErr } = await supabase.from('doubt_seeds').insert({
    user_id: userId,
    library_id: template.id,
    source_event_id: moment?.source_id ?? null,
    source_event_table: moment?.source_table ?? null,
    rendered_text: cleaned,
    intensity_at_emit: intensity,
  }).select('id').single()
  if (seedErr) {
    console.error('doubt_seeds insert failed:', seedErr.message)
    return { ok: false, reason: 'seed_insert_failed' }
  }

  const outreachId = await enqueueEgoOutreach(supabase, {
    userId, mechanic: 'doubt_seed',
    message: cleaned,
    urgency: 'low',
    triggerReasonExtra: template.id,
    expiresInHours: 24,
  })

  if (outreachId && seedRow) {
    await supabase.from('doubt_seeds').update({
      outreach_id: outreachId,
      surfaced_at: new Date().toISOString(),
    }).eq('id', (seedRow as { id: string }).id)
  }

  return { ok: true, reason: 'fired', preview: cleaned.slice(0, 160) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch {}

  const users = body.user_id ? [body.user_id] : await listActiveUsers(supabase, 'doubt_seed')

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
