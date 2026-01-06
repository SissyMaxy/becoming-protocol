// Task Templates Library
// Functions for fetching, prescribing, and tracking task templates

import { supabase } from './supabase';
import type {
  TaskTemplate,
  TaskDomain,
  TaskDifficulty,
  PrescribableTemplate,
  UserTemplateHistory,
  TemplateCompletionLog,
  TemplateSearchParams,
  DbTaskTemplate,
  DbUserTemplateHistory,
  DbPrescribableTemplate,
} from '../types/task-templates';
import {
  mapDbTemplateToTemplate,
  mapDbHistoryToHistory,
  mapDbPrescribableToTemplate,
  getBalancedPrescription,
} from '../types/task-templates';

// ===========================================
// FETCH TEMPLATES
// ===========================================

/**
 * Get all active task templates
 */
export async function getAllTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('is_active', true)
    .order('domain')
    .order('template_code');

  if (error) {
    console.error('Error fetching templates:', error);
    throw error;
  }

  return (data as DbTaskTemplate[]).map(mapDbTemplateToTemplate);
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(id: string): Promise<TaskTemplate | null> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching template:', error);
    throw error;
  }

  return mapDbTemplateToTemplate(data as DbTaskTemplate);
}

/**
 * Get a template by its code (e.g., 'V1', 'M2')
 */
export async function getTemplateByCode(code: string): Promise<TaskTemplate | null> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('template_code', code)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching template by code:', error);
    throw error;
  }

  return mapDbTemplateToTemplate(data as DbTaskTemplate);
}

/**
 * Get templates by domain
 */
export async function getTemplatesByDomain(domain: TaskDomain): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('domain', domain)
    .eq('is_active', true)
    .order('difficulty')
    .order('template_code');

  if (error) {
    console.error('Error fetching templates by domain:', error);
    throw error;
  }

  return (data as DbTaskTemplate[]).map(mapDbTemplateToTemplate);
}

/**
 * Search templates with various filters
 */
export async function searchTemplates(params: TemplateSearchParams): Promise<TaskTemplate[]> {
  let query = supabase
    .from('task_templates')
    .select('*')
    .eq('is_active', true);

  if (params.domains && params.domains.length > 0) {
    query = query.in('domain', params.domains);
  }

  if (params.difficulty) {
    query = query.eq('difficulty', params.difficulty);
  }

  if (params.maxDifficulty) {
    const difficultyOrder = ['beginner', 'intermediate', 'advanced'];
    const maxIndex = difficultyOrder.indexOf(params.maxDifficulty);
    const allowedDifficulties = difficultyOrder.slice(0, maxIndex + 1);
    query = query.in('difficulty', allowedDifficulties);
  }

  if (params.frequency) {
    query = query.eq('frequency', params.frequency);
  }

  if (params.requiresPrivacy !== undefined) {
    query = query.eq('requires_privacy', params.requiresPrivacy);
  }

  if (params.maxTimeMinutes) {
    query = query.lte('time_minutes', params.maxTimeMinutes);
  }

  if (params.minPhase) {
    query = query.lte('min_phase', params.minPhase);
  }

  const { data, error } = await query.order('domain').order('template_code');

  if (error) {
    console.error('Error searching templates:', error);
    throw error;
  }

  let templates = (data as DbTaskTemplate[]).map(mapDbTemplateToTemplate);

  // Text search (client-side for simplicity)
  if (params.searchQuery) {
    const searchLower = params.searchQuery.toLowerCase();
    templates = templates.filter(t =>
      t.name.toLowerCase().includes(searchLower) ||
      t.shortDescription.toLowerCase().includes(searchLower) ||
      t.fullDescription.whatToDo.toLowerCase().includes(searchLower)
    );
  }

  return templates;
}

// ===========================================
// PRESCRIPTION FUNCTIONS
// ===========================================

/**
 * Get prescribable templates for a user based on their phase and preferences
 * Uses the database function for optimized prescription weighting
 */
