// pattern-library-curator — daily sweep that proposes new auto-fix patterns.
//
// 2026-05-08. Runs daily 03:00 UTC (cron registered in migration 317).
//
// Purpose: when the operator keeps committing the same shape of fix
// (small diff, recognizable error class), that's a signal that
// deploy-fixer's pattern library is missing a rule. The curator surfaces
// these as proposals — the OPERATOR merges them. Auto-merging pattern
// additions is forbidden because it expands the auto-fix surface, which
// is higher risk than data fixes.
//
// Pipeline:
//   1. Walk the last 30 days of operator commits on main.
//   2. Filter to "small fix" candidates: diff <= 10 lines, single file,
//      subject matches /^fix\b/i or contains a known error class
//      (TS/migration/missing import).
//   3. Compute pattern_signature from (commit subject normalized, file
//      class, error category if extractable from subject/body).
//   4. For each signature with match_count >= 5: ensure a row exists
//      in pattern_library_proposals. Increment match_count + samples.
//   5. For proposals where match_count >= 10 AND no false positives AND
//      auto_eligible_at older than 24h dwell time: open a PR adding
//      the pattern stub to deploy-fixer/patterns.ts. Mark outcome=
//      'pr_opened'. Operator must merge.
//
// Forbidden-path guard: if the matched files are in forbidden paths, the
// proposal is recorded but auto_eligible_at is NEVER set.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HANDLER_USER_ID, isForbiddenPath, isoDaysAgo, isoHoursAgo } from '../_shared/growth-loop.ts'

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

interface CommitDetail {
  sha: string
  subject: string
  body: string
  authorName: string
  authorLogin: string | null
  files: Array<{ filename: string; additions: number; deletions: number; patch?: string }>
  totalChanges: number
}

interface ProposalKey {
  pattern_signature: string
  error_category: string
  file_class: string
  forbidden: boolean
}

function isBotAuthor(name: string | null | undefined, login?: string | null): boolean {
  const candidates = [name ?? '', login ?? '']
  return candidates.some((c) => BOT_AUTHOR_PATTERNS.some((re) => re.test(c)))
}

