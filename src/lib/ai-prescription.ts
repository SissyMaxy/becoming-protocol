import { Domain, Intensity, ProtocolTask, TimeBlock, UserProgress, DailyEntry } from '../types';
import { UserAnalytics, analyzeUser, LEVEL_LOCK_DAYS, BASELINE_THRESHOLD_DAYS } from './analytics';
import { TASK_TEMPLATES, getDomainInfo, INTENSITY_CONFIG } from '../data/constants';
import { generateId } from './protocol';

// Extended task with tracking flags (internal use only)
interface InternalTask extends ProtocolTask {
  isBaseline?: boolean;
  isDecayPrevention?: boolean;
  isGrowthTask?: boolean;
  isProtective?: boolean;
  isRecoveryTask?: boolean;
}

export interface PrescriptionContext {
  mode: 'build' | 'protect' | 'recover';
  modeReasoning: string;
  intensity: Intensity;
  analytics: UserAnalytics;
  progress: UserProgress;
}

export interface Prescription {
  tasks: ProtocolTask[];
  note: string;
  mode: 'build' | 'protect' | 'recover';
  reasoning: string;
  warnings: string[];
  celebrations: string[];
}

// Anti-slip: Always include baseline domains
function getBaselineTasks(
  analytics: UserAnalytics,
  intensity: Intensity
): InternalTask[] {
  const tasks: InternalTask[] = [];
  const baselineDomains = analytics.domainStats.filter(d => d.isBaseline);

  baselineDomains.forEach(domainStat => {
    const domainTasks = TASK_TEMPLATES.filter(t => t.domain === domainStat.domain);
    if (domainTasks.length > 0) {
      const template = domainTasks[Math.floor(Math.random() * domainTasks.length)];
      const multiplier = INTENSITY_CONFIG[intensity].multiplier;

      tasks.push({
        id: generateId(),
        domain: template.domain as Domain,
        title: template.title,
        description: template.description,
        timeBlock: template.timeBlock as TimeBlock,
        duration: Math.round((template.duration || 10) * multiplier),
        baseIntensity: template.baseIntensity,
        completed: false,
        isBaseline: true,
        // Copy rich content
        instructions: template.instructions,
        sensory: template.sensory,
        ambiance: template.ambiance,
        imageUrl: template.imageUrl,
        affirmation: template.affirmation,
        whyItMatters: template.whyItMatters,
        whatToNotice: template.whatToNotice,
        commonExperiences: template.commonExperiences,
      });
    }
  });

  return tasks;
}

// Anti-slip: Force neglected domains back
function getDecayPreventionTasks(
  analytics: UserAnalytics,
  intensity: Intensity,
  existingDomains: Domain[]
): InternalTask[] {
  const tasks: InternalTask[] = [];
  const multiplier = INTENSITY_CONFIG[intensity].multiplier;

  // Only add decay prevention in BUILD or PROTECT mode
  const urgentDecay = analytics.domainStats.filter(
    d => d.decayUrgency === 'urgent' && !existingDomains.includes(d.domain)
  );

  const alertDecay = analytics.domainStats.filter(
    d => d.decayUrgency === 'alert' && !existingDomains.includes(d.domain)
  );

  // Always add urgent decay domains
  urgentDecay.forEach(domainStat => {
    const domainTasks = TASK_TEMPLATES.filter(t => t.domain === domainStat.domain);
    if (domainTasks.length > 0) {
      const template = domainTasks[0];
      tasks.push({
        id: generateId(),
        domain: template.domain as Domain,
        title: template.title,
        description: `Getting back to ${getDomainInfo(domainStat.domain).label} - it's been ${domainStat.daysSincePracticed} days`,
        timeBlock: template.timeBlock as TimeBlock,
        duration: Math.round((template.duration || 10) * multiplier * 0.7),
        baseIntensity: template.baseIntensity,
        completed: false,
        isDecayPrevention: true,
        instructions: template.instructions,
        sensory: template.sensory,
        ambiance: template.ambiance,
        imageUrl: template.imageUrl,
        affirmation: template.affirmation,
        whyItMatters: template.whyItMatters,
        whatToNotice: template.whatToNotice,
        commonExperiences: template.commonExperiences,
      });
    }
  });

  // Add alert decay domains only if not in RECOVER mode
  if (intensity !== 'crazy') {
    alertDecay.slice(0, 1).forEach(domainStat => {
      const domainTasks = TASK_TEMPLATES.filter(t => t.domain === domainStat.domain);
      if (domainTasks.length > 0) {
        const template = domainTasks[0];
        tasks.push({
          id: generateId(),
          domain: template.domain as Domain,
          title: template.title,
          description: template.description,
          timeBlock: template.timeBlock as TimeBlock,
          duration: Math.round((template.duration || 10) * multiplier),
          baseIntensity: template.baseIntensity,
          completed: false,
          isDecayPrevention: true,
          instructions: template.instructions,
          sensory: template.sensory,
          ambiance: template.ambiance,
          imageUrl: template.imageUrl,
          affirmation: template.affirmation,
          whyItMatters: template.whyItMatters,
          whatToNotice: template.whatToNotice,
          commonExperiences: template.commonExperiences,
        });
      }
    });
  }

  return tasks;
}

