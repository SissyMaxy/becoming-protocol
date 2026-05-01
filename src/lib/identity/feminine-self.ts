/**
 * Identity persistence layer — server-side helpers.
 *
 * Accepts an injected SupabaseClient so the same module is callable from
 * both the Vite-bundled UI (using the anon-keyed client) and the Vercel
 * serverless functions (using the service-role client). Per the project
 * architecture rule, /api/ functions must not import src/lib/supabase
 * directly — passing the client in keeps this module shared.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type FeminineSelf,
  type DbFeminineSelf,
  type Pronouns,
  type WardrobeItem,
  type DbWardrobeItem,
  type WardrobeItemType,
  type PhaseDefinition,
  type DbPhaseDefinition,
  feminineSelfFromDb,
  wardrobeItemFromDb,
  phaseDefinitionFromDb,
  DEFAULT_PRONOUNS,
} from '../../types/identity';

const MAX_PHASE = 7;

// ============================================
// FEMININE SELF
// ============================================

export async function getFeminineSelf(
  sb: SupabaseClient,
  userId: string,
): Promise<FeminineSelf | null> {
  const { data, error } = await sb
    .from('feminine_self')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? feminineSelfFromDb(data as DbFeminineSelf) : null;
}

/**
 * Upsert feminine_self row. If absent, creates it with sensible defaults
 * (phase 1, default pronouns) before applying patch fields.
 */
async function upsertFeminineSelf(
  sb: SupabaseClient,
  userId: string,
  patch: Partial<Pick<DbFeminineSelf, 'feminine_name' | 'pronouns' | 'current_honorific' | 'transformation_phase' | 'phase_started_at'>>,
): Promise<FeminineSelf> {
  const existing = await getFeminineSelf(sb, userId);
  if (!existing) {
    const insertRow = {
      user_id: userId,
      feminine_name: patch.feminine_name ?? null,
      pronouns: patch.pronouns ?? DEFAULT_PRONOUNS,
      current_honorific: patch.current_honorific ?? null,
      transformation_phase: patch.transformation_phase ?? 1,
      phase_started_at: patch.phase_started_at ?? new Date().toISOString(),
    };
    const { data, error } = await sb
      .from('feminine_self')
      .insert(insertRow)
      .select('*')
      .single();
    if (error) throw error;
    return feminineSelfFromDb(data as DbFeminineSelf);
  }
  const { data, error } = await sb
    .from('feminine_self')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return feminineSelfFromDb(data as DbFeminineSelf);
}

export async function setFeminineName(
  sb: SupabaseClient,
  userId: string,
  feminineName: string | null,
): Promise<FeminineSelf> {
  const trimmed = feminineName?.trim() || null;
  return upsertFeminineSelf(sb, userId, { feminine_name: trimmed });
}

export async function setPronouns(
  sb: SupabaseClient,
  userId: string,
  pronouns: Pronouns,
): Promise<FeminineSelf> {
  return upsertFeminineSelf(sb, userId, { pronouns });
}

export async function setHonorific(
  sb: SupabaseClient,
  userId: string,
  honorific: string | null,
): Promise<FeminineSelf> {
  const trimmed = honorific?.trim() || null;
  return upsertFeminineSelf(sb, userId, { current_honorific: trimmed });
}

// ============================================
// WARDROBE
// ============================================

export async function addWardrobeItem(
  sb: SupabaseClient,
  userId: string,
  input: {
    itemType: WardrobeItemType;
    itemName: string;
    notes?: string | null;
    acquiredAt?: string;
  },
): Promise<WardrobeItem> {
  const row = {
    user_id: userId,
    item_type: input.itemType,
    item_name: input.itemName.trim(),
    notes: input.notes?.trim() || null,
    acquired_at: input.acquiredAt ?? new Date().toISOString(),
  };
  const { data, error } = await sb
    .from('wardrobe_items')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return wardrobeItemFromDb(data as DbWardrobeItem);
}

