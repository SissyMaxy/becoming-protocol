/**
 * Feminization Target Engine
 * Persistent weekly target system that shapes every Handler prescription.
 * Exposure level ratchet — only goes up. Boundary pushes are permanent evidence.
 * Pure Supabase CRUD + logic. No React.
 */

import { supabase } from './supabase';
import { queueDelayedReward } from './dopamine-engine';

// ============================================
// TYPES
// ============================================

export interface FeminizationTarget {
  id: string;
  userId: string;
  targetDomain: string;
  targetDescription: string;
  targetMetric: string | null;
  targetIntensity: number;
  exposureLevel: number;
  comfortZoneEdge: string | null;
  lastBoundaryPushed: string | null;
  lastBoundaryPushedAt: string | null;
  status: 'active' | 'completed' | 'replaced';
  startedAt: string;
  completedAt: string | null;
  replacedBy: string | null;
  createdAt: string;
}

interface DbFeminizationTarget {
  id: string;
  user_id: string;
  target_domain: string;
  target_description: string;
  target_metric: string | null;
  target_intensity: number;
  exposure_level: number;
  comfort_zone_edge: string | null;
  last_boundary_pushed: string | null;
  last_boundary_pushed_at: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  replaced_by: string | null;
  created_at: string;
}

function mapDbToTarget(row: DbFeminizationTarget): FeminizationTarget {
  return {
    id: row.id,
    userId: row.user_id,
    targetDomain: row.target_domain,
    targetDescription: row.target_description,
    targetMetric: row.target_metric,
    targetIntensity: row.target_intensity,
    exposureLevel: row.exposure_level,
    comfortZoneEdge: row.comfort_zone_edge,
    lastBoundaryPushed: row.last_boundary_pushed,
    lastBoundaryPushedAt: row.last_boundary_pushed_at,
    status: row.status as FeminizationTarget['status'],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    replacedBy: row.replaced_by,
    createdAt: row.created_at,
  };
}

// ============================================
// CRUD
// ============================================

