import type { Domain } from '../types';
import type {
  InvestmentCategory,
  CategoryInfo,
  MilestoneDefinition,
  InvestmentMilestoneType,
} from '../types/investments';

// ============================================
// INVESTMENT CATEGORIES
// ============================================

export const INVESTMENT_CATEGORIES: Record<InvestmentCategory, CategoryInfo> = {
  clothing: {
    label: 'Clothing',
    emoji: '\u{1F457}', // dress
    domain: 'style',
    examples: 'Dresses, lingerie, bras, panties, shoes, hosiery',
    defaultPrivate: false,
  },
  skincare: {
    label: 'Skincare',
    emoji: '\u2728', // sparkles
    domain: 'skincare',
    examples: 'Cleansers, moisturizers, serums, masks, tools',
    defaultPrivate: false,
  },
  makeup: {
    label: 'Makeup',
    emoji: '\u{1F484}', // lipstick
    domain: 'style',
    examples: 'Foundation, lipstick, eyeshadow, brushes, lashes',
    defaultPrivate: false,
  },
  body_care: {
    label: 'Body Care',
    emoji: '\u{1F338}', // cherry blossom
    domain: 'body',
    examples: 'Laser, waxing, razors, epilators, lotions',
    defaultPrivate: false,
  },
  voice: {
    label: 'Voice',
    emoji: '\u{1F3A4}', // microphone
    domain: 'voice',
    examples: 'Coaching sessions, apps, courses',
    defaultPrivate: false,
  },
  accessories: {
    label: 'Accessories',
    emoji: '\u{1F48E}', // gem stone
    domain: 'style',
    examples: 'Jewelry, bags, scarves, belts',
    defaultPrivate: false,
  },
  hair: {
    label: 'Hair',
    emoji: '\u{1F487}\u200D\u2640\uFE0F', // woman getting haircut
    domain: 'style',
    examples: 'Wigs, extensions, styling tools, products',
    defaultPrivate: false,
  },
  forms_shapewear: {
    label: 'Forms & Shapewear',
    emoji: '\u{1FA71}', // one-piece swimsuit
    domain: 'body',
    examples: 'Breast forms, hip pads, corsets, shapers, tucking',
    defaultPrivate: true,
  },
  intimates: {
    label: 'Intimates',
    emoji: '\u{1F512}', // lock
    domain: 'body',
    examples: 'Toys, vibrators, plugs, chastity, personal devices',
    defaultPrivate: true,
  },
  fragrance: {
    label: 'Fragrance',
    emoji: '\u{1F339}', // rose
    domain: 'skincare',
    examples: 'Perfumes, body sprays, scented lotions',
    defaultPrivate: false,
  },
  nails: {
    label: 'Nails',
    emoji: '\u{1F485}', // nail polish
    domain: 'style',
    examples: 'Polish, extensions, tools, salon visits',
    defaultPrivate: false,
  },
  medical_hrt: {
    label: 'Medical / HRT',
    emoji: '\u{1F48A}', // pill
    domain: 'body',
    examples: 'Hormones, supplements, bloodwork, prescriptions',
    defaultPrivate: true,
  },
  services: {
    label: 'Services',
    emoji: '\u{1F486}\u200D\u2640\uFE0F', // woman getting massage
    domain: null,
    examples: 'Salon, spa, coaching, therapy, photos',
    defaultPrivate: false,
  },
  education: {
    label: 'Education',
    emoji: '\u{1F4DA}', // books
    domain: 'mindset',
    examples: 'Books, courses, memberships, subscriptions',
    defaultPrivate: false,
  },
};

// ============================================
// INVESTMENT MILESTONES
// ============================================

