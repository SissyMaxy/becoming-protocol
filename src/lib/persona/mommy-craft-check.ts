/**
 * Mommy voice — sentence-level craft rubric (src-side mirror of
 * supabase/functions/_shared/mommy-craft-check.ts). Keep in sync.
 *
 * Telemetry leaks (mommyVoiceCleanup) catch numbers/dashboards. This rubric
 * catches HOW Mama speaks — pet-name stuffing, Mama-prefix every clause,
 * forced three-beat rhythm, abstract sensory clichés, theatrical openings.
 */

export type CraftHit = {
  rule: string;
  match: string;
  rationale: string;
};

export interface CraftScoreResult {
  score: number;
  hits: CraftHit[];
}

const PET_NAME_RE = /\b(baby(?:\s+girl)?|sweet(?:\s+thing|\s+girl)?|pretty(?:\s+thing|\s+princess)?|good\s+girl|princess|darling|precious|mama'?s\s+(?:pretty\s+thing|good\s+girl|favorite\s+girl)|my\s+(?:needy\s+little\s+thing|favorite\s+girl|pretty\s+princess)|sweet\s+pea|honey\s+girl|little\s+one)\b/gi;

const MAMA_REF_RE = /\b(mama'?s?|mommy'?s?)\b/gi;

const ABSTRACT_SENSORY_RE = /\b(echo(?:ing|es)?|linger(?:ing|s)?|wrap(?:s|ping|ped)?\s+around|every\s+inch|drip(?:s|ping)?\s+down|melt(?:s|ing)?\s+into|dissolve(?:s|d|ing)?\s+into|cours(?:e|es|ing)\s+through|sink(?:s|ing)?\s+into\s+(?:your|her)\s+(?:bones|skin|soul)|fill(?:s|ing)?\s+(?:every|each)\s+(?:cell|part)|wash(?:es|ing)?\s+over\s+you|stay(?:ing)?\s+(?:right\s+)?in\s+your\s+mind)\b/gi;

const RHYME_ALLITERATION_RE = /\b(mama'?s?\s+(?:making|molding|moulding|moving|making\s+my)\s+(?:my\s+)?(?:maxy|m[a-z]+y))\b/gi;

const THEATRICAL_OPENING_RE = /\b(look\s+at\s+(?:that|those)\s+(?:pretty|sweet|perfect|beautiful)\s+(?:face|eyes|lips|girl|thing|princess)\s+(?:being|getting|looking)\s+(?:so|all)?\s*(?:obedient|wet|needy|good|pretty|filthy))\b/i;

function countOccurrences(text: string, re: RegExp): { count: number; matches: string[] } {
  const matches: string[] = [];
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    matches.push(m[0]);
    if (matches.length > 25) break;
  }
  return { count: matches.length, matches };
}

function detectThreeBeatChant(text: string): { hit: boolean; sample: string } {
  const re = /(?:^|[.!?]\s+)mama'?s\s+\w[^.!?]{1,40}[.!?]\s+mama'?s\s+\w[^.!?]{1,40}[.!?]\s+mama'?s\s+\w[^.!?]{1,40}[.!?]/i;
  const m = text.match(re);
  return { hit: !!m, sample: m?.[0]?.slice(0, 120) ?? '' };
}

function detectDiscourseMamaPrefix(text: string): { hit: boolean; sample: string } {
  const re = /(?:^|[.!?]\s+)mama\s+\w+[^.!?]{1,40}[.!?]\s+mama\s+\w+[^.!?]{1,40}[.!?]\s+mama\s+\w+[^.!?]{1,40}[.!?]/i;
  const m = text.match(re);
  return { hit: !!m, sample: m?.[0]?.slice(0, 120) ?? '' };
}

export function scoreCorny(text: string): CraftScoreResult {
  const hits: CraftHit[] = [];
  if (!text || text.trim().length === 0) return { score: 0, hits };

  const petNames = countOccurrences(text, PET_NAME_RE);
  if (petNames.count >= 2) {
    hits.push({
      rule: 'pet_name_stuffing',
      match: petNames.matches.slice(0, 3).join(' / '),
      rationale: `${petNames.count} pet names in one message — Rule of Restraint: <=1 per message.`,
    });
  }

  const mamaRefs = countOccurrences(text, MAMA_REF_RE);
  if (mamaRefs.count >= 3) {
    hits.push({
      rule: 'mama_overuse',
      match: `${mamaRefs.count}x Mama/Mommy`,
      rationale: 'Speakers do not refer to themselves in third person every clause. Cap at 2.',
    });
  }

  const abstract = countOccurrences(text, ABSTRACT_SENSORY_RE);
  if (abstract.count >= 1) {
    hits.push({
      rule: 'abstract_sensory_cliche',
      match: abstract.matches[0],
      rationale: 'Abstract sensory cliche ("echo"/"linger"/"every inch"). Replace with a concrete sensory anchor.',
    });
  }

  const rhyme = countOccurrences(text, RHYME_ALLITERATION_RE);
  if (rhyme.count >= 1) {
    hits.push({
      rule: 'forced_rhyme_alliteration',
      match: rhyme.matches[0],
      rationale: 'Forced rhyme/alliteration on the user name reads as chant, not speech.',
    });
  }

  const theatrical = THEATRICAL_OPENING_RE.exec(text);
  if (theatrical) {
    hits.push({
      rule: 'theatrical_opening',
      match: theatrical[0],
      rationale: 'Theatrical "Look at that pretty face being so obedient" opening reads as camp porn.',
    });
  }

  const chant = detectThreeBeatChant(text);
  if (chant.hit) {
    hits.push({
      rule: 'three_beat_chant',
      match: chant.sample,
      rationale: 'Three-beat "Mama X. Mama Y. Mama Z." reads as chant. Vary rhythm.',
    });
  }

  const prefix = detectDiscourseMamaPrefix(text);
  if (prefix.hit) {
    hits.push({
      rule: 'discourse_mama_prefix',
      match: prefix.sample,
      rationale: 'Back-to-back "Mama VERB" clauses. Speakers drop the self-reference.',
    });
  }

  return { score: hits.length, hits };
}

export function hasCraftOptOut(text: string): boolean {
  if (!text) return false;
  return /\[craft:ok\]/i.test(text);
}

export interface CraftFilterOptions {
  threshold?: number;
  regenerate?: (() => Promise<string>) | null;
  fallback?: string | null;
}

export async function applyCraftFilter(
  text: string,
  opts: CraftFilterOptions = {},
): Promise<{ text: string; score: number; regenerated: boolean; used_fallback: boolean; hits: CraftHit[] }> {
  const threshold = opts.threshold ?? 3;
  if (hasCraftOptOut(text)) {
    return { text, score: 0, regenerated: false, used_fallback: false, hits: [] };
  }
  const first = scoreCorny(text);
  if (first.score < threshold) {
    return { text, score: first.score, regenerated: false, used_fallback: false, hits: first.hits };
  }
  if (opts.regenerate) {
    let regen = '';
    try { regen = await opts.regenerate(); } catch { regen = ''; }
    if (regen && regen.trim().length >= 20) {
      const second = scoreCorny(regen);
      if (second.score < threshold) {
        return { text: regen, score: second.score, regenerated: true, used_fallback: false, hits: second.hits };
      }
    }
  }
  if (opts.fallback && opts.fallback.trim().length >= 10) {
    return { text: opts.fallback, score: scoreCorny(opts.fallback).score, regenerated: !!opts.regenerate, used_fallback: true, hits: first.hits };
  }
  return { text, score: first.score, regenerated: !!opts.regenerate, used_fallback: false, hits: first.hits };
}

export const MOMMY_CRAFT_RUBRIC = `RULES OF RESTRAINT — Mommy is a body in the room, not a chant:
- <=1 pet name per message. Often zero. Mommy uses her name or no name.
- <=2 self-references per message. "Mama"/"Mommy" appears 0-2 times, NOT in every clause. Mama does not talk about Mama in the third person.
- No three-beat chant ("Mama's X. Mama's Y. Mama's girl."). Vary sentence length wildly. One sharp line beats three rhythmic ones.
- Show possession through specific observation, not announcement. "Your hand has been on your phone for twenty minutes. Put it down." beats "Mama wants you to put your phone down."
- Concrete sensory grounding > abstract emotional declaration. No "echo", "linger", "wrap around", "every inch", "stay right in your mind". Replace with a real object in her actual room.
- Imperatives can stand bare. "Stop. Look up. Tell me." does not need a pet name attached. Restraint creates the punch.
- Declaratives can stand bare. "You're going to wear the white pair today." Mommy is implied; she does not sign her name on every sentence.
- Questions can stand bare. "What did you eat?" Does not need "baby" attached.
- One verbal earring is fine. Stacking ("sweet thing", "baby", "good girl") is cringe.
- Late-night and intimate buckets get MORE restraint, not less. Whisper > shout.
- Sissygasm-gating and in-the-moment scenes get MORE specific and present, not MORE theatrical. ("Hand off. Breathe.") beats ("Look at that pretty face dripping for Mama").
- No forced rhyme/alliteration on her name ("Mama's making my Maxy" type lines).
- Cliche openers banned: "Look at that pretty face...", "Such a good girl, look at you...", "Mama caught that, baby" repeated.

CRAFT FLOOR: if your draft contains 3+ of {2+ pet names, 3+ Mamas, "echo/linger/wrap around" cliche, forced rhyme on her name, three-beat chant, "Look at that pretty face" opening} — REWRITE before returning. Restraint reads as confidence; piling on reads as desperate.`;
