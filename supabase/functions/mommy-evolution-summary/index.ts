// mommy-evolution-summary — weekly paragraph closing the self-audit loop.
//
// "This week Mommy noticed X, built Y, shipped Z. Remaining gaps: ..."
//
// 2026-05-10 user directive — sibling to mommy-self-audit. The self-audit
// daily cron generates self_strengthening wishes; this weekly summary
// shows the loop closing: gap → wish → PR → shipped, plus what's still
// open. Lands on the admin dashboard AND as a low-urgency Today card so
// Maxy passively sees Mommy getting smarter without asking.
//
// Voice: plain operator English. NOT Mama voice. Capability-digest pattern.
//
// Idempotency: UNIQUE (week_start, week_end) on mommy_evolution_summary —
// running twice in the same week updates the existing row.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CANONICAL_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface AuditRun {
  id: string
  run_started_at: string
  status: string
  gaps_detected: Array<{ gap: string; source_signal: string; evidence_summary: string; severity: string }> | null
  wishes_created: string[] | null
  wish_count: number
}

interface WishLite {
  id: string
  wish_title: string
  status: string
  priority: string
  shipped_at: string | null
  shipped_in_commit: string | null
  auto_ship_blockers: string[] | null
  created_at: string
}

function weekBounds(now = new Date()): { start: string; end: string; startIso: string; endIso: string } {
  // ISO week: Monday → Sunday in UTC.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() || 7 // Sunday = 7 in ISO
  // Move to the most recent Sunday END date (the week we're summarising).
  // If today is Sunday, end = today. Otherwise end = previous Sunday.
  const sundayOffset = (day === 7) ? 0 : day
  const end = new Date(d); end.setUTCDate(d.getUTCDate() - sundayOffset)
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    startIso: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0)).toISOString(),
    endIso: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59)).toISOString(),
  }
}

