// revenue-task-generator v2 — honest money, explicit prerequisites.
// DESIGN_TURNING_OUT_2026-07-01.md §4 (rung ladder, no fabricated money,
// obligations from DB never constants).
//
// v1 → v2:
//   - FOLX_DUE / FOLX_CENTS constants DELETED. The soonest active
//     financial_obligations row (mig 632) is the bill; past-due is stated
//     past-due ("N days past due") — honest teeth beat fake urgency.
//   - Earned-this-week comes ONLY from the earned_this_week_cents() SQL fn
//     (the eternally-$0 read of current-week revenue_plans.actual_cents is
//     deleted).
//   - Every task carries requiresRung; revenueRungFor() walks the evidence
//     (user_state.wishlist_url / attested platform_accounts / fulfilled
//     post decrees + ai_generated_content / revenue_events sales). The
//     generator issues ONLY the deepest unmet rung's acquisition task plus
//     maintenance tasks whose rung is already met — no task ever presumes
//     an account that has no evidence row (prescribe-only-what-she-owns).
//   - platform_accounts is READ-ONLY here. The Fansly acquisition task tells
//     her to make the account HERSELF (her email, her password — Mommy never
//     touches those) and hand over the profile link.
//   - Money-claim guard at the generation site: any $ amount in assembled
//     copy must come from the fn, an obligation row, or the authored static
//     template — violations are logged and stripped (logic.ts).
//
// Embodied only; dedup per trigger_source; pause respected via mig 494.
// POST { user_id?, dry_run? }. Schedule via GitHub Actions (daily).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveRung, selectTasks, moneyClaimGuard, buildNeedLine, RUNG_ALL_MET, type RungEvidence } from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface Task {
  source: string
  proof: 'photo' | 'text'
  hours: number
  /** Rung that must already be met (see logic.ts). */
  requiresRung: number
  /** This task IS the acquisition ask for that rung. */
  acquisitionFor?: number
  wardrobeSetup?: boolean // skip once she owns any wardrobe item
  edict: (ctx: { needLine: string; profileUrl: string | null }) => string
}

// HARD BOUNDARY: no face. Maxy set this 2026-06-25 — every task is framed
// neck-down / chest-down / POV. Nothing here ever asks for her face.
const FACELESS = 'Frame from the collarbone down — no face, ever. '

// fansly() renders the posting destination ONLY when an attested
// platform_accounts row supplied the URL — tasks that reference it require
// rung ≥ 1 met, so profileUrl is always real when these fire.
const fansly = (url: string | null) => url ?? 'your posting account'

