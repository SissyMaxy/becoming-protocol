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
