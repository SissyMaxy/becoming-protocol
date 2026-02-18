/**
 * Voice Recognition Matching Library
 * Algorithms for comparing spoken text to target affirmations
 */

import type { Affirmation, VoiceMatchResult, VoiceGameDifficulty } from '../types/voice-game';

/**
 * Calculate match accuracy between spoken text and target affirmation
 */
export function calculateMatchAccuracy(
  spokenText: string,
  affirmation: Affirmation,
  difficulty: VoiceGameDifficulty
): VoiceMatchResult {
  const normalizedSpoken = normalizeText(spokenText);
  const normalizedTarget = normalizeText(affirmation.text);

  // Check exact match first
  if (normalizedSpoken === normalizedTarget) {
    return {
      accuracy: 100,
      isMatch: true,
      matchedKeywords: affirmation.keywords,
      missingKeywords: [],
      confidenceScore: 1.0,
    };
  }

  // Check variants
  for (const variant of affirmation.variants) {
    if (normalizedSpoken === normalizeText(variant)) {
      return {
        accuracy: 100,
        isMatch: true,
        matchedKeywords: affirmation.keywords,
        missingKeywords: [],
        confidenceScore: 1.0,
      };
    }
  }

  // Calculate keyword matching
  const keywordResult = checkKeywords(normalizedSpoken, affirmation.keywords);

  // Calculate string similarity using Levenshtein distance
  const similarity = calculateSimilarity(normalizedSpoken, normalizedTarget);

  // Weighted accuracy: 60% similarity, 40% keywords
  const accuracy = Math.round(similarity * 0.6 + keywordResult.percentage * 0.4);

  // Threshold based on difficulty (higher difficulty = stricter)
  const thresholds: Record<VoiceGameDifficulty, number> = {
    1: 60,
    2: 70,
    3: 80,
    4: 85,
    5: 90,
  };
  const threshold = thresholds[difficulty];

  return {
    accuracy,
    isMatch: accuracy >= threshold,
    matchedKeywords: keywordResult.matched,
    missingKeywords: keywordResult.missing,
    confidenceScore: accuracy / 100,
  };
}

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove punctuation
 * - Normalize whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

/**
 * Check keyword presence in spoken text
 */
function checkKeywords(
  spoken: string,
  keywords: string[]
): { matched: string[]; missing: string[]; percentage: number } {
  if (keywords.length === 0) {
    return { matched: [], missing: [], percentage: 100 };
  }

  const spokenWords = new Set(spoken.split(' '));
  const matched: string[] = [];
  const missing: string[] = [];

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase();

    if (spokenWords.has(normalizedKeyword)) {
      matched.push(keyword);
    } else {
      // Check for similar words (fuzzy match with 80% threshold)
      const found = Array.from(spokenWords).some(
        (word) => calculateSimilarity(word, normalizedKeyword) >= 80
      );

      if (found) {
        matched.push(keyword);
      } else {
        missing.push(keyword);
      }
    }
  }

  const percentage = (matched.length / keywords.length) * 100;

  return { matched, missing, percentage };
}

/**
 * Calculate Levenshtein-based similarity percentage
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 100;
  if (str1.length === 0 || str2.length === 0) return 0;

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);

  return ((maxLength - distance) / maxLength) * 100;
}

/**
 * Levenshtein distance algorithm
 * Returns the minimum number of edits (insertions, deletions, substitutions)
 * needed to transform str1 into str2
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create 2D array
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the rest
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Extract words from text
 */
export function extractWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

/**
 * Calculate word overlap between two texts
 */
export function calculateWordOverlap(text1: string, text2: string): number {
  const words1 = new Set(extractWords(text1));
  const words2 = new Set(extractWords(text2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      overlap++;
    }
  }

  // Return percentage of overlap relative to the smaller set
  const minSize = Math.min(words1.size, words2.size);
  return (overlap / minSize) * 100;
}

/**
 * Check if text contains all required keywords
 */
export function containsAllKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;

  const normalizedText = normalizeText(text);
  const words = new Set(normalizedText.split(' '));

  return keywords.every((keyword) => {
    const normalizedKeyword = keyword.toLowerCase();
    // Check exact match or fuzzy match
    return words.has(normalizedKeyword) ||
      Array.from(words).some((word) => calculateSimilarity(word, normalizedKeyword) >= 85);
  });
}

/**
 * Get a feedback message based on match result
 */
export function getMatchFeedback(result: VoiceMatchResult): string {
  if (result.isMatch) {
    if (result.accuracy === 100) {
      return 'Perfect!';
    } else if (result.accuracy >= 90) {
      return 'Excellent!';
    } else if (result.accuracy >= 80) {
      return 'Great job!';
    } else {
      return 'Good enough!';
    }
  } else {
    if (result.accuracy >= 50) {
      return 'Almost there! Try again.';
    } else if (result.missingKeywords.length > 0) {
      return `Missing: ${result.missingKeywords.slice(0, 2).join(', ')}`;
    } else {
      return 'Try speaking more clearly.';
    }
  }
}

/**
 * Calculate bonus points based on accuracy and streak
 */
export function calculateBonusPoints(
  basePoints: number,
  accuracy: number,
  streakCount: number,
  difficulty: VoiceGameDifficulty
): number {
  const difficultyMultipliers: Record<VoiceGameDifficulty, number> = {
    1: 1.0,
    2: 1.25,
    3: 1.5,
    4: 1.75,
    5: 2.0,
  };

  let points = basePoints;

  // Difficulty multiplier
  points *= difficultyMultipliers[difficulty];

  // Accuracy bonus (up to 50% extra for 100% accuracy)
  const accuracyBonus = (accuracy / 100) * 0.5;
  points *= (1 + accuracyBonus);

  // Streak bonus (10% per streak item, capped at 100% bonus)
  const streakBonus = Math.min(streakCount * 0.1, 1.0);
  points *= (1 + streakBonus);

  return Math.round(points);
}
