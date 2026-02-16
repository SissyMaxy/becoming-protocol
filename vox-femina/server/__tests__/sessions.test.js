import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Create a temp directory for session data BEFORE importing the app,
// since the sessions route reads DATA_DIR at module load time.
const tempDir = await mkdtemp(join(tmpdir(), 'vox-sessions-test-'));
process.env.DATA_DIR = tempDir;
process.env.NODE_ENV = 'test';

const { app } = await import('../index.js');

let server;
let baseUrl;

beforeAll(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
    server.on('error', reject);
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(tempDir, { recursive: true, force: true });
});

// Clear session data between tests so each test starts clean.
beforeEach(async () => {
  await fetch(`${baseUrl}/api/sessions`, { method: 'DELETE' });
});

describe('GET /api/sessions', () => {
  it('returns an empty array initially', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe('POST /api/sessions', () => {
  it('saves a session and returns 201', async () => {
    const session = {
      id: 'sess-1',
      endedAt: '2025-06-01T12:00:00Z',
      durationSeconds: 120,
      compositeScore: 72,
    };

    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual(session);
  });

  it('returns 400 when id is missing', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endedAt: '2025-06-01T12:00:00Z' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/id/i);
  });

  it('returns 400 when body is empty', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/sessions (after POSTs)', () => {
  it('returns saved sessions sorted by date descending', async () => {
    const older = {
      id: 'sess-old',
      endedAt: '2025-05-01T10:00:00Z',
      compositeScore: 60,
    };
    const newer = {
      id: 'sess-new',
      endedAt: '2025-06-15T18:00:00Z',
      compositeScore: 85,
    };

    // Post the older session first, then the newer one
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(older),
    });
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newer),
    });

    const res = await fetch(`${baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(2);
    // Newest first
    expect(body[0].id).toBe('sess-new');
    expect(body[1].id).toBe('sess-old');
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns a session by id', async () => {
    const session = {
      id: 'sess-find-me',
      endedAt: '2025-07-01T09:00:00Z',
      compositeScore: 90,
    };
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });

    const res = await fetch(`${baseUrl}/api/sessions/sess-find-me`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('sess-find-me');
    expect(body.compositeScore).toBe(90);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/does-not-exist`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe('DELETE /api/sessions', () => {
  it('clears all sessions', async () => {
    // Seed a session first
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'to-delete', endedAt: '2025-08-01T00:00:00Z' }),
    });

    const delRes = await fetch(`${baseUrl}/api/sessions`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.cleared).toBe(true);

    // Verify sessions are empty
    const getRes = await fetch(`${baseUrl}/api/sessions`);
    const sessions = await getRes.json();
    expect(sessions).toEqual([]);
  });
});

describe('Multiple POSTs persist correctly', () => {
  it('accumulates sessions across multiple POST requests', async () => {
    const sessions = [
      { id: 'multi-1', endedAt: '2025-09-01T08:00:00Z', compositeScore: 50 },
      { id: 'multi-2', endedAt: '2025-09-02T08:00:00Z', compositeScore: 60 },
      { id: 'multi-3', endedAt: '2025-09-03T08:00:00Z', compositeScore: 70 },
    ];

    for (const session of sessions) {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      expect(res.status).toBe(201);
    }

    const res = await fetch(`${baseUrl}/api/sessions`);
    const body = await res.json();

    expect(body).toHaveLength(3);
    // Sorted newest first
    expect(body[0].id).toBe('multi-3');
    expect(body[1].id).toBe('multi-2');
    expect(body[2].id).toBe('multi-1');
  });

  it('each saved session is retrievable by id', async () => {
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'abc-1', endedAt: '2025-10-01T00:00:00Z' }),
    });
    await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'abc-2', endedAt: '2025-10-02T00:00:00Z' }),
    });

    const res1 = await fetch(`${baseUrl}/api/sessions/abc-1`);
    expect(res1.status).toBe(200);
    const s1 = await res1.json();
    expect(s1.id).toBe('abc-1');

    const res2 = await fetch(`${baseUrl}/api/sessions/abc-2`);
    expect(res2.status).toBe(200);
    const s2 = await res2.json();
    expect(s2.id).toBe('abc-2');
  });
});
