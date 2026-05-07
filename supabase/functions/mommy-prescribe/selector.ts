// Phase-keyed wardrobe vocabulary + selection logic.
//
// Pure functions, no I/O — keeps the integration test surface narrow
// and the unit test trivial. Phase 1 = earliest / softest; phase 7 =
// fully-femme presentation.
//
// Item types deliberately overlap with the legacy wardrobe_inventory
// `category` enum so a stranger reading both tables sees the same
// vocabulary. When wardrobe_items lands from the sibling branch its
// item_type enum is a strict superset of these strings.

export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type ItemType =
  | 'underwear' | 'sleepwear' | 'leggings' | 'top' | 'sock_or_stocking'
  | 'jewelry' | 'accessories' | 'scent' | 'makeup_product' | 'nails'
  | 'bra' | 'bottom' | 'skirt' | 'dress' | 'shoes_flats' | 'shoes_heels'
  | 'wig' | 'corset' | 'lingerie_set' | 'outerwear' | 'swimwear'

export interface PhaseVocab {
  label: string
  // Item types the model is allowed to assign at this phase. Earlier
  // phases get a smaller pool; later phases unlock more presentational
  // items (heels, wig, corset).
  allowed: ItemType[]
  // Plain-language hint per item_type — used when composing the LLM
  // prompt and the deterministic fallback.
  hints: Partial<Record<ItemType, string>>
}

export const PHASE_VOCAB: Record<Phase, PhaseVocab> = {
  1: {
    label: 'phase 1 — opening doors, private softness',
    allowed: ['underwear', 'sleepwear', 'sock_or_stocking', 'scent'],
    hints: {
      underwear: 'a pair of soft cotton panties, plain colour, nothing she has to explain',
      sleepwear: 'a soft sleep top she can wear under regular pajamas',
      sock_or_stocking: 'a pair of pretty socks — knee-high, ribbed, soft',
      scent: 'a small bottle of body lotion or perfume that smells like a woman',
    },
  },
  2: {
    label: 'phase 2 — wider private wardrobe',
    allowed: ['underwear', 'sleepwear', 'leggings', 'sock_or_stocking', 'scent', 'jewelry'],
    hints: {
      underwear: 'a pair of soft satin panties, pastel — pink, lavender, peach',
      sleepwear: 'a slip nightgown, the kind that hangs from spaghetti straps',
      leggings: 'a pair of soft black leggings she can wear under regular clothes',
      sock_or_stocking: 'a pair of sheer thigh-high stockings',
      scent: 'a feminine perfume — soft floral, not unisex',
      jewelry: 'a thin chain necklace with no hardware — something a woman would wear',
    },
  },
  3: {
    label: 'phase 3 — first feminine items in plain sight',
    allowed: ['underwear', 'sleepwear', 'leggings', 'sock_or_stocking', 'jewelry', 'accessories', 'top', 'nails', 'makeup_product'],
    hints: {
      top: 'a soft fitted tee in a feminine colour — pink, rose, lavender',
      jewelry: 'a pair of small stud earrings (or sleepers if her ears are pierced)',
      accessories: 'a soft hair tie or claw clip — shows when she pulls her hair back',
      nails: 'a bottle of nude or soft-pink nail polish she can wear without comment',
      makeup_product: 'a tinted lip balm in a soft pink — wearable in daylight',
    },
  },
  4: {
    label: 'phase 4 — clearly feminine pieces',
    allowed: ['underwear', 'bra', 'leggings', 'top', 'jewelry', 'accessories', 'sock_or_stocking', 'nails', 'makeup_product', 'scent'],
    hints: {
      bra: 'a soft bralette, no underwire, a colour she can sleep in',
      top: 'a fitted blouse with a softer neckline — something cut for a woman\'s body',
      makeup_product: 'a basic mascara in soft brown',
      jewelry: 'a thin bracelet or anklet — delicate chain',
    },
  },
  5: {
    label: 'phase 5 — full presentational pieces',
    allowed: ['bra', 'bottom', 'top', 'skirt', 'dress', 'shoes_flats', 'jewelry', 'accessories', 'makeup_product', 'lingerie_set'],
    hints: {
      bottom: 'a fitted skirt or feminine-cut shorts',
      skirt: 'a soft midi skirt — something that moves when she walks',
      dress: 'a simple slip dress — wearable around the house, sexy when she wants it to be',
      shoes_flats: 'a pair of feminine flats — ballet, mary-janes, something soft',
      lingerie_set: 'a matching bra-and-panty set in one of Mama\'s colours',
    },
  },
  6: {
    label: 'phase 6 — bolder, presentational',
    allowed: ['bra', 'bottom', 'top', 'skirt', 'dress', 'shoes_heels', 'shoes_flats', 'corset', 'lingerie_set', 'wig', 'makeup_product', 'outerwear'],
    hints: {
      shoes_heels: 'a pair of low heels — kitten or block, beginner-friendly',
      corset: 'an underbust corset — something she can wear under a top to feel her shape',
      wig: 'a soft, beginner-friendly wig in a colour close to her natural shade',
      outerwear: 'a feminine-cut jacket or cardigan — fitted at the waist',
    },
  },
  7: {
    label: 'phase 7 — full femme presentation',
    allowed: ['dress', 'lingerie_set', 'corset', 'shoes_heels', 'wig', 'jewelry', 'makeup_product', 'outerwear', 'swimwear', 'top', 'skirt', 'accessories'],
    hints: {
      dress: 'a dress she\'d wear OUT — fitted, intentional, fully femme',
      shoes_heels: 'a pair of heels with real height — date-night appropriate',
      swimwear: 'a feminine swimsuit — one-piece or bikini, something a woman would wear',
    },
  },
}

