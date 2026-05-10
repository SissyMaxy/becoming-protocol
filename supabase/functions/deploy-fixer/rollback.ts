// rollback.ts — auto-rollback automation for stuck deploys.
//
// Trigger: ≥3 unresolved ERROR rows in deploy_health_log on consecutive
// vercel deploys, AND no successful deploy-fixer auto-merge among them.
// (If a fix-merge succeeded between failures, the streak resets — we
// don't roll back through our own successful patches.)
//
// Action: open a *draft* PR that resets the tree to the last green prod
// deploy's tree. The single-commit shape gives the operator a clean diff
// to review before merging. This module never auto-merges rollbacks.
//
// Design choice — tree-reset vs git-revert:
//   We could `git revert` each commit since last green. That preserves
//   commit history but produces a multi-commit branch that's harder to
//   review. Instead we create ONE commit on a fresh branch whose tree
//   matches last_green_sha. The PR diff is exactly "everything since
//   last green, undone in one commit." Cleaner for a forensic rollback.
//
// Escalation: every rollback PR also writes to autonomous_escalation_log
// at severity=critical so the morning brief surfaces it.

import {
  getMainHeadSha,
  listRecentMainCommits,
  createBranch,
  openPullRequest,
  shortSha,
} from './github-api.ts'
import { getLastSuccessfulProdDeployment } from './vercel-api.ts'

const REPO_OWNER = 'SissyMaxy'
const REPO_NAME = 'becoming-protocol'
const REPO_PATH = `${REPO_OWNER}/${REPO_NAME}`
const REDACT = '<redacted>'

const ROLLBACK_THRESHOLD = 3   // ≥N unresolved ERROR rows trigger rollback

function ghHeaders(token: string): HeadersInit {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

function logError(scope: string, status: number, body: string): void {
  console.warn(`[deploy-fixer/rollback] ${scope} ${status}: ${body.slice(0, 200).replace(/Bearer\s+\S+/g, `Bearer ${REDACT}`)}`)
}

// ---------- Git Tree API operations ----------

interface CommitObject {
  sha: string
  tree: { sha: string }
  parents: Array<{ sha: string }>
  message: string
}

async function getCommit(token: string, sha: string): Promise<CommitObject | null> {
  if (!token || !sha) return null
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/git/commits/${sha}`, { headers: ghHeaders(token) })
    if (!r.ok) {
      logError(`getCommit ${sha}`, r.status, await r.text().catch(() => ''))
      return null
    }
    return await r.json() as CommitObject
  } catch (err) {
    console.warn(`[deploy-fixer/rollback] getCommit fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return null
  }
}

async function createCommitFromTree(
  token: string,
  treeSha: string,
  parentSha: string,
  message: string,
): Promise<string | null> {
  if (!token) return null
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/git/commits`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha],
        author: { name: 'deploy-fixer[bot]', email: 'deploy-fixer@becoming-protocol' },
        committer: { name: 'deploy-fixer[bot]', email: 'deploy-fixer@becoming-protocol' },
      }),
    })
    if (!r.ok) {
      logError('createCommitFromTree', r.status, await r.text().catch(() => ''))
      return null
    }
    const data = await r.json() as { sha?: string }
    return data.sha ?? null
  } catch (err) {
    console.warn(`[deploy-fixer/rollback] createCommitFromTree fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return null
  }
}

