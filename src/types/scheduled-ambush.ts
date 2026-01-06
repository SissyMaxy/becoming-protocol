// Scheduled Ambush Types
// Quick micro-tasks that appear throughout the day at strategic moments

import type { TaskCategory, FeminizationDomain } from './task-bank';

// ============================================
// AMBUSH TYPES
// ============================================

export type AmbushType =
  | 'posture'       // Quick posture check/correction
  | 'voice'         // Brief voice practice (phrase, pitch)
  | 'affirmation'   // Say/think something
  | 'pose'          // Strike a pose, photo optional
  | 'breath'        // Breathing/centering exercise
  | 'check_in'      // Quick state check
  | 'micro_task'    // Small immediate action
  | 'anchor'        // Trigger reinforcement
  | 'visualization' // Quick mental image
  | 'movement';     // Brief feminine movement practice

export type ProofType = 'none' | 'tap' | 'photo' | 'audio' | 'selfie';

export type AmbushStatus = 'scheduled' | 'delivered' | 'completed' | 'missed' | 'snoozed';

export type AmbushPriority = 1 | 2 | 3; // 1 = skippable, 2 = important, 3 = critical

// ============================================
// MICRO-TASK TEMPLATES
// ============================================

export interface MicroTaskTemplate {
  id: string;
  type: AmbushType;
  category: TaskCategory;
  domain: FeminizationDomain;

  // Content
  instruction: string;
  duration_seconds: number; // How long the task takes (5-120 seconds typical)

  // Proof requirements
  proof_type: ProofType;
  proof_prompt?: string; // What to capture if photo/audio required

  // Requirements
  min_intensity: 1 | 2 | 3 | 4 | 5;
  max_intensity: 1 | 2 | 3 | 4 | 5;
  requires_privacy: boolean;
  time_windows: ('morning' | 'afternoon' | 'evening' | 'night')[];

  // Frequency control
  max_per_day: number;
  min_gap_hours: number; // Minimum hours between same task

  // Flags
  active: boolean;
}

// ============================================
// SCHEDULED AMBUSH INSTANCE
// ============================================

export interface ScheduledAmbush {
  id: string;
  user_id: string;
  plan_date: string; // YYYY-MM-DD

  // Template reference
  template_id: string;
  template?: MicroTaskTemplate;

  // Scheduling
  scheduled_time: string; // HH:MM
  scheduled_at: string; // ISO timestamp
  priority: AmbushPriority;

  // Delivery
  status: AmbushStatus;
  delivered_at?: string;

  // Completion
  completed_at?: string;
  response_time_seconds?: number;

  // Proof
  proof_submitted: boolean;
  proof_url?: string;

  // Snooze tracking
  snooze_count: number;
  snoozed_until?: string;

  // Context at scheduling
  denial_day_at_schedule?: number;
  arousal_state_at_schedule?: string;

  // AI reasoning
  selection_reason?: string;

  created_at: string;
}

// ============================================
// DATABASE ROW INTERFACES
// ============================================

export interface DbMicroTaskTemplate {
  id: string;
  type: string;
  category: string;
  domain: string;
  instruction: string;
  duration_seconds: number;
  proof_type: string;
  proof_prompt: string | null;
  min_intensity: number;
  max_intensity: number;
  requires_privacy: boolean;
  time_windows: string[];
  max_per_day: number;
  min_gap_hours: number;
  active: boolean;
  created_at: string;
}

export interface DbScheduledAmbush {
  id: string;
  user_id: string;
  plan_date: string;
  template_id: string;
  scheduled_time: string;
  scheduled_at: string;
  priority: number;
  status: string;
  delivered_at: string | null;
  completed_at: string | null;
  response_time_seconds: number | null;
  proof_submitted: boolean;
  proof_url: string | null;
  snooze_count: number;
  snoozed_until: string | null;
  denial_day_at_schedule: number | null;
  arousal_state_at_schedule: string | null;
  selection_reason: string | null;
  created_at: string;
  // Joined data
  micro_task_templates?: DbMicroTaskTemplate;
}

// ============================================
// MAPPERS
// ============================================

export function mapDbToMicroTaskTemplate(db: DbMicroTaskTemplate): MicroTaskTemplate {
  return {
    id: db.id,
    type: db.type as AmbushType,
    category: db.category as TaskCategory,
    domain: db.domain as FeminizationDomain,
    instruction: db.instruction,
    duration_seconds: db.duration_seconds,
    proof_type: db.proof_type as ProofType,
    proof_prompt: db.proof_prompt || undefined,
    min_intensity: db.min_intensity as 1 | 2 | 3 | 4 | 5,
    max_intensity: db.max_intensity as 1 | 2 | 3 | 4 | 5,
    requires_privacy: db.requires_privacy,
    time_windows: db.time_windows as ('morning' | 'afternoon' | 'evening' | 'night')[],
    max_per_day: db.max_per_day,
    min_gap_hours: db.min_gap_hours,
    active: db.active,
  };
}