export async function listWardrobeItems(
  sb: SupabaseClient,
  userId: string,
  limit = 100,
): Promise<WardrobeItem[]> {
  const { data, error } = await sb
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .order('acquired_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => wardrobeItemFromDb(r as DbWardrobeItem));
}

// ============================================
// PHASES
// ============================================

export async function getPhaseDefinition(
  sb: SupabaseClient,
  phase: number,
): Promise<PhaseDefinition | null> {
  if (phase < 1 || phase > MAX_PHASE) return null;
  const { data, error } = await sb
    .from('transformation_phase_defs')
    .select('*')
    .eq('phase', phase)
    .maybeSingle();
  if (error) throw error;
  return data ? phaseDefinitionFromDb(data as DbPhaseDefinition) : null;
}

export async function listPhaseDefinitions(
  sb: SupabaseClient,
): Promise<PhaseDefinition[]> {
  const { data, error } = await sb
    .from('transformation_phase_defs')
    .select('*')
    .order('phase');
  if (error) throw error;
  return (data ?? []).map((r) => phaseDefinitionFromDb(r as DbPhaseDefinition));
}

export interface AdvancePhaseResult {
  fromPhase: number;
  toPhase: number;
  newPhaseDef: PhaseDefinition | null;
  /**
   * Honorific suggested by the new phase. NOT auto-applied — UI surfaces it
   * for the user (or persona) to accept. See feedback memory: phase
   * advancement suggests, never auto-overwrites.
   */
  suggestedHonorific: string | null;
  feminineSelf: FeminineSelf;
}

/**
 * Bump transformation_phase by +1 (capped at MAX_PHASE). Records
 * phase_started_at. Returns the new phase def + a suggested honorific
 * drawn from that phase's honorifics list.
 *
 * Honorific is suggested, never auto-applied — caller decides whether to
 * call setHonorific() with the suggestion.
 */
export async function advancePhase(
  sb: SupabaseClient,
  userId: string,
): Promise<AdvancePhaseResult> {
  const current = await getFeminineSelf(sb, userId);
  const fromPhase = current?.transformationPhase ?? 1;
  const toPhase = Math.min(fromPhase + 1, MAX_PHASE);

  const updated = await upsertFeminineSelf(sb, userId, {
    transformation_phase: toPhase,
    phase_started_at: new Date().toISOString(),
  });

  const newPhaseDef = await getPhaseDefinition(sb, toPhase);
  const suggestedHonorific = pickSuggestedHonorific(newPhaseDef, current?.currentHonorific ?? null);

  return {
    fromPhase,
    toPhase,
    newPhaseDef,
    suggestedHonorific,
    feminineSelf: updated,
  };
}

/**
 * Pick a fresh honorific from the phase's list — preferring one she has not
 * been called yet. Falls back to the first entry.
 */
function pickSuggestedHonorific(
  def: PhaseDefinition | null,
  currentHonorific: string | null,
): string | null {
  if (!def || def.honorifics.length === 0) return null;
  const fresh = def.honorifics.find((h) => h.toLowerCase() !== (currentHonorific ?? '').toLowerCase());
  return fresh ?? def.honorifics[0];
}

// ============================================
// PROMPT INJECTION
// ============================================

/**
 * Build the persona system-prompt block describing the user's identity.
 * Returns empty string when no name is set — caller falls back to the
 * existing pet-name behavior (no name = generic "good girl" register).
 *
 * Block format follows the user-spec:
 *   "She knows you as [name], [pronouns]. You are in phase [N] —
 *    [phase name]. Recent additions: [latest 3 wardrobe items].
 *    Mommy's pet name for you: [current_honorific]."
 */
export function buildFeminineSelfBlock(
  self: FeminineSelf | null,
  recentWardrobe: WardrobeItem[],
  phaseDef: PhaseDefinition | null,
): string {
  if (!self?.feminineName) return '';

  const pronouns = self.pronouns ?? DEFAULT_PRONOUNS;
  const pronounStr = `${pronouns.subject}/${pronouns.object}`;

  const phaseLine = phaseDef
    ? `You are in phase ${self.transformationPhase} — ${phaseDef.name}.`
    : `You are in phase ${self.transformationPhase}.`;

  const wardrobeLine = recentWardrobe.length > 0
    ? `Recent additions to her wardrobe: ${recentWardrobe.slice(0, 3).map((w) => w.itemName).join(', ')}.`
    : '';

  const honorificLine = self.currentHonorific
    ? `Mommy's pet name for her: ${self.currentHonorific}.`
    : '';

  const lines = [
    `## IDENTITY — feminine_self`,
    `She knows you as ${self.feminineName}, ${pronounStr}.`,
    phaseLine,
    wardrobeLine,
    honorificLine,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Convenience: load all the context buildFeminineSelfBlock needs in one
 * round-trip-friendly call. Used by the chat.ts overlay.
 */
export async function loadFeminineSelfContext(
  sb: SupabaseClient,
  userId: string,
): Promise<{
  self: FeminineSelf | null;
  recentWardrobe: WardrobeItem[];
  phaseDef: PhaseDefinition | null;
}> {
  const self = await getFeminineSelf(sb, userId);
  if (!self) return { self: null, recentWardrobe: [], phaseDef: null };
  const [recentWardrobe, phaseDef] = await Promise.all([
    listWardrobeItems(sb, userId, 3),
    getPhaseDefinition(sb, self.transformationPhase),
  ]);
  return { self, recentWardrobe, phaseDef };
}