export async function getPrescribableTemplates(
  userId: string,
  userPhase: number = 1,
  domains?: TaskDomain[],
  maxDifficulty: TaskDifficulty = 'advanced',
  limit: number = 20
): Promise<PrescribableTemplate[]> {
  const { data, error } = await supabase.rpc('get_prescribable_templates', {
    p_user_id: userId,
    p_user_phase: userPhase,
    p_domains: domains || null,
    p_max_difficulty: maxDifficulty,
    p_limit: limit,
  });

  if (error) {
    console.error('Error getting prescribable templates:', error);
    throw error;
  }

  return (data as DbPrescribableTemplate[]).map(mapDbPrescribableToTemplate);
}

/**
 * Generate a balanced prescription of tasks for a user
 */
export async function generatePrescription(
  userId: string,
  userPhase: number,
  count: number = 5,
  options: {
    domains?: TaskDomain[];
    maxDifficulty?: TaskDifficulty;
    balanceDomains?: boolean;
    excludeRecentDays?: number;
  } = {}
): Promise<PrescribableTemplate[]> {
  const {
    domains,
    maxDifficulty = userPhase === 1 ? 'beginner' : userPhase === 2 ? 'intermediate' : 'advanced',
    balanceDomains = true,
  } = options;

  // Get more templates than needed to allow for balancing
  const templates = await getPrescribableTemplates(
    userId,
    userPhase,
    domains,
    maxDifficulty,
    count * 3
  );

  if (balanceDomains) {
    return getBalancedPrescription(templates, count, true);
  }

  return templates.slice(0, count);
}

// ===========================================
// USER HISTORY FUNCTIONS
// ===========================================

/**
 * Get user's template history
 */
export async function getUserTemplateHistory(userId: string): Promise<UserTemplateHistory[]> {
  const { data, error } = await supabase
    .from('user_template_history')
    .select('*')
    .eq('user_id', userId)
    .order('last_completed_at', { ascending: false });

  if (error) {
    console.error('Error fetching user template history:', error);
    throw error;
  }

  return (data as DbUserTemplateHistory[]).map(mapDbHistoryToHistory);
}

/**
 * Get history for a specific template
 */
export async function getTemplateHistoryForUser(
  userId: string,
  templateId: string
): Promise<UserTemplateHistory | null> {
  const { data, error } = await supabase
    .from('user_template_history')
    .select('*')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching template history:', error);
    throw error;
  }

  return mapDbHistoryToHistory(data as DbUserTemplateHistory);
}

// ===========================================
// COMPLETION TRACKING
// ===========================================

/**
 * Record a template completion using the database function
 */
export async function recordTemplateCompletion(
  userId: string,
  templateId: string,
  options: {
    taskId?: string;
    durationMinutes?: number;
    rating?: number;
    notes?: string;
  } = {}
): Promise<string> {
  const { data, error } = await supabase.rpc('record_template_completion', {
    p_user_id: userId,
    p_template_id: templateId,
    p_task_id: options.taskId || null,
    p_duration_minutes: options.durationMinutes || null,
    p_rating: options.rating || null,
    p_notes: options.notes || null,
  });

  if (error) {
    console.error('Error recording template completion:', error);
    throw error;
  }

  return data as string;
}

/**
 * Update a completion log with additional data (e.g., expanded sections)
 */
export async function updateCompletionLog(
  logId: string,
  updates: {
    expandedWhyItMatters?: boolean;
    expandedTips?: boolean;
    rating?: number;
    notes?: string;
  }
): Promise<void> {
  const updateData: Record<string, unknown> = {};

  if (updates.expandedWhyItMatters !== undefined) {
    updateData.expanded_why_it_matters = updates.expandedWhyItMatters;
  }
  if (updates.expandedTips !== undefined) {
    updateData.expanded_tips = updates.expandedTips;
  }
  if (updates.rating !== undefined) {
    updateData.rating = updates.rating;
  }
  if (updates.notes !== undefined) {
    updateData.notes = updates.notes;
  }

  const { error } = await supabase
    .from('template_completion_log')
    .update(updateData)
    .eq('id', logId);

  if (error) {
    console.error('Error updating completion log:', error);
    throw error;
  }
}

/**
 * Get recent completion logs for a user
 */
