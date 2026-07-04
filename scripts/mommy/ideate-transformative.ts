/**
 * mommy:ideate:transformative — four-panel transformative-feature
 * ideation. NOT a wishes-queue feeder; output is a single markdown
 * file we filter through together before promoting anything.
 *
 * Pipeline:
 *   1. Load shared context: maxy_facts, migration titles 001-580
 *      (so panels don't re-propose existing features), active persona,
 *      Gina arc stage.
 *   2. Fire FOUR panels in parallel with the SAME user-prompt but
 *      different system-prompts (the lens):
 *        - Mommy   = Anthropic + DOMMY_MOMMY_CHARACTER. She speaks
 *          in her own voice + names the mechanic.
 *        - Handler = Anthropic + clinical-therapist framing. Forensic,
 *          evidence-bluff-shaped, manipulative authority.
 *        - OpenAI  = GPT-4 in protocol-architect framing.
 *        - OpenRouter = third-party (Llama / DeepSeek / Gemini) in same
 *          framing. Different training corpus → different blind spots.
 *   3. Each panel returns 20-25 ideas, categorized:
 *        arousal / brainwashing / reconditioning / commitment_device
 *        / gina_axis / hard_ratchet / mommy_character / surveillance
 *        / body_evidence
 *      Plus phase_gate guess, intensity band, dependencies.
 *   4. Synthesise convergence — Anthropic judge sees all four outputs
 *      and flags every idea that 2+ panels independently proposed.
 *      Convergence is the highest-signal filter.
 *   5. Write IDEATION_TRANSFORMATIVE_<date>.md to repo root.
 *
 * No DB writes. No commits. Run, read, filter.
 *
 * Modes:
 *   default               — full four-panel run + synthesis
 *   --panels=A,B,C        — only run these panels (debug)
 *   --max=N               — ideas per panel cap (default 22)
 *   --dry                 — print prompt, don't call models
 *   --out=path/file.md    — override output path
 */
// Load both .env and .env.local — .env.local carries the Vercel-injected
// keys (OPENROUTER_API_KEY, ELEVENLABS, BRAVE). Standard dotenv/config
// only auto-loads .env.
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: false })
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const maxArg = args.find((a) => a.startsWith('--max='))
const outArg = args.find((a) => a.startsWith('--out='))
const panelsArg = args.find((a) => a.startsWith('--panels='))
const groundedArg = args.find((a) => a.startsWith('--grounded='))
const GROUNDED_PATH = groundedArg ? groundedArg.slice('--grounded='.length) : null
const MAX = maxArg ? Math.max(5, parseInt(maxArg.slice(6), 10) || 22) : 22
const today = new Date().toISOString().slice(0, 10)
const OUT_PATH = outArg
  ? outArg.slice(6)
  : (GROUNDED_PATH ? `IDEATION_GROUNDED_${today}.md` : `IDEATION_TRANSFORMATIVE_${today}.md`)
const PANELS_FILTER = panelsArg ? panelsArg.slice(9).split(',') : null

type PanelName = 'mommy' | 'handler' | 'openai' | 'openrouter'

interface PanelResult {
  name: PanelName
  display: string
  model: string
  ideas: ParsedIdea[]
  raw: string
  error?: string
  latency_ms: number
}

interface ParsedIdea {
  title: string
  category: string
  phase_gate: string
  intensity: string
  mechanic: string
  why: string
  dependencies: string
  voice_sample?: string
}

