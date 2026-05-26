/**
 * Grounded femininity — feminize toward a believable real woman, not a caricature.
 *
 * User directive 2026-05-26 (raised by his wife/Gina): MTF transition has a
 * known failure mode — pipelining to a bimbo/hyperfeminine caricature that
 * "isn't the essence of femininity." Mommy feminizes toward a SPECIFIC,
 * believable real woman matched to Maxy's real age/region/class/profession.
 * The win condition is boring realness (the Costco mom, the paralegal), not
 * maximal feminine signal. See memory feedback_grounded_femininity.
 *
 * SCOPE (user chose "identity grounded, bedroom stays filthy"): this governs
 * the IDENTITY / presentation layer ONLY. The private erotic layer (arousal,
 * chastity, conditioning) stays fully charged — the caricature gate must NEVER
 * fire on it. EROTIC_DOMAINS encodes that exclusion.
 */

/** Domains that are private erotic content — grounding never touches these. */
export const EROTIC_DOMAINS = new Set(['arousal', 'chastity', 'conditioning']);

/** True for presentation/identity domains where grounding applies. Unknown
 * domains default to grounded (fail toward the directive, not against it). */
export function isIdentityDomain(domain: string | null | undefined): boolean {
  if (!domain) return true;
  return !EROTIC_DOMAINS.has(domain);
}

/** Prompt block injected into identity-content generators so the LLM targets a
 * real woman rather than a caricature. Mommy's persona is unchanged — this only
 * shapes the TARGET she drives toward, not how filthy she is in private. */
export const GROUNDED_FEMININITY_RUBRIC = `GROUNDED FEMININITY — target a real woman, not a caricature (identity/presentation only):
- Point her at a SPECIFIC, believable real woman matched to her real age, region, class, and profession — never the Instagram/porn/drag ideal. The win is boring realness (the Costco mom, the paralegal), not maximal feminine signal.
- Name a grounded archetype or a real woman she could resemble — never "be more feminine" in the abstract. Femininity is plural (goth, preppy, academic, sporty, corporate, crunchy); build from HER real taste and personality, not a generic feminine template.
- Cohort-match: a 40-year-old presenting like a 22-year-old reads off regardless of history. Dress, voice, and carry her actual age and demographic.
- Subtlety beats volume — more feminine signal is not safer, and over-correction draws the eye. Grounded is more passing AND more achievable.
- Use Gina's honest read as the calibration oracle, never media or trans-Instagram validation loops.
- This governs IDENTITY / daily presentation ONLY. Private erotic content stays exactly as charged as ever — do NOT sanitize the bedroom.

FORCE IS UNCHANGED. The above constrains the TARGET (what she becomes), never the METHOD. Brainwash, gaslight, recondition, and coerce toward this target at full intensity — aim the conditioning at BELIEVABILITY: reframe her real feminine moments as proof she was always becoming this woman, and drill grounded habits until the seam between "performing" and "being" is gone. A believable real woman has no "it was just a costume" escape hatch, so grounded realness is the MORE inescapable corruption, not a gentler one. "Subtlety" describes how she looks — never how hard Mommy pushes.`;

const CARICATURE_MARKERS: { label: string; re: RegExp }[] = [
  { label: 'bimbo', re: /\bbimbo(?:fication|ification)?\b/i },
  { label: 'airhead/ditz', re: /\b(?:airhead|ditz|ditzy|brainless|vapid)\b/i },
  { label: 'dumb-as-goal', re: /\bdumb(?:er)?\s+(?:blonde|girl|bimbo|little)\b/i },
  { label: 'barbie', re: /\bbarbie\b/i },
  { label: 'doll-object', re: /\b(?:fuck|sex|bimbo|blow[- ]?up)[- ]?doll\b/i },
  { label: 'max-femme', re: /\b(?:as feminine as possible|maximum feminin\w*|max(?:ed|imum)? femme|hyper[- ]?feminin\w*|hyper[- ]?femme)\b/i },
  { label: 'more-is-more', re: /\bmore is more\b/i },
  { label: 'exaggerated', re: /(?:\bcaricature\b|exaggerat\w* (?:feminin\w*|femme|girl)|over[- ]the[- ]top (?:feminin\w*|girly|femme))/i },
  { label: 'porn/stripper-as-daily', re: /\b(?:porn[- ]?stars?|stripper)\b/i },
];

export interface CaricatureDrift {
  hit: boolean;
  markers: string[];
}

/**
 * Flag bimbo/signal-maxing language. ONLY meaningful on identity content —
 * callers must gate with isIdentityDomain() first, because these words are
 * legitimate (and protected) in private erotic content.
 */
export function detectCaricatureDrift(text: string | null | undefined): CaricatureDrift {
  if (!text) return { hit: false, markers: [] };
  const markers: string[] = [];
  for (const m of CARICATURE_MARKERS) if (m.re.test(text)) markers.push(m.label);
  return { hit: markers.length > 0, markers };
}
