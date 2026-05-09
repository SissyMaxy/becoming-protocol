// intervention-rate-tracker — daily snapshot of mommy_pct.
//
// 2026-05-08. Runs daily 00:00 UTC (cron registered in migration 317).
//
// The success metric for the growth loop. Counts resolutions over the
// last 24h:
//
//   mommy_resolutions =
//     deploy_health_log auto-closed by auto-healer +
//     mommy_code_wishes shipped (commit author = mommy-builder[bot]) +
//     autonomous_escalation_log entries with engine='auto_healer' that
//     resolved (action contains 'auto_close' / 'auto_fix') +
//     pattern_library_proposals merged this window
//
//   operator_resolutions =
//     non-bot commits to main +
//     restart_log entries with triggered_by ∈ {operator, manual} +
//     manual closures of escalation_log
//
// Per memory feedback "Don't claim capabilities that aren't real": we
// count what we can verify from logs. If a category isn't writable yet
// (e.g. restart_log doesn't exist), it contributes 0 — not a lie, just
// missing telemetry.
//
// Investigation flag: triggered when mommy_pct drops by >=20 points
// vs the prior 7-day mean. Also when total_resolutions=0 for >=3 days
// (system is silent, which is suspicious).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HANDLER_USER_ID, isoHoursAgo } from '../_shared/growth-loop.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GITHUB_REPO = 'SissyMaxy/becoming-protocol'
const BOT_AUTHOR_PATTERNS = [
  /mommy-builder\[bot\]/i,
  /^mommy-builder$/i,
  /claude(?:-code)?\[bot\]/i,
  /^claude(?:-code)?$/i,
  /github-actions\[bot\]/i,
]

interface Breakdown {
  mommy: {
    auto_healer_fixes: number
    mommy_builder_merges: number
    auto_resolved_escalations: number
    pattern_proposals_merged: number
  }
  operator: {
    manual_commits: number
    manual_restarts: number
    operator_resolved_escalations: number
  }
}

function isBotAuthor(name: string | null | undefined, login?: string | null): boolean {
  const candidates = [name ?? '', login ?? '']
  return candidates.some((c) => BOT_AUTHOR_PATTERNS.some((re) => re.test(c)))
}

