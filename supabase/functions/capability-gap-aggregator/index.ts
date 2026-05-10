// capability-gap-aggregator — weekly sweep that closes the growth-loop.
//
// 2026-05-08. Runs Sunday 02:00 UTC (cron registered in migration 317).
//
// What it does, in order:
//   1. Read autonomous_escalation_log for the last 7d. Group by engine
//      + action. Entries triggered by 'auto_healer' that resolved are
//      NOT gaps — they're successes. The gap signal is the escalations
//      that didn't auto-resolve (e.g. action='pg_cron_auth_failure'
//      where the operator had to migrate).
//   2. Read main-branch git log via GitHub API. Commits NOT authored by
//      mommy-builder[bot] (or claude-bot) are operator interventions.
//      Categorize by file paths touched.
//   3. Read restart_log if it exists (from feature/supabase-health-
//      extensions). 'operator' / 'manual' triggered_by is a gap.
//   4. Read mommy_ideation_log rows tagged meta_self_review=true; if a
//      theme appears in 2+ recent rows it's a recurring blind spot.
//   5. Read pattern_library_proposals where outcome='proposed' and
//      match_count >= 5 — those are detector blind spots: we identified
//      a pattern but haven't promoted it yet.
//
// For each aggregated gap:
//   - Compute stable signature.
//   - If matching capability_gaps row exists AND closed_at IS NULL:
//     bump signal_count + last_signal_at.
//   - If row exists AND closed_at IS NOT NULL: re-open (clear closed_at)
//     and bump signal_count. The signal returned, the closure was wrong.
//   - If new: insert with signal_count=1.
//
// Wish creation:
//   - Triggered when signal_count >= 3 AND wish_id IS NULL AND
//     forbidden = false.
//   - Inserts into mommy_code_wishes with classified_at NULL so the
//     normal classifier path picks it up. We never bypass classification.
//
// Gap closure:
//   - For every capability_gaps row whose linked wish is now 'shipped'
//     AND the signal didn't appear in this run, set closed_at = now().
//   - Note: per memory feedback "Don't claim capabilities that aren't
//     real" — closing requires BOTH wish-shipped AND signal-stopped.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  HANDLER_USER_ID,
  forbiddenReason,
  gapSignature,
  isForbiddenPath,
  isoDaysAgo,
} from '../_shared/growth-loop.ts'

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

interface DetectedGap {
  signature: string
  category:
    | 'manual_restart'
    | 'manual_fix'
    | 'detector_blind_spot'
    | 'unimplemented_action'
    | 'failed_auto_patch'
    | 'recurring_ideation_theme'
  description: string
  paths: string[]
  context: Record<string, unknown>
}

function isBotAuthor(name: string | null | undefined, login?: string | null): boolean {
  const candidates = [name ?? '', login ?? '']
  return candidates.some((c) => BOT_AUTHOR_PATTERNS.some((re) => re.test(c)))
}

// ---- (a) escalation_log scan ----
async function detectFromEscalationLog(supabase: SupabaseClient): Promise<DetectedGap[]> {
  const since = isoDaysAgo(7)
  const { data, error } = await supabase
    .from('autonomous_escalation_log')
    .select('engine, action, rationale, after_state, occurred_at')
    .gte('occurred_at', since)
    .limit(500)
  if (error) {
    console.warn('[gap-aggregator] escalation_log read failed:', error.message)
    return []
  }
  const rows = (data ?? []) as Array<{
    engine: string
    action: string
    rationale: string | null
    after_state: Record<string, unknown> | null
    occurred_at: string
  }>

  // Group by (engine, action). Anything from auto_healer is a fix the
  // system DID make — that's a success, not a gap. The gap signal is
  // when the auto_healer ESCALATED but didn't fix (action like
  // 'pg_cron_auth_failure' where the entry is a remediation suggestion
  // for the operator).
  const groups = new Map<string, { count: number; sample: typeof rows[number] }>()
  for (const r of rows) {
    // auto_healer entries that aren't escalations are fine
    if (r.engine === 'auto_healer' && !r.action.includes('escalat') && !r.action.includes('failure')) {
      continue
    }
    const key = `${r.engine}::${r.action}`
    const existing = groups.get(key)
    if (existing) existing.count++
    else groups.set(key, { count: 1, sample: r })
  }

  const out: DetectedGap[] = []
  for (const [key, info] of groups.entries()) {
    if (info.count < 2) continue // single occurrence isn't a pattern yet
    out.push({
      signature: gapSignature('unimplemented_action', key),
      category: 'unimplemented_action',
      description: `${info.sample.engine} escalated '${info.sample.action}' ${info.count}× in 7d without auto-resolving. Sample rationale: ${(info.sample.rationale ?? '').slice(0, 200)}`,
      paths: [],
      context: {
        engine: info.sample.engine,
        action: info.sample.action,
        count: info.count,
        last_occurred_at: info.sample.occurred_at,
        sample_after_state: info.sample.after_state,
      },
    })
  }
  return out
}

