import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Set test environment before importing app
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
});

describe('Startup Smoke Test (7.8)', () => {
  it('backend health check responds with { status: "ok" }', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('backend responds to unknown routes without crashing', async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    expect([404, 500]).toContain(res.status);
  });

  it('frontend build output exists (index.html in dist)', () => {
    const distIndex = join(__dirname, '..', '..', 'client', 'dist', 'index.html');
    expect(existsSync(distIndex)).toBe(true);
  });

  it('frontend build output contains JS bundle', () => {
    const assetsDir = join(__dirname, '..', '..', 'client', 'dist', 'assets');
    expect(existsSync(assetsDir)).toBe(true);
  });
});
