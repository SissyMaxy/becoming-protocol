import { supabase } from './supabase';
import type { AffiliateConfig, AffiliateStats } from '../types/investments';

// ============================================
// AFFILIATE CONFIGURATIONS
// ============================================

// Environment variables for affiliate tags
const AMAZON_TAG = import.meta.env.VITE_AMAZON_AFFILIATE_TAG || '';
const SEPHORA_ID = import.meta.env.VITE_SEPHORA_AFFILIATE_ID || '';
const ULTA_ID = import.meta.env.VITE_ULTA_AFFILIATE_ID || '';
const NORDSTROM_ID = import.meta.env.VITE_NORDSTROM_AFFILIATE_ID || '';

export const AFFILIATE_CONFIGS: AffiliateConfig[] = [
  {
    retailer: 'amazon',
    name: 'Amazon',
    affiliateTag: AMAZON_TAG,
    urlPattern: /amazon\.com|amzn\.to|amzn\.com|a\.co/i,
    buildUrl: (url: string, tag: string) => {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('tag', tag);
        return parsed.toString();
      } catch {
        // Handle short URLs
        return `${url}${url.includes('?') ? '&' : '?'}tag=${tag}`;
      }
    },
    commissionRate: 0.04,
  },
  {
    retailer: 'sephora',
    name: 'Sephora',
    affiliateTag: SEPHORA_ID,
    urlPattern: /sephora\.com/i,
    buildUrl: (url: string, tag: string) => {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('om_mmc', `aff-${tag}`);
        return parsed.toString();
      } catch {
        return url;
      }
    },
    commissionRate: 0.05,
  },
  {
    retailer: 'ulta',
    name: 'Ulta Beauty',
    affiliateTag: ULTA_ID,
    urlPattern: /ulta\.com/i,
    buildUrl: (url: string, tag: string) => {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('aff', tag);
        return parsed.toString();
      } catch {
        return url;
      }
    },
    commissionRate: 0.03,
  },
  {
    retailer: 'nordstrom',
    name: 'Nordstrom',
    affiliateTag: NORDSTROM_ID,
    urlPattern: /nordstrom\.com/i,
    buildUrl: (url: string, tag: string) => {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('utm_source', 'affiliate');
        parsed.searchParams.set('utm_medium', tag);
        return parsed.toString();
      } catch {
        return url;
      }
    },
    commissionRate: 0.04,
  },
  {
    retailer: 'target',
    name: 'Target',
    affiliateTag: '', // Add when available
    urlPattern: /target\.com/i,
    buildUrl: (url: string, _tag: string) => url, // Placeholder
    commissionRate: 0.02,
  },
  {
    retailer: 'shein',
    name: 'SHEIN',
    affiliateTag: '', // Add when available
    urlPattern: /shein\.com/i,
    buildUrl: (url: string, _tag: string) => url, // Placeholder
    commissionRate: 0.10,
  },
  {
    retailer: 'asos',
    name: 'ASOS',
    affiliateTag: '', // Add when available
    urlPattern: /asos\.com/i,
    buildUrl: (url: string, _tag: string) => url, // Placeholder
    commissionRate: 0.05,
  },
];

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Detect retailer from URL
 */
export function detectRetailer(url: string): string | null {
  if (!url) return null;

  for (const config of AFFILIATE_CONFIGS) {
    if (config.urlPattern.test(url)) {
      return config.retailer;
    }
  }

  return null;
}

/**
 * Get affiliate config for a retailer
 */
export function getAffiliateConfig(retailer: string): AffiliateConfig | null {
  return AFFILIATE_CONFIGS.find((c) => c.retailer === retailer) || null;
}

/**
 * Convert a URL to an affiliate link
 * Returns null if no affiliate program or tag is configured
 */
export function convertToAffiliateLink(originalUrl: string): string | null {
  if (!originalUrl) return null;

  const retailer = detectRetailer(originalUrl);
  if (!retailer) return null;

  const config = getAffiliateConfig(retailer);
  if (!config || !config.affiliateTag) return null;

  try {
    return config.buildUrl(originalUrl, config.affiliateTag);
  } catch (error) {
    console.error('Failed to convert affiliate link:', error);
    return null;
  }
}

