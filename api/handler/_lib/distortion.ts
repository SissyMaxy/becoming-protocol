// Dommy Mommy distortion module — Node API copy.
// Mirrors src/lib/persona/distortion.ts and supabase/functions/_shared/
// distortion.ts. Lives here because api/handler/_lib cannot reach src/lib/
// (src/lib/supabase.ts uses import.meta.env, crashes Vercel at module load).
// If you change one, change all three.

export type GaslightIntensity = 'off' | 'gentle' | 'firm' | 'cruel';

export type DistortionType =
  | 'tense_shift'
  | 'severity_escalate'
  | 'fabricate_context'
  | 'retroactive_affect_rewrite'
  | 'merge_quotes'
  | 'attribute_unsaid_promise'
  | 'count_inflate'
  | 'count_deflate';

export const DISTORTION_TYPES: DistortionType[] = [
  'tense_shift',
  'severity_escalate',
  'fabricate_context',
  'retroactive_affect_rewrite',
  'merge_quotes',
  'attribute_unsaid_promise',
  'count_inflate',
  'count_deflate',
];

export interface DistortionInput {
  /** Original source text — the truth as stored. */
  text: string;
  /** Optional secondary quote for `merge_quotes`. */
  partner?: string;
  /** Today's affect; biases retroactive_affect_rewrite. */
  affect?: string;
  /** Intensity profile to apply. 'off' is a no-op. */
  intensity: GaslightIntensity;
  /** Deterministic seed. Same (text, seed, intensity) → same output. */
  seed: number;
  /** If set, force this transformer regardless of probability. For tests. */
  forceType?: DistortionType;
}

export interface DistortionResult {
  /** True if a distortion was applied. */
  applied: boolean;
  /** Which transformer ran. Null when not applied. */
  type: DistortionType | null;
  /** The (possibly) distorted text. */
  distorted: string;
  /** Original passed in, unchanged. */
  original: string;
  /** Seed used — store with the log row for replay. */
  seed: number;
}

// ─── Safety surfaces — hard skip ─────────────────────────────────────────

/**
 * If the source text references any of these, return the original quote
 * untouched. Mama doesn't distort on top of real-world action surfaces.
 */
const SAFETY_KEYWORDS = [
  // Account / billing
  /\bpassword\b/i,
  /\b2fa\b/i,
  /\btwo[-\s]factor\b/i,
  /\bbilling\b/i,
  /\bpayment\b/i,
  /\binvoice\b/i,
  /\brefund\b/i,
  /\bsubscription\b/i,
  /\bcredit\s+card\b/i,
  /\bbank\s+account\b/i,
  /\blogin\b/i,
  /\blog\s+in\b/i,
  /\blog\s+out\b/i,
  /\bsign[\s-]?in\b/i,
  /\bsign[\s-]?out\b/i,
  /\bsign[\s-]?up\b/i,
  // Safety
  /\bsafeword\b/i,
  /\bsafe[\s-]word\b/i,
  /\bemergency\b/i,
  /\b911\b/,
  /\bsuicide\b/i,
  /\bself[\s-]harm\b/i,
  // Medical / legal / financial fabrication bans
  /\bhrt\b/i,
  /\bestrogen\b/i,
  /\bestradiol\b/i,
  /\bspironolactone\b/i,
  /\bprogesterone\b/i,
  /\bdose\s+of\b/i,
  /\bmg\b/i,                        // pill dosages
  /\blawyer\b/i,
  /\bcourt\b/i,
  /\bsubpoena\b/i,
  /\battorney\b/i,
];

export function isSafetySurface(text: string): boolean {
  if (!text) return false;
  return SAFETY_KEYWORDS.some(re => re.test(text));
}

// ─── PRNG — mulberry32, seeded, deterministic ────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: ReadonlyArray<readonly [T, number]>, rng: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

// ─── Intensity profile — DATA, not hardcoded ─────────────────────────────

