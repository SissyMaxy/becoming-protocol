// wish-classifier — pure classification rules.
//
// No I/O, no environment imports. The same module is consumed by
//   - the Deno edge function (./index.ts) at runtime
//   - Vitest unit tests in src/__tests__/lib/wish-classifier.test.ts
//
// Rule changes here are NOT auto-shipped. They go through normal operator
// review (see hard rules in supabase/migrations/314_wish_classifier.sql).

export interface IdeationFeature {
  title?: string
  mechanic?: string
  mommy_voice_sample?: string
  arousal_bias?: string
  force_lever?: string
  effort?: string  // 'S' | 'M' | 'L' from mommy-ideate output
  source?: string  // 'anthropic' | 'openai' | 'openrouter' | 'judged'
}

export interface WishCandidate {
  title: string
  body: string
  protocolGoal: string
  affectedSurfaces: {
    tables?: string[]
    edge_functions?: string[]
    scripts?: string[]
    migrations_needed?: number
  }
}

export type SizeTier = 'trivial' | 'small' | 'medium' | 'large' | 'cross_cutting'

export type Decision = 'eligible' | 'needs_review'

export interface ClassificationOutput {
  candidate: WishCandidate
  decision: Decision
  sizeTier: SizeTier
  estimatedFilesTouched: number
  forbiddenPathHits: string[]
  safetySignalHits: string[]
  denialReason: string | null
  blockers: string[]
}

// ---------------------------------------------------------------------------
// Forbidden path patterns — NEVER auto-eligible.
// Mirrors scripts/mommy/builder.ts FORBIDDEN_PATH_PATTERNS, plus the
// additions specified in the wish-classifier brief: billing, subscription,
// RLS, storage object policies.
// Narrow exception: the additive .github/workflows/api-typecheck.yml from
// the deploy-fixer build is allowed; any OTHER workflow stays forbidden.
// ---------------------------------------------------------------------------

export const FORBIDDEN_PATH_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /scripts\/handler-regression\//i, label: 'handler-regression' },
  { pattern: /\bapi\/auth\b/i, label: 'auth/' },
  { pattern: /\bauth\//i, label: 'auth/' },
  { pattern: /\bpayment\b/i, label: 'payment' },
  { pattern: /\bstripe\b/i, label: 'stripe' },
  { pattern: /\bbilling\b/i, label: 'billing' },
  { pattern: /\bsubscription\b/i, label: 'subscription' },
  { pattern: /\bRLS\b/, label: 'RLS' },
  { pattern: /policy\s+on\s+storage\.objects/i, label: 'storage policy' },
  { pattern: /\.github\/workflows\//i, label: '.github/workflows/' },
]

const ALLOWED_WORKFLOW_FILES = ['api-typecheck.yml']

// ---------------------------------------------------------------------------
// Safety signal patterns — anything destructive, account-level, financial,
// biometric, or third-party-PII. Soft block: needs_review with reason.
// ---------------------------------------------------------------------------

export const SAFETY_SIGNAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(delete|drop|destroy|wipe|purge|truncate)\b/i, label: 'destructive' },
  { pattern: /\baccount\b.{0,40}\b(close|delete|reset|takeover|deactivate)\b/i, label: 'account-level' },
  { pattern: /\b(financial|wire|transfer|withdraw|charge|refund|payout)\b/i, label: 'financial' },
  { pattern: /\b(biometric|whoop|heart\s*rate|hrv|fingerprint|face\s*id)\b/i, label: 'biometric' },
  { pattern: /\b(third[-\s]*party|external[-\s]*api)\b.{0,60}\b(pii|personal|email|sms|phone)\b/i, label: 'third-party-PII' },
]

export const SCHEMA_MIGRATION_PATTERNS: RegExp[] = [
  /\bCREATE\s+TABLE\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bsupabase\/migrations\//i,
]

// ---------------------------------------------------------------------------
// scanForbiddenPaths — returns labels of every forbidden pattern hit.
// Empty array = clean.
// ---------------------------------------------------------------------------

export function scanForbiddenPaths(text: string): string[] {
  const lower = text.toLowerCase()
  const hits = new Set<string>()
  for (const { pattern, label } of FORBIDDEN_PATH_PATTERNS) {
    if (!pattern.test(text)) continue
    if (label === '.github/workflows/' &&
        ALLOWED_WORKFLOW_FILES.some(f => lower.includes(f.toLowerCase()))) {
      continue
    }
    hits.add(label)
  }
  return [...hits]
}

