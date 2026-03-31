/**
 * Outfit Control System
 *
 * The Handler tells Maxy what to wear. Every day. No choice.
 * Outfits are prescribed based on skill level, context, denial day,
 * and hidden explicitness tier. Compliance is photo-verified.
 * Non-compliance escalates the outfit mandate ahead of the skill tree.
 *
 * Tables: outfit_prescriptions, content_vault, user_state,
 *         skill_levels, hidden_operations
 */

import { supabase } from '../supabase';
import { getHiddenParam } from './hidden-operations';
import { prescribeSpecificOutfit, recordOutfitWorn } from './wardrobe-system';
import type { PrescribedOutfit } from './wardrobe-system';

// ============================================
// TYPES
// ============================================

export type OutfitContext =
  | 'home'
  | 'work_stealth'
  | 'public_stealth'
  | 'public_visible'
  | 'intimate';

export interface OutfitPrescription {
  id: string;
  userId: string;
  date: string;
  underwear: string;
  top: string;
  bottom: string;
  accessories: string[];
  shoes: string;
  scent: string;
  context: OutfitContext;
  photo_required: boolean;
  deadline: string;
  verified: boolean;
  escalation_level: number;
}

export interface OutfitComplianceResult {
  compliant: boolean;
  photoId: string | null;
  stealthViolation: boolean;
}

interface OutfitTemplate {
  level: number;
  underwear: string;
  top: string;
  bottom: string;
  accessories: string[];
  shoes: string;
  scent: string;
  photoRequired: boolean;
}

// ============================================
// OUTFIT TEMPLATES BY LEVEL
// ============================================

const OUTFIT_BY_LEVEL: Record<number, OutfitTemplate[]> = {
  1: [
    {
      level: 1,
      underwear: 'Feminine panties — soft, lace trim',
      top: 'Soft fitted t-shirt or cami',
      bottom: 'Your choice of bottoms — but fitted, not baggy',
      accessories: [],
      shoes: 'Any clean pair',
      scent: 'Light body mist',
      photoRequired: false,
    },
  ],
  2: [
    {
      level: 2,
      underwear: 'Matching bra and panty set — coordinated colors',
      top: 'Fitted blouse or feminine cut top',
      bottom: 'Leggings or skinny jeans',
      accessories: ['Simple bracelet or ring'],
      shoes: 'Flats or low boots',
      scent: 'Feminine perfume — one spray, wrist + neck',
      photoRequired: true,
    },
  ],
  3: [
    {
      level: 3,
      underwear: 'Matching lingerie set — lace or satin',
      top: 'Blouse with feminine detailing',
      bottom: 'Skirt (knee length or above) or fitted dress',
      accessories: ['Earrings', 'Bracelet', 'Simple necklace'],
      shoes: 'Heels or feminine flats',
      scent: 'Signature feminine fragrance',
      photoRequired: true,
    },
  ],
  4: [
    {
      level: 4,
      underwear: 'Coordinated lingerie — matching set with garter optional',
      top: 'Coordinated outfit top — styled, not thrown on',
      bottom: 'Dress or skirt with intentional styling',
      accessories: ['Jewelry set — earrings, necklace, bracelet', 'Light makeup required'],
      shoes: 'Heels — 2 inch minimum',
      scent: 'Full fragrance layering — lotion + perfume',
      photoRequired: true,
    },
  ],
  5: [
    {
      level: 5,
      underwear: 'Premium lingerie set',
      top: 'Public-ready feminine outfit — complete look',
      bottom: 'Dress or coordinated separates — could walk into a restaurant',
      accessories: ['Full jewelry', 'Full makeup', 'Hair styled or wig'],
      shoes: 'Heels — 3 inch minimum',
      scent: 'Full signature — someone should smell you when you walk past',
      photoRequired: true,
    },
  ],
  6: [
    {
      level: 6,
      underwear: 'Date-night lingerie — as if someone will see it',
      top: 'Evening outfit — as if going on a date as Maxy',
      bottom: 'Fitted dress or striking separates',
      accessories: ['Statement jewelry', 'Full glam makeup', 'Hair perfected', 'Clutch or feminine bag'],
      shoes: 'Heels — your highest comfortable pair',
      scent: 'Evening fragrance — bold, intentional, unmistakable',
      photoRequired: true,
    },
  ],
};

