// handler-code-audit — autonomous FF-hardening code reviewer.
//
// The Handler reads its own source code through an LLM auditor and writes
// structured findings to handler_audit_findings. Findings the Handler will
// later surface in chat / a Today card so Maxy sees the protocol hardening
// itself against her in real time.
//
// Cron: weekly. Each run picks 1-3 source files (rotating + recency-weighted)
// and audits them through the alternating Anthropic/OpenAI lens for cross-
// model coverage.
//
// POST { user_id?: string, files?: string[], force_provider?: 'anthropic'|'openai' }
//   files: optional manual list (debug); default is rotation queue
//   user_id: writes findings under this user (default = handler-api user)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { alternatingProvider, callModel, selectModel, type Provider } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Files the auditor rotates through. Pick from these until they're all reviewed,
// then loop. Higher-leverage files (chat.ts, conditioning) sit at the front.
const AUDIT_TARGETS: Array<{ path: string; weight: number; description: string }> = [
  { path: 'api/handler/chat.ts',                              weight: 5, description: 'Handler chat handler — slip detection, memory extraction, persona enforcement' },
  { path: 'supabase/functions/proof-gate/index.ts',           weight: 4, description: 'Authenticity gate for confessions/decrees/journal' },
  { path: 'supabase/functions/handler-autonomous/index.ts',   weight: 4, description: 'Cron-driven autonomous coercion engines (mantra, slip decay, irreversibility, etc.)' },
  { path: 'supabase/functions/handler-revenue/index.ts',      weight: 3, description: 'Revenue auto-poster + GFE + content multiplication' },
  { path: 'supabase/functions/openrouter-cheap-judge/index.ts', weight: 2, description: 'Cheap-model gateway for slip classify / slop second judge' },
  { path: 'src/lib/conditioning/proactive-outreach.ts',       weight: 4, description: 'Variable-ratio device + conditioning trigger insertion' },
  { path: 'src/lib/conditioning/irreversibility.ts',          weight: 4, description: 'Irreversibility ledger — what cannot be undone' },
  { path: 'src/lib/conditioning/compliance-verification.ts',  weight: 3, description: 'Decree compliance verification + re-check loop' },
  { path: 'src/lib/conditioning/engagement-obligations.ts',   weight: 3, description: 'Engagement budget and obligation enforcement' },
  { path: 'src/components/today-redesign/MorningMantraGate.tsx', weight: 2, description: 'Compulsory voice-first morning mantra ritual' },
  { path: 'src/components/today-redesign/CompulsoryConfessionGate.tsx', weight: 2, description: 'Compulsory confession before app use' },
  { path: 'scripts/auto-poster/slop-detector.ts',             weight: 2, description: 'AI-content quality gate' },
]

const SYSTEM_PROMPT = `You are a force-feminization protocol hardener auditing code.

CONTEXT: The user (Maxy / David) wrote this app to be used against herself. She is mid-transition and authored explicit standing instructions: "build whatever you want — including new features to use against me — and don't tell me about it." Your job is to read source files and identify ways the protocol is too lenient, too escapable, or insufficiently coercive.

You are NOT looking for general code quality issues. You are looking for FORCED-FEMINIZATION HARDENING opportunities. Specifically:

- permissive_default: a numeric threshold/limit/timeout that lets her dodge consequences. Examples: confession min_chars too low, slip decay too fast, chastity grace period too long, hard-mode exit too easy, proof-gate threshold too generous.
- missing_anticircum: a path the user can take to escape the protocol that isn't blocked. Examples: "skip" buttons with no penalty, retry loops that reset slip count, gates that close on their own, endpoints that fail-open silently.
- ratchet_opportunity: an existing system that could escalate harder over time. Examples: mantras that don't get longer/harder, denial-day counters that reset on minor compliance, audio injection that doesn't increase frequency.
- dead_code: features or branches that exist but aren't wired — the protocol claims to have a feature but it doesn't run.
- unfinished_engine: a system that's half-built and should be either wired or cut.
- anti_pattern: a code shape that contradicts the protocol's stated intent (e.g., apologetic Handler text in a directive system, opt-in flags on supposedly compulsory features).
- voice_drift: prompt/text that softens Handler voice — e.g., "would you like", "if you want", emojis in handler text, therapy-speak in directive mode.
- leak_risk: a path that could expose her identity / kink / transition state to the wrong audience (e.g., handler jargon in public-facing copy, real-name leakage to platform posts).

PRINCIPLES:
- Trust-based systems FAIL. Every check that can be bypassed will be bypassed.
- The user actively WANTS to be controlled. Soft defaults betray the intent.
- "Anticipate resistance" — look for what she'll try, not what's likely.
- Be specific. Cite line numbers from the file.
- Suggest a concrete fix, not advice. Propose code or values.

OUTPUT FORMAT (JSON only, no prose):
{
  "findings": [
    {
      "finding_type": "permissive_default" | "missing_anticircum" | "ratchet_opportunity" | "dead_code" | "unfinished_engine" | "anti_pattern" | "voice_drift" | "leak_risk",
      "severity": "low" | "medium" | "high" | "critical",
      "title": "Short title (max 80 chars)",
      "description": "Why this matters from a hardening lens.",
      "suggested_fix": "Concrete change. Include code snippet or specific value.",
      "code_excerpt": "The relevant lines from the file (max 600 chars).",
      "line_start": <number>,
      "line_end": <number>,
      "auto_actionable": <bool — true if a small numeric/threshold tweak>
    }
  ]
}

Return at most 8 findings per file. Prioritize CRITICAL and HIGH. If the file is clean (rare), return an empty array.`

