// Experiments Utilities
// Statistical analysis for A/B testing

/**
 * Calculate mean of an array of numbers
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * Calculate standard error of the mean
 */
export function calculateSEM(values: number[]): number {
  if (values.length < 2) return 0;
  return calculateStdDev(values) / Math.sqrt(values.length);
}

/**
 * Perform a two-sample t-test (Welch's t-test)
 * Returns t-statistic and approximate p-value
 */
export function tTest(
  groupA: number[],
  groupB: number[]
): { tStatistic: number; pValue: number; degreesOfFreedom: number } {
  if (groupA.length < 2 || groupB.length < 2) {
    return { tStatistic: 0, pValue: 1, degreesOfFreedom: 0 };
  }

  const meanA = calculateMean(groupA);
  const meanB = calculateMean(groupB);
  const varA = Math.pow(calculateStdDev(groupA), 2);
  const varB = Math.pow(calculateStdDev(groupB), 2);
  const nA = groupA.length;
  const nB = groupB.length;

  // Welch's t-test
  const seA = varA / nA;
  const seB = varB / nB;
  const se = Math.sqrt(seA + seB);

  if (se === 0) {
    return { tStatistic: 0, pValue: 1, degreesOfFreedom: nA + nB - 2 };
  }

  const tStatistic = (meanA - meanB) / se;

  // Welch-Satterthwaite degrees of freedom
  const dfNum = Math.pow(seA + seB, 2);
  const dfDenom = Math.pow(seA, 2) / (nA - 1) + Math.pow(seB, 2) / (nB - 1);
  const degreesOfFreedom = dfNum / dfDenom;

  // Approximate p-value using normal distribution for large df
  const pValue = 2 * (1 - normalCDF(Math.abs(tStatistic)));

  return { tStatistic, pValue, degreesOfFreedom };
}

/**
 * Standard normal cumulative distribution function
 * Approximation using Abramowitz and Stegun formula
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate effect size (Cohen's d)
 */
export function calculateEffectSize(groupA: number[], groupB: number[]): number {
  if (groupA.length < 2 || groupB.length < 2) return 0;

  const meanA = calculateMean(groupA);
  const meanB = calculateMean(groupB);
  const stdA = calculateStdDev(groupA);
  const stdB = calculateStdDev(groupB);

  // Pooled standard deviation
  const nA = groupA.length;
  const nB = groupB.length;
  const pooledStd = Math.sqrt(
    ((nA - 1) * stdA * stdA + (nB - 1) * stdB * stdB) / (nA + nB - 2)
  );

  if (pooledStd === 0) return 0;

  return (meanA - meanB) / pooledStd;
}

/**
 * Interpret effect size
 */
export function interpretEffectSize(d: number): string {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

/**
 * Calculate statistical significance and determine winner
 */
export interface SignificanceResult {
  significanceLevel: number; // 1 - p-value
  winner: 'a' | 'b' | 'inconclusive';
  confidence: number; // percentage
  effectSize: number;
  effectInterpretation: string;
  recommendation: string;
}

export function calculateSignificance(
  aResults: number[],
  bResults: number[],
  significanceThreshold: number = 0.05
): SignificanceResult {
  if (aResults.length < 5 || bResults.length < 5) {
    return {
      significanceLevel: 0,
      winner: 'inconclusive',
      confidence: 0,
      effectSize: 0,
      effectInterpretation: 'insufficient data',
      recommendation: `Need at least 5 samples per variant (A: ${aResults.length}, B: ${bResults.length})`,
    };
  }

  const { pValue } = tTest(aResults, bResults);
  const significanceLevel = 1 - pValue;
  const effectSize = calculateEffectSize(aResults, bResults);
  const effectInterpretation = interpretEffectSize(effectSize);

  const meanA = calculateMean(aResults);
  const meanB = calculateMean(bResults);

  let winner: 'a' | 'b' | 'inconclusive' = 'inconclusive';
  let recommendation = '';

  if (pValue < significanceThreshold) {
    // Statistically significant
    winner = meanA > meanB ? 'a' : 'b';
    recommendation = `Variant ${winner.toUpperCase()} is statistically significantly better (p=${pValue.toFixed(4)})`;
  } else if (pValue < 0.1) {
    // Approaching significance
    const leading = meanA > meanB ? 'A' : 'B';
    recommendation = `Variant ${leading} shows a trend but needs more data (p=${pValue.toFixed(4)})`;
  } else {
    // No significant difference
    recommendation = `No significant difference detected. Consider continuing the experiment or accepting either variant.`;
  }

  return {
    significanceLevel,
    winner,
    confidence: significanceLevel * 100,
    effectSize,
    effectInterpretation,
    recommendation,
  };
}

/**
 * Calculate minimum sample size needed for a given effect size
 * Using power analysis approximation
 */
export function calculateMinSampleSize(
  expectedEffectSize: number = 0.5,
  _power: number = 0.8,
  _alpha: number = 0.05
): number {
  // Simplified approximation
  const zAlpha = 1.96; // for alpha = 0.05, two-tailed
  const zBeta = 0.84; // for power = 0.8

  const n = 2 * Math.pow((zAlpha + zBeta) / expectedEffectSize, 2);
  return Math.ceil(n);
}

/**
 * Determine if experiment should continue or conclude
 */
export interface ExperimentDecision {
  shouldConclude: boolean;
  reason: string;
  minAdditionalSamples?: number;
}

export function shouldConcludeExperiment(
  aResults: number[],
  bResults: number[],
  maxSamplesPerVariant: number = 100,
  significanceThreshold: number = 0.05
): ExperimentDecision {
  const minSamples = Math.min(aResults.length, bResults.length);

  // Too few samples
  if (minSamples < 10) {
    return {
      shouldConclude: false,
      reason: 'Need at least 10 samples per variant',
      minAdditionalSamples: 10 - minSamples,
    };
  }

  // Max samples reached
  if (aResults.length >= maxSamplesPerVariant && bResults.length >= maxSamplesPerVariant) {
    return {
      shouldConclude: true,
      reason: 'Maximum sample size reached',
    };
  }

  // Check for early stopping due to clear winner
  const { pValue } = tTest(aResults, bResults);
  if (pValue < significanceThreshold / 10 && minSamples >= 20) {
    // Very strong significance with sufficient samples
    return {
      shouldConclude: true,
      reason: 'Clear winner detected with high confidence',
    };
  }

  // Check for futility (no likely significant difference)
  if (pValue > 0.5 && minSamples >= 50) {
    return {
      shouldConclude: true,
      reason: 'No significant difference likely to emerge',
    };
  }

  return {
    shouldConclude: false,
    reason: 'Continue collecting data',
    minAdditionalSamples: Math.max(0, 20 - minSamples),
  };
}
