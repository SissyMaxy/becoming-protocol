// Compulsory Daily Elements (Feature 38)
// Certain protocol elements are not optional. The app doesn't fully function until these are completed.

import { supabase } from './supabase';

// ===========================================
// TYPES
// ===========================================

export interface CompulsoryElement {
  id: string;
  name: string;
  description: string;
  mustCompleteBy: string;        // Time of day (HH:MM format)
  blocksIfIncomplete: string[];  // Features blocked until done
  estimatedMinutes: number;
  phaseRequirement: 'always' | 'after_week_1' | 'after_week_2' | 'after_month_1';
  timeWindow: 'morning' | 'evening' | 'any';
}

export interface CompulsoryCompletion {
  id: string;
  userId: string;
  elementId: string;
  completedAt: string;
  date: string;
}

// ===========================================
// COMPULSORY ELEMENTS DEFINITION
// ===========================================

export const COMPULSORY_ELEMENTS: CompulsoryElement[] = [
  {
    id: 'morning_checkin',
    name: 'Morning Check-In',
    description: 'Physical state log + mood + intention for the day. 60 seconds.',
    mustCompleteBy: '10:00',
    blocksIfIncomplete: ['all_features'],
    estimatedMinutes: 1,
    phaseRequirement: 'always',
    timeWindow: 'morning',
  },
  {
    id: 'physical_state_log',
    name: 'Physical State',
    description: 'Log what you are wearing/using right now.',
    mustCompleteBy: '10:00',
    blocksIfIncomplete: ['all_features'],
    estimatedMinutes: 0.5,
    phaseRequirement: 'always',
    timeWindow: 'morning',
  },
  {
    id: 'skincare_am',
    name: 'Morning Skincare',
    description: 'Complete morning skincare routine. Full routine, not shortcuts.',
    mustCompleteBy: '11:00',
    blocksIfIncomplete: ['content_library', 'edge_session'],
    estimatedMinutes: 10,
    phaseRequirement: 'always',
    timeWindow: 'morning',
  },
  {
    id: 'voice_minimum',
    name: 'Voice Minimum',
    description: '2 minutes of voice practice. That is the absolute floor.',
    mustCompleteBy: '20:00',
    blocksIfIncomplete: ['edge_session', 'session_tier_above_3'],
    estimatedMinutes: 2,
    phaseRequirement: 'after_week_2',
    timeWindow: 'any',
  },
  {
    id: 'evening_log',
    name: 'Evening Reflection',
    description: 'How was David today? How was Maxy? Log one moment from each.',
    mustCompleteBy: '23:00',
    blocksIfIncomplete: ['release_eligibility'],
    estimatedMinutes: 2,
    phaseRequirement: 'always',
    timeWindow: 'evening',
  },
  {
    id: 'skincare_pm',
    name: 'Evening Skincare',
    description: 'Complete evening skincare routine before bed.',
    mustCompleteBy: '23:59',
    blocksIfIncomplete: ['streak_credit'],
    estimatedMinutes: 10,
    phaseRequirement: 'always',
    timeWindow: 'evening',
  },
];

// ===========================================
// TIME UTILITIES
// ===========================================

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function getCurrentTimeWindow(): 'morning' | 'evening' | 'any' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 17 && hour < 24) return 'evening';
  return 'any';
}

function isBeforeDeadline(deadline: string): boolean {
  const now = new Date();
  const { hours, minutes } = parseTime(deadline);
  const deadlineDate = new Date();
  deadlineDate.setHours(hours, minutes, 0, 0);
  return now < deadlineDate;
}

function isPastDeadline(deadline: string): boolean {
  return !isBeforeDeadline(deadline);
}

// ===========================================
// PHASE REQUIREMENT CHECK
// ===========================================

export function meetsPhaseRequirement(
  element: CompulsoryElement,
  daysOnProtocol: number
): boolean {
  switch (element.phaseRequirement) {
    case 'always':
      return true;
    case 'after_week_1':
      return daysOnProtocol >= 7;
    case 'after_week_2':
      return daysOnProtocol >= 14;
    case 'after_month_1':
      return daysOnProtocol >= 30;
    default:
      return true;
  }
}

// ===========================================
// DATABASE OPERATIONS
// ===========================================

export async function getTodayCompletions(userId: string): Promise<CompulsoryCompletion[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('compulsory_completions')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today);

  if (error) {
    console.error('Error fetching compulsory completions:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    elementId: row.element_id,
    completedAt: row.completed_at,
    date: row.date,
  }));
}

export async function completeCompulsoryElement(
  userId: string,
  elementId: string,
  notes?: string
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('compulsory_completions')
    .upsert({
      user_id: userId,
      element_id: elementId,
      completed_at: new Date().toISOString(),
      date: today,
      ...(notes ? { notes } : {}),
    }, {
      onConflict: 'user_id,element_id,date',
    });

  if (error) {
    console.error('Error completing compulsory element:', error);
    return false;
  }

  return true;
}

// ===========================================
// ELEMENT-SPECIFIC SAVE FUNCTIONS
// ===========================================