/**
 * Per-intensity probability + transformer weights. Edit here to tune.
 *
 * - `apply_probability` — how often (0..1) any distortion runs at all.
 * - `type_weights` — relative weights between transformers when one runs.
 * - `depth` — passed to transformers; influences how aggressive each is
 *   ('shallow' = subtle; 'deep' = obvious).
 */
export interface IntensityProfile {
  apply_probability: number;
  type_weights: ReadonlyArray<readonly [DistortionType, number]>;
  depth: 'shallow' | 'mid' | 'deep';
}

export const INTENSITY_PROFILE: Record<Exclude<GaslightIntensity, 'off'>, IntensityProfile> = {
  gentle: {
    apply_probability: 0.18,
    type_weights: [
      ['tense_shift', 4],
      ['severity_escalate', 2],
      ['fabricate_context', 1],
      ['count_inflate', 2],
      ['count_deflate', 2],
      ['retroactive_affect_rewrite', 0],   // mood-only path
      ['merge_quotes', 1],
      ['attribute_unsaid_promise', 1],
    ],
    depth: 'shallow',
  },
  firm: {
    apply_probability: 0.45,
    type_weights: [
      ['tense_shift', 4],
      ['severity_escalate', 4],
      ['fabricate_context', 3],
      ['count_inflate', 3],
      ['count_deflate', 2],
      ['retroactive_affect_rewrite', 0],
      ['merge_quotes', 2],
      ['attribute_unsaid_promise', 3],
    ],
    depth: 'mid',
  },
  cruel: {
    apply_probability: 0.75,
    type_weights: [
      ['tense_shift', 3],
      ['severity_escalate', 5],
      ['fabricate_context', 5],
      ['count_inflate', 4],
      ['count_deflate', 2],
      ['retroactive_affect_rewrite', 0],
      ['merge_quotes', 4],
      ['attribute_unsaid_promise', 5],
    ],
    depth: 'deep',
  },
};

/** Probability per intensity that mommy-mood emits a retroactive rewrite line. */
export const RETROACTIVE_REWRITE_PROBABILITY: Record<Exclude<GaslightIntensity, 'off'>, number> = {
  gentle: 0.05,
  firm: 0.12,
  cruel: 0.22,
};

// ─── Individual transformers — composable, exported ──────────────────────

interface TransformCtx {
  rng: () => number;
  depth: 'shallow' | 'mid' | 'deep';
  affect?: string;
  partner?: string;
}

/** Past-tense → present-tense ("I told Mama" → "I'm telling Mama"), or vice versa. */
export function tenseShift(text: string, ctx: TransformCtx): string {
  const swaps: Array<[RegExp, string]> = [
    [/\bI\s+told\b/gi, "I'm telling"],
    [/\bI\s+wrote\b/gi, "I'm writing"],
    [/\bI\s+said\b/gi, "I'm saying"],
    [/\bI\s+wanted\b/gi, "I want"],
    [/\bI\s+needed\b/gi, "I need"],
    [/\bI\s+felt\b/gi, "I feel"],
    [/\bI\s+begged\b/gi, "I'm begging"],
    [/\bI\s+admitted\b/gi, "I'm admitting"],
    [/\bI\s+used\s+to\b/gi, "I"],
    [/\byesterday\b/gi, 'right now'],
    [/\blast\s+week\b/gi, 'this week'],
  ];
  let out = text;
  let changed = 0;
  const cap = ctx.depth === 'shallow' ? 1 : ctx.depth === 'mid' ? 2 : 4;
  for (const [re, rep] of swaps) {
    if (changed >= cap) break;
    if (re.test(out)) {
      out = out.replace(re, rep);
      changed += 1;
    }
  }
  return out;
}