// BUILD mode: Add growth tasks
function getBuildModeTasks(
  analytics: UserAnalytics,
  intensity: Intensity,
  existingDomains: Domain[]
): InternalTask[] {
  const tasks: InternalTask[] = [];
  const multiplier = INTENSITY_CONFIG[intensity].multiplier;

  // Find domains ready to level up - push these harder
  const readyToLevel = analytics.domainStats.filter(
    d => d.readyToLevelUp && !existingDomains.includes(d.domain)
  );

  readyToLevel.slice(0, 1).forEach(domainStat => {
    const domainTasks = TASK_TEMPLATES.filter(t => t.domain === domainStat.domain);

    if (domainTasks.length > 0) {
      const template = domainTasks[Math.floor(Math.random() * domainTasks.length)];
      tasks.push({
        id: generateId(),
        domain: template.domain as Domain,
        title: template.title,
        description: 'Pushing your edge - you\'re ready for this',
        timeBlock: template.timeBlock as TimeBlock,
        duration: Math.round((template.duration || 10) * multiplier * 1.2),
        baseIntensity: template.baseIntensity,
        completed: false,
        isGrowthTask: true,
        instructions: template.instructions,
        sensory: template.sensory,
        ambiance: template.ambiance,
        imageUrl: template.imageUrl,
        affirmation: template.affirmation,
        whyItMatters: template.whyItMatters,
        whatToNotice: template.whatToNotice,
        commonExperiences: template.commonExperiences,
      });
    }
  });

  // Add tasks from strong domains to maintain momentum
  const strongDomains = analytics.domainStats.filter(
    d => d.completionRate14d >= 85 && !existingDomains.includes(d.domain)
  );

  strongDomains.slice(0, 2).forEach(domainStat => {
    const domainTasks = TASK_TEMPLATES.filter(t => t.domain === domainStat.domain);
    if (domainTasks.length > 0) {
      const template = domainTasks[Math.floor(Math.random() * domainTasks.length)];
      tasks.push({
        id: generateId(),
        domain: template.domain as Domain,
        title: template.title,
        description: template.description,
        timeBlock: template.timeBlock as TimeBlock,
        duration: Math.round((template.duration || 10) * multiplier),
        baseIntensity: template.baseIntensity,
        completed: false,
        instructions: template.instructions,
        sensory: template.sensory,
        ambiance: template.ambiance,
        imageUrl: template.imageUrl,
        affirmation: template.affirmation,
        whyItMatters: template.whyItMatters,
        whatToNotice: template.whatToNotice,
        commonExperiences: template.commonExperiences,
      });
    }
  });

  return tasks;
}

