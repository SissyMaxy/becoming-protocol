/**
 * Gina Visibility and Safety Filtering
 *
 * Implements v2 Part 7.2:
 * - Gina visibility level tracking (0-5)
 * - Gina-safe task filtering
 * - Privacy-aware notifications
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

/**
 * Gina visibility levels:
 * 0 = Completely unaware
 * 1 = Knows something exists but not details
 * 2 = Knows about feminine practice generally
 * 3 = Knows specific aspects (skincare, style)
 * 4 = Actively supportive/participates
 * 5 = Full owner/dominant role
 */
export type GinaVisibilityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface GinaState {
  visibilityLevel: GinaVisibilityLevel;
  isHome: boolean;
  knownDomains: string[]; // Domains Gina knows about
  safeToDo: string[]; // Tasks safe even when she's home
  requiresPrivacy: string[]; // Tasks that need privacy
}

export interface TaskSafetyRating {
  taskId: string;
  domain: string;
  requiredPrivacyLevel: 'none' | 'partial' | 'full';
  ginaSafe: boolean;
  canDoWhenHome: boolean;
  covertAlternative?: string;
}

// ============================================
// VISIBILITY TRACKING
// ============================================

export async function getGinaState(userId: string): Promise<GinaState> {
  const { data } = await supabase
    .from('gina_conversion_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  const visibilityLevel = (data?.visibility_level || 0) as GinaVisibilityLevel;

  // Determine known domains based on visibility level
  const knownDomains: string[] = [];
  if (visibilityLevel >= 2) {
    knownDomains.push('skincare');
  }
  if (visibilityLevel >= 3) {
    knownDomains.push('style', 'body_language', 'movement');
  }
  if (visibilityLevel >= 4) {
    knownDomains.push('voice', 'makeup', 'inner_narrative');
  }
  if (visibilityLevel >= 5) {
    knownDomains.push('intimate', 'service');
  }

  // Safe tasks vary by visibility
  const safeToDo = getSafeTasksByVisibility(visibilityLevel);
  const requiresPrivacy = getPrivacyRequiredTasks(visibilityLevel);

  return {
    visibilityLevel,
    isHome: data?.gina_home ?? false,
    knownDomains,
    safeToDo,
    requiresPrivacy,
  };
}

function getSafeTasksByVisibility(level: GinaVisibilityLevel): string[] {
  const base = ['mood_log', 'journaling', 'posture_awareness'];

  if (level >= 1) {
    return [...base, 'inner_narrative', 'body_language_observation'];
  }
  if (level >= 2) {
    return [...base, 'skincare', 'inner_narrative', 'body_language_observation', 'movement_practice'];
  }
  if (level >= 3) {
    return [...base, 'skincare', 'style_observation', 'movement_practice', 'inner_narrative'];
  }
  if (level >= 4) {
    return [...base, 'skincare', 'style', 'movement', 'voice_light', 'makeup_light'];
  }
  if (level === 5) {
    return ['all']; // Everything is safe
  }

  return base;
}

function getPrivacyRequiredTasks(level: GinaVisibilityLevel): string[] {
  if (level >= 5) return []; // Nothing requires privacy

  const privacyRequired = ['intimate', 'edge_session', 'goon_session', 'hypno'];

  if (level < 4) {
    privacyRequired.push('voice_practice', 'makeup_practice');
  }
  if (level < 3) {
    privacyRequired.push('style_dressing', 'movement_practice');
  }
  if (level < 2) {
    privacyRequired.push('skincare_extended');
  }

  return privacyRequired;
}

export async function updateGinaVisibility(
  userId: string,
  newLevel: GinaVisibilityLevel,
  reason: string
): Promise<void> {
  const currentState = await getGinaState(userId);

  // Visibility only ratchets up
  if (newLevel <= currentState.visibilityLevel) {
    return;
  }

  await supabase
    .from('gina_conversion_state')
    .update({
      visibility_level: newLevel,
      visibility_updated_at: new Date().toISOString(),
      visibility_update_reason: reason,
    })
    .eq('user_id', userId);

  // Log the change
  await supabase.from('gina_visibility_history').insert({
    user_id: userId,
    from_level: currentState.visibilityLevel,
    to_level: newLevel,
    reason,
  });
}

// ============================================
// TASK FILTERING
// ============================================

export function isTaskGinaSafe(
  task: { domain: string; description: string; privacyRequired?: boolean },
  ginaState: GinaState
): TaskSafetyRating {
  const rating: TaskSafetyRating = {
    taskId: '',
    domain: task.domain,
    requiredPrivacyLevel: 'none',
    ginaSafe: true,
    canDoWhenHome: true,
  };

  // Check if domain requires privacy
  if (ginaState.requiresPrivacy.includes(task.domain)) {
    rating.requiredPrivacyLevel = 'full';
    rating.ginaSafe = false;
    rating.canDoWhenHome = false;
    rating.covertAlternative = getCovertAlternative(task.domain);
    return rating;
  }

  // Check if it's a known/safe domain
  if (ginaState.safeToDo.includes('all') || ginaState.safeToDo.includes(task.domain)) {
    rating.ginaSafe = true;
    rating.canDoWhenHome = true;
    return rating;
  }

  // Partial privacy - can do covertly
  rating.requiredPrivacyLevel = 'partial';
  rating.ginaSafe = false;
  rating.canDoWhenHome = false;
  rating.covertAlternative = getCovertAlternative(task.domain);

  return rating;
}

function getCovertAlternative(domain: string): string {
  const alternatives: Record<string, string> = {
    voice: 'Voice awareness - notice your pitch throughout the day',
    makeup: 'Color observation - notice what colors suit you',
    style_dressing: 'Style observation - notice what catches your eye shopping',
    intimate: 'Inner desire acknowledgment - private journaling',
    movement: 'Posture awareness - can be done anywhere',
    skincare_extended: 'Basic skincare - framed as self-care',
  };

  return alternatives[domain] || 'Inner reflection on this domain';
}

export function filterTasksForGinaSafety(
  tasks: { id: string; domain: string; description: string; privacyRequired?: boolean }[],
  ginaState: GinaState
): { safeTasks: typeof tasks; covertTasks: { original: typeof tasks[0]; alternative: string }[] } {
  const safeTasks: typeof tasks = [];
  const covertTasks: { original: typeof tasks[0]; alternative: string }[] = [];

  for (const task of tasks) {
    const rating = isTaskGinaSafe(task, ginaState);

    if (rating.canDoWhenHome || !ginaState.isHome) {
      safeTasks.push(task);
    } else if (rating.covertAlternative) {
      covertTasks.push({
        original: task,
        alternative: rating.covertAlternative,
      });
    }
  }

  return { safeTasks, covertTasks };
}

// ============================================
// NOTIFICATION SAFETY
// ============================================

export interface NotificationSafetyCheck {
  originalContent: string;
  isSafe: boolean;
  safeContent: string;
  reason?: string;
}

const UNSAFE_TERMS = [
  'edge', 'edges', 'edging',
  'arousal', 'aroused',
  'denial', 'denied',
  'orgasm',
  'session', 'goon',
  'hypno', 'conditioning',
  'sissy', 'feminization',
  'chastity', 'locked', 'cage',
  'submission', 'obey', 'obedience',
  'mistress', 'owner', 'domme',
  'slut', 'whore', 'bimbo',
  'plug', 'toy', 'dildo',
  'panties', 'lingerie', 'bra',
  'cock', 'cum', 'clit',
];

const SAFE_REPLACEMENTS: Record<string, string> = {
  'edge session': 'self-care session',
  'denial day': 'streak day',
  'arousal': 'energy',
  'hypno': 'meditation',
  'conditioning': 'practice',
  'voice practice': 'vocal care',
  'skincare routine': 'skincare time',
};

export function makeNotificationGinaSafe(
  content: string,
  ginaState: GinaState
): NotificationSafetyCheck {
  // If visibility is 5, everything is safe
  if (ginaState.visibilityLevel >= 5) {
    return {
      originalContent: content,
      isSafe: true,
      safeContent: content,
    };
  }

  let safeContent = content;
  let wasModified = false;

  // Check for unsafe terms
  const lowerContent = content.toLowerCase();
  for (const term of UNSAFE_TERMS) {
    if (lowerContent.includes(term)) {
      wasModified = true;
      // Try to find a replacement
      for (const [unsafe, safe] of Object.entries(SAFE_REPLACEMENTS)) {
        if (lowerContent.includes(unsafe)) {
          const regex = new RegExp(unsafe, 'gi');
          safeContent = safeContent.replace(regex, safe);
        }
      }
    }
  }

  // If still contains unsafe terms, use generic message
  const stillHasUnsafe = UNSAFE_TERMS.some(term =>
    safeContent.toLowerCase().includes(term)
  );

  if (stillHasUnsafe) {
    return {
      originalContent: content,
      isSafe: false,
      safeContent: 'Time for some self-care.',
      reason: 'Contains terms that require privacy',
    };
  }

  return {
    originalContent: content,
    isSafe: !wasModified,
    safeContent,
    reason: wasModified ? 'Modified for safety' : undefined,
  };
}

// ============================================
// WEEKEND MODE GINA INTEGRATION
// ============================================

export function getGinaSafeWeekendTasks(ginaState: GinaState): string[] {
  const tasks: string[] = [];

  // Always safe
  tasks.push('Morning skincare ritual');
  tasks.push('Posture awareness');
  tasks.push('Journaling (personal writing)');
  tasks.push('Inner narrative work');

  // Safe if visibility >= 2
  if (ginaState.visibilityLevel >= 2) {
    tasks.push('Extended skincare with Gina');
    tasks.push('Movement observation during walks');
  }

  // Safe if visibility >= 3
  if (ginaState.visibilityLevel >= 3) {
    tasks.push('Style observation during shopping');
    tasks.push('Body language practice during activities');
  }

  // Safe if visibility >= 4
  if (ginaState.visibilityLevel >= 4) {
    tasks.push('Light voice practice');
    tasks.push('Makeup experimentation');
  }

  return tasks;
}

export function getGinaSafeSharedActivities(ginaState: GinaState): string[] {
  const activities: string[] = [];

  // Always available
  activities.push('Watching shows together → body language observation');
  activities.push('Walking together → posture practice');

  // If visibility >= 2
  if (ginaState.visibilityLevel >= 2) {
    activities.push('Skincare together → shared ritual');
  }

  // If visibility >= 3
  if (ginaState.visibilityLevel >= 3) {
    activities.push('Shopping together → style awareness');
    activities.push('Cooking together → movement practice');
  }

  // If visibility >= 4
  if (ginaState.visibilityLevel >= 4) {
    activities.push('Dress-up sessions → style practice');
    activities.push('Makeup practice together');
  }

  // If visibility >= 5
  if (ginaState.visibilityLevel >= 5) {
    activities.push('Directed activities → service practice');
    activities.push('Role practice → dynamic reinforcement');
  }

  return activities;
}

// ============================================
// GINA HOME STATE
// ============================================

export async function setGinaHomeState(userId: string, isHome: boolean): Promise<void> {
  await supabase
    .from('user_state')
    .update({ gina_home: isHome })
    .eq('user_id', userId);

  // Also update gina_conversion_state
  await supabase
    .from('gina_conversion_state')
    .update({ gina_home: isHome })
    .eq('user_id', userId);
}

export async function isGinaHome(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_state')
    .select('gina_home')
    .eq('user_id', userId)
    .single();

  return data?.gina_home ?? false;
}