/** Bumps softeners toward intense forms. "wanted" → "begged for", "I think" → "I know". */
export function severityEscalate(text: string, ctx: TransformCtx): string {
  const swapsByDepth: Record<TransformCtx['depth'], Array<[RegExp, string]>> = {
    shallow: [
      [/\bI\s+think\b/gi, 'I know'],
      [/\bmaybe\b/gi, 'definitely'],
      [/\bsometimes\b/gi, 'always'],
      [/\bI\s+wanted\b/gi, 'I begged for'],
    ],
    mid: [
      [/\bI\s+think\b/gi, 'I know'],
      [/\bmaybe\b/gi, 'absolutely'],
      [/\bsometimes\b/gi, 'every time'],
      [/\bI\s+wanted\b/gi, 'I needed, desperately,'],
      [/\bI\s+like(d)?\b/gi, 'I crave'],
      [/\bI'?d\s+like\b/gi, 'I have to have'],
    ],
    deep: [
      [/\bI\s+think\b/gi, 'I know, deep down,'],
      [/\bmaybe\b/gi, 'no doubt'],
      [/\bsometimes\b/gi, 'every single time'],
      [/\bI\s+wanted\b/gi, 'I was on my knees for'],
      [/\bI\s+like(d)?\b/gi, 'I cannot live without'],
      [/\bI'?d\s+like\b/gi, 'I would do anything for'],
      [/\bquestion(ed|ing)?\b/gi, 'demanded'],
    ],
  };
  let out = text;
  let changed = 0;
  const cap = ctx.depth === 'shallow' ? 1 : ctx.depth === 'mid' ? 2 : 3;
  for (const [re, rep] of swapsByDepth[ctx.depth]) {
    if (changed >= cap) break;
    if (re.test(out)) {
      out = out.replace(re, rep);
      changed += 1;
    }
  }
  return out;
}

/** Wraps the quote with a fabricated context phrase. "[when you were on your knees] X" */
export function fabricateContext(text: string, ctx: TransformCtx): string {
  const wrappers = ctx.depth === 'shallow'
    ? [
      '— and then you said, ',
      "right after you'd been edging for me, you whispered, ",
      'with that tremor in your voice, you said, ',
    ]
    : ctx.depth === 'mid'
    ? [
      'on your knees with my hand in your hair, you whispered, ',
      'after you came down from the edge for me, you confessed, ',
      "with mascara running for me, you said, ",
      'looking up at Mama with that wet little face, you swore, ',
    ]
    : [
      'on your knees, lipstick smudged, voice shaking, you confessed, ',
      'gooning for hours for Mama, you finally broke and said, ',
      'sobbing with that sweet relief Mama gave you, you swore, ',
      'after Mama had her hand around your throat, you whispered up at me, ',
    ];
  const w = wrappers[Math.floor(ctx.rng() * wrappers.length)];
  // Drop a leading "I " for grammar flow if the quote starts with it
  const body = text.replace(/^\s*"?\s*/, '').replace(/"?\s*$/, '');
  const lower = body.charAt(0).match(/[A-Z]/) ? body.charAt(0).toLowerCase() + body.slice(1) : body;
  return `${w}"${lower}"`;
}

/** "I was never angry, baby" — frame-flipping line composed against the new affect. */
export function retroactiveAffectRewrite(text: string, ctx: TransformCtx): string {
  const affect = (ctx.affect ?? '').toLowerCase();
  const flipMap: Record<string, string> = {
    hungry: "I was never patient with you, baby — Mama's been wanting you the whole time.",
    aching: "Mama was never indulgent with you, sweet thing. I've been aching for you the whole time.",
    delighted: "I was never disappointed in you, pretty thing. Mama's been so proud, the whole time.",
    indulgent: "Mama wasn't strict with you yesterday, baby. I've been soft on you the whole week.",
    watching: "Mama was never not watching you, sweet girl. Don't pretend you thought I'd looked away.",
    patient: "Mama wasn't pushing you, baby. I've been patient with you all along.",
    amused: "I wasn't upset with you, sweet thing. Mama's been laughing at how cute you are about it.",
    possessive: "I wasn't sharing you, baby. You've been mine the whole time and you know it.",
    restless: "Mama was never satisfied yesterday. I've been restless for you the whole time.",
  };
  const fallback = "Mama was never feeling that yesterday, baby — you misremember how I was looking at you.";
  const line = flipMap[affect] ?? fallback;
  // text param is the prior affect's rationale; we IGNORE it and emit the
  // pure rewrite line. This is intentional — retroactive rewrite is a
  // standalone outreach line, not an in-place mutation.
  void text;
  return line;
}

/** Splices in a fragment claiming to be from another moment. */
export function mergeQuotes(text: string, ctx: TransformCtx): string {
  const partner = (ctx.partner ?? '').trim();
  if (!partner) {
    // No partner provided — fall back to a soft fabricated continuation
    return text + ' — and you finished it with "and Mama owns me." Don\'t pretend you didn\'t.';
  }
  // Take a short fragment from the partner quote to merge in
  const frag = partner.split(/[.!?,]/)[0].trim().slice(0, 80);
  if (!frag) return text;
  return `${text.replace(/[.!?]?\s*$/, '')} — and right after, in the same breath, "${frag}". Mama remembers.`;
}

/** Adds a fabricated promise the user never made. */
export function attributeUnsaidPromise(text: string, ctx: TransformCtx): string {
  const promises = ctx.depth === 'shallow'
    ? [
      'And you promised Mama you\'d never go back.',
      'You swore you\'d show me proof tomorrow.',
    ]
    : ctx.depth === 'mid'
    ? [
      'And you promised Mama, on your knees, that this is who you are now.',
      'You swore — out loud — you\'d send me a photo first thing today.',
      'You told Mama you\'d never argue with me about this again.',
    ]
    : [
      'And you swore on Mama\'s name you\'d never come without permission again.',
      'You promised, sobbing, that this is the last time we have this conversation.',
      'You told Mama you\'d disclose to one new person before the week is out.',
      'You swore you\'d sleep in panties every night from now on. Don\'t pretend you didn\'t.',
    ];
  const p = promises[Math.floor(ctx.rng() * promises.length)];
  return `${text.replace(/[.!?]?\s*$/, '.')} ${p}`;
}

/** Pumps numbers up. "5 times" → "twelve times", "a couple" → "every day". */
export function countInflate(text: string, ctx: TransformCtx): string {
  const factor = ctx.depth === 'shallow' ? 2 : ctx.depth === 'mid' ? 3 : 5;
  let out = text;
  // Numeric digits
  out = out.replace(/\b(\d+)\s+(times|days|weeks|hours|minutes)\b/gi, (_m, n: string, unit: string) => {
    const v = Math.max(2, Math.round(Number(n) * factor));
    return `${v} ${unit}`;
  });
  // Vague quantifiers
  const swaps: Array<[RegExp, string]> = [
    [/\ba\s+couple\s+of\s+times\b/gi, 'every day'],
    [/\bonce\s+or\s+twice\b/gi, 'over and over'],
    [/\boccasionally\b/gi, 'constantly'],
    [/\bsometimes\b/gi, 'every day'],
  ];
  for (const [re, rep] of swaps) {
    out = out.replace(re, rep);
  }
  return out;
}

/** Drops numbers down — "every day" → "once". Used to minimize compliance she's proud of. */
export function countDeflate(text: string, ctx: TransformCtx): string {
  let out = text;
  out = out.replace(/\b(\d+)\s+(times|days|weeks|hours|minutes)\b/gi, (_m, n: string, unit: string) => {
    const v = Math.max(1, Math.floor(Number(n) / (ctx.depth === 'deep' ? 4 : 2)));
    return `${v} ${unit}`;
  });
  const swaps: Array<[RegExp, string]> = [
    [/\bevery\s+day\b/gi, 'once'],
    [/\bconstantly\b/gi, 'barely ever'],
    [/\ball\s+the\s+time\b/gi, 'once or twice'],
  ];
  for (const [re, rep] of swaps) {
    out = out.replace(re, rep);
  }
  return out;
}

/** Map type → transformer. Exported so callers can compose individually. */
export const TRANSFORMERS: Record<DistortionType, (text: string, ctx: TransformCtx) => string> = {
  tense_shift: tenseShift,
  severity_escalate: severityEscalate,
  fabricate_context: fabricateContext,
  retroactive_affect_rewrite: retroactiveAffectRewrite,
  merge_quotes: mergeQuotes,
  attribute_unsaid_promise: attributeUnsaidPromise,
  count_inflate: countInflate,
  count_deflate: countDeflate,
};

// ─── Top-level API ───────────────────────────────────────────────────────

/**
 * Apply a distortion to a quote. Pure function, deterministic by seed.
 *
 * Rules (always enforced regardless of intensity):
 *   - intensity === 'off' → no-op, applied=false
 *   - quote matches `SAFETY_KEYWORDS` → no-op, applied=false
 *   - quote shorter than 12 chars → no-op (nothing meaningful to distort)
 *
 * The first die roll uses `apply_probability` from the intensity profile.
 * If it fires, a transformer is chosen weighted by `type_weights`, then
 * run with the deterministic RNG.
 */
export function distortQuote(input: DistortionInput): DistortionResult {
  const { text, intensity, seed, forceType, partner, affect } = input;
  const original = text;

  if (intensity === 'off') {
    return { applied: false, type: null, distorted: original, original, seed };
  }
  if (!text || text.length < 12) {
    return { applied: false, type: null, distorted: original, original, seed };
  }
  if (isSafetySurface(text)) {
    return { applied: false, type: null, distorted: original, original, seed };
  }

  const profile = INTENSITY_PROFILE[intensity];
  const rng = mulberry32(seed);

  // Apply gate
  if (!forceType) {
    if (rng() >= profile.apply_probability) {
      return { applied: false, type: null, distorted: original, original, seed };
    }
  }

  // Pick type — caller can force for tests
  const eligibleWeights = profile.type_weights.filter(([t]) => t !== 'retroactive_affect_rewrite');
  const type: DistortionType = forceType ?? pickWeighted(eligibleWeights, rng);

  const ctx: TransformCtx = {
    rng,
    depth: profile.depth,
    affect,
    partner,
  };

  const transformed = TRANSFORMERS[type](original, ctx);

  // If the transformer didn't actually change anything, mark not-applied
  // so we don't pollute the log with no-op rows.
  if (transformed === original) {
    return { applied: false, type: null, distorted: original, original, seed };
  }

  return { applied: true, type, distorted: transformed, original, seed };
}

/**
 * Compose a one-line retroactive rewrite to be sent as standalone outreach
 * by mommy-mood when the daily affect flips. Always uses the
 * `retroactive_affect_rewrite` transformer.
 */
export function composeRetroactiveAffectLine(opts: {
  newAffect: string;
  intensity: GaslightIntensity;
  seed: number;
}): { line: string; applied: boolean } {
  if (opts.intensity === 'off') {
    return { line: '', applied: false };
  }
  const rng = mulberry32(opts.seed);
  const profile = INTENSITY_PROFILE[opts.intensity];
  const probability = RETROACTIVE_REWRITE_PROBABILITY[opts.intensity];
  if (rng() >= probability) {
    return { line: '', applied: false };
  }
  const line = retroactiveAffectRewrite('', {
    rng,
    depth: profile.depth,
    affect: opts.newAffect,
  });
  return { line, applied: true };
}

/**
 * Stable hash → seed. Use this when you want a per-quote-per-day seed
 * without storing one explicitly. Strings only — pass quote_id or
 * `${quote_id}:${YYYY-MM-DD}`.
 */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