export function mapDbToScheduledAmbush(db: DbScheduledAmbush): ScheduledAmbush {
  return {
    id: db.id,
    user_id: db.user_id,
    plan_date: db.plan_date,
    template_id: db.template_id,
    template: db.micro_task_templates
      ? mapDbToMicroTaskTemplate(db.micro_task_templates)
      : undefined,
    scheduled_time: db.scheduled_time,
    scheduled_at: db.scheduled_at,
    priority: db.priority as AmbushPriority,
    status: db.status as AmbushStatus,
    delivered_at: db.delivered_at || undefined,
    completed_at: db.completed_at || undefined,
    response_time_seconds: db.response_time_seconds || undefined,
    proof_submitted: db.proof_submitted,
    proof_url: db.proof_url || undefined,
    snooze_count: db.snooze_count,
    snoozed_until: db.snoozed_until || undefined,
    denial_day_at_schedule: db.denial_day_at_schedule || undefined,
    arousal_state_at_schedule: db.arousal_state_at_schedule || undefined,
    selection_reason: db.selection_reason || undefined,
    created_at: db.created_at,
  };
}

// ============================================
// AMBUSH TYPE CONFIGURATION
// ============================================

export const AMBUSH_TYPE_CONFIG: Record<AmbushType, {
  label: string;
  icon: string;
  description: string;
  default_duration: number;
  default_proof: ProofType;
}> = {
  posture: {
    label: 'Posture Check',
    icon: '🧍‍♀️',
    description: 'Check and correct your posture',
    default_duration: 10,
    default_proof: 'tap',
  },
  voice: {
    label: 'Voice Practice',
    icon: '🎤',
    description: 'Quick voice practice',
    default_duration: 30,
    default_proof: 'audio',
  },
  affirmation: {
    label: 'Affirmation',
    icon: '💭',
    description: 'Say or think an affirmation',
    default_duration: 15,
    default_proof: 'tap',
  },
  pose: {
    label: 'Strike a Pose',
    icon: '💃',
    description: 'Feminine pose practice',
    default_duration: 20,
    default_proof: 'photo',
  },
  breath: {
    label: 'Breath Work',
    icon: '🌬️',
    description: 'Centering breath exercise',
    default_duration: 30,
    default_proof: 'tap',
  },
  check_in: {
    label: 'State Check',
    icon: '📊',
    description: 'Quick emotional/state check',
    default_duration: 15,
    default_proof: 'tap',
  },
  micro_task: {
    label: 'Micro Task',
    icon: '✨',
    description: 'Small immediate action',
    default_duration: 60,
    default_proof: 'tap',
  },
  anchor: {
    label: 'Anchor',
    icon: '⚓',
    description: 'Trigger reinforcement',
    default_duration: 20,
    default_proof: 'tap',
  },
  visualization: {
    label: 'Visualize',
    icon: '👁️',
    description: 'Quick mental imagery',
    default_duration: 30,
    default_proof: 'tap',
  },
  movement: {
    label: 'Movement',
    icon: '🩰',
    description: 'Feminine movement practice',
    default_duration: 30,
    default_proof: 'none',
  },
};

// ============================================
// SCHEDULING CONFIGURATION
// ============================================

export interface AmbushScheduleConfig {
  min_ambushes_per_day: number;
  max_ambushes_per_day: number;
  min_gap_minutes: number;
  snooze_limit: number;
  snooze_duration_minutes: number;

  // Time windows (24h format)
  windows: {
    morning: { start: string; end: string };
    afternoon: { start: string; end: string };
    evening: { start: string; end: string };
    night: { start: string; end: string };
  };

  // Intensity scaling
  intensity_by_denial_day: {
    low: number;  // Days 1-3
    medium: number; // Days 4-7
    high: number; // Days 8+
  };
}

export const DEFAULT_AMBUSH_CONFIG: AmbushScheduleConfig = {
  min_ambushes_per_day: 3,
  max_ambushes_per_day: 8,
  min_gap_minutes: 45,
  snooze_limit: 2,
  snooze_duration_minutes: 15,

  windows: {
    morning: { start: '07:00', end: '12:00' },
    afternoon: { start: '12:00', end: '17:00' },
    evening: { start: '17:00', end: '21:00' },
    night: { start: '21:00', end: '23:30' },
  },

  intensity_by_denial_day: {
    low: 2,
    medium: 3,
    high: 5,
  },
};

// ============================================
// AMBUSH STATS
// ============================================

export interface AmbushDayStats {
  date: string;
  total_scheduled: number;
  delivered: number;
  completed: number;
  missed: number;
  completion_rate: number;
  avg_response_time_seconds: number;
  proofs_submitted: number;
}

export interface AmbushWeekStats {
  week_start: string;
  week_end: string;
  total_ambushes: number;
  completed: number;
  missed: number;
  completion_rate: number;
  most_completed_type: AmbushType;
  most_missed_type: AmbushType;
  avg_daily_completion_rate: number;
}
