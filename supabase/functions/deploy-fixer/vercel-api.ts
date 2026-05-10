// vercel-api.ts — thin Vercel REST helpers for the deploy-fixer.
//
// All functions take the token as a parameter (no env reads here) so the
// module is testable with a stub token and so secrets stay out of any log
// path that might capture this module's output.
//
// Endpoints used:
//   GET  /v6/deployments?projectId=&teamId=&state=ERROR    — failed deploys
//   GET  /v6/deployments?projectId=&teamId=&state=READY&target=production
//                                                          — last green prod
//   GET  /v3/deployments/{id}/events                       — build/deploy logs
//
// Rate limits: Vercel allows 100 req/min on the API token; this module is
// invoked at most every 10min and processes up to a handful of failures
// per tick, so we don't bother with a rate-limiter.

const VERCEL_PROJECT_ID = 'prj_jBaGxGUarXrQg2FvQQmkTGjp3Fki'
const VERCEL_TEAM_ID = 'team_i1DWiJaoA1itV44yE4ST9Wa3'

export interface VercelDeployment {
  uid: string
  name: string
  url: string
  state: string
  target?: string
  created: number
  meta?: {
    githubCommitSha?: string
    githubCommitMessage?: string
    githubCommitAuthorName?: string
    githubCommitRef?: string
  }
}

export interface VercelEvent {
  type: string
  created: number
  text?: string
  payload?: Record<string, unknown>
}

const REDACT = '<redacted>'

function authHeaders(token: string): HeadersInit {
  return { 'Authorization': `Bearer ${token}` }
}

function logError(scope: string, status: number, body: string): void {
  // Tokens never echoed in logs. Keep the body slice short.
  console.warn(`[deploy-fixer/vercel] ${scope} ${status}: ${body.slice(0, 200).replace(/Bearer\s+\S+/g, `Bearer ${REDACT}`)}`)
}

export async function listFailedDeployments(
  token: string,
  options: { sinceMs?: number; limit?: number } = {},
): Promise<VercelDeployment[]> {
  if (!token) return []
  const since = options.sinceMs ?? (Date.now() - 24 * 3600_000)
  const limit = options.limit ?? 30
  const url = `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&since=${since}&limit=${limit}&state=ERROR`
  try {
    const r = await fetch(url, { headers: authHeaders(token) })
    if (!r.ok) {
      logError('listFailedDeployments', r.status, await r.text().catch(() => ''))
      return []
    }
    const data = await r.json() as { deployments?: VercelDeployment[] }
    return data.deployments ?? []
  } catch (err) {
    console.warn(`[deploy-fixer/vercel] listFailedDeployments fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return []
  }
}

export async function getLastSuccessfulProdDeployment(
  token: string,
): Promise<VercelDeployment | null> {
  if (!token) return null
  const url = `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&state=READY&target=production&limit=1`
  try {
    const r = await fetch(url, { headers: authHeaders(token) })
    if (!r.ok) {
      logError('getLastSuccessfulProdDeployment', r.status, await r.text().catch(() => ''))
      return null
    }
    const data = await r.json() as { deployments?: VercelDeployment[] }
    return data.deployments?.[0] ?? null
  } catch (err) {
    console.warn(`[deploy-fixer/vercel] getLastSuccessfulProdDeployment fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return null
  }
}

export async function getDeploymentEvents(
  token: string,
  deploymentId: string,
): Promise<VercelEvent[]> {
  if (!token || !deploymentId) return []
  // /v3/deployments/{id}/events?teamId=  — Vercel quirk: events stream
  // requires teamId on team-scoped projects.
  const url = `https://api.vercel.com/v3/deployments/${deploymentId}/events?teamId=${VERCEL_TEAM_ID}`
  try {
    const r = await fetch(url, { headers: authHeaders(token) })
    if (!r.ok) {
      logError('getDeploymentEvents', r.status, await r.text().catch(() => ''))
      return []
    }
    // Events endpoint may return either an array or NDJSON; the team-scoped
    // path consistently returns a JSON array. Defensive: handle both.
    const text = await r.text()
    try {
      const parsed = JSON.parse(text) as VercelEvent[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      // NDJSON fallback
      const lines = text.split(/\r?\n/).filter(l => l.trim().startsWith('{'))
      const out: VercelEvent[] = []
      for (const l of lines) {
        try { out.push(JSON.parse(l) as VercelEvent) } catch { /* skip */ }
      }
      return out
    }
  } catch (err) {
    console.warn(`[deploy-fixer/vercel] getDeploymentEvents fetch failed: ${err instanceof Error ? err.message : String(err).slice(0, 200)}`)
    return []
  }
}

export function eventsToBuildLog(events: VercelEvent[]): string {
  // Vercel events have a text field with one log line each. Concatenate
  // in chronological order for pattern matching. Some events have no text
  // (state transitions); skip those.
  return events
    .slice()
    .sort((a, b) => (a.created || 0) - (b.created || 0))
    .map(e => e.text ?? '')
    .filter(Boolean)
    .join('\n')
}

// Wait for a specific deployment to reach a terminal state. Used to verify
// auto-merge candidates: after pushing to a feature branch, Vercel creates
// a preview deployment. If it goes READY within the timeout, the patch is
// considered green.
//
// Returns 'READY' | 'ERROR' | 'CANCELED' | 'TIMEOUT'.
export async function waitForDeploymentByCommitSha(
  token: string,
  commitSha: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<{ state: 'READY' | 'ERROR' | 'CANCELED' | 'TIMEOUT'; deployment: VercelDeployment | null }> {
  const timeoutMs = options.timeoutMs ?? 5 * 60_000
  const pollIntervalMs = options.pollIntervalMs ?? 15_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const url = `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&limit=20`
      const r = await fetch(url, { headers: authHeaders(token) })
      if (r.ok) {
        const data = await r.json() as { deployments?: VercelDeployment[] }
        const found = (data.deployments ?? []).find(d => d.meta?.githubCommitSha === commitSha)
        if (found && (found.state === 'READY' || found.state === 'ERROR' || found.state === 'CANCELED')) {
          return { state: found.state as 'READY' | 'ERROR' | 'CANCELED', deployment: found }
        }
      }
    } catch (_err) { /* keep polling on transient failures */ }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
  return { state: 'TIMEOUT', deployment: null }
}
