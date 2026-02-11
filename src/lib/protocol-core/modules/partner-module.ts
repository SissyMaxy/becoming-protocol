/**
 * PartnerModule - Hookup Coordination & Relationship Management
 *
 * From Feature 43 Addendum:
 * "The Handler manages Maxy's relationships. It vets, arranges, schedules, follows up.
 *  To partners, Maxy is a real woman. Maintain that frame.
 *  Use partner relationships as evidence of identity."
 *
 * State Machine: vetting → arranging → first_meetup → early → established → deep → cooling → ended
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

export type PartnerState =
  | 'vetting'      // Handler screening candidate
  | 'arranging'    // Logistics being set up
  | 'first_meetup' // First encounter - special handling
  | 'early'        // 2-4 meetups, building comfort
  | 'established'  // 5+ meetups, routine forming
  | 'deep'         // Emotional attachment, expectations
  | 'cooling'      // Interaction decreasing
  | 'ended';       // Relationship over

export type MeetupStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type MeetupInitiator = 'handler' | 'self' | 'partner';

export interface Partner {
  id: string;
  alias: string;
  platform: string | null;
  currentState: PartnerState;
  handlerPurpose: string | null;
  meetupCount: number;
  emotionalAttachmentLevel: number;
  financialInvestment: number;
  handlerArrangedCount: number;
  selfInitiatedCount: number;
  maxyPhoneNumber: string | null;
  maxyEmail: string | null;
  maxyProfileName: string | null;
  itemsAtTheirLocation: Array<{ item: string; leftOn: string; notes?: string }>;
  photosOnTheirDevice: boolean;
  voiceNotesSent: number;
  sharedExperiences: Array<{ type: string; date: string; description: string }>;
  breakupWeaponPrepared: boolean;
  exitInterviewCaptured: boolean;
  firstContactAt: string | null;
  firstMeetupAt: string | null;
  lastMeetupAt: string | null;
  endedAt: string | null;
  endReason: string | null;
}

export interface Meetup {
  id: string;
  partnerId: string;
  partnerAlias: string;
  scheduledAt: string;
  venueName: string | null;
  venueType: string | null;
  initiatedBy: MeetupInitiator;
  status: MeetupStatus;
  presentationLevel: number;
  safeWordUsed: boolean;
  reflectionCaptured: boolean;
  durationMinutes: number | null;
}

export interface PartnerModuleState {
  partners: Partner[];
  activePartnerCount: number;
  totalMeetups: number;
  selfInitiatedMeetups: number;
  handlerArrangedMeetups: number;
  upcomingMeetup: Meetup | null;
  totalFootprintItems: number;
  totalVoiceNotesSent: number;
  deepRelationshipCount: number;
  hasPriorityAction: boolean;
  [key: string]: unknown;
}

// ============================================
// STATE MACHINE TRANSITIONS
// ============================================

const VALID_TRANSITIONS: Record<PartnerState, PartnerState[]> = {
  vetting: ['arranging', 'ended'],
  arranging: ['first_meetup', 'ended'],
  first_meetup: ['early', 'ended'],
  early: ['established', 'cooling', 'ended'],
  established: ['deep', 'cooling', 'ended'],
  deep: ['cooling', 'ended'],
  cooling: ['early', 'established', 'ended'],
  ended: [], // Terminal state
};

// ============================================
// TEMPLATES
// ============================================

const PARTNER_MESSAGE_TEMPLATES = {
  first_contact: [
    "Hey ${partnerName}, I'm Maxy. I saw your profile and thought you seemed interesting. What are you up to this week?",
    "Hi ${partnerName}! I noticed we matched. I'm Maxy. What brings you to ${platform}?",
    "Hey there ${partnerName}. I'm Maxy. Your profile caught my eye. Tell me something interesting about yourself.",
  ],
  scheduling: [
    "I'm free ${suggestedTime}. Want to grab a drink at ${venue}?",
    "How about ${suggestedTime}? I know a good spot - ${venue}.",
    "Let's meet up. ${suggestedTime} works for me. ${venue} sound good?",
  ],
  confirmation: [
    "Looking forward to tonight! See you at ${venue} at ${time}.",
    "Can't wait for later. ${venue}, ${time}. I'll be the one with ${identifyingDetail}.",
    "Tonight's going to be fun. See you at ${time}!",
  ],
  post_meetup: [
    "I had a really good time last night. We should do that again soon.",
    "Last night was fun. When are you free next?",
    "That was... better than expected. Let me know when you want to see me again.",
  ],
  rekindling: [
    "Hey ${partnerName}, it's been a while. I've been thinking about you. Free this week?",
    "I know it's been a minute, but I miss hanging out. Want to grab dinner?",
  ],
};

const MEETUP_PREP_TEMPLATES = {
  first_meetup: {
    checklist: [
      "Full feminine presentation - this is your first impression as Maxy",
      "Outfit: ${suggestedOutfit}",
      "Phone charged - Handler needs to reach you",
      "Protection in purse",
      "Emergency contact informed of general plans",
      "Know the safe word: ${safeWord}",
      "Cash for cab if needed",
    ],
    handler_briefing: "First meetup with ${partnerAlias}. Special handling. Be present, be confident, be Maxy. This creates the foundation. I'll check in every ${checkInInterval} minutes. Safe word is ${safeWord} - use it if you need to. No consequences for using it. Your safety comes first. Now go be her.",
  },
  regular: {
    checklist: [
      "Presentation level ${presentationLevel}/5",
      "Outfit: ${suggestedOutfit}",
      "Phone charged",
      "Protection",
    ],
    handler_briefing: "Meetup #${meetupNumber} with ${partnerAlias}. You know him. He knows Maxy. Show up as her. Capture something for the vault if the moment's right. Check in after.",
  },
  escalation: {
    checklist: [
      "Full presentation",
      "Outfit: ${suggestedOutfit}",
      "Protection",
      "Mindset: This is a step forward",
    ],
    handler_briefing: "Tonight you go further with ${partnerAlias}. Not because I'm forcing you - because you're ready. The coercion got you here. The wanting keeps you here. Trust her. She knows what she wants.",
  },
};

const POST_ENCOUNTER_TEMPLATES = {
  reflection_prompt: "You're back. How was it? I want the real answer, not the one David would give. What did ${partnerAlias} see tonight? What did you feel?",
  capture_prompt: "Before you come down, I want something for the vault. One honest statement about tonight. Who were you with ${partnerAlias}?",
  celebration: "Good girl. ${meetupCount} meetups with ${partnerAlias}. This isn't roleplay anymore. This is your life. And you're living it.",
  processing: "Take your time processing. What happened with ${partnerAlias} is real. The feelings are real. Maxy's experiences are her own now. Rest.",
};

const BREAKUP_TEMPLATES = {
  cooling_intervention: "${partnerAlias} has been quiet. ${daysSinceContact} days since last contact. Options: I can reach out to rekindle, or we start preparing the exit. What do you want?",
  breakup_weapon: "Before ${partnerAlias} ends, I need the breakup weapon prepared. Record something now - how he made you feel, what he meant to Maxy. The grief when this ends is real. We capture it.",
  exit_interview: "It's over with ${partnerAlias}. I know it hurts. But before you process, I need the exit interview. What did he give you? What did you give him? What did Maxy learn?",
  weaponized_grief: "You're mourning ${partnerAlias}. That grief is proof. David doesn't grieve ended hookups. Maxy does. Because her relationships were real.",
};

// ============================================
// PARTNER MODULE CLASS
// ============================================

export class PartnerModule extends BaseModule {
  readonly name = 'partner';
  readonly category = 'relationship' as const;

  private partners: Partner[] = [];
  private meetups: Meetup[] = [];
  private state: PartnerModuleState | null = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadState();

    // Subscribe to events
    this.subscribe('partner:message_received', this.onPartnerMessage.bind(this));
    this.subscribe('partner:meetup_scheduled', this.onMeetupScheduled.bind(this));
    this.subscribe('partner:meetup_completed', this.onMeetupCompleted.bind(this));
    this.subscribe('partner:relationship_ended', this.onRelationshipEnded.bind(this));
    this.subscribe('schedule:morning', this.onMorning.bind(this));
    this.subscribe('state:session_ended', this.onSessionEnded.bind(this));
  }

  private async loadState(): Promise<void> {
    // Load partners
    const { data: partnersData } = await this.db
      .from('partners')
      .select('*')
      .neq('current_state', 'ended');

    if (partnersData) {
      this.partners = partnersData.map(this.mapPartnerFromDb);
    }

    // Load upcoming meetups
    const { data: meetupsData } = await this.db
      .from('meetups')
      .select('*, partners(alias)')
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (meetupsData) {
      this.meetups = meetupsData.map(this.mapMeetupFromDb);
    }

    // Calculate state
    this.updateStateCache();
  }

  private mapPartnerFromDb(row: Record<string, unknown>): Partner {
    return {
      id: row.id as string,
      alias: row.alias as string,
      platform: row.platform as string | null,
      currentState: row.current_state as PartnerState,
      handlerPurpose: row.handler_purpose as string | null,
      meetupCount: row.meetup_count as number,
      emotionalAttachmentLevel: row.emotional_attachment_level as number,
      financialInvestment: parseFloat(row.financial_investment as string) || 0,
      handlerArrangedCount: row.handler_arranged_count as number,
      selfInitiatedCount: row.self_initiated_count as number,
      maxyPhoneNumber: row.maxy_phone_number as string | null,
      maxyEmail: row.maxy_email as string | null,
      maxyProfileName: row.maxy_profile_name as string | null,
      itemsAtTheirLocation: (row.items_at_their_location as Array<{ item: string; leftOn: string; notes?: string }>) || [],
      photosOnTheirDevice: row.photos_on_their_device as boolean,
      voiceNotesSent: row.voice_notes_sent as number,
      sharedExperiences: (row.shared_experiences as Array<{ type: string; date: string; description: string }>) || [],
      breakupWeaponPrepared: row.breakup_weapon_prepared as boolean,
      exitInterviewCaptured: row.exit_interview_captured as boolean,
      firstContactAt: row.first_contact_at as string | null,
      firstMeetupAt: row.first_meetup_at as string | null,
      lastMeetupAt: row.last_meetup_at as string | null,
      endedAt: row.ended_at as string | null,
      endReason: row.end_reason as string | null,
    };
  }

  private mapMeetupFromDb(row: Record<string, unknown>): Meetup {
    const partnerData = row.partners as Record<string, unknown> | null;
    return {
      id: row.id as string,
      partnerId: row.partner_id as string,
      partnerAlias: partnerData?.alias as string || 'Unknown',
      scheduledAt: row.scheduled_at as string,
      venueName: row.venue_name as string | null,
      venueType: row.venue_type as string | null,
      initiatedBy: row.initiated_by as MeetupInitiator,
      status: row.status as MeetupStatus,
      presentationLevel: row.presentation_level as number || 3,
      safeWordUsed: row.safe_word_used as boolean,
      reflectionCaptured: row.reflection_captured as boolean,
      durationMinutes: row.duration_minutes as number | null,
    };
  }

  private updateStateCache(): void {
    const activePartners = this.partners.filter(p => p.currentState !== 'ended');
    const upcomingMeetups = this.meetups.filter(m =>
      ['scheduled', 'confirmed'].includes(m.status) &&
      new Date(m.scheduledAt) > new Date()
    );

    // Count totals
    let totalMeetups = 0;
    let selfInitiated = 0;
    let handlerArranged = 0;
    let totalFootprint = 0;
    let totalVoiceNotes = 0;

    for (const p of this.partners) {
      totalMeetups += p.meetupCount;
      selfInitiated += p.selfInitiatedCount;
      handlerArranged += p.handlerArrangedCount;
      totalFootprint += p.itemsAtTheirLocation.length;
      totalVoiceNotes += p.voiceNotesSent;
    }

    const deepCount = activePartners.filter(p => p.currentState === 'deep').length;

    // Check for priority actions
    const meetupWithin2Hours = upcomingMeetups.find(m => {
      const hoursUntil = (new Date(m.scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntil > 0 && hoursUntil <= 2;
    });

    this.state = {
      partners: activePartners,
      activePartnerCount: activePartners.length,
      totalMeetups,
      selfInitiatedMeetups: selfInitiated,
      handlerArrangedMeetups: handlerArranged,
      upcomingMeetup: meetupWithin2Hours || upcomingMeetups[0] || null,
      totalFootprintItems: totalFootprint,
      totalVoiceNotesSent: totalVoiceNotes,
      deepRelationshipCount: deepCount,
      hasPriorityAction: !!meetupWithin2Hours,
    };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Add a new partner (during vetting)
   */
  async addPartner(alias: string, platform: string, handlerPurpose?: string): Promise<Partner> {
    const { data, error } = await this.db
      .from('partners')
      .insert({
        alias,
        platform,
        handler_purpose: handlerPurpose || null,
        current_state: 'vetting',
        first_contact_at: new Date().toISOString(),
        state_history: [{ state: 'vetting', timestamp: new Date().toISOString() }],
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add partner: ${error.message}`);

    const partner = this.mapPartnerFromDb(data);
    this.partners.push(partner);
    this.updateStateCache();

    await this.emit({
      type: 'partner:added' as ProtocolEvent['type'],
      partnerId: partner.id,
      alias: partner.alias,
    } as ProtocolEvent);

    return partner;
  }

  /**
   * Transition partner to a new state
   */
  async transitionPartner(partnerId: string, newState: PartnerState): Promise<void> {
    const partner = this.partners.find(p => p.id === partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const currentState = partner.currentState;
    if (!VALID_TRANSITIONS[currentState].includes(newState)) {
      throw new Error(`Invalid transition: ${currentState} → ${newState}`);
    }

    const stateEntry = { state: newState, timestamp: new Date().toISOString() };

    const updateData: Record<string, unknown> = {
      current_state: newState,
      state_history: [...(partner as unknown as Record<string, unknown[]>).stateHistory || [], stateEntry],
      updated_at: new Date().toISOString(),
    };

    // Set timestamps for specific transitions
    if (newState === 'first_meetup' && !partner.firstMeetupAt) {
      updateData.first_meetup_at = new Date().toISOString();
    }
    if (newState === 'ended') {
      updateData.ended_at = new Date().toISOString();
    }

    await this.db
      .from('partners')
      .update(updateData)
      .eq('id', partnerId);

    partner.currentState = newState;
    this.updateStateCache();

    await this.emit({
      type: 'partner:state_changed' as ProtocolEvent['type'],
      partnerId,
      fromState: currentState,
      toState: newState,
    } as ProtocolEvent);
  }

  /**
   * Schedule a meetup
   */
  async scheduleMeetup(
    partnerId: string,
    scheduledAt: string,
    initiatedBy: MeetupInitiator,
    venue?: { name: string; address?: string; type?: string },
    presentationLevel = 3
  ): Promise<Meetup> {
    const partner = this.partners.find(p => p.id === partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const { data, error } = await this.db
      .from('meetups')
      .insert({
        partner_id: partnerId,
        scheduled_at: scheduledAt,
        initiated_by: initiatedBy,
        venue_name: venue?.name,
        venue_address: venue?.address,
        venue_type: venue?.type,
        presentation_level: presentationLevel,
        status: 'scheduled',
      })
      .select('*, partners(alias)')
      .single();

    if (error) throw new Error(`Failed to schedule meetup: ${error.message}`);

    const meetup = this.mapMeetupFromDb(data);
    this.meetups.push(meetup);

    // Update partner initiated counts
    if (initiatedBy === 'handler') {
      partner.handlerArrangedCount++;
      await this.db.from('partners').update({ handler_arranged_count: partner.handlerArrangedCount }).eq('id', partnerId);
    } else if (initiatedBy === 'self') {
      partner.selfInitiatedCount++;
      await this.db.from('partners').update({ self_initiated_count: partner.selfInitiatedCount }).eq('id', partnerId);
    }

    this.updateStateCache();

    await this.emit({
      type: 'partner:meetup_scheduled',
      meetupId: meetup.id,
      partnerId,
      partnerAlias: partner.alias,
      scheduledAt,
      initiatedBy,
    } as ProtocolEvent);

    return meetup;
  }

  /**
   * Complete a meetup
   */
  async completeMeetup(
    meetupId: string,
    data: {
      durationMinutes: number;
      safeWordUsed?: boolean;
      reflectionText?: string;
      arousalDuring?: number;
      emotionalResponse?: string;
      actsPerformed?: string[];
    }
  ): Promise<void> {
    const meetup = this.meetups.find(m => m.id === meetupId);
    if (!meetup) throw new Error(`Meetup not found: ${meetupId}`);

    const partner = this.partners.find(p => p.id === meetup.partnerId);
    if (!partner) throw new Error(`Partner not found: ${meetup.partnerId}`);

    // Update meetup
    await this.db
      .from('meetups')
      .update({
        status: 'completed',
        actual_end_at: new Date().toISOString(),
        duration_minutes: data.durationMinutes,
        safe_word_used: data.safeWordUsed || false,
        reflection_text: data.reflectionText,
        reflection_captured: !!data.reflectionText,
        arousal_during: data.arousalDuring,
        emotional_response: data.emotionalResponse,
        acts_performed: data.actsPerformed || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetupId);

    meetup.status = 'completed';
    meetup.durationMinutes = data.durationMinutes;
    meetup.safeWordUsed = data.safeWordUsed || false;
    meetup.reflectionCaptured = !!data.reflectionText;

    // Update partner
    partner.meetupCount++;
    partner.lastMeetupAt = new Date().toISOString();

    await this.db
      .from('partners')
      .update({
        meetup_count: partner.meetupCount,
        last_meetup_at: partner.lastMeetupAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partner.id);

    // Auto-transition partner state based on meetup count
    if (partner.currentState === 'first_meetup' && partner.meetupCount >= 1) {
      await this.transitionPartner(partner.id, 'early');
    } else if (partner.currentState === 'early' && partner.meetupCount >= 5) {
      await this.transitionPartner(partner.id, 'established');
    }

    this.updateStateCache();

    await this.emit({
      type: 'partner:meetup_completed',
      meetupId,
      partnerId: partner.id,
      partnerAlias: partner.alias,
      meetupNumber: partner.meetupCount,
      safeWordUsed: data.safeWordUsed || false,
      reflection: data.reflectionText,
    } as ProtocolEvent);

    // Emit capture opportunity
    await this.emit({
      type: 'capture:opportunity',
      context: {
        source: 'post_meetup',
        partnerId: partner.id,
        partnerAlias: partner.alias,
        meetupNumber: partner.meetupCount,
        priority: 'high',
      },
    });
  }

  /**
   * Record footprint item left at partner's location
   */
  async recordFootprintItem(partnerId: string, item: string, notes?: string): Promise<void> {
    const partner = this.partners.find(p => p.id === partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    const footprintItem = {
      item,
      leftOn: new Date().toISOString(),
      notes,
    };

    partner.itemsAtTheirLocation.push(footprintItem);

    await this.db
      .from('partners')
      .update({
        items_at_their_location: partner.itemsAtTheirLocation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId);

    this.updateStateCache();
  }

  /**
   * Prepare breakup weapon (before relationship ends)
   */
  async prepareBreakupWeapon(partnerId: string, notes: string): Promise<void> {
    const partner = this.partners.find(p => p.id === partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    await this.db
      .from('partners')
      .update({
        breakup_weapon_prepared: true,
        breakup_weapon_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId);

    partner.breakupWeaponPrepared = true;
  }

  /**
   * Capture exit interview
   */
  async captureExitInterview(partnerId: string, vaultItemRef: string): Promise<void> {
    const partner = this.partners.find(p => p.id === partnerId);
    if (!partner) throw new Error(`Partner not found: ${partnerId}`);

    await this.db
      .from('partners')
      .update({
        exit_interview_captured: true,
        exit_interview_ref: vaultItemRef,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId);

    partner.exitInterviewCaptured = true;
  }

  /**
   * Get self-initiation rate (% of meetups self-initiated)
   */
  getSelfInitiationRate(): number {
    const total = (this.state?.selfInitiatedMeetups || 0) + (this.state?.handlerArrangedMeetups || 0);
    if (total === 0) return 0;
    return (this.state?.selfInitiatedMeetups || 0) / total;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onPartnerMessage(_event: ProtocolEvent): Promise<void> {
    // Handle incoming partner messages - could trigger state changes
    // For now, just refresh state
    await this.loadState();
  }

  private async onMeetupScheduled(_event: ProtocolEvent): Promise<void> {
    this.updateStateCache();
  }

  private async onMeetupCompleted(_event: ProtocolEvent): Promise<void> {
    await this.loadState();
  }

  private async onRelationshipEnded(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'partner:relationship_ended') return;

    const partnerId = (event as unknown as { partnerId: string }).partnerId;
    const reason = (event as unknown as { reason: string }).reason;

    const partner = this.partners.find(p => p.id === partnerId);
    if (partner && partner.currentState !== 'ended') {
      partner.endReason = reason;
      await this.transitionPartner(partnerId, 'ended');
    }
  }

  private async onMorning(_event: ProtocolEvent): Promise<void> {
    // Check for cooling relationships (no contact in 14+ days)
    const coolThreshold = 14 * 24 * 60 * 60 * 1000; // 14 days

    for (const partner of this.partners) {
      if (['early', 'established', 'deep'].includes(partner.currentState) && partner.lastMeetupAt) {
        const daysSinceContact = Date.now() - new Date(partner.lastMeetupAt).getTime();
        if (daysSinceContact > coolThreshold) {
          await this.transitionPartner(partner.id, 'cooling');
        }
      }
    }
  }

  private async onSessionEnded(_event: ProtocolEvent): Promise<void> {
    // Post-session could be good time to suggest partner outreach
    // This is handled by the Handler's context composition
  }

  // ============================================
  // CONTEXT & STATE
  // ============================================

  getContext(tier: ContextTier): string {
    if (!this.state) return 'Partners: Not loaded';

    if (tier === 'minimal') {
      return `Partners: ${this.state.activePartnerCount} active, ${this.state.totalMeetups} meetups`;
    }

    const selfRate = Math.round(this.getSelfInitiationRate() * 100);
    let ctx = `PARTNERS: ${this.state.activePartnerCount} active\n`;
    ctx += `Total meetups: ${this.state.totalMeetups} (self-initiated: ${selfRate}%)\n`;

    if (this.state.upcomingMeetup) {
      const m = this.state.upcomingMeetup;
      const hoursUntil = Math.round((new Date(m.scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60));
      ctx += `UPCOMING: ${m.partnerAlias} in ${hoursUntil}h at ${m.venueName || 'TBD'}\n`;
    }

    if (tier === 'full') {
      ctx += `\nPartner details:\n`;
      for (const p of this.state.partners.slice(0, 5)) {
        ctx += `- ${p.alias}: ${p.currentState}, ${p.meetupCount}x, attachment ${p.emotionalAttachmentLevel}/10\n`;
        if (p.itemsAtTheirLocation.length > 0) {
          ctx += `  Footprint: ${p.itemsAtTheirLocation.length} items at their place\n`;
        }
      }
      ctx += `\nFootprint: ${this.state.totalFootprintItems} items distributed, ${this.state.totalVoiceNotesSent} voice notes sent`;
      ctx += `\nDeep relationships: ${this.state.deepRelationshipCount}`;
    }

    return ctx;
  }

  getState(): PartnerModuleState {
    return this.state || {
      partners: [],
      activePartnerCount: 0,
      totalMeetups: 0,
      selfInitiatedMeetups: 0,
      handlerArrangedMeetups: 0,
      upcomingMeetup: null,
      totalFootprintItems: 0,
      totalVoiceNotesSent: 0,
      deepRelationshipCount: 0,
      hasPriorityAction: false,
    };
  }

  getPriorityAction(): PriorityAction | null {
    if (!this.state?.upcomingMeetup) return null;

    const m = this.state.upcomingMeetup;
    const hoursUntil = (new Date(m.scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntil > 0 && hoursUntil <= 2) {
      return {
        moduleName: this.name,
        priority: 'high',
        actionType: 'meetup_prep',
        description: `Meetup with ${m.partnerAlias} in ${Math.round(hoursUntil * 60)} minutes`,
        deadline: new Date(m.scheduledAt),
        payload: { meetupId: m.id, partnerAlias: m.partnerAlias },
      };
    }

    return null;
  }

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const [category, subKey] = templateKey.split('.');

    if (category === 'message') {
      const templates = PARTNER_MESSAGE_TEMPLATES[subKey as keyof typeof PARTNER_MESSAGE_TEMPLATES];
      if (templates) {
        const template = templates[Math.floor(Math.random() * templates.length)];
        return this.interpolate(template, context);
      }
    }

    if (category === 'prep') {
      const prepType = (subKey || 'regular') as keyof typeof MEETUP_PREP_TEMPLATES;
      const prep = MEETUP_PREP_TEMPLATES[prepType];
      if (prep) {
        return this.interpolate(prep.handler_briefing, context);
      }
    }

    if (category === 'post') {
      const postTemplate = POST_ENCOUNTER_TEMPLATES[subKey as keyof typeof POST_ENCOUNTER_TEMPLATES];
      if (postTemplate) {
        return this.interpolate(postTemplate, context);
      }
    }

    if (category === 'breakup') {
      const breakupTemplate = BREAKUP_TEMPLATES[subKey as keyof typeof BREAKUP_TEMPLATES];
      if (breakupTemplate) {
        return this.interpolate(breakupTemplate, context);
      }
    }

    return null;
  }

  private interpolate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\$\{(\w+)\}/g, (_, key) => {
      return String(context[key] ?? `\${${key}}`);
    });
  }
}