// PROTECT mode: Minimal essential tasks
function getProtectModeTasks(
  analytics: UserAnalytics,
  intensity: Intensity,
  existingDomains: Domain[]
): InternalTask[] {
  const tasks: InternalTask[] = [];
  const multiplier = INTENSITY_CONFIG[intensity].multiplier * 0.8;

  // Only include established habits from top 3 strongest domains
  const topDomains = analytics.domainStats
    .filter(d => d.completionRate14d >= 70 && !existingDomains.includes(d.domain))
    .sort((a, b) => b.consecutiveDays - a.consecutiveDays)
    .slice(0, 3);

  topDomains.forEach(domainStat => {
    const domainTasks = TASK_TEMPLATES.filter(t => t.domain === domainStat.domain);
    if (domainTasks.length > 0) {
      const template = domainTasks.sort((a, b) => (a.duration || 10) - (b.duration || 10))[0];
      tasks.push({
        id: generateId(),
        domain: template.domain as Domain,
        title: template.title,
        description: 'Keep the thread alive',
        timeBlock: template.timeBlock as TimeBlock,
        duration: Math.round((template.duration || 10) * multiplier),
        baseIntensity: template.baseIntensity,
        completed: false,
        isProtective: true,
        instructions: template.instructions,
        sensory: template.sensory,
        ambiance: template.ambiance,
        imageUrl: template.imageUrl,
        affirmation: template.affirmation,
        whyItMatters: template.whyItMatters,
        whatToNotice: template.whatToNotice,
        commonExperiences: template.commonExperiences,
      });
    }
  });

  return tasks;
}

// RECOVER mode: Easy re-entry tasks
function getRecoverModeTasks(
  analytics: UserAnalytics,
  _intensity: Intensity
): InternalTask[] {
  const tasks: InternalTask[] = [];
  const multiplier = 0.6; // Very light

  // Start with the strongest domain - guaranteed win
  const strongestDomain = analytics.domainStats
    .sort((a, b) => b.completionRate14d - a.completionRate14d)[0];

  if (strongestDomain) {
    const domainTasks = TASK_TEMPLATES.filter(t => t.domain === strongestDomain.domain);
    if (domainTasks.length > 0) {
      const template = domainTasks.sort((a, b) => (a.duration || 10) - (b.duration || 10))[0];
      tasks.push({
        id: generateId(),
        domain: template.domain as Domain,
        title: template.title,
        description: 'Start here - you know this one',
        timeBlock: 'morning' as TimeBlock,
        duration: Math.round((template.duration || 10) * multiplier),
        baseIntensity: template.baseIntensity,
        completed: false,
        isRecoveryTask: true,
        instructions: template.instructions,
        sensory: template.sensory,
        ambiance: template.ambiance,
        imageUrl: template.imageUrl,
        affirmation: template.affirmation,
        whyItMatters: template.whyItMatters,
        whatToNotice: template.whatToNotice,
        commonExperiences: template.commonExperiences,
      });
    }
  }

  // Add 1-2 more easy tasks from different domains
  const otherDomains = analytics.domainStats
    .filter(d => d.domain !== strongestDomain?.domain)
    .sort((a, b) => b.completionRate14d - a.completionRate14d)
    .slice(0, 2);

  otherDomains.forEach(domainStat => {
    const domainTasks = TASK_TEMPLATES.filter(t => t.domain === domainStat.domain);
    if (domainTasks.length > 0) {
      const template = domainTasks.sort((a, b) => (a.duration || 10) - (b.duration || 10))[0];
      tasks.push({
        id: generateId(),
        domain: template.domain as Domain,
        title: template.title,
        description: template.description,
        timeBlock: template.timeBlock as TimeBlock,
        duration: Math.round((template.duration || 10) * multiplier),
        baseIntensity: template.baseIntensity,
        completed: false,
        isRecoveryTask: true,
        instructions: template.instructions,
        sensory: template.sensory,
        ambiance: template.ambiance,
        imageUrl: template.imageUrl,
        affirmation: template.affirmation,
        whyItMatters: template.whyItMatters,
        whatToNotice: template.whatToNotice,
        commonExperiences: template.commonExperiences,
      });
    }
  });

  return tasks;
}