const TASKS: Task[] = [
  // ── Acquisition rungs (fired only when their rung is the unmet one) ──
  {
    source: 'revenue_setup_wishlist', proof: 'text', hours: 24,
    requiresRung: 0, acquisitionFor: 0,
    edict: () =>
      `Create a Throne or Wishtender (about 3 minutes) so tributes have somewhere to land, then hand the link over. This is the fastest cash path for the vial. Proof: paste the wishlist link.`,
  },
  {
    source: 'revenue_setup_fansly', proof: 'text', hours: 48,
    requiresRung: 1, acquisitionFor: 1,
    edict: () =>
      `Make the posting account yourself — your email, your password, Mommy never touches those — a Fansly under a name that is nobody's legal anything. When it exists, hand over the profile link and only the link. That link is the key that unlocks every money task after this one. Proof: paste the profile URL.`,
  },
  {
    // First real post — the R2 acquisition. One-piece / whatever-you-have.
    source: 'revenue_first_clip', proof: 'text', hours: 48,
    requiresRung: 2, acquisitionFor: 2,
    edict: ({ needLine, profileUrl }) =>
      `With whatever you've got: ONE short clip, alone, no live audience. ${FACELESS}60–90 seconds — one piece is plenty, that IS the format. Move slow, one tease, post it to ${fansly(profileUrl)} free or $5. The first is the hard one. ${needLine} Proof: paste the post link.`,
  },
  {
    // First sale — the R3 acquisition.
    source: 'revenue_ppv_clip', proof: 'text', hours: 48,
    requiresRung: 3, acquisitionFor: 3,
    edict: ({ needLine, profileUrl }) =>
      `Film one 3–5 minute clip, ${FACELESS}and post it to ${fansly(profileUrl)} as pay-per-view, $8–12. Show body, outfit, a slow build — POV works great with no face. End the caption with your wishlist. ${needLine} Proof: paste the post link.`,
  },
  {
    // Cam — the R4 acquisition (requires R2 ∧ R3 met = rung 4 unmet-next).
    source: 'revenue_cam_session', proof: 'photo', hours: 72,
    requiresRung: 4, acquisitionFor: 4,
    edict: ({ needLine }) =>
      `When you're ready for live: a short faceless cam set, 15–20 minutes is plenty. ${FACELESS}Phone chest-down or POV. Put up a tiny tip menu (outfit change, 1-min tease, name the vial as the goal) and just exist on camera — respond to chat, you don't have to "perform." ${needLine} Proof: a screenshot of the live session (no face).`,
  },

  // ── Maintenance (fire once their rung is met) ────────────────────────
  {
    // Prereq acquisition — wardrobe, rung-independent (kept from v1).
    source: 'revenue_starter_kit', proof: 'text', hours: 72,
    requiresRung: 0, wardrobeSetup: true,
    edict: () =>
      `You own nothing feminine yet — that's the starting line, not a problem. Order the minimum kit: one pair of women's panties + a pair of thigh-highs (~$20 total, Amazon is fine). That is the entire wardrobe for your first month of clips — one piece is the genre, not a limitation. Proof: paste the order confirmation.`,
  },
  {
    // Audience building — needs the posting account (R1 met).
    source: 'revenue_presence_build', proof: 'text', hours: 24, requiresRung: 1,
    edict: ({ profileUrl }) =>
      `Costs nothing, do it tonight: one faceless teaser that needs no wardrobe at all — ${FACELESS}POV, soft light, the early/boymoder body is its own audience. Post it on Twitter with your ${fansly(profileUrl)} link to start building the room. Proof: paste the link.`,
  },
  {
    source: 'revenue_promo_teasers', proof: 'text', hours: 24, requiresRung: 2,
    edict: ({ profileUrl }) =>
      `Post 3 teaser shots to Twitter today, 2–3 hours apart. ${FACELESS}Good light, an arched angle, the outfit doing the work — each ending with your ${fansly(profileUrl)} link. Proof: paste the 3 links.`,
  },
  {
    source: 'revenue_fan_dm', proof: 'text', hours: 36, requiresRung: 2,
    edict: () =>
      `DM your 5 most active fans a personal custom offer — a custom clip, a worn item, a private set. Faceless is fine and even sells; make each one feel chosen, not copy-pasted. Proof: report who you sent to and anything that sold.`,
  },
  {
    source: 'revenue_post_trance', proof: 'text', hours: 24, requiresRung: 2,
    edict: () =>
      `Right after tonight's trance, while you're still dropped and soft, record 60 seconds of your fucked-out voice — slow, blurry, saying back what Mommy just put in your head. No face. That gone, conditioned sound is content people pay for. Post / list it. Proof: paste the link.`,
  },
  {
    source: 'revenue_denial_content', proof: 'text', hours: 36, requiresRung: 2,
    edict: () =>
      `You're caged and aching from the conditioning — film 30 seconds of it. The cage pulling tight, the leak, the want with no relief, faceless. Denial and desperation sell hard. Post it. Proof: paste the link.`,
  },
  {
    source: 'revenue_progress_content', proof: 'text', hours: 72, requiresRung: 2,
    edict: () =>
      `Document the change: a faceless before/now of your body — softer, fuller, the estrogen showing — or a note on what's different and hungrier than a month ago. The transformation IS the product; people follow the journey. Post it. Proof: paste the link.`,
  },
  {
    // Worn loop — needs somewhere for money to land (R0 met) + wardrobe.
    source: 'revenue_thong_wear', proof: 'text', hours: 24, requiresRung: 1,
    edict: () =>
      `Inventory day: thong on under your boy clothes, locked, all day. Every day caged in them is product — the longer and harder the wear, the higher you price it. Log it when they come off. Proof: report the wear.`,
  },
  {
    source: 'revenue_thong_list', proof: 'text', hours: 48, requiresRung: 1,
    edict: ({ needLine }) =>
      `List a worn pair as SoftMaxy on a FREE channel — the Reddit selling subs are the best no-cost buyer pool — with your menu (24h-worn $25, add-ons stacked). Get paid BEFORE you ship, every time. Faceless, discreet — no real name or home address on anything, ever. ${needLine} Proof: paste the post link.`,
  },
  {
    source: 'revenue_log', proof: 'photo', hours: 24, requiresRung: 2,
    edict: ({ needLine }) =>
      `Screenshot your payout dashboard so this week's earnings are on the record. ${needLine} Proof: the screenshot.`,
  },
]