export const INVESTMENT_MILESTONES: MilestoneDefinition[] = [
  {
    type: 'first_purchase',
    check: (_total, count) => count === 1,
    message: "Your first investment in her.",
  },
  {
    type: 'amount_100',
    check: (total) => total >= 100,
    message: "One hundred dollars toward becoming her.",
    amount: 100,
  },
  {
    type: 'amount_250',
    check: (total) => total >= 250,
    message: "You're building something real.",
    amount: 250,
  },
  {
    type: 'amount_500',
    check: (total) => total >= 500,
    message: "This isn't a whim. This is intention.",
    amount: 500,
  },
  {
    type: 'amount_1000',
    check: (total) => total >= 1000,
    message: "A thousand dollars toward her. She's worth it.",
    amount: 1000,
  },
  {
    type: 'amount_2500',
    check: (total) => total >= 2500,
    message: "You're all in now. There's no going back.",
    amount: 2500,
  },
  {
    type: 'amount_5000',
    check: (total) => total >= 5000,
    message: "Five thousand dollars. This is who you are.",
    amount: 5000,
  },
  {
    type: 'amount_10000',
    check: (total) => total >= 10000,
    message: "Ten thousand invested. She is not a dream. She is your life.",
    amount: 10000,
  },
  {
    type: 'new_category',
    check: (_total, _count, categories, newCategory) =>
      newCategory !== undefined && !categories.includes(newCategory),
    message: (category) => `Expanding your practice. ${category} unlocked.`,
  },
  {
    type: 'category_100',
    check: () => false, // Checked separately per category
    message: (category) => `$100 invested in ${category}.`,
    amount: 100,
  },
  {
    type: 'category_500',
    check: () => false, // Checked separately per category
    message: (category) => `$500 invested in ${category}. You're serious about this.`,
    amount: 500,
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get category info by key
 */
export function getCategoryInfo(category: InvestmentCategory): CategoryInfo {
  return INVESTMENT_CATEGORIES[category];
}

/**
 * Get the domain associated with a category
 */
export function getCategoryDomain(category: InvestmentCategory): Domain | null {
  return INVESTMENT_CATEGORIES[category].domain;
}

/**
 * Get category label with emoji
 */
export function getCategoryLabel(category: InvestmentCategory): string {
  const info = INVESTMENT_CATEGORIES[category];
  return `${info.emoji} ${info.label}`;
}

/**
 * Check if category should default to private
 */
export function isCategoryPrivateByDefault(category: InvestmentCategory): boolean {
  return INVESTMENT_CATEGORIES[category].defaultPrivate;
}

/**
 * Get all categories as array
 */
export function getAllCategories(): InvestmentCategory[] {
  return Object.keys(INVESTMENT_CATEGORIES) as InvestmentCategory[];
}

/**
 * Get categories grouped by domain
 */
export function getCategoriesByDomain(): Record<Domain | 'other', InvestmentCategory[]> {
  const result: Record<Domain | 'other', InvestmentCategory[]> = {
    voice: [],
    movement: [],
    skincare: [],
    style: [],
    social: [],
    mindset: [],
    body: [],
    other: [],
  };

  for (const [category, info] of Object.entries(INVESTMENT_CATEGORIES)) {
    const key = info.domain || 'other';
    result[key].push(category as InvestmentCategory);
  }

  return result;
}

/**
 * Get milestone definition by type
 */
export function getMilestoneDefinition(type: InvestmentMilestoneType): MilestoneDefinition | undefined {
  return INVESTMENT_MILESTONES.find((m) => m.type === type);
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get priority label
 */
export function getPriorityLabel(priority: 1 | 2 | 3): string {
  switch (priority) {
    case 1:
      return 'High Priority';
    case 2:
      return 'Medium Priority';
    case 3:
      return 'Low Priority';
  }
}

/**
 * Get priority stars
 */
export function getPriorityStars(priority: 1 | 2 | 3): string {
  switch (priority) {
    case 1:
      return '\u2B50\u2B50\u2B50';
    case 2:
      return '\u2B50\u2B50';
    case 3:
      return '\u2B50';
  }
}

/**
 * Sort categories for display (non-private first, then alphabetical)
 */
export function getSortedCategories(): InvestmentCategory[] {
  return getAllCategories().sort((a, b) => {
    const aPrivate = INVESTMENT_CATEGORIES[a].defaultPrivate;
    const bPrivate = INVESTMENT_CATEGORIES[b].defaultPrivate;

    // Non-private first
    if (aPrivate !== bPrivate) {
      return aPrivate ? 1 : -1;
    }

    // Then alphabetical
    return INVESTMENT_CATEGORIES[a].label.localeCompare(INVESTMENT_CATEGORIES[b].label);
  });
}
