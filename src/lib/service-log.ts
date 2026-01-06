// Service logging for Time Ratchets
// Auto-logs service acts when serve/worship tasks are completed

import { supabase } from './supabase';

// Keywords that indicate a task is service-related
const SERVICE_KEYWORDS = [
  'serve',
  'worship',
  'goddess',
  'obey',
  'obedience',
  'devotion',
  'tribute',
  'offering',
  'kneel',
  'submit',
  'please her',
  'for her',
];

/**
 * Check if a task is service-related based on its title/description
 */
export function isServiceTask(title: string, description?: string): boolean {
  const text = `${title} ${description || ''}`.toLowerCase();
  return SERVICE_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * Log a service act to the database
 */
export async function logServiceAct(options?: {
  serviceType?: string;
  description?: string;
  taskId?: string;
  durationMinutes?: number;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('log_service', {
      p_user_id: user.id,
      p_service_type: options?.serviceType || 'task',
      p_description: options?.description || null,
      p_duration_minutes: options?.durationMinutes || null,
      p_task_id: options?.taskId || null,
    });
  } catch (error) {
    // Silently fail - service logging shouldn't break task completion
    console.error('Failed to log service:', error);
  }
}

/**
 * Check and log service if task qualifies
 */
export async function maybeLogService(
  taskId: string,
  title: string,
  description?: string
): Promise<void> {
  if (isServiceTask(title, description)) {
    await logServiceAct({
      serviceType: 'task',
      description: title,
      taskId,
    });
  }
}
