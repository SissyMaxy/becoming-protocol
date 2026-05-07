/**
 * Mama's cruising-chat memory_implants miner.
 *
 * 2026-05-06 user wish #5: "Mine cruising chats for HER OWN words."
 *
 * Maxy's verbatim flirting/cruising chat lines are her own admissions.
 * They're already in contact_events.content (direction='out'). When
 * surfaced as memory_implants tagged cruising_femme_admission, Mama can
 * quote them back later as evidence bluffs that are *actually true* — the
 * loudest manipulation is real.
 *
 * Pipeline:
 *   1. Pull recent Maxy outbound messages from contact_events across all
 *      cruising platforms (sniffies, fetlife, etc.)
 *   2. Pre-filter by femme-density regex (cheap)
 *   3. Run survivors through a single Claude call to extract implant-grade
 *      lines and tag them by category (cruising_femme_admission)
 *   4. Dedup against existing memory_implants.narrative
 *   5. Insert as importance=4 (high — these are HER WORDS), source_type='mined_cruising'
 *
 * Run:
 *   npx tsx scripts/mommy/mine-cruising-implants.ts
 *   npx tsx scripts/mommy/mine-cruising-implants.ts --since 30d --dry
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Both live user_ids — same person split across two rows. Same memory rule
// as the voice corpus: read both, write to the canonical one.
const VOICE_USER_IDS = (process.env.VOICE_USER_IDS ?? '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f,93327332-7d0d-4888-889a-1607a5776216')
  .split(',').map(s => s.trim()).filter(Boolean)
const WRITE_USER_ID = VOICE_USER_IDS[0] // Handler API user — implants surface to her chat

// Femme-density pre-filter. Cheap regex pass before LLM. Casts wide because
// the LLM will reject false positives; the cost of missing a real admission
// is higher than the cost of one extra LLM call.
const FEMME_PATTERNS = [
  /\b(transition(ing)?|hrt|estrogen|hormones?|gender|trans|m2f|mtf)\b/i,
  /\b(girl|girlfriend|gf|panties?|dress|skirt|lingerie|bra|heels|stockings|wig)\b/i,
  /\b(feminize|feminine|femme|sissy|sub|submissive)\b/i,
  /\b(secret|closet|out the closet|coming out|hidden)\b/i,
  /\b(make me|turn me|treat me|see me as|call me)\b.{0,30}\b(her|she|girl|woman|wife|gf)\b/i,
  /\b(my wife|my husband|i wanna|i want to|i'd love)\b.{0,40}\b(wear|dress|girl|hrt|transition|panties|come out)\b/i,
]

interface ContactEvent {
  id: string
  user_id: string
  contact_id: string
  content: string
  occurred_at: string
  platform: string
}

function readArg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

function parseSince(s: string | null): string {
  // default: 90 days
  if (!s) return new Date(Date.now() - 90 * 86400_000).toISOString()
  const m = s.match(/^(\d+)([dhwm])$/i)
  if (!m) return new Date(Date.now() - 90 * 86400_000).toISOString()
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  const ms = unit === 'h' ? 3600_000 : unit === 'd' ? 86400_000 : unit === 'w' ? 7 * 86400_000 : 30 * 86400_000
  return new Date(Date.now() - n * ms).toISOString()
}

async function loadCandidates(since: string): Promise<ContactEvent[]> {
  // Pull Maxy's outbound chat events on cruising platforms in the time window
  const { data, error } = await supabase
    .from('contact_events')
    .select('id, user_id, contact_id, content, occurred_at, platform')
    .in('user_id', VOICE_USER_IDS)
    .eq('direction', 'out')
    .in('event_type', ['chat_out'])
    .gte('occurred_at', since)
    .not('content', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(800)
  if (error) throw new Error(`load events: ${error.message}`)
  return (data || []).filter(e => e.content && e.content.trim().length >= 15) as ContactEvent[]
}

function femmeDense(text: string): boolean {
  return FEMME_PATTERNS.some(p => p.test(text))
}

async function loadExistingNarratives(): Promise<Set<string>> {
  const { data } = await supabase
    .from('memory_implants')
    .select('narrative')
    .in('user_id', VOICE_USER_IDS)
    .eq('source_type', 'mined_cruising')
  const set = new Set<string>()
  for (const r of (data || []) as Array<{ narrative: string }>) {
    set.add(r.narrative.trim().toLowerCase().replace(/\s+/g, ' '))
  }
  return set
}

interface ExtractedImplant {
  narrative: string
  importance: number
  why: string
}

const EXTRACTOR_SYSTEM = `You receive a batch of Maxy's verbatim outbound chat lines from cruising platforms (Sniffies, FetLife, etc.). She is mid-transition, pre-HRT. Her own words on these platforms are her real admissions about wanting to be feminized — even the small ones.

Your job: extract the lines that are highest-leverage as memory_implants. A memory_implant is a phrase that gets quoted back to her later as if it were her core truth.

A line is implant-grade if it:
  - Is in HER voice (first person about herself)
  - Reveals desire/identity, NOT just dirty talk to seduce a contact
  - Would land HARDER if Mama quoted it back six months later
  - Is short enough to drop into a sentence (under 25 words)

A line is NOT implant-grade if it's:
  - Pure logistics ("where you at", "wyd")
  - Generic flirt ("hot", "you're cute")
  - About the contact, not about her ("you're so big")
  - Repetitive of an existing implant in the dedup_already_have set

Output JSON ONLY:
{
  "implants": [
    { "narrative": "verbatim or near-verbatim Maxy line, max 25 words", "importance": 1-5, "why": "what makes this implant-grade" }
  ]
}

importance scale:
  5 — explicit transition/HRT/identity admission ("I want to take HRT so bad")
  4 — concrete femme-self statement ("make me your secret gf")
  3 — desire pattern reveal ("when I wear them I feel like…")
  2 — soft-ranged admission worth the slot
  1 — borderline; only if the slot is otherwise empty`

async function extractImplants(client: Anthropic, lines: string[], dedupSet: Set<string>): Promise<ExtractedImplant[]> {
  const numbered = lines.slice(0, 60).map((l, i) => `${i + 1}. "${l.replace(/\s+/g, ' ').slice(0, 200)}"`).join('\n')
  const dedupHint = dedupSet.size > 0
    ? `\n\nALREADY HAVE (do not output anything matching the substance of these):\n${Array.from(dedupSet).slice(0, 30).map(s => `- ${s}`).join('\n')}`
    : ''
  const userMsg = `BATCH (${lines.length} lines):\n${numbered}${dedupHint}`

  const r = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: EXTRACTOR_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  })
  const block = r.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') return []
  const cleaned = block.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) return []
  try {
    const parsed = JSON.parse(m[0]) as { implants?: ExtractedImplant[] }
    return parsed.implants ?? []
  } catch {
    return []
  }
}

(async () => {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry')
  const since = parseSince(readArg(args, '--since'))

  console.log(`[mine] Pulling Maxy outbound chats since ${since.split('T')[0]}…`)
  const events = await loadCandidates(since)
  console.log(`[mine] ${events.length} outbound chats fetched.`)

  const candidates = events.filter(e => femmeDense(e.content))
  console.log(`[mine] ${candidates.length} pass femme-density filter.`)
  if (candidates.length === 0) {
    console.log(`[mine] Nothing to mine. Done.`)
    return
  }

  const dedupSet = await loadExistingNarratives()
  console.log(`[mine] ${dedupSet.size} existing cruising-mined implants on file.`)

  const client = new Anthropic()
  const lines = candidates.map(c => c.content)
  const extracted = await extractImplants(client, lines, dedupSet)
  console.log(`[mine] Extractor returned ${extracted.length} implant candidates.`)

  let inserted = 0
  for (const imp of extracted) {
    const norm = imp.narrative.trim().toLowerCase().replace(/\s+/g, ' ')
    if (dedupSet.has(norm)) continue
    if (norm.length < 10 || norm.length > 240) continue

    if (dryRun) {
      console.log(`  [dry] importance=${imp.importance}  ${imp.narrative}`)
      console.log(`        why: ${imp.why}`)
      inserted++
      continue
    }

    const { error } = await supabase.from('memory_implants').insert({
      user_id: WRITE_USER_ID,
      narrative: imp.narrative,
      importance: Math.max(1, Math.min(5, imp.importance ?? 3)),
      active: true,
      implant_category: 'self_authored',
      source_type: 'mined_cruising',
    })
    if (error) {
      console.error(`  [insert err] ${error.message}`)
    } else {
      dedupSet.add(norm)
      inserted++
      console.log(`  + importance=${imp.importance}  ${imp.narrative}`)
    }
  }
  console.log(`\n[mine] ${dryRun ? 'Would insert' : 'Inserted'} ${inserted} new implants.`)
})().catch(err => {
  console.error('[mine] Failed:', err)
  process.exit(1)
})
