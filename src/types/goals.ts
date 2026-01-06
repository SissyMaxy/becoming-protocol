// Goals + Drills Type System
// Core types for the goal-based training system

export type GoalStatus = 'active' | 'paused' | 'graduated' | 'abandoned';
export type Domain = 'voice' | 'movement' | 'skincare' | 'style' | 'social' | 'mindset';
export type Difficulty = 1 | 2 | 3 | 4 | 5;

// ============================================
// GOAL
// ============================================
export interface Goal {
  id: string;
  userId: string;
  name: string;
  domain: Domain | null;
  description: string | null;
  status: GoalStatus;
  startedAt: string;
  graduatedAt: string | null;
  pausedAt: string | null;
  abandonedAt: string | null;
  abandonReason: string | null;
  consecutiveDays: number;
  totalCompletions: number;
  graduationThreshold: number;
  longestStreak: number;
  covenantId: string | null;
  hasAffirmation: boolean;
  sortOrder: number;
  isSystemAssigned: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// DRILL
// ============================================
export interface Drill {
  id: string;
  goalId: string;
  name: string;
  instruction: string;
  estimatedMinutes: number | null;
  difficulty: Difficulty;
  category: string | null;
  points: number;
  affirmation: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

// ============================================
// DAILY COMPLETION
// ============================================
export interface DailyGoalCompletion {
  id: string;
  userId: string;
  goalId: string;
  drillId: string | null;
  completedDate: string;
  completedAt: string;
  notes: string | null;
  feltGood: boolean | null;
}

// ============================================
// TEMPLATES
// ============================================
export interface GoalTemplate {
  id: string;
  name: string;
  domain: Domain | null;
  description: string | null;
  graduationThreshold: number;
  priority: number;
  difficulty: Difficulty;
  active: boolean;
  createdAt: string;
}

export interface DrillTemplate {
  id: string;
  goalTemplateId: string;
  name: string;
  instruction: string;
  estimatedMinutes: number | null;
  difficulty: Difficulty;
  category: string | null;
  points: number;
  affirmation: string | null;
  sortOrder: number;
  createdAt: string;
}

// ============================================
// COMPUTED/VIEW TYPES
// ============================================
export interface TodaysGoal {
  goalId: string;
  goalName: string;
  goalDomain: Domain | null;
  goalDescription: string | null;
  consecutiveDays: number;
  graduationThreshold: number;
  graduationProgress: number;  // 0-100
  completedToday: boolean;
  drillUsedId: string | null;
  drillUsedName: string | null;
}

export interface GoalWithDrills extends Goal {
  drills: Drill[];
}

export interface TodaysGoalWithDrills extends TodaysGoal {
  drills: Drill[];
}

// ============================================
// UI STATE TYPES
// ============================================
export interface GoalCompletionInput {
  goalId: string;
  drillId: string;
  notes?: string;
  feltGood?: boolean;
}

export interface GoalAbandonInput {
  goalId: string;
  reason: string;
}

// ============================================
// DATABASE ROW TYPES (snake_case)
// ============================================
export interface DbGoal {
  id: string;
  user_id: string;
  name: string;
  domain: string | null;
  description: string | null;
  status: string;
  started_at: string;
  graduated_at: string | null;
  paused_at: string | null;
  abandoned_at: string | null;
  abandon_reason: string | null;
  consecutive_days: number;
  total_completions: number;
  graduation_threshold: number;
  longest_streak: number;
  covenant_id: string | null;
  has_affirmation: boolean;
  sort_order: number;
  is_system_assigned: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbDrill {
  id: string;
  goal_id: string;
  name: string;
  instruction: string;
  estimated_minutes: number | null;
  difficulty: number;
  category: string | null;
  points: number;
  affirmation: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface DbDailyGoalCompletion {
  id: string;
  user_id: string;
  goal_id: string;
  drill_id: string | null;
  completed_date: string;
  completed_at: string;
  notes: string | null;
  felt_good: boolean | null;
}

export interface DbGoalTemplate {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  graduation_threshold: number;
  priority: number;
  difficulty: number;
  active: boolean;
  created_at: string;
}

export interface DbDrillTemplate {
  id: string;
  goal_template_id: string;
  name: string;
  instruction: string;
  estimated_minutes: number | null;
  difficulty: number;
  category: string | null;
  points: number;
  affirmation: string | null;
  sort_order: number;
  created_at: string;
}

// ============================================
// CONVERTERS
// ============================================
export function dbGoalToGoal(db: DbGoal): Goal {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    domain: db.domain as Domain | null,
    description: db.description,
    status: db.status as GoalStatus,
    startedAt: db.started_at,
    graduatedAt: db.graduated_at,
    pausedAt: db.paused_at,
    abandonedAt: db.abandoned_at,
    abandonReason: db.abandon_reason,
    consecutiveDays: db.consecutive_days,
    totalCompletions: db.total_completions,
    graduationThreshold: db.graduation_threshold,
    longestStreak: db.longest_streak,
    covenantId: db.covenant_id,
    hasAffirmation: db.has_affirmation,
    sortOrder: db.sort_order,
    isSystemAssigned: db.is_system_assigned,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function dbDrillToDrill(db: DbDrill): Drill {
  return {
    id: db.id,
    goalId: db.goal_id,
    name: db.name,
    instruction: db.instruction,
    estimatedMinutes: db.estimated_minutes,
    difficulty: db.difficulty as Difficulty,
    category: db.category,
    points: db.points,
    affirmation: db.affirmation,
    sortOrder: db.sort_order,
    active: db.active,
    createdAt: db.created_at,
  };
}

export function dbCompletionToCompletion(db: DbDailyGoalCompletion): DailyGoalCompletion {
  return {
    id: db.id,
    userId: db.user_id,
    goalId: db.goal_id,
    drillId: db.drill_id,
    completedDate: db.completed_date,
    completedAt: db.completed_at,
    notes: db.notes,
    feltGood: db.felt_good,
  };
}

export function dbGoalTemplateToTemplate(db: DbGoalTemplate): GoalTemplate {
  return {
    id: db.id,
    name: db.name,
    domain: db.domain as Domain | null,
    description: db.description,
    graduationThreshold: db.graduation_threshold,
    priority: db.priority,
    difficulty: db.difficulty as Difficulty,
    active: db.active,
    createdAt: db.created_at,
  };
}

export function dbDrillTemplateToTemplate(db: DbDrillTemplate): DrillTemplate {
  return {
    id: db.id,
    goalTemplateId: db.goal_template_id,
    name: db.name,
    instruction: db.instruction,
    estimatedMinutes: db.estimated_minutes,
    difficulty: db.difficulty as Difficulty,
    category: db.category,
    points: db.points,
    affirmation: db.affirmation,
    sortOrder: db.sort_order,
    createdAt: db.created_at,
  };
}

// ============================================
// HELPERS
// ============================================
export function getGraduationProgress(goal: Goal): number {
  if (goal.graduationThreshold === 0) return 100;
  return Math.min(100, Math.round((goal.consecutiveDays / goal.graduationThreshold) * 100));
}

export function getDomainLabel(domain: Domain | null): string {
  if (!domain) return 'General';
  const labels: Record<Domain, string> = {
    voice: 'Voice',
    movement: 'Movement',
    skincare: 'Skincare',
    style: 'Style',
    social: 'Social',
    mindset: 'Mindset',
  };
  return labels[domain];
}

export function getDomainColor(domain: Domain | null): string {
  if (!domain) return '#8b5cf6';
  const colors: Record<Domain, string> = {
    voice: '#f472b6',      // pink
    movement: '#22c55e',   // green
    skincare: '#06b6d4',   // cyan
    style: '#a855f7',      // purple
    social: '#f59e0b',     // amber
    mindset: '#3b82f6',    // blue
  };
  return colors[domain];
}

export function getDifficultyLabel(difficulty: Difficulty): string {
  const labels: Record<Difficulty, string> = {
    1: 'Easy',
    2: 'Simple',
    3: 'Moderate',
    4: 'Challenging',
    5: 'Advanced',
  };
  return labels[difficulty];
}
