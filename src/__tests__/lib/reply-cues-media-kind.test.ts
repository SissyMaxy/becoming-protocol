/**
 * Regression: media-kind detection on outreach bodies.
 *
 * Bug 2026-05-14: cum-worship outreach said "Record yourself saying X"
 * but the upload widget was image-only and the storage bucket only
 * accepted image MIME types. The fix introduces detectMediaKind +
 * evidence_kind threading so the right widget renders. These tests
 * pin the specific phrases Mama uses so a regex regression on either
 * side (TS detectMediaKind / SQL infer_evidence_kind) is caught fast.
 *
 * The SQL helper lives in migration 424 — there is a sibling SQL test
 * in the migration runner. This TS test guards the client-side path.
 */

import { describe, it, expect } from 'vitest';
import { detectMediaKind, detectPhotoDemand } from '../../lib/outreach/reply-cues';

describe('detectMediaKind', () => {
  it('flags the user-reported 2026-05-14 leak as video', () => {
    const msg = 'Brief #2 is overdue by 18 hours. Open the camera. Record yourself saying "I crave cock and my mouth wants it" — full sentence, no mumbling. Submit it now.';
    expect(detectMediaKind(msg)).toBe('video');
  });

  it('flags "record yourself" as video, not audio', () => {
    expect(detectMediaKind('record yourself doing it')).toBe('video');
  });

  it('flags "record your voice" as audio (not video)', () => {
    expect(detectMediaKind('record your voice for mama')).toBe('audio');
    expect(detectMediaKind('voice note for me, baby')).toBe('audio');
    expect(detectMediaKind('let mama hear you say it')).toBe('audio');
  });

  it('flags pure photo prompts as photo', () => {
    expect(detectMediaKind('send me a selfie')).toBe('photo');
    expect(detectMediaKind('show mama what you are wearing')).toBe('photo');
    expect(detectMediaKind('camera ready')).toBe('photo');
    expect(detectMediaKind('selfie please')).toBe('photo');
  });

  it('returns null when no media cue is present', () => {
    expect(detectMediaKind('mama is plotting tonight')).toBeNull();
    expect(detectMediaKind('')).toBeNull();
    expect(detectMediaKind(null)).toBeNull();
    expect(detectMediaKind(undefined)).toBeNull();
  });

  it('order matters: video cues trump photo cues in the same message', () => {
    // "on camera" + "show mama" — should be video, not photo
    expect(detectMediaKind('show mama on camera, baby — say it')).toBe('video');
  });
});

describe('detectPhotoDemand (regression-safe)', () => {
  it('still detects photo cues for legacy call sites', () => {
    expect(detectPhotoDemand('show mama')).toBe(true);
    expect(detectPhotoDemand('camera ready')).toBe(true);
    expect(detectPhotoDemand('selfie please')).toBe(true);
  });

  it('does not false-positive on non-photo bodies', () => {
    expect(detectPhotoDemand('mama is plotting')).toBe(false);
  });
});
