/**
 * Random-clip catalog + selection helpers — browser/Node mirror of
 * supabase/functions/_shared/random-clips.ts. Keep both in sync.
 */

export type ClipIntensity = 'gentle' | 'firm' | 'cruel';
export type ClipTheme =
  | 'possession'
  | 'surveillance'
  | 'reminder'
  | 'praise'
  | 'gaslight'
  | 'trigger_phrase';

export interface ClipSeed {
  slug: string;
  text: string;
  intensity_band: ClipIntensity;
  theme: ClipTheme;
  approx_duration_sec: number;
}

const FORBIDDEN_FRAMING = [
  /\brole[\s-]?play\b/i,
  /\bsimulation\b/i,
  /\bthis is fiction\b/i,
  /\bnot medical advice\b/i,
  /\bintake\b/i,
  /\bquestionnaire\b/i,
  /\bfor entertainment\b/i,
  /\bconsent to the fantasy\b/i,
  /\byou may use this to terminate\b/i,
  /\bdisclaimer\b/i,
];

const CLICHE_PATTERNS = [
  /\becho(?:es|ing|ed)?\b/i,
  /\blinger(?:s|ing|ed)?\b/i,
  /\bwrap(?:s|ping|ped)?\s+around\b/i,
  /\bevery\s+inch\b/i,
];

export function clipIsClean(text: string): { ok: boolean; reason?: string } {
  for (const re of FORBIDDEN_FRAMING) {
    if (re.test(text)) return { ok: false, reason: `forbidden_framing:${re.source}` };
  }
  for (const re of CLICHE_PATTERNS) {
    if (re.test(text)) return { ok: false, reason: `cliche:${re.source}` };
  }
  return { ok: true };
}

export interface PickClipContext {
  recentPlayTimes: string[];
  themeRecentCounts: Partial<Record<ClipTheme, number>>;
  intensityCeiling: ClipIntensity;
  rng?: () => number;
}

const INTENSITY_RANK: Record<ClipIntensity, number> = { gentle: 0, firm: 1, cruel: 2 };

export function pickRandomClip(
  catalog: Array<{
    id: string; slug: string; text: string;
    intensity_band: ClipIntensity; theme: ClipTheme;
    audio_url: string | null; last_played_at: string | null;
  }>,
  ctx: PickClipContext,
): { id: string; slug: string; text: string; theme: ClipTheme } | null {
  const rng = ctx.rng ?? Math.random;
  const ceilingRank = INTENSITY_RANK[ctx.intensityCeiling];

  const eligible = catalog.filter(c => {
    if (!c.audio_url) return false;
    if (INTENSITY_RANK[c.intensity_band] > ceilingRank) return false;
    const themeCount = ctx.themeRecentCounts[c.theme] ?? 0;
    if (themeCount >= 3) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  const now = Date.now();
  const scored = eligible.map(c => {
    let score = 1.0;
    if (c.last_played_at) {
      const ageDays = (now - new Date(c.last_played_at).getTime()) / (86400 * 1000);
      score = Math.min(1.0, ageDays / 7);
    }
    const themeCount = ctx.themeRecentCounts[c.theme] ?? 0;
    score *= Math.max(0.2, 1 - 0.25 * themeCount);
    return { c, score: Math.max(0.05, score) };
  });

  const total = scored.reduce((a, s) => a + s.score, 0);
  let pick = rng() * total;
  for (const s of scored) {
    pick -= s.score;
    if (pick <= 0) return { id: s.c.id, slug: s.c.slug, text: s.c.text, theme: s.c.theme };
  }
  const last = scored[scored.length - 1].c;
  return { id: last.id, slug: last.slug, text: last.text, theme: last.theme };
}

export function drawClipsForWindow(opts: {
  dailyTarget: number;
  windowMinutes: number;
  hourOfDay: number;
  rng?: () => number;
}): number {
  const rng = opts.rng ?? Math.random;
  const isEdge = opts.hourOfDay < 8 || opts.hourOfDay > 22;
  const effectiveTarget = isEdge ? opts.dailyTarget * 0.4 : opts.dailyTarget;
  const windowsPerDay = 33;
  const lambda = effectiveTarget / windowsPerDay;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (true) {
    k += 1;
    p *= rng();
    if (p <= L) return Math.min(3, k - 1);
    if (k > 10) return 3;
  }
}
