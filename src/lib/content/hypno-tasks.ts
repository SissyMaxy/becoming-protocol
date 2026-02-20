/**
 * Hypno Task Codes & Card Config
 *
 * Task template codes for hypno sessions, following the
 * CAM_TASK_CODES pattern from cam-tasks.ts.
 */

import type { ComplianceBypassLevel, HypnoSessionType } from '../../types/hypno-bridge';

// ============================================
// TASK CODES
// ============================================

export const HYPNO_TASK_CODES = {
  // Session types
  HYPNO_SESSION:      'HYP1',   // Standard conditioning session
  HYPNO_EDGE:         'HYP2',   // Edge-adjacent hypno (denial day gated)
  HYPNO_SLEEP:        'HYP3',   // Sleep programming
  HYPNO_CONTENT:      'HYP4',   // Content-focused session with capture

  // Compliance bypass codes
  QUICK_CAPTURE:      'HYP5',   // Quick shoot bypass
  CAGE_CHECK_CAPTURE: 'HYP6',   // Cage check capture
  HYPNO_WITH_CAPTURE: 'HYP7',   // Hypno with passive capture (core bypass)
  AUDIO_ONLY:         'HYP8',   // Audio-only session
  TEXT_ONLY:          'HYP9',   // Text affirmations only

  // Future
  COLLAGE_GENERATOR:  'HYP10',  // Collage generation from vault
} as const;

export type HypnoTaskCode = typeof HYPNO_TASK_CODES[keyof typeof HYPNO_TASK_CODES];

// ============================================
// TASK CARD CONFIG
// ============================================

export interface HypnoTaskCardConfig {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  effortLevel: string;
  sessionType: HypnoSessionType;
  includesCapture: boolean;
}

const TASK_CARD_CONFIGS: Record<string, HypnoTaskCardConfig> = {
  [HYPNO_TASK_CODES.HYPNO_SESSION]: {
    icon: '🌀',
    color: 'purple',
    title: 'Conditioning Session',
    subtitle: 'Cage on. Earbuds in. Watch the playlist.',
    effortLevel: 'minimal',
    sessionType: 'conditioning',
    includesCapture: false,
  },
  [HYPNO_TASK_CODES.HYPNO_EDGE]: {
    icon: '🌀🔥',
    color: 'deep_purple',
    title: 'Edge Session + Conditioning',
    subtitle: 'Collage mode. Device connected. Handler controls everything.',
    effortLevel: 'moderate',
    sessionType: 'edge_adjacent',
    includesCapture: true,
  },
  [HYPNO_TASK_CODES.HYPNO_SLEEP]: {
    icon: '🌙',
    color: 'dark_blue',
    title: 'Sleep Conditioning',
    subtitle: 'Earbuds in. Cage on. Let go.',
    effortLevel: 'zero',
    sessionType: 'sleep',
    includesCapture: false,
  },
  [HYPNO_TASK_CODES.HYPNO_CONTENT]: {
    icon: '🌀📸',
    color: 'purple_pink',
    title: 'Content Session — Trance Capture',
    subtitle: 'Camera on. Watch the playlist. Let the camera see what happens.',
    effortLevel: 'moderate',
    sessionType: 'passive_capture',
    includesCapture: true,
  },
  [HYPNO_TASK_CODES.QUICK_CAPTURE]: {
    icon: '📸',
    color: 'blue',
    title: 'Quick Capture',
    subtitle: '15 min, one capture minimum.',
    effortLevel: 'moderate',
    sessionType: 'passive_capture',
    includesCapture: true,
  },
  [HYPNO_TASK_CODES.CAGE_CHECK_CAPTURE]: {
    icon: '🔒📸',
    color: 'amber',
    title: 'Cage Check',
    subtitle: 'Cage check photo for the record.',
    effortLevel: 'minimal',
    sessionType: 'passive_capture',
    includesCapture: true,
  },
  [HYPNO_TASK_CODES.HYPNO_WITH_CAPTURE]: {
    icon: '🌀🎥',
    color: 'purple',
    title: 'Hypno Session — Passive Capture',
    subtitle: 'Just watch. Camera runs in background.',
    effortLevel: 'zero',
    sessionType: 'compliance_bypass',
    includesCapture: true,
  },
  [HYPNO_TASK_CODES.AUDIO_ONLY]: {
    icon: '🎧',
    color: 'indigo',
    title: 'Audio Conditioning',
    subtitle: 'Earbuds in. No camera required.',
    effortLevel: 'zero',
    sessionType: 'compliance_bypass',
    includesCapture: false,
  },
  [HYPNO_TASK_CODES.TEXT_ONLY]: {
    icon: '📝',
    color: 'gray',
    title: 'Affirmation Reading',
    subtitle: 'Read affirmations. One minute minimum.',
    effortLevel: 'zero',
    sessionType: 'compliance_bypass',
    includesCapture: false,
  },
  [HYPNO_TASK_CODES.COLLAGE_GENERATOR]: {
    icon: '✨🎬',
    color: 'gold',
    title: 'Handler Content: Auto-PMV',
    subtitle: 'The Handler made content from your vault. Review and approve.',
    effortLevel: 'approval_only',
    sessionType: 'passive_capture',
    includesCapture: false,
  },
};

export function getHypnoTaskCard(taskCode: string): HypnoTaskCardConfig | null {
  return TASK_CARD_CONFIGS[taskCode] || null;
}

// ============================================
// BYPASS LEVEL → TASK CODE MAPPING
// ============================================

const BYPASS_TASK_MAP: Record<ComplianceBypassLevel, string> = {
  full_shoot: HYPNO_TASK_CODES.HYPNO_CONTENT,
  quick_shoot: HYPNO_TASK_CODES.QUICK_CAPTURE,
  cage_check: HYPNO_TASK_CODES.CAGE_CHECK_CAPTURE,
  hypno_with_capture: HYPNO_TASK_CODES.HYPNO_WITH_CAPTURE,
  audio_only: HYPNO_TASK_CODES.AUDIO_ONLY,
  text_only: HYPNO_TASK_CODES.TEXT_ONLY,
};

export function getBypassTaskCode(level: ComplianceBypassLevel): string {
  return BYPASS_TASK_MAP[level];
}

// ============================================
// PRESCRIPTION → TASK CODES
// ============================================

export function getTasksForHypnoPrescription(
  context: {
    sessionType: HypnoSessionType;
    denialDay: number;
    isFirstSession: boolean;
    captureEnabled: boolean;
  }
): string[] {
  const codes: string[] = [];

  // Always start with the appropriate session code
  switch (context.sessionType) {
    case 'sleep':
      codes.push(HYPNO_TASK_CODES.HYPNO_SLEEP);
      break;
    case 'edge_adjacent':
      codes.push(HYPNO_TASK_CODES.HYPNO_EDGE);
      break;
    case 'passive_capture':
      codes.push(HYPNO_TASK_CODES.HYPNO_CONTENT);
      break;
    case 'compliance_bypass':
      codes.push(HYPNO_TASK_CODES.HYPNO_WITH_CAPTURE);
      break;
    case 'conditioning':
    default:
      codes.push(HYPNO_TASK_CODES.HYPNO_SESSION);
      break;
  }

  return codes;
}
