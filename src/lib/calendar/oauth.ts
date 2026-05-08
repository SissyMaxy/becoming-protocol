// Google Calendar OAuth scope/URL constants.
//
// Hard rule: scope is read freebusy + read/write a single dedicated calendar
// Mommy creates. We do NOT request calendar.readonly across all calendars.
//
// Why these scopes:
//   calendar.calendars       — required to CREATE the dedicated calendar
//   calendar.events          — read/write events on calendars we own
//   calendar.freebusy        — read free/busy across the user's primary calendar
//                              (necessary for delivery-time gating; doesn't expose
//                               event titles or attendees, just busy windows)

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendars',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
] as const;

export const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// Default name for the dedicated calendar we own. The user can override during
// connect; if they don't, this is what shows in their calendar list.
export const DEFAULT_DEDICATED_CALENDAR_NAME = 'Personal';

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const qp = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: GOOGLE_OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // force refresh_token issuance every time
    include_granted_scopes: 'true',
    state: params.state,
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${qp.toString()}`;
}
