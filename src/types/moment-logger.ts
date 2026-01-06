// Moment Logger Types
// Quick euphoria/dysphoria logging with context capture

export type MomentType = 'euphoria' | 'dysphoria' | 'arousal';
export type MomentIntensity = 1 | 2 | 3 | 4;
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type SupportType = 'breathing' | 'affirmation' | 'grounding' | 'skipped';

// App-side interface
export interface MomentLog {
  id: string;
  userId: string;
  type: MomentType;
  intensity: MomentIntensity;
  loggedAt: string;
  triggers: string[];
  customTriggerText?: string;
  note?: string;
  timeOfDay: TimeOfDay;
  dayOfWeek: string;
  denialDay?: number;
  arousalState?: string;
  recentTaskCompleted?: string;
  supportOffered: boolean;
  supportTaken?: SupportType;
  createdAt: string;
}

// Database row interface
export interface DbMomentLog {
  id: string;
  user_id: string;
  type: string;
  intensity: number;
  logged_at: string;
  triggers: string[];
  custom_trigger_text: string | null;
  note: string | null;
  time_of_day: string;
  day_of_week: string;
  denial_day: number | null;
  arousal_state: string | null;
  recent_task_completed: string | null;
  support_offered: boolean;
  support_taken: string | null;
  created_at: string;
}

// Input for creating a new moment log
export interface MomentLogInput {
  type: MomentType;
  intensity: MomentIntensity;
  triggers?: string[];
  customTriggerText?: string;
  note?: string;
}

// Context captured automatically
export interface MomentLogContext {
  denialDay?: number;
  arousalState?: string;
  recentTaskCompleted?: string;
}

// Trigger definition
export interface MomentTrigger {
  id: string;
  label: string;
  emoji: string;
}

// Intensity configuration
export const INTENSITY_CONFIG: Record<MomentIntensity, { label: string; emoji: string }> = {
  1: { label: 'Faint', emoji: '🌱' },
  2: { label: 'Nice', emoji: '✨' },
  3: { label: 'Strong', emoji: '💫' },
  4: { label: 'Overwhelming', emoji: '🌟' },
};

// Euphoria triggers
export const EUPHORIA_TRIGGERS: MomentTrigger[] = [
  { id: 'feminine', label: 'Felt feminine', emoji: '💃' },
  { id: 'partner', label: 'Partner moment', emoji: '💕' },
  { id: 'outfit', label: 'Wore something', emoji: '👗' },
  { id: 'task', label: 'Task completed', emoji: '✅' },
  { id: 'mirror', label: 'Mirror moment', emoji: '🪞' },
  { id: 'validation', label: 'Got validation', emoji: '🌟' },
  { id: 'edge', label: 'During edge', emoji: '🔥' },
  { id: 'random', label: 'Random wave', emoji: '🌊' },
];

// Dysphoria triggers
export const DYSPHORIA_TRIGGERS: MomentTrigger[] = [
  { id: 'body', label: 'Body discomfort', emoji: '😔' },
  { id: 'social', label: 'Social situation', emoji: '👥' },
  { id: 'photo', label: 'Saw old photo', emoji: '📸' },
  { id: 'clothes', label: 'Clothing issue', emoji: '👔' },
  { id: 'misgendered', label: 'Misgendered', emoji: '💭' },
  { id: 'comparison', label: 'Comparison', emoji: '📊' },
  { id: 'post-release', label: 'Post-release', emoji: '😞' },
  { id: 'random', label: 'Random wave', emoji: '🌊' },
];

// Arousal triggers
export const AROUSAL_TRIGGERS: MomentTrigger[] = [
  { id: 'denial', label: 'Denial buildup', emoji: '🔥' },
  { id: 'edging', label: 'Edging', emoji: '💦' },
  { id: 'feminization', label: 'Feminization', emoji: '💄' },
  { id: 'partner', label: 'Partner tease', emoji: '💕' },
  { id: 'content', label: 'Saw content', emoji: '📱' },
  { id: 'clothing', label: 'Wearing something', emoji: '👙' },
  { id: 'thoughts', label: 'Intrusive thoughts', emoji: '💭' },
  { id: 'random', label: 'Random wave', emoji: '🌊' },
];

// Modal step type
export type MomentLoggerStep =
  | 'type'
  | 'details'
  | 'post-euphoria'
  | 'post-dysphoria'
  | 'post-arousal';
