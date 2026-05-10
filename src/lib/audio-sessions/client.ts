/**
 * Client wrapper for the audio-session-render edge function.
 * Calls the function, resolves the storage path through getSignedAssetUrl,
 * and returns a playable URL.
 */

import { supabase } from '../supabase';
import { getSignedAssetUrl } from '../storage/signed-url';
import type { AudioSessionIntensity, AudioSessionKind } from './template-selector';

export interface RenderResult {
  ok: true;
  renderId: string;
  audioUrl: string;
  scriptText: string;
  durationSeconds: number;
  expiresAt: string;
  cached: boolean;
}

export interface RenderError {
  ok: false;
  error: string;
}

export async function renderAudioSession(args: {
  userId: string;
  kind: AudioSessionKind;
  intensityTier?: AudioSessionIntensity;
}): Promise<RenderResult | RenderError> {
  try {
    const { data, error } = await supabase.functions.invoke('audio-session-render', {
      body: {
        user_id: args.userId,
        kind: args.kind,
        intensity_tier: args.intensityTier ?? 'gentle',
      },
    });
    if (error) {
      return { ok: false, error: error.message || 'edge_fn_error' };
    }
    const payload = data as {
      ok?: boolean;
      error?: string;
      render_id?: string;
      audio_url?: string;
      script_text?: string;
      duration_seconds?: number;
      expires_at?: string;
      cached?: boolean;
    };
    if (!payload?.ok || !payload.audio_url || !payload.render_id) {
      return { ok: false, error: payload?.error || 'render_failed' };
    }
    // audio_url is a storage object path; sign for the playback session.
    // 2h TTL because session audio can be longer than the default 1h
    // and the player keeps the URL on the element for the playback span.
    const signed = await getSignedAssetUrl('audio', payload.audio_url, 7200);
    if (!signed) return { ok: false, error: 'sign_failed' };
    return {
      ok: true,
      renderId: payload.render_id,
      audioUrl: signed,
      scriptText: payload.script_text ?? '',
      durationSeconds: payload.duration_seconds ?? 0,
      expiresAt: payload.expires_at ?? '',
      cached: payload.cached ?? false,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

/**
 * Mark an audio_session_offers row accepted. Idempotent — repeated calls
 * are silently fine (RLS scopes to owner; the update narrows by id).
 */
export async function markOfferAccepted(offerId: string, renderId: string): Promise<void> {
  await supabase
    .from('audio_session_offers')
    .update({ accepted_at: new Date().toISOString(), render_id: renderId })
    .eq('id', offerId)
    .is('accepted_at', null);
}

export async function markOfferCompleted(offerId: string): Promise<void> {
  await supabase
    .from('audio_session_offers')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', offerId)
    .is('completed_at', null);
}

export async function markRenderPlayed(renderId: string): Promise<void> {
  await supabase
    .from('audio_session_renders')
    .update({ played_at: new Date().toISOString() })
    .eq('id', renderId)
    .is('played_at', null);
}
