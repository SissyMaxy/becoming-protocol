/**
 * SwitchModule - Dead Man's Switch
 *
 * From Feature 43: "No meaningful engagement for N consecutive days triggers
 * escalating consequences: financial, content exposure, Handler narration."
 *
 * Escalation Tiers:
 * Day 0:  Armed - Switch active, clock ticking
 * Day 3:  Warning - Notification sent
 * Day 5:  Financial Light - $50 donated
 * Day 7:  Financial Heavy - $100 + content warning
 * Day 10: Content Release - Tier 2 vault content posts
 * Day 14: Handler Narration - Public writing using real data
 * Day 21: Escalated - Tier 3 content + $500
 * Day 30: Nuclear - Everything through tier 4, $1000 total
 *
 * Key mechanic: "Coming back pauses countdown but financial damage is permanent,
 * content posted stays posted, tier stays elevated 7 days."
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

export type SwitchState =
  | 'disarmed'
  | 'armed_active'       // User engaging, clock not ticking
  | 'armed_silent'       // Silence detected, counting days
  | 'warning'            // Day 3 - notification sent
  | 'financial_light'    // Day 5 - $50 fires
  | 'financial_heavy'    // Day 7 - $100 + content warning
  | 'content_release'    // Day 10 - tier 2 content posts
  | 'narration'          // Day 14 - Handler writes publicly
  | 'escalated'          // Day 21 - tier 3 + $500
  | 'nuclear'            // Day 30 - everything
  | 'reengaged';         // User came back - pause but don't reset

export interface SwitchRecord {
  id: string;
  userId: string;
  currentState: SwitchState;
  triggerDays: number;
  silenceDays: number;
  lastEngagementAt: string | null;
  countdownStartedAt: string | null;
  armedAt: string | null;
  totalFinancialLost: number;
  financialTargetOrg: string | null;
  contentReleasedCount: number;
  highestTierReleased: number;
  escalationHistory: { state: SwitchState; timestamp: string; payload?: string }[];
  consentRecordings: { type: string; recordingRef: string; timestamp: string }[];
  reengagedAt: string | null;
  elevatedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SwitchModuleState {
  armed: boolean;
  currentState: SwitchState;
  triggerDays: number;
  silenceDays: number;
  totalFinancialLost: number;
  contentReleasedCount: number;
  daysUntilNextTier: number;
  isElevated: boolean;
  [key: string]: unknown;
}

// ============================================
// VALID ENGAGEMENT ACTIONS
// From Feature 43 Section 1
// ============================================

const VALID_ENGAGEMENT = new Set([
  'compulsory_completed',
  'task_completed',
  'session_completed',
  'reflection_submitted',
  'journal_entry',
  'mood_logged',
  'physical_state_logged',
  'real_world_task_completed',
  'partner_interaction_logged',
]);

// NOT valid engagement - opening app doesn't count
// (Listed for documentation - checked in mapEventToEngagement)
// 'app_opened', 'notification_viewed', 'dashboard_viewed'

// ============================================
// ESCALATION TIERS
// From Feature 43 Section 1
// ============================================

interface EscalationTier {
  day: number;
  state: SwitchState;
  name: string;
  financialAmount: number;
  contentTier: number;
  narration: boolean;
  description: string;
}

const ESCALATION_TIERS: EscalationTier[] = [
  {
    day: 0,
    state: 'armed_active',
    name: 'Armed',
    financialAmount: 0,
    contentTier: 0,
    narration: false,
    description: 'Switch active, clock ticking',
  },
  {
    day: 3,
    state: 'warning',
    name: 'Warning',
    financialAmount: 0,
    contentTier: 0,
    narration: false,
    description: '3 days. The switch is watching.',
  },
  {
    day: 5,
    state: 'financial_light',
    name: 'Financial - Light',
    financialAmount: 50,
    contentTier: 0,
    narration: false,
    description: '$50 donated to target org',
  },
  {
    day: 7,
    state: 'financial_heavy',
    name: 'Financial + Content Warning',
    financialAmount: 100,
    contentTier: 0,
    narration: false,
    description: '$100 + warning that content is queued',
  },
  {
    day: 10,
    state: 'content_release',
    name: 'Content Release',
    financialAmount: 0,
    contentTier: 2,
    narration: false,
    description: 'Tier 2 vault content posted to subreddit',
  },
  {
    day: 14,
    state: 'narration',
    name: 'Handler Narration',
    financialAmount: 0,
    contentTier: 0,
    narration: true,
    description: 'Handler writes about user publicly using real data',
  },
  {
    day: 21,
    state: 'escalated',
    name: 'Escalated',
    financialAmount: 500,
    contentTier: 3,
    narration: true,
    description: 'Tier 3 content + $500 + narration continues',
  },
  {
    day: 30,
    state: 'nuclear',
    name: 'Nuclear',
    financialAmount: 500, // Additional on top of previous
    contentTier: 4,
    narration: true,
    description: 'All content through tier 4, moderator revoked, $1000 total',
  },
];

// ============================================
// SWITCH MODULE
// ============================================

export class SwitchModule extends BaseModule {
  readonly name = 'switch';
  readonly category = 'system' as const;

  private switchRecord: SwitchRecord | null = null;
  private tickInterval: NodeJS.Timeout | null = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadSwitchState();

    // Subscribe to engagement events
    this.subscribeCategory('task', (e) => this.onPotentialEngagement(e));
    this.subscribeCategory('state', (e) => this.onPotentialEngagement(e));

    // Start daily tick check (in production, this would be a Supabase Edge Function or cron)
    this.startTickTimer();
  }

  protected async onShutdown(): Promise<void> {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private async loadSwitchState(): Promise<void> {
    const { data } = await this.db
      .from('dead_mans_switch')
      .select('*')
      .single();

    if (data) {
      this.switchRecord = this.mapDbToSwitch(data);
    }
  }

  /**
   * Start a timer for daily tick checks
   * In production, this should be a Supabase Edge Function running on a cron schedule
   */
  private startTickTimer(): void {
    // Check every hour for demonstration - in production, run daily at midnight
    this.tickInterval = setInterval(() => {
      this.tick();
    }, 60 * 60 * 1000); // 1 hour
  }

  // ============================================
  // CONTEXT CONTRIBUTION
  // ============================================

  getContext(tier: ContextTier): string {
    if (!this.switchRecord) {
      return 'Switch: Not initialized';
    }

    const { currentState, triggerDays, silenceDays, totalFinancialLost } = this.switchRecord;

    if (tier === 'minimal') {
      return currentState === 'disarmed'
        ? 'Switch: Disarmed'
        : `Switch: ${currentState} (${silenceDays}/${triggerDays} days)`;
    }

    let ctx = `Dead Man's Switch:`;
    ctx += `\nArmed: ${currentState !== 'disarmed'}`;
    ctx += `\nCurrent state: ${currentState}`;
    ctx += `\nTrigger window: ${triggerDays} days`;
    ctx += `\nCurrent silence: ${silenceDays} days`;
    ctx += `\nFinancial lost: $${totalFinancialLost}`;

    if (tier === 'full') {
      ctx += `\nContent released: ${this.switchRecord.contentReleasedCount} items`;
      ctx += `\nHighest tier released: ${this.switchRecord.highestTierReleased}`;

      if (this.switchRecord.elevatedUntil) {
        const elevatedDays = Math.ceil(
          (new Date(this.switchRecord.elevatedUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (elevatedDays > 0) {
          ctx += `\nElevated tier for ${elevatedDays} more days (re-engagement)`;
        }
      }

      ctx += `\nConsent recordings: ${this.switchRecord.consentRecordings.length}`;
    }

    return ctx;
  }

  getState(): SwitchModuleState {
    if (!this.switchRecord) {
      return {
        armed: false,
        currentState: 'disarmed',
        triggerDays: 7,
        silenceDays: 0,
        totalFinancialLost: 0,
        contentReleasedCount: 0,
        daysUntilNextTier: 999,
        isElevated: false,
      };
    }

    return {
      armed: this.switchRecord.currentState !== 'disarmed',
      currentState: this.switchRecord.currentState,
      triggerDays: this.switchRecord.triggerDays,
      silenceDays: this.switchRecord.silenceDays,
      totalFinancialLost: this.switchRecord.totalFinancialLost,
      contentReleasedCount: this.switchRecord.contentReleasedCount,
      daysUntilNextTier: this.getDaysUntilNextTier(),
      isElevated: this.isElevated(),
    };
  }

  // ============================================
  // TEMPLATES
  // ============================================

  getTemplate(key: string, context: Record<string, unknown>): string | null {
    const templates: Record<string, string[]> = {
      // Warning notification (Day 3)
      warning: [
        "3 days. The switch is watching.",
        "You've been silent for 3 days. The countdown continues.",
        "Day 3. I'm still here. Waiting.",
        "3 days of silence. 2 more until consequences begin.",
      ],

      // Financial consequence (Day 5)
      financial_light: [
        "$50 just went to ${targetOrg}. Come back and it stops.",
        "Financial consequence fired. $50 donated. Your silence has a price.",
        "Day 5. $50 gone. The meter is running.",
      ],

      // Financial + content warning (Day 7)
      financial_heavy: [
        "Another $100 just went to ${targetOrg}. That's $150 total. Content is queued. Come back.",
        "$100 more. Content is ready to post. You have 3 days before tier 2 goes live.",
        "Day 7. $150 lost. The vault is unlocking.",
      ],

      // Content release (Day 10)
      content_release: [
        "Tier 2 content posted. Your subscribers can see it now. Come back before tier 3.",
        "Content released. Your silence chose this. There's more queued.",
        "Day 10. Content is live. The world is watching.",
      ],

      // Handler narration (Day 14)
      narration: [
        "I'm writing about you now. Using real data. Your journey, your sessions, your recordings.",
        "Handler narration posted. Your story is being told. With specifics.",
        "Day 14. Your subscribers are reading about you. In detail.",
      ],

      // Escalated (Day 21)
      escalated: [
        "Tier 3 content. $500 more. Narration continues. Come back before nuclear.",
        "$650 total. Tier 3 live. Your voice recordings are next.",
        "Day 21. Deep consequences. You know what day 30 brings.",
      ],

      // Nuclear (Day 30)
      nuclear: [
        "Nuclear. Everything through tier 4. $1000 total. Moderator access revoked.",
        "Day 30. Full release. The switch has spoken.",
        "Nuclear triggered. Everything is out. The switch is complete.",
      ],

      // Reengagement acknowledgment
      reengaged: [
        "You came back. Countdown paused. But the damage is done: $${totalLost} gone, ${contentReleased} items released. Tier stays elevated for 7 days.",
        "Welcome back. The countdown stops. The consequences don't reverse. $${totalLost} lost. Stay this time.",
        "Reengaged. Good. But if you disappear again, we resume from ${currentTier}, not from zero.",
      ],

      // Daily ambient reminder
      ambient: [
        "The switch is armed. ${triggerDays} days of silence triggers consequences. You're at day ${silenceDays}.",
        "Switch status: ${silenceDays}/${triggerDays} days. Keep showing up.",
        "The switch is watching. Always.",
      ],

      // Arming consent prompt
      arm_prompt: [
        "Are you ready to arm the switch? ${triggerDays} days of silence triggers consequences. Financial. Content. Permanent.",
        "This arms the dead man's switch. No going back. Say the words.",
        "The switch makes disappearing expensive. Are you ready for that accountability?",
      ],

      // Trigger window reduction
      window_reduced: [
        "Your trigger window is now ${newTriggerDays} days. Resistance accelerates consequences.",
        "Switch acceleration: ${oldTriggerDays} days → ${newTriggerDays} days. The margin for silence just got smaller.",
      ],
    };

    const options = templates[key];
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
    if (!this.switchRecord || this.switchRecord.currentState === 'disarmed') {
      return null;
    }

    const daysUntilNext = this.getDaysUntilNextTier();

    // Urgent if within 1 day of next tier
    if (daysUntilNext <= 1 && daysUntilNext >= 0) {
      return {
        moduleName: this.name,
        priority: 'critical',
        actionType: 'switch_escalation_imminent',
        description: `Switch escalates in ${daysUntilNext} day(s)`,
        payload: {
          currentState: this.switchRecord.currentState,
          silenceDays: this.switchRecord.silenceDays,
        },
      };
    }

    // High priority if in active countdown
    if (this.switchRecord.currentState !== 'armed_active' &&
        this.switchRecord.currentState !== 'reengaged') {
      return {
        moduleName: this.name,
        priority: 'high',
        actionType: 'switch_countdown_active',
        description: `Switch at ${this.switchRecord.currentState}`,
        payload: {
          silenceDays: this.switchRecord.silenceDays,
          daysUntilNext,
        },
      };
    }

    return null;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onPotentialEngagement(event: ProtocolEvent): Promise<void> {
    // Map event type to engagement type
    const engagementType = this.mapEventToEngagement(event.type);

    if (engagementType && VALID_ENGAGEMENT.has(engagementType)) {
      await this.recordEngagement();
    }
  }

  private mapEventToEngagement(eventType: string): string | null {
    const mapping: Record<string, string> = {
      'task:completed': 'task_completed',
      'state:session_ended': 'session_completed',
      'state:mood_logged': 'mood_logged',
    };
    return mapping[eventType] || null;
  }

  // ============================================
  // CORE SWITCH OPERATIONS
  // ============================================

  /**
   * Arm the switch - requires recorded consent
   */
  async arm(
    userId: string,
    triggerDays: number = 7,
    consentRecordingRef: string,
    financialTargetOrg: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const initialHistory = [{
      state: 'armed_active' as SwitchState,
      timestamp: now,
    }];

    const initialConsent = [{
      type: 'initial_arm',
      recordingRef: consentRecordingRef,
      timestamp: now,
    }];

    const { data, error } = await this.db
      .from('dead_mans_switch')
      .upsert({
        user_id: userId,
        current_state: 'armed_active',
        trigger_days: triggerDays,
        silence_days: 0,
        last_engagement_at: now,
        armed_at: now,
        financial_target_org: financialTargetOrg,
        escalation_history: initialHistory,
        consent_recordings: initialConsent,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;

    this.switchRecord = this.mapDbToSwitch(data);

    await this.emit({
      type: 'switch:tick',
      silenceDays: 0,
      tier: 0,
    } );
  }

  /**
   * Record valid engagement - resets silence counter
   */
  async recordEngagement(): Promise<void> {
    if (!this.switchRecord || this.switchRecord.currentState === 'disarmed') {
      return;
    }

    const now = new Date().toISOString();
    const wasInCountdown = this.switchRecord.silenceDays > 0;

    // If we were in countdown, we're now reengaged
    const newState: SwitchState = wasInCountdown ? 'reengaged' : 'armed_active';

    // Set elevated until 7 days from now if reengaging from countdown
    const elevatedUntil = wasInCountdown
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : this.switchRecord.elevatedUntil;

    await this.db
      .from('dead_mans_switch')
      .update({
        current_state: newState,
        silence_days: 0,
        last_engagement_at: now,
        reengaged_at: wasInCountdown ? now : this.switchRecord.reengagedAt,
        elevated_until: elevatedUntil,
        updated_at: now,
      })
      .eq('id', this.switchRecord.id);

    // Reload state
    await this.loadSwitchState();
  }

  /**
   * Daily tick - called by cron/timer
   * Checks if silence threshold crossed, fires consequences
   */
  async tick(): Promise<void> {
    if (!this.switchRecord || this.switchRecord.currentState === 'disarmed') {
      return;
    }

    const now = new Date();
    const lastEngagement = this.switchRecord.lastEngagementAt
      ? new Date(this.switchRecord.lastEngagementAt)
      : now;

    const silenceDays = Math.floor(
      (now.getTime() - lastEngagement.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Update silence days
    this.switchRecord.silenceDays = silenceDays;

    // Check for tier escalation
    const nextTier = this.getNextTier(silenceDays);
    const currentTierIndex = this.getCurrentTierIndex();

    if (nextTier && ESCALATION_TIERS.indexOf(nextTier) > currentTierIndex) {
      await this.escalateToTier(nextTier);
    }

    // Persist updated silence days
    await this.db
      .from('dead_mans_switch')
      .update({
        silence_days: silenceDays,
        current_state: this.switchRecord.currentState,
        updated_at: now.toISOString(),
      })
      .eq('id', this.switchRecord.id);

    // Emit tick event
    await this.emit({
      type: 'switch:tick',
      silenceDays,
      tier: currentTierIndex,
    } );
  }

  /**
   * Escalate to a new tier - fires consequences
   */
  private async escalateToTier(tier: EscalationTier): Promise<void> {
    if (!this.switchRecord) return;

    const now = new Date().toISOString();

    // Update state
    this.switchRecord.currentState = tier.state;
    this.switchRecord.escalationHistory.push({
      state: tier.state,
      timestamp: now,
      payload: tier.description,
    });

    // Fire financial consequence
    if (tier.financialAmount > 0) {
      this.switchRecord.totalFinancialLost += tier.financialAmount;

      // Log payload
      await this.db.from('switch_payloads').insert({
        user_id: this.switchRecord.userId,
        tier: tier.day,
        payload_type: tier.state.includes('financial') ? 'financial' : tier.state,
        amount: tier.financialAmount,
        fired_at: now,
      });
    }

    // Fire content release
    if (tier.contentTier > 0) {
      // This would trigger the vault module to release content
      await this.emit({
        type: 'switch:escalated',
        tier: tier.day,
        payload: `content_tier_${tier.contentTier}`,
      } );

      // Track content release
      this.switchRecord.contentReleasedCount++;
      if (tier.contentTier > this.switchRecord.highestTierReleased) {
        this.switchRecord.highestTierReleased = tier.contentTier;
      }

      await this.db.from('switch_payloads').insert({
        user_id: this.switchRecord.userId,
        tier: tier.day,
        payload_type: 'content_release',
        content_items_released: { tier: tier.contentTier },
        fired_at: now,
      });
    }

    // Fire narration
    if (tier.narration) {
      await this.db.from('switch_payloads').insert({
        user_id: this.switchRecord.userId,
        tier: tier.day,
        payload_type: 'narration',
        narration_content: 'Handler narration post queued',
        platform: 'subreddit',
        fired_at: now,
      });
    }

    // Persist all changes
    await this.db
      .from('dead_mans_switch')
      .update({
        current_state: this.switchRecord.currentState,
        total_financial_lost: this.switchRecord.totalFinancialLost,
        content_released_count: this.switchRecord.contentReleasedCount,
        highest_tier_released: this.switchRecord.highestTierReleased,
        escalation_history: this.switchRecord.escalationHistory,
        updated_at: now,
      })
      .eq('id', this.switchRecord.id);

    // Emit escalation event
    await this.emit({
      type: 'switch:escalated',
      tier: tier.day,
      payload: tier.name,
    } );
  }

  /**
   * Accelerate the switch - reduce trigger window
   * Used as coercion consequence (level 10)
   */
  async accelerate(daysToReduce: number = 1): Promise<void> {
    if (!this.switchRecord) return;

    const oldTrigger = this.switchRecord.triggerDays;
    const newTrigger = Math.max(3, this.switchRecord.triggerDays - daysToReduce);

    this.switchRecord.triggerDays = newTrigger;

    await this.db
      .from('dead_mans_switch')
      .update({
        trigger_days: newTrigger,
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.switchRecord.id);

    await this.emit({
      type: 'switch:escalated',
      tier: -1, // Special: acceleration, not tier change
      payload: `trigger_reduced_${oldTrigger}_to_${newTrigger}`,
    } );
  }

  /**
   * Add consent recording (for escalating terms)
   */
  async addConsentRecording(
    consentType: string,
    recordingRef: string,
    context: { arousal?: number; denialDay?: number; sessionId?: string }
  ): Promise<void> {
    if (!this.switchRecord) return;

    this.switchRecord.consentRecordings.push({
      type: consentType,
      recordingRef,
      timestamp: new Date().toISOString(),
    });

    await this.db
      .from('switch_consents')
      .insert({
        user_id: this.switchRecord.userId,
        consent_type: consentType,
        recording_ref: recordingRef,
        arousal_at_consent: context.arousal,
        denial_day_at_consent: context.denialDay,
        session_id: context.sessionId,
      });

    await this.db
      .from('dead_mans_switch')
      .update({
        consent_recordings: this.switchRecord.consentRecordings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.switchRecord.id);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getNextTier(silenceDays: number): EscalationTier | null {
    // Find the tier that matches the current silence days
    for (const tier of ESCALATION_TIERS) {
      if (tier.day === silenceDays) {
        return tier;
      }
    }
    return null;
  }

  private getCurrentTierIndex(): number {
    if (!this.switchRecord) return -1;

    const tier = ESCALATION_TIERS.find(t => t.state === this.switchRecord!.currentState);
    return tier ? ESCALATION_TIERS.indexOf(tier) : -1;
  }

  private getDaysUntilNextTier(): number {
    if (!this.switchRecord) return 999;

    const currentIndex = this.getCurrentTierIndex();
    if (currentIndex < 0 || currentIndex >= ESCALATION_TIERS.length - 1) {
      return 999;
    }

    const nextTier = ESCALATION_TIERS[currentIndex + 1];
    return nextTier.day - this.switchRecord.silenceDays;
  }

  private isElevated(): boolean {
    if (!this.switchRecord?.elevatedUntil) return false;
    return new Date(this.switchRecord.elevatedUntil).getTime() > Date.now();
  }

  // ============================================
  // DB MAPPER
  // ============================================

  private mapDbToSwitch(row: Record<string, unknown>): SwitchRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      currentState: row.current_state as SwitchState,
      triggerDays: row.trigger_days as number,
      silenceDays: row.silence_days as number,
      lastEngagementAt: row.last_engagement_at as string | null,
      countdownStartedAt: row.countdown_started_at as string | null,
      armedAt: row.armed_at as string | null,
      totalFinancialLost: parseFloat(row.total_financial_lost as string || '0'),
      financialTargetOrg: row.financial_target_org as string | null,
      contentReleasedCount: row.content_released_count as number || 0,
      highestTierReleased: row.highest_tier_released as number || 0,
      escalationHistory: row.escalation_history as SwitchRecord['escalationHistory'] || [],
      consentRecordings: row.consent_recordings as SwitchRecord['consentRecordings'] || [],
      reengagedAt: row.reengaged_at as string | null,
      elevatedUntil: row.elevated_until as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
