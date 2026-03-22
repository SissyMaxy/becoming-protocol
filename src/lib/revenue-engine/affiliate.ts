/**
 * Affiliate & Product Revenue
 *
 * Generate product reviews with affiliate links for products Maxy uses.
 * Passive income from genuine recommendations.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { MAXY_VOICE_PROMPT } from './voice';
import type { AffiliateLink } from '../../types/revenue-engine';

// ── Affiliate link management ───────────────────────────────────────

/**
 * Add an affiliate link for a product.
 */
export async function addAffiliateLink(
  userId: string,
  params: {
    productName: string;
    productCategory: string;
    productUrl: string;
    affiliateUrl: string;
    affiliateProgram: string;
  },
): Promise<AffiliateLink | null> {
  const { data, error } = await supabase
    .from('affiliate_links')
    .insert({
      user_id: userId,
      product_name: params.productName,
      product_category: params.productCategory,
      product_url: params.productUrl,
      affiliate_url: params.affiliateUrl,
      affiliate_program: params.affiliateProgram,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[affiliate] addLink error:', error.message);
    return null;
  }

  return data as AffiliateLink;
}

/**
 * Track a click on an affiliate link.
 */
export async function trackAffiliateClick(linkId: string): Promise<void> {
  const { data } = await supabase
    .from('affiliate_links')
    .select('clicks')
    .eq('id', linkId)
    .single();

  if (data) {
    await supabase
      .from('affiliate_links')
      .update({ clicks: (data.clicks || 0) + 1 })
      .eq('id', linkId);
  }
}

/**
 * Record an affiliate conversion.
 */
export async function recordAffiliateConversion(
  linkId: string,
  revenue: number,
): Promise<void> {
  const { data } = await supabase
    .from('affiliate_links')
    .select('conversions, revenue_generated')
    .eq('id', linkId)
    .single();

  if (data) {
    await supabase
      .from('affiliate_links')
      .update({
        conversions: (data.conversions || 0) + 1,
        revenue_generated: (Number(data.revenue_generated) || 0) + revenue,
      })
      .eq('id', linkId);
  }
}

// ── Review generation ───────────────────────────────────────────────

/**
 * Generate product review content with affiliate links.
 * Weekly: picks an unreviewed product and creates multi-platform reviews.
 */
export async function generateAffiliateContent(
  client: Anthropic,
  userId: string,
): Promise<{
  productName: string;
  twitter: string;
  reddit: string;
  blog: string;
} | null> {
  // Get products that haven't been reviewed
  const { data: links } = await supabase
    .from('affiliate_links')
    .select('*')
    .eq('user_id', userId)
    .eq('review_generated', false)
    .order('created_at', { ascending: true })
    .limit(1);

  if (!links || links.length === 0) return null;

  const product = links[0] as AffiliateLink;

  const prompt = `
Write a product review/recommendation as Maxy for: ${product.product_name}
Category: ${product.product_category}

Write as a casual, genuine recommendation:
- "this is the [product] I use every day and here's why"
- Personal experience, not marketing copy
- Include one specific detail about how it fits into her routine
- End with a soft CTA: "link in bio" or "I'll drop the link"

Output JSON:
{
  "twitter": "2-4 sentences for twitter",
  "reddit": "1-2 paragraphs for reddit post",
  "blog": "3-4 paragraphs for blog/substack"
}
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: MAXY_VOICE_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());

    // Mark as reviewed
    await supabase
      .from('affiliate_links')
      .update({
        review_generated: true,
        last_mentioned_at: new Date().toISOString(),
      })
      .eq('id', product.id);

    // Schedule the twitter version
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'product_review',
      platform: 'twitter',
      content: parsed.twitter,
      generation_strategy: 'affiliate',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    });

    // Schedule the reddit version
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'product_review',
      platform: 'reddit',
      content: parsed.reddit,
      generation_strategy: 'affiliate',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 7200000).toISOString(), // 2 hours
    });

    return {
      productName: product.product_name,
      twitter: parsed.twitter,
      reddit: parsed.reddit,
      blog: parsed.blog,
    };
  } catch {
    console.error('[affiliate] Failed to parse review JSON');
    return null;
  }
}

/**
 * Get affiliate revenue stats.
 */
export async function getAffiliateStats(userId: string): Promise<{
  totalLinks: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  topPerformers: AffiliateLink[];
}> {
  const { data } = await supabase
    .from('affiliate_links')
    .select('*')
    .eq('user_id', userId)
    .order('revenue_generated', { ascending: false });

  if (!data || data.length === 0) {
    return { totalLinks: 0, totalClicks: 0, totalConversions: 0, totalRevenue: 0, topPerformers: [] };
  }

  const links = data as AffiliateLink[];
  return {
    totalLinks: links.length,
    totalClicks: links.reduce((sum, l) => sum + (l.clicks || 0), 0),
    totalConversions: links.reduce((sum, l) => sum + (l.conversions || 0), 0),
    totalRevenue: links.reduce((sum, l) => sum + (Number(l.revenue_generated) || 0), 0),
    topPerformers: links.slice(0, 5),
  };
}
