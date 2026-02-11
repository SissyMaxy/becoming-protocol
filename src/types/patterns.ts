/**
 * Pattern Catch System Types
 *
 * Types for tracking and dissolving masculine patterns.
 */

export type PatternCategory = 'language' | 'posture' | 'behavior' | 'thought' | 'appearance';
export type PatternStatus = 'active' | 'improving' | 'resolved' | 'recurring';

export interface MasculinePattern {
  id: string;
  userId: string;
  category: PatternCategory;
  patternName: string;
  description: string | null;
  firstIdentified: string;
  timesCaught: number;
  timesCorrected: number;
  status: PatternStatus;
  feminineReplacement: string | null;
  replacementAutomaticity: number; // 0-100
}

export interface PatternCatch {
  id: string;
  patternId: string;
  userId: string;
  caughtAt: string;
  context: string | null;
  triggerCause: string | null;
  correctionApplied: boolean;
  correctionSuccess: boolean | null;
}

export interface PatternStats {
  totalPatterns: number;
  activePatterns: number;
  resolvedPatterns: number;
  catchesToday: number;
  totalCatches: number;
  avgAutomaticity: number;
  correctionRate: number;
}

export const PATTERN_CATEGORIES: PatternCategory[] = [
  'language',
  'posture',
  'behavior',
  'thought',
  'appearance',
];

export const PATTERN_CATEGORY_LABELS: Record<PatternCategory, string> = {
  language: 'Language',
  posture: 'Posture',
  behavior: 'Behavior',
  thought: 'Thought',
  appearance: 'Appearance',
};

export const PATTERN_CATEGORY_ICONS: Record<PatternCategory, string> = {
  language: 'MessageSquare',
  posture: 'User',
  behavior: 'Activity',
  thought: 'Brain',
  appearance: 'Eye',
};

export const PATTERN_CATEGORY_COLORS: Record<PatternCategory, string> = {
  language: '#6366f1', // Indigo
  posture: '#8b5cf6', // Purple
  behavior: '#ec4899', // Pink
  thought: '#a855f7', // Violet
  appearance: '#f59e0b', // Amber
};

export const PATTERN_STATUSES: PatternStatus[] = [
  'active',
  'improving',
  'resolved',
  'recurring',
];

export const PATTERN_STATUS_LABELS: Record<PatternStatus, string> = {
  active: 'Active',
  improving: 'Improving',
  resolved: 'Resolved',
  recurring: 'Recurring',
};

export const PATTERN_STATUS_COLORS: Record<PatternStatus, string> = {
  active: '#ef4444', // Red
  improving: '#f59e0b', // Amber
  resolved: '#22c55e', // Green
  recurring: '#f97316', // Orange
};
