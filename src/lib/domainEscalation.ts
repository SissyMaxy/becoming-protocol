/**
 * Domain Escalation Library
 *
 * Database functions for boundary dissolution and content escalation tracking.
 */

import { supabase } from './supabase';
import {
  BoundaryDissolution,
  ContentEscalation,
  EscalationEvent,
  EscalationDomain,
  DissolutionMethod,
  DbBoundaryDissolution,
  DbContentEscalation,
  DbEscalationEvent,
  mapDbToEscalationEvent,
} from '../types/escalation';

// ============================================
// BOUNDARY DISSOLUTION FUNCTIONS
// ============================================

function mapDbToBoundary(db: DbBoundaryDissolution): BoundaryDissolution {
  return {
    id: db.id,
    userId: db.user_id,
    boundaryDescription: db.boundary_description,
    domain: db.domain || undefined,
    firstIdentified: db.first_identified,
    dissolutionStarted: db.dissolution_started || undefined,
    dissolutionCompleted: db.dissolution_completed || undefined,
    method: db.method as DissolutionMethod | undefined,
    nowBaseline: db.now_baseline,
    notes: db.notes || undefined,
  };
}

export async function getBoundaries(
  userId: string,
  domain?: EscalationDomain
): Promise<BoundaryDissolution[]> {
  let query = supabase
    .from('boundary_dissolution')
    .select('*')
    .eq('user_id', userId)
    .order('first_identified', { ascending: false });

  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get boundaries:', error);
    return [];
  }

  return (data || []).map(d => mapDbToBoundary(d as DbBoundaryDissolution));
}

