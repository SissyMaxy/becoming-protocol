// Calendar OAuth + lifecycle endpoints.
//
// Routes (action = req.query.action):
//   GET  /api/calendar/auth        — start OAuth, redirect to Google
//   GET  /api/calendar/callback    — Google redirects here with code; exchange,
//                                    create dedicated calendar, store creds
//   GET  /api/calendar/status      — JSON: {connected, eventsEnabled, ...}
//   POST /api/calendar/settings    — update toggles + ritual times
//   POST /api/calendar/revoke      — disconnect: delete external events,
//                                    revoke refresh token, drop credentials
//
// Tokens are AES-256-GCM encrypted before storage. We never log them.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from '../../src/lib/calendar/crypto';
import {
  buildAuthUrl,
  GOOGLE_OAUTH_SCOPES,
  DEFAULT_DEDICATED_CALENDAR_NAME,
} from '../../src/lib/calendar/oauth';
import {
  exchangeAuthCode,
  refreshAccessToken,
  revokeRefreshToken,
  createCalendar,
  deleteCalendar,
  deleteEvent,
  TokenExpiredError,
} from '../../src/lib/calendar/google-client';

function env(name: string, ...fallbacks: string[]): string {
  for (const k of [name, ...fallbacks]) {
    const v = process.env[k];
    if (v) return v;
  }
  return '';
}

function serviceClient() {
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('supabase env missing');
  return createClient(url, key);
}

function appUrl(): string {
  return env('CALENDAR_APP_URL', 'WHOOP_APP_URL') || 'https://becoming-protocol.vercel.app';
}

function googleConfig() {
  const clientId = env('GOOGLE_CALENDAR_CLIENT_ID');
  const clientSecret = env('GOOGLE_CALENDAR_CLIENT_SECRET');
  const redirectUri = env('GOOGLE_CALENDAR_REDIRECT_URI');
  const tokenKey = env('CALENDAR_TOKEN_KEY');
  return { clientId, clientSecret, redirectUri, tokenKey };
}

async function authedUserId(
  req: VercelRequest,
  supabase: ReturnType<typeof serviceClient>,
): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (error || !data.user) return null;
  return data.user.id;
}

// ── auth (start) ───────────────────────────────────────────────────────────

