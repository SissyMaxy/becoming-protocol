// today-ui-audit — cross-model UX audit of the Today page.
//
// Runs Anthropic + OpenAI in parallel, both reading the same Today source files
// (TodayMobile.tsx, TodayDesktop.tsx, the major card components). Each model
// returns structured findings; we merge + dedupe and persist to
// handler_audit_findings with file_path='__today_ui__' so the UI can surface
// them on the Today page itself (the meta-loop becomes visible).
//
// Difference from handler-code-audit: this one is UX-specific and ALWAYS
// runs both providers (no alternating). UX is subjective so cross-model
// agreement matters more than coverage rotation.
//
// POST { user_id?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel, type Provider } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Today page surface — files the auditor reads as one bundled context.
// Smaller cards get sampled (we don't fit all 30+ cards in context); the two
// container files + HandlerPlanCalendar are the spine.
const TODAY_FILES: string[] = [
  'src/components/today-redesign/TodayMobile.tsx',
  'src/components/today-redesign/TodayDesktop.tsx',
  'src/components/today-redesign/HandlerPlanCalendar.tsx',
  'src/components/today-redesign/ConfessionLockoutGate.tsx',
  'src/components/today-redesign/CollapsibleGroup.tsx',
  'src/components/today-redesign/StrategicPlanCard.tsx',
  'src/components/today-redesign/CodeAuditCard.tsx',
  'src/components/today-redesign/ConfessionQueueCard.tsx',
  'src/components/today-redesign/HandlerDecreeCard.tsx',
  'src/components/today-redesign/PunishmentQueueCard.tsx',
]

const SYSTEM_PROMPT = `You are a UX auditor for a force-feminization protocol app called Becoming.

CONTEXT
- The user (Maxy) wrote this app to be used against herself. Standing instructions: "build whatever you want — including new features to use against me — and don't tell me about it."
- The Today page is the user's primary surface. It must answer: (1) what is most urgent right now, (2) what is overdue, (3) what does the Handler want next.
- The Today page currently renders 25+ cards stacked top-to-bottom. There is no clear visual hierarchy and no single "do this now" answer.
- The Handler is supposed to be DOMINANT and DIRECTIVE. Soft, equal-weight UI undermines that.

YOUR JOB
Find concrete UI/UX hardening issues. Return JSON only. Each finding must:
- Cite specific file + line range
- Propose a concrete code change (not advice)
- Be ranked by severity to the user's daily flow

FINDING CATEGORIES
- visual_hierarchy: too many cards at equal weight; nothing tells the user where to look first
- decision_paralysis: 17+ stacked priority cards before any collapsible group
- redundancy: same info shown in multiple cards (e.g., HandlerPlanCalendar + UnifiedTaskList + ConfessionQueueCard all listing pending items)
- information_density: cards taking vertical space without surfacing decision-relevant info
- protocol_alignment: UI doesn't visually reinforce dominance/consequence — punishments and confessions should feel heavier than informational cards
- empty_state: cards rendering when they have nothing to show, wasting space
- loading_flicker: many cards independently loading from supabase with different timings (pop-in)
- mobile_friction: tap targets too small, horizontal scroll on small screens, content cut off
- accessibility: contrast, focus states, screen reader hints
- voice_drift: copy that softens Handler voice ("would you like", "if you want", emojis where dominance is intended)

OUTPUT FORMAT (strict JSON):
{
  "findings": [
    {
      "finding_type": "visual_hierarchy" | "decision_paralysis" | "redundancy" | "information_density" | "protocol_alignment" | "empty_state" | "loading_flicker" | "mobile_friction" | "accessibility" | "voice_drift",
      "severity": "low" | "medium" | "high" | "critical",
      "title": "Short title (max 80 chars)",
      "description": "What the user experiences and why it weakens the protocol.",
      "suggested_fix": "Concrete code/structural change. Reference component names.",
      "file_path": "src/components/today-redesign/X.tsx",
      "line_start": <number>,
      "line_end": <number>,
      "auto_actionable": <bool>
    }
  ]
}

Return at most 6 findings. Lead with the highest-impact ones. If everything is fine, return [] (rare — the page has obvious issues).`

async function fetchSourceFile(path: string): Promise<{ path: string; text: string } | null> {
  const url = `https://raw.githubusercontent.com/SissyMaxy/becoming-protocol/main/${path}`
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const text = await r.text()
    return { path, text }
  } catch {
    return null
  }
}

