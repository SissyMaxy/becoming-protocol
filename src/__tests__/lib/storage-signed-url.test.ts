/**
 * Tests for getSignedAssetUrl — the chokepoint for reading from private
 * storage buckets after migration 260 flipped verification-photos /
 * evidence / audio.
 *
 * Covers:
 *   - URL prefix stripping (legacy rows that escaped the migration 261 backfill)
 *   - happy-path sign returns the data.signedUrl
 *   - error / empty input returns null (caller treats as "asset unavailable")
 *   - batch sign maps results back into input order
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSignedUrlMock = vi.fn();
const createSignedUrlsMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: createSignedUrlMock,
        createSignedUrls: createSignedUrlsMock,
      })),
    },
  },
}));

import { getSignedAssetUrl, getSignedAssetUrls, stripPublicUrlPrefix } from '../../lib/storage/signed-url';

beforeEach(() => {
  createSignedUrlMock.mockReset();
  createSignedUrlsMock.mockReset();
});

describe('stripPublicUrlPrefix', () => {
  it('strips a Supabase public-URL prefix down to the path', () => {
    const input = 'https://abc.supabase.co/storage/v1/object/public/evidence/uuid/sub/file.webp';
    expect(stripPublicUrlPrefix('evidence', input)).toBe('uuid/sub/file.webp');
  });

  it('leaves a bare path unchanged', () => {
    expect(stripPublicUrlPrefix('evidence', 'uuid/sub/file.webp'))
      .toBe('uuid/sub/file.webp');
  });

  it('does not strip when bucket name in URL differs', () => {
    // A URL pointing at a different bucket should NOT be silently rewritten.
    const input = 'https://abc.supabase.co/storage/v1/object/public/audio/uuid/clip.mp3';
    expect(stripPublicUrlPrefix('evidence', input)).toBe(input);
  });

  it('matches both http and https schemes', () => {
    const input = 'http://localhost:54321/storage/v1/object/public/audio/x/y.mp3';
    expect(stripPublicUrlPrefix('audio', input)).toBe('x/y.mp3');
  });
});

describe('getSignedAssetUrl', () => {
  it('returns null for null/undefined/empty inputs without calling the API', async () => {
    expect(await getSignedAssetUrl('evidence', null)).toBeNull();
    expect(await getSignedAssetUrl('evidence', undefined)).toBeNull();
    expect(await getSignedAssetUrl('evidence', '')).toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it('returns the signedUrl on success', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/x?token=abc' },
      error: null,
    });
    const result = await getSignedAssetUrl('evidence', 'uuid/file.png');
    expect(result).toBe('https://signed.example/x?token=abc');
    expect(createSignedUrlMock).toHaveBeenCalledWith('uuid/file.png', 3600);
  });

  it('strips a legacy public-URL prefix before signing', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/y' },
      error: null,
    });
    await getSignedAssetUrl(
      'evidence',
      'https://abc.supabase.co/storage/v1/object/public/evidence/u/f.png',
    );
    expect(createSignedUrlMock).toHaveBeenCalledWith('u/f.png', 3600);
  });

  it('returns null on storage error rather than throwing', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: null,
      error: { message: 'object not found' },
    });
    const result = await getSignedAssetUrl('evidence', 'missing.png');
    expect(result).toBeNull();
  });

  it('honors a custom TTL', async () => {
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'x' }, error: null });
    await getSignedAssetUrl('audio', 'a/b.mp3', 60);
    expect(createSignedUrlMock).toHaveBeenCalledWith('a/b.mp3', 60);
  });
});

describe('getSignedAssetUrls (batch)', () => {
  it('returns an empty array for an empty input', async () => {
    expect(await getSignedAssetUrls('evidence', [])).toEqual([]);
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });

  it('preserves input order, including null entries', async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        { path: 'a.png', signedUrl: 'https://signed/a', error: null },
        { path: 'b.png', signedUrl: 'https://signed/b', error: null },
      ],
      error: null,
    });
    const result = await getSignedAssetUrls('evidence', ['a.png', null, 'b.png']);
    expect(result).toEqual(['https://signed/a', null, 'https://signed/b']);
  });

  it('returns null for paths the API failed to sign', async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        { path: 'a.png', signedUrl: 'https://signed/a', error: null },
        { path: 'broken.png', signedUrl: null, error: 'oops' },
      ],
      error: null,
    });
    const result = await getSignedAssetUrls('evidence', ['a.png', 'broken.png']);
    expect(result).toEqual(['https://signed/a', null]);
  });
});
