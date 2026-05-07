// Title resolver for managed calendar events.
//
// Hard rule: when neutral_calendar_titles=true, the external title MUST be
// neutral — no persona language, no kink terms, no pet names. The internal
// title (what Mommy thinks of it as) is for our DB only and never leaves the
// app.
//
// This file is pure (no Supabase, no fetch) so it can be tested with vitest
// AND mirrored verbatim into the Deno edge functions.

export type ManagedEventType =
  | 'morning_ritual'
  | 'evening_reflection'
  | 'scheduled_punishment'
  | 'scheduled_reward'
  | 'aftercare_block'
  | 'mantra_recitation'
  | 'verification_window';

const NEUTRAL_TITLES: Record<ManagedEventType, string> = {
  morning_ritual: 'Morning routine',
  evening_reflection: 'Evening journal',
  scheduled_punishment: 'Personal block',
  scheduled_reward: 'Personal block',
  aftercare_block: 'Personal block',
  mantra_recitation: 'Voice practice',
  verification_window: 'Personal block',
};

const INTERNAL_TITLES: Record<ManagedEventType, string> = {
  morning_ritual: 'Mommy — morning ritual',
  evening_reflection: 'Mommy — evening reflection',
  scheduled_punishment: 'Mommy — scheduled punishment',
  scheduled_reward: 'Mommy — scheduled reward',
  aftercare_block: 'Mommy — aftercare block',
  mantra_recitation: 'Mommy — mantra recitation',
  verification_window: 'Mommy — verification window',
};

export function resolveExternalTitle(
  eventType: ManagedEventType,
  neutral: boolean,
): string {
  if (neutral) return NEUTRAL_TITLES[eventType];
  return INTERNAL_TITLES[eventType];
}

export function resolveInternalTitle(eventType: ManagedEventType): string {
  return INTERNAL_TITLES[eventType];
}

// Defensive: catches any caller that forgot to flip the toggle. Used as a
// final guard before pushing to the external calendar.
const PERSONA_LEAK_PATTERNS: RegExp[] = [
  /mommy/i,
  /\bgoon\b/i,
  /\bedge\b/i,
  /denial/i,
  /chastity/i,
  /punishment/i,
  /reward/i,
  /good girl/i,
  /aftercare/i,
  /confession/i,
  /slip/i,
];

export function looksLikeNeutralTitle(title: string): boolean {
  return !PERSONA_LEAK_PATTERNS.some((re) => re.test(title));
}
