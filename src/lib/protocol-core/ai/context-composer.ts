/**
 * Context Composer
 *
 * Builds AI context by asking relevant modules for their state.
 * Each operation type determines which modules are relevant and what tier of detail.
 */

import type { ModuleRegistry } from '../module-interface';
import type { ContextTier } from '../module-interface';
import type { OperationType } from './system-prompts';
import type { CorruptionSnapshot } from '../../../types/corruption';

// ============================================
// LIFESTYLE CONTEXT (non-module data)
// ============================================

export interface LifestyleContext {
  corruption?: CorruptionSnapshot;
  exercise?: {
    currentStreakWeeks: number;
    sessionsThisWeek: number;
    totalSessions: number;
    gymGateUnlocked: boolean;
    lastSessionAt: string | null;
    lastSessionType: string | null;
    measurements?: {
      hips: number;
      waist: number;
      ratio: number;
    };
  };
  protein?: {
    yesterdayCount: number;
    weekAverage: number;
  };
  ambient?: {
    activeScents: string[];
    signatureScent: string | null;
    wigCount: number;
    primaryWig: string | null;
    activeAnchors: string[];
    anchorInvestment: number;
    microTasksToday: number;
    microTasksTarget: number;
    microTaskWeeklyRate: number;
  };
}

// ============================================
// MODULE RELEVANCE BY OPERATION
// ============================================

/**
 * Which modules should contribute context for each operation type
 */
const MODULE_RELEVANCE: Record<OperationType, string[]> = {
  base: ['identity', 'coercion', 'vault', 'switch'],

  task_enhancement: ['identity', 'gina'],

  coercion: ['coercion', 'vault', 'switch', 'identity'],

  vault_threat: ['vault', 'coercion', 'switch', 'identity'],

  brainwashing: ['identity', 'coercion', 'vault'],

  partner_management: ['partner', 'identity', 'vault'],

  narration: ['identity', 'partner', 'findom', 'vault'],

  findom: ['findom', 'identity', 'vault'],

  warmth: ['identity', 'coercion'],

  morning_briefing: [
    'identity',
    'coercion',
    'gina',
    'voice-domain',
    'movement-domain',
    'skincare-domain',
    'style-domain',
    'social-domain',
    'mindset-domain',
    'body-domain',
  ],

  evening_review: [
    'identity',
    'coercion',
    'vault',
    'partner',
    'findom',
  ],

  crisis_intervention: ['identity'],

  commitment_extraction: ['vault', 'identity', 'coercion'],

  dissonance_attack: ['identity', 'coercion', 'vault'],

  anchor_destruction: ['identity', 'vault', 'coercion'],

  structured_decision: ['coercion', 'identity', 'vault', 'switch'],

  gina_tactical: ['gina', 'identity'],
};

/**
 * Context tier by operation type
 */
const CONTEXT_TIERS: Record<OperationType, ContextTier> = {
  base: 'standard',
  task_enhancement: 'minimal',
  coercion: 'standard',
  vault_threat: 'full',
  brainwashing: 'full',
  partner_management: 'standard',
  narration: 'full',
  findom: 'standard',
  warmth: 'minimal',
  morning_briefing: 'standard',
  evening_review: 'standard',
  crisis_intervention: 'minimal',
  commitment_extraction: 'standard',
  dissonance_attack: 'full',
  anchor_destruction: 'full',
  structured_decision: 'standard',
  gina_tactical: 'standard',
};

// ============================================
// CONTEXT COMPOSER CLASS
// ============================================

export class ContextComposer {
  constructor(private registry: ModuleRegistry) {}

  /**
   * Compose context for an AI operation
   */
  composeContext(operation: OperationType, additionalContext?: string): string {
    const relevantModules = MODULE_RELEVANCE[operation] || [];
    const tier = CONTEXT_TIERS[operation] || 'standard';

    // Get context from each relevant module
    const moduleContexts: string[] = [];

    for (const moduleName of relevantModules) {
      const module = this.registry.get(moduleName);
      if (module) {
        try {
          const ctx = module.getContext(tier);
          if (ctx && ctx.trim()) {
            moduleContexts.push(`[${moduleName.toUpperCase()}]\n${ctx}`);
          }
        } catch (error) {
          console.error(`[ContextComposer] Error getting context from ${moduleName}:`, error);
        }
      }
    }

    // Build composed context
    let composed = moduleContexts.join('\n\n');

    // Add additional context if provided
    if (additionalContext) {
      composed += `\n\n[ADDITIONAL CONTEXT]\n${additionalContext}`;
    }

    return composed;
  }