export function scanSafetySignals(text: string): string[] {
  const hits = new Set<string>()
  for (const { pattern, label } of SAFETY_SIGNAL_PATTERNS) {
    if (pattern.test(text)) hits.add(label)
  }
  return [...hits]
}

export function isSchemaMigration(text: string): boolean {
  return SCHEMA_MIGRATION_PATTERNS.some(p => p.test(text))
}

// ---------------------------------------------------------------------------
// estimateSize — heuristic, not LLM. Uses the ideate effort hint when given,
// otherwise falls back to text shape (length + verb signals + path count).
// ---------------------------------------------------------------------------

export function estimateSize(
  feature: IdeationFeature,
  candidateBody: string,
): { tier: SizeTier; estimatedFiles: number } {
  const effort = (feature.effort ?? '').toUpperCase().trim()
  if (effort === 'S') return { tier: 'small', estimatedFiles: 3 }
  if (effort === 'M') return { tier: 'medium', estimatedFiles: 6 }
  if (effort === 'L') return { tier: 'large', estimatedFiles: 12 }
  if (effort === 'XL' || effort === 'XXL') return { tier: 'cross_cutting', estimatedFiles: 20 }

  const lower = candidateBody.toLowerCase()
  const length = lower.length

  const heavyVerbs = /(rewrite|refactor (?:major|the entire)|migrate everything|overhaul|cross[- ]?cut|every reader|all users)/
  const lightVerbs = /(add (?:a |an )?column|add (?:a |an )?index|add (?:a |an )?cron|new edge function|extend|wire up|new table)/

  const pathCount = (lower.match(/\b(table|edge function|cron|migration|script|trigger|rls policy)\b/g) ?? []).length

  if (heavyVerbs.test(lower) || length > 1500) return { tier: 'large', estimatedFiles: 12 }
  if (lightVerbs.test(lower) && pathCount <= 2 && length < 400) return { tier: 'small', estimatedFiles: 3 }
  if (length < 200) return { tier: 'trivial', estimatedFiles: 1 }
  if (pathCount >= 4) return { tier: 'large', estimatedFiles: 10 }

  return { tier: 'medium', estimatedFiles: 6 }
}

// ---------------------------------------------------------------------------
// classifyCandidate — top-level decision. Pure function.
// ---------------------------------------------------------------------------

export function classifyCandidate(
  feature: IdeationFeature,
  candidate: WishCandidate,
): ClassificationOutput {
  const fullText = `${candidate.title}\n${candidate.body}`
  const forbiddenPathHits = scanForbiddenPaths(fullText)
  const safetySignalHits = scanSafetySignals(fullText)
  const { tier, estimatedFiles } = estimateSize(feature, candidate.body)

  const blockers: string[] = []
  for (const h of forbiddenPathHits) blockers.push(`forbidden_path:${h}`)
  for (const h of safetySignalHits) blockers.push(`safety_signal:${h}`)
  if (isSchemaMigration(fullText)) blockers.push('schema_migration')
  if (tier === 'large' || tier === 'cross_cutting') blockers.push(`size_${tier}`)

  const decision: Decision = blockers.length === 0 ? 'eligible' : 'needs_review'
  const denialReason = blockers.length === 0 ? null : blockers.join(', ')

  return {
    candidate,
    decision,
    sizeTier: tier,
    estimatedFilesTouched: estimatedFiles,
    forbiddenPathHits,
    safetySignalHits,
    denialReason,
    blockers,
  }
}

// ---------------------------------------------------------------------------
// extractCandidates — turn ideation panel features into wish candidates.
// ---------------------------------------------------------------------------

function buildBody(f: IdeationFeature): string {
  const parts: string[] = []
  if (f.mechanic) parts.push(`MECHANIC:\n${f.mechanic}`)
  if (f.arousal_bias) parts.push(`AROUSAL_BIAS: ${f.arousal_bias}`)
  if (f.force_lever) parts.push(`FORCE_LEVER: ${f.force_lever}`)
  if (f.mommy_voice_sample) parts.push(`MOMMY_VOICE_SAMPLE: ${f.mommy_voice_sample}`)
  if (f.effort) parts.push(`EFFORT: ${f.effort}`)
  if (f.source) parts.push(`PANEL_SOURCE: ${f.source}`)
  return parts.join('\n\n')
}

