// Evidence→Content bridge (Phase 5) — the faceless, shoot-eligible vault item.
// Pins the named-gap fix: rung/workout proof becomes progress_photo content,
// always faceless (Art. II item 4), never optional.

import { describe, it, expect } from 'vitest';
import { buildEvidenceVaultItem } from '../../lib/industry/evidence-content-bridge';

describe('buildEvidenceVaultItem', () => {
  it('is always faceless — face_visible is false regardless of input', () => {
    const item = buildEvidenceVaultItem({ mediaUrl: 'u', mediaType: 'image', source: 'physical_practice' });
    expect(item.face_visible).toBe(false);
  });

  it('tags progress_photo (so the shoot/multiplication route picks it up) + the source', () => {
    const item = buildEvidenceVaultItem({ mediaUrl: 'u', mediaType: 'video', source: 'workout' });
    expect(item.tags).toContain('progress_photo');
    expect(item.tags).toContain('workout');
    expect(item.source_type).toBe('workout');
  });

  it('defaults domain to body and marks auto_captured', () => {
    const item = buildEvidenceVaultItem({ mediaUrl: 'u', mediaType: 'image', source: 'rung' });
    expect(item.domain).toBe('body');
    expect(item.auto_captured).toBe(true);
  });

  it('carries media + description through', () => {
    const item = buildEvidenceVaultItem({ mediaUrl: 'https://x/y.jpg', mediaType: 'image', source: 'physical_practice', description: 'glute set, caged' });
    expect(item.media_url).toBe('https://x/y.jpg');
    expect(item.description).toBe('glute set, caged');
  });
});
