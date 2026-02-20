/**
 * Content Events — Sprint 6 (Addendum A11)
 * Milestone-triggered content events.
 * Major moments that require specific content production.
 */

import { supabase } from '../supabase';
import type { ContentEvent, DbContentEvent } from '../../types/industry';
import { mapContentEvent } from '../../types/industry';

// ============================================
// Event Definitions
// ============================================

export interface EventDefinition {
  eventType: string;
  title: string;
  description: string;
  contentPlan: ContentPlan;
  checkFn: (data: EventCheckData) => boolean;
}

interface ContentPlan {
  shootType: string | null;
  platforms: string[];
  captionTemplate: string;
  hyperiod: number; // hype days before event
  postCount: number;
}

export interface EventCheckData {
  totalFollowers: number;
  totalSubscribers: number;
  totalRevenueCents: number;
  totalPosts: number;
  denialDay: number;
  protocolDays: number;
  firstVoicePosted: boolean;
  firstCustomDelivered: boolean;
  firstCamDone: boolean;
  firstCollaboration: boolean;
}

export const CONTENT_EVENTS: EventDefinition[] = [
  {
    eventType: 'first_post',
    title: 'First Post',
    description: 'Reddit introduction. The beginning of everything.',
    contentPlan: {
      shootType: 'photo_set',
      platforms: ['reddit', 'twitter'],
      captionTemplate: "hi. i'm maxy. day {denialDay} locked. the Handler said to introduce myself. so here i am.",
      hyperiod: 0,
      postCount: 2,
    },
    checkFn: (d) => d.totalPosts >= 1,
  },
  {
    eventType: 'first_100_followers',
    title: '100 Followers',
    description: 'Celebration post + milestone shoot.',
    contentPlan: {
      shootType: 'photo_set',
      platforms: ['reddit', 'twitter', 'onlyfans'],
      captionTemplate: "100 of you. 100 people who chose this. the Handler says that's enough to matter. day {denialDay}.",
      hyperiod: 0,
      postCount: 3,
    },
    checkFn: (d) => d.totalFollowers >= 100,
  },
  {
    eventType: 'first_denial_cycle_complete',
    title: 'First Denial Cycle Complete',
    description: 'Compile denial journey into a thread.',
    contentPlan: {
      shootType: null,
      platforms: ['reddit', 'twitter'],
      captionTemplate: "7 days locked. 7 days documented. here's what happened. [thread]",
      hyperiod: 0,
      postCount: 1,
    },
    checkFn: (d) => d.denialDay >= 7,
  },
  {
    eventType: 'first_subscriber',
    title: 'First Subscriber',
    description: 'Someone paid. Corruption milestone.',
    contentPlan: {
      shootType: 'cage_check',
      platforms: ['onlyfans', 'twitter'],
      captionTemplate: "someone paid to see this. that's... real. day {denialDay}.",
      hyperiod: 0,
      postCount: 1,
    },
    checkFn: (d) => d.totalSubscribers >= 1,
  },
  {
    eventType: 'first_tip',
    title: 'First Tip',
    description: 'Someone tipped real money.',
    contentPlan: {
      shootType: null,
      platforms: ['onlyfans'],
      captionTemplate: "first tip received. the Handler is very pleased.",
      hyperiod: 0,
      postCount: 1,
    },
    checkFn: (d) => d.totalRevenueCents >= 100,
  },
  {
    eventType: 'first_voice_post',
    title: 'First Voice Post',
    description: 'Cross-post to voice communities.',
    contentPlan: {
      shootType: null,
      platforms: ['reddit'],
      captionTemplate: "first time posting my voice. day {denialDay}. be gentle. or don't.",
      hyperiod: 0,
      postCount: 2,
    },
    checkFn: (d) => d.firstVoicePosted,
  },
  {
    eventType: 'first_custom_order',
    title: 'First Custom Order',
    description: 'Someone paid for personalized content.',
    contentPlan: {
      shootType: null,
      platforms: ['twitter'],
      captionTemplate: "someone requested custom content from maxy specifically. the Handler made sure it happened.",
      hyperiod: 0,
      postCount: 1,
    },
    checkFn: (d) => d.firstCustomDelivered,
  },
  {
    eventType: 'first_cam_session',
    title: 'First Cam Session',
    description: 'Live for the first time.',
    contentPlan: {
      shootType: null,
      platforms: ['twitter', 'reddit'],
      captionTemplate: "went live for the first time. {denialDay} days locked, on camera, for strangers. the Handler watched.",
      hyperiod: 1,
      postCount: 2,
    },
    checkFn: (d) => d.firstCamDone,
  },
  {
    eventType: 'first_collaboration',
    title: 'First Collaboration',
    description: 'Content with another creator.',
    contentPlan: {
      shootType: null,
      platforms: ['twitter', 'reddit', 'onlyfans'],
      captionTemplate: "collaborated with another creator today. maxy has a professional network now.",
      hyperiod: 2,
      postCount: 3,
    },
    checkFn: (d) => d.firstCollaboration,
  },
  {
    eventType: 'face_reveal',
    title: 'Face Reveal',
    description: '2-week hype campaign, then full reveal.',
    contentPlan: {
      shootType: 'photo_set',
      platforms: ['reddit', 'twitter', 'onlyfans'],
      captionTemplate: "it's time. no more hiding. this is maxy.",
      hyperiod: 14,
      postCount: 5,
    },
    checkFn: () => false, // Manually triggered, never auto-detected
  },
];