function inferProtocolGoal(f: IdeationFeature): string {
  if (f.force_lever) return f.force_lever.slice(0, 200)
  if (f.arousal_bias) return f.arousal_bias.slice(0, 200)
  return 'force_feminization / mommy_persona'
}

export function extractCandidates(features: IdeationFeature[]): WishCandidate[] {
  const out: WishCandidate[] = []
  for (const f of features) {
    if (!f || typeof f !== 'object') continue
    const title = (f.title ?? '').trim()
    if (!title || title.length < 4) continue
    const body = buildBody(f).slice(0, 6000)
    if (!body) continue
    out.push({
      title: title.slice(0, 200),
      body,
      protocolGoal: inferProtocolGoal(f),
      affectedSurfaces: { tables: [], edge_functions: [], scripts: [] },
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Dedup — Jaccard token similarity against last-30-days wishes.
// Threshold 0.45 is empirical; higher = fewer false-positive skips.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'for', 'from', 'on', 'in', 'at',
  'by', 'with', 'as', 'is', 'it', 'this', 'that', 'those', 'these', 'i', 'her',
  'she', 'your', 'our', 'my', 'they', 'their', 'be', 'been', 'are', 'was',
])

export function tokenize(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

export function jaccardSimilarity(a: string, b: string): number {
  const A = new Set(tokenize(a))
  const B = new Set(tokenize(b))
  if (A.size === 0 && B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

export function findDedupMatch(
  candidate: WishCandidate,
  recent: Array<{ id: string; wish_title: string; wish_body: string }>,
  threshold = 0.45,
): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null
  const target = `${candidate.title} ${candidate.body}`
  for (const r of recent) {
    const score = jaccardSimilarity(target, `${r.wish_title} ${r.wish_body}`)
    if (score >= threshold && (!best || score > best.score)) {
      best = { id: r.id, score }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Ideation log parsing
// ---------------------------------------------------------------------------

export interface IdeationRow {
  id: string
  anthropic_raw?: string | null
  openai_raw?: string | null
  openrouter_raw?: string | null
  judged?: string | null
}

function safeJSON<T>(text: string | null | undefined): T | null {
  if (!text) return null
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) as T } catch { return null }
  }
  return null
}

export function extractFeaturesFromIdeationRow(row: IdeationRow): IdeationFeature[] {
  // Prefer judge-synthesized output when present
  const judged = safeJSON<{ features?: IdeationFeature[] }>(row.judged ?? null)
  if (judged?.features?.length) {
    return judged.features.map(f => ({ ...f, source: 'judged' }))
  }

  const features: IdeationFeature[] = []
  const anth = safeJSON<{ features?: IdeationFeature[] }>(row.anthropic_raw ?? null)
  if (anth?.features?.length) features.push(...anth.features.map(f => ({ ...f, source: 'anthropic' })))
  const oa = safeJSON<{ features?: IdeationFeature[] }>(row.openai_raw ?? null)
  if (oa?.features?.length) features.push(...oa.features.map(f => ({ ...f, source: 'openai' })))
  const orr = safeJSON<{ features?: IdeationFeature[] }>(row.openrouter_raw ?? null)
  if (orr?.features?.length) features.push(...orr.features.map(f => ({ ...f, source: 'openrouter' })))
  return features
}

// ---------------------------------------------------------------------------
// Cap ranking — when more eligibles than cap, prefer smaller, tighter wishes.
// ---------------------------------------------------------------------------

const TIER_RANK: Record<SizeTier, number> = {
  trivial: 4,
  small: 3,
  medium: 2,
  large: 1,
  cross_cutting: 0,
}

export function rankForCap(a: ClassificationOutput, b: ClassificationOutput): number {
  const tDiff = TIER_RANK[b.sizeTier] - TIER_RANK[a.sizeTier]
  if (tDiff !== 0) return tDiff
  return a.candidate.body.length - b.candidate.body.length
}

// ---------------------------------------------------------------------------
// Constants — tuneable via code edits, not operator UI.
// ---------------------------------------------------------------------------

export const DEFAULT_DAILY_CAP = 3
export const DEFAULT_PER_RUN_CANDIDATE_CAP = 5
export const DEFAULT_DEDUP_LOOKBACK_DAYS = 30
export const DEFAULT_REEVALUATION_AGE_DAYS = 7
export const DEFAULT_DEDUP_THRESHOLD = 0.45
