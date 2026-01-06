// Guy Mode Tracking Types
// System for tracking and penalizing masculine presentation

export type GuyModeEventType =
  | 'masculine_clothing_worn'
  | 'deadname_used_by_self'
  | 'masculine_voice_used'
  | 'masculine_posture_defaulted'
  | 'skipped_feminization'
  | 'guy_mode_hours'
  | 'costume_mode_entered'
  | 'costume_mode_exited';

export type GuyModePenaltyLevel =
  | 'logged_only'
  | 'warning'
  | 'edge_debt'
  | 'mandatory_task'
  | 'ai_intervention'
  | 'phase_regression_warning';

export interface GuyModeEvent {
  id: string;
  userId: string;
  eventType: GuyModeEventType;
  durationMinutes?: number;
  loggedAt: string;
  notes?: string;
  triggeredPenalty: boolean;
  penaltyApplied?: string;
}

export interface DbGuyModeEvent {
  id: string;
  user_id: string;
  event_type: string;
  duration_minutes: number | null;
  logged_at: string;
  notes: string | null;
  triggered_penalty: boolean;
  penalty_applied: string | null;
  created_at: string;
}

export interface GuyModePenalty {
  type: GuyModePenaltyLevel;
  description: string;
  edgeDebt?: number;
  investmentDecay?: number;
  mandatoryTaskCategory?: string;
}

export interface GuyModeStats {
  totalGuyModeHours: number;
  guyModeHoursThisWeek: number;
  guyModeRatioTrend: 'increasing' | 'stable' | 'decreasing';
  lastFullGuyModeDay?: string;
  daysSinceMasculineUnderwear: number;
  occurrencesByType: Record<GuyModeEventType, number>;
  currentPenaltyLevel: GuyModePenaltyLevel;
}

export interface MasculineCapability {
  name: string;
  lastUsed?: string;
  daysUnused: number;
  comfortLevel: number; // 0-100, decreasing
  atrophyAcknowledged: boolean;
}

export interface DbMasculineCapability {
  id: string;
  user_id: string;
  capability_name: string;
  last_used: string | null;
  days_unused: number;
  comfort_level: number;
  atrophy_acknowledged: boolean;
  created_at: string;
  updated_at: string;
}

// Penalty escalation configuration
export const GUY_MODE_PENALTY_CONFIG: Record<number, GuyModePenalty> = {
  1: {
    type: 'logged_only',
    description: 'Event logged. No penalty.',
  },
  2: {
    type: 'warning',
    description: 'Warning issued. Consider your choices.',
    edgeDebt: 5,
  },
  3: {
    type: 'mandatory_task',
    description: 'Mandatory feminization task added.',
  },
  4: {
    type: 'ai_intervention',
    description: 'AI intervention scheduled. Harder tasks tomorrow.',
  },
  5: {
    type: 'phase_regression_warning',
    description: 'Phase regression warning. Guy mode ratio too high.',
  },
};

// Masculine capabilities to track
export const MASCULINE_CAPABILITIES = [
  {
    name: 'masculine_voice',
    label: 'Masculine Voice',
    atrophyMessage: 'Your old voice is fading. Good.',
  },
  {
    name: 'masculine_posture',
    label: 'Masculine Posture',
    atrophyMessage: 'Standing like him feels wrong now.',
  },
  {
    name: 'masculine_walk',
    label: 'Masculine Walk',
    atrophyMessage: "You'd have to think to walk like him.",
  },
  {
    name: 'masculine_clothing_competence',
    label: 'Masculine Clothing',
    atrophyMessage: "You've forgotten how to dress like him.",
  },
  {
    name: 'masculine_mannerisms',
    label: 'Masculine Mannerisms',
    atrophyMessage: 'His gestures feel foreign now.',
  },
];

// Celebration milestones for capability atrophy
export const ATROPHY_MILESTONES: Record<string, { days: number; message: string }[]> = {
  masculine_voice: [
    { days: 7, message: "A week without his voice. It's getting quieter." },
    { days: 30, message: "She's your only voice now." },
    { days: 90, message: "You couldn't find his voice if you tried." },
  ],
  masculine_posture: [
    { days: 14, message: 'Two weeks standing like her.' },
    { days: 30, message: "His posture feels like a costume now." },
  ],
  masculine_walk: [
    { days: 14, message: 'Two weeks moving like her.' },
    { days: 30, message: "You'd have to think to walk like him." },
  ],
  masculine_clothing_competence: [
    { days: 30, message: 'A month since you dressed like him.' },
    { days: 60, message: 'His clothes feel wrong in your hands.' },
  ],
  masculine_mannerisms: [
    { days: 14, message: 'Two weeks of her gestures.' },
    { days: 30, message: "His mannerisms are fading." },
  ],
};
