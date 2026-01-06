// Ceremonies Library
// Point of no return ritual management

import { supabase } from './supabase';
import type {
  Ceremony,
  DbCeremony,
  UserCeremony,
  DbUserCeremony,
  CeremonyEvidence,
  CeremonyTrigger,
  CeremonyCondition,
} from '../types/ceremonies';

// ============================================
// CONVERTERS
// ============================================

function dbCeremonyToCeremony(db: DbCeremony): Ceremony {
  return {
    id: db.id,
    name: db.name,
    description: db.description,
    triggerCondition: db.trigger_condition,
    ritualSteps: db.ritual_steps,
    irreversibleMarker: db.irreversible_marker,
    sequenceOrder: db.sequence_order,
    active: db.active,
  };
}

function dbUserCeremonyToUserCeremony(db: DbUserCeremony): UserCeremony {
  return {
    id: db.id,
    ceremonyId: db.ceremony_id,
    ceremony: db.ceremonies
      ? dbCeremonyToCeremony(db.ceremonies)
      : ({} as Ceremony),
    available: db.available,
    completed: db.completed,
    completedAt: db.completed_at || undefined,
    completionEvidence: db.completion_evidence || undefined,
  };
}

// ============================================
// CEREMONY QUERIES
// ============================================

export async function getAllCeremonies(): Promise<Ceremony[]> {
  const { data, error } = await supabase
    .from('ceremonies')
    .select('*')
    .eq('active', true)
    .order('sequence_order');

  if (error) throw error;
  return (data || []).map(dbCeremonyToCeremony);
}

export async function getUserCeremonies(): Promise<UserCeremony[]> {
  const { data, error } = await supabase
    .from('user_ceremonies')
    .select(`
      *,
      ceremonies (*)
    `)
    .order('created_at');

  if (error) throw error;
  return (data || []).map(dbUserCeremonyToUserCeremony);
}

export async function getCeremonyById(id: string): Promise<Ceremony | null> {
  const { data, error } = await supabase
    .from('ceremonies')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return dbCeremonyToCeremony(data);
}

// ============================================
// CEREMONY AVAILABILITY
// ============================================

interface CeremonyContext {
  day: number;
  streak: number;
  phase: number;
  events: string[];
}

function evaluateCondition(condition: CeremonyCondition, context: CeremonyContext): boolean {
  if (condition.day !== undefined && context.day < condition.day) {
    return false;
  }
  if (condition.streak !== undefined && context.streak < condition.streak) {
    return false;
  }
  if (condition.phase !== undefined && context.phase < condition.phase) {
    return false;
  }
  if (condition.event !== undefined && !context.events.includes(condition.event)) {
    return false;
  }
  return true;
}

function evaluateTrigger(trigger: CeremonyTrigger, context: CeremonyContext): boolean {
  if (trigger.or && trigger.or.length > 0) {
    return trigger.or.some(cond => evaluateCondition(cond, context));
  }
  if (trigger.and && trigger.and.length > 0) {
    return trigger.and.every(cond => evaluateCondition(cond, context));
  }
  return false;
}

export async function checkCeremonyAvailability(
  context: CeremonyContext
): Promise<Ceremony[]> {
  const ceremonies = await getAllCeremonies();
  const userCeremonies = await getUserCeremonies();

  const userCeremonyMap = new Map(
    userCeremonies.map(uc => [uc.ceremonyId, uc])
  );

  const available: Ceremony[] = [];

  for (const ceremony of ceremonies) {
    const userCeremony = userCeremonyMap.get(ceremony.id);

    // Skip if already completed
    if (userCeremony?.completed) continue;

    // Check if trigger condition is met
    if (evaluateTrigger(ceremony.triggerCondition, context)) {
      available.push(ceremony);

      // Mark as available if not already
      if (!userCeremony) {
        await markCeremonyAvailable(ceremony.id);
      } else if (!userCeremony.available) {
        await supabase
          .from('user_ceremonies')
          .update({ available: true })
          .eq('id', userCeremony.id);
      }
    }
  }

  return available;
}

