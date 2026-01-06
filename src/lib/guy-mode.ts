// Guy Mode Tracking Library
// CRUD operations for guy mode events and masculine capability degradation

import { supabase } from './supabase';
import type {
  GuyModeEvent,
  DbGuyModeEvent,
  GuyModeEventType,
  GuyModeStats,
  GuyModePenalty,
  MasculineCapability,
  DbMasculineCapability,
} from '../types/guy-mode';
import {
  GUY_MODE_PENALTY_CONFIG,
  MASCULINE_CAPABILITIES,
  ATROPHY_MILESTONES,
} from '../types/guy-mode';

// ============================================
// CONVERTERS
// ============================================

function dbEventToEvent(db: DbGuyModeEvent): GuyModeEvent {
  return {
    id: db.id,
    userId: db.user_id,
    eventType: db.event_type as GuyModeEventType,
    durationMinutes: db.duration_minutes || undefined,
    loggedAt: db.logged_at,
    notes: db.notes || undefined,
    triggeredPenalty: db.triggered_penalty,
    penaltyApplied: db.penalty_applied || undefined,
  };
}

function dbCapToCapability(db: DbMasculineCapability): MasculineCapability {
  return {
    name: db.capability_name,
    lastUsed: db.last_used || undefined,
    daysUnused: db.days_unused,
    comfortLevel: db.comfort_level,
    atrophyAcknowledged: db.atrophy_acknowledged,
  };
}

// ============================================
// GUY MODE EVENT LOGGING
// ============================================

