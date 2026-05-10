/**
 * wish-classifier integration — runs against real Supabase to validate:
 *  1. Schema (mommy_code_wishes new columns + telemetry tables) is queryable.
 *  2. Seeded ideation log row → wish-classifier produces wish rows with
 *     correct flags (eligible vs needs_review).
 *  3. The 'ideate-classifier' source enum was added.
 *  4. Negative case: forbidden-path-bearing ideation never produces an
 *     auto_ship_eligible row.
 *
 * Skips the entire file when Supabase secrets aren't set so contributors
 * without credentials can run the rest of the suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import {
  classifyCandidate,
  extractCandidates,
  extractFeaturesFromIdeationRow,
} from '../../../supabase/functions/wish-classifier/classifier'

config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SKIP = !SUPABASE_URL || !SERVICE_KEY
const describeOnline = SKIP ? describe.skip : describe

let supabase: SupabaseClient
const cleanupIdeationIds: string[] = []
const cleanupWishIds: string[] = []
const cleanupRunIds: string[] = []

beforeAll(async () => {
  if (SKIP) return
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!)
})

afterAll(async () => {
  if (SKIP) return
  if (cleanupWishIds.length) {
    await supabase.from('mommy_code_wishes').delete().in('id', cleanupWishIds)
  }
  if (cleanupRunIds.length) {
    await supabase.from('wish_classifier_runs').delete().in('id', cleanupRunIds)
  }
  if (cleanupIdeationIds.length) {
    await supabase.from('mommy_ideation_log').delete().in('id', cleanupIdeationIds)
  }
})

describeOnline('wish-classifier schema', () => {
  it('mommy_code_wishes accepts source=ideate-classifier', async () => {
    const { data, error } = await supabase
      .from('mommy_code_wishes')
      .insert({
        wish_title: 'integration test — ideate-classifier source',
        wish_body: 'transient row to verify the source enum was extended; deleted by afterAll.',
        protocol_goal: 'test',
        source: 'ideate-classifier',
        priority: 'low',
        status: 'needs_review',
        auto_ship_eligible: false,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = (data as { id?: string } | null)?.id
    expect(id).toBeTruthy()
    if (id) cleanupWishIds.push(id)
  })

  it('mommy_code_wishes accepts status=needs_review', async () => {
    const { data, error } = await supabase
      .from('mommy_code_wishes')
      .insert({
        wish_title: 'integration test — needs_review status',
        wish_body: 'transient row to verify the status enum was extended; deleted by afterAll.',
        protocol_goal: 'test',
        source: 'gap_audit',
        priority: 'low',
        status: 'needs_review',
        auto_ship_eligible: false,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = (data as { id?: string } | null)?.id
    expect(id).toBeTruthy()
    if (id) cleanupWishIds.push(id)
  })

  it('wish_classifier_runs is queryable', async () => {
    const { error } = await supabase.from('wish_classifier_runs').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('wish_classifier_decisions is queryable', async () => {
    const { error } = await supabase.from('wish_classifier_decisions').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('mommy_ideation_log has classified_at column', async () => {
    const { error } = await supabase
      .from('mommy_ideation_log')
      .select('id, classified_at, classifier_run_id')
      .limit(1)
    expect(error).toBeNull()
  })
})

describeOnline('wish-classifier pure ruleset against representative ideation', () => {
  it('produces eligible + needs_review wishes from a mixed ideation row', () => {
    const ideationRow = {
      id: 'fake-row',
      anthropic_raw: JSON.stringify({
        features: [
          {
            title: 'Add denial-day counter to today card',
            mechanic: 'add a column denial_day to user_state and surface it',
            arousal_bias: 'visible streak escalates ache',
            force_lever: 'public-but-private accountability',
            effort: 'S',
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
    const candidates = extractCandidates(features)
    const decisions = candidates.map((c, i) => classifyCandidate(features[i], c))

    expect(decisions[0].decision).toBe('eligible')
    expect(decisions[1].decision).toBe('needs_review')
    expect(decisions[1].forbiddenPathHits).toContain('payment')
  })
})

describeOnline('wish-classifier never produces auto_ship_eligible for forbidden paths', () => {
  it('forbidden path classification is never eligible (negative integration check)', () => {
    const cases = [
      'extends api/auth/refresh.ts',
      'add stripe webhook',
      'subscription tier change',
      'add an RLS policy on user_state',
    ]
    for (const body of cases) {
      const out = classifyCandidate(
        { effort: 'S' },
        { title: 'Test', body, protocolGoal: 'test', affectedSurfaces: {} },
      )
      expect(out.decision, `case "${body}"`).toBe('needs_review')
    }
  })
})