async function composeNarrative(
  supabase: SupabaseClient,
  audits: AuditRun[],
  selfStrengtheningWishes: WishLite[],
): Promise<string> {
  // Aggregate the raw data into structured buckets the model can prose-ify.
  const noticed: string[] = []
  for (const a of audits) {
    if (Array.isArray(a.gaps_detected)) {
      for (const g of a.gaps_detected) {
        noticed.push(`- ${g.gap} (signal: ${g.source_signal}; evidence: ${g.evidence_summary.slice(0, 200)})`)
      }
    }
  }

  const shipped = selfStrengtheningWishes.filter(w => w.status === 'shipped')
  const inProgress = selfStrengtheningWishes.filter(w => w.status === 'in_progress' || w.status === 'queued')
  const blocked = selfStrengtheningWishes.filter(w =>
    w.status === 'needs_review'
    || (Array.isArray(w.auto_ship_blockers) && w.auto_ship_blockers.length > 0)
  )

  const buckets = {
    noticed: noticed.slice(0, 30),
    shipped: shipped.slice(0, 15).map(w => `- "${w.wish_title}" (commit ${w.shipped_in_commit?.slice(0, 8) || 'unknown'})`),
    in_progress: inProgress.slice(0, 15).map(w => `- "${w.wish_title}" [${w.status}, ${w.priority}]`),
    blocked: blocked.slice(0, 15).map(w => `- "${w.wish_title}" — blockers: ${(w.auto_ship_blockers || []).join(', ') || 'needs_review'}`),
  }

  const prompt = `You are writing a weekly engineering retrospective paragraph for the operator. The audience knows the system. Voice: plain operator English — NO Mommy voice, no kink terminology, no emojis.

Compose ONE PARAGRAPH (4–7 sentences max) following this exact template:

"This week Mommy noticed [the top 2–3 gap themes]. She built [what got proposed]. She shipped [what made it through the builder]. Remaining: [what's blocked or in flight, and why]. Next-week focus: [the single biggest fragility still unaddressed]."

Be specific (cite signal sources by name: "CI gate failures", "stuck wishes", "supervisor nudges", "cron job failures"). If a category is empty, omit it — don't pad. If the week was quiet (no gaps), say "Quiet week — no new gaps detected" and stop.

NOTICED:
${buckets.noticed.join('\n') || '(no audit runs detected gaps)'}

SHIPPED:
${buckets.shipped.join('\n') || '(nothing shipped)'}

IN PROGRESS / QUEUED:
${buckets.in_progress.join('\n') || '(none)'}

BLOCKED / NEEDS REVIEW:
${buckets.blocked.join('\n') || '(none)'}

Output the paragraph only, no headers, no quoting.`

  try {
    const choice = selectModel('strategic_plan', { prefer: 'anthropic' })
    const r = await callModel(choice, {
      system: 'You write tight engineering retrospectives in operator voice. One paragraph, no fluff, specific signal names.',
      user: prompt,
      max_tokens: 600,
      temperature: 0.4,
      json: false,
    })
    return r.text.trim()
  } catch (err) {
    // Fall back to a templated summary so the surface never silently dies.
    const _ = err
    return `Weekly self-audit summary: ${audits.length} audit run(s), ${noticed.length} gap(s) noticed, ${shipped.length} wish(es) shipped, ${inProgress.length} in flight, ${blocked.length} blocked/needs review.`
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  await expandUserId(supabase, CANONICAL_USER_ID)

  const { start, end, startIso, endIso } = weekBounds()

  // Pull audit runs from this week.
  const { data: auditData } = await supabase
    .from('mommy_self_audit_log')
    .select('id, run_started_at, status, gaps_detected, wishes_created, wish_count')
    .gte('run_started_at', startIso)
    .lte('run_started_at', endIso)
    .order('run_started_at', { ascending: false })
  const audits = (auditData || []) as AuditRun[]

  // Collect all wishes referenced by those runs + any self_strengthening
  // wishes from this week (catch wishes the audit might have missed FK-wise).
  const wishIds = new Set<string>()
  for (const a of audits) {
    if (Array.isArray(a.wishes_created)) for (const id of a.wishes_created) wishIds.add(id)
  }
  let wishes: WishLite[] = []
  if (wishIds.size > 0) {
    const { data } = await supabase
      .from('mommy_code_wishes')
      .select('id, wish_title, status, priority, shipped_at, shipped_in_commit, auto_ship_blockers, created_at')
      .in('id', Array.from(wishIds))
    wishes = (data || []) as WishLite[]
  }
  // Also catch self_strengthening wishes created this week that aren't linked
  // (e.g. inserted by a manual run that didn't write to wishes_created).
  const { data: classWishes } = await supabase
    .from('mommy_code_wishes')
    .select('id, wish_title, status, priority, shipped_at, shipped_in_commit, auto_ship_blockers, created_at')
    .eq('wish_class', 'self_strengthening')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
  for (const w of (classWishes || []) as WishLite[]) {
    if (!wishes.find(x => x.id === w.id)) wishes.push(w)
  }

  const summary_text = await composeNarrative(supabase, audits, wishes)

  const gapCount = audits.reduce((s, a) => s + (Array.isArray(a.gaps_detected) ? a.gaps_detected.length : 0), 0)
  const wish_count = wishes.length
  const shipped_count = wishes.filter(w => w.status === 'shipped').length
  const remaining_count = wishes.filter(w => w.status !== 'shipped' && w.status !== 'rejected').length

  const payload = {
    noticed: audits.flatMap(a => Array.isArray(a.gaps_detected) ? a.gaps_detected : []).slice(0, 30),
    built: wishes.slice(0, 30).map(w => ({
      title: w.wish_title, status: w.status, priority: w.priority,
      shipped_commit: w.shipped_in_commit,
    })),
    shipped: wishes.filter(w => w.status === 'shipped').map(w => ({
      title: w.wish_title, commit: w.shipped_in_commit, shipped_at: w.shipped_at,
    })),
    remaining: wishes.filter(w => w.status !== 'shipped' && w.status !== 'rejected').map(w => ({
      title: w.wish_title, status: w.status,
      blockers: w.auto_ship_blockers || [],
    })),
  }

  // Insert (or update) the weekly summary row.
  // Service-role can read the existing row to see if we already posted outreach.
  const { data: existing } = await supabase
    .from('mommy_evolution_summary')
    .select('id, outreach_id')
    .eq('week_start', start)
    .eq('week_end', end)
    .maybeSingle()

  let outreachId: string | null = (existing?.outreach_id as string | null) ?? null

  // Post outreach card only once per week (and only if there's actually
  // something to surface — quiet weeks don't need a Today card).
  if (!outreachId && (gapCount > 0 || wish_count > 0)) {
    const cardMessage = [
      `Mommy evolution — week of ${start} to ${end}.`,
      '',
      summary_text,
      '',
      gapCount > 0 || wish_count > 0
        ? `Counts: ${gapCount} gap(s) noticed, ${wish_count} wish(es) built, ${shipped_count} shipped, ${remaining_count} remaining.`
        : '',
    ].filter(Boolean).join('\n')
    const { data: outreachRow, error: outreachErr } = await supabase
      .from('handler_outreach_queue')
      .insert({
        user_id: CANONICAL_USER_ID,
        message: cardMessage,
        urgency: 'low',
        // 'mommy_evolves:YYYY-MM-DD' so dedup keys cleanly across reruns
        trigger_reason: `mommy_evolves:${start}_${end}`,
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        source: 'mommy_evolves',
      })
      .select('id')
      .single()
    if (!outreachErr) outreachId = (outreachRow as { id: string } | null)?.id ?? null
  }

  if (existing?.id) {
    await supabase.from('mommy_evolution_summary').update({
      gap_count: gapCount,
      wish_count,
      shipped_count,
      remaining_count,
      summary_text,
      payload,
      outreach_id: outreachId,
    }).eq('id', existing.id)
  } else {
    await supabase.from('mommy_evolution_summary').insert({
      week_start: start,
      week_end: end,
      gap_count: gapCount,
      wish_count,
      shipped_count,
      remaining_count,
      summary_text,
      payload,
      outreach_id: outreachId,
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    week_start: start,
    week_end: end,
    gap_count: gapCount,
    wish_count,
    shipped_count,
    remaining_count,
    summary_text,
    outreach_posted: Boolean(outreachId),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
