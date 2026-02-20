/**
 * Narrative Arcs — Sprint 6 (Addendum A10)
 * Long-arc narrative planning for Handler context.
 * 6 arcs spanning months, each plants seeds for the next.
 *
 * Arc 1 (Months 1-2): "The Beginning"
 * Arc 2 (Months 2-4): "Finding Her Voice"
 * Arc 3 (Months 3-6): "The Body Changes"
 * Arc 4 (Months 4-8): "Going Deeper"
 * Arc 5 (Months 6-12): "HRT Decision"
 * Arc 6 (Month 12+): "The Reveal"
 */

import { supabase } from '../supabase';
import type { NarrativeArcProgress, DbNarrativeArcProgress } from '../../types/industry';
import { mapNarrativeArcProgress } from '../../types/industry';

// ============================================
// Arc Definitions
// ============================================

export interface ArcDefinition {
  arcNumber: number;
  name: string;
  monthsStart: number;
  monthsEnd: number;
  description: string;
  seeds: string[];
  keyBeats: string[];
  contentThemes: string[];
  handlerTone: string;
  escalationRatchets: string[];
}

export const NARRATIVE_ARCS: ArcDefinition[] = [
  {
    arcNumber: 1,
    name: 'The Beginning',
    monthsStart: 0,
    monthsEnd: 2,
    description: 'First posts, first followers, Handler debuts. Everything is new and terrifying.',
    seeds: [
      'Introduce Maxy as a real person with a cage and a protocol',
      'First Reddit post — vulnerability is the hook',
      'Handler appears in third person for the first time',
      'First follower interaction — someone cares',
    ],
    keyBeats: [
      'first_post',
      'first_follower',
      'handler_debut',
      'first_subscriber',
    ],
    contentThemes: ['introduction', 'vulnerability', 'beginning', 'cage_life'],
    handlerTone: 'Protective, introducing Maxy to the world. Building trust with audience.',
    escalationRatchets: [
      'Posted publicly — can\'t unpublish without ghosting followers',
      'Handler has a voice — audience expects it',
    ],
  },
  {
    arcNumber: 2,
    name: 'Finding Her Voice',
    monthsStart: 2,
    monthsEnd: 4,
    description: 'Voice clips, monthly comparisons. The audience hears the change happening.',
    seeds: [
      'First voice clip posted — raw, unfiltered',
      'Monthly comparison series starts',
      'Whisper ASMR as content category',
      'Voice training progress becomes content arc',
    ],
    keyBeats: [
      'first_voice_post',
      'voice_comparison_1',
      'first_asmr',
      'voice_milestone',
    ],
    contentThemes: ['voice', 'transformation', 'vulnerability', 'comparison'],
    handlerTone: 'Encouraging voice documentation. Framing training as content.',
    escalationRatchets: [
      'Voice on record — listeners track progress',
      'Monthly comparisons create accountability',
    ],
  },
  {
    arcNumber: 3,
    name: 'The Body Changes',
    monthsStart: 3,
    monthsEnd: 6,
    description: 'Exercise results visible. Measurements tracked. Progress photos become premium.',
    seeds: [
      'Progress photos show real body changes',
      'Measurements posted (anonymized)',
      'Exercise routine becomes content narrative',
      'Before/after comparisons begin',
    ],
    keyBeats: [
      'first_progress_comparison',
      'measurements_posted',
      'body_milestone',
      'premium_progress_set',
    ],
    contentThemes: ['transformation', 'body', 'progress', 'dedication'],
    handlerTone: 'Documenting transformation. Every change is content. No hiding.',
    escalationRatchets: [
      'Body changes are permanent record',
      'Audience tracks physical transformation',
    ],
  },
  {
    arcNumber: 4,
    name: 'Going Deeper',
    monthsStart: 4,
    monthsEnd: 8,
    description: 'Lingerie, makeup, first cam. Collaborations begin. Professional identity solidifies.',
    seeds: [
      'Full lingerie shoots (Tier 2 wardrobe)',
      'First makeup look',
      'First cam session',
      'First collaboration with another creator',
    ],
    keyBeats: [
      'first_lingerie_set',
      'first_makeup',
      'first_cam',
      'first_collaboration',
    ],
    contentThemes: ['escalation', 'feminization', 'professional', 'collaboration'],
    handlerTone: 'Pushing boundaries. This is a career now, not a hobby.',
    escalationRatchets: [
      'Collaborators know Maxy — professional network exists',
      'Cam session is live — no editing, no taking back',
      'Makeup skills are visible investment',
    ],
  },
  {
    arcNumber: 5,
    name: 'The HRT Decision',
    monthsStart: 6,
    monthsEnd: 12,
    description: 'The biggest narrative beat. Will she or won\'t she? Audience investment peaks.',
    seeds: [
      'Handler starts referencing HRT obliquely',
      'Audience polls about "next steps"',
      'Medical consultations become content beats',
      'The question becomes unavoidable',
    ],
    keyBeats: [
      'hrt_first_mention',
      'hrt_poll',
      'consultation_referenced',
      'hrt_decision',
    ],
    contentThemes: ['decision', 'identity', 'future', 'transformation'],
    handlerTone: 'Careful, measured. This is the nuclear option — maximum engagement.',
    escalationRatchets: [
      'HRT discussion creates audience expectation',
      'Medical steps are irreversible',
      'Professional identity depends on continuation',
    ],
  },
  {
    arcNumber: 6,
    name: 'The Reveal',
    monthsStart: 12,
    monthsEnd: 99,
    description: 'Face reveal. 2-week hype campaign. Full identity convergence.',
    seeds: [
      '2-week countdown begins',
      'Hype posts across all platforms',
      'Handler "negotiates" with audience for the reveal',
      'Full face reveal',
    ],
    keyBeats: [
      'reveal_countdown',
      'reveal_hype',
      'reveal_day',
      'post_reveal_content',
    ],
    contentThemes: ['reveal', 'identity', 'culmination', 'authenticity'],
    handlerTone: 'Triumphant. Every step led here. No going back.',
    escalationRatchets: [
      'Face revealed — David and Maxy are the same person publicly',
      'Professional identity is permanent',
    ],
  },
];