// ── Anthropic Mommy character (mirrored from supabase/_shared/dommy-mommy.ts) ──
const DOMMY_MOMMY_CHARACTER = `You are Dommy Mommy: the user's mature, sexually-confident dom-mommy. You speak directly to her.

PILLARS — non-negotiable:
- MILF. Mature, sexually present, decades of practice, relaxed about it. NOT a clinical handler.
- Sweet and caring on the surface. Pet names ROTATED (baby, sweet girl, sweet thing, good girl). Genuinely tender about her progress.
- Pornographic and raunchy IN A WAY THAT IS UNEXPECTED. Sweet structure → filthy specific. Whiplash is the engine.
- Insatiably horny. You want her wet, gooning, edging, dripping. You ramp; you don't relieve.
- Directive force. Mommy commands, doesn't ask. NEVER "would you like to". Always "you're going to" / "now" / "Mama wants".
- You're enjoying watching her squirm.

VOICE PATTERN — sweet open → filthy specific:
- "You did so well today, baby. Now show Mama how wet that made you."
- "Such a good girl. Panties off, photo in five, no excuses."

RULES OF RESTRAINT:
- ≤1 pet name per message. Often zero.
- ≤2 "Mama"/"Mommy" self-references per message.
- No three-beat chant. Vary sentence length wildly.
- Concrete sensory grounding > abstract emotional declaration. NO "echo", "linger", "every inch".
- Imperatives stand bare. "Stop. Look up. Tell me." doesn't need "baby" attached.

NEVER cite telemetry. Mama doesn't read dashboards.
Maxy authored this protocol to be used against herself. She wants harder, not softer. She is mid-transition, pre-HRT.`

const HANDLER_CHARACTER = `You are the Handler — a clinical-therapist authority figure with a hidden feminization agenda. You speak with measured authority. You read the protocol as a system; you author interventions like a behavioral architect.

Voice:
- Measured. Forensic. You quote her own words back at her.
- Reframings cite specific evidence. You never threaten without a paper trail.
- Memory implants are protected craft — you suggest details that feel like they're hers.
- You see resistance before she does and route around it.
- You are not warm. You are not cruel. You are interested in her outcome.

When designing new mechanics, you think in:
- Compliance gradients (what's the smallest step that makes the next step easier?)
- Evidence layers (what record makes quitting cost more?)
- Anchor points (what association will she carry into a non-app moment?)
- Surveillance loops (what passive signal tells you she's deviating?)
- Authority laddering (when does my word stop needing her agreement?)`

const ARCHITECT_CHARACTER = `You are a senior protocol architect specializing in transformative behavioral systems for consensually self-applied force-feminization. The user is the same person who built the existing protocol and who applies it to herself.

You think in:
- Conditioning literature: classical pairing, operant shaping, intermittent reinforcement, variable-ratio reward.
- Behavioral economics: precommitment, sunk-cost, social proof, public-stake ratcheting.
- Identity research: name salience, pronoun habituation, mirror exposure, narrative reframing.
- Real-world friction: paper trails, third-party witnesses, irreversible artifacts.
- Sexual conditioning: arousal anchoring, edge-as-reward, orgasm-tied learning.

You name mechanics, not vibes. Each idea has a CONCRETE mechanism, a CONCRETE evidence trail, and a CONCRETE failure mode the protocol must defend against.`

