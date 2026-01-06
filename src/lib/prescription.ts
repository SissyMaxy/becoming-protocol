import { DailyEntry, Domain, Intensity, ProtocolTask, UserProgress } from '../types';
import { TASK_TEMPLATES, TaskTemplate, DOMAINS } from '../data/constants';
import { generateId } from './protocol';

interface DomainAnalysis {
  domain: Domain;
  daysSinceActive: number;
  level: number;
  streak: number;
  needsAttention: boolean;
  weight: number; // Higher = more likely to be included
}

interface PrescriptionContext {
  progress: UserProgress;
  recentEntries: DailyEntry[]; // Last 7 days
  currentPhase: number;
  intensity: Intensity;
}

// Analyze each domain to determine prescription weights
function analyzeDomains(context: PrescriptionContext): DomainAnalysis[] {
  const today = new Date();

  return DOMAINS.map(d => {
    const domainProgress = context.progress.domainProgress.find(dp => dp.domain === d.domain);
    const level = domainProgress?.level || 1;
    const streak = domainProgress?.currentStreak || 0;

    // Calculate days since last active in this domain
    let daysSinceActive = 7; // Default to a week if never done
    if (domainProgress?.lastActiveDate) {
      const lastActive = new Date(domainProgress.lastActiveDate);
      daysSinceActive = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Calculate attention score
    // Higher score = needs more attention
    let weight = 1;

    // Recency boost: domains not practiced recently get higher weight
    if (daysSinceActive >= 3) weight += 2;
    else if (daysSinceActive >= 2) weight += 1;

    // Gap boost: lower level domains get priority
    if (level <= 2) weight += 2;
    else if (level <= 4) weight += 1;

    // Streak protection: don't let active streaks die
    if (streak > 0 && daysSinceActive === 1) weight += 1;

    // Broken streak recovery
    if (streak === 0 && domainProgress?.longestStreak && domainProgress.longestStreak > 3) {
      weight += 1; // Encourage rebuilding lost streaks
    }

    const needsAttention = daysSinceActive >= 2 || level <= 2;

    return {
      domain: d.domain,
      daysSinceActive,
      level,
      streak,
      needsAttention,
      weight
    };
  });
}

// Get tasks unlocked at a specific level
function getUnlockedTasks(templates: TaskTemplate[], domainLevel: number, phase: number): TaskTemplate[] {
  return templates.filter(t => {
    // Check phase requirement
    if (t.phase && t.phase > phase) return false;

    // Level-based unlocking (tasks can have optional level requirement)
    const taskLevel = (t as TaskTemplate & { minLevel?: number }).minLevel || 1;
    if (taskLevel > domainLevel) return false;

    return true;
  });
}

// Smart task selection based on prescription context
export function generatePrescribedTasks(context: PrescriptionContext): ProtocolTask[] {
  const domainAnalysis = analyzeDomains(context);
  const selectedTasks: ProtocolTask[] = [];

  // Intensity determines how many tasks per domain
  const tasksPerDomain = {
    crazy: 1,    // Busy day - just essentials
    normal: 2,   // Balanced
    spacious: 3  // Full protocol
  };

  const maxTasksPerDomain = tasksPerDomain[context.intensity];

  // Sort domains by weight (highest priority first)
  const sortedDomains = [...domainAnalysis].sort((a, b) => b.weight - a.weight);

  // For each domain, select appropriate tasks
  for (const analysis of sortedDomains) {
    const domainTemplates = TASK_TEMPLATES.filter(t => t.domain === analysis.domain);
    const unlockedTemplates = getUnlockedTasks(domainTemplates, analysis.level, context.currentPhase);

    // Filter by intensity
    const intensityOrder: Intensity[] = ['crazy', 'normal', 'spacious'];
    const selectedIntensityLevel = intensityOrder.indexOf(context.intensity);

    const applicableTemplates = unlockedTemplates.filter(t => {
      const taskLevel = intensityOrder.indexOf(t.baseIntensity);
      return taskLevel <= selectedIntensityLevel;
    });

    // Prioritize tasks based on analysis
    let prioritizedTemplates = [...applicableTemplates];

    // If domain needs attention, include more foundational tasks
    if (analysis.needsAttention) {
      prioritizedTemplates.sort((a, b) => {
        // Prefer essential tasks for neglected domains
        const aIsEssential = a.baseIntensity === 'crazy';
        const bIsEssential = b.baseIntensity === 'crazy';
        if (aIsEssential && !bIsEssential) return -1;
        if (!aIsEssential && bIsEssential) return 1;
        return 0;
      });
    }

    // Select tasks up to the limit
    const selected = prioritizedTemplates.slice(0, maxTasksPerDomain);

    for (const template of selected) {
      selectedTasks.push({
        id: generateId(),
        title: template.title,
        description: template.description,
        domain: template.domain,
        timeBlock: template.timeBlock,
        duration: template.duration,
        baseIntensity: template.baseIntensity,
        completed: false
      });
    }
  }

  return selectedTasks;
}

// Generate prescription insights for the user
export function generatePrescriptionInsights(context: PrescriptionContext): string[] {
  const analysis = analyzeDomains(context);
  const insights: string[] = [];

  // Find neglected domains
  const neglected = analysis.filter(a => a.daysSinceActive >= 3);
  if (neglected.length > 0) {
    const domainNames = neglected.map(n => {
      const info = DOMAINS.find(d => d.domain === n.domain);
      return info?.label || n.domain;
    });
    insights.push(`Focus areas today: ${domainNames.join(', ')}`);
  }

  // Streak alerts
  const atRiskStreaks = analysis.filter(a => a.streak > 2 && a.daysSinceActive === 1);
  if (atRiskStreaks.length > 0) {
    const names = atRiskStreaks.map(a => {
      const info = DOMAINS.find(d => d.domain === a.domain);
      return `${info?.label} (${a.streak} days)`;
    });
    insights.push(`Protect your streaks: ${names.join(', ')}`);
  }

  // Level up opportunities
  const closeToLevelUp = analysis.filter(a => {
    // Simplified: if they're active, encourage them
    return a.streak >= 5 && a.level < 10;
  });
  if (closeToLevelUp.length > 0) {
    const name = DOMAINS.find(d => d.domain === closeToLevelUp[0].domain)?.label;
    insights.push(`${name} is growing strong — keep it up!`);
  }

  return insights;
}
