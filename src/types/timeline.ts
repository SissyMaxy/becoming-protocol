/**
 * Voice & Photo Timeline Types
 *
 * Track transformation over time with voice recordings and photos.
 * See yourself changing - proof you can't unsee.
 */

export type TimelineEntryType = 'voice' | 'photo';

export interface VoiceEntry {
  id: string;
  userId: string;
  type: 'voice';
  recordedAt: string;

  // Audio data
  audioUrl: string;          // Supabase storage URL
  audioDuration: number;     // seconds

  // Analysis (optional, can be added later)
  pitchAvg?: number;         // Hz
  pitchMin?: number;
  pitchMax?: number;

  // Context
  phrase: string;            // What they said
  weekNumber: number;        // Week of journey
  dayNumber: number;         // Day of journey

  // Self-assessment
  rating?: number;           // 1-5 how feminine it sounds
  notes?: string;

  createdAt: string;
}

export interface PhotoEntry {
  id: string;
  userId: string;
  type: 'photo';
  capturedAt: string;

  // Image data
  imageUrl: string;          // Supabase storage URL
  thumbnailUrl?: string;     // Smaller version for timeline

  // Metadata
  category: PhotoCategory;
  weekNumber: number;
  dayNumber: number;

  // Self-assessment
  rating?: number;           // 1-5 how good you feel
  notes?: string;

  createdAt: string;
}

// Built-in photo categories
export type BuiltInPhotoCategory =
  | 'face'           // Face/makeup progress
  | 'full_body'      // Full body/posture
  | 'outfit'         // Style/fashion
  | 'hair'           // Hair growth/styling
  | 'other';

// Additional suggestive/intimate categories (for personal tracking)
export type IntimatePhotoCategory =
  | 'lingerie'       // Lingerie/underwear
  | 'pose'           // Suggestive poses
  | 'sissy'          // Sissy presentation
  | 'chastity'       // Chastity device
  | 'plugged'        // Plugged/training
  | 'exposed'        // Exposed/vulnerable
  | 'custom';        // User-defined category

// All photo categories
export type PhotoCategory = BuiltInPhotoCategory | IntimatePhotoCategory;

// Custom category definition
export interface CustomPhotoCategory {
  id: string;
  name: string;
  icon: string;
  guidance: string;
  isIntimate: boolean;
  createdAt: string;
}

export type TimelineEntry = VoiceEntry | PhotoEntry;

export interface TimelineComparison {
  type: TimelineEntryType;
  earlier: TimelineEntry;
  later: TimelineEntry;
  daysBetween: number;
  weeksBetween: number;
}

export interface TimelineStats {
  totalVoiceEntries: number;
  totalPhotoEntries: number;
  firstEntryDate: string | null;
  latestEntryDate: string | null;
  currentWeek: number;
  currentDay: number;
  streakWeeks: number;        // Consecutive weeks with entries

  // Voice progress
  voicePitchTrend?: 'rising' | 'stable' | 'falling';
  avgVoiceRating?: number;

  // Photo categories
  photosByCategory: Record<PhotoCategory, number>;
}

export interface TimelineSettings {
  reminderDay: number;        // 0-6 (Sunday-Saturday)
  reminderEnabled: boolean;
  defaultPhrase: string;      // Default voice recording phrase
  photoCategories: PhotoCategory[];  // Which categories to prompt
}

// Standard phrases for consistent comparison
export const VOICE_PHRASES = [
  "Hi, my name is {name}. How are you today?",
  "Hello! Nice to meet you.",
  "Thank you so much, I really appreciate it.",
  "Excuse me, could you help me with something?",
  "I'm so happy to see you!",
];

export const DEFAULT_PHRASE = "Hi, my name is {name}. How are you today?";

// Photo guidance
export const PHOTO_GUIDANCE: Record<PhotoCategory, string> = {
  // Standard categories
  face: "Front-facing, natural lighting, neutral expression. Same angle each time.",
  full_body: "Full body, standing straight, same distance from camera.",
  outfit: "Show your outfit clearly. Can be mirror selfie.",
  hair: "Focus on hair. Same lighting and angle helps comparison.",
  other: "Any progress photo you want to track.",
  // Intimate categories
  lingerie: "Show your lingerie/underwear. Same pose helps track confidence growth.",
  pose: "Strike a suggestive pose. Track how your presentation evolves.",
  sissy: "Full sissy presentation. Document your feminization journey.",
  chastity: "Document your chastity device. Track your commitment.",
  plugged: "Training progress. Same position for comparison.",
  exposed: "Vulnerable/exposed position. Document your submission.",
  custom: "Your custom category. Be consistent for best comparison.",
};

// ============================================
// DATABASE TYPES
// ============================================

