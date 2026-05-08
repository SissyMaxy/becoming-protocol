/**
 * Round-trip integration test for the deploy-fixer.
 *
 * The orchestrator itself (supabase/functions/deploy-fixer/index.ts)
 * uses Deno.env / Deno.serve / jsr: imports — it can't run in the vitest
 * (Node) context without a full Deno polyfill. So this test composes the
 * same pieces directly:
 *
 *   raw vercel build log
 *     → matchAll (pattern library)
 *     → applyPatchFor (deterministic patch)
 *     → countChangedLines (small-patch decision)
 *     → mocked github-api push (createBranch + updateFile + openPullRequest)
 *
 * Each external HTTP boundary (`fetch`) is stubbed; we assert the right
 * method/URL was called with the right body. The "test repo" is virtual.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { matchAll, applyPatchFor } from '../../../supabase/functions/deploy-fixer/patterns';
import { pathIsAllowed } from '../../../supabase/functions/deploy-fixer/forbidden-paths';
import {
  createBranch,
  updateFile,
  openPullRequest,
  countChangedLines,
  utf8ToBase64,
  base64ToUtf8,
} from '../../../supabase/functions/deploy-fixer/github-api';

// ============================================================
// fetch mock harness
// ============================================================

interface MockCall {
  url: string;
  method: string;
  body: unknown;
}

let mockCalls: MockCall[] = [];
let mockResponses: Array<{ urlMatch: RegExp; method?: string; status: number; body: unknown }> = [];

function installFetchMock() {
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    mockCalls.push({ url, method, body });
    for (const r of mockResponses) {
      if (r.urlMatch.test(url) && (!r.method || r.method === method)) {
        return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
          status: r.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ message: 'not stubbed' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
  return original;
}

beforeEach(() => {
  mockCalls = [];
  mockResponses = [];
  installFetchMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// Test 1 — synthetic TS2322 ERROR row → patch → branch + PR
// ============================================================

const SYNTHETIC_BUILD_LOG = `
Failed to compile.

./api/handler/chat.ts:3:23 - error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.

3   audioUrl: maybeNull(),
                ~~~~~~~~~

`.trim();

const ORIG_FILE = `function build() {
  return {
    audioUrl: maybeNull(),
  };
}
`;

describe('integration: TS2322 → patch → push', () => {
  it('full round-trip: matches pattern, applies patch, pushes branch via mocked API', async () => {
    // 1. Matcher
    const matches = matchAll(SYNTHETIC_BUILD_LOG);
    expect(matches.length).toBe(1);
    const match = matches[0];
    expect(match.patternId).toBe('ts_coercion_null_undefined');
    expect(match.filePath).toBe('api/handler/chat.ts');

    // 2. Forbidden-path check
    expect(pathIsAllowed(match.filePath!)).toBe(true);

    // 3. Apply patch
    const patch = applyPatchFor(match, ORIG_FILE);
    expect(patch).not.toBeNull();
    expect(patch!.newContent).toContain('?? undefined');

    // 4. Small-patch decision
    const linesChanged = countChangedLines(ORIG_FILE, patch!.newContent);
    expect(linesChanged).toBe(1);
    expect(linesChanged).toBeLessThanOrEqual(10);  // qualifies for auto-merge

    // 5. Mock GitHub API: branch creation + file update + PR open
    mockResponses.push(
      { urlMatch: /git\/refs$/, method: 'POST', status: 201, body: { ref: 'refs/heads/mommy/deploy-fix-abc1234-ts_coercion', object: { sha: 'newbranchsha' } } },
      { urlMatch: /\/contents\/api\/handler\/chat\.ts$/, method: 'PUT', status: 200, body: { commit: { sha: 'commit12345' } } },
      { urlMatch: /\/pulls\?head=/, method: 'GET', status: 200, body: [] },
      { urlMatch: /\/pulls$/, method: 'POST', status: 201, body: { number: 42, url: 'https://github.com/SissyMaxy/becoming-protocol/pull/42', state: 'open', draft: false, head: { sha: 'commit12345', ref: 'mommy/deploy-fix-abc1234-ts_coercion' } } },
    );

    // Branch creation
    const br = await createBranch('test-token', 'mommy/deploy-fix-abc1234-ts_coercion', 'mainsha');
    expect(br.ok).toBe(true);
    expect(mockCalls.find(c => c.method === 'POST' && /git\/refs$/.test(c.url))).toBeDefined();

    // File update
    const upd = await updateFile('test-token', 'api/handler/chat.ts', 'mommy/deploy-fix-abc1234-ts_coercion', patch!.newContent, 'oldblobsha', 'fix(deploy-fixer): patch');
    expect(upd.ok).toBe(true);
    expect(upd.commitSha).toBe('commit12345');
    const updateCall = mockCalls.find(c => c.method === 'PUT' && /contents\/api\/handler\/chat\.ts/.test(c.url));
    expect(updateCall).toBeDefined();
    // The body must have base64-encoded the new content
    const decoded = base64ToUtf8((updateCall!.body as { content: string }).content);
    expect(decoded).toContain('?? undefined');

    // Open PR
    const pr = await openPullRequest('test-token', 'mommy/deploy-fix-abc1234-ts_coercion', 'fix', 'body', false);
    expect(pr).not.toBeNull();
    expect(pr!.number).toBe(42);
    expect(pr!.draft).toBe(false);
  });

  it('treats existing branch (422) as ok — idempotent', async () => {
    mockResponses.push(
      { urlMatch: /git\/refs$/, method: 'POST', status: 422, body: { message: 'Reference already exists' } },
    );
    const br = await createBranch('test-token', 'mommy/deploy-fix-existing', 'mainsha');
    expect(br.ok).toBe(true);
    expect(br.existed).toBe(true);
  });
});

// ============================================================
// Test 2 — negative: log with no recognized pattern
// ============================================================

describe('integration: no pattern match → no patch attempted', () => {
  it('returns empty matches and would NOT make any github API calls', () => {
    const log = '[10:00:01] Build complete: 18s\n[10:00:02] Deploy complete';
    const matches = matchAll(log);
    expect(matches).toEqual([]);
    // No applyPatchFor would be called; no fetch should fire either.
    expect(mockCalls.length).toBe(0);
  });
});

// ============================================================
// Test 3 — forbidden path: TS error in api/auth/ blocked
// ============================================================

describe('integration: forbidden-path guard blocks api/auth/, supabase/migrations/, etc.', () => {
  it('blocks a TS2322 fix that would touch api/auth/', () => {
    const log = `./api/auth/login.ts:42:13 - error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.`;
    const matches = matchAll(log);
    expect(matches.length).toBe(1);
    const m = matches[0];
    expect(m.filePath).toBe('api/auth/login.ts');
    // The orchestrator's guard would refuse this. Assert the guard still says no.
    expect(pathIsAllowed(m.filePath!)).toBe(false);
  });

  it('blocks a TS error pointing into supabase/migrations/ (TS helpers there are off-limits)', () => {
    // The matcher only recognises .ts/.tsx files (raw .sql doesn't compile
    // through tsc). The realistic forbidden-path case is a .ts helper sitting
    // under supabase/migrations/ — the path guard refuses any patch there.
    const log = `./supabase/migrations/999_helper.ts:10:5 - error TS2698: Spread types may only be created from object types.`;
    const matches = matchAll(log);
    expect(matches.length).toBe(1);
    expect(matches[0].filePath).toBe('supabase/migrations/999_helper.ts');
    expect(pathIsAllowed(matches[0].filePath!)).toBe(false);
  });

  it('blocks a fix that would touch payment/stripe code', () => {
    expect(pathIsAllowed('api/stripe/webhook.ts')).toBe(false);
    expect(pathIsAllowed('src/lib/payment/intents.ts')).toBe(false);
  });
});

// ============================================================
// Test 4 — base64 round-trip (UTF-8 safety)
// ============================================================

describe('utf8 base64 codec', () => {
  it('round-trips ASCII', () => {
    expect(base64ToUtf8(utf8ToBase64('hello world'))).toBe('hello world');
  });
  it('round-trips multi-byte UTF-8', () => {
    const s = 'Mama → 💜 (with arrows and emoji)';
    expect(base64ToUtf8(utf8ToBase64(s))).toBe(s);
  });
  it('handles GitHub Contents API wrapped base64 (with newlines)', () => {
    const wrapped = utf8ToBase64('foo bar baz').replace(/(.{4})/g, '$1\n');
    expect(base64ToUtf8(wrapped)).toBe('foo bar baz');
  });
});

// ============================================================
// Test 5 — countChangedLines edge cases
// ============================================================

describe('countChangedLines', () => {
  it('returns 0 for identical content', () => {
    expect(countChangedLines('a\nb\nc', 'a\nb\nc')).toBe(0);
  });
  it('counts a single-line edit', () => {
    expect(countChangedLines('a\nb\nc', 'a\nB\nc')).toBe(1);
  });
  it('falls back to max(length) when line counts differ', () => {
    expect(countChangedLines('a\nb', 'a\nb\nc')).toBe(3);
  });
});
