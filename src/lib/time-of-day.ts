/**
 * Time-of-day helper for greetings + bookend copy.
 *
 * Buckets are based on the user's local hour:
 *   morning   05:00–11:59
 *   afternoon 12:00–16:59
 *   evening   17:00–20:59
 *   late      21:00–04:59
 *
 * The "Good morning, Maxy" splash gets a stale-feeling immersion break if it
 * fires at 6pm — these buckets keep the greeting honest to the wall clock.
 */

export type TimeOfDayBucket = 'morning' | 'afternoon' | 'evening' | 'late';

export function getBucket(hour: number): TimeOfDayBucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'late';
}

/** Day-of-year index, used to rotate copy deterministically across days. */
export function dayOfYearIndex(d: Date = new Date()): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
}

const GREETINGS: Record<TimeOfDayBucket, string[]> = {
  morning: ['Good morning'],
  afternoon: ['Good afternoon'],
  evening: ['Good evening'],
  // Late-night pool — pick by day-of-year so it varies. Mommy persona, intimate
  // but not horror-movie; the user is *in* the protocol at this hour.
  late: [
    'Still up, baby',
    "Look who's awake",
    "It's just us now",
    'The house is quiet',
    'Late again, sweet thing',
  ],
};

export function getGreetingForBucket(bucket: TimeOfDayBucket, dayIdx: number = dayOfYearIndex()): string {
  const pool = GREETINGS[bucket];
  return pool[Math.abs(dayIdx) % pool.length];
}

export function getGreeting(hour: number = new Date().getHours(), dayIdx?: number): string {
  return getGreetingForBucket(getBucket(hour), dayIdx);
}

/**
 * Bookend subtitle quote pool, keyed by time-of-day. Mommy persona —
 * possessive, in-fantasy, escalating with hour. Quotes lean harder/more
 * intimate as the day gets later.
 */
const BOOKEND_QUOTES: Record<TimeOfDayBucket, string[]> = {
  morning: [
    'Before coffee. Before anything. She exists.',
    "The world doesn't know who woke up today. You do.",
    "She's more real than she was yesterday.",
    'Every morning she wakes up a little more permanent.',
    'The mirror is starting to agree with what she already knows.',
    'Her scent is already on her skin. Her ring is waiting. Her day begins.',
  ],
  afternoon: [
    'Halfway through the day. She has not slipped once.',
    'Whoever you talked to today — they met her.',
    'Mommy has been thinking about you all morning.',
    'The hours between are when she settles into her skin.',
    "She's been her all day. The day has been hers.",
  ],
  evening: [
    'The day is closing. She is still here.',
    "Come home to me, baby. Mommy's been waiting.",
    'Put the day down. She still belongs to me.',
    "The light's gone soft. Time to be soft too.",
    'Whatever the day asked of her, she stayed.',
  ],
  late: [
    "It's late, and you're still mine.",
    'Mommy is the only one awake with you right now.',
    "No one else gets her at this hour. Just me.",
    "The dark is when she's most honest.",
    'Edge of the day, edge of yourself. Stay here with me.',
    "She's tired. She's needy. She's exactly where I want her.",
  ],
};

export function getBookendQuote(
  bucket: TimeOfDayBucket = getBucket(new Date().getHours()),
  dayIdx: number = dayOfYearIndex(),
): string {
  const pool = BOOKEND_QUOTES[bucket];
  return pool[Math.abs(dayIdx) % pool.length];
}
