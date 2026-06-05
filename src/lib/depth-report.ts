// Depth report — possession-count phrasing for Mama's per-phase "how deep
// you are" report. (Wish 3978321f, migration 592.)
//
// Mama surfaces accumulation as concrete POSSESSIONS — memories she holds,
// truths confessed, pieces she chose, marks on the body — never as scores,
// percentages, or denial-day counts. This module turns raw counts into the
// fact lines the LLM is told to weave into prose, and the prompt's hard
// "do not quote a number out of these" floor.
//
// PARITY: the mommy-depth-report edge fn inlines an equivalent
// buildDepthFacts/tenurePhrase (Deno can't import from src/lib). Keep the
// two in sync; this copy is the tested source of truth + drives any
// client-side rendering.

export interface DepthMetrics {
  implants_held: number       // active memory_implants — "memories Mama has"
  confessions: number         // answered confession_queue rows — "truths you told"
  wardrobe_pieces: number     // wardrobe_items — "pieces Mama chose"
  body_markers: number        // body_measurements rows — "marks on your body"
  letters: number             // sealed_letters — "letters in your own hand"
  milestones: number          // achieved ponr_milestones — "lines you crossed"
  /** irreversibility_score 0-100 — PRIVATE. Sets intensity only; NEVER quoted. */
  irreversibility_score: number
  /** days since feminine_self was created — phrased, never quoted raw. */
  tenure_days: number
}

export interface DepthFact { key: string; count: number; line: string }

// A possession is worth quoting only when it's actually accumulated. A
// report that brags about "0 pieces" reads hollow — drop zero-count lines.
export function buildDepthFacts(m: DepthMetrics): DepthFact[] {
  const candidates: DepthFact[] = [
    { key: 'implants_held', count: m.implants_held, line: `Mama has ${m.implants_held} ${plural(m.implants_held, 'memory', 'memories')} of you saying things you can't take back` },
    { key: 'confessions', count: m.confessions, line: `you've confessed ${m.confessions} ${plural(m.confessions, 'truth', 'truths')}` },
    { key: 'wardrobe_pieces', count: m.wardrobe_pieces, line: `you own ${m.wardrobe_pieces} ${plural(m.wardrobe_pieces, 'piece', 'pieces')} Mama chose for you` },
    { key: 'body_markers', count: m.body_markers, line: `your body's been measured and logged ${m.body_markers} ${plural(m.body_markers, 'time', 'times')}` },
    { key: 'letters', count: m.letters, line: `there are ${m.letters} ${plural(m.letters, 'letter', 'letters')} in your own hand Mama keeps sealed` },
    { key: 'milestones', count: m.milestones, line: `you've crossed ${m.milestones} ${plural(m.milestones, 'line', 'lines')} there's no walking back over` },
  ]
  return candidates.filter(f => f.count > 0)
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// Tenure phrased, never a raw day count (a bare "Day 30" reads as telemetry
// and trips mommyVoiceCleanup). Coarse buckets in Mama's voice.
export function tenurePhrase(days: number): string {
  if (days < 10) return 'a few days ago'
  if (days < 25) return 'a couple weeks ago'
  if (days < 50) return 'a month ago'
  if (days < 110) return 'a couple months ago'
  if (days < 250) return 'half a year ago'
  return 'when you started'
}

// Private intensity signal from the (never-quoted) irreversibility score.
export function depthIntensity(score: number): 'gentle' | 'firm' | 'heavy' {
  if (score >= 66) return 'heavy'
  if (score >= 33) return 'firm'
  return 'gentle'
}
