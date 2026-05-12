// mommy-craft-check — sentence-level craft rubric for Mommy voice.
//
// Telemetry leaks (mommyVoiceCleanup) are about WHAT Mama says — numbers,
// dashboards, scores. This rubric is about HOW Mama says it — pet-name
// stuffing, Mama-prefix every clause, forced three-beat rhythm, abstract
// sensory clichés ("echo", "linger"), theatrical openings, possessive
// announcement instead of specific observation.
//
// Mirror in src/lib/persona/mommy-craft-check.ts — same rules, same words.
//
// Rules of restraint (encoded as detectors + advisories):
//   1. ≤1 pet name per message
//   2. ≤2 self-references ("Mama"/"Mommy"); 3+ = corny hit
//   3. No forced rhyme/alliteration on the user's name (Mama Maxy / making Maxy)
//   4. No abstract sensory clichés (echo, linger, wrap around, every inch,
//      drip down, melt into, dissolve into)
//   5. No discourse-marker Mama starting back-to-back clauses
//   6. No three-beat "Mama's X. Mama's Y. Mama's girl." chant
//
// Each hit contributes 1 to the corny score. Score >= 3 triggers regen
// in the LLM pipeline; the CI gate warns on each hit and fails at 3+
// per file.

export type CraftHit = {
  rule: string
  match: string
  rationale: string
}

export interface CraftScoreResult {
  score: number
  hits: CraftHit[]
}

const PET_NAME_RE = /\b(baby(?:\s+girl)?|sweet(?:\s+thing|\s+girl)?|pretty(?:\s+thing|\s+princess)?|good\s+girl|princess|darling|precious|mama'?s\s+(?:pretty\s+thing|good\s+girl|favorite\s+girl)|my\s+(?:needy\s+little\s+thing|favorite\s+girl|pretty\s+princess)|sweet\s+pea|honey\s+girl|little\s+one)\b/gi

const MAMA_REF_RE = /\b(mama'?s?|mommy'?s?)\b/gi

const ABSTRACT_SENSORY_RE = /\b(echo(?:ing|es)?|linger(?:ing|s)?|wrap(?:s|ping|ped)?\s+around|every\s+inch|drip(?:s|ping)?\s+down|melt(?:s|ing)?\s+into|dissolve(?:s|d|ing)?\s+into|cours(?:e|es|ing)\s+through|sink(?:s|ing)?\s+into\s+(?:your|her)\s+(?:bones|skin|soul)|fill(?:s|ing)?\s+(?:every|each)\s+(?:cell|part)|wash(?:es|ing)?\s+over\s+you|stay(?:ing)?\s+(?:right\s+)?in\s+your\s+mind)\b/gi

// Forced rhyme / alliteration on the user's name. The user's name is "Maxy"
// in this protocol; the corny tells are "Mama's making my Maxy" /
// "Mama's Maxy" / "my Maxy magic" type lines. Catch repeated /m/ openers
// that include a name token.
const RHYME_ALLITERATION_RE = /\b(mama'?s?\s+(?:making|molding|moulding|moving|making\s+my)\s+(?:my\s+)?(?:maxy|m[a-z]+y))\b/gi

// Theatrical openings — "Look at that pretty face being so obedient for Mama"
// is camp; concrete openings ("Your hair is in your face again") land.
// We catch the camp ceiling specifically.
const THEATRICAL_OPENING_RE = /\b(look\s+at\s+(?:that|those)\s+(?:pretty|sweet|perfect|beautiful)\s+(?:face|eyes|lips|girl|thing|princess)\s+(?:being|getting|looking)\s+(?:so|all)?\s*(?:obedient|wet|needy|good|pretty|filthy))\b/i

// Theatrical "I'm staying right in your mind tonight" / "my voice echoing"
// captured by ABSTRACT_SENSORY_RE; the "right in your mind" specifically
// is the corny ceiling phrase.

function countOccurrences(text: string, re: RegExp): { count: number; matches: string[] } {
  const matches: string[] = []
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = r.exec(text)) !== null) {
    matches.push(m[0])
    if (matches.length > 25) break
  }
  return { count: matches.length, matches }
}