export async function getActiveTarget(userId: string): Promise<FeminizationTarget | null> {
  const { data } = await supabase
    .from('feminization_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data ? mapDbToTarget(data as DbFeminizationTarget) : null;
}

export async function setTarget(
  userId: string,
  domain: string,
  description: string,
  metric?: string,
  intensity?: number,
): Promise<FeminizationTarget | null> {
  // Get current exposure level from any existing target (ratchet — carry forward)
  const current = await getActiveTarget(userId);
  const exposureLevel = current?.exposureLevel ?? 1;

  // Replace active target if one exists
  if (current) {
    await supabase
      .from('feminization_targets')
      .update({ status: 'replaced', completed_at: new Date().toISOString() })
      .eq('id', current.id);
  }

  const { data } = await supabase
    .from('feminization_targets')
    .insert({
      user_id: userId,
      target_domain: domain,
      target_description: description,
      target_metric: metric || null,
      target_intensity: intensity ?? 3,
      exposure_level: exposureLevel,
      comfort_zone_edge: current?.comfortZoneEdge || null,
      last_boundary_pushed: current?.lastBoundaryPushed || null,
      last_boundary_pushed_at: current?.lastBoundaryPushedAt || null,
      replaced_by: null,
    })
    .select()
    .single();

  if (!data) return null;

  // Link old → new
  if (current) {
    await supabase
      .from('feminization_targets')
      .update({ replaced_by: data.id })
      .eq('id', current.id);
  }

  return mapDbToTarget(data as DbFeminizationTarget);
}

export async function completeTarget(userId: string, targetId: string): Promise<void> {
  await supabase
    .from('feminization_targets')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', targetId)
    .eq('user_id', userId);
}

export async function getExposureLevel(userId: string): Promise<number> {
  const target = await getActiveTarget(userId);
  return target?.exposureLevel ?? 1;
}

export async function advanceExposureLevel(userId: string): Promise<number> {
  const target = await getActiveTarget(userId);
  if (!target) return 1;

  const newLevel = Math.min(target.exposureLevel + 1, 10);

  await supabase
    .from('feminization_targets')
    .update({ exposure_level: newLevel })
    .eq('id', target.id);

  // Dopamine: delayed reward after exposure advance (15-45 min)
  queueDelayedReward(
    userId,
    'exposure_advance',
    'One-way door',
    `That was a one-way door. Exposure level ${newLevel}. She doesn't go back.`,
    30,
    { hapticPattern: 'good_girl', ginaSafe: false },
  ).catch(() => {});

  return newLevel;
}

export async function recordBoundaryPush(userId: string, description: string): Promise<void> {
  const target = await getActiveTarget(userId);
  if (!target) return;

  await supabase
    .from('feminization_targets')
    .update({
      last_boundary_pushed: description,
      last_boundary_pushed_at: new Date().toISOString(),
    })
    .eq('id', target.id);
}

export async function updateComfortZoneEdge(userId: string, edge: string): Promise<void> {
  const target = await getActiveTarget(userId);
  if (!target) return;

  await supabase
    .from('feminization_targets')
    .update({ comfort_zone_edge: edge })
    .eq('id', target.id);
}

export async function getTargetHistory(userId: string, limit = 5): Promise<FeminizationTarget[]> {
  const { data } = await supabase
    .from('feminization_targets')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map((row) => mapDbToTarget(row as DbFeminizationTarget));
}

// ============================================
// EXPOSURE LADDER (for shoot context)
// ============================================

export const EXPOSURE_LADDER: Record<number, { allowed: string[]; pushing: string }> = {
  1: { allowed: ['body_anonymous', 'cage_check'], pushing: 'Include hands — they show her nail polish' },
  2: { allowed: ['body_styled', 'outfit_reveal'], pushing: 'Show collarbone and neck' },
  3: { allowed: ['partial_face_lips', 'jawline'], pushing: 'Chin and lips visible' },
  4: { allowed: ['partial_face_eyes', 'profile'], pushing: 'Eyes visible, profile shots' },
  5: { allowed: ['full_face_masked', 'wig_styled'], pushing: 'Full face with styled presentation' },
  6: { allowed: ['full_face_natural', 'close_up'], pushing: 'Full face, no mask, no filter' },
  7: { allowed: ['voice_content', 'audio_personality'], pushing: 'Voice clips with face' },
  8: { allowed: ['video_short', 'reaction_content'], pushing: 'Video content, personality visible' },
  9: { allowed: ['live_adjacent', 'cam_prep'], pushing: 'Near-live content, cam preparation' },
  10: { allowed: ['cam_live', 'partnered_content'], pushing: 'Live streaming, partnered work' },
};

// ============================================
// HANDLER CONTEXT BUILDER
// ============================================

export async function buildFeminizationContext(userId: string): Promise<string> {
  try {
    const [target, history] = await Promise.allSettled([
      getActiveTarget(userId),
      getTargetHistory(userId, 5),
    ]);

    const t = target.status === 'fulfilled' ? target.value : null;
    const h = history.status === 'fulfilled' ? history.value : [];

    if (!t && h.length === 0) return '';

    const parts: string[] = [];

    if (t) {
      const ladder = EXPOSURE_LADDER[t.exposureLevel] || EXPOSURE_LADDER[1];

      parts.push(`FEMINIZATION TARGET:`);
      parts.push(`  Domain: ${t.targetDomain}`);
      parts.push(`  This week: "${t.targetDescription}"`);
      parts.push(`  Metric: ${t.targetMetric || 'qualitative'}`);
      parts.push(`  Intensity: ${t.targetIntensity}/5`);
      parts.push(`  Exposure level: ${t.exposureLevel}/10`);
      if (t.comfortZoneEdge) {
        parts.push(`  Comfort zone edge: "${t.comfortZoneEdge}"`);
      }
      if (t.lastBoundaryPushed) {
        const date = t.lastBoundaryPushedAt
          ? new Date(t.lastBoundaryPushedAt).toLocaleDateString()
          : 'unknown';
        parts.push(`  Last boundary pushed: "${t.lastBoundaryPushed}" on ${date}`);
      }
      parts.push(`  Pushing next: ${ladder.pushing}`);
    }

    if (h.length > 0) {
      const historyStr = h.map((ht) => {
        const status = ht.status === 'completed' ? 'done' : 'replaced';
        return `${ht.targetDomain}: "${ht.targetDescription.slice(0, 60)}" (${status})`;
      }).join('; ');
      parts.push(`  Target history: ${historyStr}`);
    }

    parts.push('');
    parts.push('EVERY TASK YOU PRESCRIBE MUST SERVE THIS TARGET.');
    parts.push('Voice task? Frame it toward the target. Skincare? Connect it to the target.');
    parts.push('Shoot? Shot direction serves the target. Journal? Prompt references the target.');
    parts.push('Nothing is generic. Everything pushes her toward the specific frontier this week.');

    return parts.join('\n');
  } catch {
    return '';
  }
}

/**
 * Build shoot escalation context for Handler AI.
 */
export async function buildShootEscalationContext(userId: string): Promise<string> {
  try {
    const target = await getActiveTarget(userId);
    if (!target) return '';

    const ladder = EXPOSURE_LADDER[target.exposureLevel] || EXPOSURE_LADDER[1];

    const parts: string[] = [];
    parts.push(`SHOOT ESCALATION:`);
    parts.push(`  Current exposure level: ${target.exposureLevel}/10`);
    parts.push(`  Allowed content: ${ladder.allowed.join(', ')}`);
    parts.push(`  Pushing next: ${ladder.pushing}`);

    if (target.lastBoundaryPushed) {
      const date = target.lastBoundaryPushedAt
        ? new Date(target.lastBoundaryPushedAt).toLocaleDateString()
        : 'unknown';
      parts.push(`  Last boundary pushed: "${target.lastBoundaryPushed}" on ${date}`);
    }
    if (target.comfortZoneEdge) {
      parts.push(`  Comfort zone edge: "${target.comfortZoneEdge}"`);
    }

    parts.push(`  DIRECTIVE: Shot directions must push 5-10% past last shoot. Not in explicitness — in identity exposure.`);
    parts.push(`  Each shoot is a one-way door. She can't un-show what she's shown.`);

    return parts.join('\n');
  } catch {
    return '';
  }
}
