// github-api.ts — GitHub REST helpers for the deploy-fixer.
//
// Edge functions can't shell out to `git`, so all repo writes go through
// the GitHub REST API (Contents API for single-file edits, Git Tree API
// for multi-file commits).
//
// Token is passed in as a parameter — never read from env here. Errors
// redact "Bearer …" before logging. Branch creation is idempotent
// (existing branch returns 422 — we treat that as "branch exists, use it").
//
// Operations we expose:
//   getMainHeadSha          → main's tip SHA
//   getLastSuccessfulSha    → most recent green deploy's commit (for rollback)
//   getFileContent          → contents API GET (content + blob SHA)
//   createBranch            → POST /git/refs
//   updateFile              → PUT /repos/.../contents/{path}
//   openPullRequest         → POST /repos/.../pulls
//   mergePullRequest        → PUT /repos/.../pulls/{n}/merge (squash)
//   findOpenPullRequest     → look up an existing PR by branch
//
// All paths are repo-relative — we hard-code owner/repo to
// SissyMaxy/becoming-protocol (same constant as deploy-health-monitor).

const REPO_OWNER = 'SissyMaxy'
const REPO_NAME = 'becoming-protocol'
const REPO_PATH = `${REPO_OWNER}/${REPO_NAME}`
const REDACT = '<redacted>'

function ghHeaders(token: string): HeadersInit {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

function logError(scope: string, status: number, body: string): void {
  console.warn(`[deploy-fixer/github] ${scope} ${status}: ${body.slice(0, 200).replace(/Bearer\s+\S+/g, `Bearer ${REDACT}`)}`)
}

// ---------- base64 codec (Deno + Node 18+ both have btoa/atob) ----------

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function base64ToUtf8(b64: string): string {
  const cleaned = b64.replace(/\s+/g, '')  // GitHub returns wrapped base64
  const bin = atob(cleaned)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// ---------- read paths ----------

export async function getMainHeadSha(token: string): Promise<string | null> {
  if (!token) return null
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/branches/main`, { headers: ghHeaders(token) })
    if (!r.ok) {
      logError('getMainHeadSha', r.status, await r.text().catch(() => ''))
      return null
    }
    const data = await r.json() as { commit?: { sha?: string } }
    return data.commit?.sha ?? null
  } catch (err) {
    console.warn(`[deploy-fixer/github] getMainHeadSha fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return null
  }
}

export interface FileContent {
  content: string       // decoded UTF-8
  sha: string           // blob SHA, required for updates
  path: string
}

export async function getFileContent(
  token: string,
  filePath: string,
  ref: string = 'main',
): Promise<FileContent | null> {
  if (!token || !filePath) return null
  // GitHub paths use forward slashes; replace backslashes if a Windows path slipped through.
  const normalized = filePath.replace(/\\/g, '/')
  const url = `https://api.github.com/repos/${REPO_PATH}/contents/${encodeURI(normalized)}?ref=${encodeURIComponent(ref)}`
  try {
    const r = await fetch(url, { headers: ghHeaders(token) })
    if (!r.ok) {
      logError(`getFileContent ${normalized}@${ref}`, r.status, await r.text().catch(() => ''))
      return null
    }
    const data = await r.json() as { content?: string; sha?: string; encoding?: string; path?: string }
    if (!data.content || !data.sha) return null
    if (data.encoding && data.encoding !== 'base64') return null
    return {
      content: base64ToUtf8(data.content),
      sha: data.sha,
      path: data.path ?? normalized,
    }
  } catch (err) {
    console.warn(`[deploy-fixer/github] getFileContent fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return null
  }
}

// List recent commits to main. Used by rollback automation to identify
// the suspected breaking commit when no green deploy is recent.
export async function listRecentMainCommits(
  token: string,
  limit: number = 10,
): Promise<Array<{ sha: string; message: string; author: string; date: string }>> {
  if (!token) return []
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/commits?sha=main&per_page=${limit}`, { headers: ghHeaders(token) })
    if (!r.ok) {
      logError('listRecentMainCommits', r.status, await r.text().catch(() => ''))
      return []
    }
    const data = await r.json() as Array<{ sha: string; commit: { message: string; author: { name: string; date: string } } }>
    return data.map(c => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
    }))
  } catch (err) {
    console.warn(`[deploy-fixer/github] listRecentMainCommits fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return []
  }
}

// ---------- write paths ----------

// Idempotent branch creation. If the branch already exists at the same
// SHA, return ok. If it exists at a different SHA, return as-is — the
// caller's update will use whatever HEAD the branch is at.
export async function createBranch(
  token: string,
  branchName: string,
  fromSha: string,
): Promise<{ ok: boolean; existed: boolean; error?: string }> {
  if (!token) return { ok: false, existed: false, error: 'no token' }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/git/refs`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
    })
    if (r.ok) return { ok: true, existed: false }
    if (r.status === 422) {
      // Reference already exists. That's fine — we'll just write to it.
      return { ok: true, existed: true }
    }
    const txt = await r.text().catch(() => '')
    logError(`createBranch ${branchName}`, r.status, txt)
    return { ok: false, existed: false, error: `${r.status}: ${txt.slice(0, 200)}` }
  } catch (err) {
    return { ok: false, existed: false, error: err instanceof Error ? err.message : String(err).slice(0, 200) }
  }
}