async function fastForwardBranchTo(
  token: string,
  branch: string,
  newSha: string,
): Promise<boolean> {
  if (!token) return false
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      headers: ghHeaders(token),
      body: JSON.stringify({ sha: newSha, force: true }),
    })
    if (!r.ok) {
      logError(`fastForwardBranchTo ${branch}`, r.status, await r.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.warn(`[deploy-fixer/rollback] fastForwardBranchTo fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return false
  }
}

// ---------- decision: should we roll back? ----------

export interface RollbackDecision {
  shouldRollback: boolean
  reason: string
  consecutiveFailures: number
  lastGreenSha?: string
  lastGreenDeployedAt?: string
  suspectedBreakingShas?: string[]
}

interface HealthLogSnapshot {
  id: string
  source: string
  status: string
  detected_at: string
  raw: Record<string, unknown> | null
}

interface FixerAttemptSnapshot {
  outcome: string
  health_log_id: string | null
  pattern_matched: string | null
}

export function decideRollback(opts: {
  recentVercelHealthRows: HealthLogSnapshot[]   // ordered newest-first; only source='vercel'
  recentFixerAttempts: FixerAttemptSnapshot[]   // last ~24h of attempts
  lastGreenSha: string | null
  recentMainCommits: Array<{ sha: string; date: string }>
}): RollbackDecision {
  const { recentVercelHealthRows, recentFixerAttempts, lastGreenSha, recentMainCommits } = opts

  // Count unresolved (status='open' or 'acknowledged') vercel error rows.
  const unresolved = recentVercelHealthRows.filter(r =>
    r.source === 'vercel' && (r.status === 'open' || r.status === 'acknowledged')
  )
  if (unresolved.length < ROLLBACK_THRESHOLD) {
    return { shouldRollback: false, reason: `only ${unresolved.length} unresolved vercel failures (need ≥${ROLLBACK_THRESHOLD})`, consecutiveFailures: unresolved.length }
  }

  // Streak-reset rule: if any of the unresolved rows already had a
  // successful deploy-fixer auto_merged outcome, treat the streak as
  // broken. We don't roll back THROUGH our own successful patches.
  const autoMergedHealthIds = new Set(
    recentFixerAttempts
      .filter(a => a.outcome === 'auto_merged' && a.health_log_id)
      .map(a => a.health_log_id as string),
  )
  const stillStuck = unresolved.filter(r => !autoMergedHealthIds.has(r.id))
  if (stillStuck.length < ROLLBACK_THRESHOLD) {
    return { shouldRollback: false, reason: `${unresolved.length - stillStuck.length} of ${unresolved.length} were auto-merged; streak below threshold`, consecutiveFailures: stillStuck.length }
  }

  if (!lastGreenSha) {
    return { shouldRollback: false, reason: 'no last-green prod deploy known — cannot identify rollback target', consecutiveFailures: stillStuck.length }
  }

  // Suspected breaking commits = main commits AFTER last green sha.
  // recentMainCommits is newest-first — find the index of last green; the
  // commits before that index (newer) are suspects.
  const greenIdx = recentMainCommits.findIndex(c => c.sha === lastGreenSha || c.sha.startsWith(lastGreenSha))
  const suspectedBreakingShas = greenIdx >= 0
    ? recentMainCommits.slice(0, greenIdx).map(c => c.sha)
    : recentMainCommits.slice(0, Math.min(5, recentMainCommits.length)).map(c => c.sha)

  return {
    shouldRollback: true,
    reason: `${stillStuck.length} unresolved vercel failures since last green (${shortSha(lastGreenSha)})`,
    consecutiveFailures: stillStuck.length,
    lastGreenSha,
    suspectedBreakingShas,
  }
}

// ---------- rollback PR creation ----------

export interface RollbackOutcome {
  ok: boolean
  branch?: string
  prNumber?: number
  rollbackCommitSha?: string
  error?: string
  decision: RollbackDecision
}

export async function performRollback(
  githubToken: string,
  decision: RollbackDecision,
): Promise<RollbackOutcome> {
  if (!decision.shouldRollback || !decision.lastGreenSha) {
    return { ok: false, error: 'decideRollback said no', decision }
  }
  if (!githubToken) return { ok: false, error: 'GITHUB_TOKEN missing', decision }

  const mainSha = await getMainHeadSha(githubToken)
  if (!mainSha) return { ok: false, error: 'getMainHeadSha returned null', decision }

  // Get the tree of the last-green commit. The rollback commit will reuse
  // that tree, parented onto current main HEAD — so the diff is "undo
  // everything since last green, single commit."
  const greenCommit = await getCommit(githubToken, decision.lastGreenSha)
  if (!greenCommit) return { ok: false, error: 'getCommit(lastGreenSha) returned null', decision }

  const branchName = `mommy/auto-rollback-${shortSha(decision.lastGreenSha)}`
  const branchResult = await createBranch(githubToken, branchName, mainSha)
  if (!branchResult.ok) return { ok: false, error: `createBranch: ${branchResult.error}`, decision }

  const message = [
    `auto-rollback: deploy stuck for ${decision.consecutiveFailures} consecutive failures`,
    ``,
    `Restores tree to ${shortSha(decision.lastGreenSha)} (last successful prod deploy).`,
    ``,
    `Suspected breaking commits since then:`,
    ...(decision.suspectedBreakingShas ?? []).slice(0, 8).map(sha => `  - ${shortSha(sha)}`),
    ``,
    `Triggered by deploy-fixer rollback automation. DRAFT PR — operator review required.`,
  ].join('\n')

  const rollbackCommitSha = await createCommitFromTree(githubToken, greenCommit.tree.sha, mainSha, message)
  if (!rollbackCommitSha) return { ok: false, error: 'createCommitFromTree returned null', decision }

  const ff = await fastForwardBranchTo(githubToken, branchName, rollbackCommitSha)
  if (!ff) return { ok: false, error: 'fastForwardBranchTo failed', decision, branch: branchName, rollbackCommitSha }

  const prBody = [
    `**Auto-rollback triggered by the deploy-fixer.**`,
    ``,
    `Last successful prod deploy: \`${shortSha(decision.lastGreenSha)}\``,
    `Consecutive vercel failures since: **${decision.consecutiveFailures}**`,
    `Reason: ${decision.reason}`,
    ``,
    `**Suspected breaking commits:**`,
    ...(decision.suspectedBreakingShas ?? []).slice(0, 10).map(sha => `- \`${shortSha(sha)}\``),
    ``,
    `This PR resets the tree to the last green commit in a single rollback commit.`,
    `**It is a draft.** Review the diff, decide what to keep, and either merge or close.`,
    ``,
    `<sub>Auto-merge is disabled for rollback PRs by design — too much can change in a single rollback to ship without human review.</sub>`,
  ].join('\n')

  const pr = await openPullRequest(
    githubToken,
    branchName,
    `auto-rollback: deploy stuck for ${decision.consecutiveFailures} consecutive failures`,
    prBody,
    /*draft=*/true,
  )

  return {
    ok: !!pr,
    branch: branchName,
    prNumber: pr?.number,
    rollbackCommitSha,
    decision,
  }
}

// Convenience: full pipeline. Reads the world via the supabase client +
// API tokens, runs the decision, and (if positive) opens the PR.
export async function maybeRollback(args: {
  // Pull recent vercel health rows from the caller — they already have a
  // supabase client.
  recentVercelHealthRows: HealthLogSnapshot[]
  recentFixerAttempts: FixerAttemptSnapshot[]
  vercelToken: string
  githubToken: string
}): Promise<RollbackOutcome | null> {
  const lastGreen = await getLastSuccessfulProdDeployment(args.vercelToken)
  const lastGreenSha = lastGreen?.meta?.githubCommitSha ?? null
  const recentCommits = await listRecentMainCommits(args.githubToken, 30)
  const decision = decideRollback({
    recentVercelHealthRows: args.recentVercelHealthRows,
    recentFixerAttempts: args.recentFixerAttempts,
    lastGreenSha,
    recentMainCommits: recentCommits,
  })
  if (!decision.shouldRollback) return { ok: false, decision }
  return performRollback(args.githubToken, decision)
}