// Generate prescription note based on mode and context
function generatePrescriptionNote(context: PrescriptionContext): string {
  const { mode, analytics, intensity } = context;

  if (mode === 'recover') {
    const daysAway = analytics.currentStreak === 0 ?
      'some time' :
      `${analytics.domainStats.reduce((max, d) => Math.max(max, d.daysSincePracticed), 0)} days`;

    const strongestDomain = analytics.domainStats
      .sort((a, b) => b.completionRate14d - a.completionRate14d)[0];

    return `Welcome back. ${daysAway} away - that happens. Today isn't about catching up, it's about one good day. Start with ${getDomainInfo(strongestDomain.domain).label.toLowerCase()}. You know that one. Let's go.`;
  }

  if (mode === 'protect') {
    const streakText = analytics.currentStreak > 7 ?
      `Your ${analytics.currentStreak}-day streak is on the line.` :
      'I see you. Busy week, alignment dipping.';

    return `${streakText} Today is about keeping the thread - just the essentials. We protect what you've built.`;
  }

  // BUILD mode
  const readyToLevel = analytics.domainStats.filter(d => d.readyToLevelUp);

  if (readyToLevel.length > 0) {
    const domain = readyToLevel[0];
    return `You've nailed ${getDomainInfo(domain.domain).label.toLowerCase()} for ${domain.consecutiveDays} days straight. Today I'm pushing that edge. Trust yourself.`;
  }

  if (analytics.alignment.trend === 'rising') {
    return `Alignment rising, streak solid. You're in flow. Let's build on this momentum.`;
  }

  if (intensity === 'spacious') {
    return `Full protocol today. Time to invest in yourself. Every task is an opportunity.`;
  }

  return `Good foundation. Steady progress. Keep showing up.`;
}

// Generate warnings based on analytics
function generateWarnings(analytics: UserAnalytics): string[] {
  const warnings: string[] = [];

  // Streak warning
  if (analytics.streakStatus === 'at_risk') {
    warnings.push(`Your ${analytics.currentStreak}-day streak is at risk. Focus on completing today's essentials.`);
  }

  // Domain decay warnings
  analytics.domainStats
    .filter(d => d.decayUrgency === 'urgent')
    .forEach(d => {
      warnings.push(`${getDomainInfo(d.domain).label} is fading - ${d.daysSincePracticed} days since practice. Today we bring it back.`);
    });

  // Alignment warning
  if (analytics.alignment.trend === 'falling' && analytics.alignment.avg7d < 5) {
    warnings.push(`Alignment has been dropping. Consider what's getting in the way.`);
  }

  return warnings;
}

// Generate celebrations based on analytics
function generateCelebrations(analytics: UserAnalytics): string[] {
  const celebrations: string[] = [];

  // Streak milestones
  if ([7, 14, 21, 30, 60, 90].includes(analytics.currentStreak)) {
    celebrations.push(`${analytics.currentStreak} days! This streak is building something real.`);
  }

  // New baseline domains
  analytics.domainStats
    .filter(d => d.consecutiveDays === BASELINE_THRESHOLD_DAYS)
    .forEach(d => {
      celebrations.push(`${getDomainInfo(d.domain).label} is now a baseline habit! 14 days of consistency.`);
    });

  // Ready to level up
  analytics.domainStats
    .filter(d => d.readyToLevelUp)
    .forEach(d => {
      celebrations.push(`${getDomainInfo(d.domain).label} is ready to level up! Keep pushing.`);
    });

  // High alignment
  if (analytics.alignment.avg7d >= 8) {
    celebrations.push(`Your alignment this week has been exceptional. You're in tune with yourself.`);
  }

  return celebrations;
}

