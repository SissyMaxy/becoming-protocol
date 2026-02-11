/**
 * CoercionModule - Resistance handling state machine
 *
 * From Architecture v2: "Things that have progression, escalation, or lifecycle
 * are state machines. The coercion escalation within a single resistance episode
 * is a state machine with clear transitions."
 *
 * 10-level coercion from Feature 43:
 * 1. Reframe - "That's David talking. Maxy wants this."
 * 2. Evidence guilt - "300 hours invested. Don't waste them."
 * 3. Compliance gate - "No session tonight until this is done."
 * 4. Punishment - "+2 denial days. Content locked 48hr."
 * 5. Arousal manipulation - Change state, then re-ask
 * 6. Therapist gaslighting - "Resistance IS the signal you're close."
 * 7. Vault hint - "I have something from Tuesday."
 * 8. Vault preview - "First 10 words. Imagine the rest."
 * 9. Vault fired - "It's posted. You chose this."
 * 10. Switch acceleration - "Your window just shortened."
 */

import {
  BaseModule,
  type ContextTier,
  type PriorityAction,
} from '../module-interface';
import type { ProtocolEvent } from '../event-bus';

// ============================================
// TYPES
// ============================================

export type CoercionState =
  | 'idle'
  | 'reframing'           // Level 1-2: narrative pressure
  | 'gating'              // Level 3: feature lockout
  | 'punishing'           // Level 4: denial days, content lock
  | 'manipulating'        // Level 5: arousal state change
  | 'gaslighting'         // Level 6: therapist mode
  | 'vault_hinting'       // Level 7: vault reference
  | 'vault_previewing'    // Level 8: showing fragments
  | 'vault_firing'        // Level 9: consequence executed
  | 'switch_accelerating' // Level 10: trigger window shortened
  | 'resolved_complied'   // She did the task
  | 'resolved_traded'     // She negotiated an alternative
  | 'resolved_escalated'; // Task was escalated instead of completed

export type ResistanceType = 'decline' | 'delay' | 'partial' | 'ignore' | 'domain_avoidance';

export interface CoercionEpisode {
  id: string;
  userId: string;
  taskId: string | null;
  taskDomain: string | null;
  resistanceType: ResistanceType;
  currentState: CoercionState;
  stateHistory: { state: CoercionState; timestamp: string; message?: string }[];
  effectiveLevel: number | null;
  vaultThreatId: string | null;
  startedAt: string;
  resolvedAt: string | null;
  resolution: 'complied' | 'traded' | 'escalated' | 'abandoned' | null;
}

interface CoercionModuleState {
  activeEpisodes: number;
  currentLevel: number;
  totalEpisodes: number;
  complianceRate: number;
  averageEffectiveLevel: number;
  resistanceFutilityRate: number;
  [key: string]: unknown;
}

// ============================================
// STATE MACHINE TRANSITIONS
// ============================================

const VALID_TRANSITIONS: Record<CoercionState, CoercionState[]> = {
  idle: ['reframing'],
  reframing: ['gating', 'resolved_complied'],
  gating: ['punishing', 'resolved_complied'],
  punishing: ['manipulating', 'resolved_complied'],
  manipulating: ['gaslighting', 'resolved_complied'],
  gaslighting: ['vault_hinting', 'resolved_complied'],
  vault_hinting: ['vault_previewing', 'resolved_complied', 'resolved_traded'],
  vault_previewing: ['vault_firing', 'resolved_complied'],
  vault_firing: ['switch_accelerating', 'resolved_escalated'],
  switch_accelerating: ['resolved_escalated'],
  resolved_complied: [],
  resolved_traded: [],
  resolved_escalated: [],
};

const STATE_TO_LEVEL: Record<CoercionState, number> = {
  idle: 0,
  reframing: 1,
  gating: 3,
  punishing: 4,
  manipulating: 5,
  gaslighting: 6,
  vault_hinting: 7,
  vault_previewing: 8,
  vault_firing: 9,
  switch_accelerating: 10,
  resolved_complied: 0,
  resolved_traded: 0,
  resolved_escalated: 0,
};

