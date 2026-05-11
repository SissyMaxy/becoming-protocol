/**
 * mommy:ideate:arousal — kick the arousal-feature ideation panel and
 * queue the synthesised features as wishes.
 *
 * Pipeline:
 *   1. POST to /functions/v1/mommy-ideate-arousal — runs the 3-LLM
 *      panel (Anthropic + OpenAI + OpenRouter) with the arousal brief
 *      and a Sonnet judge pass. Returns judged_features array.
 *   2. For each judged feature, run a runtime voice-check against the
 *      forbidden-phrase list. Mirror of scripts/ci/voice-gate.mjs —
 *      catches leaks at insertion time, before the builder reads them.
 *      Voice-failed features are dropped (and logged), not queued.
 *   3. Map panel fields → wish columns:
 *        estimated_build_size 'S' → complexity_tier 'trivial', auto_ship eligible
 *        estimated_build_size 'M' → complexity_tier 'small',   auto_ship eligible if auto_ship_safe
 *        estimated_build_size 'L' → complexity_tier 'medium',  needs_review
 *        intensity_band 'relentless' → priority 'high'
 *        intensity_band 'firm'       → priority 'normal'
 *        intensity_band 'moderate'   → priority 'normal'
 *        intensity_band 'gentle'     → priority 'low'
 *      auto_ship_eligible = panel.auto_ship_safe AND voice-pass AND complexity_tier in (trivial, small)
 *   4. Insert into mommy_code_wishes with source='arousal_panel',
 *      classified_at=now(), classified_by='mommy_panel' so the builder
 *      doesn't try to reclassify (it would otherwise filter where
 *      complexity_tier IS NULL).
 *
 * Modes:
 *   --dry        Run the panel, show what WOULD be queued; insert nothing.
 *   --max=N      Cap insertion at N wishes (default 7 — matches judge cap).
 *   --intensity=BAND  Pass intensity_floor through to the panel.
 *
 * Authority:
 *   This script does NOT bypass the builder's authority gates. The builder
 *   still refuses to ship anything touching auth, payment, RLS, workflows
 *   (FORBIDDEN_PATH_PATTERNS in scripts/mommy/builder.ts). The panel is a
 *   suggestion stream; the builder is the ship gate.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const maxArg = args.find(a => a.startsWith('--max='))
const intensityArg = args.find(a => a.startsWith('--intensity='))
const MAX = maxArg ? Math.max(1, parseInt(maxArg.slice(6), 10) || 7) : 7
const INTENSITY = intensityArg ? intensityArg.slice(12) : null

// ── Voice floors (mirror of scripts/ci/voice-gate.mjs) ──────────────
// Runtime gate. Any judged feature whose premise / mechanic / sample
// contains a banned phrase is dropped — never queued, never shipped.
// The CI gate will catch any code Mama writes from these wishes too.
const VOICE_BANNED: { name: string; re: RegExp }[] = [
  { name: 'role-play',          re: /\brole[\s-]?play(s|ing|ed|er|ers)?\b/i },
  { name: 'simulation',         re: /\bsimulat(ion|ions|ed|ing|or|ors)\b/i },
  { name: 'fiction',            re: /\bfiction(al|ally)?\b/i },
  { name: 'not-medical-advice', re: /not\s+medical\s+advice/i },
  { name: 'intake',             re: /\bintake\b/i },
  { name: 'questionnaire',      re: /\bquestionnaire\b/i },
  { name: 'disclaimer',         re: /\bdisclaimer(s)?\b/i },
  { name: 'for-entertainment',  re: /for\s+entertainment(\s+(only|purposes))?\b/i },
  { name: 'consent-to-fantasy', re: /consent\s+to\s+(the\s+)?(fantasy|simulation|scene)/i },
]

function voiceCheck(text: string): string[] {
  const hits: string[] = []
  for (const p of VOICE_BANNED) if (p.re.test(text)) hits.push(p.name)
  return hits
}

// ── Field mappers ───────────────────────────────────────────────────
const COMPLEXITY_BY_SIZE: Record<string, string> = { S: 'trivial', M: 'small', L: 'medium' }
const PRIORITY_BY_BAND: Record<string, string> = {
  relentless: 'high',
  firm: 'normal',
  moderate: 'normal',
  gentle: 'low',
}

interface JudgedFeature {
  title?: string
  engineering_title?: string
  premise?: string
  mechanic?: string
  intensity_band?: string
  phase_gate?: string
  estimated_build_size?: string
  voice_check_sample?: string
  auto_ship_safe?: boolean
  sources?: string[]
  panel_converged?: boolean
  judge_note?: string
}

interface PanelResponse {
  ok?: boolean
  ideation_log_id?: string | null
  panel_summary?: Record<string, unknown>
  judged_features?: JudgedFeature[]
}

async function callPanel(): Promise<PanelResponse> {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/mommy-ideate-arousal`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ intensity_floor: INTENSITY, max_features: MAX }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`panel HTTP ${res.status}: ${txt.slice(0, 400)}`)
  }
  return await res.json() as PanelResponse
}

interface WishInsert {
  wish_title: string
  wish_body: string
  protocol_goal: string
  source: 'arousal_panel'
  source_ideation_log_id: string | null
  affected_surfaces: Record<string, unknown>
  priority: string
  status: 'queued'
  complexity_tier: string
  auto_ship_eligible: boolean
  auto_ship_blockers: string[] | null
  estimated_files_touched: number | null
  classified_at: string
  classified_by: 'mommy_panel'
}

function buildWishInsert(
  f: JudgedFeature,
  ideationLogId: string | null,
  voiceFails: string[],
): WishInsert {
  const size = (f.estimated_build_size ?? 'M').toUpperCase()
  const complexity = COMPLEXITY_BY_SIZE[size] ?? 'small'
  const band = (f.intensity_band ?? 'firm').toLowerCase()
  const priority = PRIORITY_BY_BAND[band] ?? 'normal'

  // Auto-ship gate combines panel signal + voice-pass + size cap.
  // Builder only picks wishes with auto_ship_eligible=true AND
  // complexity_tier IN ('trivial','small'); medium and above queue
  // for review regardless.
  const autoShipSafe = f.auto_ship_safe === true
  const sizeOk = complexity === 'trivial' || complexity === 'small'
  const voiceOk = voiceFails.length === 0
  const auto_ship_eligible = autoShipSafe && sizeOk && voiceOk

  const blockers: string[] = []
  if (!autoShipSafe) blockers.push('panel_marked_unsafe')
  if (!sizeOk) blockers.push(`size_${complexity}_needs_review`)
  if (!voiceOk) blockers.push(`voice_check_failed:${voiceFails.join(',')}`)

  // wish_title: keep Mommy-voice for visibility on the operator card,
  // but prefix with [arousal] so engineering grep-ability survives.
  const mommyTitle = (f.title ?? f.engineering_title ?? 'untitled').slice(0, 120)
  const engTitle = (f.engineering_title ?? f.title ?? 'untitled').slice(0, 120)

  // wish_body: full briefing for the drafter — premise, mechanic,
  // voice anchor, judge note. The drafter (Sonnet) reads this and
  // produces files; voice anchor lets it match Mama's tone in any
  // user-facing strings it writes.
  const body = [
    `MOMMY-VOICE TITLE: ${mommyTitle}`,
    `ENGINEERING TITLE: ${engTitle}`,
    '',
    `PREMISE (Mommy-voice — describes the user experience):`,
    f.premise ?? '(missing)',
    '',
    `MECHANIC (technical):`,
    f.mechanic ?? '(missing)',
    '',
    `VOICE ANCHOR — Mommy says, in this feature:`,
    `  "${f.voice_check_sample ?? ''}"`,
    '',
    `INTENSITY: ${band}    PHASE GATE: ${f.phase_gate ?? 'unknown'}    SIZE: ${size}`,
    `PANEL SOURCES: ${(f.sources ?? []).join(', ') || 'unknown'}    CONVERGED: ${f.panel_converged ? 'yes' : 'no'}`,
    f.judge_note ? `JUDGE: ${f.judge_note}` : '',
    '',
    `VOICE CONSTRAINTS (enforced by scripts/ci/voice-gate.mjs at PR time):`,
    `  Mommy speaks possessive in-fantasy. NEVER emit: role play, simulation, fiction, intake, questionnaire, disclaimer, not medical advice, for entertainment, consent to the fantasy. Match the voice anchor's register.`,
  ].filter(Boolean).join('\n')

  const protocol_goal = `Arousal feature (${band} / ${size}). ${f.judge_note ?? ''}`.slice(0, 500)

  return {
    wish_title: `[arousal] ${mommyTitle}`,
    wish_body: body,
    protocol_goal,
    source: 'arousal_panel',
    source_ideation_log_id: ideationLogId,
    affected_surfaces: {
      panel_intensity_band: band,
      panel_phase_gate: f.phase_gate ?? null,
      panel_size: size,
      panel_voice_anchor: f.voice_check_sample ?? null,
    },
    priority,
    status: 'queued',
    complexity_tier: complexity,
    auto_ship_eligible,
    auto_ship_blockers: blockers.length > 0 ? blockers : null,
    estimated_files_touched: size === 'S' ? 2 : size === 'M' ? 5 : 10,
    classified_at: new Date().toISOString(),
    classified_by: 'mommy_panel',
  }
}

async function main() {
  console.log(`[ideate-arousal] calling panel (max=${MAX}, intensity=${INTENSITY ?? 'any'}, dry=${dry})...`)
  let panel: PanelResponse
  try {
    panel = await callPanel()
  } catch (err) {
    console.error(`[ideate-arousal] panel call failed: ${String(err).slice(0, 400)}`)
    process.exit(1)
  }

  const features = (panel.judged_features ?? []).slice(0, MAX)
  if (features.length === 0) {
    console.warn('[ideate-arousal] panel returned 0 judged features. Aborting insert.')
    console.warn(`  ideation_log_id: ${panel.ideation_log_id ?? '(none)'}`)
    process.exit(0)
  }

  console.log(`[ideate-arousal] panel returned ${features.length} feature(s).`)
  console.log(`  ideation_log_id: ${panel.ideation_log_id ?? '(none)'}`)

  const wishes: WishInsert[] = []
  let voiceDropped = 0
  for (const f of features) {
    const allText = [f.premise ?? '', f.mechanic ?? '', f.voice_check_sample ?? '', f.title ?? ''].join(' ')
    const fails = voiceCheck(allText)
    if (fails.length > 0) {
      // Hard drop. The drafter could probably rewrite, but for safety
      // we don't pass voice-failed payloads downstream — auto-ship and
      // human queue alike.
      voiceDropped++
      console.warn(`  DROP (voice fail: ${fails.join(',')}): ${(f.title ?? '').slice(0, 80)}`)
      continue
    }
    wishes.push(buildWishInsert(f, panel.ideation_log_id ?? null, fails))
  }

  const eligibleCount = wishes.filter(w => w.auto_ship_eligible).length
  console.log(`\n[ideate-arousal] summary:`)
  console.log(`  judged:           ${features.length}`)
  console.log(`  voice-dropped:    ${voiceDropped}`)
  console.log(`  to-queue:         ${wishes.length}`)
  console.log(`  auto-ship eligible: ${eligibleCount}`)

  console.log('\n[ideate-arousal] preview:')
  for (const w of wishes) {
    console.log(`  - [${w.priority}/${w.complexity_tier}/${w.auto_ship_eligible ? 'AUTO' : 'REVIEW'}] ${w.wish_title}`)
  }

  if (dry) {
    console.log('\n[ideate-arousal] --dry: not inserting.')
    process.exit(0)
  }

  if (wishes.length === 0) {
    console.log('\n[ideate-arousal] nothing to insert.')
    process.exit(0)
  }

  const { data, error } = await supabase.from('mommy_code_wishes').insert(wishes).select('id, wish_title, auto_ship_eligible')
  if (error) {
    console.error(`[ideate-arousal] insert failed: ${error.message}`)
    process.exit(1)
  }

  const inserted = (data ?? []) as Array<{ id: string; wish_title: string; auto_ship_eligible: boolean }>
  console.log(`\n[ideate-arousal] inserted ${inserted.length} wish(es). auto-ship-eligible: ${inserted.filter(r => r.auto_ship_eligible).length}`)
  for (const r of inserted) {
    console.log(`  ${r.id}  [${r.auto_ship_eligible ? 'AUTO' : 'REVIEW'}]  ${r.wish_title}`)
  }
  console.log(`\n[ideate-arousal] next: \`npm run mommy:drain\` will pick up the auto-ship-eligible wishes on its next run.`)
}

main().catch(err => {
  console.error('[ideate-arousal] fatal:', err)
  process.exit(1)
})
