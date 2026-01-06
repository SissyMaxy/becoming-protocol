import { supabase } from './supabase';

// Resource types matching the database enum
export type ResourceType = 'video' | 'article' | 'tutorial' | 'product' | 'app';

// Task resource interface
export interface TaskResource {
  id: string;
  templateId: string;
  resourceType: ResourceType;
  title: string;
  url: string;
  description?: string;
  creator?: string;
  durationLabel?: string;
  isPremium: boolean;
  isBeginnerFriendly: boolean;
  sortOrder: number;
}

// Database row type
interface DbTaskResource {
  id: string;
  template_id: string;
  resource_type: ResourceType;
  title: string;
  url: string;
  description: string | null;
  creator: string | null;
  duration_label: string | null;
  is_premium: boolean;
  is_beginner_friendly: boolean;
  sort_order: number;
}

// Map database row to TaskResource
function mapDbToResource(row: DbTaskResource): TaskResource {
  return {
    id: row.id,
    templateId: row.template_id,
    resourceType: row.resource_type,
    title: row.title,
    url: row.url,
    description: row.description || undefined,
    creator: row.creator || undefined,
    durationLabel: row.duration_label || undefined,
    isPremium: row.is_premium,
    isBeginnerFriendly: row.is_beginner_friendly,
    sortOrder: row.sort_order,
  };
}

/**
 * Get all resources for a specific task template
 */
export async function getResourcesForTemplate(templateId: string): Promise<TaskResource[]> {
  const { data, error } = await supabase
    .from('task_resources')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching task resources:', error);
    return [];
  }

  return (data || []).map(mapDbToResource);
}

/**
 * Get resources by their IDs
 */
export async function getResourcesByIds(ids: string[]): Promise<TaskResource[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('task_resources')
    .select('*')
    .in('id', ids)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching task resources by ids:', error);
    return [];
  }

  return (data || []).map(mapDbToResource);
}

/**
 * Get beginner-friendly resources for a template
 */
export async function getBeginnerResources(templateId: string): Promise<TaskResource[]> {
  const { data, error } = await supabase
    .from('task_resources')
    .select('*')
    .eq('template_id', templateId)
    .eq('is_beginner_friendly', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching beginner resources:', error);
    return [];
  }

  return (data || []).map(mapDbToResource);
}

/**
 * Get icon name for resource type (for use with lucide-react)
 */
export function getResourceIcon(type: ResourceType): string {
  switch (type) {
    case 'video':
      return 'Play';
    case 'article':
      return 'FileText';
    case 'tutorial':
      return 'GraduationCap';
    case 'product':
      return 'ShoppingBag';
    case 'app':
      return 'Smartphone';
    default:
      return 'ExternalLink';
  }
}

/**
 * Get label for resource type
 */
export function getResourceTypeLabel(type: ResourceType): string {
  switch (type) {
    case 'video':
      return 'Video';
    case 'article':
      return 'Article';
    case 'tutorial':
      return 'Tutorial';
    case 'product':
      return 'Product';
    case 'app':
      return 'App';
    default:
      return 'Link';
  }
}