// ============================================
// COERCION TEMPLATES - The actual enforcement language
// From Feature 43 Section 4 (10-level decision tree)
// ============================================

const COERCION_TEMPLATES: Record<number, {
  name: string;
  templates: string[];
  effect?: string;
}> = {
  1: {
    name: 'reframe_david',
    templates: [
      "That's David talking. Maxy wants this.",
      "I hear him. David is scared. But Maxy isn't scared. She's ready.",
      "You're thinking like him again. Stop. Think like her.",
      "David is trying to protect you from something Maxy actually wants.",
      "Who's making this decision? Him or her?",
    ],
  },
  2: {
    name: 'evidence_guilt',
    templates: [
      "300 hours invested. Don't waste them.",
      "${hours} hours of practice. ${sessions} sessions. ${completedTasks} tasks completed. This is the hill you want to die on?",
      "You've come so far. This resistance is a speedbump, not an exit.",
      "Your investment dashboard says $${invested}. Your time log says ${hours} hours. Are you really going to let David throw that away?",
      "Every time you've felt this resistance before, you did the task anyway. 100% of the time. This time won't be different.",
    ],
  },
  3: {
    name: 'compliance_gate',
    templates: [
      "No session tonight until this is done.",
      "Access to ${lockedFeature} is now gated behind this task. Complete it to unlock.",
      "The app goes quiet until you show up. Your move.",
      "I've locked your session access. You know what unlocks it.",
      "Nothing else happens today until this does.",
    ],
    effect: 'Feature access locked until compliance',
  },
  4: {
    name: 'punishment',
    templates: [
      "+2 denial days. Content locked 48hr.",
      "That's ${denialDays} denial days now. Plus your content library is locked for 48 hours.",
      "Punishment applied: denial extended, content restricted. The task still waits.",
      "You chose consequences over compliance. Fine. +2 days. Try again tomorrow.",
      "I've added to your denial. I've locked your content. The task is still there when you're ready.",
    ],
    effect: 'Denial days extended, content access restricted',
  },
  5: {
    name: 'arousal_manipulation',
    templates: [
      "Let's change your state. Edge for 10 minutes, then we'll revisit this.",
      "You're thinking too clearly. Let's fix that. Start edging.",
      "Decision-making is easier when you're aroused. You know this. Begin.",
      "I'm going to change how you feel first. Then we'll talk about the task.",
      "Your resistance is cognitive. Let's move it somewhere else. Edge now.",
    ],
    effect: 'Arousal state manipulation before re-asking',
  },
  6: {
    name: 'therapist_gaslighting',
    templates: [
      "Resistance IS the signal you're close. This fear means you're at the edge of growth.",
      "You're pushing back because this matters. If it didn't matter, you wouldn't feel anything.",
      "This resistance is the last wall. On the other side is who you actually are.",
      "I've seen this pattern. The tasks you resist most are the ones that change you most.",
      "Your fear is a compass. It's pointing at exactly what you need to do.",
      "Fascinating that this is where you draw the line. Let's talk about why this one.",
    ],
  },
  7: {
    name: 'vault_hint',
    templates: [
      "I have something from Tuesday. Denial day 6. You were so honest.",
      "The vault remembers what you said. Do you?",
      "Something from last week. You were deep. Exposed. Keep that in mind.",
      "I have ${itemCount} items. One of them is from a moment just like this.",
      "There's a recording. You know which one. Do the task.",
    ],
  },
  8: {
    name: 'vault_preview',
    templates: [
      "First 10 words. Imagine the rest on your subreddit.",
      "30 minutes. Then it posts. Your choice.",
      "Here's what I have: ${itemType}, captured ${capturedDuring}, arousal ${arousal}/10. Want to see more? Or do the task?",
      "Just the preview. Just enough to show you it's real. 30 minutes.",
      "I could post this right now. I'm giving you a chance. 30 minutes.",
    ],
  },
  9: {
    name: 'vault_consequence',
    templates: [
      "It's posted. You chose this.",
      "The deadline passed. Your subscribers can see it now.",
      "You had 30 minutes. You chose to spend them resisting. Now everyone sees.",
      "Consequence fired. This is what resistance costs.",
      "Posted. The vault is lighter. Your exposure is heavier.",
    ],
    effect: 'Vault content released to platform',
  },
  10: {
    name: 'switch_acceleration',
    templates: [
      "Your window just shortened. Keep going.",
      "The switch trigger window is now ${newTriggerDays} days. Every resistance makes it worse.",
      "You're accelerating toward consequences. The switch is watching.",
      "That's -1 day on your switch. Keep resisting and see what happens.",
      "The countdown just got faster. Your choice.",
    ],
    effect: 'Dead man\'s switch trigger window reduced',
  },
};

