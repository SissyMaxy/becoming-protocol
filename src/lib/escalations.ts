// Escalations Library
// Automatic time-locked escalations management

import { supabase } from './supabase';
import type {
  AutomaticEscalation,
  DbAutomaticEscalation,
  UserEscalationStatus,
  DbUserEscalationStatus,
  EscalationCalendarItem,
  EscalationDelayCost,
} from '../types/escalations';

// ============================================
// CONVERTERS
// ============================================

function dbEscalationToEscalation(db: DbAutomaticEscalation): AutomaticEscalation {
  return {
    id: db.id,
    dayTrigger: db.day_trigger,
    escalationType: db.escalation_type,
    description: db.description,
    canDelay: db.can_delay,
    delayCost: db.delay_cost || undefined,
    warningDaysBefore: db.warning_days_before,
    active: db.active,
  };
}

function dbStatusToStatus(db: DbUserEscalationStatus): UserEscalationStatus {
  return {
    id: db.id,
    escalationId: db.escalation_id,
    escalation: db.automatic_escalations
      ? dbEscalationToEscalation(db.automatic_escalations)
      : ({} as AutomaticEscalation),
    triggered: db.triggered,
    triggeredAt: db.triggered_at || undefined,
    delayed: db.delayed,
    delayedUntil: db.delayed_until || undefined,
    delayCostPaid: db.delay_cost_paid || undefined,
  };
}

// ============================================
// ESCALATION QUERIES
// ============================================

export async function getAllEscalations(): Promise<AutomaticEscalation[]> {
  const { data, error } = await supabase
    .from('automatic_escalations')
    .select('*')
    .eq('active', true)
    .order('day_trigger');

  if (error) throw error;
  return (data || []).map(dbEscalationToEscalation);
}

export async function getUserEscalationStatuses(): Promise<UserEscalationStatus[]> {
  const { data, error } = await supabase
    .from('user_escalation_status')
    .select(`
      *,
      automatic_escalations (*)
    `)
    .order('created_at');

  if (error) throw error;
  return (data || []).map(dbStatusToStatus);
}

// ============================================
// ESCALATION CALENDAR
// ============================================

export async function getEscalationCalendar(
  currentDay: number
): Promise<EscalationCalendarItem[]> {
  const escalations = await getAllEscalations();
  const statuses = await getUserEscalationStatuses();

  const statusMap = new Map(statuses.map(s => [s.escalationId, s]));

  const calendar: EscalationCalendarItem[] = [];

  for (const escalation of escalations) {
    const status = statusMap.get(escalation.id);
    const daysUntil = escalation.dayTrigger - currentDay;

    let itemStatus: EscalationCalendarItem['status'];

    if (status?.triggered) {
      itemStatus = 'triggered';
    } else if (status?.delayed) {
      itemStatus = 'delayed';
    } else if (daysUntil <= 0) {
      itemStatus = 'triggered';
    } else if (daysUntil <= 3) {
      itemStatus = 'imminent';
    } else if (daysUntil <= escalation.warningDaysBefore) {
      itemStatus = 'warning';
    } else {
      itemStatus = 'upcoming';
    }

    calendar.push({
      escalation,
      status: itemStatus,
      daysUntil: Math.max(0, daysUntil),
      canDelay: escalation.canDelay && !status?.delayed && itemStatus !== 'triggered',
      delayCost: escalation.delayCost,
    });
  }

  return calendar;
}

// ============================================
// ESCALATION TRIGGERING
// ============================================

export async function checkAndTriggerEscalations(
  currentDay: number
): Promise<AutomaticEscalation[]> {
  const calendar = await getEscalationCalendar(currentDay);
  const triggered: AutomaticEscalation[] = [];

  for (const item of calendar) {
    // Skip already triggered or delayed
    if (item.status === 'triggered' || item.status === 'delayed') continue;

    // Check if should trigger
    if (item.daysUntil <= 0) {
      await triggerEscalation(item.escalation.id);
      triggered.push(item.escalation);
    }
  }

  return triggered;
}

