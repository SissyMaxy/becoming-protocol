import { UserProgress, DailyEntry, Domain } from '../types';

export interface PhaseRequirement {
  type: 'days' | 'streak' | 'domain_level' | 'completion_rate' | 'journal_count';
  value: number;
  domain?: Domain;
  description: string;
}

export interface PhaseDefinitionExtended {
  phase: number;
  name: string;
  description: string;
  requirements: PhaseRequirement[];
  focusDomains: Domain[];
}

// Extended phase definitions with advancement criteria
export const PHASE_REQUIREMENTS: PhaseDefinitionExtended[] = [
  {
    phase: 1,
    name: 'Foundation',
    description: 'Establishing core habits and awareness',
    requirements: [
      { type: 'days', value: 7, description: 'Complete 7 days of practice' },
      { type: 'streak', value: 3, description: 'Achieve a 3-day streak' },
      { type: 'journal_count', value: 5, description: 'Write 5 evening reflections' }
    ],
    focusDomains: ['skincare', 'mindset', 'movement']
  },
  {
    phase: 2,
    name: 'Expression',
    description: 'Developing voice and personal style',
    requirements: [
      { type: 'days', value: 21, description: 'Complete 21 total days' },
      { type: 'streak', value: 7, description: 'Achieve a 7-day streak' },
      { type: 'domain_level', value: 3, domain: 'voice', description: 'Reach Voice level 3' },
      { type: 'domain_level', value: 3, domain: 'skincare', description: 'Reach Skincare level 3' }
    ],
    focusDomains: ['voice', 'style', 'social']
  },
  {
    phase: 3,
    name: 'Integration',
    description: 'Bringing it all together naturally',
    requirements: [
      { type: 'days', value: 45, description: 'Complete 45 total days' },
      { type: 'streak', value: 14, description: 'Achieve a 14-day streak' },
      { type: 'domain_level', value: 5, domain: 'voice', description: 'Reach Voice level 5' },
      { type: 'domain_level', value: 4, domain: 'movement', description: 'Reach Movement level 4' },
      { type: 'completion_rate', value: 70, description: 'Maintain 70% average completion' }
    ],
    focusDomains: ['voice', 'movement', 'social', 'style']
  },
  {
    phase: 4,
    name: 'Embodiment',
    description: 'Living authentically',
    requirements: [
      { type: 'days', value: 90, description: 'Complete 90 total days' },
      { type: 'streak', value: 21, description: 'Achieve a 21-day streak' },
      { type: 'domain_level', value: 6, domain: 'voice', description: 'Reach Voice level 6' },
      { type: 'domain_level', value: 6, domain: 'movement', description: 'Reach Movement level 6' },
      { type: 'completion_rate', value: 75, description: 'Maintain 75% average completion' }
    ],
    focusDomains: ['voice', 'movement', 'skincare', 'style', 'social', 'mindset', 'body']
  }
];

export interface RequirementStatus {
  requirement: PhaseRequirement;
  met: boolean;
  current: number;
  target: number;
  progress: number; // 0-100
}

export interface PhaseStatus {
  currentPhase: number;
  nextPhase: number | null;
  requirements: RequirementStatus[];
  canAdvance: boolean;
  progressPercent: number;
}

// Calculate average completion rate from entries
function calculateCompletionRate(entries: DailyEntry[]): number {
  if (entries.length === 0) return 0;

  const rates = entries.map(e => {
    if (e.tasks.length === 0) return 0;
    const completed = e.tasks.filter(t => t.completed).length;
    return (completed / e.tasks.length) * 100;
  });

  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

// Count journal entries
function countJournals(entries: DailyEntry[]): number {
  return entries.filter(e => e.journal && e.journal.alignmentScore > 0).length;
}

// Check phase requirements and calculate status
export function checkPhaseStatus(
  progress: UserProgress,
  entries: DailyEntry[]
): PhaseStatus {
  const currentPhase = progress.phase.currentPhase;
  const nextPhaseIndex = PHASE_REQUIREMENTS.findIndex(p => p.phase === currentPhase + 1);
  const nextPhase = nextPhaseIndex >= 0 ? PHASE_REQUIREMENTS[nextPhaseIndex] : null;

  if (!nextPhase) {
    // Already at max phase
    return {
      currentPhase,
      nextPhase: null,
      requirements: [],
      canAdvance: false,
      progressPercent: 100
    };
  }

  const completionRate = calculateCompletionRate(entries);
  const journalCount = countJournals(entries);

  const requirementStatuses: RequirementStatus[] = nextPhase.requirements.map(req => {
    let current = 0;
    let target = req.value;
    let met = false;

    switch (req.type) {
      case 'days':
        current = progress.totalDays;
        met = current >= target;
        break;

      case 'streak':
        current = progress.longestStreak;
        met = current >= target;
        break;

      case 'domain_level':
        if (req.domain) {
          const domainProgress = progress.domainProgress.find(d => d.domain === req.domain);
          current = domainProgress?.level || 1;
          met = current >= target;
        }
        break;

      case 'completion_rate':
        current = Math.round(completionRate);
        met = current >= target;
        break;

      case 'journal_count':
        current = journalCount;
        met = current >= target;
        break;
    }

    const progressPercent = Math.min((current / target) * 100, 100);

    return {
      requirement: req,
      met,
      current,
      target,
      progress: progressPercent
    };
  });

  const metCount = requirementStatuses.filter(r => r.met).length;
  const canAdvance = requirementStatuses.every(r => r.met);
  const overallProgress = (metCount / requirementStatuses.length) * 100;

  return {
    currentPhase,
    nextPhase: nextPhase.phase,
    requirements: requirementStatuses,
    canAdvance,
    progressPercent: overallProgress
  };
}

// Get phase info with extended details
export function getPhaseInfo(phase: number): PhaseDefinitionExtended | null {
  return PHASE_REQUIREMENTS.find(p => p.phase === phase) || null;
}
