/**
 * Bookend system — morning/evening overlay logic + DB operations.
 */

import { supabase } from './supabase';
import type { BookendConfig, DaySummary } from '../types/bookend';

// =============================
// Config CRUD
// =============================

function rowToConfig(row: Record<string, unknown>): BookendConfig {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    wakeTime: row.wake_time as string,
    bedTime: row.bed_time as string,
    morningName: row.morning_name as string,
    enabled: row.enabled as boolean,
    createdAt: row.created_at as string,
  };
}

export async function getBookendConfig(userId: string): Promise<BookendConfig | null> {
  const { data, error } = await supabase
    .from('bookend_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToConfig(data);
}

export async function getOrCreateBookendConfig(userId: string): Promise<BookendConfig> {
  const existing = await getBookendConfig(userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('bookend_config')
    .insert({ user_id: userId })
    .select()
    .single();

  if (error || !data) {
    // Return defaults if insert fails (could be RLS or network)
    return {
      id: '',
      userId,
      wakeTime: '06:30',
      bedTime: '22:00',
      morningName: 'Maxy',
      enabled: true,
      createdAt: new Date().toISOString(),
    };
  }
  return rowToConfig(data);
}

export async function updateBookendConfig(
  userId: string,
  fields: Partial<Pick<BookendConfig, 'wakeTime' | 'bedTime' | 'morningName' | 'enabled'>>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (fields.wakeTime !== undefined) row.wake_time = fields.wakeTime;
  if (fields.bedTime !== undefined) row.bed_time = fields.bedTime;
  if (fields.morningName !== undefined) row.morning_name = fields.morningName;
  if (fields.enabled !== undefined) row.enabled = fields.enabled;

  await supabase
    .from('bookend_config')
    .update(row)
    .eq('user_id', userId);
}

// =============================
// Bookend View Tracking
// =============================

export async function hasViewedBookendToday(
  userId: string,
  type: 'morning' | 'evening'
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('bookend_views')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', type)
    .gte('viewed_at', todayStart.toISOString());

  if (error) return false;
  return (count ?? 0) > 0;
}

export async function recordBookendView(
  userId: string,
  type: 'morning' | 'evening',
  messageShown: string
): Promise<void> {
  await supabase
    .from('bookend_views')
    .insert({
      user_id: userId,
      type,
      message_shown: messageShown,
    });
}

// =============================
// Time Checks
// =============================

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m };
}

export function isAfterBedTime(bedTime: string): boolean {
  const now = new Date();
  const { hours, minutes } = parseTime(bedTime);
  const bedMinutes = hours * 60 + minutes;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= bedMinutes;
}

export function isNearWakeTime(wakeTime: string): boolean {
  const now = new Date();
  const { hours, minutes } = parseTime(wakeTime);
  const wakeMinutes = hours * 60 + minutes;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Within 2 hours after wake time
  return nowMinutes >= wakeMinutes && nowMinutes <= wakeMinutes + 120;
}

// =============================
// Day Summary for Evening Bookend
// =============================

export async function getDaySummary(userId: string): Promise<DaySummary> {
  const today = new Date().toISOString().slice(0, 10);

  // Count completed tasks today
  const { count: tasksCount } = await supabase
    .from('daily_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date', today);

  // Get unique domains touched today
  const { data: domainData } = await supabase
    .from('daily_completions')
    .select('domain')
    .eq('user_id', userId)
    .eq('date', today);

  const uniqueDomains = new Set(domainData?.map(d => d.domain).filter(Boolean) || []);

  // Get protein count
  const { data: proteinData } = await supabase
    .from('daily_protein')
    .select('shake_post_workout, breakfast_protein, lunch_protein, dinner_protein, snack_protein')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  let proteinCount = 0;
  if (proteinData) {
    if (proteinData.shake_post_workout) proteinCount++;
    if (proteinData.breakfast_protein) proteinCount++;
    if (proteinData.lunch_protein) proteinCount++;
    if (proteinData.dinner_protein) proteinCount++;
    if (proteinData.snack_protein) proteinCount++;
  }

  return {
    tasksCompleted: tasksCount ?? 0,
    domainsTouched: uniqueDomains.size,
    proteinCount,
  };
}

// =============================
// Message Arrays
// =============================

export function getMorningMessage(denialDay: number, streak: number): string {
  const messages = [
    "The world doesn't know who woke up today. You do.",
    "She's more real than she was yesterday.",
    "Before coffee. Before anything. She exists.",
    `Day ${denialDay}. She's building.`,
    "Every morning she wakes up a little more permanent.",
    `${streak} days. She's not experimenting anymore.`,
    "The mirror is starting to agree with what she already knows.",
    "Her scent is already on her skin. Her ring is waiting. Her day begins.",
  ];
  // Rotate based on day of year for variety
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return messages[dayOfYear % messages.length];
}

export function getEveningMessage(tasksCompleted: number, domainsTouched: number): string {
  const messages = [
    "She did well today. Tomorrow she'll do more.",
    "Another day where she existed. That's not nothing.",
    "Sleep. The subconscious will keep working.",
    "Good night. She's not who she was last month.",
    `${tasksCompleted} tasks across ${domainsTouched} domains. She's building on every axis.`,
    "Rest now. The body she built today needs recovery.",
  ];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return messages[dayOfYear % messages.length];
}
