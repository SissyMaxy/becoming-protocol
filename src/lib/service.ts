/**
 * Service Progression Library
 *
 * Database operations for service progression and encounter tracking.
 */

import { supabase } from './supabase';
import {
  SERVICE_STAGES,
  type ServiceStage,
  type ServiceProgression,
  type ServiceEncounter,
  type EncounterType,
  mapDbToServiceEncounter,
} from '../types/escalation';

// ============================================
// SERVICE PROGRESSION
// ============================================

/**
 * Get current service progression for user
 */
export async function getServiceProgression(userId: string): Promise<ServiceProgression | null> {
  const { data, error } = await supabase
    .from('service_progression')
    .select('*')
    .eq('user_id', userId)
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to get service progression:', error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    stage: data.stage as ServiceStage,
    enteredAt: data.entered_at,
    activities: data.activities || [],
    comfortLevel: data.comfort_level || undefined,
    arousalAssociation: data.arousal_association || undefined,
    notes: data.notes || undefined,
  };
}

/**
 * Get all service progressions (history)
 */
export async function getServiceProgressionHistory(userId: string): Promise<ServiceProgression[]> {
  const { data, error } = await supabase
    .from('service_progression')
    .select('*')
    .eq('user_id', userId)
    .order('entered_at', { ascending: false });

  if (error) {
    console.error('Failed to get service progression history:', error);
    return [];
  }

  return (data || []).map(p => ({
    id: p.id,
    userId: p.user_id,
    stage: p.stage as ServiceStage,
    enteredAt: p.entered_at,
    activities: p.activities || [],
    comfortLevel: p.comfort_level || undefined,
    arousalAssociation: p.arousal_association || undefined,
    notes: p.notes || undefined,
  }));
}

/**
 * Initialize service progression at fantasy stage
 */