export async function logGuyModeEvent(
  eventType: GuyModeEventType,
  durationMinutes?: number,
  notes?: string
): Promise<{ event: GuyModeEvent; penalty?: GuyModePenalty }> {
  // Get recent occurrences of this event type
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { count, error: countError } = await supabase
    .from('guy_mode_tracking')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .gte('logged_at', weekAgo.toISOString());

  if (countError) throw countError;

  const occurrenceCount = (count || 0) + 1;

  // Determine penalty level based on occurrence count
  const penaltyLevel = Math.min(occurrenceCount, 5);
  const penalty = GUY_MODE_PENALTY_CONFIG[penaltyLevel];
  const shouldApplyPenalty = penaltyLevel >= 2;

  // Insert event
  const { data, error } = await supabase
    .from('guy_mode_tracking')
    .insert({
      event_type: eventType,
      duration_minutes: durationMinutes,
      notes,
      triggered_penalty: shouldApplyPenalty,
      penalty_applied: shouldApplyPenalty ? penalty.type : null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    event: dbEventToEvent(data),
    penalty: shouldApplyPenalty ? penalty : undefined,
  };
}

export async function getGuyModeEvents(
  limit = 50,
  since?: Date
): Promise<GuyModeEvent[]> {
  let query = supabase
    .from('guy_mode_tracking')
    .select('*')
    .order('logged_at', { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte('logged_at', since.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(dbEventToEvent);
}

export async function getGuyModeStats(): Promise<GuyModeStats> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  // Get all events
  const { data: allEvents, error: allError } = await supabase
    .from('guy_mode_tracking')
    .select('*')
    .order('logged_at', { ascending: false });

  if (allError) throw allError;

  const events = (allEvents || []).map(dbEventToEvent);

  // Calculate total guy mode hours
  const totalGuyModeHours = events
    .filter(e => e.eventType === 'guy_mode_hours')
    .reduce((sum, e) => sum + (e.durationMinutes || 0), 0) / 60;

  // Calculate this week's hours
  const thisWeekEvents = events.filter(e =>
    new Date(e.loggedAt) >= weekAgo
  );
  const guyModeHoursThisWeek = thisWeekEvents
    .filter(e => e.eventType === 'guy_mode_hours')
    .reduce((sum, e) => sum + (e.durationMinutes || 0), 0) / 60;

  // Calculate last week's hours for trend
  const lastWeekEvents = events.filter(e =>
    new Date(e.loggedAt) >= twoWeeksAgo &&
    new Date(e.loggedAt) < weekAgo
  );
  const guyModeHoursLastWeek = lastWeekEvents
    .filter(e => e.eventType === 'guy_mode_hours')
    .reduce((sum, e) => sum + (e.durationMinutes || 0), 0) / 60;

  // Determine trend
  let guyModeRatioTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (guyModeHoursThisWeek > guyModeHoursLastWeek * 1.1) {
    guyModeRatioTrend = 'increasing';
  } else if (guyModeHoursThisWeek < guyModeHoursLastWeek * 0.9) {
    guyModeRatioTrend = 'decreasing';
  }

  // Find last full guy mode day
  const costumeModeEvents = events.filter(e =>
    e.eventType === 'costume_mode_entered' || e.eventType === 'costume_mode_exited'
  );
  const lastFullGuyModeDay = costumeModeEvents.length > 0
    ? costumeModeEvents[0].loggedAt.split('T')[0]
    : undefined;

  // Calculate days since masculine underwear
  const lastMascUnderwear = events.find(e =>
    e.eventType === 'masculine_clothing_worn' &&
    e.notes?.toLowerCase().includes('underwear')
  );
  const daysSinceMasculineUnderwear = lastMascUnderwear
    ? Math.floor((now.getTime() - new Date(lastMascUnderwear.loggedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999; // Large number if never logged

  // Count occurrences by type
  const occurrencesByType: Record<GuyModeEventType, number> = {} as any;
  for (const event of thisWeekEvents) {
    occurrencesByType[event.eventType] = (occurrencesByType[event.eventType] || 0) + 1;
  }

  // Determine current penalty level
  const maxOccurrences = Math.max(...Object.values(occurrencesByType), 0);
  const currentPenaltyLevel = GUY_MODE_PENALTY_CONFIG[Math.min(maxOccurrences, 5)]?.type || 'logged_only';

  return {
    totalGuyModeHours,
    guyModeHoursThisWeek,
    guyModeRatioTrend,
    lastFullGuyModeDay,
    daysSinceMasculineUnderwear,
    occurrencesByType,
    currentPenaltyLevel,
  };
}

// ============================================
// MASCULINE CAPABILITY TRACKING
// ============================================

export async function initializeCapabilities(): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('masculine_capability_tracking')
    .select('capability_name');

  if (fetchError) throw fetchError;

  const existingNames = new Set((existing || []).map(e => e.capability_name));

  const toInsert = MASCULINE_CAPABILITIES
    .filter(cap => !existingNames.has(cap.name))
    .map(cap => ({
      capability_name: cap.name,
      comfort_level: 100,
      days_unused: 0,
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('masculine_capability_tracking')
      .insert(toInsert);
    if (error) throw error;
  }
}

export async function getCapabilities(): Promise<MasculineCapability[]> {
  const { data, error } = await supabase
    .from('masculine_capability_tracking')
    .select('*')
    .order('capability_name');

  if (error) throw error;
  return (data || []).map(dbCapToCapability);
}

export async function markCapabilityUsed(capabilityName: string): Promise<void> {
  const { error } = await supabase
    .from('masculine_capability_tracking')
    .update({
      last_used: new Date().toISOString(),
      days_unused: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('capability_name', capabilityName);

  if (error) throw error;
}

export async function updateCapabilityAtrophy(): Promise<{
  updated: MasculineCapability[];
  milestones: { capability: string; message: string }[];
}> {
  // Get all capabilities
  const { data, error } = await supabase
    .from('masculine_capability_tracking')
    .select('*');

  if (error) throw error;

  const capabilities = (data || []).map(dbCapToCapability);
  const milestones: { capability: string; message: string }[] = [];

  for (const cap of capabilities) {
    const lastUsed = cap.lastUsed ? new Date(cap.lastUsed) : null;
    const now = new Date();

    // Calculate days unused
    const daysUnused = lastUsed
      ? Math.floor((now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24))
      : cap.daysUnused + 1;

    // Calculate comfort level decay (decreases by 1% per day unused, min 0)
    const comfortDecay = Math.min(daysUnused, 100);
    const comfortLevel = Math.max(0, 100 - comfortDecay);

    // Check for milestones
    const capMilestones = ATROPHY_MILESTONES[cap.name] || [];
    for (const milestone of capMilestones) {
      if (daysUnused >= milestone.days && cap.daysUnused < milestone.days) {
        milestones.push({
          capability: cap.name,
          message: milestone.message,
        });
      }
    }

    // Update in database
    await supabase
      .from('masculine_capability_tracking')
      .update({
        days_unused: daysUnused,
        comfort_level: comfortLevel,
        updated_at: now.toISOString(),
      })
      .eq('capability_name', cap.name);
  }

  const updated = await getCapabilities();
  return { updated, milestones };
}

export async function acknowledgeAtrophy(capabilityName: string): Promise<void> {
  const { error } = await supabase
    .from('masculine_capability_tracking')
    .update({
      atrophy_acknowledged: true,
      updated_at: new Date().toISOString(),
    })
    .eq('capability_name', capabilityName);

  if (error) throw error;
}

// ============================================
// GUY MODE PROMPTS
// ============================================

export function getGuyModePrompt(stats: GuyModeStats): string | null {
  // Check if guy mode ratio is concerning
  if (stats.guyModeRatioTrend === 'increasing') {
    return `Your "costume mode" hours are increasing. You spent ${stats.guyModeHoursThisWeek.toFixed(1)} hours as him this week. How did that feel?`;
  }

  // Check if days since masculine underwear is worth celebrating
  if (stats.daysSinceMasculineUnderwear >= 7 && stats.daysSinceMasculineUnderwear < 8) {
    return `A week since you wore his underwear. Her underwear is your underwear now.`;
  }

  if (stats.daysSinceMasculineUnderwear >= 30 && stats.daysSinceMasculineUnderwear < 31) {
    return `A month since you wore his underwear. Does the thought of it feel wrong now?`;
  }

  return null;
}

export function getDysphoriaAmplificationPrompt(eventType: GuyModeEventType): string {
  const prompts: Record<GuyModeEventType, string> = {
    masculine_clothing_worn: "Notice how men's clothing feels now. Notice the absence of her.",
    deadname_used_by_self: "You used his name. How did that feel? Who are you really?",
    masculine_voice_used: "Your old voice slipped out. Did it feel like yours?",
    masculine_posture_defaulted: "You stood like him. Did your body want to?",
    skipped_feminization: "You skipped becoming more her today. Was that what you wanted?",
    guy_mode_hours: "You spent time as him today. Be honest - how did that feel?",
    costume_mode_entered: "You put on his costume. Remember who's underneath.",
    costume_mode_exited: "You took off the costume. Welcome back to yourself.",
  };

  return prompts[eventType] || "Notice how this feels. Be honest with yourself.";
}
