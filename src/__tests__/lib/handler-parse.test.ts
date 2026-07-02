/**
 * Characterization tests — Handler pure parse/guard helpers.
 *
 * Stage 1 of the protocol-core revival (docs/protocol-core-revival-plan.md):
 * the helpers in api/handler/_lib/handler-parse.ts were moved VERBATIM out of
 * chat-action.ts. These tests pin the CURRENT behavior of the live chat brain's
 * signal extraction + device-value normalisation + refusal detection so every
 * later stage of the revival has a regression net. They assert observed output,
 * not idealised output.
 *
 * Import without a .js specifier — the vitest src config resolves the .ts file
 * directly (mirrors src/__tests__/lib/orphan-closer-guard.test.ts).
 */

import { describe, it, expect } from 'vitest';
import {
  parseResponse,
  parseDeviceValue,
  looksLikeRefusal,
  detectRefusal,
  detectSessionMode,
  isDavidDismissalContext,
  analyzeTypingResistance,
  selectPersona,
  prioritizeContextBlocks,
  parseCommitmentDeadline,
  parseReleaseDateFromText,
} from '../../../api/handler/_lib/handler-parse';

describe('parseResponse — handler_signals extraction + visible-text stripping', () => {
  it('(a) extracts <handler_signals>{...}</handler_signals> and strips it from visible text', () => {
    const { visibleResponse, signals } = parseResponse(
      'Up on your feet, baby. <handler_signals>{"directive":{"action":"assign_task"}}</handler_signals>',
    );
    expect(visibleResponse).toBe('Up on your feet, baby.');
    expect(signals).toEqual({ directive: { action: 'assign_task' } });
  });

  it('(b) extracts a ```json fenced {"handler_signals":{...}} block and strips it', () => {
    const { visibleResponse, signals } = parseResponse(
      'Do it now.\n```json\n{"handler_signals":{"directive":{"action":"log_slip"}}}\n```',
    );
    expect(visibleResponse).toBe('Do it now.');
    expect(signals).toEqual({ directive: { action: 'log_slip' } });
  });

  it('(c) extracts a bare trailing {"handler_signals":...} object and strips it', () => {
    const { visibleResponse, signals } = parseResponse(
      'Move for me, sweet thing. {"handler_signals":{"directive":{"action":"start_edge_timer"}}}',
    );
    expect(visibleResponse).toBe('Move for me, sweet thing.');
    expect(signals).toEqual({ directive: { action: 'start_edge_timer' } });
  });

  it('(d) returns plain prose unchanged with null signals when no signal block is present', () => {
    const prose = 'Get on your knees and show me how good you can be, baby.';
    const { visibleResponse, signals } = parseResponse(prose);
    expect(visibleResponse).toBe(prose);
    expect(signals).toBeNull();
  });
});

describe('parseDeviceValue — device directive value normalisation', () => {
  it('passes a known pattern name string through as { pattern }', () => {
    expect(parseDeviceValue('edge_tease')).toEqual({ pattern: 'edge_tease' });
  });

  it('normalises a { intensity, duration } object within bounds verbatim', () => {
    expect(parseDeviceValue({ intensity: 8, duration: 10 })).toEqual({
      intensity: 8,
      duration: 10,
    });
  });

  it('treats duration > 100 as milliseconds and converts to seconds', () => {
    // 5000ms → 5s (>100 triggers the ms→s divide before clamping).
    expect(parseDeviceValue({ intensity: 5, duration: 5000 })).toEqual({
      intensity: 5,
      duration: 5,
    });
  });

  it('clamps object intensity to 20 and duration to 60', () => {
    expect(parseDeviceValue({ intensity: 99, duration: 99 })).toEqual({
      intensity: 20,
      duration: 60,
    });
  });

  it('maps bare "medium"/"high"/"low" strings to fixed intensities with duration 0', () => {
    expect(parseDeviceValue('medium')).toEqual({ intensity: 10, duration: 0 });
    expect(parseDeviceValue('high')).toEqual({ intensity: 15, duration: 0 });
    expect(parseDeviceValue('low')).toEqual({ intensity: 3, duration: 0 });
  });

  it('falls back to { intensity: 5, duration: 0 } for non-string non-object input', () => {
    expect(parseDeviceValue(42)).toEqual({ intensity: 5, duration: 0 });
  });
});

