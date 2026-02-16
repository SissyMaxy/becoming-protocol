import { describe, it, expect, beforeEach } from 'vitest';
import { CompositeScorer } from '../CompositeScorer';

describe('CompositeScorer', () => {
  let scorer;

  beforeEach(() => {
    scorer = new CompositeScorer();
  });

  describe('construction', () => {
    it('should use default weights', () => {
      expect(scorer.weights.lightness).toBe(0.35);
      expect(scorer.weights.resonance).toBe(0.30);
      expect(scorer.weights.variability).toBe(0.20);
      expect(scorer.weights.pitch).toBe(0.15);
    });

    it('should accept custom weights', () => {
      const custom = new CompositeScorer({ lightness: 0.5, resonance: 0.2, variability: 0.2, pitch: 0.1 });
      expect(custom.weights.lightness).toBe(0.5);
      expect(custom.weights.pitch).toBe(0.1);
    });
  });

  describe('weighted scoring with known inputs', () => {
    it('should compute exact composite score with all pillars present', () => {
      const result = scorer.score({
        lightness: 80,
        resonance: 60,
        variability: 40,
        pitch: 100,
      });

      // With default weights (0.35, 0.30, 0.20, 0.15) summing to 1.0:
      // Composite = 80*0.35 + 60*0.30 + 40*0.20 + 100*0.15
      //           = 28 + 18 + 8 + 15 = 69
      expect(result.compositeScore).toBe(69);

      // Breakdown values
      expect(result.breakdown.lightness).toBe(28);
      expect(result.breakdown.resonance).toBe(18);
      expect(result.breakdown.variability).toBe(8);
      expect(result.breakdown.pitch).toBe(15);
    });

    it('should compute correct score with uniform inputs', () => {
      const result = scorer.score({
        lightness: 50,
        resonance: 50,
        variability: 50,
        pitch: 50,
      });

      // All 50 → composite = 50 regardless of weights
      expect(result.compositeScore).toBe(50);
    });
  });

  describe('custom weight configuration', () => {
    it('should allow updating weights via setWeights()', () => {
      scorer.setWeights({ lightness: 0.5, resonance: 0.2, variability: 0.2, pitch: 0.1 });

      const result = scorer.score({
        lightness: 100,
        resonance: 0,
        variability: 0,
        pitch: 0,
      });

      // With new weights: 100*0.5 + 0*0.2 + 0*0.2 + 0*0.1 = 50
      expect(result.compositeScore).toBe(50);
    });

    it('should return current weights in result', () => {
      scorer.setWeights({ pitch: 0.25 });
      const result = scorer.score({ lightness: 50, resonance: 50, variability: 50, pitch: 50 });
      expect(result.weights.pitch).toBe(0.25);
      expect(result.weights.lightness).toBe(0.35); // Unchanged
    });
  });

  describe('missing pillar data handling', () => {
    it('should redistribute weight when one pillar is null', () => {
      const result = scorer.score({
        lightness: 80,
        resonance: 60,
        variability: null,
        pitch: 100,
      });

      // Available weights: 0.35 + 0.30 + 0.15 = 0.80
      // Effective weights: lightness=0.35/0.80, resonance=0.30/0.80, pitch=0.15/0.80
      // Composite = 80*(0.35/0.80) + 60*(0.30/0.80) + 100*(0.15/0.80)
      //           = 80*0.4375 + 60*0.375 + 100*0.1875
      //           = 35 + 22.5 + 18.75 = 76.25 → 76
      expect(result.compositeScore).toBe(76);
      expect(result.breakdown.variability).toBeNull();
    });

    it('should work with only one pillar available', () => {
      const result = scorer.score({
        lightness: 70,
        resonance: null,
        variability: null,
        pitch: null,
      });

      // Only lightness → weight becomes 100%: 70 * (0.35/0.35) = 70
      expect(result.compositeScore).toBe(70);
      expect(result.breakdown.lightness).toBe(70);
    });

    it('should return null when all pillars are null', () => {
      const result = scorer.score({
        lightness: null,
        resonance: null,
        variability: null,
        pitch: null,
      });

      expect(result.compositeScore).toBeNull();
      expect(result.breakdown.lightness).toBeNull();
      expect(result.breakdown.resonance).toBeNull();
    });

    it('should handle two pillars missing', () => {
      const result = scorer.score({
        lightness: 80,
        resonance: null,
        variability: 60,
        pitch: null,
      });

      // Available: lightness(0.35) + variability(0.20) = 0.55
      // 80*(0.35/0.55) + 60*(0.20/0.55) = 80*0.6364 + 60*0.3636 = 50.91 + 21.82 = 72.73 → 73
      expect(result.compositeScore).toBe(73);
    });
  });

  describe('edge cases', () => {
    it('should handle all scores at 0', () => {
      const result = scorer.score({
        lightness: 0,
        resonance: 0,
        variability: 0,
        pitch: 0,
      });

      expect(result.compositeScore).toBe(0);
    });

    it('should handle all scores at 100', () => {
      const result = scorer.score({
        lightness: 100,
        resonance: 100,
        variability: 100,
        pitch: 100,
      });

      expect(result.compositeScore).toBe(100);
    });

    it('should clamp score to 0-100 range', () => {
      // Even if pillar scores somehow exceed 100, composite stays clamped
      const result = scorer.score({
        lightness: 100,
        resonance: 100,
        variability: 100,
        pitch: 100,
      });
      expect(result.compositeScore).toBeLessThanOrEqual(100);
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pitchToScore mapping', () => {
    it('should return null for null pitch', () => {
      expect(CompositeScorer.pitchToScore(null)).toBeNull();
    });

    it('should return 0 for very low pitch (<=100 Hz)', () => {
      expect(CompositeScorer.pitchToScore(80)).toBe(0);
      expect(CompositeScorer.pitchToScore(100)).toBe(0);
    });

    it('should return ~50 at 180 Hz (androgynous boundary)', () => {
      const score = CompositeScorer.pitchToScore(180);
      expect(score).toBe(50);
    });

    it('should return ~80 at 215 Hz (target center)', () => {
      const score = CompositeScorer.pitchToScore(215);
      expect(score).toBe(80);
    });

    it('should return 100 at 250 Hz (high feminine)', () => {
      const score = CompositeScorer.pitchToScore(250);
      expect(score).toBe(100);
    });

    it('should return 90 at 300+ Hz (slight decrease for unnaturally high)', () => {
      expect(CompositeScorer.pitchToScore(300)).toBe(90);
      expect(CompositeScorer.pitchToScore(400)).toBe(90);
    });

    it('should increase monotonically from 100 to 250 Hz', () => {
      let prev = -1;
      for (let hz = 100; hz <= 250; hz += 10) {
        const score = CompositeScorer.pitchToScore(hz);
        expect(score).toBeGreaterThanOrEqual(prev);
        prev = score;
      }
    });

    it('should produce intermediate values (not just hard thresholds)', () => {
      const at140 = CompositeScorer.pitchToScore(140);
      const at200 = CompositeScorer.pitchToScore(200);

      // 140 Hz should be between 0 (100 Hz) and 50 (180 Hz)
      expect(at140).toBeGreaterThan(0);
      expect(at140).toBeLessThan(50);

      // 200 Hz should be between 50 (180 Hz) and 80 (215 Hz)
      expect(at200).toBeGreaterThan(50);
      expect(at200).toBeLessThan(80);
    });
  });

  describe('getScoreColor', () => {
    it('should return red for low scores', () => {
      expect(CompositeScorer.getScoreColor(10)).toBe('#ef4444');
    });

    it('should return green for high scores', () => {
      expect(CompositeScorer.getScoreColor(90)).toBe('#10b981');
    });

    it('should return yellow for mid scores', () => {
      expect(CompositeScorer.getScoreColor(50)).toBe('#eab308');
    });
  });

  describe('getScoreLabel', () => {
    it('should return appropriate labels', () => {
      expect(CompositeScorer.getScoreLabel(10)).toBe('Very Masculine');
      expect(CompositeScorer.getScoreLabel(30)).toBe('Masculine');
      expect(CompositeScorer.getScoreLabel(50)).toBe('Androgynous');
      expect(CompositeScorer.getScoreLabel(65)).toBe('Feminine');
      expect(CompositeScorer.getScoreLabel(80)).toBe('Very Feminine');
      expect(CompositeScorer.getScoreLabel(90)).toBe('Highly Feminine');
    });
  });
});