// Main prescription generation function
export function generatePrescription(
  progress: UserProgress,
  entries: DailyEntry[],
  intensity: Intensity,
  levelLocks: Record<string, string> = {}
): Prescription {
  // Run analytics
  const analytics = analyzeUser(progress, entries, levelLocks);

  const context: PrescriptionContext = {
    mode: analytics.recommendedMode,
    modeReasoning: analytics.modeReasoning,
    intensity,
    analytics,
    progress
  };

  let tasks: InternalTask[] = [];
  const existingDomains: Domain[] = [];

  // Step 1: Always include baseline tasks (anti-slip mechanism)
  const baselineTasks = getBaselineTasks(analytics, intensity);
  tasks.push(...baselineTasks);
  baselineTasks.forEach(t => existingDomains.push(t.domain));

  // Step 2: Add decay prevention tasks (anti-slip mechanism)
  if (analytics.recommendedMode !== 'recover') {
    const decayTasks = getDecayPreventionTasks(analytics, intensity, existingDomains);
    tasks.push(...decayTasks);
    decayTasks.forEach(t => existingDomains.push(t.domain));
  }

  // Step 3: Mode-specific tasks
  switch (analytics.recommendedMode) {
    case 'build':
      const buildTasks = getBuildModeTasks(analytics, intensity, existingDomains);
      tasks.push(...buildTasks);
      break;

    case 'protect':
      const protectTasks = getProtectModeTasks(analytics, intensity, existingDomains);
      tasks.push(...protectTasks);
      break;

    case 'recover':
      // In recover mode, start fresh with minimal tasks
      tasks = getRecoverModeTasks(analytics, intensity);
      break;
  }

  // Step 4: Apply intensity cap
  const maxTasks = intensity === 'crazy' ? 4 :
    intensity === 'normal' ? 7 :
      12;

  if (tasks.length > maxTasks) {
    // Prioritize: baseline > decay prevention > mode-specific
    const baseline = tasks.filter(t => t.isBaseline);
    const decay = tasks.filter(t => t.isDecayPrevention);
    const others = tasks.filter(t => !t.isBaseline && !t.isDecayPrevention);

    tasks = [
      ...baseline.slice(0, Math.min(baseline.length, Math.ceil(maxTasks / 2))),
      ...decay.slice(0, Math.min(decay.length, 2)),
      ...others.slice(0, maxTasks - baseline.length - Math.min(decay.length, 2))
    ].slice(0, maxTasks);
  }

  // Step 5: Balance time blocks
  const morningTasks = tasks.filter(t => t.timeBlock === 'morning');
  const eveningTasks = tasks.filter(t => t.timeBlock === 'evening');

  // Redistribute if too unbalanced
  if (morningTasks.length === 0 && tasks.length > 0) {
    tasks[0].timeBlock = 'morning';
  }
  if (eveningTasks.length === 0 && tasks.length > 2) {
    tasks[tasks.length - 1].timeBlock = 'evening';
  }

  // Strip internal flags and return clean tasks
  const cleanTasks: ProtocolTask[] = tasks.map(({ isBaseline, isDecayPrevention, isGrowthTask, isProtective, isRecoveryTask, ...task }) => task);

  return {
    tasks: cleanTasks,
    note: generatePrescriptionNote(context),
    mode: analytics.recommendedMode,
    reasoning: analytics.modeReasoning,
    warnings: generateWarnings(analytics),
    celebrations: generateCelebrations(analytics)
  };
}

// Check if a level should be locked (called after level up)
export function createLevelLock(domain: Domain): { domain: Domain; lockedUntil: string } {
  const lockDate = new Date();
  lockDate.setDate(lockDate.getDate() + LEVEL_LOCK_DAYS);

  return {
    domain,
    lockedUntil: lockDate.toISOString().split('T')[0]
  };
}

// Check phase regression criteria (requires sustained failure)
export function checkPhaseRegression(
  _progress: UserProgress,
  analytics: UserAnalytics
): { shouldRegress: boolean; reason?: string } {
  // Phase regression requires:
  // 1. Missed 5+ days in last 14
  // 2. AND alignment average below 4
  // 3. AND multiple domains showing decay

  const missedDays = 14 - analytics.domainStats.reduce(
    (max, d) => Math.max(max, d.consecutiveDays),
    0
  );

  const lowAlignment = analytics.alignment.avg14d < 4;
  const multipleDecay = analytics.domainsAtRisk.length >= 3;

  if (missedDays >= 5 && lowAlignment && multipleDecay) {
    return {
      shouldRegress: true,
      reason: `${missedDays} missed days, alignment at ${analytics.alignment.avg14d.toFixed(1)}, ${analytics.domainsAtRisk.length} domains fading. Consider stepping back to rebuild foundation.`
    };
  }

  return { shouldRegress: false };
}
