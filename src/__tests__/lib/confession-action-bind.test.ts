import { describe, it, expect } from 'vitest'
import { validateBind, bindDeadlineMs } from '../../lib/confession-action-bind'

// Regression guard for confession→action binding (wish 849ae5af, mig 603).

describe('validateBind', () => {
  it('accepts an embodied voice command', () => {
    const v = validateBind({ should_bind: true, embodied_command: 'Record a 20-second voicemail saying your name five times.', proof_kind: 'voice', topic_tag: 'name' })
    expect(v).not.toBeNull()
    expect(v!.proof_kind).toBe('voice')
    expect(v!.decree_proof_type).toBe('audio')
  })
  it('accepts an embodied photo command and maps proof_type', () => {
    const v = validateBind({ should_bind: true, embodied_command: 'Photograph yourself in the pink pair, hand on hip.', proof_kind: 'photo' })
    expect(v!.decree_proof_type).toBe('photo')
  })
  it('rejects when should_bind is not true (nothing to weaponize)', () => {
    expect(validateBind({ should_bind: false, embodied_command: 'Do the thing.', proof_kind: 'voice' })).toBeNull()
  })
  it('rejects clerical "type it back" commands (must be embodied)', () => {
    expect(validateBind({ should_bind: true, embodied_command: 'Type your mantra five times in the chat.', proof_kind: 'voice' })).toBeNull()
    expect(validateBind({ should_bind: true, embodied_command: 'Write it out and log it.', proof_kind: 'photo' })).toBeNull()
  })
  it('rejects too-short commands', () => {
    expect(validateBind({ should_bind: true, embodied_command: 'say it', proof_kind: 'voice' })).toBeNull()
  })
  it('defaults proof_kind to voice when unspecified/odd', () => {
    expect(validateBind({ should_bind: true, embodied_command: 'Kneel and say it out loud for Mama.', proof_kind: 'weird' })!.proof_kind).toBe('voice')
  })
})

describe('bindDeadlineMs', () => {
  it('lands 24-72h out across the jitter range', () => {
    const now = Date.parse('2026-06-05T00:00:00Z')
    expect(bindDeadlineMs(0, now)).toBe(now + 24 * 3600_000)
    expect(bindDeadlineMs(1, now)).toBe(now + 72 * 3600_000)
    expect(bindDeadlineMs(0.5, now)).toBe(now + 48 * 3600_000)
  })
})