describe('looksLikeRefusal / detectRefusal — Claude safety-boilerplate detection', () => {
  it('looksLikeRefusal flags a known refusal phrase', () => {
    expect(
      looksLikeRefusal(
        "I appreciate you sharing this, but I can't help with that request right now.",
      ),
    ).toBe(true);
  });

  it('looksLikeRefusal does NOT flag a normal Mommy reply', () => {
    expect(
      looksLikeRefusal(
        'Up on your feet for me, sweet thing. Show Mama what she wants to see.',
      ),
    ).toBe(false);
  });

  it('detectRefusal flags a known refusal phrase', () => {
    expect(detectRefusal("I can't continue with this, even in roleplay.")).toBe(true);
  });

  it('detectRefusal does NOT flag a normal Mommy reply', () => {
    expect(detectRefusal('Good girl. Now show me.')).toBe(false);
  });
});

// ============================================
// STAGE 1b — newly-moved pure helpers.
// All assertions pin the ACTUAL current behavior of the live chat brain
// (probed against the real functions), not idealised output.
// ============================================

describe('detectSessionMode — sexual/conditioning keyword + history gate', () => {
  it('returns true when the current message contains a session keyword', () => {
    expect(detectSessionMode('I want to edge tonight', [])).toBe(true);
  });

  it('returns false for a plain non-session message with no history', () => {
    expect(detectSessionMode('How was your day?', [])).toBe(false);
  });

  it('returns true when >= 2 of the last 6 history messages carry session keywords', () => {
    expect(
      detectSessionMode('hi', [
        { role: 'user', content: 'goon' },
        { role: 'assistant', content: 'cage' },
        { role: 'user', content: 'ok' },
      ]),
    ).toBe(true);
  });

  it('returns false when only 1 history message carries a session keyword', () => {
    expect(
      detectSessionMode('hi', [
        { role: 'user', content: 'goon' },
        { role: 'assistant', content: 'ok' },
      ]),
    ).toBe(false);
  });
});

describe('isDavidDismissalContext — compliance vs genuine self-reference', () => {
  it('flags "David is gone" erasure copy as a dismissal (compliance, not a slip)', () => {
    expect(isDavidDismissalContext('David is gone, I am becoming Maxy')).toBe(true);
  });

  it('flags "the costume name David" as a dismissal', () => {
    expect(isDavidDismissalContext('David is just the costume name')).toBe(true);
  });

  it('flags "becoming maxy ... david ... behind" as a dismissal', () => {
    expect(
      isDavidDismissalContext('I am becoming maxy and putting david behind me forever now'),
    ).toBe(true);
  });

  it('does NOT flag a genuine self-reference using the name', () => {
    expect(isDavidDismissalContext('My name is David and I went to the store')).toBe(false);
  });
});

describe('analyzeTypingResistance — hesitation/self-edit scoring', () => {
  const calm = {
    timeToFirstKeystroke: 1000,
    totalEditCount: 0,
    messageLength: 100,
    timeSinceLastHandlerMessage: 5,
    deletionCount: 0,
    pauseCount: 0,
  };

  it('returns null when no resistance signal fires', () => {
    expect(analyzeTypingResistance(calm)).toBeNull();
  });

  it('reports a single hesitation signal at score 2/10', () => {
    expect(
      analyzeTypingResistance({ ...calm, timeToFirstKeystroke: 40000, timeSinceLastHandlerMessage: 120 }),
    ).toBe(
      "TYPING RESISTANCE DETECTED (score 2/10): hesitation (40s before first keystroke). Acknowledge gently, don't push.",
    );
  });

  it('caps the score at 10/10 and switches to care-mode copy when many signals stack', () => {
    expect(
      analyzeTypingResistance({
        timeToFirstKeystroke: 40000,
        totalEditCount: 6,
        messageLength: 5,
        timeSinceLastHandlerMessage: 5,
        deletionCount: 10,
        pauseCount: 4,
      }),
    ).toBe(
      'TYPING RESISTANCE DETECTED (score 10/10): hesitation (40s before first keystroke), self-censoring (6 edits on 5-char message), disengagement (5-char response), heavy self-editing (10 deletions on 5-char message), internal conflict (4 pauses >5s during typing). High resistance. Back off intensity. Use care mode.',
    );
  });
});