// ---- (b) git log scan ----
async function detectFromGitLog(): Promise<DetectedGap[]> {
  const token = Deno.env.get('GITHUB_TOKEN') ?? ''
  if (!token) {
    console.warn('[gap-aggregator] GITHUB_TOKEN missing — skipping git log scan')
    return []
  }
  const since = isoDaysAgo(7)
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=main&since=${since}&per_page=100`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
    )
    if (!r.ok) {
      console.warn(`[gap-aggregator] github commits ${r.status}: ${(await r.text()).slice(0, 200)}`)
      return []
    }
    const commits = (await r.json()) as Array<{
      sha: string
      commit: { message: string; author: { name: string; email: string } }
      author: { login?: string } | null
    }>

    // For each non-bot commit fetch its files (separate API call). Cap
    // at 30 commits to bound API budget; if more, the busiest 7d will
    // show the same patterns next run.
    const operatorCommits = commits.filter((c) => !isBotAuthor(c.commit?.author?.name, c.author?.login))
    const sample = operatorCommits.slice(0, 30)

    const groups = new Map<
      string,
      { count: number; samples: Array<{ sha: string; subject: string; paths: string[] }> }
    >()
    for (const c of sample) {
      try {
        const fr = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/commits/${c.sha}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
        )
        if (!fr.ok) continue
        const detail = (await fr.json()) as { files?: Array<{ filename: string }> }
        const paths = (detail.files ?? []).map((f) => f.filename).slice(0, 20)
        const subject = (c.commit.message ?? '').split('\n')[0].slice(0, 120)
        // Pattern key: dominant file-class + verb
        const dominantClass = paths.length > 0 ? classifyPath(paths[0]) : 'unknown'
        const verb = (subject.match(/^(fix|feat|refactor|chore|revert|hotfix|patch)(?:\([^)]+\))?:?/i)?.[1] ?? 'change').toLowerCase()
        const key = `${verb}:${dominantClass}`
        const existing = groups.get(key)
        const sampleEntry = { sha: c.sha.slice(0, 12), subject, paths }
        if (existing) {
          existing.count++
          if (existing.samples.length < 5) existing.samples.push(sampleEntry)
        } else {
          groups.set(key, { count: 1, samples: [sampleEntry] })
        }
      } catch {
        /* ignore single-commit fetch errors */
      }
    }

    const out: DetectedGap[] = []
    for (const [key, info] of groups.entries()) {
      if (info.count < 2) continue // need a pattern, not a one-off
      const allPaths = info.samples.flatMap((s) => s.paths)
      out.push({
        signature: gapSignature('manual_fix', key),
        category: 'manual_fix',
        description: `${info.count} operator commits in 7d matching pattern "${key}". Mommy hasn't been catching these. Sample subjects: ${info.samples.slice(0, 3).map((s) => `"${s.subject}"`).join('; ')}`,
        paths: allPaths,
        context: { pattern_key: key, count: info.count, samples: info.samples },
      })
    }
    return out
  } catch (err) {
    console.warn('[gap-aggregator] git log scan failed:', err)
    return []
  }
}