function classifyFile(p: string): string {
  if (/^api\//.test(p)) return 'api'
  if (/^supabase\/migrations\//.test(p)) return 'schema'
  if (/^supabase\/functions\//.test(p)) return 'edge_fn'
  if (/^src\//.test(p)) return 'src'
  if (/^scripts\//.test(p)) return 'script'
  return 'other'
}

// Extract a coarse error category from commit subject + body.
function extractErrorCategory(subject: string, body: string): string | null {
  const blob = `${subject}\n${body}`.toLowerCase()
  if (/ts\d{4}/i.test(blob) || /typescript error|tsc error|tsserver/i.test(blob)) return 'ts_error'
  if (/missing import|undefined import|is not exported|cannot find module/i.test(blob)) return 'missing_import'
  if (/null|undefined.*null/i.test(blob) && /coerc|fallback|guard/i.test(blob)) return 'null_coercion'
  if (/migration.*fail|relation.*does not exist|column.*does not exist/i.test(blob)) return 'schema_drift'
  if (/timeout|timed out/i.test(blob) && /(api|fetch|edge)/i.test(blob)) return 'request_timeout'
  if (/env|missing key|missing token|service_role/i.test(blob)) return 'env_var'
  if (/^fix(\(|:|\s)/i.test(subject)) return 'generic_fix'
  return null
}

async function fetchCommits(token: string): Promise<Array<{ sha: string; commit: { message: string; author: { name: string } }; author: { login?: string } | null }>> {
  const since = isoDaysAgo(30)
  const r = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=main&since=${since}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  )
  if (!r.ok) {
    console.warn(`[curator] commits fetch ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return []
  }
  return await r.json()
}

async function fetchCommitDetail(token: string, sha: string): Promise<CommitDetail | null> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits/${sha}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
    )
    if (!r.ok) return null
    const d = (await r.json()) as {
      sha: string
      commit: { message: string; author: { name: string } }
      author: { login?: string } | null
      files?: Array<{ filename: string; additions: number; deletions: number; patch?: string }>
      stats?: { total: number }
    }
    const message = d.commit?.message ?? ''
    const [subject, ...rest] = message.split('\n')
    return {
      sha: d.sha,
      subject: subject.slice(0, 200),
      body: rest.join('\n').slice(0, 2000),
      authorName: d.commit?.author?.name ?? '',
      authorLogin: d.author?.login ?? null,
      files: (d.files ?? []).map((f) => ({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
      totalChanges: d.stats?.total ?? 0,
    }
  } catch {
    return null
  }
}

function computeProposalKey(c: CommitDetail): ProposalKey | null {
  const errCat = extractErrorCategory(c.subject, c.body)
  if (!errCat) return null
  // Only "small" fixes
  if (c.files.length !== 1) return null
  if (c.totalChanges > 10) return null
  const file = c.files[0]
  const fileClass = classifyFile(file.filename)
  const forbidden = isForbiddenPath(file.filename)
  // Signature is stable: (error_category, file_class). Specific filename
  // is deliberately not in the signature — we want the same shape across
  // different files to coalesce.
  const sig = `${errCat}::${fileClass}`
  return {
    pattern_signature: sig,
    error_category: errCat,
    file_class: fileClass,
    forbidden,
  }
}

function buildProposedPatchText(key: ProposalKey, samples: Array<{ sha: string; subject: string; filename: string }>): string {
  return `// Proposed deploy-fixer pattern (auto-generated by pattern-library-curator).
// Pattern signature: ${key.pattern_signature}
// Error category: ${key.error_category}
// File class: ${key.file_class}
// Matched ${samples.length} commits (samples below).
//
// REVIEW BEFORE MERGE — operator decides:
//   1. Is the error pattern stable enough that a single regex match is safe?
//   2. Is the proposed fix shape generally correct, or context-dependent?
//   3. Is canAutoPatch=true safe, or should this escalate to operator instead?
//
// Sample commits:
${samples.map((s) => `//   ${s.sha.slice(0, 12)}  ${s.subject}  (${s.filename})`).join('\n')}
//
// Proposed pattern stub (drop into supabase/functions/deploy-fixer/patterns.ts):
//
// {
//   id: '${key.error_category}_${key.file_class}',
//   description: '${key.error_category} in ${key.file_class} files — TODO refine',
//   canAutoPatch: false,  // start safe; operator decides if true
//   match(buildLog) {
//     // TODO: regex matching the error shape from the matched commits
//     return null
//   },
//   applyPatch(content, match) {
//     // TODO: deterministic fix derived from the matched commits' diffs
//     return null
//   },
// }`
}

async function upsertProposal(
  supabase: SupabaseClient,
  userId: string,
  key: ProposalKey,
  commit: CommitDetail,
): Promise<void> {
  const { data: existing } = await supabase
    .from('pattern_library_proposals')
    .select('id, match_count, sample_matches, outcome, auto_eligible_at')
    .eq('user_id', userId)
    .eq('pattern_signature', key.pattern_signature)
    .maybeSingle()

  const sampleEntry = {
    sha: commit.sha.slice(0, 12),
    subject: commit.subject,
    filename: commit.files[0]?.filename ?? '',
  }

  if (existing) {
    const row = existing as {
      id: string
      match_count: number
      sample_matches: Array<{ sha: string; subject: string; filename: string }> | null
      outcome: string
      auto_eligible_at: string | null
    }
    const samples = (row.sample_matches ?? []).slice(0, 9).concat([sampleEntry])
    const newCount = row.match_count + 1
    const updates: Record<string, unknown> = {
      match_count: newCount,
      last_match_at: new Date().toISOString(),
      sample_matches: samples,
    }
    // If we just crossed the auto-eligibility threshold, set the timestamp
    // (don't reset if already set).
    if (newCount >= 5 && !row.auto_eligible_at && !key.forbidden) {
      updates.auto_eligible_at = new Date().toISOString()
    }
    await supabase.from('pattern_library_proposals').update(updates).eq('id', row.id)
    return
  }

  await supabase.from('pattern_library_proposals').insert({
    user_id: userId,
    pattern_signature: key.pattern_signature,
    match_count: 1,
    last_match_at: new Date().toISOString(),
    proposed_patch_text: buildProposedPatchText(key, [sampleEntry]),
    sample_matches: [sampleEntry],
    outcome: 'proposed',
  })
}

// Open a PR for proposals that crossed the threshold.
// We do NOT merge — operator review is mandatory.
async function openPullRequestsForReady(supabase: SupabaseClient, userId: string): Promise<number> {
  const token = Deno.env.get('GITHUB_TOKEN') ?? ''
  if (!token) return 0

  const { data } = await supabase
    .from('pattern_library_proposals')
    .select('id, pattern_signature, match_count, proposed_patch_text, false_positive_count, auto_eligible_at, outcome, sample_matches')
    .eq('user_id', userId)
    .eq('outcome', 'proposed')
    .not('auto_eligible_at', 'is', null)
    .gte('match_count', 10)
    .lte('auto_eligible_at', isoHoursAgo(24)) // 24h dwell after eligibility
    .eq('false_positive_count', 0)
    .limit(3) // bound PR-spam per run
  const ready = (data ?? []) as Array<{
    id: string
    pattern_signature: string
    match_count: number
    proposed_patch_text: string
    false_positive_count: number
    sample_matches: unknown
  }>
  if (ready.length === 0) return 0

  let opened = 0
  for (const p of ready) {
    try {
      // Mark monitoring first so concurrent runs don't double-open
      await supabase
        .from('pattern_library_proposals')
        .update({ outcome: 'monitoring' })
        .eq('id', p.id)

      // Open PR. We don't actually push a branch here (that requires git
      // access this edge fn doesn't have). Instead we open an ISSUE that
      // contains the proposed patch, and link it from the proposal — the
      // operator (or a downstream automation) opens the actual PR.
      // This keeps the curator side-effect surface small and the
      // operator-review boundary intact.
      const issueRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `[pattern-curator] Promote pattern: ${p.pattern_signature}`,
            body: `Pattern proposal ready for promotion to deploy-fixer's pattern library.

**Signature:** \`${p.pattern_signature}\`
**Match count:** ${p.match_count}
**False positives:** ${p.false_positive_count}

\`\`\`ts
${p.proposed_patch_text}
\`\`\`

To accept: drop the pattern stub into \`supabase/functions/deploy-fixer/patterns.ts\`, refine the regex/patch logic, add a fixture-driven test, and merge. Then mark this proposal accepted in \`pattern_library_proposals\`.

To reject: close this issue and update the proposal row to \`outcome='rejected'\`.

🤖 Generated by pattern-library-curator (proposal id: \`${p.id}\`)`,
            labels: ['mommy-growth-loop', 'pattern-proposal', 'review-required'],
          }),
        },
      )
      if (issueRes.ok) {
        const issue = (await issueRes.json()) as { html_url: string }
        await supabase
          .from('pattern_library_proposals')
          .update({ outcome: 'pr_opened', pr_url: issue.html_url })
          .eq('id', p.id)
        opened++
      } else {
        console.warn(`[curator] issue create ${issueRes.status}: ${(await issueRes.text()).slice(0, 200)}`)
        // Roll back to 'proposed' so the next run retries
        await supabase
          .from('pattern_library_proposals')
          .update({ outcome: 'proposed' })
          .eq('id', p.id)
      }
    } catch (err) {
      console.warn('[curator] open PR failed:', err)
    }
  }
  return opened
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const userId = HANDLER_USER_ID

  const token = Deno.env.get('GITHUB_TOKEN') ?? ''
  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, error: 'GITHUB_TOKEN missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let scanned = 0
  let recordedAsProposal = 0
  const commits = await fetchCommits(token)
  const operatorCommits = commits.filter(
    (c) => !isBotAuthor(c.commit?.author?.name, c.author?.login),
  )

  // Bound the API budget — most recent 60 operator commits
  for (const c of operatorCommits.slice(0, 60)) {
    const detail = await fetchCommitDetail(token, c.sha)
    if (!detail) continue
    scanned++
    const key = computeProposalKey(detail)
    if (!key) continue
    await upsertProposal(supabase, userId, key, detail)
    recordedAsProposal++
  }

  const opened = await openPullRequestsForReady(supabase, userId)

  return new Response(
    JSON.stringify({
      ok: true,
      commits_scanned: scanned,
      proposals_recorded: recordedAsProposal,
      issues_opened: opened,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