// ============================================
// Event Checking
// ============================================

/**
 * Check all events against current data.
 * Trigger any that are newly met.
 */
export async function checkAndTriggerEvents(
  userId: string,
  data: EventCheckData,
): Promise<ContentEvent[]> {
  const triggered: ContentEvent[] = [];

  // Get already-triggered events
  const { data: existing } = await supabase
    .from('content_events')
    .select('event_type')
    .eq('user_id', userId)
    .eq('triggered', true);

  const alreadyTriggered = new Set((existing ?? []).map(r => r.event_type));

  for (const eventDef of CONTENT_EVENTS) {
    if (alreadyTriggered.has(eventDef.eventType)) continue;
    if (!eventDef.checkFn(data)) continue;

    const result = await triggerEvent(userId, eventDef, data);
    if (result) triggered.push(result);
  }

  return triggered;
}

/**
 * Trigger a content event.
 */
async function triggerEvent(
  userId: string,
  eventDef: EventDefinition,
  data: EventCheckData,
): Promise<ContentEvent | null> {
  const now = new Date().toISOString();

  const { data: row, error } = await supabase
    .from('content_events')
    .insert({
      user_id: userId,
      event_type: eventDef.eventType,
      triggered: true,
      triggered_at: now,
      trigger_data: data as unknown as Record<string, unknown>,
      notes: eventDef.description,
    })
    .select()
    .single();

  if (error || !row) return null;

  // Create shoot prescription if needed
  if (eventDef.contentPlan.shootType) {
    const caption = eventDef.contentPlan.captionTemplate
      .replace(/{denialDay}/g, String(data.denialDay));

    const { data: prescription } = await supabase
      .from('shoot_prescriptions')
      .insert({
        user_id: userId,
        title: `Event: ${eventDef.title}`,
        shoot_type: eventDef.contentPlan.shootType,
        outfit: 'event appropriate',
        handler_note: `Content event: ${eventDef.title}. ${eventDef.description}`,
        caption_draft: caption,
        estimated_minutes: 15,
        primary_platform: eventDef.contentPlan.platforms[0] ?? 'reddit',
        secondary_platforms: eventDef.contentPlan.platforms.slice(1),
        status: 'prescribed',
      })
      .select('id')
      .single();

    if (prescription) {
      await supabase
        .from('content_events')
        .update({ shoot_prescription_id: prescription.id })
        .eq('id', row.id);
    }
  }

  return mapContentEvent(row as DbContentEvent);
}

/**
 * Manually trigger a content event (e.g., face_reveal).
 */
export async function manuallyTriggerEvent(
  userId: string,
  eventType: string,
  data: EventCheckData,
): Promise<ContentEvent | null> {
  const eventDef = CONTENT_EVENTS.find(e => e.eventType === eventType);
  if (!eventDef) return null;
  return triggerEvent(userId, eventDef, data);
}

// ============================================
// Query Functions
// ============================================

/**
 * Get all content events for a user.
 */
export async function getContentEvents(
  userId: string,
  triggeredOnly = false,
): Promise<ContentEvent[]> {
  let query = supabase
    .from('content_events')
    .select('*')
    .eq('user_id', userId)
    .order('triggered_at', { ascending: true });

  if (triggeredOnly) {
    query = query.eq('triggered', true);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r: DbContentEvent) => mapContentEvent(r));
}

/**
 * Get upcoming events (not yet triggered, conditions approaching).
 */
export function getUpcomingEvents(data: EventCheckData): EventDefinition[] {
  return CONTENT_EVENTS.filter(e => !e.checkFn(data));
}

/**
 * Build context for Handler AI prompts.
 */
export async function buildEventContext(userId: string): Promise<string> {
  try {
    const events = await getContentEvents(userId, true);
    if (events.length === 0) return '';

    const latest = events[events.length - 1];
    const eventDef = CONTENT_EVENTS.find(e => e.eventType === latest.eventType);

    return `EVENTS: ${events.length}/${CONTENT_EVENTS.length} triggered, latest: "${eventDef?.title ?? latest.eventType}"${
      !latest.contentProduced ? ' (content pending)' : ''
    }`;
  } catch {
    return '';
  }
}