export interface UpdateFileResult {
  ok: boolean
  commitSha?: string
  error?: string
}

export async function updateFile(
  token: string,
  filePath: string,
  branch: string,
  newContent: string,
  oldBlobSha: string,
  commitMessage: string,
  committer: { name: string; email: string } = { name: 'deploy-fixer[bot]', email: 'deploy-fixer@becoming-protocol' },
): Promise<UpdateFileResult> {
  if (!token) return { ok: false, error: 'no token' }
  const normalized = filePath.replace(/\\/g, '/')
  const url = `https://api.github.com/repos/${REPO_PATH}/contents/${encodeURI(normalized)}`
  try {
    const r = await fetch(url, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: commitMessage,
        content: utf8ToBase64(newContent),
        sha: oldBlobSha,
        branch,
        committer,
        author: committer,
      }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      logError(`updateFile ${normalized}@${branch}`, r.status, txt)
      return { ok: false, error: `${r.status}: ${txt.slice(0, 200)}` }
    }
    const data = await r.json() as { commit?: { sha?: string } }
    return { ok: true, commitSha: data.commit?.sha }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err).slice(0, 200) }
  }
}

// ---------- pull request ----------

export interface PullRequest {
  number: number
  url: string
  state: string
  draft: boolean
  head: { sha: string; ref: string }
}

export async function findOpenPullRequest(
  token: string,
  branch: string,
): Promise<PullRequest | null> {
  if (!token) return null
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/pulls?head=${REPO_OWNER}:${encodeURIComponent(branch)}&state=open`, { headers: ghHeaders(token) })
    if (!r.ok) {
      logError('findOpenPullRequest', r.status, await r.text().catch(() => ''))
      return null
    }
    const data = await r.json() as PullRequest[]
    return data[0] ?? null
  } catch (err) {
    console.warn(`[deploy-fixer/github] findOpenPullRequest fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return null
  }
}

export async function openPullRequest(
  token: string,
  branch: string,
  title: string,
  body: string,
  draft: boolean = false,
): Promise<PullRequest | null> {
  if (!token) return null
  // First check if a PR already exists — re-runs of the same fix shouldn't
  // open duplicate PRs.
  const existing = await findOpenPullRequest(token, branch)
  if (existing) return existing
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/pulls`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ title, body, head: branch, base: 'main', draft }),
    })
    if (!r.ok) {
      logError(`openPullRequest ${branch}`, r.status, await r.text().catch(() => ''))
      return null
    }
    return await r.json() as PullRequest
  } catch (err) {
    console.warn(`[deploy-fixer/github] openPullRequest fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return null
  }
}

export async function mergePullRequest(
  token: string,
  prNumber: number,
  options: { method?: 'merge' | 'squash' | 'rebase'; commitTitle?: string } = {},
): Promise<{ ok: boolean; mergedSha?: string; error?: string }> {
  if (!token) return { ok: false, error: 'no token' }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({
        merge_method: options.method ?? 'squash',
        commit_title: options.commitTitle,
      }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      logError(`mergePullRequest #${prNumber}`, r.status, txt)
      return { ok: false, error: `${r.status}: ${txt.slice(0, 200)}` }
    }
    const data = await r.json() as { sha?: string; merged?: boolean }
    return { ok: !!data.merged, mergedSha: data.sha }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err).slice(0, 200) }
  }
}

// ---------- diff helpers ----------

export function countChangedLines(originalContent: string, newContent: string): number {
  const a = originalContent.split('\n')
  const b = newContent.split('\n')
  if (a.length !== b.length) return Math.max(a.length, b.length)
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
  return n
}

export function shortSha(sha: string): string {
  return (sha || '').slice(0, 7)
}