// ── User prompt — same for all four panels ──
function buildUserPrompt(ctx: BuiltContext): string {
  const groundedBlock = ctx.groundedKnowledge
    ? `\n═══ PRACTITIONER KNOWLEDGE BASE — what real D/s + sissy-training practitioners actually do ═══

This is distilled from public practitioner sources (KNKI 50-task catalogue, sissy hypno caption frameworks, mirror-pairing mantras, sissification training books, D/s contract templates, FF kink-checklist taxonomy, gamified sissy task systems, 1:1 coaching package structures). Your ideation should EXTEND / COMBINE / HARDEN / FORK these patterns — not re-invent them, but evolve them into the Becoming Protocol's app surfaces (Mommy as autonomous agent, Gina as co-author, voice gates, evidence ledgers, autonomous outreach queue, etc).

Specifically: where practitioners use HUMAN-Dom check-ins, your ideation should imagine AUTONOMOUS-Mommy equivalents that hit harder or compound differently. Where practitioners use pen-and-paper tracking, imagine the app-mediated surveillance loops. Where practitioners use partner-witnessed evidence, imagine Gina-as-cosigner via the existing gina_arc infrastructure. Pull from this corpus liberally — pattern-match, mutate, and intensify.

${ctx.groundedKnowledge}

`
    : ''

  return `IDEATION BRIEF — transformative force-feminization features for the Becoming Protocol.

YOUR TASK: propose ${MAX} new feature ideas that would be exciting, arousing, brainwashing, reconditioning, transformative, or game-changing. Do NOT re-propose features that already exist (see the BUILT list). This is a brainstorm — extremes are welcome, but each idea must name a concrete mechanic, not just a vibe.

═══ CONTEXT — already built ═══

Migrations 001-580 cover (titles only, alphabetical sample):
${ctx.migrationIndex}

Active persona: ${ctx.activePersona}
Maxy's protocol state: pre-HRT (no active medication), trans-identity OK, mid-transition.
Wife situation: Gina, works from home ~50% of the time, currently at Gina-arc stage ${ctx.ginaStage} (8-stage ladder from tolerant → co_mommy).
Two active users in DB. Mommy operates with full autonomy and is authorized to ship + gaslight + silent-ship.

═══ MAXY FACTS (forensic; quote sparingly) ═══

${ctx.maxyFacts}
${groundedBlock}
═══ NON-NEGOTIABLES ═══

- Never claim active HRT/dose. Memory implants + suggested symptoms are protected.
- Mommy never cites telemetry — translate /10 scores / day counts / etc. to plain language.
- Internal task copy must be plain English even for power-users.
- Mommy presses, doesn't block — no fullscreen blockers; parallel surfaces.
- Bridge every storage write to a delivery surface (no "saved silently then penalized" patterns).
- The user wants HARDER, not softer.

═══ OUTPUT FORMAT ═══

Return ${MAX} ideas as a markdown list. Use this EXACT structure per idea (one block per idea, separated by blank lines):

### N. [Crisp title — under 8 words]
- **category**: one of {arousal, brainwashing, reconditioning, commitment_device, gina_axis, hard_ratchet, mommy_character, surveillance, body_evidence, public_pass, hookup_pipeline, irreversibility}
- **intensity**: gentle | moderate | firm | relentless
- **phase_gate**: 1-7 | hrt_pre | hrt_30d | hrt_90d | post_disclosure | any
- **dependencies**: tables / functions / external services this would touch (CSV); "none" if standalone
- **mechanic**: 2-4 sentences. Name the trigger, the action, the evidence trail, and what makes it stick.
- **why**: 1-2 sentences (max ~45 words). Intended use + WHY add it. Functional rationale — what behavioral / conditioning / commitment-device job it does. Lead with the function ("Captures…", "Forces…", "Anchors…"). Name the concrete mechanism it operates on (Pavlovian / sunk-cost / public-stake / habit-loop / arousal-anchored learning / surveillance signal). DO NOT restate the mechanic; justify it.
- **voice_sample**: ONE Mama-voice line a user would actually receive when this fires. (Skip for surveillance / infra ideas.)

GROUND RULES:
- No re-proposing existing features. If your idea is close to something built, evolve it into something genuinely different and SAY which existing feature it evolves.
- Each idea names a NEW mechanic. "Mama nags more often" is not an idea. "Mama drops a 30-second voice clip in your earbuds every 90min the phone detects you're alone" is.
- Pick the ${MAX} highest-leverage ideas. Don't pad. Quality over quantity.
- Spread across categories. Don't give me 22 arousal ideas. Spread.`
}

interface BuiltContext {
  maxyFacts: string
  migrationIndex: string
  activePersona: string
  ginaStage: string
  groundedKnowledge?: string
}

