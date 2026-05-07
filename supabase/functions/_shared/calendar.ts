// Calendar helpers for Deno edge functions.
//
// Mirror of src/lib/calendar/{crypto,titles,google-client,place-rituals}.ts.
// Keep in sync — see project memory note about parallel TS/Deno copies
// (same pattern as dommy-mommy.ts).
//
// Centralizing here so calendar-sync, calendar-place-rituals don't each
// reimplement the same plumbing.

// ────────────────────────────────────────────────────────────────────────────
// Title resolver
// ────────────────────────────────────────────────────────────────────────────

export type ManagedEventType =
  | 'morning_ritual'
  | 'evening_reflection'
  | 'scheduled_punishment'
  | 'scheduled_reward'
  | 'aftercare_block'
  | 'mantra_recitation'
  | 'verification_window';

const NEUTRAL_TITLES: Record<ManagedEventType, string> = {
  morning_ritual: 'Morning routine',
  evening_reflection: 'Evening journal',
  scheduled_punishment: 'Personal block',
  scheduled_reward: 'Personal block',
  aftercare_block: 'Personal block',
  mantra_recitation: 'Voice practice',
  verification_window: 'Personal block',
};

const INTERNAL_TITLES: Record<ManagedEventType, string> = {
  morning_ritual: 'Mommy — morning ritual',
  evening_reflection: 'Mommy — evening reflection',
  scheduled_punishment: 'Mommy — scheduled punishment',
  scheduled_reward: 'Mommy — scheduled reward',
  aftercare_block: 'Mommy — aftercare block',
  mantra_recitation: 'Mommy — mantra recitation',
  verification_window: 'Mommy — verification window',
};

export function resolveExternalTitle(eventType: ManagedEventType, neutral: boolean): string {
  return (neutral ? NEUTRAL_TITLES : INTERNAL_TITLES)[eventType];
}

export function resolveInternalTitle(eventType: ManagedEventType): string {
  return INTERNAL_TITLES[eventType];
}

// ────────────────────────────────────────────────────────────────────────────
// AES-256-GCM token crypto
// ────────────────────────────────────────────────────────────────────────────

const IV_BYTES = 12;
const KEY_BYTES = 32;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(keyB64);
  if (raw.length !== KEY_BYTES) {
    throw new Error(`CALENDAR_TOKEN_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length})`);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plaintext: string, keyB64: string): Promise<string> {
  if (!plaintext) throw new Error('encryptToken: empty plaintext');
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decryptToken(blobB64: string, keyB64: string): Promise<string> {
  if (!blobB64) throw new Error('decryptToken: empty blob');
  const key = await importKey(keyB64);
  const blob = b64ToBytes(blobB64);
  if (blob.length < IV_BYTES + 16) throw new Error('decryptToken: blob too short');
  const iv = blob.slice(0, IV_BYTES);
  const ct = blob.slice(IV_BYTES);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
  return new TextDecoder().decode(pt);
}

// ────────────────────────────────────────────────────────────────────────────
// Google Calendar API client
// ────────────────────────────────────────────────────────────────────────────

const CAL_API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class TokenExpiredError extends Error {
  constructor() { super('google token expired'); this.name = 'TokenExpiredError'; }
}

export class GoogleApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`google api ${status}: ${body.slice(0, 200)}`);
    this.name = 'GoogleApiError';
    this.status = status;
    this.body = body;
  }
}

async function call<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (resp.status === 401) throw new TokenExpiredError();
  if (!resp.ok) throw new GoogleApiError(resp.status, await resp.text());
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenExchangeResult> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  });
  if (!resp.ok) throw new GoogleApiError(resp.status, await resp.text());
  return resp.json();
}

export interface EventResource {
  id: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

export async function createEvent(
  accessToken: string,
  calendarId: string,
  body: { summary: string; description?: string; startIso: string; endIso: string; timeZone?: string },
): Promise<EventResource> {
  return call<EventResource>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify({
        summary: body.summary,
        description: body.description,
        start: { dateTime: body.startIso, ...(body.timeZone ? { timeZone: body.timeZone } : {}) },
        end: { dateTime: body.endIso, ...(body.timeZone ? { timeZone: body.timeZone } : {}) },
      }),
    },
  );
}

export interface FreeBusyWindow { start: string; end: string }

