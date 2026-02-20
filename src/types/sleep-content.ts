/**
 * Sleep Content System Types
 *
 * Types for the hypnagogic conditioning pipeline:
 * content items, player config, sessions, and state machine.
 */

export type SleepAudioMode = 'text_only' | 'single_earbud' | 'full_audio';

export type SleepCategory =
  | 'identity'
  | 'feminization'
  | 'surrender'
  | 'chastity'
  | 'sleep_induction'
  | 'ambient'
  | 'custom';

export interface SleepContentItem {
  id: string;
  userId: string;
  category: SleepCategory;
  affirmationText: string;
  enabled: boolean;
  sortOrder: number;
  corruptionLevelMin: number;
  requiresPrivacy: boolean;
}

export interface SleepContentConfig {
  id: string;
  userId: string;
  defaultMode: SleepAudioMode;
  defaultTimerMinutes: number;
  defaultDelayMinutes: number;
  voicePitch: number;
  voiceRate: number;
  voiceName: string | null;
  affirmationHoldSeconds: number;
  affirmationGapSeconds: number;
  lovenseSubliminalEnabled: boolean;
  lovenseMaxIntensity: number;
  screenDimEnabled: boolean;
}

export interface SleepSession {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  endReason: 'timer' | 'manual' | 'interrupted' | null;
  modeUsed: SleepAudioMode;
  modeRecommended: SleepAudioMode | null;
  modeCompliant: boolean;
  timerMinutes: number;
  delayMinutes: number;
  affirmationsDisplayed: number;
  affirmationsSpoken: number;
  completedNaturally: boolean;
  lovenseActive: boolean;
}

export type SleepPlayerPhase = 'setup' | 'delay' | 'playing' | 'fading' | 'complete';

export interface SleepPlayerState {
  phase: SleepPlayerPhase;
  mode: SleepAudioMode;
  timerTotalSeconds: number;
  timerRemainingSeconds: number;
  delayRemainingSeconds: number;
  currentAffirmation: string | null;
  affirmationVisible: boolean;
  affirmationsDisplayed: number;
  affirmationsSpoken: number;
  screenOpacity: number;
  volume: number;
  lovenseActive: boolean;
}
