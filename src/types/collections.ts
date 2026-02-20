/**
 * Collection types — wigs, scent products, anchor objects.
 */

// =============================
// Wigs
// =============================

export type WigType = 'synthetic' | 'human_hair' | 'blend';
export type WigLength = 'pixie' | 'bob' | 'medium' | 'long';
export type LaceType = 'lace_front' | 'full_lace' | 'none';

export interface Wig {
  id: string;
  userId: string;
  name: string;
  type: WigType;
  color: string | null;
  length: WigLength | null;
  laceType: LaceType | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  timesWorn: number;
  lastWornAt: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
}

export type WigInput = Pick<Wig, 'name' | 'type'> &
  Partial<Pick<Wig, 'color' | 'length' | 'laceType' | 'purchasePrice' | 'purchaseDate' | 'isPrimary' | 'notes'>>;

// =============================
// Scent Products
// =============================

export type ScentCategory =
  | 'body_wash' | 'hand_cream' | 'perfume' | 'lotion'
  | 'deodorant' | 'lip_balm' | 'shampoo' | 'candle' | 'laundry';

export type PairingActivity = 'arousal' | 'edge' | 'morning' | 'workout' | 'sleep';

export interface ScentProduct {
  id: string;
  userId: string;
  category: ScentCategory;
  productName: string;
  brand: string | null;
  scentNotes: string | null;
  isSignature: boolean;
  isActive: boolean;
  needsRestock: boolean;
  purchasePrice: number | null;
  notes: string | null;
  createdAt: string;
}

export type ScentInput = Pick<ScentProduct, 'category' | 'productName'> &
  Partial<Pick<ScentProduct, 'brand' | 'scentNotes' | 'isSignature' | 'purchasePrice' | 'notes'>>;

export interface ScentPairing {
  id: string;
  userId: string;
  scentProductId: string;
  pairedWith: PairingActivity;
  pairingCount: number;
  createdAt: string;
}

export type ConditioningStrength = 'Building' | 'Moderate' | 'Strong' | 'Automatic';

export function getConditioningStrength(count: number): ConditioningStrength {
  if (count >= 31) return 'Automatic';
  if (count >= 16) return 'Strong';
  if (count >= 6) return 'Moderate';
  return 'Building';
}

export const SCENT_CATEGORY_LABELS: Record<ScentCategory, string> = {
  body_wash: 'Body Wash',
  hand_cream: 'Hand Cream',
  perfume: 'Perfume',
  lotion: 'Lotion',
  deodorant: 'Deodorant',
  lip_balm: 'Lip Balm',
  shampoo: 'Shampoo',
  candle: 'Candle',
  laundry: 'Laundry',
};

export const PAIRING_LABELS: Record<PairingActivity, string> = {
  arousal: 'Arousal',
  edge: 'Edge',
  morning: 'Morning',
  workout: 'Workout',
  sleep: 'Sleep',
};

// =============================
// Anchor Objects
// =============================

export type AnchorCategory =
  | 'jewelry' | 'lip_balm' | 'phone' | 'underwear'
  | 'nail_polish' | 'desk_item' | 'other';

export type WearFrequency = 'daily' | 'most_days' | 'sometimes' | 'special';

export interface AnchorObject {
  id: string;
  userId: string;
  name: string;
  category: AnchorCategory;
  description: string | null;
  wearFrequency: WearFrequency;
  isActive: boolean;
  acquiredDate: string | null;
  cost: number | null;
  notes: string | null;
  createdAt: string;
}

export type AnchorInput = Pick<AnchorObject, 'name' | 'category'> &
  Partial<Pick<AnchorObject, 'description' | 'wearFrequency' | 'cost' | 'acquiredDate' | 'notes'>>;

export const ANCHOR_CATEGORY_LABELS: Record<AnchorCategory, string> = {
  jewelry: 'Jewelry',
  lip_balm: 'Lip Balm',
  phone: 'Phone',
  underwear: 'Underwear',
  nail_polish: 'Nail Polish',
  desk_item: 'Desk Item',
  other: 'Other',
};

export const FREQUENCY_LABELS: Record<WearFrequency, string> = {
  daily: 'Daily',
  most_days: 'Most Days',
  sometimes: 'Sometimes',
  special: 'Special Occasions',
};