/**
 * Get retailer name from URL
 */
export function getRetailerName(url: string): string | null {
  const retailer = detectRetailer(url);
  if (!retailer) return null;

  const config = getAffiliateConfig(retailer);
  return config?.name || null;
}

/**
 * Check if a URL has affiliate support
 */
export function hasAffiliateSupport(url: string): boolean {
  const retailer = detectRetailer(url);
  if (!retailer) return false;

  const config = getAffiliateConfig(retailer);
  return Boolean(config?.affiliateTag);
}

/**
 * Get list of supported retailers
 */
export function getSupportedRetailers(): Array<{ retailer: string; name: string; hasTag: boolean }> {
  return AFFILIATE_CONFIGS.map((config) => ({
    retailer: config.retailer,
    name: config.name,
    hasTag: Boolean(config.affiliateTag),
  }));
}

// ============================================
// TRACKING FUNCTIONS
// ============================================

/**
 * Track an affiliate click event
 */
export async function trackAffiliateClick(
  wishlistItemId?: string,
  shareId?: string
): Promise<void> {
  try {
    const userId = await getUserIdSafe();

    const { error } = await supabase.from('affiliate_events').insert({
      user_id: userId,
      wishlist_item_id: wishlistItemId || null,
      share_id: shareId || null,
      event_type: 'click',
      retailer: wishlistItemId ? await getRetailerFromWishlistItem(wishlistItemId) : null,
      user_agent: navigator.userAgent,
    });

    if (error) {
      console.error('Failed to track affiliate click:', error);
    }
  } catch (error) {
    // Silent fail - don't block user experience for tracking
    console.error('Failed to track click:', error);
  }
}

/**
 * Get affiliate statistics for the current user
 */
export async function getAffiliateStats(): Promise<AffiliateStats> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { totalClicks: 0, clicksByRetailer: {} };
    }

    const { data, error } = await supabase
      .from('affiliate_events')
      .select('*')
      .eq('user_id', user.id)
      .eq('event_type', 'click');

    if (error) {
      console.error('Failed to get affiliate stats:', error);
      return { totalClicks: 0, clicksByRetailer: {} };
    }

    const clicksByRetailer: Record<string, number> = {};

    for (const event of data || []) {
      if (event.retailer) {
        clicksByRetailer[event.retailer] = (clicksByRetailer[event.retailer] || 0) + 1;
      }
    }

    return {
      totalClicks: data?.length || 0,
      clicksByRetailer,
    };
  } catch (error) {
    console.error('Failed to get affiliate stats:', error);
    return { totalClicks: 0, clicksByRetailer: {} };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getUserIdSafe(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

async function getRetailerFromWishlistItem(itemId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('wishlist_items')
      .select('original_url')
      .eq('id', itemId)
      .single();

    if (data?.original_url) {
      return detectRetailer(data.original_url);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract product info from URL (basic implementation)
 * Could be expanded with actual scraping or API calls
 */
export async function extractProductInfo(url: string): Promise<{
  name?: string;
  price?: number;
  imageUrl?: string;
  retailer?: string;
} | null> {
  const retailer = detectRetailer(url);

  // Basic extraction - could be enhanced with actual web scraping
  // For now, just return the retailer info
  return {
    retailer: retailer ? getRetailerName(url) || undefined : undefined,
  };
}

/**
 * Generate a shortened affiliate link (placeholder for future)
 */
export function generateShortLink(_affiliateUrl: string): string {
  // In the future, this could integrate with a URL shortener
  // For now, return the original URL
  return _affiliateUrl;
}

/**
 * Check if environment has any affiliate tags configured
 */
export function hasAffiliateConfiguration(): boolean {
  return AFFILIATE_CONFIGS.some((config) => Boolean(config.affiliateTag));
}