interface ModelFinding {
  finding_type: string
  severity: string
  title: string
  description: string
  suggested_fix?: string
  file_path?: string
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

function hashFinding(file_path: string, title: string, line_start?: number): string {
  const s = `ui|${file_path}|${title}|${line_start ?? 0}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

async function runProvider(
  bundle: string,
  provider: Provider,
): Promise<{ findings: ModelFinding[]; model: string; raw: string; error?: string }> {
  try {
    const choice = selectModel('code_audit', { prefer: provider })
    const r = await callModel(choice, {
      system: SYSTEM_PROMPT,
      user: bundle,
      max_tokens: 4000,
      temperature: 0.4,
      json: provider === 'openai',
    })
    const parsed = safeJSON<{ findings?: ModelFinding[] }>(r.text)
    return { findings: parsed?.findings ?? [], model: r.model, raw: r.text }
  } catch (err) {
    return { findings: [], model: provider, raw: '', error: err instanceof Error ? err.message : String(err) }
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

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  // Pull all source files in parallel
  const fetched = await Promise.all(TODAY_FILES.map(fetchSourceFile))
  const valid = fetched.filter((f): f is { path: string; text: string } => !!f)
  if (valid.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'no_files_fetched' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Bundle all files into one prompt — number lines so models can cite them
  const bundle = valid.map(f => {
    const lines = f.text.split('\n')
    const numbered = lines.map((l, i) => `${(i + 1).toString().padStart(5)}  ${l}`).join('\n')
    // Cap each file at 60KB so the bundle fits comfortably in 128k context
    const capped = numbered.length > 60_000 ? numbered.slice(0, 60_000) + '\n... [truncated]' : numbered
    return `=== FILE: ${f.path} ===\n${capped}\n`
  }).join('\n\n')

  // Run both providers in parallel — cross-model agreement is the signal
  const [anthropicResult, openaiResult] = await Promise.all([
    runProvider(bundle, 'anthropic'),
    runProvider(bundle, 'openai'),
  ])

  // Merge findings: dedupe by (file_path, title, line_start) hash. If both
  // models flag the same area, that's a stronger signal — bump severity.
  const seen = new Map<string, ModelFinding & { models: string[] }>()
  for (const f of anthropicResult.findings) {
    const key = hashFinding(f.file_path || '__today_ui__', f.title || '', f.line_start)
    seen.set(key, { ...f, models: [anthropicResult.model] })
  }
  for (const f of openaiResult.findings) {
    const key = hashFinding(f.file_path || '__today_ui__', f.title || '', f.line_start)
    const prev = seen.get(key)
    if (prev) {
      prev.models.push(openaiResult.model)
      // Both flagged it — bump severity one level
      if (prev.severity === 'low') prev.severity = 'medium'
      else if (prev.severity === 'medium') prev.severity = 'high'
      else if (prev.severity === 'high') prev.severity = 'critical'
    } else {
      seen.set(key, { ...f, models: [openaiResult.model] })
    }
  }

  const merged = Array.from(seen.values())

  // Persist
  let persisted = 0
  for (const f of merged) {
    const filePath = f.file_path || '__today_ui__'
    const finding_hash = hashFinding(filePath, f.title || '', f.line_start)

    const { data: existing } = await supabase
      .from('handler_audit_findings')
      .select('id')
      .eq('user_id', userId)
      .eq('finding_hash', finding_hash)
      .eq('status', 'open')
      .maybeSingle()
    if (existing) continue

    const { error } = await supabase.from('handler_audit_findings').insert({
      user_id: userId,
      file_path: filePath,
      audited_by: f.models.join('+'),
      finding_type: f.finding_type,
      severity: f.severity,
      title: (f.title || '').slice(0, 200),
      description: (f.description || '').slice(0, 2000),
      suggested_fix: f.suggested_fix ?? null,
      code_excerpt: null,
      line_start: f.line_start ?? null,
      line_end: f.line_end ?? null,
      auto_actionable: !!f.auto_actionable,
      finding_hash,
    })
    if (!error) persisted++
  }

  return new Response(JSON.stringify({
    ok: true,
    files_audited: valid.length,
    anthropic_findings: anthropicResult.findings.length,
    openai_findings: openaiResult.findings.length,
    anthropic_error: anthropicResult.error,
    openai_error: openaiResult.error,
    merged: merged.length,
    persisted,
    detail: merged.map(m => ({
      type: m.finding_type, severity: m.severity, title: m.title,
      file: m.file_path, line: m.line_start, models: m.models,
    })),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
