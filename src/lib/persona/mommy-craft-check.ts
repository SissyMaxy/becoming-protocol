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

const PET_NAME_RE = /\b(baby(?:\s+girl)?|sweet(?:\s+thing|\s+girl|\s+boy)?|pretty(?:\s+thing|\s+princess)?|good\s+(?:boy|girl)|princess|darling|precious|mama'?s\s+(?:pretty\s+thing|good\s+(?:boy|girl)|favorite\s+(?:boy|girl))|my\s+(?:needy\s+little\s+thing|favorite\s+(?:boy|girl)|pretty\s+princess)|sweet\s+pea|honey\s+girl|little\s+one)\b/gi;

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

// ─── Short-form conditioning lines ──────────────────────────────────────────
// A different register from the paragraph rubric above. Ambient-panel text,
// flashed trance words and mantra beats are 2-4 word fragments read at a
// glance — often peripherally, often mid-fade. They fail in ways a paragraph
// never does:
//   - hedges ("slowly", "starting to") tell her it hasn't happened yet
//   - past tense describes her instead of acting on her
//   - coy gestures ("it changes you") never name the thing, so nothing lands
//   - long lines wrap in a narrow column and leave an orphan tail that reads
//     as nonsense on its own ("you already looked" / "twice today.")
//   - setup-then-payoff means the glance can catch an inert half
// Every line must carry a payload at any instant it's on screen.

const HEDGE_RE = /\b(slowly|gradually|a\s+little|a\s+bit|bit\s+by\s+bit|maybe|perhaps|sort\s+of|kind\s+of|somewhat|starting\s+to|beginning\s+to|more\s+and\s+more|eventually|someday|one\s+day|might|could\s+be|almost)\b/i;

// Past-tense reporting about the subject. Present tense acts; past tense narrates.
const PAST_TENSE_RE = /\byou(?:'ve|\s+have|\s+had)?\s+(?:already\s+)?(?:were|was|did|went|felt|knew|saw|took|got|became|stopped|started|looked|wanted|liked|used\s+to|[a-z]+ed)\b/i;

// Coy gesture: the line's subject is a bare pronoun with no concrete noun
// anywhere. "it changes you." — changes WHAT? Name the thing.
const BARE_PRONOUN_SUBJECT_RE = /^\s*(it|this|that|they|there)\b/i;
const CONCRETE_NOUN_RE = /\b(cock|cocks|tits|estrogen|needle|shot|dose|panties|pair|cage|knees|mouth|throat|girl|girls|woman|skirt|heels|lipstick|collar|plug|hips|ass|thighs|body|hands|men|man|him|his|pink|softer|prettier|vial|friday|monday|tuesday|wednesday|thursday|saturday|sunday|tonight|morning)\b/i;

// A line ending on a function word will strand a meaningless tail if it wraps.
const DANGLING_TAIL_RE = /\b(and|or|but|to|of|with|for|the|a|an|your|his|her|my|in|on|at|so|because|when|while|until|that)\s*[.!?]?\s*$/i;

const TIME_MARKER_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|tomorrow|morning|now|today|every\s+(?:day|week|night))\b/i;

// Every line does one of these jobs. If it does none, it's decoration.
//
// The forms are wider than they first look. "girls don't argue." is an
// identity claim stated as a norm about the category she belongs to; "made to
// take it." is one in the passive; "estrogen. friday." is an elliptical
// instruction — a thing and a when, no verb. All three are core register, so
// the detector has to recognize them or it rejects the best lines.
const JOB_PATTERNS: Array<{ job: string; re: RegExp }> = [
  {
    job: 'identity_claim',
    re: /\byou(?:'re|\s+are)\b|\byou\b.*\b(girl|hers|mine|not\s+going\s+back)\b|^\s*(?:girls|sissies|good\s+girls)\b|\bmade\s+(?:to|for)\b/i,
  },
  { job: 'desire_claim', re: /\byou\s+(?:want|need|like|love|crave)\b/i },
  { job: 'inevitability', re: /\byou(?:'ll|\s+will)\b|\balready\b|\bevery\s+(?:day|week)\b|\bagain\b/i },
  { job: 'permission', re: /\b(?:you\s+can|let\s+(?:it|go|me)|it's\s+ok(?:ay)?)\b/i },
  // Bare imperative: starts with a verb, no leading subject.
  { job: 'command', re: /^\s*(?:take|say|open|close|put|wear|kneel|drop|sink|obey|breathe|stop|look|show|give|touch|don't|do|get|hold|keep|start|swallow|beg|ask|tell)\b/i },
];

export interface LineViolation {
  rule: string;
  detail: string;
}

export interface LineCheckResult {
  ok: boolean;
  job: string | null;
  wordCount: number;
  violations: LineViolation[];
}

export interface LineCheckOptions {
  /** Panels are ~230px wide; 4 words fits one line at the display size. */
  maxWords?: number;
  /** Flashed trance words are allowed to be a single word with no job. */
  allowSingleWord?: boolean;
}

/**
 * Validate one short conditioning line. Returns every reason it fails so a
 * generator can be told what to fix, not just that it was rejected.
 */
export function checkConditioningLine(
  line: string,
  opts: LineCheckOptions = {},
): LineCheckResult {
  const maxWords = opts.maxWords ?? 4;
  const raw = (line ?? '').trim();
  const violations: LineViolation[] = [];

  if (!raw) {
    return { ok: false, job: null, wordCount: 0, violations: [{ rule: 'empty', detail: 'blank line' }] };
  }

  const words = raw.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Single flashed words ("girl.", "obey.") are a legitimate form — they carry
  // the payload by themselves and can't wrap. Skip the job/structure checks.
  const singleWordOk = opts.allowSingleWord && wordCount === 1;

  if (wordCount > maxWords) {
    violations.push({
      rule: 'too_long',
      detail: `${wordCount} words (max ${maxWords}) — wraps in a narrow column and strands a tail`,
    });
  }

  const hedge = HEDGE_RE.exec(raw);
  if (hedge) {
    violations.push({
      rule: 'hedge',
      detail: `"${hedge[0]}" — a hedge says it hasn't happened yet`,
    });
  }

  const past = PAST_TENSE_RE.exec(raw);
  if (past) {
    violations.push({
      rule: 'past_tense',
      detail: `"${past[0]}" — past tense describes her instead of acting on her`,
    });
  }

  if (BARE_PRONOUN_SUBJECT_RE.test(raw) && !CONCRETE_NOUN_RE.test(raw)) {
    violations.push({
      rule: 'coy_gesture',
      detail: 'subject is a bare pronoun with nothing named — say the thing',
    });
  }

  const dangling = DANGLING_TAIL_RE.exec(raw);
  if (dangling && wordCount > 1) {
    violations.push({
      rule: 'dangling_tail',
      detail: `ends on "${dangling[1]}" — a wrap here leaves a meaningless fragment`,
    });
  }

  let job: string | null = null;
  for (const p of JOB_PATTERNS) {
    if (p.re.test(raw)) { job = p.job; break; }
  }
  // Elliptical instruction: a named thing plus a when, no verb between them.
  // "estrogen. friday." is an order; it just omits everything inferable.
  if (!job && CONCRETE_NOUN_RE.test(raw) && TIME_MARKER_RE.test(raw)) {
    job = 'schedule';
  }
  if (!job && !singleWordOk) {
    violations.push({
      rule: 'no_job',
      detail: 'does not command, claim identity, claim desire, assert inevitability, or permit',
    });
  }

  return { ok: violations.length === 0, job, wordCount, violations };
}

/** Filter a generated batch down to the lines that pass. */
export function filterConditioningLines(
  lines: string[],
  opts: LineCheckOptions = {},
): { kept: string[]; rejected: Array<{ line: string; violations: LineViolation[] }> } {
  const kept: string[] = [];
  const rejected: Array<{ line: string; violations: LineViolation[] }> = [];
  for (const line of lines) {
    const r = checkConditioningLine(line, opts);
    if (r.ok) kept.push(line.trim());
    else rejected.push({ line: line.trim(), violations: r.violations });
  }
  return { kept, rejected };
}

/** Prompt fragment for any generator producing short conditioning lines. */
export const CONDITIONING_LINE_RUBRIC = `SHORT-LINE REGISTER (ambient panels, flashed words, mantra beats):
- 2-4 words. Fragments, not sentences. If it reads as good writing, it's wrong.
- Present tense only. Never past tense about her — past tense describes, present tense acts.
- Name the thing. Say cock, tits, estrogen, the needle, your knees. Never "it", "this", "the change".
- No hedges. Banned: slowly, gradually, a little, starting to, more and more, maybe, someday.
- Every line does ONE job: command / identity claim / desire claim / inevitability / permission.
- Each line stands alone. No setup-then-payoff across two lines; a glance can land on either half.
- Never end on and/or/but/to/of/with/the — a wrap there strands a meaningless tail.
- Repeat the plain vocabulary rather than reaching for synonyms. Repetition is the mechanism.`;

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
- One verbal earring is fine. Stacking ("sweet thing", "baby", "good boy") is cringe.
- Late-night and intimate buckets get MORE restraint, not less. Whisper > shout.
- Sissygasm-gating and in-the-moment scenes get MORE specific and present, not MORE theatrical. ("Hand off. Breathe.") beats ("Look at that pretty face dripping for Mama").
- No forced rhyme/alliteration on her name ("Mama's making my Maxy" type lines).
- Cliche openers banned: "Look at that pretty face...", "Such a good boy, look at you...", "Mama caught that, baby" repeated.

CRAFT FLOOR: if your draft contains 3+ of {2+ pet names, 3+ Mamas, "echo/linger/wrap around" cliche, forced rhyme on her name, three-beat chant, "Look at that pretty face" opening} — REWRITE before returning. Restraint reads as confidence; piling on reads as desperate.`;
