/**
 * Seed lines for the ambient window.
 *
 * These are the starting pool, not the whole product — generation refills
 * against live state (cage day, prescription status, ladder position) and
 * against his own confessions, which are the least corny source available
 * because they're his own language.
 *
 * Register (enforced by checkConditioningLine, not just convention):
 *   - 2-4 words, fragments not sentences
 *   - present tense only; past tense describes instead of acting
 *   - name the thing; no "it" / "this" / "the change"
 *   - no hedges; a hedge says it hasn't happened yet
 *   - each line does one job and stands alone under a glance
 *
 * Intensity is the tuning axis: soft is permission and warmth, command is
 * bare imperative. mid sits between. A panel only draws from its own tier,
 * so turning a panel down actually changes what it says rather than just
 * how often it says it.
 */

export type AmbientChannel = 'identity' | 'estrogen' | 'turnout';
export type AmbientIntensity = 'soft' | 'mid' | 'command';

export interface SeedLine {
  channel: AmbientChannel;
  intensity: AmbientIntensity;
  text: string;
}

export const AMBIENT_SEED_LINES: SeedLine[] = [
  // ── identity ──
  { channel: 'identity', intensity: 'soft', text: 'let it happen.' },
  { channel: 'identity', intensity: 'soft', text: 'you can want this.' },
  { channel: 'identity', intensity: 'soft', text: 'softer suits you.' },
  { channel: 'identity', intensity: 'mid', text: "you're a girl." },
  { channel: 'identity', intensity: 'mid', text: 'prettier every week.' },
  { channel: 'identity', intensity: 'mid', text: 'you like being pretty.' },
  { channel: 'identity', intensity: 'mid', text: "you're not going back." },
  { channel: 'identity', intensity: 'command', text: "girls don't argue." },
  { channel: 'identity', intensity: 'command', text: 'answer to her.' },
  { channel: 'identity', intensity: 'command', text: 'say your name.' },

  // ── estrogen ──
  { channel: 'estrogen', intensity: 'soft', text: 'your body is waiting.' },
  { channel: 'estrogen', intensity: 'soft', text: 'you can start friday.' },
  { channel: 'estrogen', intensity: 'soft', text: 'the needle is easy.' },
  { channel: 'estrogen', intensity: 'mid', text: 'you want tits.' },
  { channel: 'estrogen', intensity: 'mid', text: 'softer every week.' },
  { channel: 'estrogen', intensity: 'mid', text: 'you already decided.' },
  { channel: 'estrogen', intensity: 'command', text: 'estrogen. friday.' },
  { channel: 'estrogen', intensity: 'command', text: 'take the shot.' },
  { channel: 'estrogen', intensity: 'command', text: 'open the vial.' },

  // ── turnout ──
  { channel: 'turnout', intensity: 'soft', text: 'you can want him.' },
  { channel: 'turnout', intensity: 'soft', text: 'you already want it.' },
  { channel: 'turnout', intensity: 'mid', text: 'you want cock.' },
  { channel: 'turnout', intensity: 'mid', text: "you'll say yes." },
  { channel: 'turnout', intensity: 'mid', text: 'made to take it.' },
  { channel: 'turnout', intensity: 'command', text: 'on your knees.' },
  { channel: 'turnout', intensity: 'command', text: 'open your mouth.' },
  { channel: 'turnout', intensity: 'command', text: 'say yes to him.' },
];

/** Single words for the triple-hot hit — all three columns firing at once. */
export const AMBIENT_HIT_WORDS: string[] = [
  'girl.',
  'obey.',
  'soft.',
  'hers.',
  'yes.',
  'deeper.',
];