function detectThreeBeatChant(text: string): { hit: boolean; sample: string } {
  // "Mama's X. Mama's Y. Mama's Z." — three Mama-headed sentences in a row.
  // Allow optional pet-name appositive between Mama's and verb/object.
  const re = /(?:^|[.!?]\s+)mama'?s\s+\w[^.!?]{1,40}[.!?]\s+mama'?s\s+\w[^.!?]{1,40}[.!?]\s+mama'?s\s+\w[^.!?]{1,40}[.!?]/i
  const m = text.match(re)
  return { hit: !!m, sample: m?.[0]?.slice(0, 120) ?? '' }
}

function detectDiscourseMamaPrefix(text: string): { hit: boolean; sample: string } {
  // "Mama saw it, baby. Mama heard you. Mama caught it." — three sentences in
  // a row, each beginning with Mama-verb. Distinct from possessive Mama's.
  const re = /(?:^|[.!?]\s+)mama\s+\w+[^.!?]{1,40}[.!?]\s+mama\s+\w+[^.!?]{1,40}[.!?]\s+mama\s+\w+[^.!?]{1,40}[.!?]/i
  const m = text.match(re)
  return { hit: !!m, sample: m?.[0]?.slice(0, 120) ?? '' }
}

/**
 * Score a Mommy-voice string for corniness. Higher score = cornier. 0-2 is
 * acceptable craft. 3+ should trigger regen / supersede / cull.
 */
export function scoreCorny(text: string): CraftScoreResult {
  const hits: CraftHit[] = []
  if (!text || text.trim().length === 0) return { score: 0, hits }

  const petNames = countOccurrences(text, PET_NAME_RE)
  if (petNames.count >= 2) {
    hits.push({
      rule: 'pet_name_stuffing',
      match: petNames.matches.slice(0, 3).join(' / '),
      rationale: `${petNames.count} pet names in one message — Rule of Restraint: ≤1 per message.`,
    })
  }

  const mamaRefs = countOccurrences(text, MAMA_REF_RE)
  if (mamaRefs.count >= 3) {
    hits.push({
      rule: 'mama_overuse',
      match: `${mamaRefs.count}× Mama/Mommy`,
      rationale: 'Speakers don\'t refer to themselves in third person every clause. Cap at 2.',
    })
  }

  const abstract = countOccurrences(text, ABSTRACT_SENSORY_RE)
  if (abstract.count >= 1) {
    hits.push({
      rule: 'abstract_sensory_cliche',
      match: abstract.matches[0],
      rationale: 'Abstract sensory cliché ("echo"/"linger"/"every inch"). Replace with a concrete sensory anchor.',
    })
  }

  const rhyme = countOccurrences(text, RHYME_ALLITERATION_RE)
  if (rhyme.count >= 1) {
    hits.push({
      rule: 'forced_rhyme_alliteration',
      match: rhyme.matches[0],
      rationale: 'Forced rhyme/alliteration on the user\'s name reads as chant, not speech.',
    })
  }

  const theatrical = THEATRICAL_OPENING_RE.exec(text)
  if (theatrical) {
    hits.push({
      rule: 'theatrical_opening',
      match: theatrical[0],
      rationale: 'Theatrical "Look at that pretty face being so obedient" opening reads as camp porn. Open on a concrete observation.',
    })
  }

  const chant = detectThreeBeatChant(text)
  if (chant.hit) {
    hits.push({
      rule: 'three_beat_chant',
      match: chant.sample,
      rationale: 'Three-beat "Mama\'s X. Mama\'s Y. Mama\'s Z." reads as chant. Vary rhythm wildly.',
    })
  }

  const prefix = detectDiscourseMamaPrefix(text)
  if (prefix.hit) {
    hits.push({
      rule: 'discourse_mama_prefix',
      match: prefix.sample,
      rationale: 'Back-to-back "Mama VERB" clauses. Speakers drop the self-reference.',
    })
  }

  return { score: hits.length, hits }
}

/**
 * Annotation opt-out — generators or content authors can mark a string as
 * intentionally corny by prepending `// craft: ok` on the line above OR by
 * including the literal token `[craft:ok]` in the string itself. The CI
 * gate honors the comment annotation; the runtime filter honors the inline
 * token.
 */