export async function initializeServiceProgression(userId: string): Promise<ServiceProgression | null> {
  const { data, error } = await supabase
    .from('service_progression')
    .insert({
      user_id: userId,
      stage: 'fantasy',
      entered_at: new Date().toISOString(),
      activities: [],
      comfort_level: 1,
      arousal_association: 1,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to initialize service progression:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    stage: data.stage as ServiceStage,
    enteredAt: data.entered_at,
    activities: data.activities || [],
    comfortLevel: data.comfort_level || undefined,
    arousalAssociation: data.arousal_association || undefined,
    notes: data.notes || undefined,
  };
}

/**
 * Update comfort level for current stage
 */
export async function updateComfortLevel(progressionId: string, level: number): Promise<boolean> {
  const { error } = await supabase
    .from('service_progression')
    .update({ comfort_level: Math.min(10, Math.max(1, level)) })
    .eq('id', progressionId);

  if (error) {
    console.error('Failed to update comfort level:', error);
    return false;
  }
  return true;
}

/**
 * Update arousal association for current stage
 */
export async function updateArousalAssociation(progressionId: string, level: number): Promise<boolean> {
  const { error } = await supabase
    .from('service_progression')
    .update({ arousal_association: Math.min(10, Math.max(1, level)) })
    .eq('id', progressionId);

  if (error) {
    console.error('Failed to update arousal association:', error);
    return false;
  }
  return true;
}

/**
 * Add activity to current stage
 */
export async function logActivity(progressionId: string, activity: string): Promise<boolean> {
  // First get current activities
  const { data: current, error: fetchError } = await supabase
    .from('service_progression')
    .select('activities')
    .eq('id', progressionId)
    .single();

  if (fetchError) {
    console.error('Failed to fetch current activities:', fetchError);
    return false;
  }

  const activities = [...(current?.activities || []), activity];

  const { error } = await supabase
    .from('service_progression')
    .update({ activities })
    .eq('id', progressionId);

  if (error) {
    console.error('Failed to log activity:', error);
    return false;
  }
  return true;
}

/**
 * Advance to next service stage
 * Returns the new progression record or null if at max stage or error
 */
export async function advanceStage(
  userId: string,
  notes?: string
): Promise<ServiceProgression | null> {
  // Get current stage
  const current = await getServiceProgression(userId);
  if (!current) {
    console.error('No current progression found');
    return null;
  }

  // Check if we can advance
  const currentIndex = SERVICE_STAGES.indexOf(current.stage);
  if (currentIndex === -1 || currentIndex >= SERVICE_STAGES.length - 1) {
    console.error('Already at maximum stage');
    return null;
  }

  const nextStage = SERVICE_STAGES[currentIndex + 1];

  // Create new progression record for next stage
  const { data, error } = await supabase
    .from('service_progression')
    .insert({
      user_id: userId,
      stage: nextStage,
      entered_at: new Date().toISOString(),
      activities: [],
      comfort_level: 1,
      arousal_association: 1,
      notes: notes || `Advanced from ${current.stage}`,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to advance stage:', error);
    return null;
  }

  // Log escalation event (service is part of submission domain)
  await supabase.from('escalation_events').insert({
    user_id: userId,
    domain: 'submission',
    from_level: currentIndex,
    to_level: currentIndex + 1,
    description: `Service: Advanced from ${current.stage} to ${nextStage}`,
    trigger_method: 'organic',
    resistance_encountered: false,
  });

  return {
    id: data.id,
    userId: data.user_id,
    stage: data.stage as ServiceStage,
    enteredAt: data.entered_at,
    activities: data.activities || [],
    comfortLevel: data.comfort_level || undefined,
    arousalAssociation: data.arousal_association || undefined,
    notes: data.notes || undefined,
  };
}

// ============================================
// SERVICE ENCOUNTERS
// ============================================

/**
 * Get all service encounters for user
 */
export async function getServiceEncounters(userId: string): Promise<ServiceEncounter[]> {
  const { data, error } = await supabase
    .from('service_encounters')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) {
    console.error('Failed to get service encounters:', error);
    return [];
  }

  return (data || []).map(mapDbToServiceEncounter);
}

/**
 * Get encounter stats
 */
export async function getEncounterStats(userId: string): Promise<{
  total: number;
  byType: Record<EncounterType, number>;
  ginaAwareCount: number;
  ginaDirectedCount: number;
}> {
  const encounters = await getServiceEncounters(userId);

  const byType: Record<EncounterType, number> = {
    online: 0,
    anonymous: 0,
    regular: 0,
    directed: 0,
  };

  let ginaAwareCount = 0;
  let ginaDirectedCount = 0;

  for (const encounter of encounters) {
    byType[encounter.encounterType]++;
    if (encounter.ginaAware) ginaAwareCount++;
    if (encounter.ginaDirected) ginaDirectedCount++;
  }

  return {
    total: encounters.length,
    byType,
    ginaAwareCount,
    ginaDirectedCount,
  };
}

/**
 * Log a new service encounter
 */
export async function logEncounter(
  userId: string,
  encounter: Omit<ServiceEncounter, 'id' | 'userId'>
): Promise<ServiceEncounter | null> {
  const { data, error } = await supabase
    .from('service_encounters')
    .insert({
      user_id: userId,
      encounter_type: encounter.encounterType,
      date: encounter.date,
      description: encounter.description || null,
      gina_aware: encounter.ginaAware,
      gina_directed: encounter.ginaDirected,
      activities: encounter.activities,
      psychological_impact: encounter.psychologicalImpact || null,
      escalation_effect: encounter.escalationEffect || null,
      arousal_level: encounter.arousalLevel || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to log encounter:', error);
    return null;
  }

  return mapDbToServiceEncounter(data);
}

/**
 * Delete an encounter
 */
export async function deleteEncounter(encounterId: string): Promise<boolean> {
  const { error } = await supabase
    .from('service_encounters')
    .delete()
    .eq('id', encounterId);

  if (error) {
    console.error('Failed to delete encounter:', error);
    return false;
  }
  return true;
}

/**
 * Update an existing encounter
 */
export async function updateEncounter(
  encounterId: string,
  updates: Partial<Omit<ServiceEncounter, 'id' | 'userId'>>
): Promise<boolean> {
  const dbUpdates: Record<string, unknown> = {};

  if (updates.encounterType !== undefined) dbUpdates.encounter_type = updates.encounterType;
  if (updates.date !== undefined) dbUpdates.date = updates.date;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.ginaAware !== undefined) dbUpdates.gina_aware = updates.ginaAware;
  if (updates.ginaDirected !== undefined) dbUpdates.gina_directed = updates.ginaDirected;
  if (updates.activities !== undefined) dbUpdates.activities = updates.activities;
  if (updates.psychologicalImpact !== undefined) dbUpdates.psychological_impact = updates.psychologicalImpact;
  if (updates.escalationEffect !== undefined) dbUpdates.escalation_effect = updates.escalationEffect;
  if (updates.arousalLevel !== undefined) dbUpdates.arousal_level = updates.arousalLevel;

  const { error } = await supabase
    .from('service_encounters')
    .update(dbUpdates)
    .eq('id', encounterId);

  if (error) {
    console.error('Failed to update encounter:', error);
    return false;
  }
  return true;
}
