// Seed list of communities the outreach engine considers on first run.
//
// Reddit entries get refreshed by outreach-research (rules, member counts).
// FetLife entries are user-maintained — the platform has no API, so the
// research pass leaves these alone after the initial seed.

export type SeedCommunity = {
  platform: 'reddit' | 'fetlife' | 'discord';
  slug: string;
  display_name: string;
  // Sane prior; outreach-research will refine for Reddit.
  self_promo_policy: 'banned' | 'restricted' | 'allowed_with_engagement' | 'freely_allowed';
  tone_notes: string;
  typical_post_cadence_days: number;
};

// Curated, conservative starter set — journaling-leaning communities, not
// content-pump farms. The user can add more from the UI.
export const REDDIT_SEEDS: SeedCommunity[] = [
  {
    platform: 'reddit',
    slug: 'feminization',
    display_name: 'r/feminization',
    self_promo_policy: 'restricted',
    tone_notes: 'Journaling + transformation-focused; horny tolerated, low-effort posts removed.',
    typical_post_cadence_days: 7,
  },
  {
    platform: 'reddit',
    slug: 'sissyperfection',
    display_name: 'r/SissyPerfection',
    self_promo_policy: 'restricted',
    tone_notes: 'Appearance + ritual focus; reads better with a photo or a specific milestone.',
    typical_post_cadence_days: 14,
  },
  {
    platform: 'reddit',
    slug: 'forcedfeminization',
    display_name: 'r/forcedfeminization',
    self_promo_policy: 'allowed_with_engagement',
    tone_notes: 'Explicit allowed; comment-and-engage culture, drive-by posts get downvoted.',
    typical_post_cadence_days: 7,
  },
  {
    platform: 'reddit',
    slug: 'sissystories',
    display_name: 'r/sissystories',
    self_promo_policy: 'restricted',
    tone_notes: 'Long-form personal narrative; 500+ words preferred.',
    typical_post_cadence_days: 14,
  },
  {
    platform: 'reddit',
    slug: 'asktransgender',
    display_name: 'r/asktransgender',
    self_promo_policy: 'banned',
    tone_notes: 'Sincere questions only; kink-coded posting will be removed.',
    typical_post_cadence_days: 30,
  },
];

export const FETLIFE_SEEDS: SeedCommunity[] = [
  {
    platform: 'fetlife',
    slug: 'sissy-training',
    display_name: 'Sissy Training',
    self_promo_policy: 'allowed_with_engagement',
    tone_notes: 'Mixed kink + lifestyle; long-form journals do well.',
    typical_post_cadence_days: 7,
  },
  {
    platform: 'fetlife',
    slug: 'forced-feminization',
    display_name: 'Forced Feminization',
    self_promo_policy: 'allowed_with_engagement',
    tone_notes: 'Heavy on protocol/ritual narrative; concrete details rewarded.',
    typical_post_cadence_days: 7,
  },
];

export const DISCORD_SEEDS: SeedCommunity[] = [];

export const ALL_SEEDS: SeedCommunity[] = [
  ...REDDIT_SEEDS,
  ...FETLIFE_SEEDS,
  ...DISCORD_SEEDS,
];