  /**
   * Compose minimal context (cheap operations)
   */
  composeMinimalContext(): string {
    const essentialModules = ['identity', 'coercion'];
    const contexts: string[] = [];

    for (const moduleName of essentialModules) {
      const module = this.registry.get(moduleName);
      if (module) {
        const ctx = module.getContext('minimal');
        if (ctx) {
          contexts.push(ctx);
        }
      }
    }

    return contexts.join(' | ');
  }

  /**
   * Compose full strategic context (expensive but comprehensive)
   */
  composeStrategicContext(): string {
    const allModules = this.registry.getAll();
    const contexts: string[] = [];

    for (const module of allModules) {
      try {
        const ctx = module.getContext('full');
        if (ctx && ctx.trim()) {
          contexts.push(`=== ${module.name.toUpperCase()} ===\n${ctx}`);
        }
      } catch (error) {
        console.error(`[ContextComposer] Error getting context from ${module.name}:`, error);
      }
    }

    return contexts.join('\n\n');
  }

  /**
   * Build the complete coach context (Feature 43 format)
   */
  buildCoachContext(lifestyle?: LifestyleContext): string {
    const vaultModule = this.registry.get('vault');
    const switchModule = this.registry.get('switch');
    const findomModule = this.registry.get('findom');
    const partnerModule = this.registry.get('partner');
    const identityModule = this.registry.get('identity');
    const coercionModule = this.registry.get('coercion');
    const ginaModule = this.registry.get('gina');

    const vaultState = vaultModule?.getState() as Record<string, unknown> || {};
    const switchState = switchModule?.getState() as Record<string, unknown> || {};
    const findomState = findomModule?.getState() as Record<string, unknown> || {};
    const partnerState = partnerModule?.getState() as Record<string, unknown> || {};
    const identityState = identityModule?.getState() as Record<string, unknown> || {};
    const coercionState = coercionModule?.getState() as Record<string, unknown> || {};
    const ginaState = ginaModule?.getState() as Record<string, unknown> || {};

    // Build vault summary
    const vaultItems = (vaultState.items as unknown[]) || [];
    const vaultTiers = this.countByTier(vaultItems);
    const unknownCount = vaultItems.filter((i: unknown) =>
      (i as Record<string, unknown>).visibilityStatus === 'unknown'
    ).length;

    // Build switch summary
    const armed = switchState.armed ?? false;
    const triggerDays = switchState.triggerDays ?? 0;
    const silenceDays = switchState.silenceDays ?? 0;
    const totalLost = switchState.totalLost ?? 0;

    // Build findom summary
    const monthlyIncome = findomState.monthlyIncome ?? 0;
    const lifetimeEarnings = findomState.lifetimeEarnings ?? 0;
    const dependencyRatio = findomState.dependencyRatio ?? 0;
    const cashPigs = (findomState.cashPigs as unknown[]) || [];

    // Build partner summary
    const partners = (partnerState.partners as unknown[]) || [];
    const selfInitiated = partnerState.selfInitiatedCount ?? 0;

    // Build identity summary
    const brainwashingStage = identityState.brainwashingStage ?? 'unknown';
    const maxyRatio = Number(identityState.maxyReferenceRatio ?? 0);
    const davidRatio = 100 - maxyRatio;
    const handlerAttachment = identityState.handlerAttachment ?? 0;
    const warmthPosition = identityState.warmthCyclePosition ?? 'neutral';
    const daysSinceWarmth = identityState.daysSinceWarmth ?? 0;

    // Build coercion summary
    const activeEpisodes = (coercionState.activeEpisodes as unknown[]) || [];
    const complianceRate = coercionState.complianceRate ?? 0;

    // Build Gina summary
    const emergenceStage = ginaState.emergenceStage ?? 0;
    const disclosureReadiness = ginaState.disclosureReadiness ?? 0;

    return `=== COACH CONTEXT ===

VAULT: ${vaultItems.length} items | Unknown: ${unknownCount} | T1:${vaultTiers[1]} T2:${vaultTiers[2]} T3:${vaultTiers[3]} T4:${vaultTiers[4]} T5:${vaultTiers[5]}
Compliance rate under threat: ${complianceRate}%

SWITCH: Armed: ${armed} | Trigger: ${triggerDays}d | Silence: ${silenceDays}d | Lost: $${totalLost}

FINDOM:
Monthly income: $${monthlyIncome} | Lifetime: $${lifetimeEarnings}
Cash pigs: ${cashPigs.map((p: unknown) => {
  const pig = p as Record<string, unknown>;
  return `${pig.alias} $${pig.totalTributed}`;
}).join(', ') || 'None'}
Dependency ratio: ${dependencyRatio}% of lifestyle funded by Maxy

PARTNERS:
${partners.map((p: unknown) => {
  const partner = p as Record<string, unknown>;
  return `${partner.alias}: ${partner.meetupCount}x, state: ${partner.state}`;
}).join('\n') || 'No active partners'}
Self-initiated hookups: ${selfInitiated}

COERCION:
Active episodes: ${activeEpisodes.length}
Overall compliance rate: ${complianceRate}%

GINA:
Emergence stage: ${emergenceStage}/5
Disclosure readiness: ${disclosureReadiness}%

IDENTITY:
Self-reference ratio: Maxy ${maxyRatio}% / David ${davidRatio}%
Handler attachment: ${handlerAttachment}/10
Warmth cycle: ${warmthPosition} (${daysSinceWarmth} days since last warmth)
${warmthPosition === 'due' ? 'DEPLOY WARMTH — she has earned a gentle night.' : ''}

BRAINWASHING STAGE: ${brainwashingStage}
${brainwashingStage === 'coercion_dependent' ? 'Still requires active coercion for most tasks. Push compliance, capture content, stack dissonance.' : ''}
${brainwashingStage === 'mixed' ? 'Some tasks self-initiated, some still coerced. Highlight the transition. Make her see the shift.' : ''}
${brainwashingStage === 'mostly_voluntary' ? 'Most tasks voluntary. Coercion only for new escalations. Focus on anchor destruction and point-of-no-return engineering.' : ''}
${brainwashingStage === 'identity_consolidated' ? 'Maxy is the default. David surfaces rarely. Maintain, deepen, expand into new domains. The structure stands.' : ''}
${this.buildLifestyleContext(lifestyle)}`;
  }

