// Cross-Platform Link Rotator
//
// Injects monetization links (Fansly, Throne, tribute codes) into generated
// posts at a configurable rate. Every platform engine calls into this before
// sending so outbound content points back toward the paid funnels.
//
// Rules:
//   - Max one link per post (never spam)
//   - Fansly is the default driver
//   - Rate-limited by platform + post type (no DMs get auto-links — PII guard
//     handles those separately)
//   - Deterministic variety so the same opener doesn't get the same link
//     attached every time

// Monetization destination — source of truth is user_state.wishlist_url
// (migration 586). The poster calls configureMonetization() at cycle start
// with the value loaded in loadCycleContext; until then we fall back to the
// env links. When a wishlist URL is set, it is PREFERRED over the Fansly
// paywall link (586's wishlist-first transition-fund strategy).
let MONETIZATION: { url: string; provider: string } = {
  url: (process.env.WISHLIST_URL || '').trim(),
  provider: (process.env.WISHLIST_PROVIDER || '').trim().toLowerCase(),
};

/** Called once per cycle by the poster after loading user_state (mig 586). */
export function configureMonetization(url?: string | null, provider?: string | null): void {
  MONETIZATION = {
    url: (url || process.env.WISHLIST_URL || '').trim(),
    provider: (provider || process.env.WISHLIST_PROVIDER || '').trim().toLowerCase(),
  };
}

// Provider-aware CTA banks for the wishlist (tribute/gift) funnel.
function wishlistCtas(url: string, provider: string): string[] {
  const common = [
    `wishlist if you want to spoil me: ${url}`,
    `the fund's here, baby → ${url}`,
    `want me further along? ${url}`,
  ];
  if (provider === 'throne') return [...common, `throne: ${url}`, `pull something off my throne: ${url}`];
  if (provider === 'wishtender') return [...common, `wishtender: ${url}`, `send a tip through here: ${url}`];
  if (provider === 'amazon') return [...common, `my list: ${url}`, `gift something off the list: ${url}`];
  return common;
}

const FANSLY_URL = process.env.FANSLY_PUBLIC_URL || 'https://fansly.com/SoftMaxy';
const THRONE_URL = process.env.THRONE_URL || '';
const LINKTREE_URL = process.env.LINKTREE_URL || '';

const FANSLY_CTAS = [
  `more on fansly: ${FANSLY_URL}`,
  `the rest is behind the paywall — ${FANSLY_URL}`,
  `full set on fansly: ${FANSLY_URL}`,
  `unlocked version: ${FANSLY_URL}`,
  `the video of this is on fansly: ${FANSLY_URL}`,
  `behind the scenes stuff lives here → ${FANSLY_URL}`,
];

const THRONE_CTAS = THRONE_URL ? [
  `wishlist if you want me locked longer: ${THRONE_URL}`,
  `tributes go through here: ${THRONE_URL}`,
  `throne: ${THRONE_URL}`,
] : [];

function pickOne<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Append a Fansly CTA to the given text at the given rate (0-1).
 * Returns the text unchanged if skipped or if the text already has a URL.
 */
export function rotateFansly(text: string, rate: number = 0.25): string {
  if (!text || !FANSLY_URL) return text;
  if (/https?:\/\//i.test(text)) return text;          // already has a URL
  if (Math.random() > rate) return text;
  const cta = pickOne(FANSLY_CTAS);
  if (!cta) return text;
  return `${text.trim()}\n\n${cta}`;
}

export function rotateThrone(text: string, rate: number = 0.15): string {
  if (!text || THRONE_CTAS.length === 0) return text;
  if (/https?:\/\//i.test(text)) return text;
  if (Math.random() > rate) return text;
  const cta = pickOne(THRONE_CTAS);
  if (!cta) return text;
  return `${text.trim()}\n\n${cta}`;
}

/**
 * Platform-aware rotator. Pick the right CTA for where this is posting.
 * fansly/onlyfans: no self-link (platform disallows or it's self-referential)
 * sniffies/fetlife DMs: never (PII guard handles)
 * reddit/twitter: fansly or throne based on content angle
 */
export function rotateAllPlatforms(text: string, platform: string, opts: { rate?: number; preferThrone?: boolean } = {}): string {
  if (!text) return text;
  if (/https?:\/\//i.test(text)) return text;

  const isPaidPlatform = platform === 'fansly' || platform === 'onlyfans';
  const isDMContext = platform.includes('dm') || platform === 'sniffies' || platform === 'fetlife_dm';
  if (isPaidPlatform || isDMContext) return text;

  // 586 wishlist-first: when a wishlist URL is configured, prefer it over the
  // Fansly paywall link (it funds the transition target directly).
  if (MONETIZATION.url) {
    if (Math.random() > (opts.rate ?? 0.25)) return text;
    const cta = pickOne(wishlistCtas(MONETIZATION.url, MONETIZATION.provider));
    if (!cta) return text;
    return `${text.trim()}\n\n${cta}`;
  }

  if (opts.preferThrone && THRONE_CTAS.length > 0) {
    return rotateThrone(text, opts.rate ?? 0.25);
  }
  return rotateFansly(text, opts.rate ?? 0.25);
}
