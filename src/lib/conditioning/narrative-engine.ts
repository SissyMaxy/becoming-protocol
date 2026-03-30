/**
 * Narrative Engine
 *
 * Connects narrative_arcs to content planning and Handler context.
 * The Handler uses narrative arcs as a showrunner framework — planned
 * content beats that drive weekly content strategy across platforms.
 */

import { supabase } from '../supabase';
import type { NarrativeArc, ArcBeat, ArcType } from '../../types/content-pipeline';

// ============================================
// QUERIES
// ============================================

/**
 * Get the currently active narrative arc for a user.
 * Prefers 'active' status, falls back to most recent 'planned'.
 */
export async function getActiveNarrative(userId: string): Promise<NarrativeArc | null> {
  try {
    // Try active first
    const { data: active, error: activeErr } = await supabase
      .from('narrative_arcs')
      .select('*')
      .eq('user_id', userId)
      .eq('arc_status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeErr && active) return active as NarrativeArc;

    // Fall back to most recent planned
    const { data: planned, error: plannedErr } = await supabase
      .from('narrative_arcs')
      .select('*')
      .eq('user_id', userId)
      .eq('arc_status', 'planned')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (plannedErr || !planned) return null;
    return planned as NarrativeArc;
  } catch (err) {
    console.error('[narrative-engine] getActiveNarrative exception:', err);
    return null;
  }
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new narrative arc with title, description (domain_focus), and beats.
 */
export async function createNarrative(
  userId: string,
  input: {
    title: string;
    arcType: ArcType;
    domainFocus?: string;
    platformEmphasis?: string[];
    beats: Array<{ week: number; beat: string }>;
  },
): Promise<NarrativeArc | null> {
  try {
    const arcBeats: ArcBeat[] = input.beats.map(b => ({
      week: b.week,
      beat: b.beat,
      status: 'planned' as const,
    }));

    const { data, error } = await supabase
      .from('narrative_arcs')
      .insert({
        user_id: userId,
        title: input.title,
        arc_type: input.arcType,
        domain_focus: input.domainFocus || null,
        platform_emphasis: input.platformEmphasis || [],
        beats: arcBeats,
        current_beat: 0,
        arc_status: 'planned',
      })
      .select('*')
      .single();

    if (error) {
      console.error('[narrative-engine] createNarrative error:', error.message);
      return null;
    }

    return data as NarrativeArc;
  } catch (err) {
    console.error('[narrative-engine] createNarrative exception:', err);
    return null;
  }
}

/**
 * Advance a narrative arc by marking a specific beat as completed.
 * Also advances current_beat pointer and checks for arc completion.
 */
export async function advanceNarrative(
  userId: string,
  arcId: string,
  beatIndex: number,
): Promise<boolean> {
  try {
    const { data: arc, error: fetchErr } = await supabase
      .from('narrative_arcs')
      .select('beats, current_beat, user_id')
      .eq('id', arcId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !arc) return false;

    const beats = (arc.beats as ArcBeat[]) || [];
    if (beatIndex < 0 || beatIndex >= beats.length) return false;

    beats[beatIndex].status = 'completed';

    const updates: Record<string, unknown> = {
      beats,
      updated_at: new Date().toISOString(),
    };

    // Advance current_beat if this was the next expected beat
    if (beatIndex === (arc.current_beat as number)) {
      updates.current_beat = beatIndex + 1;
    }

    // Check if all beats are done
    const allDone = beats.every(b => b.status === 'completed' || b.status === 'skipped');
    if (allDone) {
      updates.arc_status = 'completed';
      updates.completed_at = new Date().toISOString();
    }

    const { error: updateErr } = await supabase
      .from('narrative_arcs')
      .update(updates)
      .eq('id', arcId);

    if (updateErr) {
      console.error('[narrative-engine] advanceNarrative update error:', updateErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[narrative-engine] advanceNarrative exception:', err);
    return false;
  }
}

/**
 * Get the next uncompleted beat from the active narrative arc.
 * Returns null if no active arc or all beats are complete.
 */
export async function getNextBeat(
  userId: string,
): Promise<{ arcId: string; arcTitle: string; beatIndex: number; beat: ArcBeat } | null> {
  try {
    const arc = await getActiveNarrative(userId);
    if (!arc) return null;

    const beats = arc.beats || [];
    const nextIndex = beats.findIndex(b => b.status === 'planned' || b.status === 'active');
    if (nextIndex === -1) return null;

    return {
      arcId: arc.id,
      arcTitle: arc.title,
      beatIndex: nextIndex,
      beat: beats[nextIndex],
    };
  } catch (err) {
    console.error('[narrative-engine] getNextBeat exception:', err);
    return null;
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Build Handler context string for the active narrative arc.
 * Shows current arc, completed/remaining beats, and next planned beat.
 */
export async function buildNarrativeContext(userId: string): Promise<string> {
  try {
    const arc = await getActiveNarrative(userId);
    if (!arc) return '';

    const beats = arc.beats || [];
    const completed = beats.filter(b => b.status === 'completed');
    const remaining = beats.filter(b => b.status === 'planned' || b.status === 'active');
    const skipped = beats.filter(b => b.status === 'skipped');
    const nextBeat = remaining[0];

    const lines: string[] = [];
    lines.push(`NARRATIVE ARC: "${arc.title}" (${arc.arc_type}, ${arc.arc_status})`);
    lines.push(`  beats: ${completed.length} completed, ${remaining.length} remaining${skipped.length > 0 ? `, ${skipped.length} skipped` : ''} of ${beats.length} total`);

    if (arc.domain_focus) {
      lines.push(`  focus: ${arc.domain_focus}`);
    }
    if (arc.platform_emphasis && arc.platform_emphasis.length > 0) {
      lines.push(`  platforms: ${arc.platform_emphasis.join(', ')}`);
    }

    // Show last 2 completed beats for continuity
    if (completed.length > 0) {
      const recentCompleted = completed.slice(-2);
      for (const b of recentCompleted) {
        lines.push(`  [done] wk${b.week}: ${b.beat}`);
      }
    }

    // Show next beat prominently
    if (nextBeat) {
      lines.push(`  [NEXT] wk${nextBeat.week}: ${nextBeat.beat}`);
    }

    // Show upcoming beats (up to 2 more after next)
    if (remaining.length > 1) {
      const upcoming = remaining.slice(1, 3);
      for (const b of upcoming) {
        lines.push(`  [upcoming] wk${b.week}: ${b.beat}`);
      }
    }

    if (arc.revenue_generated_cents > 0) {
      lines.push(`  revenue from arc: $${(arc.revenue_generated_cents / 100).toFixed(0)}`);
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[narrative-engine] buildNarrativeContext exception:', err);
    return '';
  }
}
