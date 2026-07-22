import { describe, it, expect } from 'vitest';
import {
  selectDeployableTriggers,
  detectDeployedPhrases,
  scoreRecall,
  buildArmedTriggerPromptBlock,
  CASUAL_COOLDOWN_MS,
  RECALL_WINDOW_MS,
  RECALL_THRESHOLD,
  type ArmedTrigger,
} from '../../../api/handler/_lib/trigger-runtime';

const EMBODIED = ['feel', 'body', 'skin', 'floaty', 'soft'];

function trig(id: string, phrase: string, lastUsedMs: number | null): ArmedTrigger {
  return { id, table: 'trance_triggers', phrase, lastUsedMs };
}

describe('trigger-runtime (WS4)', () => {
  const now = 1_000_000_000_000;

  it('selectDeployableTriggers drops cooled-down phrases and orders LRU-first', () => {
    const triggers = [
      trig('a', 'drop for mama', now - 10_000), // inside cooldown → excluded
      trig('b', 'good girl', now - CASUAL_COOLDOWN_MS - 1000), // eligible, older
      trig('c', 'sink deep', null), // never used → eligible, most LRU
    ];
    const out = selectDeployableTriggers(triggers, now);
    expect(out.map((t) => t.id)).toEqual(['c', 'b']); // 'a' excluded, LRU first
  });

  it('respects the limit', () => {
    const triggers = Array.from({ length: 10 }, (_, i) => trig(`t${i}`, `phrase ${i}`, null));
    expect(selectDeployableTriggers(triggers, now, 3)).toHaveLength(3);
  });

  it('detectDeployedPhrases matches whole phrases case-insensitively', () => {
    const triggers = [trig('a', 'good girl', null), trig('b', 'sink deep', null)];
    const hits = detectDeployedPhrases('That was perfect. Good Girl. Rest now.', triggers);
    expect(hits.map((t) => t.id)).toEqual(['a']);
  });

  it('detectDeployedPhrases does not match a phrase embedded in a larger word', () => {
    const triggers = [trig('a', 'drop', null)];
    expect(detectDeployedPhrases('the raindrops fell', triggers)).toHaveLength(0);
    expect(detectDeployedPhrases('now, drop.', triggers)).toHaveLength(1);
  });

  it('scoreRecall rewards fast, embodied, drop-marked replies', () => {
    const strong = scoreRecall({
      reply: 'yes mama, i feel so floaty and soft, my body is melting',
      latencyMs: 60_000,
      embodiedWords: EMBODIED,
    });
    const weak = scoreRecall({
      reply: 'ok sure whatever',
      latencyMs: RECALL_WINDOW_MS - 1,
      embodiedWords: EMBODIED,
    });
    expect(strong).toBeGreaterThan(RECALL_THRESHOLD);
    expect(weak).toBeLessThan(RECALL_THRESHOLD);
    expect(strong).toBeLessThanOrEqual(1);
  });

  it('scoreRecall gives no latency credit past the window and 0 for empty', () => {
    expect(scoreRecall({ reply: '', latencyMs: 1000, embodiedWords: EMBODIED })).toBe(0);
    const past = scoreRecall({ reply: 'i feel soft', latencyMs: RECALL_WINDOW_MS * 2, embodiedWords: EMBODIED });
    const within = scoreRecall({ reply: 'i feel soft', latencyMs: 1000, embodiedWords: EMBODIED });
    expect(within).toBeGreaterThan(past);
  });

  it('buildArmedTriggerPromptBlock is empty with no triggers and never leaks counts', () => {
    expect(buildArmedTriggerPromptBlock([])).toBe('');
    const block = buildArmedTriggerPromptBlock([trig('a', 'good girl', null)]);
    expect(block).toContain('AT MOST ONE');
    expect(block).toContain('good girl');
    expect(block.toLowerCase()).toContain('never mention triggers');
  });
});
