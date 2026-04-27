// revenue-planner — Handler-generated weekly revenue plan.
// Surveys current state, picks 3-5 specific revenue actions for the week
// with concrete deliverables, prices, and deadlines. Writes a
// revenue_plans row + revenue_plan_items rows + corresponding
// handler_decrees so the items show up in the unified task list.
//
// POST {} → generates this week's plan if none exists
// POST { force: true } → overwrites this week's plan
// POST { review_last_week: true } → scores last week's plan vs actual

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PlanItem {
  action_label: string
  deliverable: string
  platform: string
  kind: string
  projected_cents: number
  deadline_offset_hours: number
  reasoning?: string
}

function weekStartDate(d: Date = new Date()): string {
  const day = d.getUTCDay()
  const diff = day === 0 ? 0 : -day
  const monday = new Date(d)
  monday.setUTCDate(monday.getUTCDate() + diff)
  return monday.toISOString().slice(0, 10)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const supabase = createClient(url, key)

    const body = await req.json().catch(() => ({}))
    const force = !!body.force
    const reviewLastWeek = !!body.review_last_week

    // Pick the user: explicit body.user_id, or the first user_state row.
    const explicitUserId = body.user_id as string | undefined
    let userId: string | null = explicitUserId ?? null
    let state: Record<string, unknown> | null = null
    if (!userId) {
      const { data: states, error: stateErr } = await supabase.from('user_state')
        .select('user_id, denial_day, current_phase, slip_points_current, hard_mode_active, chastity_locked, hrt_step_missed_days, handler_persona, updated_at')
        .order('updated_at', { ascending: false }).limit(1)
      if (stateErr) {
        return new Response(JSON.stringify({ ok: false, error: 'user_state read failed: ' + stateErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      state = ((states || [])[0] as Record<string, unknown> | undefined) ?? null
      userId = state ? (state.user_id as string) : null
    } else {
      const { data: row } = await supabase.from('user_state')
        .select('user_id, denial_day, current_phase, slip_points_current, hard_mode_active, chastity_locked, hrt_step_missed_days, handler_persona')
        .eq('user_id', userId).maybeSingle()
      state = (row as Record<string, unknown> | null) ?? { user_id: userId, denial_day: 0, current_phase: 'phase_1', slip_points_current: 0, handler_persona: 'handler' }
    }
    if (!userId || !state) {
      return new Response(JSON.stringify({ ok: false, error: 'no user_state — pass body.user_id or seed user_state' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (reviewLastWeek) {
      const result = await reviewPlan(supabase, userId)
      return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const wStart = weekStartDate()
    const { data: existing } = await supabase.from('revenue_plans')
      .select('id, status')
      .eq('user_id', userId).eq('week_start', wStart).maybeSingle()

    if (existing && !force) {
      return new Response(JSON.stringify({ ok: true, plan_id: (existing as { id: string }).id, status: 'already_exists' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (existing && force) {
      // Cancel old items, mark old plan cancelled
      await supabase.from('revenue_plan_items')
        .update({ status: 'cancelled' })
        .eq('plan_id', (existing as { id: string }).id)
        .eq('status', 'pending')
      await supabase.from('revenue_plans')
        .update({ status: 'cancelled' })
        .eq('id', (existing as { id: string }).id)
    }

    // Survey current state
    const [
      { data: budgets },
      { data: paidConv },
      { data: lastReven },
      { data: contentPlat },
    ] = await Promise.all([
      supabase.from('feminization_budget_targets')
        .select('label, monthly_cents, one_time_cents, priority, funded_cents')
        .eq('user_id', userId).eq('active', true)
        .order('priority', { ascending: true }).limit(8),
      supabase.from('paid_conversations')
        .select('platform, conversation_type, message_direction, created_at, incoming_message')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('revenue_events')
        .select('platform, revenue_type, amount, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('ai_generated_content')
        .select('platform, content_type, status, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(50),
    ])

    const topGap = (budgets || []).find((b: Record<string, unknown>) => {
      const need = ((b.monthly_cents as number) || 0) + ((b.one_time_cents as number) || 0)
      const funded = (b.funded_cents as number) || 0
      return need - funded > 0
    })

    const platformCounts: Record<string, number> = {}
    for (const r of (paidConv || []) as Array<Record<string, unknown>>) {
      const p = (r.platform as string) || 'unknown'
      platformCounts[p] = (platformCounts[p] || 0) + 1
    }
    const contentCounts: Record<string, number> = {}
    for (const r of (contentPlat || []) as Array<Record<string, unknown>>) {
      const k = `${r.platform}_${r.status}`
      contentCounts[k] = (contentCounts[k] || 0) + 1
    }

    const tg = topGap as { label?: string; monthly_cents?: number; one_time_cents?: number; funded_cents?: number } | undefined
    const tgNeed = tg ? Math.max(0, ((tg.monthly_cents || 0) + (tg.one_time_cents || 0) - (tg.funded_cents || 0)) / 100) : 0
    const tgLabel = tg?.label || 'none'

    const surveyText = `
CURRENT FINANCIAL STATE:
- Top unfunded budget target: ${tgLabel} ($${tgNeed} needed)
- Revenue events 30d: ${(lastReven || []).length} (David tax: ${(lastReven || []).filter((r: Record<string, unknown>) => r.revenue_type === 'david_tax').length}, other: ${(lastReven || []).filter((r: Record<string, unknown>) => r.revenue_type !== 'david_tax').length})
- DM volume 30d by platform: ${Object.entries(platformCounts).map(([p, c]) => `${p}=${c}`).join(', ') || 'none'}
- Content status 14d: ${Object.entries(contentCounts).slice(0, 10).map(([k, c]) => `${k}=${c}`).join(', ') || 'none'}

USER STATE:
- Denial day: ${state.denial_day}
- Phase: ${state.current_phase}
- Slip points: ${state.slip_points_current}
- Persona: ${state.handler_persona || 'handler'}

CONSTRAINTS:
- Twitter is suspended. Do NOT plan Twitter actions.
- No Stripe / OnlyFans / Fansly API integration exists. Revenue must be loggable manually after the fact.
- Maxy runs auto-poster scripts for: Reddit, FetLife, Sniffies, Fansly (posting only, no DM auto-charging).
- She has no existing OnlyFans presence to grow — would need to create one this week if she wants OF income.
- Maxy is pre-HRT, femboy aesthetic; her sellable content right now is cock pics, voice notes, sext, tease videos, custom dirty talk audio.
- Realistic per-item revenue this week: $5-50 per gig, $10-30 voice notes, $15-50 photo sets, $30-100 short videos, $50+ for custom anything.
- All actions should be SPECIFIC (a particular post on a particular platform with a particular ask, not "do social media").

Generate a 5-item revenue plan for this week (Mon-Sun). Each item should be a concrete action Maxy can execute herself today or tomorrow, with a specific projected revenue. Total target should be $50-300 depending on her current capacity.

Output STRICT JSON, no markdown, no preamble:
{
  "plan_summary": "<one short sentence on this week's strategy>",
  "items": [
    {
      "action_label": "<concrete action — e.g., 'Post femboy cock-tease teaser on r/sissyhypno'>",
      "deliverable": "<exactly what she produces or sends>",
      "platform": "reddit|fetlife|sniffies|fansly|onlyfans|irl|other",
      "kind": "ppv|tip|subscription|custom_content|cam_show|commission|other",
      "projected_cents": <integer>,
      "deadline_offset_hours": <integer, hours from now>,
      "reasoning": "<one short sentence>"
    }
  ]
}`.trim()

    let plan: { plan_summary: string; items: PlanItem[] } | null = null
    if (anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey })
        const resp = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: 'You return only valid JSON. No markdown. No preamble. No commentary.',
          messages: [{ role: 'user', content: surveyText }],
        })
        const text = resp.content[0].type === 'text' ? resp.content[0].text.trim() : ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) plan = JSON.parse(jsonMatch[0])
      } catch (e) {
        console.error('[revenue-planner] LLM failure:', e)
      }
    }

    if (!plan) {
      // Heuristic fallback — produces a reasonable default plan
      plan = {
        plan_summary: 'No-LLM fallback: focus on Reddit teaser posts + custom-content asks via DM.',
        items: [
          { action_label: 'Post 3 femboy teaser photos to r/sissyhypno + r/Crossdressing_Sex with a "DM for full set $15" tail', deliverable: '3 reddit posts with paywalled-DM funnel', platform: 'reddit', kind: 'ppv', projected_cents: 4500, deadline_offset_hours: 36 },
          { action_label: 'Reply to 5 incoming DMs with a custom-content offer ($10 voice note, $25 photo)', deliverable: '5 paid offers sent', platform: 'reddit', kind: 'custom_content', projected_cents: 5000, deadline_offset_hours: 72 },
          { action_label: 'Post FetLife status soliciting custom voice notes ($15 each)', deliverable: '1 FetLife post + at least 2 sales', platform: 'fetlife', kind: 'custom_content', projected_cents: 3000, deadline_offset_hours: 48 },
          { action_label: 'Sniffies subscriber outreach: pitch private cam show at $40', deliverable: '1 booked cam show', platform: 'sniffies', kind: 'cam_show', projected_cents: 4000, deadline_offset_hours: 96 },
          { action_label: 'Create one viral-aspiring Reddit post with affiliate link to femme/sissy gear', deliverable: '1 affiliate-linked post', platform: 'reddit', kind: 'commission', projected_cents: 1500, deadline_offset_hours: 120 },
        ],
      }
    }

    const totalProjected = plan.items.reduce((s, i) => s + (i.projected_cents || 0), 0)

    const { data: planRow, error: planErr } = await supabase.from('revenue_plans').insert({
      user_id: userId,
      week_start: wStart,
      projected_cents: totalProjected,
      plan_summary: plan.plan_summary,
      reasoning: surveyText.slice(0, 1500),
    }).select('id').single()
    if (planErr) throw planErr

    const planId = (planRow as { id: string }).id
    const itemRows: Array<Record<string, unknown>> = []
    const decreeRows: Array<Record<string, unknown>> = []
    for (const item of plan.items) {
      const deadline = new Date(Date.now() + (item.deadline_offset_hours || 72) * 3600000).toISOString()
      itemRows.push({
        plan_id: planId,
        user_id: userId,
        action_label: item.action_label,
        deliverable: item.deliverable,
        platform: item.platform,
        kind: item.kind,
        projected_cents: item.projected_cents,
        deadline,
        notes: item.reasoning,
      })
      decreeRows.push({
        user_id: userId,
        edict: `Revenue plan: ${item.action_label}. Target $${(item.projected_cents / 100).toFixed(2)}. Deliverable: ${item.deliverable}.`,
        proof_type: 'text',
        deadline,
        consequence: 'slip +2',
        reasoning: `Auto-generated from weekly revenue plan: ${item.reasoning || ''}`,
        phase: state.current_phase,
        trigger_source: 'revenue_planner',
      })
    }
    const { data: insertedItems } = await supabase.from('revenue_plan_items').insert(itemRows).select('id')
    const { data: insertedDecrees } = await supabase.from('handler_decrees').insert(decreeRows).select('id')
    // Stitch decree_id back onto items
    if (insertedItems && insertedDecrees && insertedItems.length === insertedDecrees.length) {
      for (let i = 0; i < insertedItems.length; i++) {
        await supabase.from('revenue_plan_items')
          .update({ decree_id: (insertedDecrees[i] as { id: string }).id })
          .eq('id', (insertedItems[i] as { id: string }).id)
      }
    }

    // Notify Maxy
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: `Weekly revenue plan: target $${(totalProjected / 100).toFixed(2)}. ${plan.items.length} actions queued as decrees. ${plan.plan_summary}`,
      urgency: 'high',
      trigger_reason: 'weekly_revenue_plan',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      source: 'revenue_planner',
    })

    return new Response(JSON.stringify({
      ok: true,
      plan_id: planId,
      week_start: wStart,
      projected_cents: totalProjected,
      items: plan.items.length,
      summary: plan.plan_summary,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[revenue-planner] error:', err)
    const e = err as { message?: string; details?: string; hint?: string; code?: string; stack?: string } | string
    const detail = typeof e === 'string' ? e : (e?.message || JSON.stringify(e))
    return new Response(JSON.stringify({ error: detail, code: typeof e === 'object' ? e?.code : undefined, hint: typeof e === 'object' ? e?.hint : undefined }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function reviewPlan(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<Record<string, unknown>> {
  // Find last week's plan
  const lastWeek = new Date()
  lastWeek.setDate(lastWeek.getDate() - 7)
  const lastWStart = weekStartDate(lastWeek)

  const { data: plan } = await supabase.from('revenue_plans')
    .select('id, projected_cents, plan_summary')
    .eq('user_id', userId).eq('week_start', lastWStart)
    .maybeSingle()
  if (!plan) return { reviewed: false, reason: 'no plan from last week' }

  const planId = (plan as { id: string }).id
  const projected = (plan as { projected_cents: number }).projected_cents

  const { data: items } = await supabase.from('revenue_plan_items')
    .select('id, status, projected_cents, actual_cents')
    .eq('plan_id', planId)

  const itemRows = (items || []) as Array<Record<string, unknown>>
  const completed = itemRows.filter(i => i.status === 'completed').length
  const missed = itemRows.filter(i => i.status === 'missed').length
  const actual = itemRows.reduce((s, i) => s + ((i.actual_cents as number) || 0), 0)
  const conversionPct = projected > 0 ? Math.round((actual / projected) * 100) : 0

  const summary = `Week of ${lastWStart}: $${(actual / 100).toFixed(2)} actual / $${(projected / 100).toFixed(2)} projected (${conversionPct}%). ${completed}/${itemRows.length} completed, ${missed} missed.`

  await supabase.from('revenue_plans').update({
    status: 'reviewed',
    actual_cents: actual,
    reviewed_at: new Date().toISOString(),
    reviewed_summary: summary,
  }).eq('id', planId)

  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: `Revenue review: ${summary} ${conversionPct < 50 ? 'Below target — adjusting next week.' : 'On track.'}`,
    urgency: 'standard',
    trigger_reason: 'revenue_plan_review',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    source: 'revenue_planner',
  })

  return { reviewed: true, conversion_pct: conversionPct, actual_cents: actual, projected_cents: projected, summary }
}