async function markCeremonyAvailable(ceremonyId: string): Promise<void> {
  const { error } = await supabase
    .from('user_ceremonies')
    .insert({
      ceremony_id: ceremonyId,
      available: true,
      completed: false,
    });

  // Ignore unique constraint violations
  if (error && error.code !== '23505') throw error;
}

// ============================================
// CEREMONY COMPLETION
// ============================================

export async function startCeremony(ceremonyId: string): Promise<UserCeremony> {
  // Ensure user_ceremony record exists
  const { data: existing, error: fetchError } = await supabase
    .from('user_ceremonies')
    .select(`*, ceremonies (*)`)
    .eq('ceremony_id', ceremonyId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

  if (existing) {
    return dbUserCeremonyToUserCeremony(existing);
  }

  // Create new record
  const { data, error } = await supabase
    .from('user_ceremonies')
    .insert({
      ceremony_id: ceremonyId,
      available: true,
      completed: false,
    })
    .select(`*, ceremonies (*)`)
    .single();

  if (error) throw error;
  return dbUserCeremonyToUserCeremony(data);
}

export async function updateCeremonyProgress(
  userCeremonyId: string,
  stepIndex: number,
  response?: string
): Promise<void> {
  // Get current evidence
  const { data: current, error: fetchError } = await supabase
    .from('user_ceremonies')
    .select('completion_evidence')
    .eq('id', userCeremonyId)
    .single();

  if (fetchError) throw fetchError;

  const evidence: CeremonyEvidence = current.completion_evidence || {
    stepCompletions: {},
  };

  evidence.stepCompletions[stepIndex] = {
    completed: true,
    completedAt: new Date().toISOString(),
    response,
  };

  const { error } = await supabase
    .from('user_ceremonies')
    .update({ completion_evidence: evidence })
    .eq('id', userCeremonyId);

  if (error) throw error;
}

export async function completeCeremony(
  userCeremonyId: string,
  finalEvidence?: Partial<CeremonyEvidence>
): Promise<void> {
  // Get current evidence
  const { data: current, error: fetchError } = await supabase
    .from('user_ceremonies')
    .select('completion_evidence')
    .eq('id', userCeremonyId)
    .single();

  if (fetchError) throw fetchError;

  const evidence: CeremonyEvidence = {
    ...current.completion_evidence,
    ...finalEvidence,
  };

  const { error } = await supabase
    .from('user_ceremonies')
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      completion_evidence: evidence,
    })
    .eq('id', userCeremonyId);

  if (error) throw error;
}

// ============================================
// CEREMONY STATUS
// ============================================

export async function getCeremonyStatus(): Promise<{
  available: UserCeremony[];
  completed: UserCeremony[];
  next: Ceremony | null;
}> {
  const userCeremonies = await getUserCeremonies();
  const allCeremonies = await getAllCeremonies();

  const available = userCeremonies.filter(uc => uc.available && !uc.completed);
  const completed = userCeremonies.filter(uc => uc.completed);

  // Find next ceremony in sequence
  const completedIds = new Set(completed.map(c => c.ceremonyId));
  const availableIds = new Set(available.map(c => c.ceremonyId));

  const next = allCeremonies.find(
    c => !completedIds.has(c.id) && !availableIds.has(c.id)
  ) || null;

  return { available, completed, next };
}

// ============================================
// IRREVERSIBILITY ENFORCEMENT
// ============================================

export async function getIrreversibleMarkers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_ceremonies')
    .select(`
      ceremonies (irreversible_marker)
    `)
    .eq('completed', true);

  if (error) throw error;

  return (data || [])
    .map(d => (d.ceremonies as any)?.irreversible_marker)
    .filter(Boolean);
}

export async function isNameLocked(): Promise<boolean> {
  const markers = await getIrreversibleMarkers();
  return markers.includes('Cannot change name in system after this');
}

export async function areGuyModePenaltiesPermanent(): Promise<boolean> {
  const markers = await getIrreversibleMarkers();
  return markers.includes('Guy mode penalties activate permanently');
}
