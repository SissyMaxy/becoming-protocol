/**
 * Skill Tree Progression Engine (P9.1)
 *
 * Manages per-domain skill progression: level tracking, advancement checks,
 * task/verification recording, and handler context generation.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

const ALL_DOMAINS = [
  'voice', 'makeup', 'movement', 'style', 'social_presentation',
  'intimate_skills', 'body_sculpting', 'skincare', 'hair', 'posture',
] as const;

export type SkillDomain = typeof ALL_DOMAINS[number];

export interface SkillDomainRow {
  id: string;
  user_id: string;
  domain: SkillDomain;
  current_level: number;
  max_level: number;
  tasks_completed_at_level: number;
  tasks_required_for_advancement: number;
  verifications_passed: number;
  verifications_required: number;
  last_practice_at: string | null;
  total_practice_minutes: number;
  streak_days: number;
  longest_streak: number;
  level_history: LevelHistoryEntry[];
  created_at: string;
  updated_at: string;
}

interface LevelHistoryEntry {
  from: number;
  to: number;
  advanced_at: string;
  tasks_completed: number;
  verifications_passed: number;
}

// SkillLevelDefinition shape (used for query results)
// id, domain, level, title, description, task_filter, advancement_criteria, verification_type, verification_instructions

// ============================================
// CORE: getSkillDomains
// ============================================

/**
 * Fetch all skill domains for a user. Auto-initializes all 10 domains at level 1
 * if the user has no rows yet.
 */
export async function getSkillDomains(userId: string): Promise<SkillDomainRow[]> {
  const { data, error } = await supabase
    .from('skill_domains')
    .select('*')
    .eq('user_id', userId)
    .order('domain');

  if (error) {
    console.error('[skill-tree] getSkillDomains error:', error.message);
    return [];
  }

  // Auto-initialize if empty
  if (!data || data.length === 0) {
    return initializeDomains(userId);
  }

  return data as SkillDomainRow[];
}

async function initializeDomains(userId: string): Promise<SkillDomainRow[]> {
  // Look up max_level per domain from definitions
  const { data: defs } = await supabase
    .from('skill_level_definitions')
    .select('domain, level')
    .order('level', { ascending: false });

  const maxLevels: Record<string, number> = {};
  if (defs) {
    for (const d of defs) {
      if (!maxLevels[d.domain] || d.level > maxLevels[d.domain]) {
        maxLevels[d.domain] = d.level;
      }
    }
  }

  // Also fetch level-1 advancement criteria for tasks_required / verifications_required
  const { data: level1Defs } = await supabase
    .from('skill_level_definitions')
    .select('domain, advancement_criteria')
    .eq('level', 1);

  const level1Criteria: Record<string, { tasks_required: number; verifications_required: number }> = {};
  if (level1Defs) {
    for (const d of level1Defs) {
      const criteria = d.advancement_criteria as { tasks_required: number; verifications_required: number };
      level1Criteria[d.domain] = criteria;
    }
  }

  const rows = ALL_DOMAINS.map(domain => ({
    user_id: userId,
    domain,
    current_level: 1,
    max_level: maxLevels[domain] || 8,
    tasks_completed_at_level: 0,
    tasks_required_for_advancement: level1Criteria[domain]?.tasks_required ?? 5,
    verifications_passed: 0,
    verifications_required: level1Criteria[domain]?.verifications_required ?? 3,
    streak_days: 0,
    longest_streak: 0,
    total_practice_minutes: 0,
    level_history: [],
  }));

  const { data: inserted, error } = await supabase
    .from('skill_domains')
    .insert(rows)
    .select('*');

  if (error) {
    console.error('[skill-tree] initializeDomains error:', error.message);
    return [];
  }

  return (inserted ?? []) as SkillDomainRow[];
}

// ============================================
// CORE: checkAdvancement
// ============================================

/**
 * Check if a user qualifies to advance in a domain. If so, advance the level,
 * reset counters, append to level_history, and store a handler_memory.
 */
