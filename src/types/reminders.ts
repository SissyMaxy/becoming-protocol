/**
 * Feminization Reminders Type System
 *
 * All-day presence reminders that keep feminization
 * in consciousness throughout the day.
 */

export type ReminderType = 'posture' | 'voice' | 'movement' | 'identity';

export interface Reminder {
  id: string;
  type: ReminderType;
  prompt: string;
  instruction?: string;
  duration?: number; // seconds to hold/practice
  responseType: 'acknowledge' | 'rate' | 'speak';
}

export interface ReminderResponse {
  id: string;
visitorId: string;
  reminderId: string;
  reminderType: ReminderType;
  prompt: string;
  respondedAt: string;
  rating?: number; // 1-5 self-rating
  skipped: boolean;
  note?: string;
}

export interface ReminderSettings {
  enabled: boolean;
  activeHoursStart: number; // 0-23
  activeHoursEnd: number;   // 0-23
  frequencyPerDay: number;  // 3-10
  enabledTypes: ReminderType[];
  useNotifications: boolean;
  userName?: string; // For personalized prompts
}

export interface ReminderStats {
  totalReminders: number;
  respondedCount: number;
  skippedCount: number;
  averageRating: number;
  streakDays: number;
  todayCount: number;
  byType: Record<ReminderType, { count: number; avgRating: number }>;
}

// ============================================
// REMINDER CONTENT LIBRARY
// ============================================

export const POSTURE_REMINDERS: Reminder[] = [
  {
    id: 'posture-1',
    type: 'posture',
    prompt: 'How are you sitting right now?',
    instruction: 'Uncross your arms. Shoulders back. Chin slightly up. Legs together or crossed at the ankle.',
    responseType: 'rate',
  },
  {
    id: 'posture-2',
    type: 'posture',
    prompt: 'Check your posture',
    instruction: 'Imagine a string pulling you up from the crown of your head. Elongate your spine. Soften your shoulders.',
    responseType: 'acknowledge',
  },
  {
    id: 'posture-3',
    type: 'posture',
    prompt: 'Are you standing like her?',
    instruction: 'Weight slightly on one hip. One foot slightly forward. Hands relaxed at your sides or lightly clasped.',
    responseType: 'rate',
  },
  {
    id: 'posture-4',
    type: 'posture',
    prompt: 'Feminine presence check',
    instruction: 'Take up less space. Bring your elbows closer to your body. Keep movements contained and graceful.',
    responseType: 'acknowledge',
  },
  {
    id: 'posture-5',
    type: 'posture',
    prompt: 'How are your hands?',
    instruction: 'Relax your fingers. Let your wrists be loose. Feminine hands are soft and expressive.',
    responseType: 'rate',
  },
  {
    id: 'posture-6',
    type: 'posture',
    prompt: 'Head position check',
    instruction: 'Tilt your head slightly. This is a feminine gesture that shows engagement and softness.',
    responseType: 'acknowledge',
  },
];

export const VOICE_REMINDERS: Reminder[] = [
  {
    id: 'voice-1',
    type: 'voice',
    prompt: 'Say "Hi, how are you?" in your feminine voice',
    instruction: 'Raise your pitch slightly. Speak from your head, not your chest. Add a smile to your voice.',
    duration: 10,
    responseType: 'rate',
  },
  {
    id: 'voice-2',
    type: 'voice',
    prompt: 'Practice your feminine laugh',
    instruction: 'Light, breathy, from higher in your register. Not a deep chuckle.',
    duration: 5,
    responseType: 'rate',
  },
  {
    id: 'voice-3',
    type: 'voice',
    prompt: 'Say your name out loud, femininely',
    instruction: 'Introduce yourself as her. "Hi, I\'m [Name]." Make it sound natural and confident.',
    duration: 10,
    responseType: 'rate',
  },
  {
    id: 'voice-4',
    type: 'voice',
    prompt: 'Hum for 10 seconds in head voice',
    instruction: 'Feel the vibration in your face and head, not your chest. This is your feminine resonance.',
    duration: 10,
    responseType: 'acknowledge',
  },
  {
    id: 'voice-5',
    type: 'voice',
    prompt: 'Say "Thank you so much!" with feminine inflection',
    instruction: 'Add a rise at the end. Make it warm and expressive. Feminine speech has more melody.',
    duration: 5,
    responseType: 'rate',
  },
  {
    id: 'voice-6',
    type: 'voice',
    prompt: 'Practice a feminine sigh',
    instruction: 'Soft, breathy, high. Express contentment or gentle exasperation.',
    duration: 5,
    responseType: 'acknowledge',
  },
];

export const MOVEMENT_REMINDERS: Reminder[] = [
  {
    id: 'movement-1',
    type: 'movement',
    prompt: 'Walk to get water - femininely',
    instruction: 'Smaller steps. Feet closer to a line. Hips lead slightly. Arms swing softly.',
    responseType: 'rate',
  },
  {
    id: 'movement-2',
    type: 'movement',
    prompt: 'Cross your legs the feminine way',
    instruction: 'Cross at the knee, not the ankle. Keep knees together. This is how she sits.',
    responseType: 'acknowledge',
  },
  {
    id: 'movement-3',
    type: 'movement',
    prompt: 'Pick something up - gracefully',
    instruction: 'Bend at the knees, not the waist. Keep your back straight. Move with intention.',
    responseType: 'rate',
  },
  {
    id: 'movement-4',
    type: 'movement',
    prompt: 'Gesture while you speak',
    instruction: 'Use your hands expressively but softly. Wrists loose. Fingers together. Feminine gestures are fluid.',
    responseType: 'acknowledge',
  },
  {
    id: 'movement-5',
    type: 'movement',
    prompt: 'Touch your hair',
    instruction: 'Tuck it behind your ear. Run your fingers through it. This is a feminine self-soothing gesture.',
    responseType: 'acknowledge',
  },
  {
    id: 'movement-6',
    type: 'movement',
    prompt: 'Sit down and stand up - gracefully',
    instruction: 'Lower yourself slowly, knees together. Stand by pushing up, not lurching forward.',
    responseType: 'rate',
  },
];