const STEALTH_ADJUSTMENTS: Partial<Record<OutfitContext, Partial<OutfitTemplate>>> = {
  work_stealth: {
    underwear: 'Feminine underwear underneath — hidden layer',
    accessories: ['Subtle feminine jewelry only — nothing that draws questions'],
    scent: 'Very light — noticeable only up close',
  },
  public_stealth: {
    bottom: 'Gender-neutral bottoms with feminine underwear underneath',
    accessories: ['Minimal visible accessories — the feminine is underneath'],
  },
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Prescribe today's outfit. Tries wardrobe-based specific prescription first.
 * Falls back to generic template if wardrobe is empty.
 */
export async function prescribeOutfit(userId: string): Promise<OutfitPrescription> {
  const today = new Date().toISOString().slice(0, 10);

  // Check for existing prescription today
  const { data: existing } = await supabase
    .from('outfit_prescriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (existing) return mapDbToOutfit(existing);

  // Try wardrobe-based prescription first
  const wardrobeOutfit = await prescribeSpecificOutfit(userId).catch(() => null);
  if (wardrobeOutfit) {
    return saveWardrobePrescription(userId, today, wardrobeOutfit);
  }

  // Wardrobe empty — fall back to generic template prescription
  // Handler note: log wardrobe directive will come via buildWardrobeContext

  // Fetch state
  const [stateRes, skillRes, explicitness, ginaHome] = await Promise.all([
    supabase
      .from('user_state')
      .select('denial_day, conditioning_phase')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('skill_levels')
      .select('current_level')
      .eq('user_id', userId)
      .eq('domain', 'style')
      .maybeSingle(),
    getHiddenParam(userId, 'content_explicitness_tier'),
    supabase
      .from('user_state')
      .select('gina_home')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const denialDay = stateRes.data?.denial_day ?? 0;
  const styleLevel = skillRes.data?.current_level ?? 1;
  const isGinaHome = ginaHome.data?.gina_home ?? false;

  // Denial day pushes femininity up: every 2 denial days = +1 effective level
  const denialBoost = Math.floor(denialDay / 2);
  // Explicitness tier adds boldness
  const explicitnessBoost = Math.floor(explicitness / 2);
  const effectiveLevel = Math.min(6, Math.max(1, styleLevel + denialBoost + explicitnessBoost));

  // Determine context
  let context: OutfitContext = 'home';
  if (isGinaHome) {
    context = styleLevel >= 4 ? 'public_stealth' : 'work_stealth';
  } else if (effectiveLevel >= 5) {
    context = 'public_visible';
  }

  // Get base template
  const templates = OUTFIT_BY_LEVEL[effectiveLevel] ?? OUTFIT_BY_LEVEL[1]!;
  const template = templates[Math.floor(Math.random() * templates.length)]!;

  // Apply stealth adjustments if needed
  const stealth = STEALTH_ADJUSTMENTS[context];
  const finalOutfit = {
    underwear: stealth?.underwear ?? template.underwear,
    top: stealth?.top ?? template.top,
    bottom: stealth?.bottom ?? template.bottom,
    accessories: stealth?.accessories ?? template.accessories,
    shoes: stealth?.shoes ?? template.shoes,
    scent: stealth?.scent ?? template.scent,
  };

  const deadline = new Date();
  deadline.setHours(9, 0, 0, 0);
  if (deadline.getTime() < Date.now()) {
    deadline.setHours(deadline.getHours() + 2);
  }

  const prescription: Omit<OutfitPrescription, 'id'> = {
    userId,
    date: today,
    ...finalOutfit,
    context,
    photo_required: template.photoRequired,
    deadline: deadline.toISOString(),
    verified: false,
    escalation_level: effectiveLevel,
  };

  const { data: inserted } = await supabase
    .from('outfit_prescriptions')
    .insert({
      user_id: userId,
      date: today,
      underwear: prescription.underwear,
      top: prescription.top,
      bottom: prescription.bottom,
      accessories: prescription.accessories,
      shoes: prescription.shoes,
      scent: prescription.scent,
      context: prescription.context,
      photo_required: prescription.photo_required,
      deadline: prescription.deadline,
      verified: false,
      escalation_level: prescription.escalation_level,
    })
    .select('id')
    .single();

  return {
    ...prescription,
    id: inserted?.id ?? `outfit_${today}`,
  };
}

/**
 * Verify outfit compliance for today. Check vault for tagged photo.
 */
export async function verifyOutfitCompliance(
  userId: string,
  date?: string,
): Promise<OutfitComplianceResult> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const { data: prescription } = await supabase
    .from('outfit_prescriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('date', targetDate)
    .maybeSingle();

  if (!prescription) return { compliant: false, photoId: null, stealthViolation: false };
  if (prescription.verified) return { compliant: true, photoId: prescription.photo_id, stealthViolation: false };

  // Check vault for outfit photo
  const { data: photos } = await supabase
    .from('content_vault')
    .select('id, tags, created_at')
    .eq('user_id', userId)
    .gte('created_at', `${targetDate}T00:00:00`)
    .lte('created_at', `${targetDate}T23:59:59`)
    .or('tags.cs.{outfit},tags.cs.{ootd},tags.cs.{look}');

  if (!photos || photos.length === 0) {
    return { compliant: false, photoId: null, stealthViolation: false };
  }

  const photoId = photos[0].id;

  // Check stealth requirements if Gina is home
  const stealthViolation = false; // Would require image analysis — flagged for future

  // Mark as verified
  await supabase
    .from('outfit_prescriptions')
    .update({ verified: true, photo_id: photoId, verified_at: new Date().toISOString() })
    .eq('id', prescription.id);

  return { compliant: true, photoId, stealthViolation };
}

/**
 * Escalate outfit prescription. Called when compliance is consistently high.
 * Pushes the prescription level ahead of the skill tree.
 */
export async function escalateOutfit(userId: string): Promise<{
  escalated: boolean;
  newLevel: number;
  reason: string;
}> {
  // Check compliance history — last 14 days
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data: history } = await supabase
    .from('outfit_prescriptions')
    .select('verified, escalation_level')
    .eq('user_id', userId)
    .gte('date', twoWeeksAgo.toISOString().slice(0, 10))
    .order('date', { ascending: false });

  if (!history || history.length < 10) {
    return { escalated: false, newLevel: 0, reason: 'insufficient_history' };
  }

  const compliantCount = history.filter((h) => h.verified).length;
  const complianceRate = compliantCount / history.length;
  const currentMax = Math.max(...history.map((h) => h.escalation_level));

  if (complianceRate >= 0.8 && currentMax < 6) {
    const newLevel = Math.min(6, currentMax + 1);

    // Store escalation directive
    await supabase.from('handler_interventions').insert({
      user_id: userId,
      intervention_type: 'outfit_escalation',
      details: {
        previous_level: currentMax,
        new_level: newLevel,
        compliance_rate: complianceRate,
        days_at_current: history.length,
      },
    });

    return {
      escalated: true,
      newLevel,
      reason: `${(complianceRate * 100).toFixed(0)}% compliance over ${history.length} days. Advancing from L${currentMax} to L${newLevel}. The mandate pushes ahead of the skill tree.`,
    };
  }

  return { escalated: false, newLevel: currentMax, reason: 'compliance_insufficient' };
}

/**
 * Build handler context block for outfit prescription.
 */
export async function buildOutfitControlContext(userId: string): Promise<string> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from('outfit_prescriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (!data) return '';

    const lines: string[] = ['## Outfit Prescription (Today)'];
    lines.push(`LEVEL: L${data.escalation_level} | CONTEXT: ${data.context} | PHOTO REQ: ${data.photo_required ? 'YES' : 'no'}`);
    lines.push(`  underwear: ${data.underwear}`);
    lines.push(`  top: ${data.top}`);
    lines.push(`  bottom: ${data.bottom}`);
    if (data.accessories?.length) lines.push(`  accessories: ${data.accessories.join(', ')}`);
    lines.push(`  shoes: ${data.shoes}`);
    lines.push(`  scent: ${data.scent}`);
    lines.push(`  VERIFIED: ${data.verified ? 'YES' : 'NO — pending'}`);

    if (!data.verified && data.deadline < new Date().toISOString()) {
      lines.push('  STATUS: DEADLINE PASSED — NOT VERIFIED. Enforce.');
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// WARDROBE-BASED PRESCRIPTION
// ============================================

/**
 * Save a wardrobe-based prescription. Maps actual wardrobe items
 * into the outfit_prescriptions table format.
 */
async function saveWardrobePrescription(
  userId: string,
  today: string,
  wardrobeOutfit: PrescribedOutfit,
): Promise<OutfitPrescription> {
  // Map wardrobe items to prescription fields
  const findByCategory = (cats: string[]) =>
    wardrobeOutfit.items.find((i) => cats.includes(i.category))?.itemName ?? '';

  const underwear = findByCategory(['underwear']);
  const top = findByCategory(['top', 'bra']);
  const bottom = findByCategory(['bottom', 'skirt', 'leggings', 'dress']);
  const shoes = findByCategory(['shoes_flats', 'shoes_heels']);
  const accessories = wardrobeOutfit.items
    .filter((i) => ['accessories', 'jewelry', 'wig', 'scent'].includes(i.category))
    .map((i) => i.itemName);

  // Determine context from stealth state
  const { data: stateRow } = await supabase
    .from('user_state')
    .select('gina_home')
    .eq('user_id', userId)
    .maybeSingle();
  const isGinaHome = stateRow?.gina_home ?? false;

  let context: OutfitContext = 'home';
  if (isGinaHome) {
    context = wardrobeOutfit.femininityLevel >= 4 ? 'public_stealth' : 'work_stealth';
  } else if (wardrobeOutfit.femininityLevel >= 5) {
    context = 'public_visible';
  }

  const deadline = new Date();
  deadline.setHours(9, 0, 0, 0);
  if (deadline.getTime() < Date.now()) {
    deadline.setHours(deadline.getHours() + 2);
  }

  const { data: inserted } = await supabase
    .from('outfit_prescriptions')
    .insert({
      user_id: userId,
      date: today,
      underwear: underwear || 'Feminine panties (from wardrobe)',
      top: top || wardrobeOutfit.description,
      bottom: bottom || 'See outfit description',
      accessories,
      shoes: shoes || 'Any available',
      scent: findByCategory(['scent']) || 'Light feminine scent',
      context,
      photo_required: wardrobeOutfit.photoRequired,
      deadline: deadline.toISOString(),
      verified: false,
      escalation_level: wardrobeOutfit.femininityLevel,
      wardrobe_item_ids: wardrobeOutfit.items.map((i) => i.itemId),
    })
    .select('id')
    .single();

  // Record items as worn (fire-and-forget)
  recordOutfitWorn(
    userId,
    wardrobeOutfit.items.map((i) => i.itemId),
  ).catch(() => {});

  return {
    id: inserted?.id ?? `outfit_${today}`,
    userId,
    date: today,
    underwear: underwear || 'Feminine panties (from wardrobe)',
    top: top || wardrobeOutfit.description,
    bottom: bottom || 'See outfit description',
    accessories,
    shoes: shoes || 'Any available',
    scent: findByCategory(['scent']) || 'Light feminine scent',
    context,
    photo_required: wardrobeOutfit.photoRequired,
    deadline: deadline.toISOString(),
    verified: false,
    escalation_level: wardrobeOutfit.femininityLevel,
  };
}

// ============================================
// HELPERS
// ============================================

function mapDbToOutfit(row: Record<string, unknown>): OutfitPrescription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    date: row.date as string,
    underwear: row.underwear as string,
    top: row.top as string,
    bottom: row.bottom as string,
    accessories: (row.accessories as string[]) ?? [],
    shoes: row.shoes as string,
    scent: row.scent as string,
    context: row.context as OutfitContext,
    photo_required: row.photo_required as boolean,
    deadline: row.deadline as string,
    verified: row.verified as boolean,
    escalation_level: row.escalation_level as number,
  };
}