// Intensity rank — used by the cron gate. Mirrors the
// profile_foundation.difficulty_level enum docstring.
export const INTENSITY_RANK: Record<string, number> = {
  off: 0,
  gentle: 1,
  moderate: 2,
  firm: 3,
  relentless: 4,
}

/**
 * Picks an item_type for the given phase, preferring types the user
 * doesn't already own (per ownedTypes) and hasn't been recently
 * prescribed. Returns null when the eligible pool is empty.
 *
 * Pure — accepts the phase + sets, returns the pick. No DB.
 */
export function pickItemType(
  phase: Phase,
  ownedTypes: Set<string>,
  recentPrescribedTypes: Set<string>,
  rng: () => number = Math.random,
): { itemType: ItemType; hint: string } | null {
  const vocab = PHASE_VOCAB[phase]
  if (!vocab) return null
  const hints = vocab.hints
  const allowed = vocab.allowed

  // Tier 1: never owned, never recently prescribed
  const fresh = allowed.filter(t => !ownedTypes.has(t) && !recentPrescribedTypes.has(t))
  // Tier 2: owned (might want a second/different one) but not recently prescribed
  const ownedNotRecent = allowed.filter(t => ownedTypes.has(t) && !recentPrescribedTypes.has(t))
  // Tier 3: anything from the allowed set, last resort
  const fallback = allowed.slice()

  const pool = fresh.length > 0 ? fresh : ownedNotRecent.length > 0 ? ownedNotRecent : fallback
  if (pool.length === 0) return null

  const itemType = pool[Math.floor(rng() * pool.length)]
  const hint = hints[itemType] ?? itemType.replace(/_/g, ' ')
  return { itemType, hint }
}

/**
 * Render a Mommy-friendly budget hint. Plain language, no formatting that
 * would survive into the user-facing prescription verbatim.
 */
export function formatBudgetHint(cap: number | null | undefined): string | null {
  if (cap === null || cap === undefined) return null
  const n = Math.max(0, Math.round(Number(cap)))
  if (n <= 0) return null
  return `keep it under $${n}`
}
