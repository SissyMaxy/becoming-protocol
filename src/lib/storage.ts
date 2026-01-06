import { DailyEntry, UserProgress, Domain, DomainProgress, PhaseProgress } from '../types';
import { DOMAINS, PHASES } from '../data/constants';
import { supabase } from './supabase';
import { getTodayDate, getYesterdayDate } from './protocol';
import type { UserProfile, SealedLetter } from '../components/Onboarding/types';

// Storage keys (for localStorage fallback)
const KEYS = {
  ENTRIES: 'becoming-protocol-entries',
  PROGRESS: 'becoming-protocol-progress',
  CURRENT_DATE: 'becoming-protocol-current-date'
} as const;

// Get the current authenticated user's ID
async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No authenticated user');
  }
  return user.id;
}

// Default progress state
const createDefaultProgress = (): UserProgress => ({
  overallStreak: 0,
  longestStreak: 0,
  totalDays: 0,
  domainProgress: DOMAINS.map(d => ({
    domain: d.domain,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    totalDays: 0
  })),
  phase: {
    currentPhase: 1,
    phaseName: PHASES[0].name,
    daysInPhase: 0,
    phaseStartDate: getTodayDate()
  }
});

// Storage interface for future database swap
export interface StorageAdapter {
  // Entries
  getEntry(date: string): Promise<DailyEntry | null>;
  saveEntry(entry: DailyEntry): Promise<void>;
  getAllEntries(): Promise<DailyEntry[]>;
  getEntriesInRange(startDate: string, endDate: string): Promise<DailyEntry[]>;

  // Progress
  getProgress(): Promise<UserProgress>;
  saveProgress(progress: UserProgress): Promise<void>;

  // Utility
  deleteEntry(date: string): Promise<void>;
  clearAll(): Promise<void>;
}

// LocalStorage implementation (exported as fallback option)
export class LocalStorageAdapter implements StorageAdapter {
  private getEntries(): DailyEntry[] {
    const data = localStorage.getItem(KEYS.ENTRIES);
    return data ? JSON.parse(data) : [];
  }

  private setEntries(entries: DailyEntry[]): void {
    localStorage.setItem(KEYS.ENTRIES, JSON.stringify(entries));
  }

  async getEntry(date: string): Promise<DailyEntry | null> {
    const entries = this.getEntries();
    return entries.find(e => e.date === date) || null;
  }

  async saveEntry(entry: DailyEntry): Promise<void> {
    const entries = this.getEntries();
    const existingIndex = entries.findIndex(e => e.date === entry.date);

    if (existingIndex >= 0) {
      entries[existingIndex] = { ...entry, updatedAt: new Date().toISOString() };
    } else {
      entries.push(entry);
    }

    // Sort by date descending
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    this.setEntries(entries);
  }

  async getAllEntries(): Promise<DailyEntry[]> {
    return this.getEntries();
  }

  async getEntriesInRange(startDate: string, endDate: string): Promise<DailyEntry[]> {
    const entries = this.getEntries();
    return entries.filter(e => e.date >= startDate && e.date <= endDate);
  }

  async getProgress(): Promise<UserProgress> {
    const data = localStorage.getItem(KEYS.PROGRESS);
    return data ? JSON.parse(data) : createDefaultProgress();
  }

  async saveProgress(progress: UserProgress): Promise<void> {
    localStorage.setItem(KEYS.PROGRESS, JSON.stringify(progress));
  }

  async deleteEntry(date: string): Promise<void> {
    const entries = this.getEntries().filter(e => e.date !== date);
    this.setEntries(entries);
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(KEYS.ENTRIES);
    localStorage.removeItem(KEYS.PROGRESS);
    localStorage.removeItem(KEYS.CURRENT_DATE);
  }
}

// Supabase implementation
class SupabaseStorageAdapter implements StorageAdapter {
  async getEntry(date: string): Promise<DailyEntry | null> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (error || !data) return null;

