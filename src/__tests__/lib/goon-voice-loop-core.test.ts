// Self-voice goon loop — clip selection + Mommy-line authoring (mig 642,
// mommy_code_wishes fa3317f0). Pins:
//   - best-clip selection prefers in-band pitch, then longest, then recent;
//     rejects too-short / path-less clips; returns null when nothing usable.
//   - the authored Mommy line survives mommyVoiceCleanup unchanged (no
//     telemetry) and scores 0 on the craft rubric (no banned smells).

import { describe, it, expect } from 'vitest';
import {
  selectBestVoiceSample,
  buildGoonLoopScript,
  MIN_CLIP_DURATION_S,
  type VoiceSampleCandidate,
} from '../../../supabase/functions/_shared/goon-voice-loop-core';
import { mommyVoiceCleanup } from '../../lib/persona/dommy-mommy';
import { scoreCorny } from '../../lib/persona/mommy-craft-check';

const NOW = Date.now();
function ago(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}
function clip(p: Partial<VoiceSampleCandidate> & { id: string }): VoiceSampleCandidate {
  return {
    audioPath: `audio/clip-${p.id}.webm`,
    durationS: 8,
    pitchMedianHz: 180,
    recordedAt: ago(1),
    ...p,
  };
}

describe('selectBestVoiceSample', () => {
  it('returns null when there are no candidates', () => {
    expect(selectBestVoiceSample([])).toBeNull();
  });

  it('rejects clips without a stored audio path', () => {
    expect(
      selectBestVoiceSample([clip({ id: 'a', audioPath: null }), clip({ id: 'b', audioPath: '  ' })]),
    ).toBeNull();
  });

  it('rejects clips shorter than the floor', () => {
    expect(
      selectBestVoiceSample([clip({ id: 'a', durationS: MIN_CLIP_DURATION_S - 1 })]),
    ).toBeNull();
  });

  it('accepts a clip exactly at the duration floor', () => {
    const picked = selectBestVoiceSample([clip({ id: 'a', durationS: MIN_CLIP_DURATION_S })]);
    expect(picked?.id).toBe('a');
  });

  it('prefers an in-pitch-band clip over a longer out-of-band one', () => {
    const outOfBand = clip({ id: 'long-noise', durationS: 40, pitchMedianHz: null });
    const inBand = clip({ id: 'in-band', durationS: 10, pitchMedianHz: 190 });
    expect(selectBestVoiceSample([outOfBand, inBand])?.id).toBe('in-band');
  });

  it('among in-band clips picks the longest', () => {
    const short = clip({ id: 'short', durationS: 6, pitchMedianHz: 175 });
    const long = clip({ id: 'long', durationS: 22, pitchMedianHz: 200 });
    expect(selectBestVoiceSample([short, long])?.id).toBe('long');
  });

  it('breaks a duration tie by most recent', () => {
    const older = clip({ id: 'older', durationS: 12, pitchMedianHz: 180, recordedAt: ago(30) });
    const newer = clip({ id: 'newer', durationS: 12, pitchMedianHz: 180, recordedAt: ago(2) });
    expect(selectBestVoiceSample([older, newer])?.id).toBe('newer');
  });

  it('treats a below-band pitch as out-of-band', () => {
    const below = clip({ id: 'below', durationS: 30, pitchMedianHz: 40 });
    const good = clip({ id: 'good', durationS: 8, pitchMedianHz: 150 });
    expect(selectBestVoiceSample([below, good])?.id).toBe('good');
  });
});

describe('buildGoonLoopScript', () => {
  it('authors a script that survives voice cleanup unchanged (no telemetry)', () => {
    const { script } = buildGoonLoopScript({ femName: null });
    expect(mommyVoiceCleanup(script)).toBe(script);
  });

  it('authored script scores clean on the craft rubric', () => {
    const { script } = buildGoonLoopScript({ femName: null });
    expect(scoreCorny(script).hits).toEqual([]);
  });

  it('stays craft-clean and cleanup-stable when personalized with a name', () => {
    const { script, teaser } = buildGoonLoopScript({ femName: 'Sophie' });
    expect(script).toContain('Sophie');
    expect(scoreCorny(script).hits).toEqual([]);
    expect(mommyVoiceCleanup(script)).toBe(script);
    expect(mommyVoiceCleanup(teaser)).toBe(teaser);
    expect(scoreCorny(teaser).hits).toEqual([]);
  });

  it('caps pet names at one (never both a name and a pet name)', () => {
    // With a name present the pet-name budget is spent on nothing — the name is
    // an address, not a pet name — so the rubric never flags pet_name_stuffing.
    const { script } = buildGoonLoopScript({ femName: 'Sophie' });
    expect(scoreCorny(script).hits.find((h) => h.rule === 'pet_name_stuffing')).toBeUndefined();
  });

  it('defaults the loop count', () => {
    expect(buildGoonLoopScript().loopCount).toBeGreaterThan(1);
  });

  it('weaves in the Focus target claim when one is running, and stays clean', () => {
    const claim = "The want isn't mine to negotiate. It's Mommy's, and I obey it.";
    const { script, teaser } = buildGoonLoopScript({ femName: 'Sophie', targetClaim: claim });
    expect(script).toContain(claim);
    expect(scoreCorny(script).hits).toEqual([]);
    expect(mommyVoiceCleanup(script)).toBe(script);
    expect(mommyVoiceCleanup(teaser)).toBe(teaser);
    expect(scoreCorny(teaser).hits).toEqual([]);
  });

  it('weaves in the armed anchor phrase alongside a target claim, and stays clean', () => {
    const claim = 'My real voice is the soft one.';
    const anchor = 'sink soft for me now';
    const { script } = buildGoonLoopScript({ femName: null, targetClaim: claim, anchorPhrase: anchor });
    expect(script).toContain(claim);
    expect(script).toContain(anchor);
    expect(scoreCorny(script).hits).toEqual([]);
    expect(mommyVoiceCleanup(script)).toBe(script);
  });

  it('falls back to the generic affirmation with no Focus target running', () => {
    const { script } = buildGoonLoopScript({ femName: null });
    expect(script).toContain('you are mine, and you are not going anywhere');
  });
});
