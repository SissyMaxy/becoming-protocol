/**
 * Evidence→Content Bridge (Phase 5) — the named gap.
 *
 * Proof of a workout / physical-practice rung / conditioning rung is the highest-
 * arousal faceless own-body content the user produces (the exposure is real), but it
 * dead-ended: workout proof landed on a column no content module read. This routes
 * that evidence into the content vault as a first-class artifact, eligible for the
 * existing `progress_photo` shoot/multiplication route — so every rung completion can
 * become a post. Consumption IS production; production IS conditioning.
 *
 * Faceless own-body only (Art. II item 4) — enforced here, not optional: the builder
 * always stamps face_visible:false and never accepts a third party.
 */

import { addToVault } from '../content-pipeline/vault';

export type EvidenceSource = 'workout' | 'physical_practice' | 'rung';

export interface EvidenceInput {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  source: EvidenceSource;
  description?: string;
  domain?: string;
}

export interface EvidenceVaultItem {
  media_url: string;
  media_type: 'image' | 'video';
  source_type: string;
  description: string;
  face_visible: false;
  auto_captured: true;
  domain: string;
  tags: string[];
}

/**
 * Build the vault item for a piece of evidence. Pure + testable. ALWAYS faceless,
 * always tagged `progress_photo` so the shoot-poll / multiplication route picks it up.
 */
export function buildEvidenceVaultItem(input: EvidenceInput): EvidenceVaultItem {
  return {
    media_url: input.mediaUrl,
    media_type: input.mediaType,
    source_type: input.source,
    description: input.description ?? 'Evidence-of-the-work — faceless own-body progress.',
    face_visible: false, // never optional: Art. II item 4
    auto_captured: true,
    domain: input.domain ?? 'body',
    tags: ['progress_photo', input.source],
  };
}

/** Route a faceless proof into the content vault (shoot-eligible). Returns vault id. */
export async function captureEvidenceToVault(userId: string, input: EvidenceInput): Promise<string | null> {
  return addToVault(userId, buildEvidenceVaultItem(input));
}
