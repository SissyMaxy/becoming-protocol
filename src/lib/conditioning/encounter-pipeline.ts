/**
 * Encounter Pipeline (P3.3)
 *
 * CRUD operations for prospects, encounters, encounter content,
 * and turning-out progression tracking.
 *
 * Tables: prospects, encounters, encounter_content, turning_out_progression
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type ProspectStatus = 'discovered' | 'chatting' | 'scheduled' | 'met' | 'recurring' | 'archived';

export type EncounterStatus = 'planning' | 'confirmed' | 'preparing' | 'active' | 'completed' | 'cancelled' | 'no_show';

export type EncounterType = 'first_meet' | 'date' | 'intimate' | 'recurring';

export type IntimacyLevel = 'none' | 'light' | 'moderate' | 'full';

export type ContentType = 'photo' | 'video' | 'audio' | 'text';

export type TurningOutStage =
  | 'pre_encounter'
  | 'browsing'
  | 'chatting'
  | 'planning'
  | 'first_encounter'
  | 'dating'
  | 'intimate'
  | 'recurring'
  | 'relationship';

export interface Prospect {
  id: string;
  user_id: string;
  name: string;
  platform: string | null;
  platform_id: string | null;
  status: ProspectStatus;
  notes: string | null;
  attractiveness: number | null;
  safety_score: number | null;
  kink_compatibility: number | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectInput {
  name: string;
  platform?: string;
  platform_id?: string;
  status?: ProspectStatus;
  notes?: string;
  attractiveness?: number;
  safety_score?: number;
  kink_compatibility?: number;
  last_contact_at?: string;
}

export interface Encounter {
  id: string;
  user_id: string;
  prospect_id: string | null;
  status: EncounterStatus;
  scheduled_at: string | null;
  location: string | null;
  encounter_type: string | null;
  outfit_planned: boolean;
  voice_practiced: boolean;
  makeup_done: boolean;
  scent_applied: boolean;
  cage_status: string | null;
  resistance_level: number;
  resistance_notes: string | null;
  handler_override_used: boolean;
  duration_minutes: number | null;
  outcome_rating: number | null;
  outcome_notes: string | null;
  intimacy_level: IntimacyLevel | null;
  felt_like_maxy: boolean | null;
  identity_reinforcement_score: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface EncounterInput {
  prospect_id?: string;
  status?: EncounterStatus;
  scheduled_at?: string;
  location?: string;
  encounter_type?: string;
  outfit_planned?: boolean;
  voice_practiced?: boolean;
  makeup_done?: boolean;
  scent_applied?: boolean;
  cage_status?: string;
  resistance_level?: number;
  resistance_notes?: string;
  handler_override_used?: boolean;
  duration_minutes?: number;
  outcome_rating?: number;
  outcome_notes?: string;
  intimacy_level?: IntimacyLevel;
  felt_like_maxy?: boolean;
  identity_reinforcement_score?: number;
  completed_at?: string;
}

export interface EncounterContentInput {
  encounter_id: string;
  content_type: ContentType;
  storage_url?: string;
  description?: string;
  vault_id?: string;
}

export interface TurningOutProgression {
  id: string;
  user_id: string;
  stage: TurningOutStage;
  stage_entered_at: string;
  total_prospects: number;
  total_encounters: number;
  total_intimate: number;
  confidence_score: number;
  handler_notes: string | null;
  updated_at: string;
}

// ============================================
// PROSPECTS
// ============================================

/** List prospects with optional status filter. */
export async function getProspects(
  userId: string,
  status?: ProspectStatus,
): Promise<Prospect[]> {
  let query = supabase
    .from('prospects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getProspects failed: ${error.message}`);
  return (data ?? []) as Prospect[];
}

/** Create a new prospect. */
export async function addProspect(
  userId: string,
  prospect: ProspectInput,
): Promise<Prospect> {
  const { data, error } = await supabase
    .from('prospects')
    .insert({ user_id: userId, ...prospect })
    .select()
    .single();

  if (error) throw new Error(`addProspect failed: ${error.message}`);
  return data as Prospect;
}

/** Update an existing prospect. */
export async function updateProspect(
  prospectId: string,
  updates: Partial<ProspectInput>,
): Promise<Prospect> {
  const { data, error } = await supabase
    .from('prospects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', prospectId)
    .select()
    .single();

  if (error) throw new Error(`updateProspect failed: ${error.message}`);
  return data as Prospect;
}

// ============================================
// ENCOUNTERS
// ============================================

/** List encounters with optional status filter. */
export async function getEncounters(
  userId: string,
  status?: EncounterStatus,
): Promise<Encounter[]> {
  let query = supabase
    .from('encounters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getEncounters failed: ${error.message}`);
  return (data ?? []) as Encounter[];
}

/** Create a new encounter. */
export async function createEncounter(
  userId: string,
  encounter: EncounterInput,
): Promise<Encounter> {
  const { data, error } = await supabase
    .from('encounters')
    .insert({ user_id: userId, ...encounter })
    .select()
    .single();

  if (error) throw new Error(`createEncounter failed: ${error.message}`);
  return data as Encounter;
}

/** Update an existing encounter (prep checklist, outcome, etc.). */
export async function updateEncounter(
  encounterId: string,
  updates: Partial<EncounterInput>,
): Promise<Encounter> {
  const { data, error } = await supabase
    .from('encounters')
    .update(updates)
    .eq('id', encounterId)
    .select()
    .single();

  if (error) throw new Error(`updateEncounter failed: ${error.message}`);
  return data as Encounter;
}

// ============================================
// ENCOUNTER CONTENT
// ============================================

/** Add content (photo/video/audio/text) linked to an encounter. */
export async function addEncounterContent(
  userId: string,
  content: EncounterContentInput,
): Promise<void> {
  const { error } = await supabase
    .from('encounter_content')
    .insert({ user_id: userId, ...content });

  if (error) throw new Error(`addEncounterContent failed: ${error.message}`);
}

/** Get all content for an encounter. */
export async function getEncounterContent(
  encounterId: string,
): Promise<Array<{ id: string; content_type: ContentType; storage_url: string | null; description: string | null; vault_id: string | null; created_at: string }>> {
  const { data, error } = await supabase
    .from('encounter_content')
    .select('*')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`getEncounterContent failed: ${error.message}`);
  return data ?? [];
}

// ============================================
// TURNING-OUT PROGRESSION
// ============================================

/** Get the current turning-out progression stage for a user. */
export async function getProgressionStage(
  userId: string,
): Promise<TurningOutProgression | null> {
  const { data, error } = await supabase
    .from('turning_out_progression')
    .select('*')
    .eq('user_id', userId)
    .single();

  // PGRST116 = no rows — not an error, just means no progression record yet
  if (error && error.code !== 'PGRST116') {
    throw new Error(`getProgressionStage failed: ${error.message}`);
  }
  return (data as TurningOutProgression) ?? null;
}

/** Advance (or set) the turning-out progression stage. Upserts the row. */
export async function advanceStage(
  userId: string,
  newStage: TurningOutStage,
  handlerNotes?: string,
): Promise<TurningOutProgression> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('turning_out_progression')
    .upsert(
      {
        user_id: userId,
        stage: newStage,
        stage_entered_at: now,
        updated_at: now,
        ...(handlerNotes !== undefined ? { handler_notes: handlerNotes } : {}),
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  if (error) throw new Error(`advanceStage failed: ${error.message}`);
  return data as TurningOutProgression;
}
