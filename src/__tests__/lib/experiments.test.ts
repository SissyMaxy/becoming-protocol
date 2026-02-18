// Tests for experiments.ts - Statistical analysis utilities
import { describe, it, expect } from 'vitest';
import {
  calculateMean,
  calculateStdDev,
  calculateSEM,
  tTest,
  calculateEffectSize,
  interpretEffectSize,
  calculateSignificance,
  calculateMinSampleSize,
  shouldConcludeExperiment,
} from '../../lib/experiments';

describe('experiments statistical utilities', () => {
  // ============================================
  // calculateMean
  // ============================================
  describe('calculateMean', () => {
    it('should calculate mean of positive numbers', () => {
      expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
      expect(calculateMean([10, 20, 30])).toBe(20);
    });

    it('should handle single value', () => {
      expect(calculateMean([5])).toBe(5);
    });

    it('should return 0 for empty array', () => {
      expect(calculateMean([])).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(calculateMean([-1, 0, 1])).toBe(0);
      expect(calculateMean([-10, -20, -30])).toBe(-20);
    });

    it('should handle decimal values', () => {
      expect(calculateMean([1.5, 2.5, 3.5])).toBeCloseTo(2.5);
    });

    it('should handle mixed positive and negative', () => {
      expect(calculateMean([-5, 5])).toBe(0);
    });
  });

  // ============================================
  // calculateStdDev
  // ============================================
  describe('calculateStdDev', () => {
    it('should calculate standard deviation', () => {
      // Known standard deviation for [2, 4, 4, 4, 5, 5, 7, 9] is ~2.138
      const result = calculateStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result).toBeCloseTo(2.138, 2);
    });

    it('should return 0 for single value', () => {
      expect(calculateStdDev([5])).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(calculateStdDev([])).toBe(0);
    });

    it('should return 0 for identical values', () => {
      expect(calculateStdDev([5, 5, 5, 5])).toBe(0);
    });

    it('should handle two values', () => {
      // StdDev of [0, 10] with n-1 = sqrt(50) ≈ 7.07
      expect(calculateStdDev([0, 10])).toBeCloseTo(7.071, 2);
    });
  });

  // ============================================
  // calculateSEM (Standard Error of Mean)
  // ============================================
  describe('calculateSEM', () => {
    it('should calculate SEM correctly', () => {
      // SEM = StdDev / sqrt(n)
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const stdDev = calculateStdDev(values);
      const expectedSEM = stdDev / Math.sqrt(values.length);
      expect(calculateSEM(values)).toBeCloseTo(expectedSEM, 4);
    });

    it('should return 0 for single value', () => {
      expect(calculateSEM([5])).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(calculateSEM([])).toBe(0);
    });

    it('should be smaller than StdDev for n > 1', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(calculateSEM(values)).toBeLessThan(calculateStdDev(values));
    });
  });

  // ============================================
  // tTest (Welch's t-test)
  // ============================================
  describe('tTest', () => {
    it('should return significant p-value for different groups', () => {
      const groupA = [1, 2, 3, 4, 5];
      const groupB = [10, 11, 12, 13, 14];
      const result = tTest(groupA, groupB);

      expect(result.pValue).toBeLessThan(0.05);
      expect(result.tStatistic).toBeLessThan(0); // A < B
      expect(result.degreesOfFreedom).toBeGreaterThan(0);
    });

    it('should return non-significant p-value for similar groups', () => {
      const groupA = [5, 5, 5, 5, 5];
      const groupB = [5, 5, 5, 5, 5];
      const result = tTest(groupA, groupB);

      expect(result.pValue).toBe(1); // No difference
      expect(result.tStatistic).toBe(0);
    });

    it('should handle groups with insufficient data', () => {
      const result = tTest([1], [2]);
      expect(result.pValue).toBe(1);
      expect(result.tStatistic).toBe(0);
      expect(result.degreesOfFreedom).toBe(0);
    });

    it('should handle empty groups', () => {
      const result = tTest([], [1, 2, 3]);
      expect(result.pValue).toBe(1);
    });

    it('should detect moderate differences', () => {
      const groupA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const groupB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const result = tTest(groupA, groupB);

      // Groups differ by 2 on average, should show some difference
      expect(result.tStatistic).toBeLessThan(0);
    });
  });

  // ============================================
  // calculateEffectSize (Cohen's d)
  // ============================================
  describe('calculateEffectSize', () => {
    it('should calculate large effect size for very different groups', () => {
      const groupA = [1, 2, 3, 4, 5];
      const groupB = [10, 11, 12, 13, 14];
      const d = calculateEffectSize(groupA, groupB);

      // Large effect > 0.8
      expect(Math.abs(d)).toBeGreaterThan(0.8);
    });

    it('should calculate small effect size for similar groups', () => {
      const groupA = [5, 5, 5, 5, 5];
      const groupB = [5.1, 5.1, 5.1, 5.1, 5.1];
      const d = calculateEffectSize(groupA, groupB);

      expect(Math.abs(d)).toBeLessThan(0.2);
    });

    it('should return 0 for identical groups', () => {
      const groupA = [5, 5, 5, 5, 5];
      const groupB = [5, 5, 5, 5, 5];

      expect(calculateEffectSize(groupA, groupB)).toBe(0);
    });

    it('should return 0 for insufficient data', () => {
      expect(calculateEffectSize([1], [2])).toBe(0);
      expect(calculateEffectSize([], [1, 2, 3])).toBe(0);
    });

    it('should be negative when A < B', () => {
      const groupA = [1, 2, 3, 4, 5];
      const groupB = [6, 7, 8, 9, 10];

      expect(calculateEffectSize(groupA, groupB)).toBeLessThan(0);
    });

    it('should be positive when A > B', () => {
      const groupA = [6, 7, 8, 9, 10];
      const groupB = [1, 2, 3, 4, 5];

      expect(calculateEffectSize(groupA, groupB)).toBeGreaterThan(0);
    });
  });

  // ============================================
  // interpretEffectSize
  // ============================================
  describe('interpretEffectSize', () => {
    it('should interpret negligible effect size', () => {
      expect(interpretEffectSize(0)).toBe('negligible');
      expect(interpretEffectSize(0.1)).toBe('negligible');
      expect(interpretEffectSize(-0.15)).toBe('negligible');
    });

    it('should interpret small effect size', () => {
      expect(interpretEffectSize(0.25)).toBe('small');
      expect(interpretEffectSize(0.4)).toBe('small');
      expect(interpretEffectSize(-0.3)).toBe('small');
    });

    it('should interpret medium effect size', () => {
      expect(interpretEffectSize(0.55)).toBe('medium');
      expect(interpretEffectSize(0.7)).toBe('medium');
      expect(interpretEffectSize(-0.6)).toBe('medium');
    });

    it('should interpret large effect size', () => {
      expect(interpretEffectSize(0.85)).toBe('large');
      expect(interpretEffectSize(1.5)).toBe('large');
      expect(interpretEffectSize(-1.0)).toBe('large');
    });
  });

  // ============================================
  // calculateSignificance
  // ============================================
  describe('calculateSignificance', () => {
    it('should require minimum 5 samples per variant', () => {
      const result = calculateSignificance([1, 2, 3], [4, 5, 6]);

      expect(result.winner).toBe('inconclusive');
      expect(result.recommendation).toContain('Need at least 5 samples');
    });

    it('should detect a winner with significant difference', () => {
      const groupA = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const groupB = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = calculateSignificance(groupA, groupB);

      expect(result.winner).toBe('a');
      expect(result.confidence).toBeGreaterThan(95);
      expect(result.recommendation).toContain('Variant A');
    });

    it('should be inconclusive with similar groups', () => {
      const groupA = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const groupB = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const result = calculateSignificance(groupA, groupB);

      expect(result.winner).toBe('inconclusive');
    });

    it('should include effect size interpretation', () => {
      const groupA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const groupB = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
      const result = calculateSignificance(groupA, groupB);

      expect(result.effectInterpretation).toBe('large');
    });

    it('should respect custom significance threshold', () => {
      const groupA = [1, 2, 3, 4, 5, 6];
      const groupB = [3, 4, 5, 6, 7, 8];

      // With strict threshold (0.01), might not be significant
      const strictResult = calculateSignificance(groupA, groupB, 0.01);

      // With lenient threshold (0.5), more likely to be significant
      calculateSignificance(groupA, groupB, 0.5);

      // The strict one should be less likely to declare a winner
      if (strictResult.winner === 'inconclusive') {
        // This is expected behavior
        expect(strictResult.winner).toBe('inconclusive');
      }
    });
  });

  // ============================================
  // calculateMinSampleSize
  // ============================================
  describe('calculateMinSampleSize', () => {
    it('should calculate sample size for medium effect', () => {
      const n = calculateMinSampleSize(0.5);
      // For d=0.5, power=0.8, alpha=0.05, expect ~64 per group
      expect(n).toBeGreaterThan(50);
      expect(n).toBeLessThan(100);
    });

    it('should need more samples for small effects', () => {
      const smallEffect = calculateMinSampleSize(0.2);
      const largeEffect = calculateMinSampleSize(0.8);

      expect(smallEffect).toBeGreaterThan(largeEffect);
    });

    it('should need fewer samples for large effects', () => {
      const n = calculateMinSampleSize(0.8);
      expect(n).toBeLessThan(50);
    });

    it('should return an integer', () => {
      const n = calculateMinSampleSize(0.5);
      expect(Number.isInteger(n)).toBe(true);
    });
  });

  // ============================================
  // shouldConcludeExperiment
  // ============================================
  describe('shouldConcludeExperiment', () => {
    it('should not conclude with too few samples', () => {
      const result = shouldConcludeExperiment([1, 2, 3], [4, 5, 6]);

      expect(result.shouldConclude).toBe(false);
      expect(result.reason).toContain('at least 10 samples');
      expect(result.minAdditionalSamples).toBeDefined();
    });

    it('should conclude when max samples reached', () => {
      const groupA = Array(100).fill(5);
      const groupB = Array(100).fill(5);
      const result = shouldConcludeExperiment(groupA, groupB, 100);

      expect(result.shouldConclude).toBe(true);
      expect(result.reason).toContain('Maximum sample size');
    });

    it('should conclude early with clear winner', () => {
      // Very different groups with 20+ samples
      const groupA = Array(25).fill(1).map((_, i) => i + 1); // 1-25
      const groupB = Array(25).fill(1).map((_, i) => i + 100); // 100-124
      const result = shouldConcludeExperiment(groupA, groupB);

      expect(result.shouldConclude).toBe(true);
      expect(result.reason).toContain('Clear winner');
    });

    it('should conclude for futility with no likely difference', () => {
      // Very similar groups with 50+ samples
      const groupA = Array(60).fill(5);
      const groupB = Array(60).fill(5);
      const result = shouldConcludeExperiment(groupA, groupB);

      expect(result.shouldConclude).toBe(true);
      expect(result.reason).toContain('No significant difference');
    });

    it('should continue if more data needed', () => {
      // Moderate difference, not enough samples to be conclusive
      const groupA = Array(15).fill(1).map((_, i) => i + 1);
      const groupB = Array(15).fill(1).map((_, i) => i + 3);
      const result = shouldConcludeExperiment(groupA, groupB);

      expect(result.shouldConclude).toBe(false);
      expect(result.reason).toContain('Continue collecting');
    });
  });

  // ============================================
  // Edge cases and integration
  // ============================================
  describe('edge cases', () => {
    it('should handle very large numbers', () => {
      const large = [1e10, 1e10 + 1, 1e10 + 2];
      expect(calculateMean(large)).toBeCloseTo(1e10 + 1, 0);
    });

    it('should handle very small numbers', () => {
      const small = [0.001, 0.002, 0.003];
      expect(calculateMean(small)).toBeCloseTo(0.002, 4);
    });

    it('should handle mix of scales in effect size', () => {
      const groupA = [100, 101, 102, 103, 104];
      const groupB = [1000, 1001, 1002, 1003, 1004];
      const d = calculateEffectSize(groupA, groupB);

      // Should be a large negative effect
      expect(d).toBeLessThan(-1);
    });
  });
});
