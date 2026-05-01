// Identity persistence layer types — feminine_self / wardrobe_items /
// transformation_phase_defs. Backs the Dommy Mommy persona identity layer
// added in migration 256.

// ============================================
// PRONOUNS
// ============================================

export interface Pronouns {
  subject: string;     // she
  object: string;      // her
  possessive: string;  // her / hers
}

export const DEFAULT_PRONOUNS: Pronouns = {
  subject: 'she',
  object: 'her',
  possessive: 'her',
};

// ============================================
// FEMININE_SELF
// ============================================

export interface FeminineSelf {
  userId: string;
  feminineName: string | null;
  pronouns: Pronouns;
  currentHonorific: string | null;
  transformationPhase: number;        // 1..7
  phaseStartedAt: string;             // ISO
  createdAt: string;
  updatedAt: string;
}

export interface DbFeminineSelf {
  user_id: string;
  feminine_name: string | null;
  pronouns: Pronouns;
  current_honorific: string | null;
  transformation_phase: number;
  phase_started_at: string;
  created_at: string;
  updated_at: string;
}

export function feminineSelfFromDb(row: DbFeminineSelf): FeminineSelf {
  return {
    userId: row.user_id,
    feminineName: row.feminine_name,
    pronouns: row.pronouns ?? DEFAULT_PRONOUNS,
    currentHonorific: row.current_honorific,
    transformationPhase: row.transformation_phase,
    phaseStartedAt: row.phase_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// WARDROBE
// ============================================

export type WardrobeItemType =
  | 'panties'
  | 'lipstick'
  | 'heels'
  | 'dress'
  | 'lingerie'
  | 'bra'
  | 'nails'
  | 'wig'
  | 'skirt'
  | 'hosiery'
  | 'accessories'
  | 'other';

export const WARDROBE_ITEM_TYPES: WardrobeItemType[] = [
  'panties', 'lipstick', 'heels', 'dress', 'lingerie', 'bra',
  'nails', 'wig', 'skirt', 'hosiery', 'accessories', 'other',
];

export interface WardrobeItem {
  id: string;
  userId: string;
  itemType: WardrobeItemType;
  itemName: string;
  notes: string | null;
  acquiredAt: string;
  createdAt: string;
}

export interface DbWardrobeItem {
  id: string;
  user_id: string;
  item_type: WardrobeItemType;
  item_name: string;
  notes: string | null;
  acquired_at: string;
  created_at: string;
}

export function wardrobeItemFromDb(row: DbWardrobeItem): WardrobeItem {
  return {
    id: row.id,
    userId: row.user_id,
    itemType: row.item_type,
    itemName: row.item_name,
    notes: row.notes,
    acquiredAt: row.acquired_at,
    createdAt: row.created_at,
  };
}

// ============================================
// PHASE DEFINITIONS
// ============================================

export interface PhaseDefinition {
  phase: number;                      // 1..7
  name: string;
  description: string;
  honorifics: string[];
  unlockedTaskCategories: string[];
  primerRequirements: string[];
}

export interface DbPhaseDefinition {
  phase: number;
  name: string;
  description: string;
  honorifics: string[];
  unlocked_task_categories: string[];
  primer_requirements: string[];
  created_at: string;
}

export function phaseDefinitionFromDb(row: DbPhaseDefinition): PhaseDefinition {
  return {
    phase: row.phase,
    name: row.name,
    description: row.description,
    honorifics: row.honorifics ?? [],
    unlockedTaskCategories: row.unlocked_task_categories ?? [],
    primerRequirements: row.primer_requirements ?? [],
  };
}
