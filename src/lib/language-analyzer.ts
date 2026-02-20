/**
 * Language Analyzer
 *
 * Analyzes text for masculine/feminine self-reference patterns.
 * Used by identity_language corruption level for tracking and correction.
 */

export interface LanguageAnalysis {
  masculine_count: number;
  feminine_count: number;
  total_references: number;
  feminine_ratio: number;
  masculine_words: string[];
  feminine_words: string[];
}

const MASCULINE_PATTERN = /\b(he|him|his|himself|david|I am a man|I am a guy|as a man|as a guy)\b/gi;
const FEMININE_PATTERN = /\b(she|her|hers|herself|maxy|I am a woman|I am a girl|as a woman|as a girl)\b/gi;

export function analyzeLanguage(text: string): LanguageAnalysis {
  const masculineMatches = text.match(MASCULINE_PATTERN) || [];
  const feminineMatches = text.match(FEMININE_PATTERN) || [];
  const total = masculineMatches.length + feminineMatches.length;

  return {
    masculine_count: masculineMatches.length,
    feminine_count: feminineMatches.length,
    total_references: total,
    feminine_ratio: feminineMatches.length / Math.max(1, total),
    masculine_words: masculineMatches.map(w => w.toLowerCase()),
    feminine_words: feminineMatches.map(w => w.toLowerCase()),
  };
}

/**
 * Check if text contains masculine self-reference that should be flagged.
 * Excludes possessive "his" when clearly referring to someone else.
 */
export function hasMasculineSelfReference(text: string): boolean {
  const analysis = analyzeLanguage(text);
  return analysis.masculine_count > 0;
}

/**
 * Get words to highlight in text for identity language nudging.
 * Returns positions of masculine self-references.
 */
export interface HighlightRange {
  start: number;
  end: number;
  word: string;
}

export function getMasculineHighlights(text: string): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  const regex = new RegExp(MASCULINE_PATTERN.source, 'gi');
  let match;

  while ((match = regex.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      word: match[0],
    });
  }

  return ranges;
}
