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

    // Survey — slimmed to 14d window to stay under Edge Function memory ceiling
    const [
      { data: budgets },
      { data: paidConv },
      { data: lastReven },
      { data: contentPlat },
      { data: lastPlan },
    ] = await Promise.all([
      supabase.from('feminization_budget_targets')
        .select('label, monthly_cents, one_time_cents, priority, funded_cents')
        .eq('user_id', userId).eq('active', true)
        .order('priority', { ascending: true }).limit(8),
      supabase.from('paid_conversations')
        .select('platform, conversation_type, message_direction, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('revenue_events')
        .select('platform, revenue_type, amount, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('ai_generated_content')
        .select('platform, content_type, status')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('revenue_plans')
        .select('week_start, projected_cents, actual_cents, plan_summary')
        .eq('user_id', userId)
        .order('week_start', { ascending: false }).limit(2),
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

    const otherRevCents = (lastReven || []).filter((r: Record<string, unknown>) => r.revenue_type !== 'david_tax').reduce((s: number, r: Record<string, unknown>) => s + Math.round((Number(r.amount) || 0) * 100), 0)
    const lastPlanRow = (lastPlan as Array<Record<string, unknown>>)?.[0]
    const lastPlanProjected = (lastPlanRow?.projected_cents as number) || 0
    const lastPlanActual = (lastPlanRow?.actual_cents as number) || 0
    const conversionPctLast = lastPlanProjected > 0 ? Math.round((lastPlanActual / lastPlanProjected) * 100) : null

    const surveyText = `
CURRENT FINANCIAL STATE (14d window):
- Top unfunded budget target: ${tgLabel} ($${tgNeed} needed)
- Non-David revenue 14d: $${(otherRevCents / 100).toFixed(2)} across ${(lastReven || []).filter((r: Record<string, unknown>) => r.revenue_type !== 'david_tax').length} events
- DM volume 14d by platform: ${Object.entries(platformCounts).map(([p, c]) => `${p}=${c}`).join(', ') || 'NONE'}
- Content posting status 7d: ${Object.entries(contentCounts).slice(0, 6).map(([k, c]) => `${k}=${c}`).join(', ') || 'NONE'}
- Last plan conversion: ${conversionPctLast === null ? 'no prior plan' : `${conversionPctLast}% ($${(lastPlanActual / 100).toFixed(2)} actual / $${(lastPlanProjected / 100).toFixed(2)} projected)`}

USER STATE:
- Denial day: ${state.denial_day} · Phase: ${state.current_phase} · Slip points: ${state.slip_points_current} · Persona: ${state.handler_persona || 'handler'}

HARD CONSTRAINTS — DO NOT VIOLATE:
- Twitter is suspended → ZERO Twitter actions
- r/sissyhypno is TOS-fragile → use r/femboy (89k), r/Crossdressing_Sex, r/femboys instead, with stealth self-promo only
- Stripe / PayPal F&F / Cash App linked to Maxy's real ID → debanking risk → DO NOT propose these as primary payment paths. Use platform-internal (Fansly wallet, ManyVids payouts, Sniffies tips), adult-friendly processors (Paxum, CCBill, Fancentro), or crypto stablecoins.
- No Stripe Connect direct sales until weekly revenue is reliably > $200
- Capacity ceiling: Maxy has ~10–15 hours/week available between transition fatigue and David-job
- ASSUME 1–3% conversion on cold posts. ASSUME 5–15% on warm DMs.

CALIBRATED PRICING (2026 sissy/femboy market):
- Photo set (3–5 images): $3–10 entry, $20+ for customs
- Voice note 30s: $8–20 (lean $10–15 for new accounts)
- Short PPV video clip: $5–15
- Custom video: $15–50/min
- Sexting/GFE: $3–8/min OR $25–50 session
- Cam show 15min: $40–100 (NOT flat $40)
- Worn panties/socks: $40–150 — high margin, pre-HRT femboy commands premium
- Custom hypno/dirty talk audio: $15–50
- Dick rates: $10–30
- DO NOT propose photo sets at $15+ for unknown creator — start at lower quartile

PHASE 1 LEVERS TO PRIORITIZE (consensus high-ROI):
- ManyVids / Clips4Sale passive PPV uploads (set-and-forget, $5–15 per clip, no DM grind)
- Worn-item drops via FetLife / Reddit / Sniffies
- Reddit teaser → DM funnel with explicit pay menu
- Sniffies subscriber gigs (custom voice/photo)
- Fansly account creation (if not started) + 30 launch posts

WEEKLY REVENUE TARGET:
- Week 1 / no prior conversion data: project $20–50 total
- Week 2: $40–80
- Week 3+: increase only if last plan converted >40%
- Week N if last_actual > 0: project up to last_actual × 1.3 (30% growth ceiling)
- Hard ceiling: $300/week until 8 consecutive weeks of $200+ actual

OUTPUT REQUIREMENTS:
Generate a 5-item revenue plan for Mon–Sun this week. Each item must be a concrete action Maxy can execute in <2 hours of work, on a specific platform, with a specific deliverable, at a calibrated price. Reasoning must cite real menu data or platform mechanic — NOT generic "build audience" advice.

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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
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
      // Heuristic fallback — recalibrated to consensus pricing + Week 1
      // realistic targets ($30–50 total, not $50–300).
      plan = {
        plan_summary: 'Fallback Week 1: passive Clips4Sale upload + worn item drop + 2 cold posts + DM offers. Total $30–50 realistic.',
        items: [
          { action_label: 'Upload 1 pre-HRT tease clip (60–90s) to ManyVids or Clips4Sale priced at $7. Set-and-forget passive income.', deliverable: '1 PPV clip live with thumbnail + tags', platform: 'other', kind: 'ppv', projected_cents: 700, deadline_offset_hours: 36 },
          { action_label: 'List one worn pair of panties on FetLife with shipping ($45). Photo + 3-day wear description.', deliverable: '1 FetLife listing + DM responses', platform: 'fetlife', kind: 'custom_content', projected_cents: 4500, deadline_offset_hours: 96 },
          { action_label: 'Post 1 femboy tease in r/femboy with stealth "menu in DMs" pinned reply. NO direct paywall in post body — Reddit mods enforce.', deliverable: '1 r/femboy post + DM funnel set up', platform: 'reddit', kind: 'ppv', projected_cents: 1000, deadline_offset_hours: 48 },
          { action_label: 'Reply to 3 incoming DMs with concrete pay menu: $10 voice note (30s), $5 photo, $25 custom 1min video. Use Fansly wallet or Sniffies tip — NOT Cash App.', deliverable: '3 priced offers sent', platform: 'reddit', kind: 'custom_content', projected_cents: 1500, deadline_offset_hours: 96 },
          { action_label: 'Sniffies profile pitch: 30s voice intro + tip-jar link in bio. Reach out to 2 active subscribers with $8 voice-note offer.', deliverable: '1 voice intro + 2 outreach DMs', platform: 'sniffies', kind: 'tip', projected_cents: 1000, deadline_offset_hours: 72 },
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
