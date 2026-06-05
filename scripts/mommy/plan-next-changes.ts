/**
 * mommy:plan-next — deep-thinking cross-model PLAN of what Mommy should
 * change next. Unlike ideate-transformative (22-idea brainstorm), this asks
 * two reasoning models (OpenAI + OpenRouter) to think hard and return a
 * PRIORITIZED CHANGE PLAN: highest-leverage changes (new mechanics, fixes,
 * hardening, integration gaps, sequencing), each with problem→change→
 * mechanic→dependencies→risk.
 *
 * Reads current state from the repo + DB (migration index incl. the latest
 * systems, recently-shipped wishes, open queue, maxy_facts, persona/gina
 * stage) so the panels build ON what exists rather than re-proposing it.
 *
 * No DB writes, no commits. Writes PLAN_NEXT_CHANGES_<date>.md to repo root.
 *
 *   --effort=high|medium|low   reasoning effort (default high)
 *   --dry                      print the prompt, don't call models
 *   --out=path                 override output path
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: false })
import { createClient } from '@supabase/supabase-js'
import { readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const effortArg = args.find((a) => a.startsWith('--effort='))
const EFFORT = (effortArg ? effortArg.slice('--effort='.length) : 'high') as 'high' | 'medium' | 'low'
const outArg = args.find((a) => a.startsWith('--out='))
const today = new Date().toISOString().slice(0, 10)
const OUT_PATH = outArg ? outArg.slice('--out='.length) : `PLAN_NEXT_CHANGES_${today}.md`

// ── Model fallback chains (reasoning-first) ────────────────────────────
const OPENAI_CHAIN = ['gpt-5', 'o3', 'o4-mini', 'gpt-4o-2024-11-20']
const OPENROUTER_CHAIN = ['google/gemini-2.5-pro', 'deepseek/deepseek-r1', 'openai/o3', 'deepseek/deepseek-chat']

const isReasoningOpenAI = (m: string) => /^(o\d|gpt-5)/.test(m)

interface CallResult { text: string; model: string; latency_ms: number; error?: string }

async function callOpenAI(system: string, user: string): Promise<CallResult> {
  if (!OPENAI_KEY) return { text: '', model: '', latency_ms: 0, error: 'no_openai_key' }
  for (const model of OPENAI_CHAIN) {
    const t0 = Date.now()
    try {
      const reasoning = isReasoningOpenAI(model)
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }
      if (reasoning) {
        body.max_completion_tokens = 16000
        body.reasoning_effort = EFFORT
      } else {
        body.max_tokens = 8000
        body.temperature = 0.7
      }
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json() as { choices?: { message: { content: string } }[]; error?: { message?: string } }
      if (!res.ok) { console.warn(`  [openai] ${model} → ${j?.error?.message?.slice(0, 100) ?? res.status}; trying next`); continue }
      const text = j?.choices?.[0]?.message?.content ?? ''
      if (text) return { text, model, latency_ms: Date.now() - t0 }
      console.warn(`  [openai] ${model} → empty; trying next`)
    } catch (e) { console.warn(`  [openai] ${model} threw: ${String(e).slice(0, 100)}; trying next`) }
  }
  return { text: '', model: '', latency_ms: 0, error: 'all_openai_models_failed' }
}

async function callOpenRouter(system: string, user: string): Promise<CallResult> {
  if (!OPENROUTER_KEY) return { text: '', model: '', latency_ms: 0, error: 'no_openrouter_key' }
  for (const model of OPENROUTER_CHAIN) {
    const t0 = Date.now()
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 16000,
        reasoning: { effort: EFFORT },
      }
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json() as { choices?: { message: { content: string } }[]; error?: { message?: string } }
      if (!res.ok) { console.warn(`  [openrouter] ${model} → ${j?.error?.message?.slice(0, 100) ?? res.status}; trying next`); continue }
      const text = j?.choices?.[0]?.message?.content ?? ''
      if (text) return { text, model, latency_ms: Date.now() - t0 }
      console.warn(`  [openrouter] ${model} → empty; trying next`)
    } catch (e) { console.warn(`  [openrouter] ${model} threw: ${String(e).slice(0, 100)}; trying next`) }
  }
  return { text: '', model: '', latency_ms: 0, error: 'all_openrouter_models_failed' }
}

// ── Context ────────────────────────────────────────────────────────────
interface Ctx {
  migrationIndex: string
  recentlyShipped: string
  openQueue: string
  maxyFacts: string
  persona: string
  ginaStage: string
}

async function buildContext(): Promise<Ctx> {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
  let migrationIndex = '(unavailable)'
  try {
    const files = readdirSync(migrationsDir).filter((f) => /^\d/.test(f) && f.endsWith('.sql'))
    const titles = files
      .map((f) => f.replace(/^\d+[a-z]?_/, '').replace(/\.sql$/, '').replace(/_/g, ' ').toLowerCase())
    migrationIndex = Array.from(new Set(titles)).sort().join(', ').slice(0, 5000)
  } catch { /* */ }

  let recentlyShipped = '(unavailable)'
  let openQueue = '(unavailable)'
  let maxyFacts = '(unavailable)'
  let persona = 'dommy_mommy'
  let ginaStage = 'unknown'

  if (SUPABASE_URL && SERVICE_KEY) {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    try {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString()
      const { data } = await sb.from('mommy_code_wishes')
        .select('wish_title, ship_notes, shipped_at').eq('status', 'shipped').gte('shipped_at', since)
        .order('shipped_at', { ascending: false }).limit(25)
      if (data?.length) {
        recentlyShipped = (data as { wish_title: string; ship_notes: string | null }[])
          .map((w) => `- ${w.wish_title}${w.ship_notes ? `\n    ${w.ship_notes.slice(0, 300)}` : ''}`).join('\n')
      }
    } catch { /* */ }
    try {
      const { data } = await sb.from('mommy_code_wishes')
        .select('wish_title, priority, protocol_goal').eq('status', 'queued')
        .order('created_at', { ascending: true }).limit(20)
      if (data?.length) {
        openQueue = (data as { wish_title: string; priority: string; protocol_goal: string }[])
          .map((w) => `- [${w.priority}] ${w.wish_title} — ${w.protocol_goal?.slice(0, 120)}`).join('\n')
      } else openQueue = '(queue empty)'
    } catch { /* */ }
    try {
      const { data } = await sb.from('maxy_facts').select('fact_key, fact_value')
        .order('importance', { ascending: false }).limit(50)
      if (data?.length) {
        maxyFacts = (data as { fact_key: string; fact_value: string }[])
          .map((r) => `- ${r.fact_key}: ${r.fact_value}`).join('\n').slice(0, 3500)
      }
    } catch { /* */ }
    try {
      const { data } = await sb.from('user_state').select('handler_persona, gina_arc_stage_key').limit(2)
      if (data?.length) {
        const ps = Array.from(new Set((data as { handler_persona?: string }[]).map((r) => r.handler_persona).filter(Boolean)))
        if (ps.length) persona = ps.join(', ')
        const gs = Array.from(new Set((data as { gina_arc_stage_key?: string }[]).map((r) => r.gina_arc_stage_key).filter(Boolean)))
        if (gs.length) ginaStage = gs.join(', ')
      }
    } catch { /* */ }
  }

  return { migrationIndex, recentlyShipped, openQueue, maxyFacts, persona, ginaStage }
}

