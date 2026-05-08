import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCalendar,
  createEvent,
  deleteEvent,
  queryFreeBusy,
  refreshAccessToken,
  TokenExpiredError,
  GoogleApiError,
} from '../../lib/calendar/google-client';

const TOKEN = 'fake-access-token';

describe('google-client (mocked fetch)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('createCalendar POSTs to /calendars with summary', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ id: 'cal_123', summary: 'Personal' }),
    });
    const cal = await createCalendar(TOKEN, 'Personal');
    expect(cal).toEqual({ id: 'cal_123', summary: 'Personal' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ summary: 'Personal' });
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('createEvent posts to /calendars/{id}/events with start+end', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        id: 'evt_42', summary: 'Morning routine',
        start: { dateTime: '2026-05-06T06:30:00.000Z' },
        end: { dateTime: '2026-05-06T06:45:00.000Z' },
      }),
    });
    const ev = await createEvent(TOKEN, 'cal_123', {
      summary: 'Morning routine',
      startIso: '2026-05-06T06:30:00.000Z',
      endIso: '2026-05-06T06:45:00.000Z',
    });
    expect(ev.id).toBe('evt_42');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/cal_123/events');
    const body = JSON.parse(init.body);
    expect(body.summary).toBe('Morning routine');
    expect(body.start.dateTime).toBe('2026-05-06T06:30:00.000Z');
    expect(body.end.dateTime).toBe('2026-05-06T06:45:00.000Z');
  });

  it('deleteEvent issues a DELETE and tolerates 204', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });
    await deleteEvent(TOKEN, 'cal_123', 'evt_42');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/cal_123/events/evt_42');
    expect(init.method).toBe('DELETE');
  });

  it('queryFreeBusy returns the busy windows for the queried calendar', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        calendars: {
          primary: {
            busy: [
              { start: '2026-05-06T14:00:00Z', end: '2026-05-06T15:00:00Z' },
              { start: '2026-05-06T16:00:00Z', end: '2026-05-06T17:00:00Z' },
            ],
          },
        },
      }),
    });
    const windows = await queryFreeBusy(TOKEN, {
      timeMinIso: '2026-05-06T00:00:00Z',
      timeMaxIso: '2026-05-07T00:00:00Z',
    });
    expect(windows.length).toBe(2);
    expect(windows[0].start).toBe('2026-05-06T14:00:00Z');
  });

  it('throws TokenExpiredError on 401', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(
      queryFreeBusy(TOKEN, { timeMinIso: 'a', timeMaxIso: 'b' }),
    ).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it('throws GoogleApiError on other 4xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'forbidden' });
    await expect(
      queryFreeBusy(TOKEN, { timeMinIso: 'a', timeMaxIso: 'b' }),
    ).rejects.toBeInstanceOf(GoogleApiError);
  });

  it('refreshAccessToken posts to oauth2.googleapis.com/token with grant_type', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ access_token: 'new-acc', expires_in: 3600 }),
    });
    const result = await refreshAccessToken({
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: 'csec',
    });
    expect(result.access_token).toBe('new-acc');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('csec');
  });
});