    return this.mapDbEntryToApp(data);
  }

  async saveEntry(entry: DailyEntry): Promise<void> {
    const userId = await getAuthUserId();
    const dbEntry = {
      id: entry.id,
      user_id: userId,
      date: entry.date,
      intensity: entry.intensity,
      tasks: entry.tasks,
      journal: entry.journal || null,
      created_at: entry.createdAt,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('daily_entries')
      .upsert(dbEntry, { onConflict: 'user_id,date' });

    if (error) {
      console.error('Error saving entry:', error);
      throw error;
    }
  }

  async getAllEntries(): Promise<DailyEntry[]> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching entries:', error);
      return [];
    }

    return (data || []).map(this.mapDbEntryToApp);
  }

  async getEntriesInRange(startDate: string, endDate: string): Promise<DailyEntry[]> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching entries in range:', error);
      return [];
    }

    return (data || []).map(this.mapDbEntryToApp);
  }

  async getProgress(): Promise<UserProgress> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return createDefaultProgress();
    }

    return {
      overallStreak: data.overall_streak,
      longestStreak: data.longest_streak,
      totalDays: data.total_days,
      domainProgress: data.domain_progress as DomainProgress[],
      phase: data.phase as PhaseProgress,
      lastActiveDate: data.last_active_date
    };
  }

  async saveProgress(progress: UserProgress): Promise<void> {
    const userId = await getAuthUserId();
    const dbProgress = {
      user_id: userId,
      overall_streak: progress.overallStreak,
      longest_streak: progress.longestStreak,
      total_days: progress.totalDays,
      domain_progress: progress.domainProgress,
      phase: progress.phase,
      last_active_date: progress.lastActiveDate || null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('user_progress')
      .upsert(dbProgress, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving progress:', error);
      throw error;
    }
  }

  async deleteEntry(date: string): Promise<void> {
    const userId = await getAuthUserId();
    const { error } = await supabase
      .from('daily_entries')
      .delete()
      .eq('user_id', userId)
      .eq('date', date);

    if (error) {
      console.error('Error deleting entry:', error);
      throw error;
    }
  }

  async clearAll(): Promise<void> {
    const userId = await getAuthUserId();
    await supabase
      .from('daily_entries')
      .delete()
      .eq('user_id', userId);

    await supabase
      .from('user_progress')
      .delete()
      .eq('user_id', userId);
  }

  private mapDbEntryToApp(data: Record<string, unknown>): DailyEntry {
    return {
      id: data.id as string,
      date: data.date as string,
      intensity: data.intensity as DailyEntry['intensity'],
      tasks: data.tasks as DailyEntry['tasks'],
      journal: data.journal as DailyEntry['journal'],
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string
    };
  }
}

// Export singleton instance - using Supabase
export const storage: StorageAdapter = new SupabaseStorageAdapter();

// User Profile Storage
export const profileStorage = {
  async getProfile(): Promise<UserProfile | null> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      preferredName: data.preferred_name,
      pronouns: data.pronouns,
      ageRange: data.age_range,
      journeyStage: data.journey_stage,
      monthsOnJourney: data.months_on_journey || 0,
      livingSituation: data.living_situation,
      outLevel: data.out_level,
      hasPartner: data.has_partner || false,
      partnerName: data.partner_name,
      partnerSupportive: data.partner_supportive,
      partnerNotes: data.partner_notes,
      goddessName: data.goddess_name,
      servingSince: data.serving_since,
      eggCrackedDate: data.egg_cracked_date,
      protocolStartDate: data.protocol_start_date,
      dysphoriaTriggers: data.dysphoria_triggers || [],
      dysphoriaWorstTimes: data.dysphoria_worst_times,
      dysphoriaCoping: data.dysphoria_coping,
      euphoriaTriggers: data.euphoria_triggers || [],
      euphoriaBestMoments: data.euphoria_best_moments,
      euphoriaSeeks: data.euphoria_seeks,
      fears: data.fears || [],
      biggestFear: data.biggest_fear,
      resistancePatterns: data.resistance_patterns,
      shortTermGoals: data.short_term_goals,
      longTermVision: data.long_term_vision,
      nonNegotiables: data.non_negotiables,
      preferredIntensity: data.preferred_intensity || 'normal',
      voiceFocusLevel: data.voice_focus_level,
      socialComfort: data.social_comfort,
      morningAvailable: data.morning_available ?? true,
      eveningAvailable: data.evening_available ?? true,
      workFromHome: data.work_from_home ?? false,
      busyDays: data.busy_days || []
    };
  },

  async saveProfile(profile: Partial<UserProfile>): Promise<void> {
    const userId = await getAuthUserId();

    // Find the biggest fear based on intensity
    const biggestFear = profile.fears?.reduce((max, f) =>
      f.intensity > (max?.intensity || 0) ? f : max,
      profile.fears?.[0]
    );

    const dbProfile = {
      user_id: userId,
      preferred_name: profile.preferredName,
      pronouns: profile.pronouns,
      age_range: profile.ageRange,
      journey_stage: profile.journeyStage,
      months_on_journey: profile.monthsOnJourney,
      living_situation: profile.livingSituation,
      out_level: profile.outLevel,
      has_partner: profile.hasPartner,
      partner_name: profile.partnerName,
      partner_supportive: profile.partnerSupportive,
      partner_notes: profile.partnerNotes,
      goddess_name: profile.goddessName,
      serving_since: profile.servingSince,
      egg_cracked_date: profile.eggCrackedDate,
      protocol_start_date: profile.protocolStartDate,
      dysphoria_triggers: profile.dysphoriaTriggers,
      dysphoria_worst_times: profile.dysphoriaWorstTimes,
      dysphoria_coping: profile.dysphoriaCoping,
      euphoria_triggers: profile.euphoriaTriggers,
      euphoria_best_moments: profile.euphoriaBestMoments,
      euphoria_seeks: profile.euphoriaSeeks,
      fears: profile.fears,
      biggest_fear: biggestFear?.fear,
      resistance_patterns: profile.resistancePatterns,
      short_term_goals: profile.shortTermGoals,
      long_term_vision: profile.longTermVision,
      non_negotiables: profile.nonNegotiables,
      preferred_intensity: profile.preferredIntensity,
      voice_focus_level: profile.voiceFocusLevel,
      social_comfort: profile.socialComfort,
      morning_available: profile.morningAvailable,
      evening_available: profile.eveningAvailable,
      work_from_home: profile.workFromHome,
      busy_days: profile.busyDays,
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('user_profiles')
      .upsert(dbProfile, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving profile:', error);
      throw error;
    }
  },

  async isOnboardingComplete(): Promise<boolean> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('onboarding_completed')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return false;
    return data.onboarding_completed === true;
  }
};

