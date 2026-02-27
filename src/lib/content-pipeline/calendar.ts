/**
 * Content Pipeline — Calendar
 *
 * Weekly content calendar generation, slot assignment, queries.
 * Handler plans the week. David doesn't look at the calendar.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { ContentCalendarDay, CalendarSlot, Platform, SlotStatus } from '../../types/content-pipeline';

// ── Generate weekly calendar ────────────────────────────

export async function generateWeeklyCalendar(userId: string): Promise<ContentCalendarDay[]> {
  // Get active arc for context
  const { data: arc } = await supabase
    .from('narrative_arcs')
    .select('*')
    .eq('user_id', userId)
    .in('arc_status', ['active', 'planned'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // AI generates the calendar
  const { data: aiResult } = await invokeWithAuth('handler-ai', {
    action: 'generate_content_calendar',
    arc: arc || null,
    user_id: userId,
  });

  // Build 7 days of calendar
  const days: ContentCalendarDay[] = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    // Get AI-generated slots for this day, or use defaults
    const aiDays = (aiResult && typeof aiResult === 'object')
      ? (aiResult as Record<string, unknown>).days as Array<{
          slots: CalendarSlot[];
          beat_label?: string;
          revenue_target_cents?: number;
        }> | undefined
      : undefined;

    const aiDay = aiDays?.[i];
    const defaultSlots: CalendarSlot[] = [
      { time: '10:00', platform: 'twitter' as Platform, status: 'open' },
      { time: '14:00', platform: 'reddit' as Platform, status: 'open' },
      { time: '20:00', platform: 'onlyfans' as Platform, status: 'open' },
    ];

    const { data, error } = await supabase
      .from('content_calendar')
      .upsert({
        user_id: userId,
        calendar_date: dateStr,
        slots: aiDay?.slots || defaultSlots,
        narrative_arc_id: arc?.id || null,
        beat_label: aiDay?.beat_label || null,
        revenue_target_cents: aiDay?.revenue_target_cents || 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,calendar_date',
      })
      .select('*')
      .single();

    if (!error && data) {
      days.push(data as ContentCalendarDay);
    }
  }

  return days;
}

// ── Assign vault item to slot ───────────────────────────

export async function assignToSlot(
  userId: string,
  date: string,
  slotIndex: number,
  vaultId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('content_calendar')
    .select('slots')
    .eq('user_id', userId)
    .eq('calendar_date', date)
    .single();

  if (!data) return false;

  const slots = (data.slots as CalendarSlot[]) || [];
  if (slotIndex < 0 || slotIndex >= slots.length) return false;

  slots[slotIndex] = {
    ...slots[slotIndex],
    vault_id: vaultId,
    status: 'assigned',
  };

  const { error } = await supabase
    .from('content_calendar')
    .update({
      slots,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('calendar_date', date);

  return !error;
}

// ── Get calendar range ──────────────────────────────────

export async function getCalendar(
  userId: string,
  start: string,
  end: string
): Promise<ContentCalendarDay[]> {
  const { data, error } = await supabase
    .from('content_calendar')
    .select('*')
    .eq('user_id', userId)
    .gte('calendar_date', start)
    .lte('calendar_date', end)
    .order('calendar_date', { ascending: true });

  if (error) {
    console.error('[calendar] getCalendar error:', error);
    return [];
  }

  return (data || []) as ContentCalendarDay[];
}

// ── Get today's calendar ────────────────────────────────

export async function getTodayCalendar(userId: string): Promise<ContentCalendarDay | null> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('content_calendar')
    .select('*')
    .eq('user_id', userId)
    .eq('calendar_date', today)
    .single();

  if (error || !data) return null;
  return data as ContentCalendarDay;
}

// ── Get week calendar (7 days from date) ─────────────────

export async function getWeekCalendar(userId: string, startDate?: string): Promise<ContentCalendarDay[]> {
  const start = startDate || new Date().toISOString().split('T')[0];
  const endDate = new Date(new Date(start).getTime() + 6 * 86400000).toISOString().split('T')[0];
  return getCalendar(userId, start, endDate);
}

// ── Update slot status ───────────────────────────────────

export async function updateSlotStatus(
  userId: string,
  date: string,
  slotIndex: number,
  status: SlotStatus
): Promise<boolean> {
  const { data } = await supabase
    .from('content_calendar')
    .select('slots')
    .eq('user_id', userId)
    .eq('calendar_date', date)
    .single();

  if (!data) return false;

  const slots = (data.slots as CalendarSlot[]) || [];
  if (slotIndex < 0 || slotIndex >= slots.length) return false;

  slots[slotIndex] = { ...slots[slotIndex], status };

  const { error } = await supabase
    .from('content_calendar')
    .update({ slots, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('calendar_date', date);

  return !error;
}