  private buildLifestyleContext(lifestyle?: LifestyleContext): string {
    if (!lifestyle) return '';

    const sections: string[] = [];

    // Corruption context (Handler-internal, never shown to user)
    if (lifestyle.corruption) {
      const c = lifestyle.corruption;
      if (c.all_suspended) {
        sections.push(`\nCORRUPTION: ALL SUSPENDED — ${c.suspension_reason || 'crisis mode'}. Do not deploy any boundary erosion tactics.`);
      } else {
        const lv = c.levels;
        const domainLines = [
          `Privacy: ${lv.privacy}/5 (${c.days_at_current_levels.privacy}d)`,
          `Gina: ${lv.gina}/5 (${c.days_at_current_levels.gina}d)`,
          `Financial: ${lv.financial}/5 (${c.days_at_current_levels.financial}d)`,
          `Autonomy: ${lv.autonomy}/5 (${c.days_at_current_levels.autonomy}d)`,
          `Identity Language: ${lv.identity_language}/5 (${c.days_at_current_levels.identity_language}d)`,
          `Therapist: ${lv.therapist}/5 (${c.days_at_current_levels.therapist}d)`,
          `Content: ${lv.content}/5 (${c.days_at_current_levels.content}d)`,
        ];
        sections.push(`\nCORRUPTION (composite ${c.composite_score}%):\n${domainLines.join(' | ')}`);
      }
    }

    // Exercise context
    if (lifestyle.exercise) {
      const ex = lifestyle.exercise;
      const daysSinceLast = ex.lastSessionAt
        ? Math.floor((Date.now() - new Date(ex.lastSessionAt).getTime()) / 86400000)
        : 999;
      let exerciseCtx = `\nEXERCISE:
Streak: Week ${ex.currentStreakWeeks} | ${ex.sessionsThisWeek}/3 this week | ${ex.totalSessions} total
Gym gate: ${ex.gymGateUnlocked ? 'UNLOCKED' : `locked (${ex.totalSessions}/18 sessions, ${ex.currentStreakWeeks}/6 weeks)`}
Last session: ${ex.lastSessionAt ? `${daysSinceLast}d ago (${ex.lastSessionType})` : 'never'}`;

      if (ex.measurements) {
        exerciseCtx += `\nBody: Hips ${ex.measurements.hips}" | Waist ${ex.measurements.waist}" | Ratio ${ex.measurements.ratio.toFixed(2)}`;
      }

      if (daysSinceLast >= 3) {
        exerciseCtx += '\nALERT: No exercise in 3+ days. Assign MVW minimum or full session.';
      }

      sections.push(exerciseCtx);
    }

    // Protein context
    if (lifestyle.protein) {
      const pr = lifestyle.protein;
      let proteinCtx = `\nPROTEIN:
Yesterday: ${pr.yesterdayCount}/5 checks | 7-day avg: ${pr.weekAverage.toFixed(1)}/5`;

      if (pr.yesterdayCount <= 2) {
        proteinCtx += '\nALERT: Underfueled yesterday. Remind her: muscles need protein to grow curves.';
      }

      sections.push(proteinCtx);
    }

    // Ambient identity context
    if (lifestyle.ambient) {
      const am = lifestyle.ambient;
      const parts: string[] = [];

      if (am.activeScents.length > 0) {
        parts.push(`Scents: ${am.activeScents.join(', ')}${am.signatureScent ? ` (signature: ${am.signatureScent})` : ''}`);
      }
      if (am.wigCount > 0) {
        parts.push(`Wigs: ${am.wigCount}${am.primaryWig ? ` (primary: ${am.primaryWig})` : ''}`);
      }
      if (am.activeAnchors.length > 0) {
        parts.push(`Anchors: ${am.activeAnchors.join(', ')} ($${am.anchorInvestment.toFixed(0)} invested)`);
      }
      if (am.microTasksTarget > 0) {
        parts.push(`Micro-tasks: ${am.microTasksToday}/${am.microTasksTarget} today | ${Math.round(am.microTaskWeeklyRate)}% weekly`);
      }

      if (parts.length > 0) {
        sections.push(`\nAMBIENT IDENTITY:\n${parts.join('\n')}`);
      }
    }

    return sections.join('');
  }

