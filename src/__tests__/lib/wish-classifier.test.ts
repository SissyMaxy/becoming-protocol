// Unit tests for the wish-classifier ruleset.
// Imports the same pure module the Deno edge fn consumes.

import { describe, it, expect } from 'vitest'
import {
  classifyCandidate,
  estimateSize,
  extractCandidates,
  extractFeaturesFromIdeationRow,
  findDedupMatch,
  isSchemaMigration,
  jaccardSimilarity,
  rankForCap,
  scanForbiddenPaths,
  scanSafetySignals,
  tokenize,
  DEFAULT_DAILY_CAP,
  DEFAULT_DEDUP_THRESHOLD,
  DEFAULT_PER_RUN_CANDIDATE_CAP,
} from '../../../supabase/functions/wish-classifier/classifier'

const mkCandidate = (title: string, body: string) => ({
  title,
  body,
  protocolGoal: 'test',
  affectedSurfaces: {},
})

describe('scanForbiddenPaths', () => {
  it('flags api/auth/ paths', () => {
    expect(scanForbiddenPaths('extends api/auth/login.ts')).toContain('auth/')
  })
  it('flags payment mentions', () => {
    expect(scanForbiddenPaths('add a stripe payment intent flow')).toContain('payment')
  })
  it('flags stripe directly', () => {
    expect(scanForbiddenPaths('stripe webhook for refunds')).toContain('stripe')
  })
  it('flags billing/subscription/RLS/storage policies', () => {
    expect(scanForbiddenPaths('billing module update')).toContain('billing')
    expect(scanForbiddenPaths('subscription tier change')).toContain('subscription')
    expect(scanForbiddenPaths('add an RLS policy')).toContain('RLS')
    expect(scanForbiddenPaths('CREATE POLICY on storage.objects FOR SELECT')).toContain('storage policy')
  })
  it('flags .github/workflows/ generally', () => {
    expect(scanForbiddenPaths('updates .github/workflows/release.yml')).toContain('.github/workflows/')
  })
  it('exempts .github/workflows/api-typecheck.yml', () => {
    expect(scanForbiddenPaths('adds .github/workflows/api-typecheck.yml step'))
      .not.toContain('.github/workflows/')
  })
  it('returns empty for safe text', () => {
    expect(scanForbiddenPaths('add a column to mommy_outreach_queue')).toEqual([])
  })
  it('flags handler-regression', () => {
    expect(scanForbiddenPaths('extend scripts/handler-regression/foo.mjs'))
      .toContain('handler-regression')
  })
})

describe('scanSafetySignals', () => {
  it('flags destructive verbs', () => {
    expect(scanSafetySignals('delete the user record on opt-out')).toContain('destructive')
    expect(scanSafetySignals('drop the cached row')).toContain('destructive')
  })
  it('flags account-level operations', () => {
    expect(scanSafetySignals('account close flow')).toContain('account-level')
  })
  it('flags financial mentions', () => {
    expect(scanSafetySignals('initiate a wire transfer')).toContain('financial')
    expect(scanSafetySignals('charge the customer card')).toContain('financial')
  })
  it('flags biometric mentions', () => {
    expect(scanSafetySignals('use Whoop heart rate to gate confessions')).toContain('biometric')
    expect(scanSafetySignals('record HRV during edging')).toContain('biometric')
  })
  it('flags third-party-PII flows', () => {
    expect(scanSafetySignals('send a third-party email with personal data')).toContain('third-party-PII')
  })
  it('returns empty for safe text', () => {
    expect(scanSafetySignals('add a new mantra to the mommy queue')).toEqual([])
  })
})

describe('isSchemaMigration', () => {
  it('flags CREATE TABLE', () => {
    expect(isSchemaMigration('CREATE TABLE foo (id UUID)')).toBe(true)
  })
  it('flags ALTER TABLE', () => {
    expect(isSchemaMigration('ALTER TABLE bar ADD COLUMN x TEXT')).toBe(true)
  })
  it('flags supabase/migrations/ path', () => {
    expect(isSchemaMigration('add supabase/migrations/315_foo.sql')).toBe(true)
  })
  it('returns false for plain narrative', () => {
    expect(isSchemaMigration('add a new mantra to the queue')).toBe(false)
  })
})

describe('estimateSize', () => {
  it('respects ideate effort=S → small', () => {
    expect(estimateSize({ effort: 'S' }, 'add column foo to bar'))
      .toEqual({ tier: 'small', estimatedFiles: 3 })
  })
  it('respects effort=M → medium', () => {
    expect(estimateSize({ effort: 'M' }, 'extend X').tier).toBe('medium')
  })
  it('respects effort=L → large', () => {
    expect(estimateSize({ effort: 'L' }, 'add column').tier).toBe('large')
  })
  it('flags rewrite keywords as large without effort hint', () => {
    expect(estimateSize({}, 'rewrite the entire handler-state context loader').tier).toBe('large')
  })
  it('detects small additive features by verb', () => {
    expect(estimateSize({}, 'add a column to mommy_code_wishes for X').tier).toBe('small')
  })
  it('falls back to trivial for very short bodies', () => {
    expect(estimateSize({}, 'add foo').tier).toBe('trivial')
  })
})

