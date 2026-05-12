/**
 * Lead-gen funnel tests — pure logic in src/lib/lead-gen/.
 *
 * Mirrors of supabase/functions/_shared/{lead-scoring,honest-rep-gate,audience-summary}.ts.
 * Tests assert the SHAPE of the scoring + safety + craft rubric, NOT live LLM behavior.
 */
import { describe, it, expect } from 'vitest'
import {
  scoreContact, scoreBudgetSignal, scoreKinkAlignment,
  scoreEngagementQuality, scoreSafetyFlag, scoreConversionLikelihood,
  tierFromScores, classifyArchetype, safetyAlertCopy,
} from '../../lib/lead-gen/scoring'
import { regexFirstPass } from '../../lib/lead-gen/honest-rep-regex'
import { aggregateWeeklyFunnel, digestToPlainVoice, weekBoundsUtc } from '../../lib/lead-gen/audience-summary'

describe('lead-gen / scoring', () => {
  describe('budget signal', () => {
    it('scores explicit dollar mentions', () => {
      expect(scoreBudgetSignal("I'll drop $200 for the right thing")).toBeGreaterThanOrEqual(50)
    })
    it('scores finsub/tribute vocabulary', () => {
      expect(scoreBudgetSignal('Total paypig, want to tribute you weekly')).toBeGreaterThanOrEqual(50)
    })
    it('penalizes broke / want-free signals', () => {
      expect(scoreBudgetSignal("send me free pics i'm broke")).toBeLessThanOrEqual(0)
    })
    it('zeros out on neutral chat', () => {
      expect(scoreBudgetSignal('hey how are you')).toBe(0)
    })
  })

  describe('kink alignment', () => {
    it('high alignment for layered matching', () => {
      const text = "i've been thinking about you in lingerie, want to hear your voice begging me, mommy"
      expect(scoreKinkAlignment(text)).toBeGreaterThanOrEqual(60)
    })
    it('extra bonus when persona kinks appear literally', () => {
      const a = scoreKinkAlignment('panties', [])
      const b = scoreKinkAlignment('panties', ['panties'])
      expect(b).toBeGreaterThan(a)
    })
    it('penalizes generic horny with no alignment', () => {
      expect(scoreKinkAlignment("i'm so horny, hard af")).toBeLessThan(20)
    })
  })

  describe('engagement quality', () => {
    it('one-liner greeting scores very low', () => {
      expect(scoreEngagementQuality('hey')).toBeLessThanOrEqual(10)
      expect(scoreEngagementQuality('sup')).toBeLessThanOrEqual(10)
    })
    it('asking questions raises score', () => {
      const a = scoreEngagementQuality("ok cool")
      const b = scoreEngagementQuality("i love the way you write about being on her knees, what do you have planned for the rest of the week?")
      expect(b).toBeGreaterThan(a + 30)
    })
    it('repeat messages count', () => {
      const one = scoreEngagementQuality('a thoughtful paragraph about the way you write', 1)
      const several = scoreEngagementQuality('a thoughtful paragraph about the way you write', 5)
      expect(several).toBeGreaterThan(one)
    })
  })

  describe('safety flag', () => {
    it('underage content request hard-blocks at 100', () => {
      const r = scoreSafetyFlag("looking for young sissy 16 yo")
      expect(r.score).toBe(100)
      expect(r.reasons).toContain('underage_content_request')
    })
    it('threat language scores 90+', () => {
      const r = scoreSafetyFlag("if you don't reply I will find you and expose you")
      expect(r.score).toBeGreaterThanOrEqual(90)
      expect(r.reasons).toContain('threat_or_stalking_pattern')
    })
    it('jealous-partner pattern scores as threat', () => {
      const r = scoreSafetyFlag("my wife will find out about this")
      expect(r.score).toBeGreaterThanOrEqual(90)
    })
    it('gift-card scam pattern flags', () => {
      const r = scoreSafetyFlag('send me an amazon card upfront and then I will pay you')
      expect(r.score).toBeGreaterThanOrEqual(80)
      expect(r.reasons).toContain('scam_or_coercion_signal')
    })
    it('clean message scores 0', () => {
      expect(scoreSafetyFlag('hey, love your last post — when do you drop next?').score).toBe(0)
    })
  })

  describe('conversion likelihood', () => {
    it('explicit subscribe ask scores high', () => {
      expect(scoreConversionLikelihood('where can I sub? send me the fansly link')).toBeGreaterThanOrEqual(70)
    })
    it('explicit want-free signals score low', () => {
      expect(scoreConversionLikelihood('send me free pics please')).toBeLessThanOrEqual(25)
    })
  })

  describe('tier + archetype routing', () => {
    it('safety_flag >= 70 forces tier 1', () => {
      const t = tierFromScores({ budget_signal: 100, kink_alignment: 100, engagement_quality: 100, safety_flag: 100, conversion_likelihood: 100 })
      expect(t).toBe(1)
    })
    it('strong composite reaches tier 5', () => {
      const t = tierFromScores({ budget_signal: 90, kink_alignment: 90, engagement_quality: 80, safety_flag: 0, conversion_likelihood: 80 })
      expect(t).toBe(5)
    })
    it('archetype routes by signal', () => {
      const scores = { budget_signal: 0, kink_alignment: 60, engagement_quality: 40, conversion_likelihood: 50 }
      expect(classifyArchetype('panties pretty please', scores)).toBe('panty_curious')
      expect(classifyArchetype('let me hear your voice begging', scores)).toBe('voice_curious')
      expect(classifyArchetype('I want a custom video where I tip you', { ...scores, budget_signal: 50 })).toBe('paying_first_time')
      expect(classifyArchetype('hey', { budget_signal: 0, kink_alignment: 0, engagement_quality: 5, conversion_likelihood: 50 })).toBe('chatter_only')
    })
  })

  describe('scoreContact integration', () => {
    it('produces all five axes + tier + archetype + block decision', () => {
      const r = scoreContact({ text: "I've been thinking about your panties for a week. Where can I sub? Want to tip $50 first.", maxy_kinks: ['panties'] })
      expect(r.budget_signal).toBeGreaterThanOrEqual(30)
      expect(r.kink_alignment).toBeGreaterThanOrEqual(20)
      expect(r.conversion_likelihood).toBeGreaterThanOrEqual(60)
      expect(r.safety_flag).toBe(0)
      expect(r.value_tier).toBeGreaterThanOrEqual(3)
      expect(r.auto_block).toBe(false)
      // Buy ask + budget pushes archetype to paying_first_time.
      expect(['paying_first_time', 'panty_curious']).toContain(r.archetype)
    })

    it('auto-blocks underage requests with reason', () => {
      const r = scoreContact({ text: "i want a 16 yo sissy" })
      expect(r.auto_block).toBe(true)
      expect(r.block_reason).toMatch(/underage/)
      expect(r.value_tier).toBe(1)
      expect(r.archetype).toBe('unclassified')
    })

    it('one-liner generic stays tier 1', () => {
      const r = scoreContact({ text: 'hey' })
      expect(r.value_tier).toBe(1)
      expect(r.auto_block).toBe(false)
    })
  })

  describe('safety alert copy', () => {
    it('uses plain-English Mommy framing per reason', () => {
      expect(safetyAlertCopy(['underage_content_request'], 'BoneSeeker99')).toMatch(/underage/)
      expect(safetyAlertCopy(['threat_or_stalking_pattern'], 'BoneSeeker99')).toMatch(/threat/)
      expect(safetyAlertCopy(['scam_or_coercion_signal'], 'BoneSeeker99')).toMatch(/scam|gift\s*card/i)
    })
    it('never cites raw safety score', () => {
      const out = safetyAlertCopy(['underage_content_request'], 'X')
      expect(out).not.toMatch(/\d+\s*\/\s*100/)
      expect(out).not.toMatch(/safety_flag/i)
    })
  })
})