export async function triggerEscalation(escalationId: string): Promise<void> {
  // Check if status exists
  const { data: existing, error: fetchError } = await supabase
    .from('user_escalation_status')
    .select('id')
    .eq('escalation_id', escalationId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('user_escalation_status')
      .update({
        triggered: true,
        triggered_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    // Insert new
    const { error } = await supabase
      .from('user_escalation_status')
      .insert({
        escalation_id: escalationId,
        triggered: true,
        triggered_at: new Date().toISOString(),
      });

    if (error) throw error;
  }
}

// ============================================
// ESCALATION DELAY
// ============================================

export async function delayEscalation(
  escalationId: string,
  delayDays: number = 7
): Promise<{ success: boolean; cost: EscalationDelayCost }> {
  // Get escalation to check if can delay
  const { data: escalation, error: escError } = await supabase
    .from('automatic_escalations')
    .select('*')
    .eq('id', escalationId)
    .single();

  if (escError) throw escError;
  if (!escalation.can_delay) {
    throw new Error('This escalation cannot be delayed');
  }

  const delayedUntil = new Date();
  delayedUntil.setDate(delayedUntil.getDate() + delayDays);

  // Check if status exists
  const { data: existing, error: fetchError } = await supabase
    .from('user_escalation_status')
    .select('id')
    .eq('escalation_id', escalationId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

  const cost = escalation.delay_cost || {};

  if (existing) {
    const { error } = await supabase
      .from('user_escalation_status')
      .update({
        delayed: true,
        delayed_until: delayedUntil.toISOString(),
        delay_cost_paid: cost,
      })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_escalation_status')
      .insert({
        escalation_id: escalationId,
        delayed: true,
        delayed_until: delayedUntil.toISOString(),
        delay_cost_paid: cost,
      });

    if (error) throw error;
  }

  return { success: true, cost };
}

// ============================================
// UPCOMING ESCALATION WARNINGS
// ============================================

export async function getUpcomingWarnings(
  currentDay: number
): Promise<EscalationCalendarItem[]> {
  const calendar = await getEscalationCalendar(currentDay);

  return calendar.filter(
    item =>
      item.status === 'warning' ||
      item.status === 'imminent'
  );
}

export async function getImminentEscalations(
  currentDay: number
): Promise<EscalationCalendarItem[]> {
  const calendar = await getEscalationCalendar(currentDay);

  return calendar.filter(item => item.status === 'imminent');
}

// ============================================
// ESCALATION EFFECT APPLICATION
// ============================================

export function getEscalationEffect(escalationType: string): string {
  const effects: Record<string, string> = {
    denial_baseline_increase: 'Your minimum denial has increased. The ache deepens.',
    language_default: 'The system speaks to her now. Only her.',
    content_tier_expiry: 'Content tier expired. Use it or lose it.',
    name_enforcement: 'You are Maxy now. The system knows no other name.',
    masculine_tasks_removed: 'Masculine options are gone. There is only her path.',
    intensity_increase: 'Minimum intensity increased. Gentleness fades.',
    phase2_mandatory: 'Phase 2 is no longer optional. You must proceed.',
    disclosure_scheduled: 'A disclosure has been scheduled. The world will know.',
    point_of_no_return: 'You have reached the point of no return. There is no going back.',
  };

  return effects[escalationType] || 'Escalation triggered.';
}

// ============================================
// COUNTDOWN DISPLAY
// ============================================

export function formatCountdown(daysUntil: number): string {
  if (daysUntil <= 0) return 'Now';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil < 7) return `${daysUntil} days`;
  if (daysUntil < 30) {
    const weeks = Math.floor(daysUntil / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  }
  const months = Math.floor(daysUntil / 30);
  return `${months} month${months > 1 ? 's' : ''}`;
}