export async function queryFreeBusy(
  accessToken: string,
  params: { timeMinIso: string; timeMaxIso: string; calendarId?: string },
): Promise<FreeBusyWindow[]> {
  const calId = params.calendarId || 'primary';
  const resp = await call<{ calendars: Record<string, { busy: FreeBusyWindow[] }> }>(
    accessToken,
    '/freeBusy',
    {
      method: 'POST',
      body: JSON.stringify({
        timeMin: params.timeMinIso,
        timeMax: params.timeMaxIso,
        items: [{ id: calId }],
      }),
    },
  );
  return resp.calendars?.[calId]?.busy || [];
}

// ────────────────────────────────────────────────────────────────────────────
// Token-refresh helper used by every cron — encapsulates the
// "decrypt → check expiry → refresh if needed → re-encrypt → return" dance.
// ────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ActiveCredentials {
  user_id: string;
  accessToken: string;
  external_calendar_id: string | null;
  external_calendar_name: string | null;
  neutral_calendar_titles: boolean;
  morning_ritual_local_time: string;
  morning_ritual_duration_min: number;
  evening_reflection_local_time: string;
  evening_reflection_duration_min: number;
  events_enabled: boolean;
  busy_aware_delivery: boolean;
}

export function denoEnv(name: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Deno as any).env.get(name) ?? '';
}

export function denoServiceClient(): SupabaseClient {
  return createClient(denoEnv('SUPABASE_URL'), denoEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export async function getActiveCredentials(supabase: SupabaseClient): Promise<ActiveCredentials[]> {
  const tokenKey = denoEnv('CALENDAR_TOKEN_KEY');
  const clientId = denoEnv('GOOGLE_CALENDAR_CLIENT_ID');
  const clientSecret = denoEnv('GOOGLE_CALENDAR_CLIENT_SECRET');
  if (!tokenKey || !clientId || !clientSecret) {
    console.warn('[calendar] missing CALENDAR_TOKEN_KEY/GOOGLE_CALENDAR_CLIENT_ID/SECRET');
    return [];
  }

  const { data: rows, error } = await supabase
    .from('calendar_credentials')
    .select(
      'user_id, access_token_encrypted, refresh_token_encrypted, expires_at, ' +
      'external_calendar_id, external_calendar_name, neutral_calendar_titles, ' +
      'morning_ritual_local_time, morning_ritual_duration_min, ' +
      'evening_reflection_local_time, evening_reflection_duration_min, ' +
      'events_enabled, busy_aware_delivery',
    )
    .eq('provider', 'google')
    .is('disconnected_at', null);

  if (error) {
    console.error('[calendar] fetch creds error:', error.message);
    return [];
  }

  const out: ActiveCredentials[] = [];
  for (const row of rows || []) {
    let accessToken: string;
    try { accessToken = await decryptToken(row.access_token_encrypted, tokenKey); }
    catch (err) {
      console.error('[calendar] decrypt access failed for', row.user_id, (err as Error).message);
      continue;
    }

    const expired = !row.expires_at || new Date(row.expires_at).getTime() <= Date.now() + 60_000;
    if (expired) {
      let refreshToken: string;
      try { refreshToken = await decryptToken(row.refresh_token_encrypted, tokenKey); }
      catch (err) {
        console.error('[calendar] decrypt refresh failed for', row.user_id, (err as Error).message);
        continue;
      }

      try {
        const fresh = await refreshAccessToken({ refreshToken, clientId, clientSecret });
        accessToken = fresh.access_token;
        const newAccessEnc = await encryptToken(fresh.access_token, tokenKey);
        const newExpires = new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString();
        await supabase
          .from('calendar_credentials')
          .update({
            access_token_encrypted: newAccessEnc,
            expires_at: newExpires,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', row.user_id)
          .eq('provider', 'google');
      } catch (err) {
        console.error('[calendar] refresh failed for', row.user_id, (err as Error).message);
        continue;
      }
    }

    out.push({
      user_id: row.user_id,
      accessToken,
      external_calendar_id: row.external_calendar_id,
      external_calendar_name: row.external_calendar_name,
      neutral_calendar_titles: row.neutral_calendar_titles,
      morning_ritual_local_time: row.morning_ritual_local_time,
      morning_ritual_duration_min: row.morning_ritual_duration_min,
      evening_reflection_local_time: row.evening_reflection_local_time,
      evening_reflection_duration_min: row.evening_reflection_duration_min,
      events_enabled: row.events_enabled,
      busy_aware_delivery: row.busy_aware_delivery,
    });
  }

  return out;
}
