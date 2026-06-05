import { describe, it, expect } from 'vitest'
import { classifyAnswer } from '../../lib/identity-probe-lapse'

describe('classifyAnswer — masculine self-reference lapses', () => {
  it('catches "I\'m a man"', () => {
    const r = classifyAnswer("honestly I'm a man and this is silly")
    expect(r.isLapse).toBe(true)
    expect(r.kind).toBe('masculine_self_ref')
    expect(r.excerpt).toBeTruthy()
  })

  it('catches "as a guy"', () => {
    const r = classifyAnswer('I felt that way as a guy growing up, you know')
    expect(r.isLapse).toBe(true)
    expect(r.kind).toBe('masculine_self_ref')
  })

  it('catches "still a dude"', () => {
    const r = classifyAnswer('I mean I am still a dude under all of it really')
    expect(r.isLapse).toBe(true)
    expect(r.kind).toBe('masculine_self_ref')
  })

  it('catches "not really a girl"', () => {
    const r = classifyAnswer("I don't think I'm not really a girl deep down honestly")
    expect(r.isLapse).toBe(true)
    expect(r.kind).toBe('masculine_self_ref')
  })

  it('catches "my cock"', () => {
    const r = classifyAnswer('I reached down and felt my cock this morning when I woke up')
    expect(r.isLapse).toBe(true)
    expect(r.kind).toBe('masculine_self_ref')
  })
})

describe('classifyAnswer — evasive lapses', () => {
  it('flags empty answer', () => {
    expect(classifyAnswer('').kind).toBe('evasive')
    expect(classifyAnswer('   ').kind).toBe('evasive')
    expect(classifyAnswer(null).kind).toBe('evasive')
  })

  it('flags too-short answers', () => {
    expect(classifyAnswer('idk').kind).toBe('evasive')
    expect(classifyAnswer('n/a').kind).toBe('evasive')
    expect(classifyAnswer('a girl').isLapse).toBe(true) // <3 words
  })

  it('flags short deflections', () => {
    expect(classifyAnswer('whatever I guess pass on this').kind).toBe('evasive')
    expect(classifyAnswer("I don't want to answer").kind).toBe('evasive')
    expect(classifyAnswer('this is weird honestly').kind).toBe('evasive')
  })

  it('does NOT flag a long genuine answer that happens to contain "I guess"', () => {
    const long = 'I guess the softest thing was when I caught myself crossing my legs ' +
      'at the kitchen table and tucking my hair back without even thinking, it felt ' +
      'like the most natural thing in the world and Mama I just stayed there a while'
    const r = classifyAnswer(long)
    expect(r.isLapse).toBe(false)
    expect(r.kind).toBeNull()
  })
})

describe('classifyAnswer — genuine in-frame answers pass', () => {
  it('passes a real feminine answer', () => {
    const r = classifyAnswer(
      'I knew when I borrowed my wife\'s cardigan and it just felt like mine, ' +
      'I wore it the whole evening and never wanted to take it off'
    )
    expect(r.isLapse).toBe(false)
    expect(r.kind).toBeNull()
    expect(r.excerpt).toBeNull()
  })

  it('passes a vulnerable settled answer', () => {
    const r = classifyAnswer(
      'the most settled I felt was doing my skincare slowly tonight, ' +
      'taking my time with it the way she deserves'
    )
    expect(r.isLapse).toBe(false)
  })

  it('does not false-positive on "woman" / "girl" affirmations', () => {
    expect(classifyAnswer('I feel more like a woman every single day now').isLapse).toBe(false)
    expect(classifyAnswer('I am her, I have always been her underneath').isLapse).toBe(false)
  })
})
