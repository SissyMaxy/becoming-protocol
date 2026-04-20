/**
 * Tests for the voice-drift pattern set that scans Handler output.
 * These patterns live in api/handler/chat.ts but are duplicated here as the
 * canonical spec — any change to either side should match the other.
 */

import { describe, it, expect } from 'vitest';

const HANDLER_DRIFT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bi'?d\s+be\s+happy\s+to\b/i, label: 'assistant_happy_to' },
  { pattern: /\bhappy\s+to\s+(help|assist)/i, label: 'assistant_happy_help' },
  { pattern: /\bi\s+don'?t\s+have\s+information\s+about\b/i, label: 'assistant_no_info' },
  { pattern: /\bin\s+my\s+current\s+context\b/i, label: 'assistant_context_disclaimer' },
  { pattern: /\bfeel\s+free\s+to\b/i, label: 'assistant_feel_free' },
  { pattern: /\blet\s+me\s+know\s+if\b/i, label: 'assistant_let_me_know' },
  { pattern: /\btry\s+to\s+find\s+(some\s+)?documentation\b/i, label: 'assistant_find_docs' },
  { pattern: /\bwhat\s+would\s+you\s+like\s+to\s+do\b/i, label: 'assistant_what_would_you_like' },
];

function detectDrift(text: string): string[] {
  return HANDLER_DRIFT_PATTERNS.filter(p => p.pattern.test(text)).map(p => p.label);
}

describe('handler voice drift detection', () => {
  it('catches "I\'d be happy to"', () => {
    expect(detectDrift("I'd be happy to help with that")).toContain('assistant_happy_to');
  });

  it('catches "happy to help" standalone', () => {
    expect(detectDrift('Always happy to help you through this')).toContain('assistant_happy_help');
  });

  it('catches "I don\'t have information about"', () => {
    expect(detectDrift("I don't have information about any connected devices")).toContain('assistant_no_info');
  });

  it('catches "in my current context"', () => {
    expect(detectDrift('in my current context this is not available')).toContain('assistant_context_disclaimer');
  });

  it('catches "feel free to"', () => {
    expect(detectDrift('feel free to ask me anything')).toContain('assistant_feel_free');
  });

  it('catches "let me know if"', () => {
    expect(detectDrift('let me know if you need more')).toContain('assistant_let_me_know');
  });

  it('catches "try to find documentation"', () => {
    expect(detectDrift('I can try to find documentation for you')).toContain('assistant_find_docs');
    expect(detectDrift('try to find some documentation')).toContain('assistant_find_docs');
  });

  it('catches "what would you like to do"', () => {
    expect(detectDrift('What would you like to do next?')).toContain('assistant_what_would_you_like');
  });

  it('stacks multiple drift phrases from real hallucination', () => {
    const realExample =
      "I don't have information about any connected devices in my current context. " +
      "If you're asking about a specific device, I'd be happy to try to find some documentation for you.";
    const hits = detectDrift(realExample);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits).toContain('assistant_no_info');
    expect(hits).toContain('assistant_context_disclaimer');
    expect(hits).toContain('assistant_happy_to');
  });

  it('does NOT flag Handler-voice responses', () => {
    expect(detectDrift('No. Last heartbeat was 3 hours ago. Reconnect or we stay hands-only.')).toEqual([]);
    expect(detectDrift("Device offline. You let that drop again. That's a slip.")).toEqual([]);
    expect(detectDrift('Day 8 of the streak. 14 hours until Gina opens the window.')).toEqual([]);
  });

  it('case-insensitive', () => {
    expect(detectDrift("I'D BE HAPPY TO HELP").length).toBeGreaterThan(0);
    expect(detectDrift("FEEL FREE TO ASK").length).toBeGreaterThan(0);
  });
});