// Sealed Letters Storage
export const letterStorage = {
  async saveLetters(letters: SealedLetter[]): Promise<void> {
    const userId = await getAuthUserId();

    const dbLetters = letters.map(letter => ({
      id: letter.id,
      user_id: userId,
      title: letter.title,
      letter_type: letter.letterType,
      content: letter.content,
      unlock_type: letter.unlockType,
      unlock_value: letter.unlockValue,
      unlock_hint: letter.unlockHint,
      is_unlocked: false,
      is_read: false,
      created_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('personalized_letters')
      .insert(dbLetters);

    if (error) {
      console.error('Error saving letters:', error);
      throw error;
    }
  },

  async getUnlockedLetters(): Promise<SealedLetter[]> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('personalized_letters')
      .select('*')
      .eq('user_id', userId)
      .eq('is_unlocked', true)
      .order('unlocked_at', { ascending: false });

    if (error || !data) return [];

    return data.map(letter => ({
      id: letter.id,
      title: letter.title,
      letterType: letter.letter_type,
      content: letter.content,
      unlockType: letter.unlock_type,
      unlockValue: letter.unlock_value,
      unlockHint: letter.unlock_hint
    }));
  },

  async getLockedLetterHints(): Promise<{ id: string; hint: string }[]> {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('personalized_letters')
      .select('id, unlock_hint')
      .eq('user_id', userId)
      .eq('is_unlocked', false);

    if (error || !data) return [];

    return data.map(letter => ({
      id: letter.id,
      hint: letter.unlock_hint || 'A mystery awaits...'
    }));
  },

  async markAsRead(letterId: string): Promise<void> {
    const userId = await getAuthUserId();
    const { error } = await supabase
      .from('personalized_letters')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', letterId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error marking letter as read:', error);
    }
  },

  async unlockLetter(letterId: string): Promise<void> {
    const userId = await getAuthUserId();
    const { error } = await supabase
      .from('personalized_letters')
      .update({
        is_unlocked: true,
        unlocked_at: new Date().toISOString()
      })
      .eq('id', letterId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error unlocking letter:', error);
    }
  }
};

// Helper functions for progress calculations
export function calculateStreak(entries: DailyEntry[]): number {
  if (entries.length === 0) return 0;

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const today = getTodayDate();
  const yesterday = getYesterdayDate();

  // Check if the most recent entry is today or yesterday
  const mostRecentDate = sortedEntries[0].date;
  if (mostRecentDate !== today && mostRecentDate !== yesterday) {
    return 0;
  }

  let streak = 0;
  let currentDate = new Date(mostRecentDate);

  for (const entry of sortedEntries) {
    const entryDate = new Date(entry.date);
    const expectedDate = new Date(currentDate);

    if (entryDate.getTime() === expectedDate.getTime()) {
      // Check if any tasks were completed
      const hasCompletedTasks = entry.tasks.some(t => t.completed);
      if (hasCompletedTasks) {
        streak++;
        currentDate = new Date(currentDate.getTime() - 86400000);
      } else {
        break;
      }
    } else if (entryDate.getTime() < expectedDate.getTime()) {
      // Gap in dates, streak broken
      break;
    }
  }

  return streak;
}