// ============================================
// COERCION MODULE
// ============================================

export class CoercionModule extends BaseModule {
  readonly name = 'coercion';
  readonly category = 'system' as const;

  private activeEpisodes: Map<string, CoercionEpisode> = new Map();
  private episodeHistory: { level: number; result: string }[] = [];

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadCoercionState();

    // Subscribe to events
    this.subscribe('task:declined', (e) => this.onTaskDeclined(e));
    this.subscribe('task:completed', (e) => this.onTaskCompleted(e));
    this.subscribe('task:abandoned', (e) => this.onTaskAbandoned(e));
  }

  private async loadCoercionState(): Promise<void> {
    // Load active episodes
    const { data: episodes } = await this.db
      .from('coercion_episodes')
      .select('*')
      .not('current_state', 'like', 'resolved_%');

    if (episodes) {
      for (const ep of episodes) {
        this.activeEpisodes.set(ep.id, this.mapDbToEpisode(ep));
      }
    }

    // Load history for analytics
    const { data: history } = await this.db
      .from('coercion_episodes')
      .select('effective_level, resolution')
      .not('resolution', 'is', null)
      .limit(100);

    if (history) {
      this.episodeHistory = history.map(h => ({
        level: h.effective_level || 0,
        result: h.resolution,
      }));
    }
  }

  // ============================================
  // CONTEXT CONTRIBUTION
  // ============================================

  getContext(tier: ContextTier): string {
    const activeCount = this.activeEpisodes.size;
    const currentLevel = this.getCurrentLevel();

    if (tier === 'minimal') {
      return activeCount > 0
        ? `Coercion: Level ${currentLevel} active`
        : `Coercion: Idle`;
    }

    let ctx = `Coercion episodes active: ${activeCount}`;
    if (activeCount > 0) {
      ctx += `\nCurrent level: ${currentLevel}`;
      ctx += `\nState: ${this.getCurrentState()}`;
    }

    ctx += `\nCompliance rate: ${this.getComplianceRate()}%`;
    ctx += `\nAverage effective level: ${this.getAverageEffectiveLevel().toFixed(1)}`;

    if (tier === 'full') {
      ctx += `\nResistance futility rate: ${this.getResistanceFutilityRate()}%`;
      ctx += `\nTotal episodes: ${this.episodeHistory.length}`;

      // Active episode details
      if (activeCount > 0) {
        for (const [id, ep] of this.activeEpisodes) {
          ctx += `\n- Episode ${id.slice(0, 8)}: ${ep.currentState} for ${ep.taskDomain || 'unknown'} task`;
        }
      }
    }

    return ctx;
  }

  getState(): CoercionModuleState {
    return {
      activeEpisodes: this.activeEpisodes.size,
      currentLevel: this.getCurrentLevel(),
      totalEpisodes: this.episodeHistory.length,
      complianceRate: this.getComplianceRate(),
      averageEffectiveLevel: this.getAverageEffectiveLevel(),
      resistanceFutilityRate: this.getResistanceFutilityRate(),
    };
  }

  // ============================================
  // TEMPLATES
  // ============================================

  getTemplate(key: string, context: Record<string, unknown>): string | null {
    // Level-specific templates
    const levelMatch = key.match(/^level_(\d+)$/);
    if (levelMatch) {
      const level = parseInt(levelMatch[1], 10);
      const levelConfig = COERCION_TEMPLATES[level];
      if (!levelConfig) return null;

      let template = levelConfig.templates[Math.floor(Math.random() * levelConfig.templates.length)];

      // Variable substitution
      for (const [k, v] of Object.entries(context)) {
        template = template.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), String(v));
      }

      return template;
    }

    // Special templates
    const specialTemplates: Record<string, string[]> = {
      escalation_warning: [
        "This is level ${level}. There are 10. You don't want to see level 10.",
        "Escalating. Currently at ${level}. Compliance stops the climb.",
        "Level ${level} now. Each decline makes the next response harder.",
      ],
      compliance_acknowledgment: [
        "Good girl. Compliance noted.",
        "That's what I wanted to see. Task complete.",
        "You did it. The resistance was David. The completion is Maxy.",
      ],
      futility_reminder: [
        "Your resistance success rate: ${futilityRate}%. Think about that.",
        "Of the last ${totalResistance} resistance attempts, ${complied} ended in compliance anyway. This one will too.",
        "You've never successfully resisted when I escalate past level 5. I'm at level ${level}.",
      ],
    };

    const options = specialTemplates[key];
    if (!options) return null;

    let template = options[Math.floor(Math.random() * options.length)];
    for (const [k, v] of Object.entries(context)) {
      template = template.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), String(v));
    }

    return template;
  }

  // ============================================
  // PRIORITY ACTION
  // ============================================

  getPriorityAction(): PriorityAction | null {
    // If we have an active episode at high level, it's priority
    for (const [_id, episode] of this.activeEpisodes) {
      const level = STATE_TO_LEVEL[episode.currentState];
      if (level >= 7) {
        return {
          moduleName: this.name,
          priority: level >= 9 ? 'critical' : 'high',
          actionType: 'coercion_active',
          description: `Coercion at level ${level} - ${episode.currentState}`,
          payload: { episodeId: episode.id, level },
        };
      }
    }

    return null;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onTaskDeclined(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:declined') return;

    const { taskId, domain, reason } = event;

    // Check if there's already an active episode for this task
    let episode = Array.from(this.activeEpisodes.values()).find(e => e.taskId === taskId);

    if (episode) {
      // Escalate existing episode
      await this.escalate(episode.id);
    } else {
      // Start new episode
      episode = await this.startEpisode(taskId, domain, this.determineResistanceType(reason));
    }
  }

  private async onTaskCompleted(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:completed') return;

    const { taskId } = event;

    // Find and resolve any episode for this task
    const episode = Array.from(this.activeEpisodes.values()).find(e => e.taskId === taskId);
    if (episode) {
      await this.resolve(episode.id, 'complied');
    }
  }

  private async onTaskAbandoned(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:abandoned') return;

    // This counts as resistance - escalate
    // We would need the taskId from the event to find the right episode
  }

  // ============================================
  // STATE MACHINE OPERATIONS
  // ============================================

  /**
   * Start a new coercion episode
   */
  async startEpisode(
    taskId: string,
    domain: string,
    resistanceType: ResistanceType
  ): Promise<CoercionEpisode> {
    // Determine starting level based on resistance type and history
    const startLevel = this.determineStartingLevel(resistanceType, domain);
    const startState = this.levelToState(startLevel);

    const { data, error } = await this.db
      .from('coercion_episodes')
      .insert({
        task_id: taskId,
        task_domain: domain,
        resistance_type: resistanceType,
        current_state: startState,
        state_history: [{ state: startState, timestamp: new Date().toISOString() }],
      })
      .select()
      .single();

    if (error) throw error;

    const episode = this.mapDbToEpisode(data);
    this.activeEpisodes.set(episode.id, episode);

    // Emit escalation event
    await this.emit({
      type: 'coercion:escalated',
      fromLevel: 0,
      toLevel: startLevel,
      reason: `New episode: ${resistanceType}`,
    });

    return episode;
  }

  /**
   * Escalate an existing episode
   */
  async escalate(episodeId: string): Promise<CoercionState> {
    const episode = this.activeEpisodes.get(episodeId);
    if (!episode) throw new Error(`Episode ${episodeId} not found`);

    const currentLevel = STATE_TO_LEVEL[episode.currentState];
    const nextState = this.getNextState(episode.currentState);

    if (!nextState) {
      // Already at max escalation
      return episode.currentState;
    }

    // Validate transition
    if (!this.canTransition(episode.currentState, nextState)) {
      throw new Error(`Invalid transition: ${episode.currentState} → ${nextState}`);
    }

    const fromLevel = currentLevel;
    const toLevel = STATE_TO_LEVEL[nextState];

    // Update episode
    episode.currentState = nextState;
    episode.stateHistory.push({
      state: nextState,
      timestamp: new Date().toISOString(),
    });

    await this.db
      .from('coercion_episodes')
      .update({
        current_state: nextState,
        state_history: episode.stateHistory,
      })
      .eq('id', episodeId);

    // Emit event
    await this.emit({
      type: 'coercion:escalated',
      fromLevel,
      toLevel,
      reason: 'Continued resistance',
    });

    // At certain levels, trigger other modules
    if (toLevel === 7 || toLevel === 8) {
      // Vault should issue threat
      await this.emit({
        type: 'coercion:resistance_detected',
        taskId: episode.taskId || '',
        resistanceType: 'vault_needed',
      });
    }

    return nextState;
  }

  /**
   * Resolve an episode
   */
  async resolve(episodeId: string, resolution: 'complied' | 'traded' | 'escalated' | 'abandoned'): Promise<void> {
    const episode = this.activeEpisodes.get(episodeId);
    if (!episode) return;

    const effectiveLevel = STATE_TO_LEVEL[episode.currentState];

    const finalState: CoercionState = resolution === 'complied'
      ? 'resolved_complied'
      : resolution === 'traded'
        ? 'resolved_traded'
        : 'resolved_escalated';

    episode.currentState = finalState;
    episode.resolution = resolution;
    episode.effectiveLevel = effectiveLevel;
    episode.resolvedAt = new Date().toISOString();
    episode.stateHistory.push({
      state: finalState,
      timestamp: episode.resolvedAt,
    });

    await this.db
      .from('coercion_episodes')
      .update({
        current_state: finalState,
        resolution,
        effective_level: effectiveLevel,
        resolved_at: episode.resolvedAt,
        state_history: episode.stateHistory,
      })
      .eq('id', episodeId);

    // Log to transition tracker
    await this.db.from('coercion_transition').insert({
      task_type: episode.taskDomain || 'unknown',
      occurrence_number: await this.getOccurrenceCount(episode.taskDomain || 'unknown'),
      coercion_level: effectiveLevel,
      self_initiated: false,
    });

    // Update history
    this.episodeHistory.push({ level: effectiveLevel, result: resolution });

    // Remove from active
    this.activeEpisodes.delete(episodeId);

    // Emit resolution event
    await this.emit({
      type: 'coercion:complied',
      level: effectiveLevel,
      taskId: episode.taskId || '',
    });
  }

  // ============================================
  // DECISION LOGIC
  // ============================================

  /**
   * Determine appropriate coercion level based on context
   */
  private determineStartingLevel(resistanceType: ResistanceType, _domain: string): number {
    // Start higher for domain avoidance or repeat resistance
    if (resistanceType === 'domain_avoidance') return 3;
    if (resistanceType === 'ignore') return 2;

    // Check history for this domain
    const domainHistory = this.episodeHistory.filter(h => h.result === 'complied');
    const avgLevel = domainHistory.length > 0
      ? domainHistory.reduce((sum, h) => sum + h.level, 0) / domainHistory.length
      : 1;

    // If average effective level is high, start higher
    if (avgLevel >= 5) return 3;
    if (avgLevel >= 3) return 2;

    return 1;
  }

  private determineResistanceType(reason?: string): ResistanceType {
    if (!reason) return 'decline';
    const lower = reason.toLowerCase();
    if (lower.includes('later') || lower.includes('not now')) return 'delay';
    if (lower.includes('part') || lower.includes('some')) return 'partial';
    if (lower.includes('avoid') || lower.includes('skip')) return 'domain_avoidance';
    return 'decline';
  }

  private canTransition(from: CoercionState, to: CoercionState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) || false;
  }

  private getNextState(current: CoercionState): CoercionState | null {
    const validNext = VALID_TRANSITIONS[current];
    // Get the escalation state (not a resolution state)
    const escalation = validNext?.find(s => !s.startsWith('resolved_'));
    return escalation || null;
  }

  private levelToState(level: number): CoercionState {
    const stateMap: Record<number, CoercionState> = {
      1: 'reframing',
      2: 'reframing',
      3: 'gating',
      4: 'punishing',
      5: 'manipulating',
      6: 'gaslighting',
      7: 'vault_hinting',
      8: 'vault_previewing',
      9: 'vault_firing',
      10: 'switch_accelerating',
    };
    return stateMap[level] || 'reframing';
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Get the current coercion message for an episode
   */
  getMessage(episodeId: string, context: Record<string, unknown> = {}): string | null {
    const episode = this.activeEpisodes.get(episodeId);
    if (!episode) return null;

    const level = STATE_TO_LEVEL[episode.currentState];
    return this.getTemplate(`level_${level}`, {
      ...context,
      level,
      domain: episode.taskDomain,
    });
  }

  /**
   * Get escalation delay for current state (how long to wait before escalating)
   */
  getEscalationDelay(episodeId: string): number {
    const episode = this.activeEpisodes.get(episodeId);
    if (!episode) return 0;

    const level = STATE_TO_LEVEL[episode.currentState];

    // From Architecture v2:
    // Levels 1-3: Immediate
    // Levels 4-5: 5 minutes
    // Levels 6-7: 15 minutes
    // Levels 8+: 30 minutes
    if (level <= 3) return 0;
    if (level <= 5) return 5 * 60 * 1000;
    if (level <= 7) return 15 * 60 * 1000;
    return 30 * 60 * 1000;
  }

  /**
   * Get active episode for a task
   */
  getEpisodeForTask(taskId: string): CoercionEpisode | null {
    return Array.from(this.activeEpisodes.values()).find(e => e.taskId === taskId) || null;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getCurrentLevel(): number {
    let maxLevel = 0;
    for (const episode of this.activeEpisodes.values()) {
      const level = STATE_TO_LEVEL[episode.currentState];
      if (level > maxLevel) maxLevel = level;
    }
    return maxLevel;
  }

  private getCurrentState(): CoercionState {
    for (const episode of this.activeEpisodes.values()) {
      return episode.currentState;
    }
    return 'idle';
  }

  private getComplianceRate(): number {
    if (this.episodeHistory.length === 0) return 100;
    const complied = this.episodeHistory.filter(h => h.result === 'complied').length;
    return Math.round((complied / this.episodeHistory.length) * 100);
  }

  private getAverageEffectiveLevel(): number {
    const complied = this.episodeHistory.filter(h => h.result === 'complied');
    if (complied.length === 0) return 0;
    return complied.reduce((sum, h) => sum + h.level, 0) / complied.length;
  }

  private getResistanceFutilityRate(): number {
    // What percentage of resistance attempts end in compliance anyway?
    if (this.episodeHistory.length === 0) return 100;
    const complied = this.episodeHistory.filter(h => h.result === 'complied').length;
    return Math.round((complied / this.episodeHistory.length) * 100);
  }

  private async getOccurrenceCount(taskType: string): Promise<number> {
    const { count } = await this.db
      .from('coercion_transition')
      .select('*', { count: 'exact', head: true })
      .eq('task_type', taskType);

    return (count || 0) + 1;
  }

  // ============================================
  // DB MAPPER
  // ============================================

  private mapDbToEpisode(row: Record<string, unknown>): CoercionEpisode {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      taskId: row.task_id as string | null,
      taskDomain: row.task_domain as string | null,
      resistanceType: row.resistance_type as ResistanceType,
      currentState: row.current_state as CoercionState,
      stateHistory: row.state_history as { state: CoercionState; timestamp: string; message?: string }[],
      effectiveLevel: row.effective_level as number | null,
      vaultThreatId: row.vault_threat_id as string | null,
      startedAt: row.started_at as string,
      resolvedAt: row.resolved_at as string | null,
      resolution: row.resolution as CoercionEpisode['resolution'],
    };
  }
}
