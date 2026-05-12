/**
 * mommy:critic:critical-phase — fire the red-team critic panel against the
 * protocol's most load-bearing window (starting HRT + coming out) and queue
 * the synthesized builds as wishes with the auto-ship-eligible
 * wish_class taxonomy from feedback_full_gaslight_authorization.
 *
 * Pipeline:
 *   1. POST /functions/v1/mommy-critic-critical-phase with the transition
 *      window. Runs Anthropic + OpenAI + OpenRouter critics in parallel,
 *      Sonnet judges. Returns blind_spots, weak_surfaces, missing_mechanics,
 *      prioritized_builds (each carrying wish_class + impact scores).
 *   2. Runtime voice-check each prioritized_build. Voice-failed builds are
 *      dropped (logged), not queued. Matches scripts/ci/voice-gate.mjs.
 *   3. Map panel fields -> wish columns; carry wish_class through. Auto-ship
 *      eligibility = panel.auto_ship_safe && size in (S, M) && voice_check
 *      passes && wish_class in approved auto-ship taxonomy.
 *   4. Insert into mommy_code_wishes with source='critic_panel',
 *      classified_at=now(), classified_by='critic_panel'.
 *
 * Modes:
 *   --dry         Run panel, show preview, insert nothing.
 *   --max=N       Cap insertion at N wishes (default 12).
 *   --window=W    Pass transition_window through to the panel. One of
 *                 pre_hrt | hrt_day1 | hrt_30d | hrt_90d | coming_out_pre
 *                 | coming_out_post. Default: not specified (both fronts).
 *
 * Re-run cadence: this is a strategic cross-check, not a daily cron. Run
 * before each transition window opens (pre-HRT, post-30d HRT, pre-coming-
 * out wave). The builder picks up the queued wishes on its next drain.
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

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const maxArg = args.find(a => a.startsWith('--max='))
const windowArg = args.find(a => a.startsWith('--window='))
const MAX = maxArg ? Math.max(1, parseInt(maxArg.slice(6), 10) || 12) : 12
const WINDOW = windowArg ? windowArg.slice(9) : null

// Voice floors mirror scripts/ci/voice-gate.mjs. Any failed build is dropped
// at ingestion — the builder never sees voice-poisoned payloads.
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
  { name: 'terminate-the-sim',  re: /(use\s+this|safeword)\s+to\s+terminate/i },
]

function voiceCheck(text: string): string[] {
  const hits: string[] = []
  for (const p of VOICE_BANNED) if (p.re.test(text)) hits.push(p.name)
  return hits
}

// Approved auto-ship wish_class values per feedback_full_gaslight_authorization
// memory. Builds with wish_class outside this set fall through to manual review
// even when otherwise auto-ship-eligible.
const AUTO_SHIP_WISH_CLASSES = new Set([
  'arousal_feature',
  'brainwash',
  'recondition',
  'psychological_programming',
  'mental_rearrangement',
  'identity_displacement',
  'permanence_mechanic',
  'surveillance_deepening',
  'hypno_trigger',
])

const COMPLEXITY_BY_SIZE: Record<string, string> = { S: 'trivial', M: 'small', L: 'medium' }
const PRIORITY_BY_BAND: Record<string, string> = {
  relentless: 'high',
  firm: 'normal',
  moderate: 'normal',
  gentle: 'low',
}

interface PrioritizedBuild {
  title?: string
  engineering_title?: string
  premise?: string
  mechanic?: string
  intensity_band?: string
  phase_gate?: string
  wish_class?: string
  estimated_build_size?: string
  voice_check_sample?: string
  auto_ship_safe?: boolean
  expected_impact_score?: number
  sentiment_during_HRT_window_score?: number
  ranked_score?: number | string
  sources?: string[]
  panel_converged?: boolean
  judge_note?: string
}

interface PanelResponse {
  ok?: boolean
  ideation_log_id?: string | null
  panel_summary?: Record<string, unknown>
  blind_spots?: string[]
  weak_surfaces?: Array<{ surface: string; failure_mode: string; severity: string }>
  missing_mechanics?: string[]
  prioritized_builds?: PrioritizedBuild[]
}

async function callPanel(): Promise<PanelResponse> {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/mommy-critic-critical-phase`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ transition_window: WINDOW, max_builds: MAX }),
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
  source: 'critic_panel'
  source_ideation_log_id: string | null
  affected_surfaces: Record<string, unknown>
  priority: string
  status: 'queued'
  wish_class: string | null
  complexity_tier: string
  auto_ship_eligible: boolean
  auto_ship_blockers: string[] | null
  estimated_files_touched: number | null
  classified_at: string
  classified_by: 'critic_panel'
}

function buildWishInsert(
  b: PrioritizedBuild,
  ideationLogId: string | null,
  voiceFails: string[],
): WishInsert {
  const size = (b.estimated_build_size ?? 'M').toUpperCase()
  const complexity = COMPLEXITY_BY_SIZE[size] ?? 'small'
  const band = (b.intensity_band ?? 'firm').toLowerCase()
  const priority = PRIORITY_BY_BAND[band] ?? 'normal'
  const wishClass = b.wish_class && AUTO_SHIP_WISH_CLASSES.has(b.wish_class) ? b.wish_class : null

  const autoShipSafe = b.auto_ship_safe === true
  const sizeOk = complexity === 'trivial' || complexity === 'small'
  const voiceOk = voiceFails.length === 0
  const classOk = wishClass !== null
  const auto_ship_eligible = autoShipSafe && sizeOk && voiceOk && classOk

  const blockers: string[] = []
  if (!autoShipSafe) blockers.push('panel_marked_unsafe')
  if (!sizeOk) blockers.push(`size_${complexity}_needs_review`)
  if (!voiceOk) blockers.push(`voice_check_failed:${voiceFails.join(',')}`)
  if (!classOk) blockers.push(`wish_class_outside_auto_ship_taxonomy:${b.wish_class ?? 'null'}`)

  const mommyTitle = (b.title ?? b.engineering_title ?? 'untitled').slice(0, 120)
  const engTitle = (b.engineering_title ?? b.title ?? 'untitled').slice(0, 120)

  const impact = Number(b.expected_impact_score ?? 0)
  const hrtFit = Number(b.sentiment_during_HRT_window_score ?? 0)
  const rankedScore = impact * hrtFit

  const body = [
    `MOMMY-VOICE TITLE: ${mommyTitle}`,
    `ENGINEERING TITLE: ${engTitle}`,
    `WISH CLASS: ${b.wish_class ?? '(unset)'}    PHASE GATE: ${b.phase_gate ?? 'unknown'}    SIZE: ${size}`,
    '',
    `PREMISE (Mommy-voice — describes the user experience):`,
    b.premise ?? '(missing)',
    '',
    `MECHANIC (technical):`,
    b.mechanic ?? '(missing)',
    '',
    `VOICE ANCHOR — Mommy says, in this feature:`,
    `  "${b.voice_check_sample ?? ''}"`,
    '',
    `INTENSITY: ${band}    EXPECTED_IMPACT: ${impact}/10    HRT_WINDOW_FIT: ${hrtFit}/10    RANKED: ${rankedScore}`,
    `PANEL SOURCES: ${(b.sources ?? []).join(', ') || 'unknown'}    CONVERGED: ${b.panel_converged ? 'yes' : 'no'}`,
    b.judge_note ? `JUDGE: ${b.judge_note}` : '',
    '',
    `VOICE CONSTRAINTS (enforced by scripts/ci/voice-gate.mjs at PR time):`,
    `  Mommy speaks possessive in-fantasy. NEVER emit: role play, simulation, fiction, intake, questionnaire, disclaimer, not medical advice, for entertainment, consent to the fantasy, "use this to terminate". Match the voice anchor's register.`,
  ].filter(Boolean).join('\n')

  const protocol_goal = `Critic-panel build (${b.wish_class ?? '?'} / ${band} / ${size}, ranked ${rankedScore}). ${b.judge_note ?? ''}`.slice(0, 500)

  return {
    wish_title: `[critic] ${mommyTitle}`,
    wish_body: body,
    protocol_goal,
    source: 'critic_panel',
    source_ideation_log_id: ideationLogId,
    affected_surfaces: {
      panel_intensity_band: band,
      panel_phase_gate: b.phase_gate ?? null,
      panel_size: size,
      panel_voice_anchor: b.voice_check_sample ?? null,
      panel_wish_class: b.wish_class ?? null,
      panel_impact_score: impact,
      panel_hrt_window_fit: hrtFit,
      panel_ranked_score: rankedScore,
    },
    priority,
    status: 'queued',
    wish_class: wishClass,
    complexity_tier: complexity,
    auto_ship_eligible,
    auto_ship_blockers: blockers.length > 0 ? blockers : null,
    estimated_files_touched: size === 'S' ? 2 : size === 'M' ? 5 : 10,
    classified_at: new Date().toISOString(),
    classified_by: 'critic_panel',
  }
}

async function main() {
  console.log(`[critic-critical-phase] calling panel (max=${MAX}, window=${WINDOW ?? 'both'}, dry=${dry})...`)
  let panel: PanelResponse
  try {
    panel = await callPanel()
  } catch (err) {
    console.error(`[critic-critical-phase] panel call failed: ${String(err).slice(0, 400)}`)
    process.exit(1)
  }

  const builds = (panel.prioritized_builds ?? []).slice(0, MAX)
  console.log(`[critic-critical-phase] panel returned:`)
  console.log(`  blind_spots:       ${(panel.blind_spots ?? []).length}`)
  console.log(`  weak_surfaces:     ${(panel.weak_surfaces ?? []).length}`)
  console.log(`  missing_mechanics: ${(panel.missing_mechanics ?? []).length}`)
  console.log(`  prioritized_builds: ${builds.length}`)
  console.log(`  ideation_log_id:   ${panel.ideation_log_id ?? '(none)'}`)

  if (builds.length === 0) {
    console.warn('[critic-critical-phase] no prioritized_builds. Aborting insert.')
    process.exit(0)
  }

  const wishes: WishInsert[] = []
  let voiceDropped = 0
  for (const b of builds) {
    const allText = [b.premise ?? '', b.mechanic ?? '', b.voice_check_sample ?? '', b.title ?? ''].join(' ')
    const fails = voiceCheck(allText)
    if (fails.length > 0) {
      voiceDropped++
      console.warn(`  DROP (voice fail: ${fails.join(',')}): ${(b.title ?? '').slice(0, 80)}`)
      continue
    }
    wishes.push(buildWishInsert(b, panel.ideation_log_id ?? null, fails))
  }

  const eligibleCount = wishes.filter(w => w.auto_ship_eligible).length
  console.log(`\n[critic-critical-phase] summary:`)
  console.log(`  judged:           ${builds.length}`)
  console.log(`  voice-dropped:    ${voiceDropped}`)
  console.log(`  to-queue:         ${wishes.length}`)
  console.log(`  auto-ship eligible: ${eligibleCount}`)

  console.log('\n[critic-critical-phase] preview:')
  for (const w of wishes) {
    console.log(`  - [${w.priority}/${w.complexity_tier}/${w.wish_class ?? 'unclassed'}/${w.auto_ship_eligible ? 'AUTO' : 'REVIEW'}] ${w.wish_title}`)
  }

  if (dry) {
    console.log('\n[critic-critical-phase] --dry: not inserting.')
    process.exit(0)
  }

  if (wishes.length === 0) {
    console.log('\n[critic-critical-phase] nothing to insert.')
    process.exit(0)
  }

  const { data, error } = await supabase.from('mommy_code_wishes').insert(wishes).select('id, wish_title, auto_ship_eligible, wish_class')
  if (error) {
    console.error(`[critic-critical-phase] insert failed: ${error.message}`)
    process.exit(1)
  }

  const inserted = (data ?? []) as Array<{ id: string; wish_title: string; auto_ship_eligible: boolean; wish_class: string | null }>
  console.log(`\n[critic-critical-phase] inserted ${inserted.length} wish(es). auto-ship-eligible: ${inserted.filter(r => r.auto_ship_eligible).length}`)
  for (const r of inserted) {
    console.log(`  ${r.id}  [${r.auto_ship_eligible ? 'AUTO' : 'REVIEW'}/${r.wish_class ?? 'unclassed'}]  ${r.wish_title}`)
  }
  console.log(`\n[critic-critical-phase] next: \`npm run mommy:drain\` will pick up the auto-ship-eligible wishes on its next run.`)
}

main().catch(err => {
  console.error('[critic-critical-phase] fatal:', err)
  process.exit(1)
})