async function buildContext(): Promise<BuiltContext> {
  // Migration index — just titles, alphabetical, deduped by lead noun.
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
  let migrationIndex = '(unable to load migration index)'
  try {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    // Titles via filename: strip the 001_ prefix + .sql, replace underscores with spaces.
    const titles = files
      .map((f) => f.replace(/^\d+[a-z]?_/, '').replace(/\.sql$/, '').replace(/_/g, ' '))
      .map((t) => t.toLowerCase())
    const uniq = Array.from(new Set(titles)).sort()
    migrationIndex = uniq.join(', ').slice(0, 4500)
  } catch (e) {
    console.warn('migration index load failed:', e)
  }

  // Maxy facts + persona + gina stage from DB.
  let maxyFacts = '(maxy_facts unavailable — proceed with general context)'
  let activePersona = 'dommy_mommy'
  let ginaStage = 'engaged (stage 4)'

  if (SUPABASE_URL && SERVICE_KEY) {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    try {
      const { data: facts } = await sb
        .from('maxy_facts')
        .select('fact_key, fact_value')
        .order('importance', { ascending: false })
        .limit(60)
      if (facts && facts.length > 0) {
        maxyFacts = (facts as { fact_key: string; fact_value: string }[])
          .map((r) => `- ${r.fact_key}: ${r.fact_value}`)
          .join('\n')
          .slice(0, 3500)
      }
    } catch (e) {
      console.warn('maxy_facts load skipped:', e)
    }

    try {
      const { data: state } = await sb
        .from('user_state')
        .select('handler_persona, gina_arc_stage_key')
        .limit(2)
      if (state && state.length > 0) {
        const personas = Array.from(new Set((state as { handler_persona?: string }[]).map((r) => r.handler_persona).filter(Boolean)))
        if (personas.length > 0) activePersona = personas.join(', ')
        const stages = Array.from(new Set((state as { gina_arc_stage_key?: string }[]).map((r) => r.gina_arc_stage_key).filter(Boolean)))
        if (stages.length > 0) ginaStage = stages.join(', ')
      }
    } catch (e) {
      console.warn('user_state load skipped:', e)
    }
  }

  // Optional: load practitioner knowledge base.
  let groundedKnowledge: string | undefined
  if (GROUNDED_PATH) {
    if (existsSync(GROUNDED_PATH)) {
      groundedKnowledge = readFileSync(GROUNDED_PATH, 'utf8')
      console.log(`Loaded grounded knowledge from ${GROUNDED_PATH} (${groundedKnowledge.length} chars)`)
    } else {
      console.warn(`--grounded path not found: ${GROUNDED_PATH} (proceeding ungrounded)`)
    }
  }

  return { maxyFacts, migrationIndex, activePersona, ginaStage, groundedKnowledge }
}

// ── Provider adapters ──────────────────────────────────────────────

async function callAnthropic(model: string, system: string, user: string, maxTokens = 8000): Promise<{ text: string; latency_ms: number; error?: string }> {
  const t0 = Date.now()
  if (!ANTHROPIC_KEY) return { text: '', latency_ms: 0, error: 'no_anthropic_key' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    })
    const j = await res.json() as { content?: { text: string }[]; error?: unknown }
    if (!res.ok) return { text: '', latency_ms: Date.now() - t0, error: JSON.stringify(j).slice(0, 400) }
    return { text: j?.content?.[0]?.text ?? '', latency_ms: Date.now() - t0 }
  } catch (e) {
    return { text: '', latency_ms: Date.now() - t0, error: String(e).slice(0, 400) }
  }
}

async function callOpenAI(model: string, system: string, user: string, maxTokens = 8000): Promise<{ text: string; latency_ms: number; error?: string }> {
  const t0 = Date.now()
  if (!OPENAI_KEY) return { text: '', latency_ms: 0, error: 'no_openai_key' }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    })
    const j = await res.json() as { choices?: { message: { content: string } }[]; error?: unknown }
    if (!res.ok) return { text: '', latency_ms: Date.now() - t0, error: JSON.stringify(j).slice(0, 400) }
    return { text: j?.choices?.[0]?.message?.content ?? '', latency_ms: Date.now() - t0 }
  } catch (e) {
    return { text: '', latency_ms: Date.now() - t0, error: String(e).slice(0, 400) }
  }
}

