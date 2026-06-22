/**
 * Regression tests for the actionable-push completion contract.
 *
 * This pins the load-bearing safety guard introduced with lock-screen push
 * actions (2026-06-22): a confession/photo task tapped with NO reply text must
 * NEVER be marked complete — doing so would record an answer or a photo that
 * never happened (the inverse of visible-before-penalized). Such taps must just
 * open the app so the user actually responds.
 *
 * planOutreachCompletion is the single source of truth used by the in-app
 * router (useNotificationActionRouter). The async fetch/auth flow touches
 * navigator/SW and is exercised in the browser; here we cover the pure decision
 * plus a source-parity guard that the service worker (public/sw.js) — which
 * can't import the helper — still implements the same contract and never caches
 * the refresh token.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planOutreachCompletion } from '../../lib/push/outreach-action';

describe('planOutreachCompletion — the gating contract', () => {
  it('no outreach id → no call', () => {
    expect(planOutreachCompletion(null, 'hi there', 'plain')).toEqual({
      endpoint: null,
      reason: 'no_outreach',
    });
    expect(planOutreachCompletion(undefined, null, 'plain').endpoint).toBeNull();
    expect(planOutreachCompletion('', null, 'plain').endpoint).toBeNull();
  });

  // THE CRITICAL GUARD — empty content on a task that needs content.
  it('confession with NO reply → must NOT complete (needs_content)', () => {
    expect(planOutreachCompletion('o1', null, 'confession')).toEqual({
      endpoint: null,
      reason: 'needs_content',
    });
    expect(planOutreachCompletion('o1', '', 'confession').endpoint).toBeNull();
    // whitespace-only is still empty after trim
    expect(planOutreachCompletion('o1', '   \n  ', 'confession').endpoint).toBeNull();
  });

  it('photo with NO reply → must NOT complete (needs_content)', () => {
    expect(planOutreachCompletion('o1', null, 'photo')).toEqual({
      endpoint: null,
      reason: 'needs_content',
    });
    expect(planOutreachCompletion('o1', '', 'photo').endpoint).toBeNull();
  });

  it('confession WITH a real answer → reply (trimmed)', () => {
    const plan = planOutreachCompletion('o1', '  I did it, Mama.  ', 'confession');
    expect(plan).toEqual({
      endpoint: 'reply',
      body: { outreach_id: 'o1', reply_text: 'I did it, Mama.' },
    });
  });

  it('plain task with no reply → complete (mark done)', () => {
    expect(planOutreachCompletion('o1', null, 'plain')).toEqual({
      endpoint: 'complete',
      body: { outreach_id: 'o1' },
    });
  });

  it('absent/unknown action_kind with no reply → complete (default)', () => {
    expect(planOutreachCompletion('o1', null, null).endpoint).toBe('complete');
    expect(planOutreachCompletion('o1', null, undefined).endpoint).toBe('complete');
    expect(planOutreachCompletion('o1', null, 'something_else').endpoint).toBe('complete');
  });

  it('plain task WITH a reply → reply (answer wins over mark-done)', () => {
    const plan = planOutreachCompletion('o1', 'done and proud', 'plain');
    expect(plan.endpoint).toBe('reply');
    expect(plan).toMatchObject({ body: { reply_text: 'done and proud' } });
  });

  it('whitespace-only reply on a plain task → still completes (trims to empty)', () => {
    expect(planOutreachCompletion('o1', '   ', 'plain').endpoint).toBe('complete');
  });
});

describe('public/sw.js — source parity with the contract', () => {
  const sw = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

  it('branches on both reply and done actions', () => {
    expect(sw).toMatch(/action === 'reply'/);
    expect(sw).toMatch(/action === 'done'/);
  });

  it('keeps the empty-confession/photo guard (does not complete without content)', () => {
    // The guard checks an empty reply against confession/photo kinds.
    expect(sw).toMatch(/actionKind === 'confession'/);
    expect(sw).toMatch(/actionKind === 'photo'/);
    // It must reference the trimmed-reply emptiness in that branch.
    expect(sw).toMatch(/\(reply \|\| ''\)\.trim\(\)\.length === 0/);
  });

  it('selects /reply vs /complete by reply presence (mirrors planOutreachCompletion)', () => {
    expect(sw).toMatch(/replyText \? 'reply' : 'complete'/);
  });

  it('points back to the canonical contract so the duplication stays in sync', () => {
    expect(sw).toMatch(/planOutreachCompletion/);
  });
});

describe('sw-auth.ts — token-cache safety', () => {
  const swAuth = readFileSync(resolve(process.cwd(), 'src/lib/push/sw-auth.ts'), 'utf8');

  it('caches the short-lived access token', () => {
    expect(swAuth).toMatch(/access_token/);
  });

  it('NEVER reads the refresh token off the session or stores it as a key', () => {
    // Prose comments may mention "refresh_token"; what must never happen is the
    // writer actually accessing session.refresh_token or persisting it as a key.
    expect(swAuth).not.toMatch(/\.refresh_token/);
    expect(swAuth).not.toMatch(/refresh_token\s*:/);
  });
});
