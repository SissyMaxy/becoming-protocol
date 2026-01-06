// Task Templates Types
// Rich task content library for feminization practices

// ===========================================
// ENUMS & CONSTANTS
// ===========================================

export type TaskDomain = 'voice' | 'movement' | 'skincare' | 'style' | 'social' | 'mindset' | 'body';

export type TaskDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type TaskFrequency = 'daily' | 'weekly' | '2-3x_weekly' | 'as_needed' | 'once';

export const DOMAIN_LABELS: Record<TaskDomain, string> = {
  voice: 'Voice Training',
  movement: 'Movement & Posture',
  skincare: 'Skincare',
  style: 'Style & Wardrobe',
  social: 'Social Practice',
  mindset: 'Mindset & Identity',
  body: 'Body Awareness',
};

export const DOMAIN_COLORS: Record<TaskDomain, string> = {
  voice: 'from-purple-500 to-violet-600',
  movement: 'from-blue-500 to-cyan-500',
  skincare: 'from-pink-400 to-rose-500',
  style: 'from-fuchsia-500 to-pink-500',
  social: 'from-amber-500 to-orange-500',
  mindset: 'from-indigo-500 to-purple-600',
  body: 'from-teal-500 to-emerald-500',
};

export const DOMAIN_ICONS: Record<TaskDomain, string> = {
  voice: 'Mic',
  movement: 'Activity',
  skincare: 'Sparkles',
  style: 'Shirt',
  social: 'Users',
  mindset: 'Brain',
  body: 'Heart',
};

export const DIFFICULTY_LABELS: Record<TaskDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const DIFFICULTY_COLORS: Record<TaskDifficulty, string> = {
  beginner: 'text-green-500',
  intermediate: 'text-yellow-500',
  advanced: 'text-red-500',
};

export const FREQUENCY_LABELS: Record<TaskFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  '2-3x_weekly': '2-3x per week',
  as_needed: 'As needed',
  once: 'One time',
};

// ===========================================
// CORE TYPES
// ===========================================

export interface TaskFullDescription {
  whatToDo: string;
  whyItMatters: string;
  tipsForBeginners: string[];
  variations?: string[];
  nextLevel?: string;
}

