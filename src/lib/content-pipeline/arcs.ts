/**
 * Content Pipeline — Narrative Arcs
 *
 * Handler as showrunner: plan, create, and advance narrative arcs
 * with weekly beats that drive content strategy.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { NarrativeArc, ArcBeat, ArcType, ArcStatus } from '../../types/content-pipeline';

// ── Create arc ──────────────────────────────────────────

export async function createArc(
  userId: string,
  arc: {
    title: string;
    arc_type: ArcType;
    domain_focus?: string;
    platform_emphasis?: string[];
    beats?: ArcBeat[];
  }
): Promise<NarrativeArc | null> {
  const { data, error } = await supabase
    .from('narrative_arcs')
    .insert({
      user_id: userId,
      title: arc.title,
      arc_type: arc.arc_type,
      domain_focus: arc.domain_focus || null,
      platform_emphasis: arc.platform_emphasis || [],
      beats: arc.beats || [],
      current_beat: 0,
      arc_status: 'planned',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[arcs] createArc error:', error);
    return null;
  }

  return data as NarrativeArc;
}

// ── AI-generated arc ────────────────────────────────────

export async function generateArc(
  userId: string,
  arcType: ArcType
): Promise<NarrativeArc | null> {
  const { data: aiResult } = await invokeWithAuth('handler-ai', {
    action: 'generate_narrative_arc',
    arc_type: arcType,
    user_id: userId,
  });

  if (!aiResult || typeof aiResult !== 'object') {
    // Fallback: create a basic arc
    return createArc(userId, {
      title: `${arcType} Arc`,
      arc_type: arcType,
      beats: [
        { week: 1, beat: 'Setup — establish the premise', status: 'planned' },
        { week: 2, beat: 'Rising action — first challenge', status: 'planned' },
        { week: 3, beat: 'Climax — breakthrough moment', status: 'planned' },
        { week: 4, beat: 'Resolution — integrate the change', status: 'planned' },
      ],
    });
  }

  const generated = aiResult as Record<string, unknown>;
  return createArc(userId, {
    title: (generated.title as string) || `${arcType} Arc`,
    arc_type: arcType,
    domain_focus: generated.domain_focus as string | undefined,
    platform_emphasis: generated.platform_emphasis as string[] | undefined,
    beats: generated.beats as ArcBeat[] | undefined,
  });
}

// ── Get active arc ──────────────────────────────────────

export async function getActiveArc(userId: string): Promise<NarrativeArc | null> {
  const { data, error } = await supabase
    .from('narrative_arcs')
    .select('*')
    .eq('user_id', userId)
    .in('arc_status', ['active', 'planned'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as NarrativeArc;
}

// ── Get all arcs ────────────────────────────────────────

export async function getAllArcs(userId: string): Promise<NarrativeArc[]> {
  const { data, error } = await supabase
    .from('narrative_arcs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[arcs] getAllArcs error:', error);
    return [];
  }

  return (data || []) as NarrativeArc[];
}

// ── Update beat status ──────────────────────────────────

export async function updateBeat(
  arcId: string,
  week: number,
  status: ArcBeat['status']
): Promise<boolean> {
  const { data: arc } = await supabase
    .from('narrative_arcs')
    .select('beats, current_beat')
    .eq('id', arcId)
    .single();

  if (!arc) return false;

  const beats = (arc.beats as ArcBeat[]) || [];
  const idx = beats.findIndex(b => b.week === week);
  if (idx === -1) return false;

  beats[idx].status = status;

  const updates: Record<string, unknown> = {
    beats,
    updated_at: new Date().toISOString(),
  };

  // Advance current_beat if completing
  if (status === 'completed' && week === (arc.current_beat as number) + 1) {
    updates.current_beat = week;
  }

  // Check if all beats are completed
  const allDone = beats.every(b => b.status === 'completed' || b.status === 'skipped');
  if (allDone) {
    updates.arc_status = 'completed' as ArcStatus;
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('narrative_arcs')
    .update(updates)
    .eq('id', arcId);

  return !error;
}

// ── Activate arc ────────────────────────────────────────

export async function activateArc(arcId: string): Promise<boolean> {
  const { error } = await supabase
    .from('narrative_arcs')
    .update({
      arc_status: 'active' as ArcStatus,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', arcId);

  return !error;
}
