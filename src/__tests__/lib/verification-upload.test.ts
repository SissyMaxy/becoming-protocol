/**
 * Tests for the photo upload + analyze round-trip helpers.
 *
 * Covers:
 *  - The verification_type → task_type map matches the values
 *    api/handler/analyze-photo.ts knows how to prompt for.
 *  - photoTypeForTouchCategory only returns photo-bearing categories
 *    (private categories like edge_then_stop must NOT trigger a CTA).
 *  - buildStoragePath always starts with the user id (RLS-required).
 *  - analyzeAndPersist round-trip: hits the endpoint, writes back the
 *    review_state matching the approved verdict.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  TASK_TYPE_FOR,
  photoTypeForTouchCategory,
  buildStoragePath,
  analyzeAndPersist,
} from '../../lib/verification/upload';

describe('TASK_TYPE_FOR map', () => {
  it('maps every verification_type the UI exposes to a known task_type', () => {
    const expectedTaskTypes = ['outfit', 'mirror_check', 'pose', 'general'];
    for (const value of Object.values(TASK_TYPE_FOR)) {
      expect(expectedTaskTypes).toContain(value);
    }
  });

  it('covers all six taxonomy values', () => {
    expect(Object.keys(TASK_TYPE_FOR).sort()).toEqual([
      'freeform', 'mantra_recitation', 'mirror_affirmation',
      'pose_hold', 'posture_check', 'wardrobe_acquisition',
    ]);
  });
});

describe('photoTypeForTouchCategory', () => {
  it('returns null for private categories — no photo CTA', () => {
    // Photo verification only makes sense for observable directives.
    // Private acts (edge_then_stop, voice_beg, cold_water) must not
    // surface a 📸 button.
    expect(photoTypeForTouchCategory('edge_then_stop')).toBeNull();
    expect(photoTypeForTouchCategory('cold_water')).toBeNull();
    expect(photoTypeForTouchCategory('voice_beg')).toBeNull();
    expect(photoTypeForTouchCategory('whisper_for_mommy')).toBeNull();
    expect(photoTypeForTouchCategory('breath_check')).toBeNull();
    expect(photoTypeForTouchCategory('sit_in_panties')).toBeNull();
  });

  it('returns the right verification_type for observable categories', () => {
    expect(photoTypeForTouchCategory('mantra_aloud')).toBe('mantra_recitation');
    expect(photoTypeForTouchCategory('mirror_admission')).toBe('mirror_affirmation');
    expect(photoTypeForTouchCategory('pose_hold')).toBe('pose_hold');
    expect(photoTypeForTouchCategory('panty_check')).toBe('freeform');
    expect(photoTypeForTouchCategory('public_micro')).toBe('freeform');
  });

  it('unknown category → null (no CTA, fail-closed)', () => {
    expect(photoTypeForTouchCategory('made_up_kind')).toBeNull();
    expect(photoTypeForTouchCategory('')).toBeNull();
  });
});

describe('buildStoragePath', () => {
  it('always starts with user id (RLS requirement)', () => {
    const userId = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';
    const path = buildStoragePath(userId, 'jpg');
    expect(path.startsWith(`${userId}/`)).toBe(true);
  });

  it('sanitizes the extension', () => {
    expect(buildStoragePath('u', 'JPG').endsWith('.jpg')).toBe(true);
    expect(buildStoragePath('u', 'png').endsWith('.png')).toBe(true);
    expect(buildStoragePath('u', '../etc/passwd').endsWith('.etcpa')).toBe(true);
    expect(buildStoragePath('u', '').endsWith('.jpg')).toBe(true);
  });

  it('paths are unique on rapid succession', () => {
    const a = buildStoragePath('u', 'jpg');
    const b = buildStoragePath('u', 'jpg');
    // Random suffix prevents collisions even within the same ms
    expect(a).not.toBe(b);
  });
});

describe('analyzeAndPersist round-trip', () => {
  function makeMockSupabase() {
    const updatedRows: Array<{ table: string; values: Record<string, unknown>; ids: string[] }> = [];
    const sb = {
      from: vi.fn((table: string) => ({
        update: vi.fn((values: Record<string, unknown>) => ({
          eq: vi.fn((_c1: string, v1: string) => ({
            eq: vi.fn((_c2: string, _v2: string) => {
              updatedRows.push({ table, values, ids: [v1, _v2] });
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        })),
      })),
    };
    return { sb, updatedRows };
  }

  it('writes review_state=approved when /analyze-photo says approved=true', async () => {
    const { sb, updatedRows } = makeMockSupabase();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ analysis: 'good girl', approved: true }),
    } as Response));

    const result = await analyzeAndPersist(sb, {
      photoId: 'p1', photoUrl: 'https://x/y.jpg', taskType: 'outfit',
      caption: 'try me', userId: 'u1', accessToken: 'tok',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.reviewState).toBe('approved');
    expect(result.analysis).toBe('good girl');
    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0].table).toBe('verification_photos');
    expect(updatedRows[0].values).toEqual({ review_state: 'approved' });
    expect(updatedRows[0].ids).toEqual(['p1', 'u1']);
  });

  it('writes review_state=denied when /analyze-photo says approved=false', async () => {
    const { sb, updatedRows } = makeMockSupabase();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ analysis: 'try again', approved: false }),
    } as Response));

    const result = await analyzeAndPersist(sb, {
      photoId: 'p1', photoUrl: 'u', taskType: 'outfit',
      userId: 'u1', accessToken: 'tok',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.reviewState).toBe('denied');
    expect(updatedRows[0].values).toEqual({ review_state: 'denied' });
  });

  it('passes auth token + body through to /analyze-photo', async () => {
    const { sb } = makeMockSupabase();
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ analysis: '', approved: true }),
    } as Response));

    await analyzeAndPersist(sb, {
      photoId: 'pid', photoUrl: 'phurl', taskType: 'pose',
      caption: 'cap', userId: 'uid', accessToken: 'TOKEN_X',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/handler/analyze-photo', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer TOKEN_X' }),
    }));
    const call = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(call.body as string)).toEqual({
      photoId: 'pid', photoUrl: 'phurl', taskType: 'pose', caption: 'cap',
    });
  });

  it('throws on transport failure (does NOT silently mark approved)', async () => {
    const { sb, updatedRows } = makeMockSupabase();
    const fetchMock = vi.fn(async () => ({
      ok: false, status: 502,
      text: async () => 'bad gateway',
    } as Response));

    await expect(analyzeAndPersist(sb, {
      photoId: 'p', photoUrl: 'u', taskType: 'outfit',
      userId: 'u', accessToken: 't',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow(/analyze-photo 502/);

    // Critically: no review_state write on failure — row stays 'pending'
    // so the user can retry without a stale 'denied' verdict.
    expect(updatedRows).toHaveLength(0);
  });
});