export interface TaskTemplate {
  id: string;
  templateCode: string;
  domain: TaskDomain;
  name: string;
  shortDescription: string;
  fullDescription: TaskFullDescription;
  timeMinutes: number;
  difficulty: TaskDifficulty;
  frequency: TaskFrequency;
  requiresPrivacy: boolean;
  requiresSupplies: string[];
  prescriptionContext?: string;
  contraindications?: string[];
  minPhase: number;
  baseWeight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserTemplateHistory {
  id: string;
  userId: string;
  templateId: string;
  timesCompleted: number;
  firstCompletedAt?: string;
  lastCompletedAt?: string;
  averageRating?: number;
  totalRatings: number;
  timesPrescribed: number;
  timesSkipped: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateCompletionLog {
  id: string;
  userId: string;
  templateId: string;
  taskId?: string;
  completedAt: string;
  durationMinutes?: number;
  rating?: number;
  notes?: string;
  expandedWhyItMatters: boolean;
  expandedTips: boolean;
  completedInSession: boolean;
  sessionId?: string;
}

// ===========================================
// PRESCRIPTION TYPES
// ===========================================

export interface PrescribableTemplate extends TaskTemplate {
  timesCompleted: number;
  lastCompletedAt?: string;
  prescriptionWeight: number;
}

export interface TemplateSearchParams {
  domains?: TaskDomain[];
  difficulty?: TaskDifficulty;
  maxDifficulty?: TaskDifficulty;
  frequency?: TaskFrequency;
  requiresPrivacy?: boolean;
  maxTimeMinutes?: number;
  minPhase?: number;
  searchQuery?: string;
}

export interface PrescriptionRequest {
  userId: string;
  userPhase: number;
  domains?: TaskDomain[];
  maxDifficulty?: TaskDifficulty;
  limit?: number;
  excludeRecentDays?: number;
}

// ===========================================
// DATABASE MAPPING TYPES
// ===========================================

export interface DbTaskTemplate {
  id: string;
  template_code: string;
  domain: TaskDomain;
  name: string;
  short_description: string;
  full_description: TaskFullDescription;
  time_minutes: number;
  difficulty: TaskDifficulty;
  frequency: TaskFrequency;
  requires_privacy: boolean;
  requires_supplies: string[];
  prescription_context?: string;
  contraindications?: string[];
  min_phase: number;
  base_weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbUserTemplateHistory {
  id: string;
  user_id: string;
  template_id: string;
  times_completed: number;
  first_completed_at?: string;
  last_completed_at?: string;
  average_rating?: number;
  total_ratings: number;
  times_prescribed: number;
  times_skipped: number;
  created_at: string;
  updated_at: string;
}

export interface DbTemplateCompletionLog {
  id: string;
  user_id: string;
  template_id: string;
  task_id?: string;
  completed_at: string;
  duration_minutes?: number;
  rating?: number;
  notes?: string;
  expanded_why_it_matters: boolean;
  expanded_tips: boolean;
  completed_in_session: boolean;
  session_id?: string;
}

export interface DbPrescribableTemplate {
  template_id: string;
  template_code: string;
  domain: TaskDomain;
  name: string;
  short_description: string;
  full_description: TaskFullDescription;
  time_minutes: number;
  difficulty: TaskDifficulty;
  frequency: TaskFrequency;
  requires_privacy: boolean;
  requires_supplies: string[];
  times_completed: number;
  last_completed_at?: string;
  prescription_weight: number;
}

// ===========================================
// MAPPING FUNCTIONS
// ===========================================

export function mapDbTemplateToTemplate(db: DbTaskTemplate): TaskTemplate {
  return {
    id: db.id,
    templateCode: db.template_code,
    domain: db.domain,
    name: db.name,
    shortDescription: db.short_description,
    fullDescription: db.full_description,
    timeMinutes: db.time_minutes,
    difficulty: db.difficulty,
    frequency: db.frequency,
    requiresPrivacy: db.requires_privacy,
    requiresSupplies: db.requires_supplies,
    prescriptionContext: db.prescription_context,
    contraindications: db.contraindications,
    minPhase: db.min_phase,
    baseWeight: db.base_weight,
    isActive: db.is_active,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapDbHistoryToHistory(db: DbUserTemplateHistory): UserTemplateHistory {
  return {
    id: db.id,
    userId: db.user_id,
    templateId: db.template_id,
    timesCompleted: db.times_completed,
    firstCompletedAt: db.first_completed_at,
    lastCompletedAt: db.last_completed_at,
    averageRating: db.average_rating,
    totalRatings: db.total_ratings,
    timesPrescribed: db.times_prescribed,
    timesSkipped: db.times_skipped,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapDbPrescribableToTemplate(db: DbPrescribableTemplate): PrescribableTemplate {
  return {
    id: db.template_id,
    templateCode: db.template_code,
    domain: db.domain,
    name: db.name,
    shortDescription: db.short_description,
    fullDescription: db.full_description,
    timeMinutes: db.time_minutes,
    difficulty: db.difficulty,
    frequency: db.frequency,
    requiresPrivacy: db.requires_privacy,
    requiresSupplies: db.requires_supplies,
    minPhase: 1,
    baseWeight: 100,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    timesCompleted: db.times_completed,
    lastCompletedAt: db.last_completed_at,
    prescriptionWeight: db.prescription_weight,
  };
}

// ===========================================
// TEMPLATE HELPERS
// ===========================================

export function getTemplatesByDomain(templates: TaskTemplate[]): Record<TaskDomain, TaskTemplate[]> {
  const byDomain: Record<TaskDomain, TaskTemplate[]> = {
    voice: [],
    movement: [],
    skincare: [],
    style: [],
    social: [],
    mindset: [],
    body: [],
  };

  for (const template of templates) {
    byDomain[template.domain].push(template);
  }

  return byDomain;
}

export function filterTemplatesByPhase(templates: TaskTemplate[], phase: number): TaskTemplate[] {
  return templates.filter(t => t.minPhase <= phase);
}

export function filterTemplatesByDifficulty(
  templates: TaskTemplate[],
  maxDifficulty: TaskDifficulty
): TaskTemplate[] {
  const difficultyOrder: TaskDifficulty[] = ['beginner', 'intermediate', 'advanced'];
  const maxIndex = difficultyOrder.indexOf(maxDifficulty);

  return templates.filter(t => difficultyOrder.indexOf(t.difficulty) <= maxIndex);
}

export function getBalancedPrescription(
  templates: PrescribableTemplate[],
  count: number,
  domainBalance: boolean = true
): PrescribableTemplate[] {
  if (!domainBalance || templates.length <= count) {
    return templates.slice(0, count);
  }

  const byDomain = getTemplatesByDomain(templates as TaskTemplate[]) as Record<TaskDomain, PrescribableTemplate[]>;
  const result: PrescribableTemplate[] = [];
  const domains = Object.keys(byDomain) as TaskDomain[];

  // Round-robin selection to ensure domain balance
  let domainIndex = 0;
  while (result.length < count) {
    const domain = domains[domainIndex % domains.length];
    const domainTemplates = byDomain[domain];

    if (domainTemplates.length > 0) {
      // Take highest weighted from this domain
      const sorted = [...domainTemplates].sort((a, b) => b.prescriptionWeight - a.prescriptionWeight);
      const selected = sorted[0];
      result.push(selected);

      // Remove from pool
      byDomain[domain] = domainTemplates.filter(t => t.id !== selected.id);
    }

    domainIndex++;

    // Prevent infinite loop if we've exhausted all domains
    if (domains.every(d => byDomain[d].length === 0)) break;
  }

  return result;
}

export function formatTimeEstimate(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

export function getSuppliesDisplay(supplies: string[]): string {
  if (supplies.length === 0) return 'None';
  if (supplies.length === 1) return supplies[0];
  if (supplies.length <= 3) return supplies.join(', ');
  return `${supplies.slice(0, 2).join(', ')} +${supplies.length - 2} more`;
}