function classifyPath(p: string): string {
  if (/^api\//.test(p)) return 'api'
  if (/^supabase\/migrations\//.test(p)) return 'schema'
  if (/^supabase\/functions\//.test(p)) return 'edge_fn'
  if (/^src\/components\//.test(p)) return 'ui'
  if (/^src\/lib\//.test(p)) return 'lib'
  if (/^scripts\//.test(p)) return 'script'
  if (/^\.github\/workflows\//.test(p)) return 'ci'
  if (/^vercel\.json$|^package\.json$|^tsconfig/.test(p)) return 'config'
  return 'other'
}

// ---- (c) restart_log scan (defensive — table may not exist) ----
async function detectFromRestartLog(supabase: SupabaseClient): Promise<DetectedGap[]> {
  try {
    const since = isoDaysAgo(7)
    const { data, error } = await supabase
      .from('restart_log')
      .select('triggered_by, target, reason, occurred_at')
      .gte('occurred_at', since)
      .limit(200)
    if (error) {
      // Table missing or RLS issue — log and continue
      if (error.code === '42P01' || /does not exist/i.test(error.message)) return []
      console.warn('[gap-aggregator] restart_log read error (continuing):', error.message)
      return []
    }
    const rows = (data ?? []) as Array<{
      triggered_by: string
      target: string
      reason: string | null
      occurred_at: string
    }>
    const manual = rows.filter((r) => r.triggered_by === 'operator' || r.triggered_by === 'manual')
    if (manual.length === 0) return []
    const groups = new Map<string, { count: number; sample: typeof manual[number] }>()
    for (const r of manual) {
      const key = r.target ?? 'unknown'
      const existing = groups.get(key)
      if (existing) existing.count++
      else groups.set(key, { count: 1, sample: r })
    }
    const out: DetectedGap[] = []
    for (const [target, info] of groups.entries()) {
      out.push({
        signature: gapSignature('manual_restart', target),
        category: 'manual_restart',
        description: `Operator manually restarted '${target}' ${info.count}× in 7d — should be self-healing. Last reason: ${(info.sample.reason ?? '').slice(0, 200)}`,
        paths: [],
        context: { target, count: info.count, sample: info.sample },
      })
    }
    return out
  } catch (err) {
    console.warn('[gap-aggregator] restart_log scan errored:', err)
    return []
  }
}

// ---- (d) recurring meta-self-review themes ----
async function detectFromSelfReviewThemes(supabase: SupabaseClient): Promise<DetectedGap[]> {
  try {
    const since = isoDaysAgo(28) // 4 weeks of self-review runs (weekly cadence)
    const { data, error } = await supabase
      .from('mommy_ideation_log')
      .select('judged, panel_summary, context_snapshot, created_at')
      .gte('created_at', since)
      .limit(20)
    if (error) {
      console.warn('[gap-aggregator] mommy_ideation_log read failed:', error.message)
      return []
    }
    const rows = (data ?? []) as Array<{
      judged: string | null
      panel_summary: Record<string, unknown> | null
      context_snapshot: Record<string, unknown> | null
      created_at: string
    }>
    const meta = rows.filter(
      (r) => (r.context_snapshot as { meta_self_review?: boolean } | null)?.meta_self_review === true,
    )
    if (meta.length < 2) return [] // need at least two self-reviews to find a recurring theme

    // Naive theme extraction: pull bullet-style "title: ..." lines from
    // each judged output, count occurrences across runs.
    const themeCounts = new Map<string, { count: number; samples: string[] }>()
    for (const r of meta) {
      const text = (r.judged ?? '').toLowerCase()
      const matches = text.match(/(?:^|\n)\s*[-*•]?\s*(?:title:|gap:|missing:|capability:)\s*([^\n.]{4,80})/gi) ?? []
      for (const m of matches) {
        const key = m
          .replace(/^[\s\-*•]+/, '')
          .replace(/^(title:|gap:|missing:|capability:)\s*/i, '')
          .trim()
          .slice(0, 80)
        if (!key) continue
        const existing = themeCounts.get(key)
        if (existing) {
          existing.count++
          if (existing.samples.length < 3) existing.samples.push((r.judged ?? '').slice(0, 200))
        } else {
          themeCounts.set(key, { count: 1, samples: [(r.judged ?? '').slice(0, 200)] })
        }
      }
    }

    const out: DetectedGap[] = []
    for (const [theme, info] of themeCounts.entries()) {
      if (info.count < 2) continue
      out.push({
        signature: gapSignature('recurring_ideation_theme', theme),
        category: 'recurring_ideation_theme',
        description: `Self-review surfaced "${theme}" in ${info.count} of last ${meta.length} runs. Recurring blind spot.`,
        paths: [],
        context: { theme, count: info.count, samples: info.samples },
      })
    }
    return out
  } catch (err) {
    console.warn('[gap-aggregator] self-review theme scan errored:', err)
    return []
  }
}

// ---- (e) unpromoted pattern proposals ----
async function detectFromPatternProposals(supabase: SupabaseClient): Promise<DetectedGap[]> {
  const { data, error } = await supabase
    .from('pattern_library_proposals')
    .select('id, pattern_signature, match_count, proposed_at, outcome, last_match_at')
    .eq('outcome', 'proposed')
    .gte('match_count', 5)
    .lte('proposed_at', isoDaysAgo(3)) // dwelled for 3+ days without promotion
    .limit(50)
  if (error) {
    console.warn('[gap-aggregator] pattern proposals read failed:', error.message)
    return []
  }
  const rows = (data ?? []) as Array<{
    id: string
    pattern_signature: string
    match_count: number
    proposed_at: string
    outcome: string
    last_match_at: string
  }>
  return rows.map((r) => ({
    signature: gapSignature('detector_blind_spot', r.pattern_signature),
    category: 'detector_blind_spot' as const,
    description: `Pattern proposal "${r.pattern_signature}" has ${r.match_count} matches but hasn't been promoted (proposed ${r.proposed_at.slice(0, 10)}). Detector identified the shape but the auto-fix isn't shipped yet.`,
    paths: [],
    context: { proposal_id: r.id, pattern_signature: r.pattern_signature, match_count: r.match_count },
  }))
}

// ---- upsert / wish-creation pipeline ----
async function upsertGap(
  supabase: SupabaseClient,
  userId: string,
  gap: DetectedGap,
  signaledThisRun: Set<string>,
): Promise<void> {
  signaledThisRun.add(gap.signature)
  const forbiddenWhy = forbiddenReason(gap.paths)
  const isForbidden = forbiddenWhy !== null || gap.paths.some(isForbiddenPath)

  const { data: existing } = await supabase
    .from('capability_gaps')
    .select('id, signal_count, closed_at, wish_id')
    .eq('user_id', userId)
    .eq('signature', gap.signature)
    .maybeSingle()

  if (existing) {
    const row = existing as { id: string; signal_count: number; closed_at: string | null; wish_id: string | null }
    await supabase
      .from('capability_gaps')
      .update({
        signal_count: row.signal_count + 1,
        last_signal_at: new Date().toISOString(),
        closed_at: null, // signal returned — re-open
        description: gap.description,
        context: gap.context,
      })
      .eq('id', row.id)

    // Generate wish if threshold crossed and not forbidden / already linked
    const newCount = row.signal_count + 1
    if (newCount >= 3 && !row.wish_id && !isForbidden) {
      await createWishForGap(supabase, row.id, gap)
    }
    return
  }

  // New row
  const { data: inserted, error } = await supabase
    .from('capability_gaps')
    .insert({
      user_id: userId,
      signature: gap.signature,
      category: gap.category,
      description: gap.description,
      signal_count: 1,
      last_signal_at: new Date().toISOString(),
      forbidden: isForbidden,
      forbidden_reason: forbiddenWhy,
      context: gap.context,
    })
    .select('id')
    .single()
  if (error) {
    console.warn(`[gap-aggregator] insert failed for ${gap.signature}:`, error.message)
  }
  void inserted
}

async function createWishForGap(
  supabase: SupabaseClient,
  gapId: string,
  gap: DetectedGap,
): Promise<void> {
  const wishTitle = `[capability_gap] ${gap.description.slice(0, 140)}`
  const wishBody = `Capability gap aggregated from operator interventions over the last 7+ days.

Category: ${gap.category}
Signature: ${gap.signature}
Description: ${gap.description}

Affected paths (sample):
${gap.paths.slice(0, 10).map((p) => `  - ${p}`).join('\n') || '  (none — non-code signal)'}

Context:
${JSON.stringify(gap.context, null, 2).slice(0, 1500)}

The growth-loop aggregator surfaced this gap because the same intervention pattern recurred 3+ times without Mommy resolving it autonomously. Build the missing capability so future occurrences self-heal.`

  const { data: wish, error } = await supabase
    .from('mommy_code_wishes')
    .insert({
      wish_title: wishTitle.slice(0, 200),
      wish_body: wishBody,
      protocol_goal: 'growth_loop / close_capability_gap',
      source: 'gap_audit',
      priority: 'normal',
      // classified_at is NULL — classifier will pick it up. We do NOT
      // bypass classification.
    })
    .select('id')
    .single()
  if (error) {
    console.warn(`[gap-aggregator] wish insert failed for gap ${gapId}:`, error.message)
    return
  }
  await supabase
    .from('capability_gaps')
    .update({ wish_id: (wish as { id: string }).id })
    .eq('id', gapId)
}

// Closure pass: gaps whose linked wish is shipped AND signal didn't fire
// this run get closed. Memory feedback: closure requires BOTH conditions.
async function closeResolvedGaps(supabase: SupabaseClient, userId: string, signaledThisRun: Set<string>): Promise<number> {
  const { data: candidates } = await supabase
    .from('capability_gaps')
    .select('id, signature, wish_id')
    .eq('user_id', userId)
    .is('closed_at', null)
    .not('wish_id', 'is', null)
    .limit(200)
  const rows = (candidates ?? []) as Array<{ id: string; signature: string; wish_id: string }>
  if (rows.length === 0) return 0

  const wishIds = rows.map((r) => r.wish_id)
  const { data: wishes } = await supabase
    .from('mommy_code_wishes')
    .select('id, status')
    .in('id', wishIds)
  const shippedWishIds = new Set(
    ((wishes ?? []) as Array<{ id: string; status: string }>).filter((w) => w.status === 'shipped').map((w) => w.id),
  )

  let closed = 0
  for (const r of rows) {
    if (!shippedWishIds.has(r.wish_id)) continue // wish not shipped yet
    if (signaledThisRun.has(r.signature)) continue // signal still firing — keep open
    await supabase.from('capability_gaps').update({ closed_at: new Date().toISOString() }).eq('id', r.id)
    closed++
  }
  return closed
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const userId = HANDLER_USER_ID

  const detectorResults: Array<{ name: string; count: number; error?: string }> = []
  const allGaps: DetectedGap[] = []

  for (const [name, fn] of [
    ['escalation_log', detectFromEscalationLog],
    ['git_log', () => detectFromGitLog()],
    ['restart_log', detectFromRestartLog],
    ['self_review_themes', detectFromSelfReviewThemes],
    ['pattern_proposals', detectFromPatternProposals],
  ] as const) {
    try {
      const found = (await (fn as (s: SupabaseClient) => Promise<DetectedGap[]>)(supabase)) ?? []
      allGaps.push(...found)
      detectorResults.push({ name, count: found.length })
    } catch (err) {
      detectorResults.push({ name, count: 0, error: String(err).slice(0, 200) })
    }
  }

  const signaledThisRun = new Set<string>()
  for (const g of allGaps) {
    await upsertGap(supabase, userId, g, signaledThisRun)
  }

  const closed = await closeResolvedGaps(supabase, userId, signaledThisRun)

  // Count wishes created this run (rough — query for newly-created wishes
  // linked from gaps in the last few minutes)
  const { count: newWishCount } = await supabase
    .from('capability_gaps')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('updated_at', new Date(Date.now() - 5 * 60_000).toISOString())
    .not('wish_id', 'is', null)

  return new Response(
    JSON.stringify({
      ok: true,
      detector_results: detectorResults,
      gaps_signaled: signaledThisRun.size,
      gaps_closed: closed,
      wishes_linked: newWishCount ?? 0,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