function handleAuth(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { clientId, redirectUri } = googleConfig();
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Google calendar not configured' });
  }
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'user_id query param required' });

  const nonce = randomUUID();
  const state = `${userId}:${nonce}`;
  res.setHeader(
    'Set-Cookie',
    `gcal_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
  );
  res.redirect(302, buildAuthUrl({ clientId, redirectUri, state }));
}

// ── callback ───────────────────────────────────────────────────────────────

async function handleCallback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const url = appUrl();
  const { code, state } = req.query;

  if (!code || !state) return res.redirect(302, `${url}?gcal=error&reason=missing_params`);

  const stored = req.cookies?.gcal_oauth_state;
  let userId: string | null = null;
  if (stored) {
    const parts = String(stored).split(':');
    if (parts.length === 2 && parts[1] === String(state).split(':')[1]) {
      userId = parts[0] || null;
    }
  }
  if (!userId) {
    const sParts = String(state).split(':');
    if (sParts.length === 2) userId = sParts[0];
  }
  if (!userId) return res.redirect(302, `${url}?gcal=error&reason=no_user_id`);

  const { clientId, clientSecret, redirectUri, tokenKey } = googleConfig();
  if (!clientId || !clientSecret || !redirectUri || !tokenKey) {
    return res.redirect(302, `${url}?gcal=error&reason=server_config`);
  }

  let tokens;
  try {
    tokens = await exchangeAuthCode({
      code: String(code), clientId, clientSecret, redirectUri,
    });
  } catch (err) {
    console.error('[gcal callback] token exchange failed:', (err as Error).message);
    return res.redirect(302, `${url}?gcal=error&reason=token_exchange_failed`);
  }

  if (!tokens.refresh_token) {
    // Google only issues refresh_token when prompt=consent + access_type=offline,
    // and the user hasn't already granted these scopes. If they re-consent for
    // an existing grant we get only access_token. We need refresh; bounce.
    return res.redirect(302, `${url}?gcal=error&reason=no_refresh_token`);
  }

  const supabase = serviceClient();

  // Create the dedicated calendar Mommy will own. Best-effort; if it fails,
  // we still store creds so settings can retry.
  let externalCalendarId: string | null = null;
  let externalCalendarName: string | null = null;
  try {
    const cal = await createCalendar(
      tokens.access_token,
      DEFAULT_DEDICATED_CALENDAR_NAME,
    );
    externalCalendarId = cal.id;
    externalCalendarName = cal.summary;
  } catch (err) {
    console.error('[gcal callback] createCalendar failed:', (err as Error).message);
  }

  const accessEnc = await encryptToken(tokens.access_token, tokenKey);
  const refreshEnc = await encryptToken(tokens.refresh_token, tokenKey);
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  const { error: dbErr } = await supabase
    .from('calendar_credentials')
    .upsert(
      {
        user_id: userId,
        provider: 'google',
        access_token_encrypted: accessEnc,
        refresh_token_encrypted: refreshEnc,
        expires_at: expiresAt,
        scopes: tokens.scope?.split(' ') || [...GOOGLE_OAUTH_SCOPES],
        external_calendar_id: externalCalendarId,
        external_calendar_name: externalCalendarName,
        disconnected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    );

  if (dbErr) {
    console.error('[gcal callback] db upsert failed:', dbErr.message);
    return res.redirect(302, `${url}?gcal=error&reason=db_error`);
  }

  res.setHeader(
    'Set-Cookie',
    'gcal_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
  );
  res.redirect(302, `${url}?gcal=connected`);
}

// ── status ─────────────────────────────────────────────────────────────────

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { data } = await supabase
    .from('calendar_credentials')
    .select(
      'provider, external_calendar_name, neutral_calendar_titles, ' +
      'morning_ritual_local_time, morning_ritual_duration_min, ' +
      'evening_reflection_local_time, evening_reflection_duration_min, ' +
      'events_enabled, busy_aware_delivery, connected_at',
    )
    .eq('user_id', userId)
    .eq('provider', 'google')
    .is('disconnected_at', null)
    .maybeSingle();

  if (!data) return res.status(200).json({ connected: false });
  return res.status(200).json({ connected: true, ...(data as unknown as Record<string, unknown>) });
}

// ── settings ───────────────────────────────────────────────────────────────

async function handleSettings(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = (req.body || {}) as {
    events_enabled?: boolean;
    neutral_calendar_titles?: boolean;
    busy_aware_delivery?: boolean;
    morning_ritual_local_time?: string;
    morning_ritual_duration_min?: number;
    evening_reflection_local_time?: string;
    evening_reflection_duration_min?: number;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (typeof body.events_enabled === 'boolean') patch.events_enabled = body.events_enabled;
  if (typeof body.neutral_calendar_titles === 'boolean') patch.neutral_calendar_titles = body.neutral_calendar_titles;
  if (typeof body.busy_aware_delivery === 'boolean') patch.busy_aware_delivery = body.busy_aware_delivery;
  if (typeof body.morning_ritual_local_time === 'string' && HHMM_RE.test(body.morning_ritual_local_time)) {
    patch.morning_ritual_local_time = body.morning_ritual_local_time;
  }
  if (typeof body.morning_ritual_duration_min === 'number' && body.morning_ritual_duration_min > 0 && body.morning_ritual_duration_min <= 240) {
    patch.morning_ritual_duration_min = Math.round(body.morning_ritual_duration_min);
  }
  if (typeof body.evening_reflection_local_time === 'string' && HHMM_RE.test(body.evening_reflection_local_time)) {
    patch.evening_reflection_local_time = body.evening_reflection_local_time;
  }
  if (typeof body.evening_reflection_duration_min === 'number' && body.evening_reflection_duration_min > 0 && body.evening_reflection_duration_min <= 240) {
    patch.evening_reflection_duration_min = Math.round(body.evening_reflection_duration_min);
  }

  const { error } = await supabase
    .from('calendar_credentials')
    .update(patch)
    .eq('user_id', userId)
    .eq('provider', 'google')
    .is('disconnected_at', null);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, applied: Object.keys(patch).length - 1 });
}

// ── revoke ─────────────────────────────────────────────────────────────────

async function handleRevoke(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { tokenKey, clientId, clientSecret } = googleConfig();

  const { data: cred } = await supabase
    .from('calendar_credentials')
    .select('access_token_encrypted, refresh_token_encrypted, external_calendar_id, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();

  // Best-effort cleanup: refresh if needed, delete external events + calendar.
  if (cred && tokenKey) {
    let accessToken = '';
    try { accessToken = await decryptToken(cred.access_token_encrypted, tokenKey); } catch {}
    let refreshToken = '';
    try { refreshToken = await decryptToken(cred.refresh_token_encrypted, tokenKey); } catch {}

    const expired = !cred.expires_at || new Date(cred.expires_at).getTime() <= Date.now() + 60_000;
    if (expired && refreshToken && clientId && clientSecret) {
      try {
        const fresh = await refreshAccessToken({ refreshToken, clientId, clientSecret });
        accessToken = fresh.access_token;
      } catch (err) {
        console.error('[gcal revoke] refresh failed (continuing):', (err as Error).message);
      }
    }

    // Best-effort delete every managed event row (some may already be gone).
    if (accessToken && cred.external_calendar_id) {
      const { data: events } = await supabase
        .from('calendar_events_managed')
        .select('id, external_event_id')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .is('cancelled_at', null);

      for (const ev of events || []) {
        try {
          await deleteEvent(accessToken, cred.external_calendar_id, ev.external_event_id);
        } catch (err) {
          if (!(err instanceof TokenExpiredError)) {
            console.error('[gcal revoke] deleteEvent failed:', (err as Error).message);
          }
        }
      }

      try {
        await deleteCalendar(accessToken, cred.external_calendar_id);
      } catch (err) {
        console.error('[gcal revoke] deleteCalendar failed:', (err as Error).message);
      }
    }

    if (refreshToken) {
      try { await revokeRefreshToken(refreshToken); } catch {}
    }
  }

  // Drop our state regardless of external cleanup outcome.
  await supabase
    .from('calendar_events_managed')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');

  await supabase
    .from('calendar_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');

  return res.status(200).json({ disconnected: true });
}

// ── default export ─────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';
  try {
    switch (action) {
      case 'auth': return handleAuth(req, res);
      case 'callback': return handleCallback(req, res);
      case 'status': return handleStatus(req, res);
      case 'settings': return handleSettings(req, res);
      case 'revoke': return handleRevoke(req, res);
      default: return res.status(404).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[gcal handler]', (err as Error).message);
    return res.status(500).json({ error: 'internal' });
  }
}