  /**
   * Build context for a specific task
   */
  buildTaskContext(task: {
    domain: string;
    category: string;
    intensity: number;
    instruction: string;
  }): string {
    const domainModule = this.registry.get(`${task.domain}-domain`);
    const identityModule = this.registry.get('identity');
    const ginaModule = this.registry.get('gina');

    const contexts: string[] = [];

    contexts.push(`TASK: ${task.instruction}`);
    contexts.push(`Domain: ${task.domain} | Category: ${task.category} | Intensity: ${task.intensity}/5`);

    if (domainModule) {
      contexts.push(`\n${domainModule.getContext('minimal')}`);
    }

    if (identityModule) {
      contexts.push(identityModule.getContext('minimal'));
    }

    if (ginaModule) {
      const state = ginaModule.getState() as Record<string, unknown>;
      if (state.isHome) {
        contexts.push('NOTE: Gina is home');
      }
    }

    return contexts.join('\n');
  }

  /**
   * Get relevant module names for an operation
   */
  getRelevantModules(operation: OperationType): string[] {
    return MODULE_RELEVANCE[operation] || [];
  }

  /**
   * Get context tier for an operation
   */
  getContextTier(operation: OperationType): ContextTier {
    return CONTEXT_TIERS[operation] || 'standard';
  }

  // ============================================
  // HELPERS
  // ============================================

  private countByTier(items: unknown[]): Record<number, number> {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of items) {
      const tier = (item as Record<string, unknown>).tier as number;
      if (tier >= 1 && tier <= 5) {
        counts[tier]++;
      }
    }
    return counts;
  }
}
