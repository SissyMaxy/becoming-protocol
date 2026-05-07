// Google Calendar API client — minimal subset we use.
//
// Scope: read freebusy on primary, create/list/delete events on a calendar we
// own, create/delete the dedicated calendar itself. No OAuth flow logic here
// (that lives in api/calendar/[action].ts); this is the wire layer.
//
// All calls take a fresh access token. Refresh logic is the caller's job —
// we surface 401s as `TokenExpiredError` so callers know to refresh & retry.

import { GOOGLE_OAUTH_TOKEN_URL, GOOGLE_OAUTH_REVOKE_URL } from './oauth';

const CAL_API = 'https://www.googleapis.com/calendar/v3';

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

async function call<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const resp = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (resp.status === 401) throw new TokenExpiredError();
  if (!resp.ok) {
    const body = await resp.text();
    throw new GoogleApiError(resp.status, body);
  }
  // 204 No Content (delete) → no body
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

// ── Token lifecycle ────────────────────────────────────────────────────────

export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenExchangeResult> {
  const resp = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    }),
  });
  if (!resp.ok) {
    throw new GoogleApiError(resp.status, await resp.text());
  }
  return resp.json();
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenExchangeResult> {
  const resp = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  });
  if (!resp.ok) {
    throw new GoogleApiError(resp.status, await resp.text());
  }
  return resp.json();
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  // Best-effort: 200 on success, 400 if already revoked. Either way, drop it.
  await fetch(`${GOOGLE_OAUTH_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

// ── Calendar (the container) ───────────────────────────────────────────────

export interface CalendarResource {
  id: string;
  summary: string;
  timeZone?: string;
}

export async function createCalendar(
  accessToken: string,
  summary: string,
  timeZone?: string,
): Promise<CalendarResource> {
  return call<CalendarResource>(accessToken, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary, ...(timeZone ? { timeZone } : {}) }),
  });
}

export async function deleteCalendar(
  accessToken: string,
  calendarId: string,
): Promise<void> {
  await call(accessToken, `/calendars/${encodeURIComponent(calendarId)}`, {
    method: 'DELETE',
  });
}

// ── Events ─────────────────────────────────────────────────────────────────

export interface EventResource {
  id: string;
  summary: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
}

export async function createEvent(
  accessToken: string,
  calendarId: string,
  body: {
    summary: string;
    description?: string;
    startIso: string;
    endIso: string;
    timeZone?: string;
  },
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

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await call(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
}

// ── FreeBusy ───────────────────────────────────────────────────────────────

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
