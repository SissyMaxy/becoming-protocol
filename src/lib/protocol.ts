import { Intensity, ProtocolTask, TimeBlock, DailyEntry } from '../types';
import { TASK_TEMPLATES, TaskTemplate, INTENSITY_CONFIG } from '../data/constants';

// Generate a unique UUID
export function generateId(): string {
  return crypto.randomUUID();
}

// Get today's date in ISO format (local timezone)
export function getTodayDate(): string {
  return getLocalDateString(new Date());
}

// Get local date string from any Date object (YYYY-MM-DD format)
// Use this instead of toISOString().split('T')[0] to avoid UTC conversion
export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get yesterday's date in local timezone
export function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalDateString(yesterday);
}

// Format date for display
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

// Format date short
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

// Check if a task should be included based on intensity
// crazy = busy day (fewest tasks), spacious = full protocol (all tasks)
function shouldIncludeTask(template: TaskTemplate, intensity: Intensity): boolean {
  const intensityOrder: Intensity[] = ['crazy', 'normal', 'spacious'];
  const taskLevel = intensityOrder.indexOf(template.baseIntensity);
  const selectedLevel = intensityOrder.indexOf(intensity);

  return taskLevel <= selectedLevel;
}

// Generate tasks for a given intensity
export function generateProtocolTasks(intensity: Intensity, currentPhase: number = 1): ProtocolTask[] {
  const applicableTemplates = TASK_TEMPLATES.filter(template => {
    // Check intensity
    if (!shouldIncludeTask(template, intensity)) return false;

    // Check phase requirement
    if (template.phase && template.phase > currentPhase) return false;

    return true;
  });

  // Scale duration based on intensity
  const multiplier = INTENSITY_CONFIG[intensity].multiplier;

  return applicableTemplates.map(template => ({
    id: `${template.id}-${generateId()}`,
    title: template.title,
    description: template.description,
    domain: template.domain,
    timeBlock: template.timeBlock,
    duration: template.duration ? Math.round(template.duration * multiplier) : undefined,
    baseIntensity: template.baseIntensity,
    completed: false,
    // Rich content fields
    instructions: template.instructions,
    sensory: template.sensory,
    ambiance: template.ambiance,
    imageUrl: template.imageUrl,
    affirmation: template.affirmation
  }));
}

// Create a new daily entry
export function createDailyEntry(intensity: Intensity, currentPhase: number = 1): DailyEntry {
  const now = new Date().toISOString();
  const date = getTodayDate();

  return {
    id: generateId(),
    date,
    intensity,
    tasks: generateProtocolTasks(intensity, currentPhase),
    createdAt: now,
    updatedAt: now
  };
}

// Group tasks by time block
export function groupTasksByTimeBlock(tasks: ProtocolTask[]): Record<TimeBlock, ProtocolTask[]> {
  return {
    morning: tasks.filter(t => t.timeBlock === 'morning'),
    day: tasks.filter(t => t.timeBlock === 'day'),
    evening: tasks.filter(t => t.timeBlock === 'evening')
  };
}

// Calculate completion percentage
export function calculateCompletionPercentage(tasks: ProtocolTask[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.completed).length;
  return Math.round((completed / tasks.length) * 100);
}

// Calculate total duration
export function calculateTotalDuration(tasks: ProtocolTask[]): number {
  return tasks.reduce((sum, task) => sum + (task.duration || 0), 0);
}

// Calculate completed duration
export function calculateCompletedDuration(tasks: ProtocolTask[]): number {
  return tasks
    .filter(t => t.completed)
    .reduce((sum, task) => sum + (task.duration || 0), 0);
}

// Get tasks count summary
export function getTasksSummary(tasks: ProtocolTask[]) {
  const byTimeBlock = groupTasksByTimeBlock(tasks);

  return {
    total: tasks.length,
    completed: tasks.filter(t => t.completed).length,
    morning: {
      total: byTimeBlock.morning.length,
      completed: byTimeBlock.morning.filter(t => t.completed).length
    },
    day: {
      total: byTimeBlock.day.length,
      completed: byTimeBlock.day.filter(t => t.completed).length
    },
    evening: {
      total: byTimeBlock.evening.length,
      completed: byTimeBlock.evening.filter(t => t.completed).length
    }
  };
}

// Check if it's a new day compared to last entry
export function isNewDay(lastEntryDate: string | undefined): boolean {
  if (!lastEntryDate) return true;
  return lastEntryDate !== getTodayDate();
}

// Check if entry has journal
export function hasJournal(entry: DailyEntry | null): boolean {
  return !!(entry?.journal && entry.journal.alignmentScore > 0);
}

// Get time of day
export function getCurrentTimeBlock(): TimeBlock {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}
