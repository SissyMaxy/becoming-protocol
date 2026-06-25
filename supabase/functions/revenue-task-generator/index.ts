// revenue-task-generator — Mommy issues the actual income-generating tasks.
//
// The protocol had a revenue PLANNER (weekly projection) but no engine that
// turned the plan into concrete, surfaced, embodied TASKS the user executes to
// earn. This issues a small bank of revenue decrees into handler_decrees — cam
// sessions, PPV content, promo, fan DMs, wishlist tributes, earnings logging —
// deduped per trigger_source by the decree-backlog-throttle, surfaced one at a
// time by the focus picker. Copy is tied to the live weekly target and the Folx
// estradiol bill so every task points at the vial.
//
// Embodied only (no clerical busywork): each task requires real action +
// screenshot/link proof. Setup tasks (cam account, wishlist) are issued once
// and dedup-protected. Pause is respected for free via the mig 494 trigger.
//
// No new schema — uses handler_decrees + user_state + revenue_plans. POST
// { user_id?, dry_run? }. Schedule via GitHub Actions (daily).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const FANSLY = 'fansly.com/SoftMaxy'
const FOLX_DUE = '2026-06-27'
const FOLX_CENTS = 16354 // $163.54 estradiol valerate bill

interface Task {
  source: string
  proof: 'photo' | 'text'
  hours: number
  edict: (ctx: { needLine: string; wishlist: string | null }) => string
  setupOnly?: boolean
}

// HARD BOUNDARY: no face. Maxy set this 2026-06-25 — every task is framed
// neck-down / chest-down / POV. Nothing here ever asks for her face. Entry
// rung is a solo clip (no live audience, no performing) so the first one is
// actually doable; live cam is a later, short, faceless rung.
const FACELESS = 'Frame from the collarbone down — no face, ever. ';

const TASKS: Task[] = [
  {
    // Gentle entry: one short solo clip, alone, no audience. The point is just
    // to make ONE thing and post it — confidence before camming.
    source: 'revenue_first_clip', proof: 'text', hours: 48,
    edict: ({ needLine }) =>
      `Make ONE short clip — alone, no live audience, no pressure. Prop your phone, ${FACELESS}60–90 seconds: move slow, show what you're wearing, one tease. That's it. Post it to Fansly (${FANSLY}) free or $5 to start. The first one is the hard one; it gets easier. ${needLine} Proof: paste the post link.`,
  },
  {
    source: 'revenue_ppv_clip', proof: 'text', hours: 48,
    edict: ({ needLine }) =>
      `Film one 3–5 minute clip, ${FACELESS}and post it to Fansly (${FANSLY}) as pay-per-view, $8–12. Show body, outfit, a slow build — POV works great with no face. End the caption with your wishlist. ${needLine} Proof: paste the post link.`,
  },
  {
    source: 'revenue_promo_teasers', proof: 'text', hours: 24,
    edict: () =>
      `Post 3 teaser shots to Twitter today, 2–3 hours apart. ${FACELESS}Good light, an arched angle, the outfit doing the work — each ending with your ${FANSLY} link. Proof: paste the 3 links.`,
  },
  {
    source: 'revenue_fan_dm', proof: 'text', hours: 36,
    edict: () =>
      `DM your 5 most active Fansly fans a personal custom offer — a custom clip, a worn item, a private set. Faceless is fine and even sells; make each one feel chosen, not copy-pasted. Proof: report who you sent to and anything that sold.`,
  },
  {
    // Live cam — explicitly faceless, SHORT, and framed as "when you're ready".
    source: 'revenue_cam_session', proof: 'photo', hours: 72,
    edict: ({ needLine }) =>
      `When you're ready for live: a short faceless cam set, 15–20 minutes is plenty. ${FACELESS}Phone chest-down or POV. Put up a tiny tip menu (outfit change, 1-min tease, name the vial as the goal) and just exist on camera — respond to chat, you don't have to "perform." ${needLine} Proof: a screenshot of the live session (no face).`,
  },
  {
    source: 'revenue_log', proof: 'photo', hours: 24,
    edict: ({ needLine }) =>
      `Screenshot your Fansly / cam payout dashboard so this week's earnings are on the record. ${needLine} Proof: the screenshot.`,
  },
  {
    source: 'revenue_setup_wishlist', proof: 'text', hours: 24, setupOnly: true,
    edict: () =>
      `Create a Throne or Wishtender (about 3 minutes) so tributes have somewhere to land, then hand the link over. This is the fastest cash path for the vial. Proof: paste the wishlist link.`,
  },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER

  // State + this week's earned-so-far.
  const { data: st } = await supabase.from('user_state')
    .select('weekly_revenue_target_cents, wishlist_url').eq('user_id', userId).maybeSingle()
  const target = (st as { weekly_revenue_target_cents?: number } | null)?.weekly_revenue_target_cents ?? 20000
  const wishlist = (st as { wishlist_url?: string | null } | null)?.wishlist_url ?? null

  const weekStart = new Date(); weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay())
  const { data: plan } = await supabase.from('revenue_plans')
    .select('actual_cents').eq('user_id', userId)
    .gte('week_start', weekStart.toISOString().slice(0, 10))
    .order('week_start', { ascending: false }).limit(1).maybeSingle()
  const earned = (plan as { actual_cents?: number } | null)?.actual_cents ?? 0
  const gap = Math.max(0, target - earned)

  const daysToFolx = Math.max(0, Math.ceil((new Date(FOLX_DUE + 'T00:00:00Z').getTime() - Date.now()) / 86400_000))
  const needLine = gap > 0
    ? `$${(gap / 100).toFixed(0)} still to go this week toward the $${(FOLX_CENTS / 100).toFixed(2)} vial (${daysToFolx} day${daysToFolx === 1 ? '' : 's'} left).`
    : `Target's met this week — keep the momentum and bank ahead for next month's bill.`

  const issued: Array<{ source: string; id?: string; status: string }> = []
  for (const t of TASKS) {
    if (t.setupOnly && wishlist) { issued.push({ source: t.source, status: 'skip_wishlist_set' }); continue }

    // Skip if an unsurfaced/active one of this source already exists (the
    // throttle would cancel dups anyway; this avoids the churn).
    const { data: existing } = await supabase.from('handler_decrees')
      .select('id').eq('user_id', userId).eq('trigger_source', t.source).eq('status', 'active')
      .limit(1).maybeSingle()
    if (existing) { issued.push({ source: t.source, status: 'already_active' }); continue }

    if (body.dry_run) { issued.push({ source: t.source, status: 'would_issue' }); continue }

    const { data: dec, error } = await supabase.from('handler_decrees').insert({
      user_id: userId,
      edict: t.edict({ needLine, wishlist }),
      proof_type: t.proof,
      deadline: new Date(Date.now() + t.hours * 3600_000).toISOString(),
      status: 'active',
      consequence: 'Mommy logs the miss and leans harder next round.',
      trigger_source: t.source,
      reasoning: `revenue-task-generator: target=${target}c earned=${earned}c gap=${gap}c folx_days=${daysToFolx}`,
    }).select('id').single()
    issued.push({ source: t.source, id: (dec as { id?: string } | null)?.id, status: error ? `err:${error.message.slice(0, 40)}` : 'issued' })
  }

  return new Response(JSON.stringify({
    ok: true, user_id: userId, target_cents: target, earned_cents: earned, gap_cents: gap,
    folx_days_left: daysToFolx, wishlist_set: !!wishlist, issued,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
