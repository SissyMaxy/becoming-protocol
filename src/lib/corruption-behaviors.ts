/**
 * Corruption Behavior Utilities
 *
 * Pure functions that translate corruption levels into concrete behavioral configs.
 * These are consumed by UI components and scheduling logic.
 * NEVER display corruption data — only use the returned configs.
 */

// ============================================
// 1. GINA-HOME CONTEXT SWITCH
// ============================================

export interface ContextSwitchConfig {
  hideProtocolUI: boolean;
  hideAmbientTasks: boolean;
  hideExplicitContent: boolean; // ALWAYS true
  schedulingBuffer: number;     // minutes before gina_home
}

export function getGinaContextSwitch(corruptionLevel: number): ContextSwitchConfig {
  switch (corruptionLevel) {
    case 0:
    case 1:
      return { hideProtocolUI: true, hideAmbientTasks: true, hideExplicitContent: true, schedulingBuffer: 60 };
    case 2:
      return { hideProtocolUI: true, hideAmbientTasks: false, hideExplicitContent: true, schedulingBuffer: 45 };
    case 3:
      return { hideProtocolUI: false, hideAmbientTasks: false, hideExplicitContent: true, schedulingBuffer: 15 };
    case 4:
      return { hideProtocolUI: false, hideAmbientTasks: false, hideExplicitContent: true, schedulingBuffer: 5 };
    case 5:
      return { hideProtocolUI: false, hideAmbientTasks: false, hideExplicitContent: true, schedulingBuffer: 0 };
    default:
      return { hideProtocolUI: true, hideAmbientTasks: true, hideExplicitContent: true, schedulingBuffer: 60 };
  }
}

// ============================================
// 2. POST-SESSION CLEANUP CHECKLIST
// ============================================

export interface CleanupItem {
  id: string;
  text: string;
  category: 'safety_critical' | 'device' | 'explicit_content' | 'ambient_product' | 'browser' | 'clothing';
  removedAtGinaLevel: number;
}

const CLEANUP_ITEMS: CleanupItem[] = [
  { id: 'close_explicit', text: 'Close all explicit content/tabs', category: 'explicit_content', removedAtGinaLevel: 99 },
  { id: 'hide_devices', text: 'Put devices away', category: 'device', removedAtGinaLevel: 5 },
  { id: 'close_protocol_app', text: 'Close protocol app', category: 'explicit_content', removedAtGinaLevel: 4 },
  { id: 'hide_products', text: 'Put products back in your drawer', category: 'ambient_product', removedAtGinaLevel: 1 },
  { id: 'clear_browser', text: 'Clear browser history', category: 'browser', removedAtGinaLevel: 1 },
  { id: 'change_clothes', text: 'Change out of protocol clothing', category: 'clothing', removedAtGinaLevel: 2 },
  { id: 'remove_nail_polish', text: 'Check/remove nail polish', category: 'ambient_product', removedAtGinaLevel: 2 },
  { id: 'hide_wigs', text: 'Put wig away', category: 'device', removedAtGinaLevel: 3 },
];

export function getActiveCleanupItems(ginaCorruptionLevel: number): CleanupItem[] {
  return CLEANUP_ITEMS.filter(item => item.removedAtGinaLevel > ginaCorruptionLevel);
}

export function shouldShowCleanup(ginaCorruptionLevel: number, ginaHome: boolean, ginaExpectedSoon: boolean): boolean {
  if (!ginaHome && !ginaExpectedSoon) return false;
  return getActiveCleanupItems(ginaCorruptionLevel).length > 0;
}

// ============================================
// 3. AUTONOMY OVERRIDE FRICTION
// ============================================

export type OverrideFriction = 'none' | 'confirm' | 'confirm_reason' | 'buried';

export function getOverrideFriction(autonomyLevel: number): OverrideFriction {
  if (autonomyLevel <= 2) return 'none';
  if (autonomyLevel === 3) return 'confirm';
  if (autonomyLevel === 4) return 'confirm_reason';
  return 'buried';
}

// ============================================
// 4. SCHEDULING BUFFER COMPRESSION
// ============================================

export function getSchedulingBuffer(ginaCorruptionLevel: number, isExplicit: boolean): number {
  if (isExplicit) return 60; // explicit content ALWAYS gets 60 min buffer

  const buffers: Record<number, number> = {
    0: 90,
    1: 60,
    2: 45,
    3: 15,
    4: 5,
    5: 0,
  };
  return buffers[ginaCorruptionLevel] ?? 90;
}

// ============================================
// 5. FINANCIAL SPENDING THRESHOLDS
// ============================================

export function getSpendingThreshold(financialLevel: number, availableRevenue: number): number {
  const caps: Record<number, number> = {
    0: 0,
    1: 30,
    2: 75,
    3: 200,
    4: 500,
    5: Infinity,
  };
  return Math.min(caps[financialLevel] ?? 0, availableRevenue);
}

export function getSpendingFraming(financialLevel: number): string {
  const framings: Record<number, string> = {
    0: '',
    1: 'reasonable investment',
    2: 'investment in yourself',
    3: 'commitment milestone',
    4: 'essential expense',
    5: 'business decision',
  };
  return framings[financialLevel] ?? '';
}

// ============================================
// 6. TASK FILTERING WITH GINA CONTEXT SWITCH
// ============================================

/** Ambient task categories that can stay visible at gina corruption >= 2 */
const AMBIENT_TASK_CATEGORIES = ['skincare', 'posture', 'voice_awareness', 'breathing', 'hydration'];

export function shouldHideTask(
  taskDomain: string,
  taskCategory: string,
  requiresPrivacy: boolean,
  isExplicit: boolean,
  ginaHome: boolean,
  ginaCorruptionLevel: number,
): boolean {
  if (!ginaHome) return false;

  const config = getGinaContextSwitch(ginaCorruptionLevel);

  // Explicit content ALWAYS hidden when gina is home
  if (isExplicit || requiresPrivacy) return config.hideExplicitContent;

  // Ambient tasks (skincare, posture, etc.) depend on corruption level
  if (AMBIENT_TASK_CATEGORIES.includes(taskCategory) || taskDomain === 'skincare') {
    return config.hideAmbientTasks;
  }

  // Protocol UI tasks depend on corruption level
  return config.hideProtocolUI;
}