async function countMommyResolutions(supabase: SupabaseClient, since: string): Promise<Breakdown['mommy']> {
  const out: Breakdown['mommy'] = {
    auto_healer_fixes: 0,
    mommy_builder_merges: 0,
    auto_resolved_escalations: 0,
    pattern_proposals_merged: 0,
  }

  // (1) auto-healer fixes — deploy_health_log rows transitioned to 'autopatched'
  // OR 'resolved' by the system (resolved_at filled, status changed)
  try {
    const { count } = await supabase
      .from('deploy_health_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'autopatched')
      .gte('resolved_at', since)
    out.auto_healer_fixes = count ?? 0
  } catch (err) {
    console.warn('[rate-tracker] deploy_health_log read failed:', err)
  }

  // (2) mommy_code_wishes shipped via the autonomous builder
  try {
    const { count } = await supabase
      .from('mommy_code_wishes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'shipped')
      .gte('shipped_at', since)
    out.mommy_builder_merges = count ?? 0
  } catch (err) {
    console.warn('[rate-tracker] mommy_code_wishes read failed:', err)
  }

  // (3) escalation_log entries auto-resolved
  try {
    const { count } = await supabase
      .from('autonomous_escalation_log')
      .select('*', { count: 'exact', head: true })
      .eq('engine', 'auto_healer')
      .gte('occurred_at', since)
      .like('action', 'auto_%')
    out.auto_resolved_escalations = count ?? 0
  } catch {
    /* ignore */
  }

  // (4) pattern proposals merged in window
  try {
    const { count } = await supabase
      .from('pattern_library_proposals')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'accepted')
      .gte('merged_at', since)
    out.pattern_proposals_merged = count ?? 0
  } catch {
    /* ignore */
  }

  return out
}

async function countOperatorResolutions(supabase: SupabaseClient, since: string): Promise<Breakdown['operator']> {
  const out: Breakdown['operator'] = {
    manual_commits: 0,
    manual_restarts: 0,
    operator_resolved_escalations: 0,
  }

  // (1) non-bot commits in last 24h
  const token = Deno.env.get('GITHUB_TOKEN') ?? ''
  if (token) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=main&since=${since}&per_page=100`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
      )
      if (r.ok) {
        const commits = (await r.json()) as Array<{
          commit: { author: { name: string } }
          author: { login?: string } | null
        }>
        out.manual_commits = commits.filter(
          (c) => !isBotAuthor(c.commit?.author?.name, c.author?.login),
        ).length
      }
    } catch (err) {
      console.warn('[rate-tracker] github commits fetch failed:', err)
    }
  }

  // (2) restart_log if exists
  try {
    const { count, error } = await supabase
      .from('restart_log')
      .select('*', { count: 'exact', head: true })
      .gte('occurred_at', since)
      .in('triggered_by', ['operator', 'manual'])
    if (!error) out.manual_restarts = count ?? 0
  } catch {
    /* table may not exist */
  }

  // (3) deploy_health_log rows manually resolved (status='resolved' but
  // not autopatched). Heuristic: status changed to resolved within window.
  try {
    const { count } = await supabase
      .from('deploy_health_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved')
      .gte('resolved_at', since)
    out.operator_resolved_escalations = count ?? 0
  } catch {
    /* ignore */
  }

  return out
}

async function shouldFlagInvestigation(
  supabase: SupabaseClient,
  userId: string,
  todayPct: number | null,
  totalToday: number,
): Promise<{ flag: boolean; reason: string | null }> {
  // (1) total_resolutions=0 for 3+ days = suspicious silence
  if (totalToday === 0) {
    const { data } = await supabase
      .from('intervention_rate_snapshots')
      .select('total_resolutions, snapshot_date')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(2)
    const prior = (data ?? []) as Array<{ total_resolutions: number; snapshot_date: string }>
    if (prior.length >= 2 && prior.every((r) => r.total_resolutions === 0)) {
      return { flag: true, reason: '3+ consecutive days with zero resolutions — telemetry may be broken' }
    }
  }

  // (2) sudden drop vs trailing 7-day mean
  if (todayPct !== null) {
    const { data } = await supabase
      .from('intervention_rate_snapshots')
      .select('mommy_pct')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(7)
    const prior = (data ?? []) as Array<{ mommy_pct: number | null }>
    const valid = prior.map((r) => r.mommy_pct).filter((p): p is number => p !== null)
    if (valid.length >= 5) {
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length
      if (mean - todayPct >= 20) {
        return { flag: true, reason: `mommy_pct dropped ${(mean - todayPct).toFixed(1)} points vs trailing 7-day mean (${mean.toFixed(1)} → ${todayPct.toFixed(1)}). Possibly a measurement artifact — check source counters before action.` }
      }
    }
  }

  return { flag: false, reason: null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const userId = HANDLER_USER_ID

  // Snapshot date = today. Window = last 24h ending now.
  const today = new Date().toISOString().slice(0, 10)
  const since = isoHoursAgo(24)

  // Idempotent: if we already snapshotted today, refresh-in-place rather
  // than insert. This lets the cron retry on transient failure.
  const { data: existing } = await supabase
    .from('intervention_rate_snapshots')
    .select('id')
    .eq('user_id', userId)
    .eq('snapshot_date', today)
    .maybeSingle()

  const [mommy, operator] = await Promise.all([
    countMommyResolutions(supabase, since),
    countOperatorResolutions(supabase, since),
  ])

  const mommyTotal = Object.values(mommy).reduce((a, b) => a + b, 0)
  const operatorTotal = Object.values(operator).reduce((a, b) => a + b, 0)
  const total = mommyTotal + operatorTotal
  const pct = total > 0 ? Number(((mommyTotal / total) * 100).toFixed(2)) : null

  const { flag, reason } = await shouldFlagInvestigation(supabase, userId, pct, total)

  const breakdown: Breakdown = { mommy, operator }
  const row = {
    user_id: userId,
    snapshot_date: today,
    total_resolutions: total,
    mommy_resolutions: mommyTotal,
    operator_resolutions: operatorTotal,
    mommy_pct: pct,
    breakdown,
    investigation_flagged: flag,
    investigation_reason: reason,
  }

  if (existing) {
    await supabase
      .from('intervention_rate_snapshots')
      .update(row)
      .eq('id', (existing as { id: string }).id)
  } else {
    await supabase.from('intervention_rate_snapshots').insert(row)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      snapshot_date: today,
      total_resolutions: total,
      mommy_resolutions: mommyTotal,
      operator_resolutions: operatorTotal,
      mommy_pct: pct,
      investigation_flagged: flag,
      investigation_reason: reason,
      breakdown,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