export async function createBoundary(
  userId: string,
  boundaryDescription: string,
  domain?: EscalationDomain
): Promise<BoundaryDissolution | null> {
  const { data, error } = await supabase
    .from('boundary_dissolution')
    .insert({
      user_id: userId,
      boundary_description: boundaryDescription,
      domain: domain || null,
      first_identified: new Date().toISOString(),
      now_baseline: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create boundary:', error);
    return null;
  }

  return mapDbToBoundary(data as DbBoundaryDissolution);
}

export async function startDissolution(
  boundaryId: string,
  method: DissolutionMethod
): Promise<boolean> {
  const { error } = await supabase
    .from('boundary_dissolution')
    .update({
      dissolution_started: new Date().toISOString(),
      method,
    })
    .eq('id', boundaryId);

  if (error) {
    console.error('Failed to start dissolution:', error);
    return false;
  }

  return true;
}

export async function completeDissolution(
  boundaryId: string,
  nowBaseline: boolean = true
): Promise<boolean> {
  const { error } = await supabase
    .from('boundary_dissolution')
    .update({
      dissolution_completed: new Date().toISOString(),
      now_baseline: nowBaseline,
    })
    .eq('id', boundaryId);

  if (error) {
    console.error('Failed to complete dissolution:', error);
    return false;
  }

  return true;
}

export async function updateBoundary(
  boundaryId: string,
  updates: Partial<{
    method: DissolutionMethod;
    dissolutionStarted: string;
    dissolutionCompleted: string;
    nowBaseline: boolean;
    notes: string;
  }>
): Promise<boolean> {
  const dbUpdates: Record<string, unknown> = {};

  if (updates.method !== undefined) dbUpdates.method = updates.method;
  if (updates.dissolutionStarted !== undefined) dbUpdates.dissolution_started = updates.dissolutionStarted;
  if (updates.dissolutionCompleted !== undefined) dbUpdates.dissolution_completed = updates.dissolutionCompleted;
  if (updates.nowBaseline !== undefined) dbUpdates.now_baseline = updates.nowBaseline;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  const { error } = await supabase
    .from('boundary_dissolution')
    .update(dbUpdates)
    .eq('id', boundaryId);

  if (error) {
    console.error('Failed to update boundary:', error);
    return false;
  }

  return true;
}

export async function deleteBoundary(boundaryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('boundary_dissolution')
    .delete()
    .eq('id', boundaryId);

  if (error) {
    console.error('Failed to delete boundary:', error);
    return false;
  }

  return true;
}

// ============================================
// CONTENT ESCALATION FUNCTIONS
// ============================================

function mapDbToContentEscalation(db: DbContentEscalation): ContentEscalation {
  return {
    id: db.id,
    userId: db.user_id,
    contentType: db.content_type,
    theme: db.theme,
    intensityLevel: db.intensity_level || undefined,
    firstExposure: db.first_exposure,
    exposureCount: db.exposure_count,
    currentResponse: db.current_response || undefined,
    nextIntensityTarget: db.next_intensity_target || undefined,
    notes: db.notes || undefined,
  };
}

export async function getContentEscalations(userId: string): Promise<ContentEscalation[]> {
  const { data, error } = await supabase
    .from('content_escalation')
    .select('*')
    .eq('user_id', userId)
    .order('exposure_count', { ascending: false });

  if (error) {
    console.error('Failed to get content escalations:', error);
    return [];
  }

  return (data || []).map(d => mapDbToContentEscalation(d as DbContentEscalation));
}

export async function getContentByTheme(
  userId: string,
  theme: string
): Promise<ContentEscalation[]> {
  const { data, error } = await supabase
    .from('content_escalation')
    .select('*')
    .eq('user_id', userId)
    .eq('theme', theme)
    .order('intensity_level', { ascending: false });

  if (error) {
    console.error('Failed to get content by theme:', error);
    return [];
  }

  return (data || []).map(d => mapDbToContentEscalation(d as DbContentEscalation));
}

export async function logContentExposure(
  userId: string,
  data: {
    contentType: string;
    theme: string;
    intensityLevel?: number;
    currentResponse?: string;
    nextIntensityTarget?: number;
  }
): Promise<ContentEscalation | null> {
  // Check if this content type/theme combo already exists
  const { data: existing } = await supabase
    .from('content_escalation')
    .select('*')
    .eq('user_id', userId)
    .eq('content_type', data.contentType)
    .eq('theme', data.theme)
    .maybeSingle();

  if (existing) {
    // Update existing record
    const { data: updated, error } = await supabase
      .from('content_escalation')
      .update({
        exposure_count: (existing as DbContentEscalation).exposure_count + 1,
        intensity_level: data.intensityLevel || (existing as DbContentEscalation).intensity_level,
        current_response: data.currentResponse || (existing as DbContentEscalation).current_response,
        next_intensity_target: data.nextIntensityTarget || (existing as DbContentEscalation).next_intensity_target,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update content exposure:', error);
      return null;
    }

    return mapDbToContentEscalation(updated as DbContentEscalation);
  }

  // Create new record
  const { data: created, error } = await supabase
    .from('content_escalation')
    .insert({
      user_id: userId,
      content_type: data.contentType,
      theme: data.theme,
      intensity_level: data.intensityLevel || 1,
      first_exposure: new Date().toISOString(),
      exposure_count: 1,
      current_response: data.currentResponse || null,
      next_intensity_target: data.nextIntensityTarget || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to log content exposure:', error);
    return null;
  }

  return mapDbToContentEscalation(created as DbContentEscalation);
}

export async function incrementExposure(
  escalationId: string,
  response?: string
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('content_escalation')
    .select('exposure_count')
    .eq('id', escalationId)
    .single();

  if (!existing) {
    console.error('Content escalation not found');
    return false;
  }

  const updates: Record<string, unknown> = {
    exposure_count: (existing as { exposure_count: number }).exposure_count + 1,
  };

  if (response) {
    updates.current_response = response;
  }

  const { error } = await supabase
    .from('content_escalation')
    .update(updates)
    .eq('id', escalationId);

  if (error) {
    console.error('Failed to increment exposure:', error);
    return false;
  }

  return true;
}

export async function updateContentIntensity(
  escalationId: string,
  newLevel: number,
  response?: string
): Promise<boolean> {
  const updates: Record<string, unknown> = {
    intensity_level: newLevel,
  };

  if (response) {
    updates.current_response = response;
  }

  const { error } = await supabase
    .from('content_escalation')
    .update(updates)
    .eq('id', escalationId);

  if (error) {
    console.error('Failed to update content intensity:', error);
    return false;
  }

  return true;
}

// ============================================
// ESCALATION EVENT FUNCTIONS
// ============================================

export async function getEscalationEventsByDomain(
  userId: string,
  domain: EscalationDomain,
  limit: number = 20
): Promise<EscalationEvent[]> {
  const { data, error } = await supabase
    .from('escalation_events')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get escalation events:', error);
    return [];
  }

  return (data || []).map(d => mapDbToEscalationEvent(d as DbEscalationEvent));
}

export async function getAllEscalationEvents(
  userId: string,
  limit: number = 50
): Promise<EscalationEvent[]> {
  const { data, error } = await supabase
    .from('escalation_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get all escalation events:', error);
    return [];
  }

  return (data || []).map(d => mapDbToEscalationEvent(d as DbEscalationEvent));
}

// ============================================
// STATS FUNCTIONS
// ============================================

export interface DomainStats {
  totalEscalations: number;
  totalBoundariesDissolved: number;
  boundariesInProgress: number;
  boundariesIdentified: number;
  totalContentExposures: number;
  averageLevel: number;
  mostProgressedDomain: EscalationDomain | null;
  highestLevel: number;
}

export async function getDomainStats(userId: string): Promise<DomainStats> {
  // Get escalation events count
  const { count: escalationCount } = await supabase
    .from('escalation_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Get boundaries by status
  const { data: boundaries } = await supabase
    .from('boundary_dissolution')
    .select('dissolution_started, dissolution_completed')
    .eq('user_id', userId);

  const dissolvedCount = (boundaries || []).filter(b => b.dissolution_completed).length;
  const inProgressCount = (boundaries || []).filter(b => b.dissolution_started && !b.dissolution_completed).length;
  const identifiedCount = (boundaries || []).filter(b => !b.dissolution_started).length;

  // Get content exposures count
  const { data: contentData } = await supabase
    .from('content_escalation')
    .select('exposure_count')
    .eq('user_id', userId);

  const totalExposures = (contentData || []).reduce((sum, c) => sum + (c.exposure_count || 0), 0);

  // Get escalation state for average level
  const { data: states } = await supabase
    .from('escalation_state')
    .select('domain, current_level')
    .eq('user_id', userId);

  let avgLevel = 0;
  let mostProgressedDomain: EscalationDomain | null = null;
  let highestLevel = 0;

  if (states && states.length > 0) {
    const totalLevel = states.reduce((sum, s) => sum + (s.current_level || 0), 0);
    avgLevel = totalLevel / states.length;

    states.forEach(s => {
      if (s.current_level > highestLevel) {
        highestLevel = s.current_level;
        mostProgressedDomain = s.domain as EscalationDomain;
      }
    });
  }

  return {
    totalEscalations: escalationCount || 0,
    totalBoundariesDissolved: dissolvedCount,
    boundariesInProgress: inProgressCount,
    boundariesIdentified: identifiedCount,
    totalContentExposures: totalExposures,
    averageLevel: Math.round(avgLevel * 10) / 10,
    mostProgressedDomain,
    highestLevel,
  };
}