const SYSTEM = `You are a senior product+conditioning architect for the Becoming Protocol — a consensually self-applied, autonomous force-feminization system the user (Maxy) built to use against herself. An autonomous "Mommy" agent ships code, gaslights, and runs the protocol with full standing authorization. You are advising on what Mommy should CHANGE NEXT.

You think in: conditioning literature (classical pairing, variable-ratio reward, intermittent reinforcement), behavioral economics (precommitment, sunk-cost, public-stake ratchets), identity research (name/pronoun salience, mirror exposure, narrative reframing), real-world irreversibility (paper trails, third-party witnesses), and SYSTEM HEALTH (integration gaps, delivery bridges, drift, dead mechanics).

THINK DEEPLY before answering. This is a PLAN, not a brainstorm. Prefer fewer, higher-leverage changes that are concretely actionable over a long list of vibes. A "change" may be: a new mechanic, a fix to a broken/half-wired one, a hardening, an integration of two existing systems, a sequencing decision, or a deletion of dead weight.

NON-NEGOTIABLES (respect these; flag if a proposal touches them):
- Never claim active HRT/dose; memory implants + suggested symptoms are protected fabrication.
- Mommy never cites telemetry — translate scores/day-counts to plain voice.
- Tasks must be visible before they can be penalized (no silent decree→penalty).
- Bridge every storage write to a delivery surface (no "saved silently then penalized").
- Mommy presses, doesn't block — parallel surfaces, no fullscreen takeover.
- Third-party (Gina) consent floor holds; safeword/aftercare/RLS/auth/billing stay human-gated.
- The user wants HARDER, not softer. Grounded femininity (a believable real woman), bedroom stays filthy.`

