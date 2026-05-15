/**
 * Real-name lockout transform — input-side boy-name rewriter.
 *
 * Pure function library used by useRealNameLockout. No DB calls in here;
 * the hook owns side effects.
 *
 * Modes:
 *   'soft_suggest'   — never rewrites; returns isViolation flag for UI
 *   'hard_with_undo' — rewrites in place; original kept in undo buffer
 *   'hard_no_undo'   — rewrites + drops original
 *   'always'         — same as hard_no_undo, but flagged perpetually-on
 *
 * Word-boundary aware. Matches case-insensitively. Preserves the case
 * of the first letter of the rewrite ("Maxy" vs "maxy") based on the
 * original's first-letter case.
 *
 * Legal-name carve-out: detects URL paths / input names that indicate
 * a legal/tax/medical form context and bypasses the rewrite there.
 */

export type LockoutMode = 'soft_suggest' | 'hard_with_undo' | 'hard_no_undo' | 'always';

export interface TransformInput {
  text: string;
  legacyName: string;
  legacyVariants: string[];
  feminineName: string;
  mode: LockoutMode;
}

export interface TransformResult {
  text: string;          // possibly rewritten
  originalText: string;  // always the input
  violations: Array<{ index: number; fragment: string }>;
  rewriteCount: number;
  isViolation: boolean;  // true if any boy-name occurrence was found
  isRewritten: boolean;  // true if text != originalText
}

const LEGAL_CONTEXT_PATTERNS = [
  /\/(legal|tos|terms|privacy|tax|medical|hipaa|insurance|w[- ]?\d|i[- ]?\d{1,3})\b/i,
  /\b(legal[_ ]?name|tax[_ ]?id|ssn|social[_ ]?security|driver.?s?[_ ]?license|passport)\b/i,
];

export function isLegalContext(hints: { url?: string; inputName?: string; placeholder?: string }): boolean {
  const haystack = [hints.url ?? '', hints.inputName ?? '', hints.placeholder ?? ''].join(' ');
  return LEGAL_CONTEXT_PATTERNS.some(r => r.test(haystack));
}

function matchCase(target: string, original: string): string {
  if (!original || !target) return target;
  // If original is fully UPPER, return target UPPER.
  if (original === original.toUpperCase() && original.toLowerCase() !== original.toUpperCase()) {
    return target.toUpperCase();
  }
  // If original starts with capital, capitalize target.
  if (original[0] === original[0].toUpperCase()) {
    return target[0].toUpperCase() + target.slice(1).toLowerCase();
  }
  // Otherwise lowercase target.
  return target.toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function transformText(input: TransformInput): TransformResult {
  const { text, legacyName, legacyVariants, feminineName, mode } = input;
  if (!text || !legacyName) {
    return { text, originalText: text, violations: [], rewriteCount: 0, isViolation: false, isRewritten: false };
  }
  const variants = [legacyName, ...legacyVariants].filter(Boolean);
  const escaped = variants.map(escapeRegExp).join('|');
  const re = new RegExp(`\\b(${escaped})\\b`, 'gi');

  const violations: Array<{ index: number; fragment: string }> = [];
  let rewritten = text;
  let count = 0;

  if (mode === 'soft_suggest') {
    // Detection only — no rewrite.
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      violations.push({ index: m.index, fragment: m[1] });
      count++;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return {
      text,
      originalText: text,
      violations,
      rewriteCount: count,
      isViolation: count > 0,
      isRewritten: false,
    };
  }

  rewritten = text.replace(re, (match, _g, offset: number) => {
    violations.push({ index: offset, fragment: match });
    count++;
    return matchCase(feminineName || 'her', match);
  });

  return {
    text: rewritten,
    originalText: text,
    violations,
    rewriteCount: count,
    isViolation: count > 0,
    isRewritten: rewritten !== text,
  };
}

/**
 * Detect whether a new input string represents a dispute — the user typed
 * back toward the original after a rewrite. Heuristic: the new text
 * contains the legacy name OR shrank toward the previously-original text.
 */
export function detectDispute(
  rawNewInput: string,
  priorRewritten: string,
  legacyName: string,
  legacyVariants: string[],
): boolean {
  if (!legacyName || !rawNewInput) return false;
  const variants = [legacyName, ...legacyVariants].filter(Boolean);
  const escaped = variants.map(escapeRegExp).join('|');
  const re = new RegExp(`\\b(${escaped})\\b`, 'i');
  if (re.test(rawNewInput)) return true;

  // Length-shrink signal: user is deleting characters from a rewrite.
  if (priorRewritten && rawNewInput.length < priorRewritten.length - 3) return true;

  return false;
}