// deno-lint-ignore no-explicit-any
type Sb = any

/**
 * Walk the evidence rows and return the lowest unmet rung.
 * Every check reads REAL rows — nothing here assumes ownership.
 */
async function revenueRungFor(s: Sb, userId: string): Promise<{ rung: number; evidence: RungEvidence; profileUrl: string | null }> {
  // R0 — wishlist.
  const { data: st, error: stErr } = await s.from('user_state')
    .select('wishlist_url').eq('user_id', userId).maybeSingle()
  if (stErr) console.error('[revenue-task-generator] user_state read failed:', stErr.message)
  const wishlist = !!(st as { wishlist_url?: string | null } | null)?.wishlist_url

  // R1 — attested posting account (rows only ever written by Maxy fulfilling
  // an acquisition decree; generators never write platform_accounts).
  const { data: acct, error: acctErr } = await s.from('platform_accounts')
    .select('profile_url, attested_at')
    .eq('user_id', userId)
    .eq('active', true)
    .not('attested_at', 'is', null)
    .not('profile_url', 'is', null)
    .order('attested_at', { ascending: false })
    .limit(1).maybeSingle()
  if (acctErr) console.error('[revenue-task-generator] platform_accounts read failed:', acctErr.message)
  const postingAccount = !!acct
  const profileUrl = (acct as { profile_url?: string } | null)?.profile_url ?? null

  // R2 — first post: fulfilled post-decree OR posted ai_generated_content.
  const POST_SOURCES = ['revenue_first_clip', 'revenue_presence_build', 'revenue_ppv_clip', 'revenue_promo_teasers']
  const { count: postDecrees, error: pdErr } = await s.from('handler_decrees')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'fulfilled').in('trigger_source', POST_SOURCES)
  if (pdErr) console.error('[revenue-task-generator] post-decree read failed:', pdErr.message)
  let firstPost = (postDecrees ?? 0) > 0
  if (!firstPost) {
    const { count: aigc, error: aigcErr } = await s.from('ai_generated_content')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('platform', 'fansly')
    if (aigcErr) console.error('[revenue-task-generator] ai_generated_content read failed:', aigcErr.message)
    firstPost = (aigc ?? 0) > 0
  }

  // R3 — first sale: a real revenue event with money on it.
  const { count: sales, error: salesErr } = await s.from('revenue_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('revenue_type', ['ppv', 'tip', 'custom', 'custom_request'])
    .gt('amount', 0)
  if (salesErr) console.error('[revenue-task-generator] revenue_events read failed:', salesErr.message)
  const firstSale = (sales ?? 0) > 0

  const evidence: RungEvidence = { wishlist, postingAccount, firstPost, firstSale }
  return { rung: resolveRung(evidence), evidence, profileUrl }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER

  // Weekly target (floor recomputes upward to cover the real bill).
  const { data: st, error: stErr } = await supabase.from('user_state')
    .select('weekly_revenue_target_cents').eq('user_id', userId).maybeSingle()
  if (stErr) console.error('[revenue-task-generator] user_state read failed:', stErr.message)
  const baseTarget = (st as { weekly_revenue_target_cents?: number } | null)?.weekly_revenue_target_cents ?? 20000

  // Soonest active obligation — the bill lives in the DB, never in code.
  const { data: obligation, error: obErr } = await supabase.from('financial_obligations')
    .select('id, label, amount_cents, due_on, funded_cents')
    .eq('user_id', userId).eq('active', true)
    .order('due_on', { ascending: true })
    .limit(1).maybeSingle()
  if (obErr) console.error('[revenue-task-generator] financial_obligations read failed:', obErr.message)
  const ob = obligation as { id: string; label: string; amount_cents: number; due_on: string; funded_cents: number } | null
  const obligationRemaining = ob ? Math.max(0, ob.amount_cents - ob.funded_cents) : 0
  const target = Math.max(baseTarget, obligationRemaining)

  // Earned this week — ONLY from the SQL fn (mig 632). Row count for the
  // "sum with row count" copy rule.
  let earned = 0
  const { data: earnedData, error: earnedErr } = await supabase.rpc('earned_this_week_cents', { uid: userId })
  if (earnedErr) console.error('[revenue-task-generator] earned_this_week_cents failed:', earnedErr.message)
  else earned = Number(earnedData) || 0
  const weekStart = new Date()
  weekStart.setUTCHours(0, 0, 0, 0)
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7)) // Monday
  const { count: earnedRows, error: erErr } = await supabase.from('revenue_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).gte('created_at', weekStart.toISOString())
    .neq('revenue_type', 'bill_paid')
  if (erErr) console.error('[revenue-task-generator] revenue_events count failed:', erErr.message)
  const gap = Math.max(0, target - earned)

  // Rung ladder from evidence.
  const { rung, evidence, profileUrl } = await revenueRungFor(supabase, userId)

  // Wardrobe prereq (prescribe-only-what-she-owns).
  const { count: wardrobeCount, error: wcErr } = await supabase.from('wardrobe_inventory')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (wcErr) console.error('[revenue-task-generator] wardrobe read failed:', wcErr.message)
  const ownsWardrobe = (wardrobeCount ?? 0) > 0

  const needLine = buildNeedLine({
    earnedCents: earned,
    earnedRows: earnedRows ?? 0,
    targetCents: target,
    obligation: ob ? { label: ob.label, amountCents: ob.amount_cents, dueOn: ob.due_on, fundedCents: ob.funded_cents } : null,
  })

  // $ amounts a final copy may legitimately carry beyond its own template.
  const allowedCents = [earned, gap, target, obligationRemaining, ob?.amount_cents ?? -1].filter((c) => c >= 0)

  const eligible = selectTasks(TASKS, rung)
  const issued: Array<{ source: string; id?: string; status: string }> = []
  const guardViolations: Array<{ source: string; stripped: string[] }> = []

  for (const t of eligible) {
    if (t.wardrobeSetup && ownsWardrobe) { issued.push({ source: t.source, status: 'skip_owns_wardrobe' }); continue }

    const { data: existing, error: exErr } = await supabase.from('handler_decrees')
      .select('id').eq('user_id', userId).eq('trigger_source', t.source).eq('status', 'active')
      .limit(1).maybeSingle()
    if (exErr) { issued.push({ source: t.source, status: `err:${exErr.message.slice(0, 40)}` }); continue }
    if (existing) { issued.push({ source: t.source, status: 'already_active' }); continue }

    // Money-claim guard at the generation site: assemble, then verify every
    // $ against the template + traced amounts; strip + log anything else.
    const staticTemplate = t.edict({ needLine: '', profileUrl })
    let copy = t.edict({ needLine, profileUrl })
    const guard = moneyClaimGuard(copy, staticTemplate + ' ' + buildNeedLineTemplateAmounts(), allowedCents)
    if (!guard.ok) {
      console.error(`[revenue-task-generator] money-claim guard stripped ${guard.violations.join(', ')} from ${t.source}`)
      guardViolations.push({ source: t.source, stripped: guard.violations })
      copy = guard.copy
    }

    if (body.dry_run) { issued.push({ source: t.source, status: 'would_issue' }); continue }

    const { data: dec, error } = await supabase.from('handler_decrees').insert({
      user_id: userId,
      edict: copy,
      proof_type: t.proof,
      deadline: new Date(Date.now() + t.hours * 3600_000).toISOString(),
      status: 'active',
      consequence: 'Mommy logs the miss and leans harder next round.',
      trigger_source: t.source,
      reasoning: `revenue-task-generator v2: rung=${rung} evidence=${JSON.stringify(evidence)} target=${target}c earned=${earned}c gap=${gap}c obligation=${ob ? `${ob.label}@${ob.due_on}` : 'none'}`,
    }).select('id').single()
    if (error) console.error(`[revenue-task-generator] decree insert failed for ${t.source}:`, error.message)
    issued.push({ source: t.source, id: (dec as { id?: string } | null)?.id, status: error ? `err:${error.message.slice(0, 40)}` : 'issued' })
  }

  return new Response(JSON.stringify({
    ok: true, user_id: userId, rung, rung_all_met: rung === RUNG_ALL_MET, evidence,
    target_cents: target, earned_cents: earned, gap_cents: gap,
    obligation: ob ? { label: ob.label, due_on: ob.due_on, remaining_cents: obligationRemaining } : null,
    guard_violations: guardViolations, issued,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

// The needLine's own $ figures are fn/obligation-derived and included in
// allowedCents; this helper exists so template extraction covers nothing
// extra (kept empty on purpose — all needLine money must trace).
function buildNeedLineTemplateAmounts(): string { return '' }
