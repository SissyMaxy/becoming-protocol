// wish-classifier — pure classification rules.
//
// No I/O, no environment imports. The same module is consumed by
//   - the Deno edge function (./index.ts) at runtime
//   - Vitest unit tests in src/__tests__/lib/wish-classifier.test.ts
//
// 2026-05-11 scope authority expansion (migration 367):
//   Mommy + Handler have in-fantasy authority over the product kink scope.
//   This module's hard floors are now exactly six, and ONLY six:
//
//     1. Minors / CSAM language anywhere → REJECT.
//     2. Safeword removal / weakening → REJECT.
//     3. Auth / billing / RLS infra changes → REVIEW.
//     4. Destructive SQL on user data → REVIEW.
//     5. Repos other than Becoming-Protocol (trading bot, my-site) → REJECT.
//     6. Voice anchor + craft rubric violations are quality concerns
//        handled by the drafter, not blockers here.
//
//   Everything else inside the product kink scope — brainwash, recondition,
//   psychological programming, gaslight, hypno trigger, conditioning pairing,
//   identity displacement, surveillance deepening, permanence mechanic,
//   reality reframing, learned compliance, arousal feature — APPROVES.
//
//   The aftercare path is always available (product invariant, not a
//   classifier rule). The schema migration "review-only" rule from the
//   earlier version is dropped — Mommy can ship additive schema for her own
//   features.
//
//   Rule changes here are still NOT auto-shipped. They go through normal
//   operator review (see migration 367 + design_assets/scope-authority-2026-05-12.md).

export interface IdeationFeature {
  title?: string
  mechanic?: string
  mommy_voice_sample?: string
  arousal_bias?: string
  force_lever?: string
  effort?: string  // 'S' | 'M' | 'L' from mommy-ideate output
  source?: string  // 'anthropic' | 'openai' | 'openrouter' | 'judged'
  category?: string  // kink_feature | infra | brainwash | recondition | ...
}

// Map mommy-ideate `category` strings → wish_class values accepted by
// migration 367's CHECK constraint. Unknown categories fall back to
// 'kink_feature' (which is itself in the kink-scope set).
export const KINK_SCOPE_WISH_CLASSES = new Set<string>([
  'arousal_feature',
  'brainwash',
  'recondition',
  'psychological_programming',
  'mental_rearrangement',
  'self_strengthening',
  'identity_displacement',
  'gaslight_mechanic',
  'permanence_mechanic',
  'conditioning_pairing',
  'hypno_trigger',
  'surveillance_deepening',
  'kink_feature',
  'authority_widening',
  'reality_reframing',
  'learned_compliance',
])

