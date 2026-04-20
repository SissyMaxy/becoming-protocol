// Chaturbate Stream Scheduler
//
// Manages cam schedule: pre-announces upcoming streams across platforms,
// nags Maxy to go live when scheduled, tracks consistency, and records
// streaks. Consistency beats duration — 3x30min/week > 1x3h/week.
//
// The scheduler checks every tick. When a stream window opens and Maxy
// hasn't gone live, it escalates through: reminder → nag → Handler
// attention queue → consequence.

import type { SupabaseClient } from '@supabase/supabase-js';

interface StreamSlot {
  day: number;  // 0=Sun..6=Sat
  hour: number; // 24h local
  durationMin: number;
}

// Default schedule: Tue/Thu/Sat evenings. User can override via DB.
const DEFAULT_SCHEDULE: StreamSlot[] = [
  { day: 2, hour: 20, durationMin: 30 },  // Tuesday 8pm
  { day: 4, hour: 20, durationMin: 30 },  // Thursday 8pm
  { day: 6, hour: 21, durationMin: 45 },  // Saturday 9pm
];

function getNextStreamSlot(schedule: StreamSlot[], now: Date = new Date()): { slot: StreamSlot; startsAt: Date } | null {
  const currentDay = now.getDay();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  for (let offset = 0; offset <= 7; offset++) {
    const checkDay = (currentDay + offset) % 7;
    for (const slot of schedule) {
      if (slot.day === checkDay) {
        const startsAt = new Date(now);
        startsAt.setDate(now.getDate() + offset);
        startsAt.setHours(slot.hour, 0, 0, 0);
        if (startsAt.getTime() > now.getTime()) {
          return { slot, startsAt };
        }
        // Check if we're inside the window right now
        if (offset === 0 && currentHour === slot.hour && currentMin < slot.durationMin) {
          return { slot, startsAt };
        }
      }
    }
  }
  return null;
}

function isInStreamWindow(schedule: StreamSlot[], now: Date = new Date()): StreamSlot | null {
  const day = now.getDay();
  const hour = now.getHours();
  const min = now.getMinutes();
  for (const slot of schedule) {
    if (slot.day === day && hour === slot.hour && min < slot.durationMin) {
      return slot;
    }
  }
  return null;
}

export async function checkStreamSchedule(
  sb: SupabaseClient,
  userId: string,
): Promise<{ action: 'none' | 'pre_announce' | 'go_live_now' | 'missed'; nextStream?: string; message?: string }> {
  const now = new Date();
  const schedule = DEFAULT_SCHEDULE;

  // Are we IN a stream window right now?
  const activeSlot = isInStreamWindow(schedule, now);
  if (activeSlot) {
    // Check if already live (announce-live would have fired)
    const { data: recentAnnounce } = await sb.from('ai_generated_content')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'chaturbate')
      .eq('generation_strategy', 'live_announce')
      .gte('posted_at', new Date(now.getTime() - 2 * 3600_000).toISOString())
      .maybeSingle();

    if (!recentAnnounce) {
      return {
        action: 'go_live_now',
        message: `Stream window open NOW. You're scheduled for ${activeSlot.durationMin}min. Get on Chaturbate.`,
      };
    }
    return { action: 'none' };
  }

  // Get next stream
  const next = getNextStreamSlot(schedule, now);
  if (!next) return { action: 'none' };

  const hoursUntil = (next.startsAt.getTime() - now.getTime()) / 3600_000;

  // Pre-announce 2 hours before
  if (hoursUntil <= 2 && hoursUntil > 1.5) {
    const { count: alreadyAnnounced } = await sb.from('ai_generated_content')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('generation_strategy', 'stream_pre_announce')
      .gte('posted_at', new Date(now.getTime() - 4 * 3600_000).toISOString());

    if ((alreadyAnnounced ?? 0) === 0) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return {
        action: 'pre_announce',
        nextStream: next.startsAt.toISOString(),
        message: `going live on chaturbate ${dayNames[next.slot.day]} at ${next.slot.hour > 12 ? next.slot.hour - 12 : next.slot.hour}${next.slot.hour >= 12 ? 'pm' : 'am'} — don't miss it 😈`,
      };
    }
  }

  // Nag 30 min before
  if (hoursUntil <= 0.5) {
    return {
      action: 'go_live_now',
      nextStream: next.startsAt.toISOString(),
      message: `Stream starts in ${Math.round(hoursUntil * 60)} minutes. Get ready.`,
    };
  }

  return { action: 'none', nextStream: next.startsAt.toISOString() };
}

export async function postStreamPreAnnounce(
  sb: SupabaseClient,
  userId: string,
  message: string,
): Promise<void> {
  await sb.from('ai_generated_content').insert({
    user_id: userId,
    content_type: 'tweet',
    platform: 'twitter',
    content: message,
    generation_strategy: 'stream_pre_announce',
    status: 'scheduled',
    scheduled_at: new Date().toISOString(),
  });
}

export async function recordStreamConsistency(
  sb: SupabaseClient,
  userId: string,
): Promise<{ streamsThisWeek: number; targetPerWeek: number; onTrack: boolean }> {
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { count } = await sb.from('ai_generated_content')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('platform', 'chaturbate')
    .eq('generation_strategy', 'live_announce')
    .gte('posted_at', weekAgo);

  const streamsThisWeek = count ?? 0;
  const targetPerWeek = DEFAULT_SCHEDULE.length;
  return { streamsThisWeek, targetPerWeek, onTrack: streamsThisWeek >= targetPerWeek };
}
