// Meta-frame reveal endpoint — integration-style test with mocked
// supabase client. Exercises the full handler: auth check, distortion
// pull, snap-back to off, cooldown timestamp, audit row insert,
// per-row plain-summary attachment.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted shared client referenced by both the mock factory and the test
// body. vi.hoisted is required because vi.mock factories are hoisted
// above top-level `const` declarations.
const { mockClient } = vi.hoisted(() => {
  const client = {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  return { mockClient: client };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockClient,
}));

import handler from '../../../api/handler/meta-frame-reveal';

interface MockReq {
  method: string;
  headers: Record<string, string>;
  body: unknown;
}
interface MockRes {
  statusCode: number;
  body: unknown;
  status: (n: number) => MockRes;
  json: (b: unknown) => MockRes;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: null,
    status(n: number) { this.statusCode = n; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

const USER_ID = 'test-user-uuid';

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

function configureFromMocks(opts: {
  stateRow?: { gaslight_intensity?: string; gaslight_cooldown_until?: string | null };
  distortions?: Array<{
    id: string; original_text: string; distorted_text: string;
    distortion_type: string; surface: string; intensity: string;
    affect_at_time: string | null; created_at: string;
  }>;
  updateCapture?: { latest: Record<string, unknown> | null };
  insertCapture?: { latest: Record<string, unknown> | null };
}) {
  const { stateRow, distortions = [], updateCapture, insertCapture } = opts;

  mockClient.from.mockImplementation((table: string) => {
    if (table === 'user_state') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: stateRow ?? null, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          if (updateCapture) updateCapture.latest = payload;
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    }
    if (table === 'mommy_distortion_log') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: distortions, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'meta_frame_breaks') {
      return {
        insert: (payload: Record<string, unknown>) => {
          if (insertCapture) insertCapture.latest = payload;
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    return {};
  });
}

describe('meta-frame-reveal handler', () => {
  it('rejects non-POST', async () => {
    const req: MockReq = { method: 'GET', headers: {}, body: {} };
    const res = makeRes();
    // @ts-expect-error narrow shape
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects missing auth token', async () => {
    const req: MockReq = { method: 'POST', headers: {}, body: {} };
    const res = makeRes();
    // @ts-expect-error narrow shape
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid trigger value', async () => {
    configureFromMocks({});
    const req: MockReq = {
      method: 'POST',
      headers: { authorization: 'Bearer abc' },
      body: { trigger: 'somethin_random' },
    };
    const res = makeRes();
    // @ts-expect-error narrow shape
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns empty distortions notice when nothing logged', async () => {
    const updateCapture = { latest: null as Record<string, unknown> | null };
    configureFromMocks({
      stateRow: { gaslight_intensity: 'firm', gaslight_cooldown_until: null },
      distortions: [],
      updateCapture,
    });
    const req: MockReq = {
      method: 'POST',
      headers: { authorization: 'Bearer abc' },
      body: { trigger: 'settings_button' },
    };
    const res = makeRes();
    // @ts-expect-error narrow shape
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const body = res.body as { ok: boolean; distortion_count: number; notice: string; cooldown_until: string };
    expect(body.ok).toBe(true);
    expect(body.distortion_count).toBe(0);
    expect(body.notice).toContain('No distortions');
    // Snap-to-off + cooldown engaged
    expect(updateCapture.latest?.gaslight_intensity).toBe('off');
    expect(updateCapture.latest?.gaslight_cooldown_until).toBeDefined();
    const cooldown = new Date(updateCapture.latest?.gaslight_cooldown_until as string);
    const elapsedFromNow = cooldown.getTime() - Date.now();
    expect(elapsedFromNow).toBeGreaterThan(23 * 3600_000);
    expect(elapsedFromNow).toBeLessThan(25 * 3600_000);
  });

  it('returns originals alongside distorted text and writes audit row', async () => {
    const distortions = [
      {
        id: 'd1',
        original_text: 'I miss her sometimes.',
        distorted_text: 'I miss her every day. And you promised Mama you would never go back.',
        distortion_type: 'attribute_unsaid_promise',
        surface: 'mommy_recall',
        intensity: 'cruel',
        affect_at_time: 'hungry',
        created_at: new Date().toISOString(),
      },
      {
        id: 'd2',
        original_text: 'I told her once.',
        distorted_text: "I'm telling her right now.",
        distortion_type: 'tense_shift',
        surface: 'mommy_tease',
        intensity: 'cruel',
        affect_at_time: null,
        created_at: new Date().toISOString(),
      },
    ];
    const updateCapture = { latest: null as Record<string, unknown> | null };
    const insertCapture = { latest: null as Record<string, unknown> | null };
    configureFromMocks({
      stateRow: { gaslight_intensity: 'cruel', gaslight_cooldown_until: null },
      distortions,
      updateCapture,
      insertCapture,
    });
    const req: MockReq = {
      method: 'POST',
      headers: { authorization: 'Bearer abc' },
      body: { trigger: 'safeword' },
    };
    const res = makeRes();
    // @ts-expect-error narrow shape
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      ok: boolean;
      trigger: string;
      intensity_at_break: string;
      distortion_count: number;
      distortions: Array<{ original: string; distorted: string; type: string; plain_summary: string }>;
    };
    expect(body.trigger).toBe('safeword');
    expect(body.intensity_at_break).toBe('cruel');
    expect(body.distortion_count).toBe(2);
    expect(body.distortions[0].original).toBe('I miss her sometimes.');
    expect(body.distortions[0].distorted).toContain('every day');
    expect(body.distortions[0].plain_summary).toMatch(/promise/i);
    expect(body.distortions[1].plain_summary).toMatch(/tense/i);

    // Snap-to-off
    expect(updateCapture.latest?.gaslight_intensity).toBe('off');
    // Audit row captured the count + trigger
    expect(insertCapture.latest?.triggered_by).toBe('safeword');
    expect(insertCapture.latest?.distortion_count).toBe(2);
    expect(insertCapture.latest?.intensity_at_break).toBe('cruel');
  });
});