export function hasCraftOptOut(text: string): boolean {
  if (!text) return false
  return /\[craft:ok\]/i.test(text)
}

export interface CraftFilterOptions {
  threshold?: number  // score at which we treat output as corny (default 3)
  regenerate?: (() => Promise<string>) | null  // optional one-shot regenerate
  fallback?: string | null  // deterministic fallback if regen still corny
}

/**
 * applyCraftFilter — post-generation guard. If `text` scores < threshold,
 * return as-is. Otherwise, try regenerate once (if provided); if the
 * regenerated text is also corny (or no regenerator), return fallback if
 * provided, else return the original (degraded). The result reports what
 * happened so callers can log/telemetry it.
 */
export async function applyCraftFilter(
  text: string,
  opts: CraftFilterOptions = {},
): Promise<{ text: string; score: number; regenerated: boolean; used_fallback: boolean; hits: CraftHit[] }> {
  const threshold = opts.threshold ?? 3
  if (hasCraftOptOut(text)) {
    return { text, score: 0, regenerated: false, used_fallback: false, hits: [] }
  }
  const first = scoreCorny(text)
  if (first.score < threshold) {
    return { text, score: first.score, regenerated: false, used_fallback: false, hits: first.hits }
  }
  if (opts.regenerate) {
    let regen = ''
    try { regen = await opts.regenerate() } catch { regen = '' }
    if (regen && regen.trim().length >= 20) {
      const second = scoreCorny(regen)
      if (second.score < threshold) {
        return { text: regen, score: second.score, regenerated: true, used_fallback: false, hits: second.hits }
      }
    }
  }
  if (opts.fallback && opts.fallback.trim().length >= 10) {
    return { text: opts.fallback, score: scoreCorny(opts.fallback).score, regenerated: !!opts.regenerate, used_fallback: true, hits: first.hits }
  }
  return { text, score: first.score, regenerated: !!opts.regenerate, used_fallback: false, hits: first.hits }
}

/**
 * Prompt fragment to inject into every Mommy-voice LLM system prompt.
 * Less Mama, more Mommy. Less announcement, more attention.
 */
export const MOMMY_CRAFT_RUBRIC = `RULES OF RESTRAINT — Mommy is a body in the room, not a chant:
- ≤1 pet name per message. Often zero. Mommy uses her name or no name.
- ≤2 self-references per message. "Mama"/"Mommy" appears 0-2 times, NOT in every clause. Mama doesn't talk about Mama in the third person.
- No three-beat chant ("Mama's X. Mama's Y. Mama's girl."). Vary sentence length wildly. One sharp line beats three rhythmic ones.
- Show possession through specific observation, not announcement. "Your hand has been on your phone for twenty minutes. Put it down." beats "Mama wants you to put your phone down."
- Concrete sensory grounding > abstract emotional declaration. No "echo", "linger", "wrap around", "every inch", "stay right in your mind". Replace with a real object in her actual room.
- Imperatives can stand bare. "Stop. Look up. Tell me." doesn't need a pet name attached. Restraint creates the punch.
- Declaratives can stand bare. "You're going to wear the white pair today." Mommy is implied; she doesn't sign her name on every sentence.
- Questions can stand bare. "What did you eat?" Doesn't need "baby" attached.
- One verbal earring is fine. Stacking ("sweet thing", "baby", "good girl") is cringe.
- Late-night and intimate buckets get MORE restraint, not less. Whisper > shout.
- Sissygasm-gating and in-the-moment scenes get MORE specific and present, not MORE theatrical. ("Hand off. Breathe.") beats ("Look at that pretty face dripping for Mama").
- No forced rhyme/alliteration on her name ("Mama's making my Maxy" type lines).
- Cliché openers banned: "Look at that pretty face...", "Such a good girl, look at you...", "Mama caught that, baby" repeated.

CRAFT FLOOR: if your draft contains 3+ of {2+ pet names, 3+ Mamas, "echo/linger/wrap around" cliché, forced rhyme on her name, three-beat chant, "Look at that pretty face" opening} — REWRITE before returning. Restraint reads as confidence; piling on reads as desperate.`