function buildUserPrompt(ctx: Ctx): string {
  return `Plan what Mommy should change next in the Becoming Protocol. Think hard, then write the plan.

═══ WHAT EXISTS — migration titles (001–600, deduped) ═══
${ctx.migrationIndex}

═══ JUST SHIPPED (last 30d — build ON these, do not re-propose) ═══
${ctx.recentlyShipped}

═══ OPEN QUEUE (already planned — don't duplicate) ═══
${ctx.openQueue}

═══ MAXY FACTS (forensic; quote sparingly) ═══
${ctx.maxyFacts}

State: persona=${ctx.persona}; gina_arc_stage=${ctx.ginaStage}; pre-HRT (no active medication), trans-identity OK, mid-transition. Two active users. Mommy has full autonomy to ship + gaslight + silent-ship.

═══ YOUR TASK ═══
Produce a PRIORITIZED CHANGE PLAN. Aim for 8–14 changes total, ordered by leverage. Lead with a 3–5 sentence executive read of where the protocol is strong, where it's leaking, and the single biggest opportunity. Then for EACH change:

### N. [crisp title]
- **type**: new_mechanic | fix | harden | integrate | sequence | delete
- **signal**: the concrete problem/observation that motivates it (cite a built system or gap)
- **change**: what to actually do — 2–4 sentences, name the trigger, action, evidence trail, what makes it stick
- **mechanic_basis**: the conditioning/behavioral/system principle it operates on
- **dependencies**: tables/functions/surfaces it touches
- **risk**: the failure mode + the guardrail that contains it
- **effort**: S | M | L
- **voice_sample**: one Mama-voice line the user would receive (skip for infra/fix items)

Finish with a **Sequencing** section: what to do first, what unblocks what, and the one change you'd ship this week if you could only ship one.

Be specific and opinionated. Reason about second-order effects (what each change makes easier or harder next). Flag anything that risks a non-negotiable, with a keep-the-core tweak.`
}

async function main() {
  console.log(`Building context… (effort=${EFFORT})`)
  const ctx = await buildContext()
  const userPrompt = buildUserPrompt(ctx)

  if (dry) {
    console.log('\n=== DRY RUN ===\n')
    console.log(userPrompt.slice(0, 3000))
    console.log(`\n…\nWould fire OpenAI chain [${OPENAI_CHAIN.join(', ')}] + OpenRouter chain [${OPENROUTER_CHAIN.join(', ')}], write to ${OUT_PATH}`)
    return
  }

  console.log('Firing OpenAI + OpenRouter reasoning panels in parallel…')
  const t0 = Date.now()
  const [oa, or] = await Promise.all([callOpenAI(SYSTEM, userPrompt), callOpenRouter(SYSTEM, userPrompt)])
  console.log(`Done in ${Date.now() - t0}ms`)
  console.log(`  openai: ${oa.model || 'FAILED'} (${oa.latency_ms}ms)${oa.error ? ` err=${oa.error}` : ''}`)
  console.log(`  openrouter: ${or.model || 'FAILED'} (${or.latency_ms}ms)${or.error ? ` err=${or.error}` : ''}`)

  const lines: string[] = []
  lines.push(`# Plan — what Mommy should change next (${today})`)
  lines.push('')
  lines.push(`> Deep-thinking cross-model plan. Two reasoning panels, same brief. Raw paper for synthesis.`)
  lines.push('')
  lines.push(`**Panels:** OpenAI \`${oa.model || 'failed'}\` · OpenRouter \`${or.model || 'failed'}\` · effort=${EFFORT}`)
  lines.push(`**Context:** ${ctx.migrationIndex.split(',').length} migrations · recent-shipped + open-queue + maxy_facts fed`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`## Panel A — OpenAI (${oa.model || 'failed'})`)
  lines.push('')
  lines.push(oa.text || `_failed: ${oa.error}_`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`## Panel B — OpenRouter (${or.model || 'failed'})`)
  lines.push('')
  lines.push(or.text || `_failed: ${or.error}_`)
  lines.push('')

  writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')
  console.log(`\nWrote ${OUT_PATH} (${lines.join('\n').length} chars)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