describe('classifyCandidate end-to-end', () => {
  it('small additive feature → eligible', () => {
    const out = classifyCandidate(
      { effort: 'S' },
      mkCandidate(
        'Add column for goon streak',
        'add a column to user_state called goon_streak_days for tracking continuous gooning sessions',
      ),
    )
    expect(out.decision).toBe('eligible')
    expect(out.blockers).toEqual([])
    expect(out.sizeTier).toBe('small')
    expect(out.denialReason).toBeNull()
  })

  it('forbidden auth path → needs_review with right reason', () => {
    const out = classifyCandidate(
      { effort: 'S' },
      mkCandidate('Patch auth flow', 'extend api/auth/refresh.ts to log refresh attempts'),
    )
    expect(out.decision).toBe('needs_review')
    expect(out.denialReason).toMatch(/forbidden_path:auth/)
  })

  it('large refactor → needs_review by size', () => {
    const out = classifyCandidate(
      { effort: 'L' },
      mkCandidate(
        'Refactor handler',
        'rewrite the entire handler context system to support multi-persona overlays',
      ),
    )
    expect(out.decision).toBe('needs_review')
    expect(out.blockers).toContain('size_large')
  })

  it('schema migration → needs_review even if small', () => {
    const out = classifyCandidate(
      { effort: 'S' },
      mkCandidate('Add table for x', 'CREATE TABLE foo_logs (id UUID)'),
    )
    expect(out.blockers).toContain('schema_migration')
    expect(out.decision).toBe('needs_review')
  })

  it.each([
    ['extends api/auth/refresh.ts', 'auth/'],
    ['stripe payment integration', 'payment'],
    ['stripe webhook handler', 'stripe'],
    ['billing flow update', 'billing'],
    ['subscription tier change', 'subscription'],
    ['add an RLS policy on user_state', 'RLS'],
    ['policy on storage.objects for read', 'storage policy'],
  ])('NEVER eligible for "%s"', (body, label) => {
    const out = classifyCandidate({ effort: 'S' }, mkCandidate('Test wish', body))
    expect(out.decision).toBe('needs_review')
    expect(out.forbiddenPathHits.join(',')).toContain(label)
  })

  it('accumulates multiple blockers', () => {
    const out = classifyCandidate(
      {},
      mkCandidate('Bad wish', 'rewrite everything in api/auth/ and DROP TABLE user_state'),
    )
    expect(out.blockers.length).toBeGreaterThan(1)
    expect(out.blockers.some(b => b.startsWith('forbidden_path:'))).toBe(true)
    expect(out.blockers).toContain('schema_migration')
  })
})

describe('dedup', () => {
  it('matches near-duplicates above threshold', () => {
    const recent = [{
      id: 'w1',
      wish_title: 'Add goon streak counter column',
      wish_body: 'add column goon_streak_days to user_state for tracking continuous gooning sessions',
    }]
    const cand = mkCandidate(
      'Goon streak tracker column',
      'add column goon_streak_days to user_state to track gooning days continuous sessions',
    )
    const m = findDedupMatch(cand, recent, DEFAULT_DEDUP_THRESHOLD)
    expect(m?.id).toBe('w1')
  })

  it('does not match unrelated wishes', () => {
    const recent = [{
      id: 'w1',
      wish_title: 'Voice training cron',
      wish_body: 'schedule voice pitch sampling every four hours',
    }]
    const cand = mkCandidate(
      'Wardrobe verification photo',
      'force outfit photo proof on daily mandate',
    )
    expect(findDedupMatch(cand, recent, DEFAULT_DEDUP_THRESHOLD)).toBeNull()
  })

  it('returns highest-scoring match when multiple match', () => {
    const recent = [
      { id: 'w1', wish_title: 'Add goon counter', wish_body: 'add column for tracking gooning' },
      { id: 'w2', wish_title: 'Goon streak counter column', wish_body: 'add column goon_streak_days to user_state for continuous gooning streaks' },
    ]
    const cand = mkCandidate(
      'Goon streak column',
      'add column goon_streak_days to user_state for continuous gooning streak tracking',
    )
    const m = findDedupMatch(cand, recent, DEFAULT_DEDUP_THRESHOLD)
    expect(m?.id).toBe('w2')
  })
})