export async function checkAdvancement(userId: string, domain: SkillDomain): Promise<boolean> {
  try {
    // Fetch current domain state
    const { data: domainRow } = await supabase
      .from('skill_domains')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .maybeSingle();

    if (!domainRow) return false;

    // Already at max
    if (domainRow.current_level >= domainRow.max_level) return false;

    // Fetch level definition for current level
    const { data: levelDef } = await supabase
      .from('skill_level_definitions')
      .select('advancement_criteria')
      .eq('domain', domain)
      .eq('level', domainRow.current_level)
      .maybeSingle();

    const criteria = (levelDef?.advancement_criteria as { tasks_required: number; verifications_required: number }) ?? {
      tasks_required: domainRow.tasks_required_for_advancement,
      verifications_required: domainRow.verifications_required,
    };

    // Check if criteria met
    if (
      domainRow.tasks_completed_at_level < criteria.tasks_required ||
      domainRow.verifications_passed < criteria.verifications_required
    ) {
      return false;
    }

    // Advance
    const newLevel = domainRow.current_level + 1;
    const historyEntry: LevelHistoryEntry = {
      from: domainRow.current_level,
      to: newLevel,
      advanced_at: new Date().toISOString(),
      tasks_completed: domainRow.tasks_completed_at_level,
      verifications_passed: domainRow.verifications_passed,
    };

    const existingHistory = (domainRow.level_history as LevelHistoryEntry[]) || [];
    const updatedHistory = [...existingHistory, historyEntry];

    // Fetch next level's criteria for the new tasks_required / verifications_required
    const { data: nextDef } = await supabase
      .from('skill_level_definitions')
      .select('advancement_criteria')
      .eq('domain', domain)
      .eq('level', newLevel)
      .maybeSingle();

    const nextCriteria = (nextDef?.advancement_criteria as { tasks_required: number; verifications_required: number }) ?? {
      tasks_required: 5,
      verifications_required: 3,
    };

    const { error: updateError } = await supabase
      .from('skill_domains')
      .update({
        current_level: newLevel,
        tasks_completed_at_level: 0,
        verifications_passed: 0,
        tasks_required_for_advancement: nextCriteria.tasks_required,
        verifications_required: nextCriteria.verifications_required,
        level_history: updatedHistory,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('domain', domain);

    if (updateError) {
      console.error('[skill-tree] advancement update error:', updateError.message);
      return false;
    }

    // Store advancement as handler_memory — fire-and-forget
    supabase
      .from('handler_memory')
      .insert({
        user_id: userId,
        memory_type: 'skill_advancement',
        content: `Advanced ${domain} from level ${domainRow.current_level} to level ${newLevel}. Completed ${domainRow.tasks_completed_at_level} tasks and ${domainRow.verifications_passed} verifications at previous level.`,
        importance: 7,
        tags: ['skill_tree', domain, `level_${newLevel}`],
      })
      .then(() => {});

    return true;
  } catch (err) {
    console.error('[skill-tree] checkAdvancement exception:', err);
    return false;
  }
}

// ============================================
// CORE: recordTaskCompletion
// ============================================

/**
 * Record a task completion in a domain. Increments counter, updates streak,
 * then fires-and-forgets an advancement check.
 */
export async function recordTaskCompletion(
  userId: string,
  domain: SkillDomain,
  practiceMinutes?: number
): Promise<void> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Fetch current domain state
  const { data: domainRow } = await supabase
    .from('skill_domains')
    .select('tasks_completed_at_level, streak_days, longest_streak, last_practice_at, total_practice_minutes')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();

  if (!domainRow) return;

  // Calculate streak
  let newStreak = domainRow.streak_days;
  const lastPractice = domainRow.last_practice_at
    ? new Date(domainRow.last_practice_at).toISOString().split('T')[0]
    : null;

  if (lastPractice === today) {
    // Same day — no streak change
  } else {
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
    if (lastPractice === yesterday) {
      newStreak += 1;
    } else {
      // Streak broken — restart at 1
      newStreak = 1;
    }
  }

  const newLongest = Math.max(domainRow.longest_streak, newStreak);
  const addedMinutes = practiceMinutes ?? 0;

  const { error } = await supabase
    .from('skill_domains')
    .update({
      tasks_completed_at_level: domainRow.tasks_completed_at_level + 1,
      streak_days: newStreak,
      longest_streak: newLongest,
      last_practice_at: now.toISOString(),
      total_practice_minutes: domainRow.total_practice_minutes + addedMinutes,
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId)
    .eq('domain', domain);

  if (error) {
    console.error('[skill-tree] recordTaskCompletion error:', error.message);
    return;
  }

  // Fire-and-forget advancement check
  checkAdvancement(userId, domain).catch(() => {});
}

// ============================================
// CORE: recordVerification
// ============================================

/**
 * Record a verification pass in a domain. Increments counter,
 * then fires-and-forgets an advancement check.
 */
export async function recordVerification(userId: string, domain: SkillDomain): Promise<void> {
  const { data: domainRow } = await supabase
    .from('skill_domains')
    .select('verifications_passed')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();

  if (!domainRow) return;

  const { error } = await supabase
    .from('skill_domains')
    .update({
      verifications_passed: domainRow.verifications_passed + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('domain', domain);

  if (error) {
    console.error('[skill-tree] recordVerification error:', error.message);
    return;
  }

  // Fire-and-forget advancement check
  checkAdvancement(userId, domain).catch(() => {});
}

// ============================================
// CORE: getTasksForLevel
// ============================================

/**
 * Get task_bank tasks filtered by the current level definition's task_filter.
 */
export async function getTasksForLevel(
  userId: string,
  domain: SkillDomain
): Promise<Array<{ id: string; domain: string; instruction: string; intensity: number; duration_minutes: number | null }>> {
  // Get current level
  const { data: domainRow } = await supabase
    .from('skill_domains')
    .select('current_level')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();

  const level = domainRow?.current_level ?? 1;

  // Get level definition
  const { data: levelDef } = await supabase
    .from('skill_level_definitions')
    .select('task_filter')
    .eq('domain', domain)
    .eq('level', level)
    .maybeSingle();

  const filter = (levelDef?.task_filter as Record<string, unknown>) ?? {};
  const maxIntensity = (filter.intensity_max as number) ?? 10;

  // Query task_bank with filters
  let query = supabase
    .from('task_bank')
    .select('id, domain, instruction, intensity, duration_minutes')
    .eq('active', true)
    .lte('intensity', maxIntensity);

  // Filter by domain if specified in task_filter
  const filterDomain = (filter.domain as string) ?? domain;
  query = query.eq('domain', filterDomain);

  // Apply tag filter if present
  const tags = filter.tags as string[] | undefined;
  if (tags && tags.length > 0) {
    // task_bank.tags is expected to overlap with the filter tags
    query = query.overlaps('tags', tags);
  }

  query = query.order('intensity', { ascending: true }).limit(50);

  const { data, error } = await query;

  if (error) {
    console.error('[skill-tree] getTasksForLevel error:', error.message);
    return [];
  }

  return (data ?? []) as Array<{ id: string; domain: string; instruction: string; intensity: number; duration_minutes: number | null }>;
}

// ============================================
// CORE: buildSkillTreeContext
// ============================================

/**
 * Build handler context string showing skill tree progression for all domains.
 */
export async function buildSkillTreeContext(userId: string): Promise<string> {
  try {
    const domains = await getSkillDomains(userId);
    if (domains.length === 0) return '';

    const parts: string[] = ['SKILL TREE:'];

    // Sort: domains with longest gap since last practice first (most neglected)
    const sorted = [...domains].sort((a, b) => {
      const aTime = a.last_practice_at ? new Date(a.last_practice_at).getTime() : 0;
      const bTime = b.last_practice_at ? new Date(b.last_practice_at).getTime() : 0;
      return aTime - bTime; // oldest practice first
    });

    for (const d of sorted) {
      const tasksProgress = d.tasks_required_for_advancement > 0
        ? Math.round((d.tasks_completed_at_level / d.tasks_required_for_advancement) * 100)
        : 0;
      const verifProgress = d.verifications_required > 0
        ? Math.round((d.verifications_passed / d.verifications_required) * 100)
        : 0;
      const overallProgress = Math.round((tasksProgress + verifProgress) / 2);

      const streakStr = d.streak_days > 0 ? ` streak:${d.streak_days}d` : '';
      const lastPractice = d.last_practice_at
        ? `${Math.round((Date.now() - new Date(d.last_practice_at).getTime()) / 86400000)}d ago`
        : 'never';

      parts.push(
        `  ${d.domain} L${d.current_level}/${d.max_level} ${overallProgress}% (tasks:${d.tasks_completed_at_level}/${d.tasks_required_for_advancement} verif:${d.verifications_passed}/${d.verifications_required})${streakStr} last:${lastPractice}`
      );
    }

    // Find most neglected domain for prescription hint
    const neglected = sorted[0];
    if (neglected) {
      const neglectedDays = neglected.last_practice_at
        ? Math.round((Date.now() - new Date(neglected.last_practice_at).getTime()) / 86400000)
        : 999;
      if (neglectedDays >= 3) {
        parts.push(`  PRESCRIBE FROM: ${neglected.domain} (${neglectedDays}d gap) — use current level tasks only`);
      }
    }

    // At-max domains
    const maxed = domains.filter(d => d.current_level >= d.max_level);
    if (maxed.length > 0) {
      parts.push(`  MASTERED: ${maxed.map(d => d.domain).join(', ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
