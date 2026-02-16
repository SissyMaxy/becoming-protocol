import { describe, it, expect, beforeEach } from 'vitest';
import { IntonationTracker } from '../IntonationTracker';

/**
 * Helper: generate a sequence of pitch samples at fixed intervals.
 * Returns array of { pitch, time } objects.
 */
function generatePitchSequence(pitches, startTime = 1000, intervalMs = 30) {
  return pitches.map((pitch, i) => ({
    pitch,
    time: startTime + i * intervalMs,
  }));
}

/**
 * Helper: feed an entire pitch sequence into a tracker.
 */
function feedSequence(tracker, sequence) {
  let result;
  for (const { pitch, time } of sequence) {
    result = tracker.addPitch(pitch, time);
  }
  return result;
}

describe('IntonationTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new IntonationTracker();
  });

  describe('construction', () => {
    it('should initialize with null/empty state', () => {
      expect(tracker.variabilityScore).toBeNull();
      expect(tracker.currentContour).toBeNull();
      expect(tracker.phraseHistory).toEqual([]);
      expect(tracker.currentPhraseData).toBeNull();
    });
  });

  describe('phrase segmentation', () => {
    it('should detect two phrases separated by a 300ms silence gap', () => {
      // Phrase 1: 200 Hz constant, 10 samples over 270ms
      const phrase1 = generatePitchSequence(
        [200, 202, 198, 201, 199, 200, 203, 197, 200, 201],
        1000, 30
      );

      // Silence gap: 300ms of null pitch
      const silenceStart = phrase1[phrase1.length - 1].time + 30;
      const silence = [];
      for (let t = silenceStart; t < silenceStart + 300; t += 30) {
        silence.push({ pitch: null, time: t });
      }

      // Phrase 2: 220 Hz constant, 10 samples
      const phrase2Start = silence[silence.length - 1].time + 30;
      const phrase2 = generatePitchSequence(
        [220, 222, 218, 221, 219, 220, 223, 217, 220, 221],
        phrase2Start, 30
      );

      // Feed everything
      feedSequence(tracker, phrase1);
      feedSequence(tracker, silence);
      feedSequence(tracker, phrase2);

      // Need another silence to finalize phrase 2
      const finalSilenceStart = phrase2[phrase2.length - 1].time + 30;
      for (let t = finalSilenceStart; t < finalSilenceStart + 300; t += 30) {
        tracker.addPitch(null, t);
      }

      expect(tracker.phraseHistory.length).toBe(2);
      expect(tracker.phraseHistory[0].meanPitch).toBeGreaterThan(195);
      expect(tracker.phraseHistory[0].meanPitch).toBeLessThan(205);
      expect(tracker.phraseHistory[1].meanPitch).toBeGreaterThan(215);
      expect(tracker.phraseHistory[1].meanPitch).toBeLessThan(225);
    });

    it('should not create a phrase from fewer than 4 voiced samples', () => {
      // Only 3 samples — below MIN_PHRASE_POINTS
      const short = generatePitchSequence([200, 210, 205], 1000, 30);
      feedSequence(tracker, short);

      // Silence to trigger finalization
      for (let t = 1100; t < 1400; t += 30) {
        tracker.addPitch(null, t);
      }

      expect(tracker.phraseHistory.length).toBe(0);
    });

    it('should handle continuous speech without gaps as a single phrase', () => {
      // 20 samples with no silence
      const continuous = generatePitchSequence(
        Array.from({ length: 20 }, (_, i) => 200 + Math.sin(i * 0.5) * 30),
        1000, 30
      );
      feedSequence(tracker, continuous);

      // Finalize with silence
      const end = continuous[continuous.length - 1].time + 30;
      for (let t = end; t < end + 300; t += 30) {
        tracker.addPitch(null, t);
      }

      expect(tracker.phraseHistory.length).toBe(1);
    });
  });

  describe('variability score', () => {
    it('should score monotone signal (constant pitch) below 25', () => {
      // Constant 200 Hz — minimal variation
      const monotone = generatePitchSequence(
        Array(20).fill(200),
        1000, 30
      );
      feedSequence(tracker, monotone);

      // Finalize
      for (let t = 1700; t < 2000; t += 30) {
        tracker.addPitch(null, t);
      }

      expect(tracker.phraseHistory.length).toBe(1);
      expect(tracker.phraseHistory[0].variabilityScore).toBeLessThan(25);
      expect(tracker.variabilityScore).toBeLessThan(25);
    });

    it('should score melodic signal (varying pitch) above 50', () => {
      // Wide pitch swings: 150-280 Hz with directional changes
      const melodic = generatePitchSequence(
        [150, 170, 200, 240, 280, 250, 200, 160, 150, 180,
         220, 270, 280, 240, 190, 160, 150, 190, 240, 280],
        1000, 50
      );
      feedSequence(tracker, melodic);

      // Finalize
      const end = melodic[melodic.length - 1].time + 50;
      for (let t = end; t < end + 300; t += 30) {
        tracker.addPitch(null, t);
      }

      expect(tracker.phraseHistory.length).toBe(1);
      expect(tracker.phraseHistory[0].variabilityScore).toBeGreaterThan(50);
    });

    it('should produce scores in 0-100 range', () => {
      // Feed some data
      const seq = generatePitchSequence(
        [200, 210, 220, 230, 220, 210, 200, 190, 200, 210],
        1000, 30
      );
      feedSequence(tracker, seq);

      for (let t = 1400; t < 1700; t += 30) {
        tracker.addPitch(null, t);
      }

      const score = tracker.phraseHistory[0].variabilityScore;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should average variability across multiple phrases', () => {
      // Phrase 1: monotone
      const p1 = generatePitchSequence(Array(10).fill(200), 1000, 30);
      feedSequence(tracker, p1);
      for (let t = 1350; t < 1650; t += 30) {
        tracker.addPitch(null, t);
      }

      // Phrase 2: melodic
      const p2 = generatePitchSequence(
        [150, 200, 260, 200, 150, 200, 270, 200, 150, 200],
        2000, 50
      );
      feedSequence(tracker, p2);
      for (let t = 2550; t < 2850; t += 30) {
        tracker.addPitch(null, t);
      }

      expect(tracker.phraseHistory.length).toBe(2);
      // Rolling score should be between the two phrase scores
      const low = tracker.phraseHistory[0].variabilityScore;
      const high = tracker.phraseHistory[1].variabilityScore;
      expect(tracker.variabilityScore).toBeGreaterThanOrEqual(Math.min(low, high));
      expect(tracker.variabilityScore).toBeLessThanOrEqual(Math.max(low, high));
    });
  });

  describe('contour classification', () => {
    it('should classify rising pitch as "rising"', () => {
      const rising = IntonationTracker._classifyContour(
        [150, 160, 170, 180, 190, 200, 210, 220, 230, 240]
      );
      expect(rising).toBe('rising');
    });

    it('should classify falling pitch as "falling"', () => {
      const falling = IntonationTracker._classifyContour(
        [250, 240, 230, 220, 210, 200, 190, 180, 170, 160]
      );
      expect(falling).toBe('falling');
    });

    it('should classify rise-then-fall as "rise-fall"', () => {
      const riseFall = IntonationTracker._classifyContour(
        [150, 170, 200, 230, 260, 250, 220, 190, 160, 150]
      );
      expect(riseFall).toBe('rise-fall');
    });

    it('should classify constant pitch as "monotone"', () => {
      const monotone = IntonationTracker._classifyContour(
        [200, 200, 201, 200, 199, 200, 200, 201, 200, 200]
      );
      expect(monotone).toBe('monotone');
    });

    it('should classify highly varied pitch as "varied"', () => {
      // Many directional changes
      const varied = IntonationTracker._classifyContour(
        [150, 250, 150, 250, 150, 250, 150, 250, 150, 250,
         150, 250, 150, 250, 150, 250, 150, 250, 150, 250]
      );
      expect(varied).toBe('varied');
    });
  });

  describe('directional change counting', () => {
    it('should count zero changes for monotonically increasing pitch', () => {
      const changes = IntonationTracker._countDirectionalChanges(
        [100, 110, 120, 130, 140, 150]
      );
      expect(changes).toBe(0);
    });

    it('should count one change for a single reversal', () => {
      // Rising then falling
      const changes = IntonationTracker._countDirectionalChanges(
        [100, 120, 140, 130, 110, 90]
      );
      expect(changes).toBe(1);
    });

    it('should count multiple changes for oscillating pitch', () => {
      // Up, down, up, down = 3 direction changes
      const changes = IntonationTracker._countDirectionalChanges(
        [100, 150, 100, 150, 100]
      );
      expect(changes).toBe(3);
    });

    it('should return 0 for fewer than 3 samples', () => {
      expect(IntonationTracker._countDirectionalChanges([100, 200])).toBe(0);
      expect(IntonationTracker._countDirectionalChanges([100])).toBe(0);
      expect(IntonationTracker._countDirectionalChanges([])).toBe(0);
    });

    it('should ignore flat segments (no direction)', () => {
      // Flat, then up, then flat, then down
      const changes = IntonationTracker._countDirectionalChanges(
        [100, 100, 110, 120, 120, 110, 100]
      );
      expect(changes).toBe(1);
    });
  });

  describe('silence and empty handling', () => {
    it('should return null state when no pitches have been fed', () => {
      const result = tracker.addPitch(null, 1000);
      expect(result.variabilityScore).toBeNull();
      expect(result.currentContour).toBeNull();
      expect(result.phraseHistory).toEqual([]);
    });

    it('should handle all-silence input gracefully', () => {
      for (let t = 0; t < 2000; t += 30) {
        tracker.addPitch(null, t);
      }
      expect(tracker.variabilityScore).toBeNull();
      expect(tracker.phraseHistory.length).toBe(0);
    });

    it('should handle alternating single pitches and silence', () => {
      // Single voiced frames separated by silence — too short for phrases
      tracker.addPitch(200, 1000);
      tracker.addPitch(null, 1030);
      tracker.addPitch(null, 1300);
      tracker.addPitch(210, 1400);
      tracker.addPitch(null, 1430);
      tracker.addPitch(null, 1700);

      expect(tracker.phraseHistory.length).toBe(0);
    });
  });

  describe('phrase history buffer management', () => {
    it('should keep at most 10 phrases', () => {
      // Generate 12 phrases
      let time = 1000;
      for (let p = 0; p < 12; p++) {
        const pitches = Array(8).fill(200 + p * 5);
        for (const pitch of pitches) {
          tracker.addPitch(pitch, time);
          time += 30;
        }
        // Gap
        time += 300;
        for (let i = 0; i < 10; i++) {
          tracker.addPitch(null, time);
          time += 30;
        }
      }

      expect(tracker.phraseHistory.length).toBe(10);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      // Feed some data
      const seq = generatePitchSequence(
        [200, 210, 220, 230, 220, 210, 200, 190, 200, 210],
        1000, 30
      );
      feedSequence(tracker, seq);
      for (let t = 1400; t < 1700; t += 30) {
        tracker.addPitch(null, t);
      }

      expect(tracker.phraseHistory.length).toBeGreaterThan(0);

      tracker.reset();

      expect(tracker.variabilityScore).toBeNull();
      expect(tracker.currentContour).toBeNull();
      expect(tracker.phraseHistory).toEqual([]);
      expect(tracker.currentPhraseData).toBeNull();
    });
  });

  describe('classifyVariability', () => {
    it('should classify < 25 as monotone', () => {
      expect(IntonationTracker.classifyVariability(0)).toBe('monotone');
      expect(IntonationTracker.classifyVariability(24)).toBe('monotone');
    });

    it('should classify 25-49 as moderate', () => {
      expect(IntonationTracker.classifyVariability(25)).toBe('moderate');
      expect(IntonationTracker.classifyVariability(49)).toBe('moderate');
    });

    it('should classify 50-74 as melodic', () => {
      expect(IntonationTracker.classifyVariability(50)).toBe('melodic');
      expect(IntonationTracker.classifyVariability(74)).toBe('melodic');
    });

    it('should classify 75+ as very_animated', () => {
      expect(IntonationTracker.classifyVariability(75)).toBe('very_animated');
      expect(IntonationTracker.classifyVariability(100)).toBe('very_animated');
    });
  });

  describe('getVariabilityInfo', () => {
    it('should return label, color, and category', () => {
      const monotone = IntonationTracker.getVariabilityInfo(10);
      expect(monotone.label).toBe('Monotone');
      expect(monotone.color).toBe('#6366f1');
      expect(monotone.category).toBe('monotone');

      const moderate = IntonationTracker.getVariabilityInfo(35);
      expect(moderate.label).toBe('Moderate');

      const melodic = IntonationTracker.getVariabilityInfo(60);
      expect(melodic.label).toBe('Melodic');

      const animated = IntonationTracker.getVariabilityInfo(80);
      expect(animated.label).toBe('Very Animated');
    });
  });

  describe('getContourInfo', () => {
    it('should return label and symbol for each contour type', () => {
      expect(IntonationTracker.getContourInfo('rising').symbol).toBe('↗');
      expect(IntonationTracker.getContourInfo('falling').symbol).toBe('↘');
      expect(IntonationTracker.getContourInfo('rise-fall').symbol).toBe('↗↘');
      expect(IntonationTracker.getContourInfo('monotone').symbol).toBe('→');
      expect(IntonationTracker.getContourInfo('varied').symbol).toBe('↝');
    });
  });

  describe('phrase analysis output structure', () => {
    it('should include all expected fields', () => {
      const seq = generatePitchSequence(
        [200, 220, 240, 260, 240, 220, 200, 180, 200, 220],
        1000, 50
      );
      feedSequence(tracker, seq);

      const end = seq[seq.length - 1].time + 50;
      for (let t = end; t < end + 300; t += 30) {
        tracker.addPitch(null, t);
      }

      const phrase = tracker.phraseHistory[0];
      expect(phrase).toHaveProperty('stdDev');
      expect(phrase).toHaveProperty('range');
      expect(phrase).toHaveProperty('dirChangesPerSec');
      expect(phrase).toHaveProperty('contour');
      expect(phrase).toHaveProperty('variabilityScore');
      expect(phrase).toHaveProperty('durationMs');
      expect(phrase).toHaveProperty('pitchCount');
      expect(phrase).toHaveProperty('startTime');
      expect(phrase).toHaveProperty('endTime');
      expect(phrase).toHaveProperty('meanPitch');

      expect(phrase.pitchCount).toBe(10);
      expect(phrase.durationMs).toBeGreaterThan(0);
      expect(phrase.stdDev).toBeGreaterThan(0);
      expect(phrase.range).toBeGreaterThan(0);
    });
  });
});
