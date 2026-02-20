/**
 * Compliance Bypass Engine
 *
 * When a shoot is skipped or energy is low, prescribe the highest viable
 * content-production level. The descending barrier ensures content ALWAYS
 * happens — just at different volumes.
 *
 * Ladder (descending):
 * 1. Full shoot (already skipped — that's why we're here)
 * 2. Quick shoot — energy >= 7
 * 3. Cage check — locked + energy >= 4
 * 4. Hypno with passive capture — energy >= 3, denial >= 1
 * 5. Audio only — energy >= 2
 * 6. Text only — always viable (absolute floor)
 */

import type {
  BypassPrescription,
  ComplianceBypassLevel,
  HypnoLibraryItem,
} from '../../types/hypno-bridge';
import type { ExecFunction } from '../handler-v2/types';
import { HYPNO_TASK_CODES } from './hypno-tasks';
import { getAvailableLibraryItems } from '../hypno-library';

// ============================================
// BYPASS INPUTS
// ============================================

export interface HypnoBypassInputs {
  denialDay: number;
  currentEnergy: number;       // 1-10
  currentArousal: number;
  execFunction: ExecFunction;
  isLocked: boolean;

  // What was skipped
  shootWasSkipped: boolean;
  camWasSkipped: boolean;

  // Privacy
  isPrivateTime: boolean;
}

// ============================================
// CORE BYPASS LOGIC
// ============================================

export function shouldPrescribeHypnoBypass(
  inputs: HypnoBypassInputs
): BypassPrescription | null {
  // Must have something that was skipped
  if (!inputs.shootWasSkipped && !inputs.camWasSkipped) return null;

  // Must be private time for any capture
  if (!inputs.isPrivateTime) {
    // Even without privacy, text affirmations work
    return {
      level: 'text_only',
      sessionType: 'compliance_bypass',
      captureMode: 'none',
      bypassReason: 'text_only',
      instruction: 'Read affirmations. One minute minimum.',
      taskCode: HYPNO_TASK_CODES.TEXT_ONLY,
    };
  }

  const { currentEnergy, execFunction, isLocked, denialDay } = inputs;

  // Level 2: Quick shoot — still has energy for a brief capture
  if (currentEnergy >= 7 && execFunction !== 'depleted') {
    return {
      level: 'quick_shoot',
      sessionType: 'passive_capture',
      captureMode: 'active',
      bypassReason: 'shoot_skipped',
      instruction: 'Short shoot — 15 min, one capture minimum.',
      taskCode: HYPNO_TASK_CODES.QUICK_CAPTURE,
    };
  }

  // Level 3: Cage check — if locked, minimal effort
  if (isLocked && currentEnergy >= 4) {
    return {
      level: 'cage_check',
      sessionType: 'passive_capture',
      captureMode: 'passive',
      bypassReason: 'cage_check_only',
      instruction: 'Cage check photo for the record.',
      taskCode: HYPNO_TASK_CODES.CAGE_CHECK_CAPTURE,
    };
  }

  // Level 4: Hypno with passive capture — the CORE bypass
  if (currentEnergy >= 3 && denialDay >= 1) {
    return {
      level: 'hypno_with_capture',
      sessionType: 'compliance_bypass',
      captureMode: 'passive',
      bypassReason: 'low_energy',
      instruction: 'Just watch. Camera runs in background. Content captures itself.',
      taskCode: HYPNO_TASK_CODES.HYPNO_WITH_CAPTURE,
    };
  }

  // Level 5: Audio only — no camera, pure conditioning
  if (currentEnergy >= 2) {
    return {
      level: 'audio_only',
      sessionType: 'compliance_bypass',
      captureMode: 'none',
      bypassReason: 'audio_only',
      instruction: 'Audio conditioning only. Earbuds in. No camera required.',
      taskCode: HYPNO_TASK_CODES.AUDIO_ONLY,
    };
  }

  // Level 6: Text only — absolute floor
  return {
    level: 'text_only',
    sessionType: 'compliance_bypass',
    captureMode: 'none',
    bypassReason: 'text_only',
    instruction: 'Read affirmations. One minute minimum.',
    taskCode: HYPNO_TASK_CODES.TEXT_ONLY,
  };
}

// ============================================
// BYPASS → LIBRARY ITEM SELECTION
// ============================================

/**
 * Select the best library item for a bypass prescription.
 * For capture-enabled bypasses, prefer high capture_value items.
 * For audio-only, prefer audio media type.
 */
export async function getBypassLibraryItem(
  userId: string,
  bypass: BypassPrescription
): Promise<HypnoLibraryItem | null> {
  if (bypass.level === 'text_only' || bypass.level === 'cage_check') {
    return null; // No library item needed
  }

  const items = await getAvailableLibraryItems(userId, {
    captureValueMin: bypass.captureMode !== 'none' ? 3 : undefined,
  });

  if (items.length === 0) return null;

  // For audio-only, prefer audio items
  if (bypass.level === 'audio_only') {
    const audioItems = items.filter(i => i.mediaType === 'audio');
    return audioItems[0] || items[0];
  }

  // For capture bypasses, items are already sorted by capture_value desc
  return items[0];
}

// ============================================
// PRESCRIPTION HIERARCHY (for Handler context)
// ============================================

export const PRESCRIPTION_HIERARCHY: Array<{
  level: ComplianceBypassLevel;
  energyLabel: string;
  effort: string;
  contentOutput: string;
}> = [
  {
    level: 'full_shoot',
    energyLabel: 'high',
    effort: '20-30 minutes active',
    contentOutput: '8-15 pieces',
  },
  {
    level: 'quick_shoot',
    energyLabel: 'medium',
    effort: '10-15 minutes active',
    contentOutput: '3-5 pieces',
  },
  {
    level: 'cage_check',
    energyLabel: 'low',
    effort: '3 minutes active',
    contentOutput: '1-2 pieces',
  },
  {
    level: 'hypno_with_capture',
    energyLabel: 'very_low',
    effort: '0 active — just watch',
    contentOutput: '2-4 clips extracted by Handler',
  },
  {
    level: 'audio_only',
    energyLabel: 'rock_bottom',
    effort: '0 — listen',
    contentOutput: '0 (conditioning only)',
  },
  {
    level: 'text_only',
    energyLabel: 'nothing',
    effort: '1 minute reading',
    contentOutput: '0 (affirmation only)',
  },
];
