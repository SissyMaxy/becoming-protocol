import { describe, it, expect } from 'vitest'
import {
  classifyNudges, actionForCause, healthScore, NUDGE_PATTERN_THRESHOLD,
} from '../../lib/worker-nudge-classifier'

// Regression guard for the nudge classifier (wish ce25ad0b, mig 598).

describe('classifyNudges', () => {
  it('returns unknown for no signal', () => {
    expect(classifyNudges([{ message: 'all good' }, {}])).toBe('unknown')
  })
  it('detects scheduling conflicts (stale / no recent output)', () => {
    expect(classifyNudges([
      { event_kind: 'no_recent_output', message: 'worker stale, behind schedule' },
      { event_kind: 'no_recent_output', message: 'overdue, missed tick' },
    ])).toBe('scheduling_conflict')
  })
  it('detects resource starvation (timeout / rate limit)', () => {
    expect(classifyNudges([
      { message: 'request timed out' },
      { message: 'hit rate limit 429, quota exhausted' },
    ])).toBe('resource_starvation')
  })
  it('detects logic bugs (errors / exceptions / constraints)', () => {
    expect(classifyNudges([
      { event_kind: 'check_exception', message: 'TypeError: cannot read property' },
      { message: 'constraint violation, insert failed' },
    ])).toBe('logic_bug')
  })
  it('breaks ties toward logic_bug (a real bug is not a timing blip)', () => {
    // one of each → logic wins the tie
    expect(classifyNudges([
      { message: 'stale no_recent_output' },
      { message: 'timeout rate-limit' },
      { message: 'exception failed' },
    ])).toBe('logic_bug')
  })
})

describe('actionForCause', () => {
  it('routes each cause to its fix-wish kind', () => {
    expect(actionForCause('scheduling_conflict')).toBe('schedule_restagger_wish')
    expect(actionForCause('resource_starvation')).toBe('resource_scale_wish')
    expect(actionForCause('logic_bug')).toBe('replacement_wish')
    expect(actionForCause('unknown')).toBe('none')
  })
})

describe('healthScore', () => {
  it('drops 12 points per nudge, floored at 4', () => {
    expect(healthScore(0)).toBe(100)
    expect(healthScore(5)).toBe(40)
    expect(healthScore(8)).toBe(4)
    expect(healthScore(50)).toBe(4)
  })
})

describe('threshold', () => {
  it('triggers analysis at 5 nudges/week', () => {
    expect(NUDGE_PATTERN_THRESHOLD).toBe(5)
  })
})
