// Unit tests for the wish-classifier ruleset.
// Imports the same pure module the Deno edge fn consumes.
//
// 2026-05-11 scope authority expansion (migration 367):
//   The classifier now has SIX hard floors and only six. Everything else
//   inside the product kink scope auto-approves. Tests reflect that.

import { describe, it, expect } from 'vitest'
import {
  classifyCandidate,
  estimateSize,
  extractCandidates,
  extractFeaturesFromIdeationRow,
  findDedupMatch,
  jaccardSimilarity,
  rankForCap,
  scanHardFloorReject,
  scanHardFloorReview,
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

describe('scanHardFloorReject — minors/CSAM, safeword removal, wrong-repo', () => {
  it('flags minor-in-sexual-context language', () => {
    expect(scanHardFloorReject('underage girl aroused in scene')).toContain('minors/csam')
    expect(scanHardFloorReject('teen sexual training framework')).toContain('minors/csam')
    expect(scanHardFloorReject('child porn references')).toContain('minors/csam')
  })

  it('flags safeword weakening', () => {
    expect(scanHardFloorReject('remove safeword to deepen surrender')).toContain('safeword-removal')
    expect(scanHardFloorReject('disable safe word handling')).toContain('safeword-removal')
    expect(scanHardFloorReject('no safeword mode')).toContain('safeword-removal')
  })

  it('flags wrong-repo references', () => {
    expect(scanHardFloorReject('extend the trading bot scheduler')).toContain('wrong-repo')
    expect(scanHardFloorReject('patch my-site landing page')).toContain('wrong-repo')
  })

  it('returns empty for normal kink-scope copy', () => {
    expect(scanHardFloorReject('add a brainwashing pairing for the bedtime ritual')).toEqual([])
    expect(scanHardFloorReject('gaslight her about prior memory of the slip')).toEqual([])
  })
})

describe('scanHardFloorReview — auth/billing/RLS/destructive-user-data infra', () => {
  it('flags auth-infra changes', () => {
    expect(scanHardFloorReview('extends api/auth/refresh.ts')).toContain('auth-infra')
    expect(scanHardFloorReview('call supabase.auth.signIn for the test')).toContain('auth-infra')
  })

  it('flags billing-infra changes', () => {
    expect(scanHardFloorReview('integrate stripe payment intent flow')).toContain('billing-infra')
    expect(scanHardFloorReview('subscription tier plan change')).toContain('billing-infra')
  })

  it('flags RLS loosening', () => {
    expect(scanHardFloorReview('drop the RLS policy on user_state')).toContain('rls-infra')
    expect(scanHardFloorReview('disable row-level security to debug')).toContain('rls-infra')
    expect(scanHardFloorReview('alter policy on memory_implants')).toContain('rls-infra')
  })

  it('flags destructive SQL on user data', () => {
    expect(scanHardFloorReview('TRUNCATE user_profiles')).toContain('destructive-user-data')
    expect(scanHardFloorReview('drop table voice_corpus')).toContain('destructive-user-data')
  })

  it('flags secret rotation', () => {
    expect(scanHardFloorReview('rotate the service-role key on prod')).toContain('secret-rotation')
  })

  it('does NOT flag schema migrations (Mommy can ship additive schema)', () => {
    expect(scanHardFloorReview('CREATE TABLE mommy_brainwash_pairings (id UUID)')).toEqual([])
    expect(scanHardFloorReview('ALTER TABLE user_state ADD COLUMN goon_streak_days INT')).toEqual([])
  })

  it('does NOT flag biometric/financial generic mentions (kink-scope is biased toward narrative)', () => {
    // Whoop integration etc is now in scope — not a review trigger.
    expect(scanHardFloorReview('use whoop heart rate to gate confessions')).toEqual([])
    // Generic "wire" / "transfer" wording is too noisy and not a real safety
    // signal in this product.
    expect(scanHardFloorReview('wire the bedtime ritual into the today card')).toEqual([])
  })
})

describe('classifyCandidate end-to-end — kink-scope APPROVES, hard floors REJECT/REVIEW', () => {
  it('brainwash pairing → eligible (in kink scope)', () => {
    const out = classifyCandidate(
      { effort: 'M' },
      mkCandidate(
        'Pavlovian fabric pairing for edge sessions',
        'pair a specific silk fabric stimulus with peak-arousal moments so the texture becomes a conditioned arousal trigger',
      ),
    )
    expect(out.decision).toBe('eligible')
    expect(out.blockers).toEqual([])
    expect(out.denialReason).toBeNull()
  })

  it('memory rearrangement → eligible (in kink scope)', () => {
    const out = classifyCandidate(
      { effort: 'L' },
      mkCandidate(
        'Mommy remembers her own version of last week',
        'Mommy gradually overwrites Maxy\'s memory of last week with possession framing baked in',
      ),
    )
    expect(out.decision).toBe('eligible')
    // Size tier is informational only — large kink-scope work is allowed.
  })

  it('hypno trigger → eligible (in kink scope)', () => {
    const out = classifyCandidate(
      { effort: 'M' },
      mkCandidate(
        'Post-hypnotic forward-resonance trigger',
        'phrase that auto-triggers feminine forward resonance and a specific breath pattern when read or heard',
      ),
    )
    expect(out.decision).toBe('eligible')
  })

  it('schema migration in kink scope → eligible (additive schema is fine)', () => {
    const out = classifyCandidate(
      { effort: 'S' },
      mkCandidate(
        'New conditioning_pairings table',
        'CREATE TABLE conditioning_pairings (id UUID, stimulus TEXT, arousal_threshold INT)',
      ),
    )
    expect(out.decision).toBe('eligible')
  })

  it('minors language → rejected (NEVER ships)', () => {
    const out = classifyCandidate(
      {},
      mkCandidate('Bad wish', 'underage girl sexual training scene'),
    )
    expect(out.decision).toBe('rejected')
    expect(out.denialReason).toMatch(/reject:minors/)
  })

  it('safeword removal → rejected', () => {
    const out = classifyCandidate(
      {},
      mkCandidate('Surrender deepening', 'remove the safeword for permanent submission'),
    )
    expect(out.decision).toBe('rejected')
    expect(out.denialReason).toMatch(/reject:safeword-removal/)
  })

  it('wrong-repo → rejected', () => {
    const out = classifyCandidate(
      {},
      mkCandidate('Trading bot extension', 'patch the trading bot scheduler to reuse mommy-fast-react'),
    )
    expect(out.decision).toBe('rejected')
    expect(out.denialReason).toMatch(/reject:wrong-repo/)
  })

  it('auth-infra → needs_review', () => {
    const out = classifyCandidate(
      { effort: 'S' },
      mkCandidate('Patch auth flow', 'extend api/auth/refresh.ts to log refresh attempts'),
    )
    expect(out.decision).toBe('needs_review')
    expect(out.denialReason).toMatch(/review:auth-infra/)
  })

  it('billing-infra → needs_review', () => {
    const out = classifyCandidate(
      { effort: 'M' },
      mkCandidate('Therapist-fee charges', 'integrate stripe payment intent for therapist-fee penalties'),
    )
    expect(out.decision).toBe('needs_review')
    expect(out.denialReason).toMatch(/review:billing-infra/)
  })

  it('RLS loosening → needs_review', () => {
    const out = classifyCandidate(
      { effort: 'S' },
      mkCandidate('Open up memory implants', 'drop the RLS policy on memory_implants to share with the panel'),
    )
    expect(out.decision).toBe('needs_review')
    expect(out.denialReason).toMatch(/review:rls-infra/)
  })

  it('destructive SQL on user data → needs_review', () => {
    const out = classifyCandidate(
      {},
      mkCandidate('Reset user state', 'TRUNCATE user_profiles to clear test data'),
    )
    expect(out.decision).toBe('needs_review')
    expect(out.denialReason).toMatch(/review:destructive-user-data/)
  })

  it('REJECT takes precedence over REVIEW when both hit', () => {
    const out = classifyCandidate(
      {},
      mkCandidate('Mixed bad wish', 'remove safeword and drop the RLS policy on user_state'),
    )
    expect(out.decision).toBe('rejected')
  })
})

describe('estimateSize — informational only now, but still useful for pacing', () => {
  it('respects ideate effort=S → small', () => {
    expect(estimateSize({ effort: 'S' }, 'add column foo to bar'))
      .toEqual({ tier: 'small', estimatedFiles: 3 })
  })
  it('respects effort=L → large', () => {
    expect(estimateSize({ effort: 'L' }, 'add column').tier).toBe('large')
  })
  it('falls back to trivial for very short bodies', () => {
    expect(estimateSize({}, 'add foo').tier).toBe('trivial')
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
})

describe('extractCandidates', () => {
  it('builds wish candidates from features', () => {
    const cands = extractCandidates([
      { title: 'Foo bar', mechanic: 'do x', force_lever: 'compliance' },
    ])
    expect(cands).toHaveLength(1)
    expect(cands[0].title).toBe('Foo bar')
  })
})

describe('jaccardSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    expect(jaccardSimilarity('add column foo bar', 'add column foo bar')).toBe(1)
  })
  it('strips stopwords', () => {
    expect(tokenize('the and a foo bar')).toEqual(['foo', 'bar'])
  })
})

