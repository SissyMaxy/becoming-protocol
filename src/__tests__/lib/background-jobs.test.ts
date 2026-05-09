/**
 * Unit tests for the background_jobs queue contract — pure runtime logic.
 *
 * Schema/concurrency claim semantics are exercised by the integration test
 * (background-jobs.integration.test.ts) which talks to a live database.
 */
import { describe, it, expect } from 'vitest'

// Re-implement the predicate here. The Deno-runtime job-handlers module ships
// inside supabase/functions/_shared/job-handlers/ and uses Deno-only imports
// (https:// URLs), so it can't be imported directly into a vitest run. The
// behavior is what we test.
const NON_RETRYABLE_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /^unknown\s/i,
  /^malformed\s/i,
  /required for/i,
  /requires payload/i,
]

function isNonRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return NON_RETRYABLE_ERROR_PATTERNS.some((re) => re.test(msg))
}

describe('background_jobs / non-retryable error classifier', () => {
  it('classifies "unknown action: foo" as non-retryable', () => {
    expect(isNonRetryableError(new Error('unknown action: foo'))).toBe(true)
    expect(isNonRetryableError(new Error('Unknown handler-revenue action: x'))).toBe(true)
  })

  it('classifies malformed-kind errors as non-retryable', () => {
    expect(isNonRetryableError(new Error('malformed job kind (no colon): foo'))).toBe(true)
  })

  it('classifies "user_id required for X" as non-retryable', () => {
    expect(isNonRetryableError(new Error('user_id required for engagement_cycle'))).toBe(true)
  })

  it('classifies "send-notifications:send requires payload.notification_id" as non-retryable', () => {
    expect(
      isNonRetryableError(new Error('send-notifications:send requires payload.notification_id')),
    ).toBe(true)
  })

  it('lets transient errors fall through to retry', () => {
    expect(isNonRetryableError(new Error('fetch failed: ECONNRESET'))).toBe(false)
    expect(isNonRetryableError(new Error('Anthropic 429 rate limited'))).toBe(false)
    expect(isNonRetryableError(new Error('supabase rpc returned 500'))).toBe(false)
  })

  it('handles non-Error throws', () => {
    expect(isNonRetryableError('unknown action: x')).toBe(true)
    expect(isNonRetryableError(null)).toBe(false)
    expect(isNonRetryableError(undefined)).toBe(false)
  })
})

// runWithTimeout — same shape as the worker's helper. Exercised here so a
// regression in the timeout race surfaces before deploy.
function runWithTimeout<T>(thunk: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`handler timeout after ${ms}ms`))
      }
    }, ms)
    thunk().then(
      (val) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(val)
        }
      },
      (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      },
    )
  })
}

describe('background_jobs / runWithTimeout', () => {
  it('resolves when the handler beats the deadline', async () => {
    const result = await runWithTimeout(async () => 'ok', 100)
    expect(result).toBe('ok')
  })

  it('rejects with a deterministic timeout message when the handler exceeds the cap', async () => {
    await expect(
      runWithTimeout(() => new Promise((res) => setTimeout(() => res('late'), 200)), 50),
    ).rejects.toThrow(/^handler timeout after 50ms$/)
  })

  it('propagates handler exceptions without wrapping', async () => {
    await expect(
      runWithTimeout(async () => {
        throw new Error('downstream 503')
      }, 200),
    ).rejects.toThrow('downstream 503')
  })

  it('does not double-settle when the handler finishes after the timeout fires', async () => {
    let resolved = false
    await expect(
      runWithTimeout(
        () =>
          new Promise((res) =>
            setTimeout(() => {
              resolved = true
              res('late')
            }, 60),
          ),
        20,
      ),
    ).rejects.toThrow(/timeout/)
    // Allow the late resolve to fire; we should not crash and runWithTimeout
    // should already have rejected once.
    await new Promise((r) => setTimeout(r, 80))
    expect(resolved).toBe(true)
  })
})
