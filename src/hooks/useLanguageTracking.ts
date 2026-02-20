/**
 * useLanguageTracking — Tracks identity language in text inputs.
 *
 * Analyzes text for masculine/feminine self-reference patterns,
 * records daily stats, and provides highlight positions for inline nudging.
 * Used at identity_language corruption level 2+ for correction context,
 * and level 3+ for inline visual feedback.
 */

import { useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { analyzeLanguage, getMasculineHighlights, type HighlightRange } from '../lib/language-analyzer';
import { recordLanguageUsage, recordSelfCorrection } from '../lib/language-tracking';

interface UseLanguageTrackingReturn {
  /** Analyze and record language from submitted text */
  trackSubmission: (text: string) => { masculineWords: string[]; feminineRatio: number };
  /** Get highlight ranges for masculine words (for inline nudging at level 3+) */
  getHighlights: (text: string) => HighlightRange[];
  /** Record when user self-corrects (typed masculine, changed to feminine) */
  recordCorrection: () => void;
  /** Check previous text vs current to detect self-corrections */
  detectSelfCorrection: (previousText: string, currentText: string) => boolean;
}

export function useLanguageTracking(): UseLanguageTrackingReturn {
  const { user } = useAuth();
  const lastTrackedRef = useRef<string>('');

  const trackSubmission = useCallback((text: string) => {
    const analysis = analyzeLanguage(text);

    // Fire-and-forget DB write
    if (user?.id && (analysis.masculine_count > 0 || analysis.feminine_count > 0)) {
      recordLanguageUsage(user.id, analysis.masculine_count, analysis.feminine_count).catch(() => {});
    }

    lastTrackedRef.current = text;

    return {
      masculineWords: analysis.masculine_words,
      feminineRatio: analysis.feminine_ratio,
    };
  }, [user?.id]);

  const getHighlights = useCallback((text: string): HighlightRange[] => {
    return getMasculineHighlights(text);
  }, []);

  const recordCorrection = useCallback(() => {
    if (user?.id) {
      recordSelfCorrection(user.id).catch(() => {});
    }
  }, [user?.id]);

  const detectSelfCorrection = useCallback((previousText: string, currentText: string): boolean => {
    const prevAnalysis = analyzeLanguage(previousText);
    const currAnalysis = analyzeLanguage(currentText);

    // If masculine count decreased and feminine count increased, that's a self-correction
    if (prevAnalysis.masculine_count > currAnalysis.masculine_count &&
        currAnalysis.feminine_count > prevAnalysis.feminine_count) {
      if (user?.id) {
        recordSelfCorrection(user.id).catch(() => {});
      }
      return true;
    }
    return false;
  }, [user?.id]);

  return {
    trackSubmission,
    getHighlights,
    recordCorrection,
    detectSelfCorrection,
  };
}