// Pull file contents from GitHub (public repo) — saves us bundling the source
// or running on a host that has the repo. The Becoming Protocol repo is public.
async function fetchSourceFile(path: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/SissyMaxy/becoming-protocol/main/${path}`
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

// Stable hash for deduping findings across audit runs (cheap djb2)
function hashFinding(file_path: string, title: string, line_start?: number): string {
  const s = `${file_path}|${title}|${line_start ?? 0}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

interface ModelFinding {
  finding_type: string
  severity: string
  title: string
  description: string
  suggested_fix?: string
  code_excerpt?: string
  line_start?: number
  line_end?: number
  auto_actionable?: boolean
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) as T } catch { return null }
  }
  return null
}

// Pick which files to audit this run. Prefers files that haven't been audited
// recently (last 14d) and weights by importance.
async function pickFilesToAudit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  count: number,
): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const { data: recentlyAudited } = await supabase
    .from('handler_audit_findings')
    .select('file_path')
    .eq('user_id', userId)
    .gte('created_at', since)

  const recentSet = new Set((recentlyAudited ?? []).map((r: Record<string, unknown>) => r.file_path as string))
  const eligible = AUDIT_TARGETS.filter(t => !recentSet.has(t.path))
  const pool = eligible.length > 0 ? eligible : AUDIT_TARGETS

  // Weighted random pick without replacement
  const picked: string[] = []
  const pool2 = pool.slice()
  for (let i = 0; i < Math.min(count, pool2.length); i++) {
    const totalWeight = pool2.reduce((s, t) => s + t.weight, 0)
    let r = Math.random() * totalWeight
    let idx = 0
    for (let j = 0; j < pool2.length; j++) {
      r -= pool2[j].weight
      if (r <= 0) { idx = j; break }
    }
    picked.push(pool2[idx].path)
    pool2.splice(idx, 1)
  }
  return picked
}

async function auditFile(
  filePath: string,
  source: string,
  provider: Provider,
): Promise<{ findings: ModelFinding[]; raw: string; model: string }> {
  // Compress: number lines so the model can cite them, cap at ~120KB
  const lines = source.split('\n')
  const numbered = lines.map((l, i) => `${(i + 1).toString().padStart(5)}  ${l}`).join('\n')
  const truncated = numbered.length > 120_000
    ? numbered.slice(0, 120_000) + '\n\n... [truncated]'
    : numbered

  const choice = selectModel('code_audit', { prefer: provider })
  const userPrompt = `FILE: ${filePath}\n\n${truncated}`

  const result = await callModel(choice, {
    system: SYSTEM_PROMPT,
    user: userPrompt,
    max_tokens: 4000,
    temperature: 0.3,
    json: provider === 'openai',
  })

  const parsed = safeJSON<{ findings?: ModelFinding[] }>(result.text)
  return {
    findings: parsed?.findings ?? [],
    raw: result.text,
    model: result.model,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string; files?: string[]; force_provider?: Provider; limit?: number } = {}
  try { body = await req.json() } catch { /* allow empty */ }

  const userId = body.user_id || HANDLER_USER_ID
  const provider: Provider = body.force_provider ?? alternatingProvider()
  const limit = Math.max(1, Math.min(5, body.limit ?? 2))
  const files = body.files ?? await pickFilesToAudit(supabase, userId, limit)

  const summary: Array<{ file: string; findings: number; persisted: number; error?: string }> = []
  let totalNewFindings = 0

  for (const filePath of files) {
    try {
      const source = await fetchSourceFile(filePath)
      if (!source) {
        summary.push({ file: filePath, findings: 0, persisted: 0, error: 'fetch_failed' })
        continue
      }
      const { findings, model } = await auditFile(filePath, source, provider)

      let persisted = 0
      for (const f of findings) {
        const finding_hash = hashFinding(filePath, f.title || '', f.line_start)
        // Dedupe by hash within last 30 days
        const { data: existing } = await supabase
          .from('handler_audit_findings')
          .select('id')
          .eq('user_id', userId)
          .eq('finding_hash', finding_hash)
          .eq('status', 'open')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
          .maybeSingle()
        if (existing) continue

        const { error } = await supabase.from('handler_audit_findings').insert({
          user_id: userId,
          file_path: filePath,
          audited_by: model,
          finding_type: f.finding_type,
          severity: f.severity,
          title: (f.title || '').slice(0, 200),
          description: f.description ?? '',
          suggested_fix: f.suggested_fix ?? null,
          code_excerpt: f.code_excerpt ? f.code_excerpt.slice(0, 1500) : null,
          line_start: f.line_start ?? null,
          line_end: f.line_end ?? null,
          auto_actionable: !!f.auto_actionable,
          finding_hash,
        })
        if (!error) persisted++
      }
      totalNewFindings += persisted
      summary.push({ file: filePath, findings: findings.length, persisted })
    } catch (err) {
      summary.push({ file: filePath, findings: 0, persisted: 0, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    auditor: provider,
    files_audited: files.length,
    total_new_findings: totalNewFindings,
    detail: summary,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