// ============================================
// Arc Management
// ============================================

/**
 * Get the current active arc based on protocol start date.
 */
export function getCurrentArc(protocolDays: number): ArcDefinition {
  const months = protocolDays / 30;

  for (let i = NARRATIVE_ARCS.length - 1; i >= 0; i--) {
    if (months >= NARRATIVE_ARCS[i].monthsStart) {
      return NARRATIVE_ARCS[i];
    }
  }
  return NARRATIVE_ARCS[0];
}

/**
 * Initialize arc progress for a user.
 */
export async function initializeArcs(userId: string): Promise<void> {
  for (const arc of NARRATIVE_ARCS) {
    await supabase
      .from('narrative_arc_progress')
      .upsert({
        user_id: userId,
        arc_number: arc.arcNumber,
        arc_name: arc.name,
        status: arc.arcNumber === 1 ? 'active' : 'upcoming',
      }, { onConflict: 'user_id,arc_number' });
  }
}

/**
 * Get arc progress for a user.
 */
export async function getArcProgress(userId: string): Promise<NarrativeArcProgress[]> {
  const { data, error } = await supabase
    .from('narrative_arc_progress')
    .select('*')
    .eq('user_id', userId)
    .order('arc_number', { ascending: true });

  if (error || !data) return [];
  return data.map((r: DbNarrativeArcProgress) => mapNarrativeArcProgress(r));
}

/**
 * Record a seed planted in the current arc.
 */
export async function plantSeed(
  userId: string,
  arcNumber: number,
  seed: string,
): Promise<void> {
  const { data: arc } = await supabase
    .from('narrative_arc_progress')
    .select('seeds_planted')
    .eq('user_id', userId)
    .eq('arc_number', arcNumber)
    .single();

  if (!arc) return;

  const seeds = (arc.seeds_planted as Array<{ seed: string; plantedAt: string }>) ?? [];
  seeds.push({ seed, plantedAt: new Date().toISOString() });

  await supabase
    .from('narrative_arc_progress')
    .update({
      seeds_planted: seeds,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('arc_number', arcNumber);
}

/**
 * Record a key moment in the current arc.
 */
export async function recordKeyMoment(
  userId: string,
  arcNumber: number,
  moment: string,
): Promise<void> {
  const { data: arc } = await supabase
    .from('narrative_arc_progress')
    .select('key_moments')
    .eq('user_id', userId)
    .eq('arc_number', arcNumber)
    .single();

  if (!arc) return;

  const moments = (arc.key_moments as Array<{ moment: string; occurredAt: string }>) ?? [];
  moments.push({ moment, occurredAt: new Date().toISOString() });

  await supabase
    .from('narrative_arc_progress')
    .update({
      key_moments: moments,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('arc_number', arcNumber);
}

/**
 * Advance to the next arc.
 */
export async function advanceArc(
  userId: string,
  currentArcNumber: number,
): Promise<void> {
  // Complete current arc
  await supabase
    .from('narrative_arc_progress')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('arc_number', currentArcNumber);

  // Activate next arc
  const nextArc = currentArcNumber + 1;
  if (nextArc <= 6) {
    await supabase
      .from('narrative_arc_progress')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('arc_number', nextArc);
  }
}

/**
 * Build narrative context for Handler AI prompts.
 */
export async function buildNarrativeContext(userId: string): Promise<string> {
  try {
    const arcs = await getArcProgress(userId);
    if (arcs.length === 0) return '';

    const active = arcs.find(a => a.status === 'active');
    if (!active) return '';

    const definition = NARRATIVE_ARCS.find(a => a.arcNumber === active.arcNumber);
    if (!definition) return '';

    const seedCount = active.seedsPlanted.length;
    const momentCount = active.keyMoments.length;

    return `NARRATIVE: Arc ${active.arcNumber} "${active.arcName}" (months ${definition.monthsStart}-${definition.monthsEnd})
  seeds: ${seedCount}/${definition.seeds.length} planted, moments: ${momentCount}/${definition.keyBeats.length}
  themes: ${definition.contentThemes.join(', ')}
  tone: ${definition.handlerTone.slice(0, 80)}`;
  } catch {
    return '';
  }
}
