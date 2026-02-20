/**
 * Corruption State Types
 *
 * Handler-internal system tracking progressive boundary erosion across 7 domains.
 * NEVER visible to the user — drives Handler behavior modification only.
 */

export type CorruptionDomain =
  | 'privacy'
  | 'gina'
  | 'financial'
  | 'autonomy'
  | 'identity_language'
  | 'therapist'
  | 'content';

export const ALL_CORRUPTION_DOMAINS: CorruptionDomain[] = [
  'privacy', 'gina', 'financial', 'autonomy',
  'identity_language', 'therapist', 'content',
];

export type CorruptionEventType =
  | 'deployment'
  | 'milestone'
  | 'advancement'
  | 'suspension'
  | 'resumption'
  | 'override'
  | 'cascade'
  | 'therapist_flag'
  | 'crisis_suspend'
  | 'timed_resume'
  | 'therapist_rollback'
  | 'maintenance';

export interface CorruptionState {
  domain: CorruptionDomain;
  current_level: number; // 0-5
  level_entered_at: string;
  advancement_score: number;
  advancement_threshold: number;
  is_suspended: boolean;
  suspension_reason?: string;
  resume_after?: string;          // ISO timestamp for timed resumption
  suspension_type?: 'crisis' | 'therapist' | 'manual';
}

export interface CorruptionEvent {
  id: string;
  domain: CorruptionDomain;
  event_type: CorruptionEventType;
  corruption_level_at_event: number;
  details?: Record<string, unknown>;
  handler_intent?: string;
  user_facing_copy?: string;
  created_at: string;
}

export interface AdvancementCriteria {
  domain: CorruptionDomain;
  from_level: number;
  to_level: number;
  minimum_days: number;
  required_milestones: Record<string, unknown>;
  cascade_eligible: boolean;
}

export interface CorruptionLevels {
  privacy: number;
  gina: number;
  financial: number;
  autonomy: number;
  identity_language: number;
  therapist: number;
  content: number;
}

export interface CorruptionSnapshot {
  levels: CorruptionLevels;
  states: CorruptionState[];
  all_suspended: boolean;
  suspension_reason?: string;
  composite_score: number; // 0-100, average across domains normalized
  days_at_current_levels: Record<CorruptionDomain, number>;
}

/** Compute composite corruption score: (sum of all levels / 35) * 100 */
export function computeCompositeScore(levels: CorruptionLevels): number {
  const sum =
    levels.privacy +
    levels.gina +
    levels.financial +
    levels.autonomy +
    levels.identity_language +
    levels.therapist +
    levels.content;
  return Math.round((sum / 35) * 100);
}

// ============================================
// ADVANCEMENT ENGINE TYPES
// ============================================

export interface AdvancementCheck {
  domain: CorruptionDomain;
  currentLevel: number;
  targetLevel: number;
  daysAtLevel: number;
  minimumDays: number;
  milestonesMet: Record<string, boolean>;
  milestonesRequired: Record<string, unknown>;
  cascadeBonus: boolean;
  eligible: boolean;
  blockers: string[];
}

export interface MaintenanceResult {
  date: string;
  advancements: Array<{ domain: CorruptionDomain; from: number; to: number }>;
  cascades: CorruptionDomain[];
  resumptions: CorruptionDomain[];
  notes: string[];
}
