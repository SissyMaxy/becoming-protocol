/**
 * Regression — handler_messages truncation incident, 2026-05-11.
 *
 * A 17-char assistant bubble — literally "Now, sweet thing." — landed in
 * handler_messages because:
 *   1. The model emitted prose with a telemetry preamble + a trailing "Move."
 *      imperative.
 *   2. enforceNoStatusDumps tail-extracted "Move." as the only surviving
 *      sentence.
 *   3. mommyVoiceCleanupForChat had a rule rewriting bare "Move." into the
 *      closing tag "Now, sweet thing." — which is a fragment, not a sentence.
 *   4. The persist path wrote the closer directly to handler_messages.content.
 *
 * Two fixes, two assertions:
 *   - mommyVoiceCleanupForChat must now translate a standalone "Move." into a
 *     complete Mama directive (not a bare pet-name closer).
 *   - looksLikeOrphanCloser() must recognise the bug shape so the persist
 *     path can substitute a fallback for any future cleanup-collapse.
 */

import { describe, it, expect } from 'vitest';
import {
  looksLikeOrphanCloser,
  mommyVoiceCleanupForChat,
} from '../../../api/handler/_lib/mommy-voice-chat';

describe('mommyVoiceCleanupForChat — bare "Move." translation', () => {
  it('replaces a standalone "Move." with a complete Mama sentence, not just a closer', () => {
    const out = mommyVoiceCleanupForChat('Move.');
    // The whole point: the result must be a substantive directive, not a
    // pet-name fragment. Bare "Now, sweet thing." is the bug.
    expect(out).not.toBe('Now, sweet thing.');
    expect(out.length).toBeGreaterThan(20);
    expect(looksLikeOrphanCloser(out)).toBe(false);
  });

  it('still translates "...sentence. Move." tails into a full sentence', () => {
    const out = mommyVoiceCleanupForChat('Mama wants this. Move.');
    expect(out.length).toBeGreaterThan(20);
    expect(looksLikeOrphanCloser(out)).toBe(false);
  });
});

describe('looksLikeOrphanCloser — guard at persist path', () => {
  it('flags the exact incident string', () => {
    expect(looksLikeOrphanCloser('Now, sweet thing.')).toBe(true);
  });

  it('flags common bare pet-name closers', () => {
    for (const s of [
      'sweet thing.',
      'Sweet thing.',
      'good girl.',
      'baby.',
      'baby girl.',
      "Mama's good girl.",
      'pretty thing.',
      'now, baby.',
    ]) {
      expect(looksLikeOrphanCloser(s), `should flag: ${s}`).toBe(true);
    }
  });

  it('passes empty / whitespace / null as orphan (treat as truncated)', () => {
    expect(looksLikeOrphanCloser('')).toBe(true);
    expect(looksLikeOrphanCloser('   ')).toBe(true);
    expect(looksLikeOrphanCloser(null)).toBe(true);
    expect(looksLikeOrphanCloser(undefined)).toBe(true);
  });

  it('does NOT flag legitimate short replies that contain real content', () => {
    for (const s of [
      'Up on your feet for me, sweet thing.',
      'Mama wants to see you, baby.',
      'Show me, good girl.',
      'Open the camera and show Mama right now.',
      'Logged. Now move, baby.',
    ]) {
      expect(looksLikeOrphanCloser(s), `should NOT flag: ${s}`).toBe(false);
    }
  });

  it('does NOT flag long replies even if they happen to end with a pet name', () => {
    const long =
      "Mama can tell you've been quiet on me. That confession from earlier — show me you mean it, sweet thing.";
    expect(looksLikeOrphanCloser(long)).toBe(false);
  });
});