export function calculateDomainStreak(entries: DailyEntry[], domain: Domain): number {
  if (entries.length === 0) return 0;

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const today = getTodayDate();
  const yesterday = getYesterdayDate();

  // Filter to entries that have completed tasks in this domain
  const domainEntries = sortedEntries.filter(e =>
    e.tasks.some(t => t.domain === domain && t.completed)
  );

  if (domainEntries.length === 0) return 0;

  const mostRecentDate = domainEntries[0].date;
  if (mostRecentDate !== today && mostRecentDate !== yesterday) {
    return 0;
  }

  let streak = 0;
  let currentDate = new Date(mostRecentDate);

  for (const entry of domainEntries) {
    const entryDate = new Date(entry.date);
    const expectedDate = new Date(currentDate);

    if (entryDate.getTime() === expectedDate.getTime()) {
      streak++;
      currentDate = new Date(currentDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  return streak;
}

export function calculateDomainLevel(totalDays: number): number {
  // Level progression: 1-10 based on total days active
  // Level 1: 0-6 days
  // Level 2: 7-13 days
  // Level 3: 14-20 days
  // Level 4: 21-29 days
  // Level 5: 30-44 days
  // Level 6: 45-59 days
  // Level 7: 60-89 days
  // Level 8: 90-119 days
  // Level 9: 120-179 days
  // Level 10: 180+ days

  const thresholds = [0, 7, 14, 21, 30, 45, 60, 90, 120, 180];
  let level = 1;

  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (totalDays >= thresholds[i]) {
      level = i + 1;
      break;
    }
  }

  return Math.min(level, 10);
}

/**
 * Get count of days with completed tasks from daily_tasks table
 */
export async function getCompletedDaysCount(): Promise<number> {
  try {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('assigned_date')
      .eq('user_id', userId)
      .eq('status', 'completed');

    if (error || !data) return 0;

    // Count unique days with at least one completed task
    const uniqueDays = new Set(data.map(t => t.assigned_date));
    return uniqueDays.size;
  } catch {
    return 0;
  }
}

/**
 * Get dates of completed task days for streak calculation
 */
export async function getCompletedDates(): Promise<string[]> {
  try {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('assigned_date')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('assigned_date', { ascending: false });

    if (error || !data) return [];

    // Get unique dates
    const uniqueDays = [...new Set(data.map(t => t.assigned_date))];
    return uniqueDays;
  } catch {
    return [];
  }
}

export function updateProgressFromEntries(
  entries: DailyEntry[],
  currentProgress: UserProgress
): UserProgress {
  const overallStreak = calculateStreak(entries);
  const totalDays = entries.filter(e => e.tasks.some(t => t.completed)).length;

  const domainProgress: DomainProgress[] = DOMAINS.map(d => {
    const domainEntries = entries.filter(e =>
      e.tasks.some(t => t.domain === d.domain && t.completed)
    );
    const domainTotalDays = domainEntries.length;
    const domainStreak = calculateDomainStreak(entries, d.domain);

    const existing = currentProgress.domainProgress.find(dp => dp.domain === d.domain);

    return {
      domain: d.domain,
      level: calculateDomainLevel(domainTotalDays),
      currentStreak: domainStreak,
      longestStreak: Math.max(domainStreak, existing?.longestStreak || 0),
      totalDays: domainTotalDays,
      lastActiveDate: domainEntries[0]?.date
    };
  });

  // Calculate phase based on total days
  let currentPhase = 1;
  let daysAccumulated = 0;
  let phaseStartDate = currentProgress.phase.phaseStartDate;

  for (const phase of PHASES) {
    if (phase.durationDays === 0) {
      // Final phase (ongoing)
      currentPhase = phase.phase;
      break;
    }

    if (totalDays < daysAccumulated + phase.durationDays) {
      currentPhase = phase.phase;
      break;
    }

    daysAccumulated += phase.durationDays;
    currentPhase = phase.phase + 1;
  }

  const phaseInfo = PHASES.find(p => p.phase === currentPhase) || PHASES[0];
  const daysInPhase = totalDays - daysAccumulated;

  // Update phase start date if phase changed
  if (currentPhase !== currentProgress.phase.currentPhase) {
    phaseStartDate = new Date().toISOString().split('T')[0];
  }

  const phase: PhaseProgress = {
    currentPhase,
    phaseName: phaseInfo.name,
    daysInPhase: Math.max(0, daysInPhase),
    phaseStartDate
  };

  return {
    overallStreak,
    longestStreak: Math.max(overallStreak, currentProgress.longestStreak),
    totalDays,
    domainProgress,
    phase,
    lastActiveDate: entries[0]?.date
  };
}
