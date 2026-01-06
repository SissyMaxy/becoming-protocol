// Automatic Escalation Types
// Time-locked escalations that happen whether you're ready or not

export interface AutomaticEscalation {
  id: string;
  dayTrigger: number;
  escalationType: string;
  description: string;
  canDelay: boolean;
  delayCost?: EscalationDelayCost;
  warningDaysBefore: number;
  active: boolean;
}

export interface DbAutomaticEscalation {
  id: string;
  day_trigger: number;
  escalation_type: string;
  description: string;
  can_delay: boolean;
  delay_cost: EscalationDelayCost | null;
  warning_days_before: number;
  active: boolean;
  created_at: string;
}

export interface EscalationDelayCost {
  edgeDebt?: number;
  investmentDecayPercent?: number;
  streakPenalty?: boolean;
}

export interface UserEscalationStatus {
  id: string;
  escalationId: string;
  escalation: AutomaticEscalation;
  triggered: boolean;
  triggeredAt?: string;
  delayed: boolean;
  delayedUntil?: string;
  delayCostPaid?: EscalationDelayCost;
}

export interface DbUserEscalationStatus {
  id: string;
  user_id: string;
  escalation_id: string;
  triggered: boolean;
  triggered_at: string | null;
  delayed: boolean;
  delayed_until: string | null;
  delay_cost_paid: EscalationDelayCost | null;
  created_at: string;
  automatic_escalations?: DbAutomaticEscalation;
}

export interface EscalationCalendarItem {
  escalation: AutomaticEscalation;
  status: 'upcoming' | 'warning' | 'imminent' | 'triggered' | 'delayed';
  daysUntil: number;
  canDelay: boolean;
  delayCost?: EscalationDelayCost;
}

// Escalation type effects
export type EscalationEffect =
  | { type: 'denial_baseline_increase'; newMinimum: number }
  | { type: 'language_default'; language: 'her' | 'she' }
  | { type: 'content_tier_expiry'; tier: string }
  | { type: 'name_enforcement'; name: string }
  | { type: 'masculine_tasks_removed' }
  | { type: 'intensity_increase'; newMinimum: number }
  | { type: 'phase_mandatory'; phase: number }
  | { type: 'disclosure_scheduled' }
  | { type: 'ceremony_triggered'; ceremony: string };

// Escalation status thresholds
export const ESCALATION_STATUS = {
  WARNING_DAYS: 14,      // Show warning this many days before
  IMMINENT_DAYS: 3,      // "Imminent" status this many days before
};

// Default escalations (seeded in database)
export const DEFAULT_ESCALATIONS: Omit<AutomaticEscalation, 'id'>[] = [
  {
    dayTrigger: 7,
    escalationType: 'denial_baseline_increase',
    description: 'Minimum denial baseline increases to 3 days',
    canDelay: false,
    warningDaysBefore: 3,
    active: true,
  },
  {
    dayTrigger: 14,
    escalationType: 'language_default',
    description: '"Her" language becomes default in all UI',
    canDelay: false,
    warningDaysBefore: 3,
    active: true,
  },
  {
    dayTrigger: 21,
    escalationType: 'content_tier_expiry',
    description: 'First locked content tier expires (use it or lose it)',
    canDelay: false,
    warningDaysBefore: 7,
    active: true,
  },
  {
    dayTrigger: 30,
    escalationType: 'name_enforcement',
    description: 'System begins addressing you only as Maxy',
    canDelay: false,
    warningDaysBefore: 5,
    active: true,
  },
  {
    dayTrigger: 45,
    escalationType: 'masculine_tasks_removed',
    description: 'Masculine task options removed from bank',
    canDelay: false,
    warningDaysBefore: 7,
    active: true,
  },
  {
    dayTrigger: 60,
    escalationType: 'intensity_increase',
    description: 'Minimum intensity level increases to 2',
    canDelay: false,
    warningDaysBefore: 7,
    active: true,
  },
  {
    dayTrigger: 90,
    escalationType: 'phase2_mandatory',
    description: 'Phase 2 tasks become mandatory, not optional',
    canDelay: false,
    warningDaysBefore: 14,
    active: true,
  },
  {
    dayTrigger: 120,
    escalationType: 'disclosure_scheduled',
    description: 'Social disclosure task auto-schedules',
    canDelay: true,
    delayCost: {
      edgeDebt: 30,
      investmentDecayPercent: 5,
      streakPenalty: true,
    },
    warningDaysBefore: 14,
    active: true,
  },
  {
    dayTrigger: 180,
    escalationType: 'point_of_no_return',
    description: 'Point of no return ceremony triggered',
    canDelay: false,
    warningDaysBefore: 30,
    active: true,
  },
];