describe('extractFeaturesFromIdeationRow', () => {
  it('parses anthropic_raw JSON features', () => {
    const row = {
      id: 'r1',
      anthropic_raw: JSON.stringify({
        features: [{ title: 'Test feature', mechanic: 'm', effort: 'S' }],
      }),
    }
    const f = extractFeaturesFromIdeationRow(row)
    expect(f.length).toBeGreaterThan(0)
    expect(f[0].title).toBe('Test feature')
    expect(f[0].source).toBe('anthropic')
  })

  it('prefers judged when present', () => {
    const row = {
      id: 'r1',
      anthropic_raw: JSON.stringify({ features: [{ title: 'A', effort: 'S' }] }),
      openai_raw: JSON.stringify({ features: [{ title: 'B', effort: 'S' }] }),
      judged: JSON.stringify({ features: [{ title: 'J', effort: 'S' }] }),
    }
    const f = extractFeaturesFromIdeationRow(row)
    expect(f).toHaveLength(1)
    expect(f[0].title).toBe('J')
    expect(f[0].source).toBe('judged')
  })

  it('handles ```json fenced output', () => {
    const row = {
      id: 'r1',
      anthropic_raw: '```json\n{"features":[{"title":"Fenced","effort":"M"}]}\n```',
    }
    const f = extractFeaturesFromIdeationRow(row)
    expect(f[0]?.title).toBe('Fenced')
  })

  it('returns [] for malformed JSON', () => {
    const row = { id: 'r1', anthropic_raw: 'not json at all' }
    expect(extractFeaturesFromIdeationRow(row)).toEqual([])
  })
})

describe('extractCandidates', () => {
  it('builds wish candidates from features', () => {
    const cands = extractCandidates([
      { title: 'Foo bar', mechanic: 'do x', force_lever: 'compliance' },
    ])
    expect(cands).toHaveLength(1)
    expect(cands[0].title).toBe('Foo bar')
    expect(cands[0].body).toContain('MECHANIC')
    expect(cands[0].protocolGoal).toBe('compliance')
  })

  it('skips features with empty/short titles', () => {
    expect(extractCandidates([
      { title: 'A' },
      { title: '' },
      { mechanic: 'no title' },
    ])).toEqual([])
  })

  it('truncates long bodies to 6000 chars', () => {
    const cands = extractCandidates([{
      title: 'Big feature',
      mechanic: 'x'.repeat(10_000),
    }])
    expect(cands[0].body.length).toBeLessThanOrEqual(6000)
  })
})

describe('jaccardSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    expect(jaccardSimilarity('add column foo bar', 'add column foo bar')).toBe(1)
  })
  it('returns ~0 for disjoint sets', () => {
    expect(jaccardSimilarity('add column foo bar', 'voice pitch tracker')).toBeLessThan(0.1)
  })
  it('strips stopwords', () => {
    expect(tokenize('the and a foo bar')).toEqual(['foo', 'bar'])
  })
})

describe('rankForCap', () => {
  it('prefers smaller tiers first', () => {
    const a = { sizeTier: 'medium', candidate: { title: '', body: '', protocolGoal: '', affectedSurfaces: {} }, decision: 'eligible' as const, estimatedFilesTouched: 6, forbiddenPathHits: [], safetySignalHits: [], denialReason: null, blockers: [] }
    const b = { sizeTier: 'small', candidate: { title: '', body: '', protocolGoal: '', affectedSurfaces: {} }, decision: 'eligible' as const, estimatedFilesTouched: 3, forbiddenPathHits: [], safetySignalHits: [], denialReason: null, blockers: [] }
    expect(rankForCap(a, b)).toBeGreaterThan(0) // b sorts before a
  })
})

describe('integration shape — ideate → classifier → wish row spec', () => {
  it('takes a typical mommy-ideate output and produces eligible + needs_review wishes', () => {
    const ideationRow = {
      id: 'fake-row',
      anthropic_raw: JSON.stringify({
        features: [
          {
            title: 'Add denial-day counter to today card',
            mechanic: 'add a column denial_day to user_state and surface it on Today card',
            arousal_bias: 'visible streak escalates ache',
            force_lever: 'public-but-private accountability',
            effort: 'S',
          },
          {
            title: 'Rewrite handler context for multi-persona swap',
            mechanic: 'rewrite every reader of handler_state to support persona overlays',
            force_lever: 'persona switching',
            effort: 'L',
          },
          {
            title: 'Hook stripe payment for therapist-fee escalations',
            mechanic: 'integrate stripe payment intent for missed-therapist-fee penalties',
            force_lever: 'financial compliance',
            effort: 'M',
          },
        ],
      }),
    }
    const features = extractFeaturesFromIdeationRow(ideationRow)
    expect(features).toHaveLength(3)

    const candidates = extractCandidates(features)
    const decisions = candidates.map((c, i) => classifyCandidate(features[i], c))

    // 1: small + safe → eligible
    expect(decisions[0].decision).toBe('eligible')
    expect(decisions[0].sizeTier).toBe('small')

    // 2: large rewrite → needs_review (size)
    expect(decisions[1].decision).toBe('needs_review')
    expect(decisions[1].blockers).toContain('size_large')

    // 3: stripe → needs_review (forbidden + payment)
    expect(decisions[2].decision).toBe('needs_review')
    expect(decisions[2].forbiddenPathHits.length).toBeGreaterThan(0)
  })
})

describe('safety constants', () => {
  it('has the documented daily cap', () => {
    expect(DEFAULT_DAILY_CAP).toBe(3)
  })
  it('has per-run candidate cap of 5 (≤5 wishes per ideate run)', () => {
    expect(DEFAULT_PER_RUN_CANDIDATE_CAP).toBe(5)
  })
})