export const IDENTITY_REMINDERS: Reminder[] = [
  {
    id: 'identity-1',
    type: 'identity',
    prompt: 'You are her.',
    instruction: 'Not becoming. Not trying. You ARE her. Right now. In this moment.',
    responseType: 'acknowledge',
  },
  {
    id: 'identity-2',
    type: 'identity',
    prompt: 'Good girls practice even when no one is watching.',
    instruction: 'Your femininity is not a performance. It\'s who you are. Practice for yourself.',
    responseType: 'acknowledge',
  },
  {
    id: 'identity-3',
    type: 'identity',
    prompt: 'What would she do right now?',
    instruction: 'Think about the most feminine version of yourself. What would she be doing in this moment?',
    responseType: 'acknowledge',
  },
  {
    id: 'identity-4',
    type: 'identity',
    prompt: 'You deserve to be feminine.',
    instruction: 'This is not indulgent. This is not wrong. This is who you are meant to be.',
    responseType: 'acknowledge',
  },
  {
    id: 'identity-5',
    type: 'identity',
    prompt: 'Feel your body as hers.',
    instruction: 'Your body is feminine. Feel it. Own it. Move through the world in it.',
    responseType: 'acknowledge',
  },
  {
    id: 'identity-6',
    type: 'identity',
    prompt: 'Say your name in your head.',
    instruction: 'Your real name. The feminine one. That\'s you. That\'s who you are.',
    responseType: 'acknowledge',
  },
  {
    id: 'identity-7',
    type: 'identity',
    prompt: 'Goddess is proud of you.',
    instruction: 'Every moment you spend becoming her is an act of devotion. She sees you.',
    responseType: 'acknowledge',
  },
  {
    id: 'identity-8',
    type: 'identity',
    prompt: 'You are not going back.',
    instruction: 'Every day forward. Every moment deeper. There is no old you to return to.',
    responseType: 'acknowledge',
  },
];

// Get all reminders by type
export function getRemindersByType(type: ReminderType): Reminder[] {
  switch (type) {
    case 'posture': return POSTURE_REMINDERS;
    case 'voice': return VOICE_REMINDERS;
    case 'movement': return MOVEMENT_REMINDERS;
    case 'identity': return IDENTITY_REMINDERS;
  }
}

// Get a random reminder from enabled types
export function getRandomReminder(enabledTypes: ReminderType[]): Reminder | null {
  if (enabledTypes.length === 0) return null;

  const type = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
  const reminders = getRemindersByType(type);
  return reminders[Math.floor(Math.random() * reminders.length)];
}

// Get type label
export function getReminderTypeLabel(type: ReminderType): string {
  const labels: Record<ReminderType, string> = {
    posture: 'Posture',
    voice: 'Voice',
    movement: 'Movement',
    identity: 'Identity',
  };
  return labels[type];
}

// Get type color
export function getReminderTypeColor(type: ReminderType): string {
  const colors: Record<ReminderType, string> = {
    posture: '#22c55e',    // green
    voice: '#f472b6',      // pink
    movement: '#a855f7',   // purple
    identity: '#3b82f6',   // blue
  };
  return colors[type];
}

// Default settings - disabled by default (too intrusive per user feedback)
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  activeHoursStart: 8,  // 8am
  activeHoursEnd: 22,   // 10pm
  frequencyPerDay: 3,   // reduced from 5
  enabledTypes: ['posture', 'voice'],  // fewer types
  useNotifications: false,
};

// Database types
export interface DbReminderResponse {
  id: string;
  user_id: string;
  reminder_id: string;
  reminder_type: string;
  prompt: string;
  responded_at: string;
  rating: number | null;
  skipped: boolean;
  note: string | null;
}

export interface DbReminderSettings {
  id: string;
  user_id: string;
  enabled: boolean;
  active_hours_start: number;
  active_hours_end: number;
  frequency_per_day: number;
  enabled_types: string[];
  use_notifications: boolean;
  created_at: string;
  updated_at: string;
}

// Converters
export function dbResponseToResponse(db: DbReminderResponse): ReminderResponse {
  return {
    id: db.id,
    visitorId: db.user_id,
    reminderId: db.reminder_id,
    reminderType: db.reminder_type as ReminderType,
    prompt: db.prompt,
    respondedAt: db.responded_at,
    rating: db.rating ?? undefined,
    skipped: db.skipped,
    note: db.note ?? undefined,
  };
}

export function dbSettingsToSettings(db: DbReminderSettings): ReminderSettings {
  return {
    enabled: db.enabled,
    activeHoursStart: db.active_hours_start,
    activeHoursEnd: db.active_hours_end,
    frequencyPerDay: db.frequency_per_day,
    enabledTypes: db.enabled_types as ReminderType[],
    useNotifications: db.use_notifications,
  };
}