export interface PhysicalState {
  cage_on: boolean;
  panties: boolean;
  plug: boolean;
  feminine_clothing: boolean;
  nail_polish: boolean;
  scent_anchor: boolean;
  jewelry: boolean;
}

/**
 * Save morning check-in data to mood_checkins, then mark compulsory complete
 */
export async function saveMorningCheckin(
  userId: string,
  mood: number,
  intention?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('mood_checkins')
    .insert({
      user_id: userId,
      score: mood,
      notes: intention?.trim() || null,
      recorded_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Error saving morning checkin:', error);
    return false;
  }

  return completeCompulsoryElement(userId, 'morning_checkin', intention?.trim());
}

/**
 * Save physical state log to physical_state_log, then mark compulsory complete
 */
export async function savePhysicalStateLog(
  userId: string,
  state: PhysicalState
): Promise<boolean> {
  const { error } = await supabase
    .from('physical_state_log')
    .insert({
      user_id: userId,
      ...state,
      logged_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Error saving physical state:', error);
    return false;
  }

  const summary = Object.entries(state)
    .filter(([, v]) => v)
    .map(([k]) => k.replace(/_/g, ' '))
    .join(', ');

  return completeCompulsoryElement(userId, 'physical_state_log', summary || 'nothing logged');
}

// ===========================================
// MAIN EVALUATION FUNCTIONS
// ===========================================

export interface CompulsoryStatus {
  element: CompulsoryElement;
  completed: boolean;
  completedAt: string | null;
  isRequired: boolean;          // Based on time window and phase
  isPastDeadline: boolean;
  blocksApp: boolean;           // Blocks 'all_features'
}

/**
 * Get the status of all compulsory elements for today
 */
export async function evaluateCompulsoryStatus(
  userId: string,
  daysOnProtocol: number
): Promise<CompulsoryStatus[]> {
  const completions = await getTodayCompletions(userId);
  const completedIds = new Set(completions.map(c => c.elementId));
  const currentWindow = getCurrentTimeWindow();

  return COMPULSORY_ELEMENTS.map(element => {
    const completed = completedIds.has(element.id);
    const completion = completions.find(c => c.elementId === element.id);
    const meetsPhase = meetsPhaseRequirement(element, daysOnProtocol);

    // Element is required if:
    // 1. User meets phase requirement
    // 2. Current time window matches or deadline is approaching
    const isInTimeWindow = element.timeWindow === 'any' ||
                           element.timeWindow === currentWindow;
    const isRequired = meetsPhase && isInTimeWindow;

    return {
      element,
      completed,
      completedAt: completion?.completedAt || null,
      isRequired,
      isPastDeadline: isPastDeadline(element.mustCompleteBy),
      blocksApp: element.blocksIfIncomplete.includes('all_features'),
    };
  });
}

/**
 * Get incomplete compulsory elements that block the app
 */
export async function getAppBlockingElements(
  userId: string,
  daysOnProtocol: number
): Promise<CompulsoryElement[]> {
  const statuses = await evaluateCompulsoryStatus(userId, daysOnProtocol);

  return statuses
    .filter(s => s.isRequired && !s.completed && s.blocksApp && !s.isPastDeadline)
    .map(s => s.element);
}

/**
 * Get incomplete compulsory elements for current time window
 */
export async function getIncompleteForTimeWindow(
  userId: string,
  daysOnProtocol: number
): Promise<CompulsoryElement[]> {
  const statuses = await evaluateCompulsoryStatus(userId, daysOnProtocol);

  return statuses
    .filter(s => s.isRequired && !s.completed && !s.isPastDeadline)
    .map(s => s.element);
}

/**
 * Check if any compulsory element blocks a specific feature
 */
export async function isFeatureBlockedByCompulsory(
  userId: string,
  daysOnProtocol: number,
  feature: string
): Promise<{ blocked: boolean; reason: string | null }> {
  const statuses = await evaluateCompulsoryStatus(userId, daysOnProtocol);

  for (const status of statuses) {
    if (status.isRequired && !status.completed && !status.isPastDeadline) {
      if (status.element.blocksIfIncomplete.includes(feature) ||
          status.element.blocksIfIncomplete.includes('all_features')) {
        return {
          blocked: true,
          reason: `Complete "${status.element.name}" first: ${status.element.description}`,
        };
      }
    }
  }

  return { blocked: false, reason: null };
}

/**
 * Check if app should be locked (any 'all_features' blocker incomplete)
 */
export async function shouldLockApp(
  userId: string,
  daysOnProtocol: number
): Promise<boolean> {
  const blocking = await getAppBlockingElements(userId, daysOnProtocol);
  return blocking.length > 0;
}

export default {
  COMPULSORY_ELEMENTS,
  evaluateCompulsoryStatus,
  getAppBlockingElements,
  getIncompleteForTimeWindow,
  isFeatureBlockedByCompulsory,
  shouldLockApp,
  completeCompulsoryElement,
  saveMorningCheckin,
  savePhysicalStateLog,
};
