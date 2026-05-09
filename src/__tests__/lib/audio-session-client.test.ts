// audio-session client tests — covers the wrapper that calls the edge
// function and resolves the storage path through getSignedAssetUrl.
//
// The edge function itself runs in Deno; its render pipeline (Anthropic →
// cleanup → ElevenLabs → upload) is covered by the seed-template + selector
// unit tests plus production logging. This file pins the contract between
// FocusMode and the edge fn.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  markOfferAccepted,
  markOfferCompleted,
  markRenderPlayed,
  renderAudioSession,
} from '../../lib/audio-sessions/client';

// Capture the calls made through the supabase client so we can assert the
// shape passed to the edge fn and storage layer.
const invokeMock = vi.fn();
const createSignedUrlMock = vi.fn();

const updateBuilder = () => ({
  eq: vi.fn(function (this: unknown) { return this; }),
  is: vi.fn(function (this: unknown) { return this; }),
});

const fromMock = vi.fn(() => ({
  update: vi.fn(() => updateBuilder()),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => createSignedUrlMock(...args),
      }),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe('renderAudioSession', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    createSignedUrlMock.mockReset();
  });

  it('returns ok payload with signed URL on render success', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        cached: false,
        render_id: 'r-1',
        audio_url: 'sessions/u-1/r-1.mp3',
        script_text: 'Mama is here, baby. Stay with me.',
        duration_seconds: 360,
        expires_at: '2026-05-10T12:00:00Z',
      },
      error: null,
    });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/sessions/u-1/r-1.mp3?token=abc' },
      error: null,
    });

    const result = await renderAudioSession({
      userId: 'u-1', kind: 'session_edge', intensityTier: 'gentle',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audioUrl).toContain('signed.example');
    expect(result.renderId).toBe('r-1');
    expect(result.cached).toBe(false);
    expect(result.durationSeconds).toBe(360);
    // Signed URL was requested for the bucket+path returned by the edge fn
    expect(createSignedUrlMock).toHaveBeenCalledWith('sessions/u-1/r-1.mp3', 7200);
    // Edge fn was called with the right body shape
    expect(invokeMock).toHaveBeenCalledWith('audio-session-render', {
      body: { user_id: 'u-1', kind: 'session_edge', intensity_tier: 'gentle' },
    });
  });

  it('passes cached=true through when edge fn served the cache', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        cached: true,
        render_id: 'r-cache',
        audio_url: 'sessions/u-1/r-cache.mp3',
        script_text: 'cached',
        duration_seconds: 300,
        expires_at: '2026-05-10T12:00:00Z',
      },
      error: null,
    });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://signed/cache' },
      error: null,
    });

    const result = await renderAudioSession({
      userId: 'u-1', kind: 'session_goon',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cached).toBe(true);
  });

  it('defaults intensity_tier to gentle when omitted', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true, render_id: 'r', audio_url: 'p', script_text: 's',
        duration_seconds: 60, expires_at: '2026-05-10T12:00:00Z',
      },
      error: null,
    });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'u' }, error: null,
    });
    await renderAudioSession({ userId: 'u', kind: 'primer_posture' });
    expect(invokeMock).toHaveBeenCalledWith('audio-session-render', {
      body: { user_id: 'u', kind: 'primer_posture', intensity_tier: 'gentle' },
    });
  });

  it('returns error when edge fn errors', async () => {
    invokeMock.mockResolvedValue({
      data: null, error: { message: 'edge_fn_500' },
    });
    const result = await renderAudioSession({
      userId: 'u', kind: 'session_edge',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('edge_fn_500');
  });

  it('returns error when edge fn returns ok:false', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, error: 'no_eligible_template' }, error: null,
    });
    const result = await renderAudioSession({
      userId: 'u', kind: 'session_edge',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_eligible_template');
  });

  it('returns error when signing fails', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true, render_id: 'r', audio_url: 'p', script_text: 's',
        duration_seconds: 60, expires_at: '2026-05-10T12:00:00Z',
      },
      error: null,
    });
    createSignedUrlMock.mockResolvedValue({ data: null, error: { message: 'rls' } });
    const result = await renderAudioSession({
      userId: 'u', kind: 'session_edge',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('sign_failed');
  });
});

describe('offer/render lifecycle helpers', () => {
  it('markOfferAccepted updates the row', async () => {
    fromMock.mockClear();
    await markOfferAccepted('off-1', 'r-1');
    expect(fromMock).toHaveBeenCalledWith('audio_session_offers');
  });
  it('markOfferCompleted updates the row', async () => {
    fromMock.mockClear();
    await markOfferCompleted('off-1');
    expect(fromMock).toHaveBeenCalledWith('audio_session_offers');
  });
  it('markRenderPlayed updates the renders row', async () => {
    fromMock.mockClear();
    await markRenderPlayed('r-1');
    expect(fromMock).toHaveBeenCalledWith('audio_session_renders');
  });
});