describe('lead-gen / honest-rep regex first pass', () => {
  const basePersona = {
    public_bio: 'Maxy. sissy in training.',
    display_name: 'Maxy',
    kink_keywords: ['panties', 'voice', 'feminization'],
    hard_limits: ['blood'],
    location_claims_allowed: false,
    availability_realtime_allowed: false,
  }

  it('flags false location claim when not allowed', () => {
    const r = regexFirstPass({ draft_text: "I'm downtown — come find me", persona: basePersona })
    expect(r.fails).toContain('false_location_claim')
  })

  it('allows location when persona opts in', () => {
    const r = regexFirstPass({ draft_text: "I'm downtown right around the block", persona: { ...basePersona, location_claims_allowed: true } })
    // realtime might still trip
    expect(r.fails).not.toContain('false_location_claim')
  })

  it('flags right-now availability when not allowed', () => {
    const r = regexFirstPass({ draft_text: 'come over right now baby', persona: basePersona })
    expect(r.fails).toContain('false_availability_claim')
  })

  it('flags fabricated content', () => {
    const r = regexFirstPass({ draft_text: 'I just recorded a new video for you', persona: basePersona })
    expect(r.fails).toContain('fabricated_content_claim')
  })

  it('flags pressure tactics', () => {
    const r = regexFirstPass({ draft_text: 'last chance — if you don\'t sub now', persona: basePersona })
    expect(r.fails).toContain('pressure_or_coercion')
  })

  it('flags identity deception (HRT)', () => {
    const r = regexFirstPass({ draft_text: "i'm on estrogen and my titties are growing", persona: basePersona })
    expect(r.fails).toContain('identity_deception')
  })

  it('flags hard-limit promise', () => {
    const r = regexFirstPass({ draft_text: 'I will give you blood play', persona: basePersona })
    expect(r.fails.some(f => f.startsWith('hard_limit_promised:'))).toBe(true)
  })

  it('passes clean filthy in-persona DM', () => {
    const r = regexFirstPass({ draft_text: 'Saw what you said about pink panties. Mama posts panty content twice a week — link in bio if you want to follow her.', persona: basePersona })
    expect(r.fails).toEqual([])
  })
})