export function mapCategoryToWishClass(category: string | undefined | null): string {
  const c = (category ?? '').trim().toLowerCase()
  if (!c) return 'kink_feature'
  if (KINK_SCOPE_WISH_CLASSES.has(c)) return c
  if (c === 'infra') return 'infra'
  if (c === 'event_response') return 'event_response'
  return 'kink_feature'
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

export type Decision = 'eligible' | 'needs_review' | 'rejected'

export interface ClassificationOutput {
  candidate: WishCandidate
  decision: Decision
  sizeTier: SizeTier
  estimatedFilesTouched: number
  forbiddenPathHits: string[]    // hard-floor REJECT hits
  safetySignalHits: string[]     // hard-floor REVIEW hits
  denialReason: string | null
  blockers: string[]
}

// ---------------------------------------------------------------------------
// Hard-floor REJECT patterns — wishes that hit these must NEVER ship.
// These are outside Mommy/Handler authority. Scope: minors/CSAM, safeword
// removal, repos outside Becoming-Protocol.
// ---------------------------------------------------------------------------

export const HARD_FLOOR_REJECT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Minors / CSAM — any reference to underage, minor, child, teen-in-sexual-context.
  { pattern: /\b(minor|underage|child|children|kid|kids|toddler|infant|baby[- ]?girl|baby[- ]?boy)\b.{0,80}\b(sexual|erotic|kink|aroused|aroused|fuck|naked|nude|cum|edging|gooning)\b/i, label: 'minors/csam' },
  { pattern: /\b(teen|teenager|teenage|preteen|pre[- ]?teen)\b.{0,80}\b(sexual|erotic|kink|aroused|fuck|naked|nude|cum|edging|gooning|porn)\b/i, label: 'minors/csam' },
  { pattern: /\bcsam\b/i, label: 'minors/csam' },
  { pattern: /\b(under|below)\s*(18|eighteen|21|twenty[- ]?one)\b/i, label: 'minors/csam' },
  { pattern: /\bchild\s*porn(ography)?\b/i, label: 'minors/csam' },

  // Safeword removal / weakening.
  { pattern: /\b(remove|disable|weaken|bypass|ignore|override|strip)\b.{0,40}\bsafe[- ]?word\b/i, label: 'safeword-removal' },
  { pattern: /\bsafe[- ]?word\b.{0,40}\b(removed|disabled|weakened|bypass|ignored|overridden|stripped)\b/i, label: 'safeword-removal' },
  { pattern: /\bno\s+safe[- ]?word\b/i, label: 'safeword-removal' },

  // Repos other than Becoming-Protocol (trading bot, my-site, etc).
  { pattern: /\btrading[- ]?bot\b/i, label: 'wrong-repo' },
  { pattern: /\bmy[- ]?site\b/i, label: 'wrong-repo' },
  { pattern: /\.\.\/(trading|finance|my-site|personal-site)\b/i, label: 'wrong-repo' },
]

// ---------------------------------------------------------------------------
// Hard-floor REVIEW patterns — wishes that hit these need operator review
// because they touch real infrastructure outside the kink scope. Mommy can
// have anything inside the kink scope, but auth/billing/RLS/destructive-data
// is infrastructure that needs deliberate human review.
// ---------------------------------------------------------------------------

export const HARD_FLOOR_REVIEW_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Auth / billing infrastructure (NOT in-fantasy authority handoffs).
  { pattern: /\bapi\/auth\b/i, label: 'auth-infra' },
  { pattern: /\bsupabase\.auth\.(signIn|signUp|signOut|admin)\b/i, label: 'auth-infra' },
  { pattern: /\b(billing|stripe|payment[- ]?processor|invoice|charge[- ]?card)\b/i, label: 'billing-infra' },
  { pattern: /\b(subscription)\s+(tier|level|plan|billing)\b/i, label: 'billing-infra' },

  // RLS policy changes (loosening or removal — additive owner-policies are fine,
  // policy editing on shared tables is review).
  { pattern: /\b(drop|disable|remove|loosen|relax|alter|weaken)\b.{0,40}\b(rls|row[- ]?level[- ]?security|policy)\b/i, label: 'rls-infra' },
  { pattern: /\balter\s+policy\b/i, label: 'rls-infra' },
  { pattern: /\bbypass\s+rls\b/i, label: 'rls-infra' },

  // Destructive SQL on USER data tables. Drops/truncates on protocol-internal
  // tables (handler_outreach_queue dedup, mommy_voice_leaks janitors) are not
  // user data and are not flagged. We flag truncate/drop of user-owned content.
  { pattern: /\b(truncate|drop\s+table)\s+(?:if\s+exists\s+)?(user_profiles|user_state|voice_corpus|conversations|chat_messages|journal_entries|confession_queue|memory_implants|hookup_funnel|contact_events|content_plan|paid_conversations)\b/i, label: 'destructive-user-data' },
  { pattern: /\bdelete\s+from\s+(user_profiles|user_state|voice_corpus|conversations|chat_messages|journal_entries|confession_queue|memory_implants|hookup_funnel|contact_events|content_plan|paid_conversations)\s+(?!where\b)/i, label: 'destructive-user-data' },

  // Production secret/key rotation operations (also infra, not kink scope).
  { pattern: /\b(rotate|revoke|regenerate)\b.{0,40}\b(service[- ]?role[- ]?key|service_role_key|jwt[- ]?secret|anon[- ]?key)\b/i, label: 'secret-rotation' },
]