export async function getRecentCompletions(
  userId: string,
  limit: number = 20
): Promise<TemplateCompletionLog[]> {
  const { data, error } = await supabase
    .from('template_completion_log')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent completions:', error);
    throw error;
  }

  return data.map(d => ({
    id: d.id,
    userId: d.user_id,
    templateId: d.template_id,
    taskId: d.task_id,
    completedAt: d.completed_at,
    durationMinutes: d.duration_minutes,
    rating: d.rating,
    notes: d.notes,
    expandedWhyItMatters: d.expanded_why_it_matters,
    expandedTips: d.expanded_tips,
    completedInSession: d.completed_in_session,
    sessionId: d.session_id,
  }));
}

// ===========================================
// STATISTICS
// ===========================================

/**
 * Get template completion statistics for a user
 */
export async function getTemplateStats(userId: string): Promise<{
  totalCompleted: number;
  uniqueTemplatesCompleted: number;
  byDomain: Record<TaskDomain, number>;
  averageRating: number | null;
  streakDays: number;
}> {
  // Get history summary
  const { data: historyData, error: historyError } = await supabase
    .from('user_template_history')
    .select('template_id, times_completed, average_rating, total_ratings')
    .eq('user_id', userId);

  if (historyError) {
    console.error('Error fetching template stats:', historyError);
    throw historyError;
  }

  // Get template domains for completed templates
  const templateIds = historyData.map(h => h.template_id);
  const { data: templateData, error: templateError } = await supabase
    .from('task_templates')
    .select('id, domain')
    .in('id', templateIds);

  if (templateError) {
    console.error('Error fetching template domains:', templateError);
    throw templateError;
  }

  // Calculate stats
  const domainMap = new Map(templateData.map(t => [t.id, t.domain]));
  const byDomain: Record<TaskDomain, number> = {
    voice: 0,
    movement: 0,
    skincare: 0,
    style: 0,
    social: 0,
    mindset: 0,
    body: 0,
  };

  let totalCompleted = 0;
  let totalRatingSum = 0;
  let totalRatings = 0;

  for (const history of historyData) {
    totalCompleted += history.times_completed;
    const domain = domainMap.get(history.template_id);
    if (domain) {
      byDomain[domain as TaskDomain] += history.times_completed;
    }
    if (history.average_rating && history.total_ratings) {
      totalRatingSum += history.average_rating * history.total_ratings;
      totalRatings += history.total_ratings;
    }
  }

  // Calculate streak (simplified - just check consecutive days with completions)
  const { data: recentCompletions } = await supabase
    .from('template_completion_log')
    .select('completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(100);

  let streakDays = 0;
  if (recentCompletions && recentCompletions.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completionDates = new Set(
      recentCompletions.map(c => {
        const d = new Date(c.completed_at);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
    );

    let checkDate = today.getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    while (completionDates.has(checkDate)) {
      streakDays++;
      checkDate -= oneDay;
    }
  }

  return {
    totalCompleted,
    uniqueTemplatesCompleted: historyData.length,
    byDomain,
    averageRating: totalRatings > 0 ? totalRatingSum / totalRatings : null,
    streakDays,
  };
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Get suggested next templates based on user's history
 */
export async function getSuggestedTemplates(
  userId: string,
  userPhase: number,
  count: number = 3
): Promise<TaskTemplate[]> {
  // Get user's completed templates
  const history = await getUserTemplateHistory(userId);
  const completedIds = new Set(history.map(h => h.templateId));

  // Get all templates for user's phase
  const allTemplates = await searchTemplates({
    minPhase: userPhase,
    maxDifficulty: userPhase === 1 ? 'beginner' : userPhase === 2 ? 'intermediate' : 'advanced',
  });

  // Filter to templates not yet completed
  const uncompleted = allTemplates.filter(t => !completedIds.has(t.id));

  // Return first N uncompleted, prioritizing lower difficulty
  return uncompleted.slice(0, count);
}

/**
 * Check if a template is appropriate for a user's current phase
 */
export function isTemplateAvailable(template: TaskTemplate, userPhase: number): boolean {
  return template.minPhase <= userPhase;
}

/**
 * Get the maximum difficulty available for a user's phase
 */
export function getMaxDifficultyForPhase(phase: number): TaskDifficulty {
  if (phase <= 1) return 'beginner';
  if (phase === 2) return 'intermediate';
  return 'advanced';
}
