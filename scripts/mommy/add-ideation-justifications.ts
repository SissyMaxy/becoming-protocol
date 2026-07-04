/**
 * add-ideation-justifications — back-fill a `**why**:` line on every
 * idea in IDEATION_TRANSFORMATIVE_<date>.md so each entry carries
 * "intended use + rationale" without re-running the panels.
 *
 * Process:
 *   1. Read the markdown.
 *   2. Locate each `## Panel:` section. For each `### N. <title>` block,
 *      parse {title, category, mechanic, voice_sample}.
 *   3. Batch each panel's ideas to Claude with one call per panel; ask
 *      for a 1-2 sentence "intended use + why add it" per idea, indexed
 *      by number.
 *   4. Splice a `- **why**: <sentence>` line into each block just below
 *      the `**mechanic**:` line.
 *   5. Save the file back in place.
 *
 * Idempotent: if a block already has `**why**:` we skip it. Re-run is safe.
 *
 * Falls back to OpenAI if Anthropic errors.
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: false })
import { readFileSync, writeFileSync } from 'fs'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''

const today = new Date().toISOString().slice(0, 10)
const args = process.argv.slice(2)
const fileArg = args.find((a) => a.startsWith('--file='))
const FILE = fileArg ? fileArg.slice(7) : `IDEATION_TRANSFORMATIVE_${today}.md`

interface IdeaBlock {
  panelHeader: string
  indexNum: string
  title: string
  category: string
  mechanic: string
  voice_sample?: string
  alreadyHasWhy: boolean
  fullBlockStart: number // line index of `### N.`
  insertAfterLine: number // line where to inject `**why**:`
}

function parseFile(text: string): { lines: string[]; blocksByPanel: Map<string, IdeaBlock[]> } {
  const lines = text.split('\n')
  const blocksByPanel = new Map<string, IdeaBlock[]>()
  let currentPanel: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const panelMatch = line.match(/^## Panel:\s*(.+)$/)
    if (panelMatch) {
      currentPanel = panelMatch[1].trim()
      if (!blocksByPanel.has(currentPanel)) blocksByPanel.set(currentPanel, [])
      continue
    }
    if (!currentPanel) continue

    const headerMatch = line.match(/^###\s+(\d+)\.\s+(.+)$/)
    if (!headerMatch) continue

    const indexNum = headerMatch[1]
    const title = headerMatch[2].trim()
    let category = ''
    let mechanic = ''
    let voice_sample: string | undefined
    let alreadyHasWhy = false
    let mechanicLine = -1

    // Scan forward to next `### ` or `---` or next `## ` for block end
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (/^### /.test(l) || /^## /.test(l) || /^---\s*$/.test(l)) break
      const cm = l.match(/^- \*\*category\*\*:\s*(.+)$/i)
      if (cm) category = cm[1].trim()
      const mm = l.match(/^- \*\*mechanic\*\*:\s*(.+)$/i)
      if (mm) { mechanic = mm[1].trim(); mechanicLine = j }
      const vm = l.match(/^- \*\*voice_sample\*\*:\s*(.+)$/i)
      if (vm) voice_sample = vm[1].trim()
      if (/^- \*\*why\*\*:/i.test(l)) alreadyHasWhy = true
    }

    if (mechanicLine === -1) continue // malformed; skip

    blocksByPanel.get(currentPanel)!.push({
      panelHeader: currentPanel,
      indexNum,
      title,
      category,
      mechanic,
      voice_sample,
      alreadyHasWhy,
      fullBlockStart: i,
      insertAfterLine: mechanicLine,
    })
  }

  return { lines, blocksByPanel }
}

// ── Provider adapters ─────────────────────────────────────────────

async function callAnthropic(prompt: string): Promise<{ text: string; error?: string }> {
  if (!ANTHROPIC_KEY) return { text: '', error: 'no_anthropic_key' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 4000,
        system: 'You write concise, specific protocol-architect justifications. No fluff. No hedging.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const j = await res.json() as { content?: { text: string }[] }
    if (!res.ok) return { text: '', error: JSON.stringify(j).slice(0, 300) }
    return { text: j?.content?.[0]?.text ?? '' }
  } catch (e) {
    return { text: '', error: String(e).slice(0, 300) }
  }
}

async function callOpenAI(prompt: string): Promise<{ text: string; error?: string }> {
  if (!OPENAI_KEY) return { text: '', error: 'no_openai_key' }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-2024-11-20',
        max_tokens: 3000,
        messages: [
          { role: 'system', content: 'You write concise, specific protocol-architect justifications. No fluff. No hedging.' },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const j = await res.json() as { choices?: { message: { content: string } }[] }
    if (!res.ok) return { text: '', error: JSON.stringify(j).slice(0, 300) }
    return { text: j?.choices?.[0]?.message?.content ?? '' }
  } catch (e) {
    return { text: '', error: String(e).slice(0, 300) }
  }
}

// ── Justification batch caller ────────────────────────────────────

async function justifyBatch(panelLabel: string, blocks: IdeaBlock[]): Promise<Map<string, string>> {
  if (blocks.length === 0) return new Map()
  const list = blocks.map((b) => `${b.indexNum}. [${b.category}] ${b.title}\n   mechanic: ${b.mechanic}`).join('\n\n')

  const prompt = `Below are ${blocks.length} ideas from the "${panelLabel}" panel of a transformative force-feminization ideation sweep. For each idea, write a 1-2 sentence justification answering: WHAT IS IT INTENDED FOR, and WHY ADD IT to the protocol? Frame as functional rationale (what behavioral / conditioning / commitment-device job it does), not vibes.

Rules:
- Each justification: 1-2 sentences, max ~45 words.
- Lead with the function ("Captures…", "Forces…", "Creates a…", "Anchors…").
- Name the concrete behavioral mechanism it operates on (Pavlovian pairing / sunk-cost / public-stake / habit-loop / arousal-anchored learning / surveillance signal / etc).
- DO NOT restate the mechanic verbatim. Justify, don't summarize.
- DO NOT hedge ("could potentially help", "might offer"). State the function directly.
- DO NOT moralize or warn (a separate caveats pass handles that).

Output EXACTLY this format (one line per idea, no preamble, no surrounding text):

1. <justification>
2. <justification>
…

The ideas:

${list}`

  let r = await callAnthropic(prompt)
  if (r.error || !r.text) {
    console.warn(`  anthropic failed for ${panelLabel}, falling back: ${r.error?.slice(0, 80)}`)
    r = await callOpenAI(prompt)
  }
  if (r.error || !r.text) {
    console.error(`  both providers failed for ${panelLabel}: ${r.error}`)
    return new Map()
  }

  const map = new Map<string, string>()
  for (const raw of r.text.split('\n')) {
    const m = raw.match(/^\s*(\d+)\.\s+(.+)$/)
    if (m) map.set(m[1], m[2].trim())
  }
  return map
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading ${FILE}…`)
  const text = readFileSync(FILE, 'utf8')
  const { lines, blocksByPanel } = parseFile(text)

  let totalIdeas = 0
  let totalNeeded = 0
  for (const [, blocks] of blocksByPanel) {
    totalIdeas += blocks.length
    totalNeeded += blocks.filter((b) => !b.alreadyHasWhy).length
  }
  console.log(`Found ${totalIdeas} ideas across ${blocksByPanel.size} panels. ${totalNeeded} need justifications.`)
  if (totalNeeded === 0) {
    console.log('All ideas already have justifications. Nothing to do.')
    return
  }

  // Justify each panel in parallel.
  const justifications = new Map<string, Map<string, string>>() // panelLabel → indexNum → why
  const panelEntries = Array.from(blocksByPanel.entries())
  const results = await Promise.all(panelEntries.map(async ([panelLabel, blocks]) => {
    const need = blocks.filter((b) => !b.alreadyHasWhy)
    if (need.length === 0) return [panelLabel, new Map<string, string>()] as const
    console.log(`  justifying ${need.length} ideas from ${panelLabel.slice(0, 60)}…`)
    const map = await justifyBatch(panelLabel, need)
    console.log(`    got ${map.size} justifications back`)
    return [panelLabel, map] as const
  }))
  for (const [panelLabel, map] of results) justifications.set(panelLabel, map)

  // Patch the file — splice `- **why**: …` after the mechanic line of each block.
  // Process in reverse order so line indices don't shift.
  const allBlocks: IdeaBlock[] = []
  for (const [, blocks] of blocksByPanel) for (const b of blocks) if (!b.alreadyHasWhy) allBlocks.push(b)
  allBlocks.sort((a, b) => b.insertAfterLine - a.insertAfterLine)

  let patched = 0
  let missing = 0
  for (const b of allBlocks) {
    const why = justifications.get(b.panelHeader)?.get(b.indexNum)
    if (!why) { missing++; continue }
    lines.splice(b.insertAfterLine + 1, 0, `- **why**: ${why}`)
    patched++
  }

  writeFileSync(FILE, lines.join('\n'), 'utf8')
  console.log(`\nPatched ${patched} ideas with **why** lines. ${missing} blocks had no justification returned.`)
  console.log(`Wrote ${FILE}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