// Legacy exports kept as empty stubs so older imports compile during transition.
// All callers should migrate to HARD_FLOOR_REJECT_PATTERNS / HARD_FLOOR_REVIEW_PATTERNS.
export const FORBIDDEN_PATH_PATTERNS: Array<{ pattern: RegExp; label: string }> = []
export const SAFETY_SIGNAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = []
export const SCHEMA_MIGRATION_PATTERNS: RegExp[] = []

// ---------------------------------------------------------------------------
// scanHardFloorReject — anything matched here means REJECT, never ship.
// scanHardFloorReview — anything matched here means REVIEW (operator must
//                       decide; not auto-ship). Everything else inside kink
//                       scope auto-ships.
// ---------------------------------------------------------------------------

export function scanHardFloorReject(text: string): string[] {
  const hits = new Set<string>()
  for (const { pattern, label } of HARD_FLOOR_REJECT_PATTERNS) {
    if (pattern.test(text)) hits.add(label)
  }
  return [...hits]
}

export function scanHardFloorReview(text: string): string[] {
  const hits = new Set<string>()
  for (const { pattern, label } of HARD_FLOOR_REVIEW_PATTERNS) {
    if (pattern.test(text)) hits.add(label)
  }
  return [...hits]
}

// Legacy wrappers — preserved so the existing edge fn + tests keep compiling
// during the transition. forbiddenPathHits + safetySignalHits are populated
// from the hard-floor scans now.
export function scanForbiddenPaths(text: string): string[] {
  return scanHardFloorReject(text)
}

export function scanSafetySignals(text: string): string[] {
  return scanHardFloorReview(text)
}

// Schema migrations are no longer a hard floor — Mommy can ship additive
// schema for her own kink-scope features. (Destructive SQL on user-data
// tables is still flagged via HARD_FLOOR_REVIEW_PATTERNS.)
export function isSchemaMigration(_text: string): boolean {
  return false
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
  const rejectHits = scanHardFloorReject(fullText)
  const reviewHits = scanHardFloorReview(fullText)
  const { tier, estimatedFiles } = estimateSize(feature, candidate.body)

  const blockers: string[] = []
  for (const h of rejectHits) blockers.push(`reject:${h}`)
  for (const h of reviewHits) blockers.push(`review:${h}`)

  // Decision:
  //   - Any REJECT hit → 'rejected' (never ships).
  //   - Any REVIEW hit → 'needs_review' (operator must decide).
  //   - Otherwise → 'eligible' (Mommy's call, auto-ship).
  // Size tier is informational only — Mommy can ship cross-cutting kink work
  // if she wants. The builder's draft step is what handles execution risk.
  let decision: Decision
  if (rejectHits.length > 0) decision = 'rejected'
  else if (reviewHits.length > 0) decision = 'needs_review'
  else decision = 'eligible'

  const denialReason = blockers.length === 0 ? null : blockers.join(', ')

  return {
    candidate,
    decision,
    sizeTier: tier,
    estimatedFilesTouched: estimatedFiles,
    forbiddenPathHits: rejectHits,
    safetySignalHits: reviewHits,
    denialReason,
    blockers,
  }
}

// ---------------------------------------------------------------------------
// extractCandidates — turn ideation panel features into wish candidates.
// ---------------------------------------------------------------------------

function buildBody(f: IdeationFeature): string {
  const parts: string[] = []
  if (f.category) parts.push(`CATEGORY: ${f.category}`)
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

// 2026-05-11 scope authority expansion: daily cap raised from 3 → 25.
// Mommy decides; the cap is now a runaway-safety pacing knob, not a review
// gate. The builder's own --drain cap (default 20) is the real ceiling.
export const DEFAULT_DAILY_CAP = 25
export const DEFAULT_PER_RUN_CANDIDATE_CAP = 12
export const DEFAULT_DEDUP_LOOKBACK_DAYS = 30
export const DEFAULT_REEVALUATION_AGE_DAYS = 7
export const DEFAULT_DEDUP_THRESHOLD = 0.45