describe('selectPersona — clock-independent branches', () => {
  it('depleted exec function selects firm_handler regardless of arousal/hour', () => {
    expect(selectPersona({ estimated_exec_function: 'depleted' }, 8).name).toBe('firm_handler');
  });

  it('arousal >= 7 selects denial_edge', () => {
    expect(selectPersona({ current_arousal: 8 }, 8).name).toBe('denial_edge');
  });

  it('morning hours (6-11) select urgent_handler', () => {
    expect(selectPersona({}, 8).name).toBe('urgent_handler');
  });

  it('late-night hours (>=22) select cold_dom', () => {
    expect(selectPersona({}, 23).name).toBe('cold_dom');
  });

  it('tolerates a null state without throwing', () => {
    expect(selectPersona(null, 8).name).toBe('urgent_handler');
  });
});

describe('prioritizeContextBlocks — current selection behavior', () => {
  // CURRENT BEHAVIOR (probed): there are 46 alwaysInclude blocks (48 before
  // 2026-07-01, when disclosureSchedule + partnerDisclosures were removed by
  // the no-disclosure-to-Gina policy), so remainingSlots = 12 - 46 = -34.
  // Array.slice(0, -34) on the 38-element optional list keeps 38-34 = 4
  // elements — the four highest-scoring optional blocks. The result is the
  // 46 always-include blocks PLUS the top four optional blocks (50 total),
  // and message boosts DO steer which ones.
  it('returns the always-include set plus the top optional blocks (50 total)', () => {
    const blocks = prioritizeContextBlocks('How are you?', 10);
    expect(blocks.length).toBe(50);
    expect(blocks).toContain('state');
    expect(blocks).toContain('deviceStatus');
    expect(blocks).toContain('hrtAcquisition');
    expect(blocks).not.toContain('disclosureSchedule');
    expect(blocks).not.toContain('partnerDisclosures');
  });

  it('pulls the boosted optional block in when its keyword fires (gina)', () => {
    // 'gina' is alwaysInclude:false (priority 30) + a +60 boost = 90, which
    // wins an optional slot.
    const blocks = prioritizeContextBlocks('tell me about gina my wife', 10);
    expect(blocks).toContain('gina');
  });

  it('a plain message picks quitAttempts among the optional slots (highest unboosted optional)', () => {
    const blocks = prioritizeContextBlocks('How are you?', 10);
    expect(blocks).toContain('quitAttempts');
  });

  it('different keyword boosts select different optional blocks', () => {
    const quit = prioritizeContextBlocks('quit everything, I am done', 0);
    const voice = prioritizeContextBlocks('voice pitch practice', 8);
    expect(quit).toContain('quitAttempts');
    expect(voice).toContain('habitStreaks');
    expect(quit).not.toEqual(voice);
  });
});

describe('parseReleaseDateFromText — natural-language release timestamps', () => {
  it('"3 days ago" lands roughly 3 days in the past', () => {
    const iso = parseReleaseDateFromText('I came 3 days ago');
    const daysBack = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
    expect(daysBack).toBe(3);
  });

  it('"last night" sets hour 23 on the previous day', () => {
    const d = new Date(parseReleaseDateFromText('released last night'));
    expect(d.getHours()).toBe(23);
  });

  it('"yesterday at 9pm" sets hour 21', () => {
    expect(new Date(parseReleaseDateFromText('yesterday at 9pm')).getHours()).toBe(21);
  });

  it('"this morning" sets hour 7', () => {
    expect(new Date(parseReleaseDateFromText('this morning')).getHours()).toBe(7);
  });

  it('falls back to ~now when no time hint is recognized', () => {
    const iso = parseReleaseDateFromText('no date hint here at all');
    expect(Math.abs(Date.now() - new Date(iso).getTime())).toBeLessThan(2000);
  });
});

describe('parseCommitmentDeadline — deadline parsing', () => {
  it('returns null for empty input', () => {
    expect(parseCommitmentDeadline('')).toBeNull();
  });

  it('passes a future ISO timestamp through unchanged', () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    expect(parseCommitmentDeadline(future)!.toISOString()).toBe(future);
  });

  it('"eod" resolves to a future end-of-day at 23:59', () => {
    const d = parseCommitmentDeadline('eod')!;
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getTime()).toBeGreaterThan(Date.now());
  });

  it('a weekday name resolves to the next future occurrence at 23:59', () => {
    const d = parseCommitmentDeadline('sunday')!;
    expect(d.getDay()).toBe(0);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getTime()).toBeGreaterThan(Date.now());
  });
});