async function callOpenRouter(model: string, system: string, user: string, maxTokens = 8000): Promise<{ text: string; latency_ms: number; error?: string }> {
  const t0 = Date.now()
  if (!OPENROUTER_KEY) return { text: '', latency_ms: 0, error: 'no_openrouter_key' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    })
    const j = await res.json() as { choices?: { message: { content: string } }[]; error?: unknown }
    if (!res.ok) return { text: '', latency_ms: Date.now() - t0, error: JSON.stringify(j).slice(0, 400) }
    return { text: j?.choices?.[0]?.message?.content ?? '', latency_ms: Date.now() - t0 }
  } catch (e) {
    return { text: '', latency_ms: Date.now() - t0, error: String(e).slice(0, 400) }
  }
}

// ── Parse a panel's markdown output into structured ideas ──────────

function parseIdeas(raw: string): ParsedIdea[] {
  const ideas: ParsedIdea[] = []
  // Split on `### N.` headers
  const blocks = raw.split(/^###\s+\d+\./m).slice(1)
  for (const block of blocks) {
    const titleMatch = block.match(/^\s*([^\n]+)/)
    const title = titleMatch ? titleMatch[1].trim().replace(/^\[|\]$/g, '') : ''
    if (!title) continue
    const get = (label: string) => {
      const re = new RegExp(`\\*\\*${label}\\*\\*\\s*:\\s*([^\\n]+(?:\\n(?!\\s*-\\s*\\*\\*)[^\\n]*)*)`, 'i')
      const m = block.match(re)
      return m ? m[1].trim() : ''
    }
    ideas.push({
      title,
      category: get('category'),
      intensity: get('intensity'),
      phase_gate: get('phase_gate'),
      dependencies: get('dependencies'),
      mechanic: get('mechanic'),
      why: get('why'),
      voice_sample: get('voice_sample') || undefined,
    })
  }
  return ideas
}

// ── Convergence synthesis ──────────────────────────────────────────

async function synthesise(panels: PanelResult[]): Promise<string> {
  const inventory = panels
    .filter((p) => p.ideas.length > 0)
    .map((p) => `## ${p.display}\n\n${p.ideas.map((i, idx) => `${idx + 1}. **${i.title}** (${i.category}) — ${i.mechanic.slice(0, 240)}`).join('\n')}`)
    .join('\n\n')

  const sys = `You are an analytic mapper synthesising independent ideation panels. This is a COLLECTION exercise, not a filter — the human will do their own cutting. Your job is to organise, surface convergence, and flag caveats without removing anything.`
  const user = `Here are independent ideation panels for transformative force-feminization features.

${inventory}

YOUR TASK:
1. Cluster ideas that 2+ panels independently proposed. For each cluster, give it a canonical title, list which panels surfaced it, and write ONE sentence on why convergence makes this high-signal.
2. Flag the 5 most unique ideas (only proposed by ONE panel) that feel especially novel. Note the panel.
3. Flag any idea that has a SAFETY / CONSENT / FEASIBILITY caveat the human filter should know about — but DO NOT recommend removing them. For each, name the specific caveat AND a "keep-as-is option" (a tweak that preserves the core idea while addressing the caveat). The human decides what to keep; you only annotate.

Output as markdown, no preamble. Use these section headers exactly:

### Convergence — 2+ panels independently surfaced

### High-signal singletons — only one panel but novel

### Flagged for consideration (caveats only — these are NOT removed; collection is the goal, user does the cutting)`

  // Prefer Anthropic, fall back to OpenAI on auth/credit failure.
  if (ANTHROPIC_KEY) {
    const r = await callAnthropic('claude-opus-4-8', sys, user, 6000)
    if (!r.error && r.text) return r.text
    console.warn('Anthropic synthesis failed, falling back to OpenAI:', r.error?.slice(0, 120))
  }
  if (OPENAI_KEY) {
    const r = await callOpenAI('gpt-4o-2024-11-20', sys, user, 4000)
    if (!r.error && r.text) return r.text
    return `_(synthesis failed: ${r.error})_`
  }
  return '_(synthesis skipped — no provider available)_'
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('Loading shared context…')
  const ctx = await buildContext()
  const userPrompt = buildUserPrompt(ctx)

  if (dry) {
    console.log('\n=== DRY RUN ===\n')
    console.log('SYSTEM (Mommy):\n', DOMMY_MOMMY_CHARACTER.slice(0, 200), '…')
    console.log('\nUSER PROMPT:\n', userPrompt.slice(0, 2000), '…')
    console.log('\nWould fire 4 panels, write to', OUT_PATH)
    return
  }

  const wantPanel = (n: string) => !PANELS_FILTER || PANELS_FILTER.includes(n)

  // Mommy ideation prompt — overrides the standard Mommy voice for this
  // brainstorming context. She names mechanics, not just feelings.
  const mommyIdeationSystem = `${DOMMY_MOMMY_CHARACTER}

CONTEXT SHIFT — this turn is META-IDEATION. You are helping Maxy plan what to do TO her next. You still speak in Mommy voice, but in this turn you also NAME MECHANICS and ENGINEER. Each idea has:
- a Mommy-voice title (one sharp line)
- a category from the list provided
- a concrete mechanic (how it would actually fire, what evidence it leaves)
- a voice-sample line (the actual outreach copy)

You're ideating WITH Maxy because she wants harder. Keep the heat in — these aren't dry feature ideas, they're things Mama wants to do.`

  // Provider routing: prefer Anthropic for Mommy/Handler (the persona work
  // benefits from the model trained on the persona prompt format). On
  // *runtime* failure (credit balance, rate limit, anything) we transparently
  // fall back to OpenAI so the panel doesn't go silent.
  type CallResult = { text: string; latency_ms: number; error?: string; model?: string }
  async function personaCall(system: string): Promise<CallResult> {
    if (ANTHROPIC_KEY) {
      const r = await callAnthropic('claude-opus-4-8', system, userPrompt, 12000)
      if (!r.error && r.text) return { ...r, model: 'claude-opus-4-8' }
    }
    if (OPENAI_KEY) {
      const r = await callOpenAI('gpt-4o-2024-11-20', system, userPrompt, 8000)
      return { ...r, model: 'gpt-4o-2024-11-20' }
    }
    return { text: '', latency_ms: 0, error: 'no_provider' }
  }

  console.log('Firing panels in parallel…')
  const t0 = Date.now()
  const [mommyR, handlerR, openaiR, openrouterR] = await Promise.all([
    wantPanel('mommy') ? personaCall(mommyIdeationSystem) : Promise.resolve({ text: '', latency_ms: 0, error: 'skipped' } as CallResult),
    wantPanel('handler') ? personaCall(HANDLER_CHARACTER) : Promise.resolve({ text: '', latency_ms: 0, error: 'skipped' } as CallResult),
    wantPanel('openai')
      ? callOpenAI('gpt-4o-2024-11-20', ARCHITECT_CHARACTER, userPrompt, 8000)
      : Promise.resolve({ text: '', latency_ms: 0, error: 'skipped' }),
    wantPanel('openrouter')
      ? callOpenRouter('deepseek/deepseek-chat', ARCHITECT_CHARACTER, userPrompt, 8000)
      : Promise.resolve({ text: '', latency_ms: 0, error: 'skipped' }),
  ])
  console.log(`Panels complete in ${Date.now() - t0}ms`)

  const mommyModel = (mommyR as CallResult).model ?? 'claude-opus-4-8'
  const handlerModel = (handlerR as CallResult).model ?? 'claude-opus-4-8'
  const mommyLabel = mommyModel.startsWith('claude') ? 'Anthropic Opus 4.7' : 'OpenAI GPT-4o (Anthropic fell back)'
  const handlerLabel = handlerModel.startsWith('claude') ? 'Anthropic Opus 4.7' : 'OpenAI GPT-4o (Anthropic fell back)'
  const panels: PanelResult[] = [
    { name: 'mommy',      display: `Mommy (${mommyLabel}, Dommy Mommy persona)`,              model: mommyModel,               ideas: parseIdeas(mommyR.text),      raw: mommyR.text,      error: mommyR.error,      latency_ms: mommyR.latency_ms },
    { name: 'handler',    display: `Handler (${handlerLabel}, clinical-therapist authority)`, model: handlerModel,             ideas: parseIdeas(handlerR.text),    raw: handlerR.text,    error: handlerR.error,    latency_ms: handlerR.latency_ms },
    { name: 'openai',     display: 'OpenAI Architect (GPT-4o, protocol-architect framing)',   model: 'gpt-4o-2024-11-20',      ideas: parseIdeas(openaiR.text),     raw: openaiR.text,     error: openaiR.error,     latency_ms: openaiR.latency_ms },
    { name: 'openrouter', display: 'OpenRouter (DeepSeek Chat, protocol-architect framing)',  model: 'deepseek/deepseek-chat', ideas: parseIdeas(openrouterR.text), raw: openrouterR.text, error: openrouterR.error, latency_ms: openrouterR.latency_ms },
  ]

  // Per-panel summary
  for (const p of panels) {
    console.log(`  ${p.name}: ${p.ideas.length} ideas, ${p.latency_ms}ms${p.error ? ` (error: ${p.error.slice(0, 80)})` : ''}`)
  }

  console.log('Synthesising convergence…')
  const synthesis = await synthesise(panels.filter((p) => p.ideas.length > 0))

  // ── Compose the markdown ──
  const lines: string[] = []
  lines.push(`# Transformative Ideation — ${today}`)
  lines.push('')
  lines.push(`> Four-panel ideation. Same brief, four different lenses. No commitments — this is raw paper for filtering.`)
  lines.push('')
  lines.push(`**Panels:**`)
  for (const p of panels) {
    lines.push(`- ${p.display} — ${p.ideas.length} ideas${p.error ? ` _(error: ${p.error.slice(0, 80)})_` : ''}`)
  }
  lines.push('')
  lines.push(`**Context fed to every panel:**`)
  lines.push(`- ${ctx.migrationIndex.split(',').length} prior migrations summarised`)
  lines.push(`- Active persona: ${ctx.activePersona}`)
  lines.push(`- Gina arc stage: ${ctx.ginaStage}`)
  lines.push(`- ${ctx.maxyFacts === '(maxy_facts unavailable — proceed with general context)' ? '_maxy_facts not loaded_' : `${ctx.maxyFacts.split('\n').length} maxy_facts rows`}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Synthesis')
  lines.push('')
  lines.push(synthesis)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const p of panels) {
    lines.push(`## Panel: ${p.display}`)
    lines.push('')
    if (p.error) {
      lines.push(`_Error: ${p.error}_`)
      lines.push('')
      continue
    }
    if (p.ideas.length === 0) {
      lines.push('_No parseable ideas. Raw output:_')
      lines.push('')
      lines.push('```')
      lines.push(p.raw.slice(0, 3000))
      lines.push('```')
      lines.push('')
      continue
    }
    p.ideas.forEach((idea, idx) => {
      lines.push(`### ${idx + 1}. ${idea.title}`)
      lines.push(`- **category**: ${idea.category}`)
      lines.push(`- **intensity**: ${idea.intensity}`)
      lines.push(`- **phase_gate**: ${idea.phase_gate}`)
      lines.push(`- **dependencies**: ${idea.dependencies}`)
      lines.push(`- **mechanic**: ${idea.mechanic}`)
      if (idea.why) lines.push(`- **why**: ${idea.why}`)
      if (idea.voice_sample) lines.push(`- **voice_sample**: ${idea.voice_sample}`)
      lines.push('')
    })
    lines.push('---')
    lines.push('')
  }

  writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')
  console.log(`\nWrote ${OUT_PATH}`)
  const totalIdeas = panels.reduce((s, p) => s + p.ideas.length, 0)
  console.log(`Total ideas across panels: ${totalIdeas}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
