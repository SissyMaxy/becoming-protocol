/**
 * Canonical feminization domain vocabulary + alias map.
 *
 * Canonical = task_bank vocabulary (src/types/task-bank.ts
 * FeminizationDomain, 16 values) + 'mantra'. This is also the DB CHECK on
 * feminization_prescriptions.domain (migration 635) — enum-constraint-guard
 * territory: change one, change both.
 *
 * The alias map exists because the LLM prescriber was taught a different
 * vocabulary (body/wardrobe/ritual/photo/exposure/denial/confession) whose
 * rows never keyed into skipRatePenalty — the adaptive loop read them as
 * alien domains and learned nothing. Aliases are the insert-site backstop;
 * the prescriber prompt now emits canonical directly.
 *
 * A Deno copy lives at supabase/functions/_shared/fem-domains.ts — the
 * alias-map coverage test asserts both stay identical.
 */

export const CANONICAL_FEM_DOMAINS = [
  'voice', 'movement', 'skincare', 'style', 'makeup', 'social',
  'body_language', 'inner_narrative', 'arousal', 'chastity', 'conditioning',
  'identity', 'exercise', 'scent', 'nutrition', 'wigs', 'mantra',
] as const;

export type CanonicalFemDomain = typeof CANONICAL_FEM_DOMAINS[number];

/** LLM/legacy vocabulary → canonical. Mirror of migration 635's UPDATE. */
export const DOMAIN_ALIASES: Record<string, CanonicalFemDomain> = {
  body: 'exercise',
  wardrobe: 'style',
  photo: 'identity',
  ritual: 'inner_narrative',
  exposure: 'social',
  denial: 'chastity',
  confession: 'inner_narrative',
};

/** Normalize any domain string to canonical. Unknown → 'identity'. */
export function normalizeFemDomain(domain: string): CanonicalFemDomain {
  const d = (domain || '').trim().toLowerCase();
  if ((CANONICAL_FEM_DOMAINS as readonly string[]).includes(d)) {
    return d as CanonicalFemDomain;
  }
  return DOMAIN_ALIASES[d] ?? 'identity';
}

/**
 * Per-domain evidence contract (FEM §1 CTA table). Drives the FocusMode
 * surface and the prescriber's evidence_kind assignment.
 */
export const EVIDENCE_KIND_BY_DOMAIN: Record<CanonicalFemDomain, 'photo' | 'voice' | 'measurement' | 'timer' | 'text' | 'none'> = {
  voice: 'voice',
  mantra: 'voice',
  style: 'photo',
  makeup: 'photo',
  wigs: 'photo',
  identity: 'photo',
  chastity: 'photo',
  nutrition: 'photo',
  exercise: 'timer',
  movement: 'timer',
  skincare: 'timer',
  scent: 'text',
  social: 'text',
  body_language: 'text',
  inner_narrative: 'text',
  conditioning: 'text',
  arousal: 'text',
};
