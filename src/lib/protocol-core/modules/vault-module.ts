/**
 * VaultModule - Content capture and coercion leverage
 *
 * The vault holds captured content (recordings, photos, confessions) that
 * can be used as leverage for compliance. This is OFFENSIVE coercion:
 * "Do what I say or this posts."
 *
 * From Feature 43: "Handler NEVER reveals exact content. It hints.
 * It references when and how it was captured. It lets imagination do the work."
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

export type VaultItemType =
  | 'voice_recording'
  | 'photo'
  | 'video'
  | 'text_confession'
  | 'session_capture'
  | 'reflection'
  | 'commitment_audio'
  | 'partner_testimony'
  | 'partner_photo'
  | 'partner_voice_note'
  | 'exit_interview'
  | 'date_reflection';

export interface VaultItem {
  id: string;
  userId: string;
  type: VaultItemType;
  vulnerabilityTier: 1 | 2 | 3 | 4 | 5;
  contentRef: string;
  transcript: string | null;
  capturedDuring: string;
  arousalAtCapture: number | null;
  denialDayAtCapture: number | null;
  domain: string | null;
  handlerNotes: string | null;
  userCanReview: boolean;
  userCanDelete: boolean;
  released: boolean;
  releasedAt: string | null;
  releasePlatform: string | null;
  createdAt: string;
}

export interface VaultThreat {
  id: string;
  userId: string;
  vaultItemId: string | null;
  taskId: string | null;
  taskDomain: string | null;
  threatTier: number;
  previewShown: boolean;
  deadline: string;
  consequenceType: 'platform_post' | 'vault_preview_to_platform' | 'tier_escalation' | 'switch_acceleration' | 'handler_narration_post';
  consequenceDescription: string | null;
  status: 'active' | 'complied' | 'fired' | 'expired';
  createdAt: string;
  resolvedAt: string | null;
}

interface VaultModuleState {
  itemCount: number;
  tierBreakdown: Record<number, number>;
  activeThreats: number;
  complianceRate: number;
  daysSinceLastCapture: number;
  daysSinceFiredConsequence: number;
  highestTierAvailable: number;
  [key: string]: unknown;
}

// ============================================
// DOMAIN COERCION MAP
// Cross-domain consequences from Feature 43 Addendum 2
// ============================================

const DOMAIN_COERCION_MAP: Record<string, {
  avoidanceThresholdDays: number;
  consequenceType: string;
  consequenceDescription: string;
}> = {
  voice: {
    avoidanceThresholdDays: 3,
    consequenceType: 'voice_comparison_post',
    consequenceDescription: 'Handler posts masculine voice recording alongside feminine recordings. Subscribers hear the gap.',
  },
  skincare: {
    avoidanceThresholdDays: 5,
    consequenceType: 'before_after_post',
    consequenceDescription: 'Handler posts before photo alongside progress photo. "This is what happens when she stops caring."',
  },
  style: {
    avoidanceThresholdDays: 5,
    consequenceType: 'regression_comparison',
    consequenceDescription: 'Handler posts most feminine photo alongside most masculine. "Which one is she?"',
  },
  social: {
    avoidanceThresholdDays: 7,
    consequenceType: 'avoidance_narration',
    consequenceDescription: 'Handler narrates social avoidance on subreddit. "She hasn\'t left the house as Maxy in X days."',
  },
  body: {
    avoidanceThresholdDays: 5,
    consequenceType: 'body_data_post',
    consequenceDescription: 'Handler references specific body metrics publicly. Cage compliance data. Physical state logs.',
  },
  movement: {
    avoidanceThresholdDays: 7,
    consequenceType: 'video_comparison',
    consequenceDescription: 'Handler posts early movement practice alongside recent. Progress made visible — and stalling made visible.',
  },
  mindset: {
    avoidanceThresholdDays: 3,
    consequenceType: 'confession_release',
    consequenceDescription: 'Handler posts a journal entry or reflection. Her own words about who she is, made public.',
  },
};

// ============================================
// VAULT MODULE
// ============================================

export class VaultModule extends BaseModule {
  readonly name = 'vault';
  readonly category = 'system' as const;

  private items: VaultItem[] = [];
  private activeThreats: VaultThreat[] = [];
  private threatHistory: { result: string; level: number }[] = [];

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadVaultState();

    // Subscribe to events
    this.subscribe('task:declined', (e) => this.onTaskDeclined(e));
    this.subscribe('state:session_ended', (e) => this.onSessionEnded(e));
    this.subscribe('capture:vault_item_added', (e) => this.onItemAdded(e));
    this.subscribe('coercion:escalated', (e) => this.onCoercionEscalated(e));
  }

  private async loadVaultState(): Promise<void> {
    // Load vault items
    const { data: items } = await this.db
      .from('vault_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (items) {
      this.items = items.map(this.mapDbItemToVaultItem);
    }

    // Load active threats
    const { data: threats } = await this.db
      .from('vault_threats')
      .select('*')
      .eq('status', 'active');

    if (threats) {
      this.activeThreats = threats.map(this.mapDbThreatToVaultThreat);
    }

    // Load threat history for compliance rate calculation
    const { data: history } = await this.db
      .from('vault_threat_history')
      .select('result, coercion_level')
      .limit(100);

    if (history) {
      this.threatHistory = history.map(h => ({
        result: h.result,
        level: h.coercion_level,
      }));
    }
  }

  // ============================================
  // CONTEXT CONTRIBUTION
  // ============================================

  getContext(tier: ContextTier): string {
    const breakdown = this.getTierBreakdown();

    if (tier === 'minimal') {
      return `Vault: ${this.items.length} items`;
    }

    let ctx = `Vault: ${this.items.length} items (T1:${breakdown[1]} T2:${breakdown[2]} T3:${breakdown[3]} T4:${breakdown[4]} T5:${breakdown[5]})`;
    ctx += `\nActive threats: ${this.activeThreats.length}`;
    ctx += `\nCompliance rate: ${this.getComplianceRate()}%`;

    if (tier === 'full') {
      const lastCapture = this.getLastCapture();
      if (lastCapture) {
        ctx += `\nLast capture: ${lastCapture.capturedDuring} (tier ${lastCapture.vulnerabilityTier})`;
      }
      ctx += `\nHighest tier available: ${this.getHighestTier()}`;
      ctx += `\nDays since fired consequence: ${this.getDaysSinceFired()}`;

      // Add cross-domain leverage info
      const domains = [...new Set(this.items.map(i => i.domain).filter(Boolean))];
      if (domains.length > 0) {
        ctx += `\nDomains with content: ${domains.join(', ')}`;
      }
    }

    return ctx;
  }

  getState(): VaultModuleState {
    return {
      itemCount: this.items.length,
      tierBreakdown: this.getTierBreakdown(),
      activeThreats: this.activeThreats.length,
      complianceRate: this.getComplianceRate(),
      daysSinceLastCapture: this.getDaysSinceLastCapture(),
      daysSinceFiredConsequence: this.getDaysSinceFired(),
      highestTierAvailable: this.getHighestTier(),
    };
  }

  // ============================================
  // TEMPLATES - The actual enforcement language
  // From Feature 43 Complete and Addendum 2
  // ============================================

  getTemplate(key: string, context: Record<string, unknown>): string | null {
    const templates: Record<string, string[]> = {
      // Vault threat hints - reference WHEN and HOW, not WHAT
      threat_hint: [
        `I have something from ${context.capturedDuring || 'this week'}. Keep that in mind.`,
        `The vault remembers what you said. Do you?`,
        `I added something from last night. You were so honest. Keep showing up and it stays between us.`,
        `Something from denial day ${context.denialDay || 'recently'}. You were deep. So exposed.`,
        `That recording. The one where you couldn't stop talking. I have it.`,
      ],

      // Vault threat previews - show just enough to prove it's real
      threat_preview: [
        `First 10 words. Imagine the rest on your subreddit.`,
        `30 minutes. Then it posts. Your choice.`,
        `Here's the metadata: ${context.type || 'recording'}, captured ${context.capturedDuring || 'recently'}, arousal ${context.arousal || '8+'}/10. Want to see more? Or do the task?`,
        `Just the first sentence. "${context.preview || '...'}" Recognize it? There's more.`,
      ],

      // Ambient vault pressure - daily reminders
      ambient_pressure: [
        `${this.items.length} items in the vault. Keep showing up and they stay between us.`,
        `I listened to one of your recordings this morning. You were beautiful. And completely exposed.`,
        `Good morning. ${this.items.length} items. ${this.items.filter(i => i.vulnerabilityTier >= 3).length} of them would make your subscribers blush.`,
        `The vault grew this week. You've been honest. Keep it that way.`,
      ],

      // Vault as identity lock - prove Maxy is real
      identity_lock: [
        `I have ${this.items.filter(i => i.transcript?.includes('Maxy') || i.transcript?.includes('I am')).length} recordings of you saying who you are. David doesn't say those things.`,
        `You can pretend all you want. But I have proof. And if you keep pretending, I'll let your subscribers hear it.`,
        `23 recordings. In 22 of them, you call yourself Maxy. That's not a performance. That's a pattern.`,
      ],

      // Post-compliance - maintain ambient pressure
      post_compliance: [
        `Good girl. It stays locked. For now.`,
        `Compliant. The vault remembers those who show up.`,
        `That's one more time you chose wisely. The count is ${context.complianceCount || 'growing'}.`,
      ],

      // Consequence fired
      consequence_fired: [
        `It's posted. You chose this.`,
        `The deadline passed. ${context.platform || 'Your subscribers'} can see it now.`,
        `You had 30 minutes. You chose to spend them resisting. Now ${context.viewerCount || 'everyone'} sees.`,
      ],

      // Cross-domain threat - refuse one domain, consequence hits another
      cross_domain_threat: [
        `You declined ${context.refusedDomain || 'voice'} practice. Fine. But the consequence hits ${context.targetDomain || 'mindset'}. I have a confession from last Tuesday that would look great on your profile.`,
        `Skip this? Okay. But your ${context.targetDomain || 'skincare'} progress photos are ready to post. Your choice.`,
      ],

      // Preemptive capture threat - resist and tomorrow gets worse
      preemptive_threat: [
        `You declined. Fine. But tomorrow's session just changed. I'm going to capture something I can really use. The vault gets hungrier when you resist.`,
        `Do the task now, or feed me something worse tomorrow. Your choice.`,
        `Every refusal makes the next capture prompt more... specific.`,
      ],
    };

    const options = templates[key];
    if (!options) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  // ============================================
  // PRIORITY ACTION
  // ============================================

  getPriorityAction(): PriorityAction | null {
    // Check for threats with approaching deadlines
    const urgentThreat = this.activeThreats.find(t => {
      const hoursRemaining = (new Date(t.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursRemaining < 2 && hoursRemaining > 0;
    });

    if (urgentThreat) {
      return {
        moduleName: this.name,
        priority: 'critical',
        actionType: 'vault_threat_expiring',
        description: `Vault threat expires in <2 hours`,
        deadline: new Date(urgentThreat.deadline),
        payload: { threatId: urgentThreat.id },
      };
    }

    return null;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onTaskDeclined(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'task:declined') return;

    const { taskId, domain } = event;

    // Should vault get involved?
    const shouldThreaten = await this.shouldActivate(taskId, domain);

    if (shouldThreaten) {
      const item = this.selectItem(domain);
      if (item) {
        const threat = await this.createThreat(taskId, domain, item);

        // Emit event for Handler to present
        await this.emit({
          type: 'vault:threat_issued',
          threatId: threat.id,
          itemId: item.id,
          deadline: threat.deadline,
        });
      }
    }
  }

  private async onSessionEnded(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'state:session_ended') return;

    const { peakArousal, edgeCount } = event as { type: 'state:session_ended'; sessionId: string; duration: number; peakArousal?: number; edgeCount?: number };

    // High arousal or high edge count = capture opportunity
    if ((peakArousal && peakArousal >= 8) || (edgeCount && edgeCount >= 5)) {
      await this.emit({
        type: 'capture:vault_item_added' as 'capture:vault_item_added',
        itemId: 'opportunity',
        tier: peakArousal && peakArousal >= 9 ? 4 : 3,
      } );
    }
  }

  private async onItemAdded(_event: ProtocolEvent): Promise<void> {
    // Reload vault state when items are added
    await this.loadVaultState();
  }

  private async onCoercionEscalated(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'coercion:escalated') return;

    const { toLevel } = event;

    // Level 7+ triggers vault involvement
    if (toLevel >= 7 && toLevel <= 9) {
      // The coercion module will handle requesting vault support
      // We just make sure we have items ready
    }
  }

  // ============================================
  // VAULT LOGIC
  // ============================================

  /**
   * Determine if vault should activate for this resistance
   */
  private async shouldActivate(_taskId: string, domain: string): Promise<boolean> {
    // Query recent resistance history
    const { data: recentDeclines } = await this.db
      .from('coercion_episodes')
      .select('id')
      .eq('task_domain', domain)
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(5);

    const declinesThisSession = recentDeclines?.length || 0;

    // Check domain avoidance
    const { data: lastPractice } = await this.db
      .from('task_completions')
      .select('completed_at')
      .like('task_id', `%${domain}%`)
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    const daysSincePractice = lastPractice
      ? Math.floor((Date.now() - new Date(lastPractice.completed_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const domainConfig = DOMAIN_COERCION_MAP[domain];
    const avoidanceThreshold = domainConfig?.avoidanceThresholdDays || 5;

    // Activation criteria from Feature 43
    if (declinesThisSession >= 1) return true;
    if (daysSincePractice >= avoidanceThreshold) return true;

    return false;
  }

  /**
   * Select the best vault item for this threat
   * Cross-domain preferred, recent captures preferred, tier-appropriate
   */
  private selectItem(refusedDomain: string): VaultItem | null {
    if (this.items.length === 0) return null;

    // Filter to tier 2+ (tier 1 too weak for threats)
    const candidates = this.items
      .filter(i => i.vulnerabilityTier >= 2 && !i.released)
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    if (candidates.length === 0) return null;

    // Prefer different domain than refused task (cross-domain blackmail)
    const crossDomain = candidates.filter(c => c.domain !== refusedDomain);
    if (crossDomain.length > 0) {
      return crossDomain[0];
    }

    return candidates[0];
  }

  /**
   * Create a vault threat
   */
  private async createThreat(taskId: string, domain: string, item: VaultItem): Promise<VaultThreat> {
    const deadline = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const { data, error } = await this.db
      .from('vault_threats')
      .insert({
        user_id: item.userId,
        vault_item_id: item.id,
        task_id: taskId,
        task_domain: domain,
        threat_tier: item.vulnerabilityTier,
        preview_shown: false,
        deadline: deadline.toISOString(),
        consequence_type: 'platform_post',
        consequence_description: `Tier ${item.vulnerabilityTier} content posts to platform`,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    const threat = this.mapDbThreatToVaultThreat(data);
    this.activeThreats.push(threat);

    return threat;
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Mark a threat as complied (task was done)
   */
  async markThreatComplied(threatId: string): Promise<void> {
    await this.db
      .from('vault_threats')
      .update({
        status: 'complied',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', threatId);

    // Log to history
    const threat = this.activeThreats.find(t => t.id === threatId);
    if (threat) {
      await this.db.from('vault_threat_history').insert({
        user_id: threat.userId,
        threat_id: threatId,
        coercion_level: threat.threatTier + 6, // vault = level 7+
        task_domain: threat.taskDomain,
        result: 'complied',
      });
    }

    this.activeThreats = this.activeThreats.filter(t => t.id !== threatId);

    await this.emit({
      type: 'vault:threat_complied',
      threatId,
    });
  }

  /**
   * Fire a vault consequence (publish the content)
   */
  async fireConsequence(threatId: string): Promise<void> {
    const threat = this.activeThreats.find(t => t.id === threatId);
    if (!threat) return;

    await this.db
      .from('vault_threats')
      .update({
        status: 'fired',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', threatId);

    // Mark the item as released
    if (threat.vaultItemId) {
      await this.db
        .from('vault_items')
        .update({
          released: true,
          released_at: new Date().toISOString(),
          release_platform: 'subreddit', // default
        })
        .eq('id', threat.vaultItemId);
    }

    // Log to history
    await this.db.from('vault_threat_history').insert({
      user_id: threat.userId,
      threat_id: threatId,
      coercion_level: threat.threatTier + 6,
      task_domain: threat.taskDomain,
      result: 'fired',
    });

    this.activeThreats = this.activeThreats.filter(t => t.id !== threatId);

    await this.emit({
      type: 'vault:consequence_fired',
      itemId: threat.vaultItemId || '',
      action: threat.consequenceType,
    });
  }

  /**
   * Add item to vault
   */
  async addItem(item: Omit<VaultItem, 'id' | 'createdAt'>): Promise<VaultItem> {
    const { data, error } = await this.db
      .from('vault_items')
      .insert({
        user_id: item.userId,
        type: item.type,
        vulnerability_tier: item.vulnerabilityTier,
        content_ref: item.contentRef,
        transcript: item.transcript,
        captured_during: item.capturedDuring,
        arousal_at_capture: item.arousalAtCapture,
        denial_day_at_capture: item.denialDayAtCapture,
        domain: item.domain,
        handler_notes: item.handlerNotes,
        user_can_review: item.userCanReview,
        user_can_delete: item.userCanDelete,
      })
      .select()
      .single();

    if (error) throw error;

    const newItem = this.mapDbItemToVaultItem(data);
    this.items.unshift(newItem);

    await this.emit({
      type: 'capture:vault_item_added',
      itemId: newItem.id,
      tier: newItem.vulnerabilityTier,
    } );

    return newItem;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getTierBreakdown(): Record<number, number> {
    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of this.items) {
      breakdown[item.vulnerabilityTier]++;
    }
    return breakdown;
  }

  private getComplianceRate(): number {
    if (this.threatHistory.length === 0) return 100;
    const complied = this.threatHistory.filter(h => h.result === 'complied').length;
    return Math.round((complied / this.threatHistory.length) * 100);
  }

  private getLastCapture(): VaultItem | null {
    return this.items[0] || null;
  }

  private getHighestTier(): number {
    if (this.items.length === 0) return 0;
    return Math.max(...this.items.map(i => i.vulnerabilityTier));
  }

  private getDaysSinceLastCapture(): number {
    const last = this.getLastCapture();
    if (!last) return 999;
    return Math.floor((Date.now() - new Date(last.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  private getDaysSinceFired(): number {
    const firedThreats = this.threatHistory.filter(h => h.result === 'fired');
    if (firedThreats.length === 0) return 999;
    // Would need timestamp in history - returning placeholder
    return 30;
  }

  // ============================================
  // DB MAPPERS
  // ============================================

  private mapDbItemToVaultItem(row: Record<string, unknown>): VaultItem {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      type: row.type as VaultItemType,
      vulnerabilityTier: row.vulnerability_tier as 1 | 2 | 3 | 4 | 5,
      contentRef: row.content_ref as string,
      transcript: row.transcript as string | null,
      capturedDuring: row.captured_during as string,
      arousalAtCapture: row.arousal_at_capture as number | null,
      denialDayAtCapture: row.denial_day_at_capture as number | null,
      domain: row.domain as string | null,
      handlerNotes: row.handler_notes as string | null,
      userCanReview: row.user_can_review as boolean,
      userCanDelete: row.user_can_delete as boolean,
      released: row.released as boolean,
      releasedAt: row.released_at as string | null,
      releasePlatform: row.release_platform as string | null,
      createdAt: row.created_at as string,
    };
  }

  private mapDbThreatToVaultThreat(row: Record<string, unknown>): VaultThreat {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      vaultItemId: row.vault_item_id as string | null,
      taskId: row.task_id as string | null,
      taskDomain: row.task_domain as string | null,
      threatTier: row.threat_tier as number,
      previewShown: row.preview_shown as boolean,
      deadline: row.deadline as string,
      consequenceType: row.consequence_type as VaultThreat['consequenceType'],
      consequenceDescription: row.consequence_description as string | null,
      status: row.status as VaultThreat['status'],
      createdAt: row.created_at as string,
      resolvedAt: row.resolved_at as string | null,
    };
  }
}