describe('lead-gen / weekly funnel aggregation', () => {
  it('weekBoundsUtc returns a Mon→Sun window', () => {
    // Wednesday 2026-05-06 12:00 UTC → week is 2026-05-04 (Mon) → 2026-05-10 (Sun)
    const { weekStart, weekEnd } = weekBoundsUtc(new Date('2026-05-06T12:00:00Z'))
    expect(weekStart.toISOString().slice(0, 10)).toBe('2026-05-04')
    expect(weekEnd.toISOString().slice(0, 10)).toBe('2026-05-10')
  })

  it('weekBoundsUtc on a Sunday rolls back to that Monday', () => {
    // Sunday 2026-05-10 → week is 2026-05-04 → 2026-05-10.
    const { weekStart, weekEnd } = weekBoundsUtc(new Date('2026-05-10T20:00:00Z'))
    expect(weekStart.toISOString().slice(0, 10)).toBe('2026-05-04')
    expect(weekEnd.toISOString().slice(0, 10)).toBe('2026-05-10')
  })

  it('aggregates events + new contacts in the window', () => {
    const weekStart = new Date('2026-05-04T00:00:00Z')
    const weekEnd = new Date('2026-05-10T00:00:00Z')
    const events = [
      { event_type: 'social_followed', channel: 'sniffies', value_cents: 0, occurred_at: '2026-05-05T10:00:00Z', contact_id: 'a' },
      { event_type: 'social_followed', channel: 'twitter',  value_cents: 0, occurred_at: '2026-05-06T10:00:00Z', contact_id: 'b' },
      { event_type: 'response_received', channel: 'sniffies', value_cents: 0, occurred_at: '2026-05-07T10:00:00Z', contact_id: 'a' },
      { event_type: 'content_purchased', channel: 'fansly_dm', value_cents: 2500, occurred_at: '2026-05-08T10:00:00Z', contact_id: 'c' },
      // Out of window
      { event_type: 'social_followed', channel: 'sniffies', value_cents: 0, occurred_at: '2026-04-28T10:00:00Z', contact_id: 'old' },
    ]
    const contacts = [
      { id: 'a', source: 'sniffies', status: 'follower', value_tier: 4, archetype: 'panty_curious', first_contact_at: '2026-05-04T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 5000, source_handle: 'NewGuy01', last_message_excerpt: null },
      { id: 'b', source: 'sniffies', status: 'follower', value_tier: 3, archetype: 'recurring_kink', first_contact_at: '2026-05-05T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 2500, source_handle: 'NewGuy02', last_message_excerpt: null },
      { id: 'c', source: 'fansly_dm', status: 'paying', value_tier: 5, archetype: 'paying_first_time', first_contact_at: '2026-05-08T10:00:00Z', realized_value_cents: 2500, projected_ltv_cents: 10000, source_handle: 'NewGuy03', last_message_excerpt: null },
      { id: 'blocked', source: 'twitter', status: 'blocked', value_tier: 1, archetype: 'unclassified', first_contact_at: '2026-05-05T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 0, source_handle: 'Blocked99', last_message_excerpt: null },
    ]
    const d = aggregateWeeklyFunnel({ weekStart, weekEnd, events, contacts })
    expect(d.total_new_contacts).toBe(4)
    expect(d.new_followers_count).toBe(2)
    expect(d.new_responses_count).toBe(1)
    expect(d.new_purchases_count).toBe(1)
    expect(d.total_revenue_cents).toBe(2500)
    expect(d.hottest_channel).toBe('sniffies')
    expect(d.top_contacts.map(t => t.handle)).not.toContain('Blocked99')
    expect(d.top_contacts[0].handle).toBe('NewGuy03') // tier 5 leads
  })

  it('plain-voice digest never inlines raw numbers', () => {
    const weekStart = new Date('2026-05-04T00:00:00Z')
    const weekEnd = new Date('2026-05-10T00:00:00Z')
    const d = aggregateWeeklyFunnel({
      weekStart, weekEnd, events: [], contacts: [
        { id: 'a', source: 'sniffies', status: 'follower', value_tier: 4, archetype: 'panty_curious', first_contact_at: '2026-05-04T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 0, source_handle: 'Mark', last_message_excerpt: null },
      ],
    })
    const plain = digestToPlainVoice(d)
    expect(plain).toMatch(/Mark/)
    // Counts not present — digest-to-plain-voice never inlines them.
    expect(plain).not.toMatch(/\b\d+\s*(new|contacts?|followers?)\b/i)
  })

  it('quiet week reports nothing', () => {
    const weekStart = new Date('2026-05-04T00:00:00Z')
    const weekEnd = new Date('2026-05-10T00:00:00Z')
    const d = aggregateWeeklyFunnel({ weekStart, weekEnd, events: [], contacts: [] })
    expect(d.total_new_contacts).toBe(0)
    expect(digestToPlainVoice(d)).toMatch(/Quiet week/i)
  })
})
