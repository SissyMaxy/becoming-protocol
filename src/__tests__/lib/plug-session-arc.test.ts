// plug-session arc — the guided arc matches the seeded rung edicts (mig 701)
// and every device phase resolves in the session-device bridge.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { plugSessionArc, parsePlugRung } from '../../lib/conditioning/plug-session';

describe('plugSessionArc', () => {
  it('defines an arc for every seeded rung (1-5), none beyond', () => {
    for (const rung of [1, 2, 3, 4, 5]) expect(plugSessionArc(rung), `rung ${rung}`).not.toBeNull();
    expect(plugSessionArc(0)).toBeNull();
    expect(plugSessionArc(6)).toBeNull();
  });

  it('total durations match the edict copy (20 / 20 / 20 / 25 / 30 min)', () => {
    const minutes = [1, 2, 3, 4, 5].map(r => plugSessionArc(r)!.totalSeconds / 60);
    expect(minutes).toEqual([20, 20, 20, 25, 30]);
  });

  it('every device phase key exists in the session-device bridge', () => {
    const bridge = readFileSync('src/lib/conditioning/session-device.ts', 'utf8');
    for (const rung of [1, 2, 3, 4, 5]) {
      for (const phase of plugSessionArc(rung)!.phases) {
        expect(bridge.includes(`'plug:${phase.key}'`), `plug:${phase.key}`).toBe(true);
      }
    }
  });

  it('escalation is rung-ordered: edge phases only appear from rung 4', () => {
    for (const rung of [1, 2, 3]) {
      const keys = plugSessionArc(rung)!.phases.map(p => p.key);
      expect(keys).not.toContain('edge');
      expect(keys).not.toContain('push');
    }
    expect(plugSessionArc(4)!.phases.map(p => p.key)).toContain('edge');
    expect(plugSessionArc(5)!.phases.map(p => p.key)).toContain('push');
  });

  it('audio tier follows the ladder: gentle through rung 3, firm after', () => {
    expect([1, 2, 3].map(r => plugSessionArc(r)!.audioTier)).toEqual(['gentle', 'gentle', 'gentle']);
    expect([4, 5].map(r => plugSessionArc(r)!.audioTier)).toEqual(['firm', 'firm']);
  });

  it('no cue instructs touching or unlocking', () => {
    const banned = /\bstroke\b|\bwith your hand\b|\bunlock\b|\btake the cage off\b/i;
    for (const rung of [1, 2, 3, 4, 5]) {
      for (const phase of plugSessionArc(rung)!.phases) {
        expect(banned.test(phase.cue), phase.cue).toBe(false);
      }
    }
  });
});

describe('parsePlugRung', () => {
  it('parses plug decree trigger sources and rejects everything else', () => {
    expect(parsePlugRung('physical_practice:plug_orgasm:1')).toBe(1);
    expect(parsePlugRung('physical_practice:plug_orgasm:5')).toBe(5);
    expect(parsePlugRung('physical_practice:plug_orgasm:9')).toBeNull();
    expect(parsePlugRung('physical_practice:oral:1')).toBeNull();
    expect(parsePlugRung('daily_cadence')).toBeNull();
    expect(parsePlugRung(null)).toBeNull();
  });
});

describe('session_plug templates (mig 702) — prompt floor', () => {
  const SQL = readFileSync('supabase/migrations/702_session_plug_templates.sql', 'utf8');

  it('both templates forbid touching, unlocking, and sleep language in-prompt', () => {
    for (const marker of ['hands never touch', 'stays awake and present']) {
      const hits = SQL.match(new RegExp(marker, 'g')) ?? [];
      expect(hits.length, marker).toBe(2);
    }
    expect(SQL).not.toMatch(/while you sleep|as you fall asleep/i);
  });

  it('no telemetry instruction leaks into the scripts', () => {
    const hits = SQL.match(/no (counting )?scores or numbers/g) ?? [];
    expect(hits.length).toBe(2);
  });

  it('durations respect the audio_session_templates CHECK (2-20 min)', () => {
    const durations = [...SQL.matchAll(/,\s*(\d+),\s*ARRAY\[/g)].map(m => parseInt(m[1], 10));
    expect(durations.length).toBe(2);
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(20);
    }
  });
});