export interface DbVoiceEntry {
  id: string;
  user_id: string;
  recorded_at: string;
  audio_url: string;
  audio_duration: number;
  pitch_avg: number | null;
  pitch_min: number | null;
  pitch_max: number | null;
  phrase: string;
  week_number: number;
  day_number: number;
  rating: number | null;
  notes: string | null;
  created_at: string;
}

export interface DbPhotoEntry {
  id: string;
  user_id: string;
  captured_at: string;
  image_url: string;
  thumbnail_url: string | null;
  category: string;
  week_number: number;
  day_number: number;
  rating: number | null;
  notes: string | null;
  created_at: string;
}

export interface DbTimelineSettings {
  id: string;
  user_id: string;
  reminder_day: number;
  reminder_enabled: boolean;
  default_phrase: string;
  photo_categories: string[];
  created_at: string;
  updated_at: string;
}

// ============================================
// CONVERTERS
// ============================================

export function dbVoiceToVoice(db: DbVoiceEntry): VoiceEntry {
  return {
    id: db.id,
    userId: db.user_id,
    type: 'voice',
    recordedAt: db.recorded_at,
    audioUrl: db.audio_url,
    audioDuration: db.audio_duration,
    pitchAvg: db.pitch_avg ?? undefined,
    pitchMin: db.pitch_min ?? undefined,
    pitchMax: db.pitch_max ?? undefined,
    phrase: db.phrase,
    weekNumber: db.week_number,
    dayNumber: db.day_number,
    rating: db.rating ?? undefined,
    notes: db.notes ?? undefined,
    createdAt: db.created_at,
  };
}

export function dbPhotoToPhoto(db: DbPhotoEntry): PhotoEntry {
  return {
    id: db.id,
    userId: db.user_id,
    type: 'photo',
    capturedAt: db.captured_at,
    imageUrl: db.image_url,
    thumbnailUrl: db.thumbnail_url ?? undefined,
    category: db.category as PhotoCategory,
    weekNumber: db.week_number,
    dayNumber: db.day_number,
    rating: db.rating ?? undefined,
    notes: db.notes ?? undefined,
    createdAt: db.created_at,
  };
}

export function dbSettingsToSettings(db: DbTimelineSettings): TimelineSettings {
  return {
    reminderDay: db.reminder_day,
    reminderEnabled: db.reminder_enabled,
    defaultPhrase: db.default_phrase,
    photoCategories: db.photo_categories as PhotoCategory[],
  };
}

// ============================================
// HELPERS
// ============================================

export function getCategoryLabel(category: PhotoCategory, customCategories?: CustomPhotoCategory[]): string {
  const labels: Record<PhotoCategory, string> = {
    // Standard
    face: 'Face',
    full_body: 'Full Body',
    outfit: 'Outfit',
    hair: 'Hair',
    other: 'Other',
    // Intimate
    lingerie: 'Lingerie',
    pose: 'Pose',
    sissy: 'Sissy',
    chastity: 'Chastity',
    plugged: 'Plugged',
    exposed: 'Exposed',
    custom: 'Custom',
  };

  // Check for custom category name
  if (category === 'custom' && customCategories?.length) {
    return customCategories[0].name;
  }

  return labels[category] || category;
}

export function getCategoryIcon(category: PhotoCategory, customCategories?: CustomPhotoCategory[]): string {
  const icons: Record<PhotoCategory, string> = {
    // Standard
    face: '👤',
    full_body: '🧍‍♀️',
    outfit: '👗',
    hair: '💇‍♀️',
    other: '📷',
    // Intimate
    lingerie: '👙',
    pose: '💋',
    sissy: '🎀',
    chastity: '🔒',
    plugged: '🍑',
    exposed: '😳',
    custom: '✨',
  };

  // Check for custom category icon
  if (category === 'custom' && customCategories?.length) {
    return customCategories[0].icon;
  }

  return icons[category] || '📷';
}

// Check if a category is intimate/NSFW
export function isIntimateCategory(category: PhotoCategory): boolean {
  const intimateCategories: PhotoCategory[] = ['lingerie', 'pose', 'sissy', 'chastity', 'plugged', 'exposed', 'custom'];
  return intimateCategories.includes(category);
}

// Get all available categories grouped
export function getAllCategories(): { standard: BuiltInPhotoCategory[]; intimate: IntimatePhotoCategory[] } {
  return {
    standard: ['face', 'full_body', 'outfit', 'hair', 'other'],
    intimate: ['lingerie', 'pose', 'sissy', 'chastity', 'plugged', 'exposed'],
  };
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getWeekNumber(startDate: Date, currentDate: Date = new Date()): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = currentDate.getTime() - startDate.getTime();
  return Math.floor(diff / msPerWeek) + 1;
}

export function getDayNumber(startDate: Date, currentDate: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = currentDate.getTime() - startDate.getTime();
  return Math.floor(diff / msPerDay) + 1;
}