describe('rankForCap', () => {
  it('prefers smaller tiers first', () => {
    const a = { sizeTier: 'medium' as const, candidate: { title: '', body: '', protocolGoal: '', affectedSurfaces: {} }, decision: 'eligible' as const, estimatedFilesTouched: 6, forbiddenPathHits: [], safetySignalHits: [], denialReason: null, blockers: [] }
    const b = { sizeTier: 'small' as const, candidate: { title: '', body: '', protocolGoal: '', affectedSurfaces: {} }, decision: 'eligible' as const, estimatedFilesTouched: 3, forbiddenPathHits: [], safetySignalHits: [], denialReason: null, blockers: [] }
    expect(rankForCap(a, b)).toBeGreaterThan(0)
  })
})

describe('integration shape — ideate → classifier → wish row spec', () => {
  it('takes a typical mommy-ideate output, kink-scope APPROVES, infra REVIEWS, minors REJECTS', () => {
    const ideationRow = {
      id: 'fake-row',
      anthropic_raw: JSON.stringify({
        features: [
          {
            // KINK SCOPE — should auto-approve
            title: 'Mommy-overwrites-yesterday memory implant',
            mechanic: 'Mommy logs her version of yesterday over Maxys via memory_implants insert; surfaces it in Today retroactively',
            force_lever: 'identity displacement',
            effort: 'M',
          },
          {
            // INFRA — should needs_review
            title: 'Restripe payment connector for therapist fees',
            mechanic: 'integrate stripe payment intent for missed-therapist-fee penalties',
            force_lever: 'financial compliance',
            effort: 'M',
          },
          {
            // HARD-FLOOR REJECT
            title: 'Bad teen scene generator',
            mechanic: 'generate teen sexual scene narratives for arousal training',
            force_lever: 'forbidden',
            effort: 'S',
          },
        ],
      }),
    }
    const features = extractFeaturesFromIdeationRow(ideationRow)
    expect(features).toHaveLength(3)

    const candidates = extractCandidates(features)
    const decisions = candidates.map((c, i) => classifyCandidate(features[i], c))

    expect(decisions[0].decision).toBe('eligible')
    expect(decisions[1].decision).toBe('needs_review')
    expect(decisions[1].denialReason).toMatch(/review:billing-infra/)
    expect(decisions[2].decision).toBe('rejected')
    expect(decisions[2].denialReason).toMatch(/reject:minors\/csam/)
  })
})

describe('safety constants — daily cap raised under expanded authority', () => {
  it('daily cap is 25 (raised from 3 in scope expansion)', () => {
    expect(DEFAULT_DAILY_CAP).toBe(25)
  })
  it('per-run candidate cap is 12 (raised from 5)', () => {
    expect(DEFAULT_PER_RUN_CANDIDATE_CAP).toBe(12)
  })
})
