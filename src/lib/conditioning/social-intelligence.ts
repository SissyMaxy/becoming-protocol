/**
 * Social Platform Intelligence — P11.8
 *
 * Analyzes social engagement across platforms and makes strategic
 * recommendations. Identifies high-value followers, optimal posting
 * times, and generates template-based DM responses.
 *
 * Tables: social_inbox, content_posts, prospects
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

interface PlatformMetric {
  platform: string;
  inboundMessages: number;
  posts: number;
  engagementRate: number;
}

interface TopContent {
  postId: string;
  platform: string;
  contentType: string | null;
  engagementCount: number;
  postedAt: string;
}

interface HighValueFollower {
  senderName: string;
  platform: string;
  interactionCount: number;
  lastInteraction: string;
}

interface Prospect {
  sender_name: string;
  platform: string;
  interaction_count: number;
  sample_content: string;
}

interface BestPostingTime {
  hour: number;
  dayOfWeek: number;
  avgEngagement: number;
}

interface SocialPerformance {
  platformMetrics: PlatformMetric[];
  topContent: TopContent[];
  highValueFollowers: HighValueFollower[];
  prospects: Prospect[];
  bestPostingTimes: BestPostingTime[];
}

interface ProspectIdentification {
  newProspects: Prospect[];
}

interface DMSuggestion {
  text: string;
  tone: 'flirty' | 'teasing' | 'direct' | 'warm';
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Analyze social performance across all platforms for the last 7 days.
 */
export async function analyzeSocialPerformance(userId: string): Promise<SocialPerformance> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [inboxResult, postsResult] = await Promise.allSettled([
    supabase
      .from('social_inbox')
      .select('id, platform, sender_name, content, content_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('content_posts')
      .select('id, platform, content_type, engagement_count, posted_at, created_at')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const inbox = inboxResult.status === 'fulfilled' ? (inboxResult.value.data ?? []) : [];
  const posts = postsResult.status === 'fulfilled' ? (postsResult.value.data ?? []) : [];

  // Platform metrics
  const platformMap = new Map<string, { messages: number; posts: number; totalEngagement: number }>();
  for (const msg of inbox) {
    const p = msg.platform ?? 'unknown';
    const entry = platformMap.get(p) ?? { messages: 0, posts: 0, totalEngagement: 0 };
    entry.messages++;
    platformMap.set(p, entry);
  }
  for (const post of posts) {
    const p = post.platform ?? 'unknown';
    const entry = platformMap.get(p) ?? { messages: 0, posts: 0, totalEngagement: 0 };
    entry.posts++;
    entry.totalEngagement += post.engagement_count ?? 0;
    platformMap.set(p, entry);
  }

  const platformMetrics: PlatformMetric[] = [];
  for (const [platform, data] of platformMap.entries()) {
    platformMetrics.push({
      platform,
      inboundMessages: data.messages,
      posts: data.posts,
      engagementRate: data.posts > 0 ? data.totalEngagement / data.posts : 0,
    });
  }
  platformMetrics.sort((a, b) => b.inboundMessages - a.inboundMessages);

  // Top content (by engagement)
  const topContent: TopContent[] = posts
    .filter(p => (p.engagement_count ?? 0) > 0)
    .sort((a, b) => (b.engagement_count ?? 0) - (a.engagement_count ?? 0))
    .slice(0, 5)
    .map(p => ({
      postId: p.id,
      platform: p.platform ?? 'unknown',
      contentType: p.content_type ?? null,
      engagementCount: p.engagement_count ?? 0,
      postedAt: p.posted_at ?? p.created_at,
    }));

  // High-value followers (repeat interactors)
  const followerMap = new Map<string, { platform: string; count: number; lastAt: string }>();
  for (const msg of inbox) {
    const name = msg.sender_name ?? 'anonymous';
    const key = `${name}::${msg.platform}`;
    const existing = followerMap.get(key);
    if (existing) {
      existing.count++;
      if (msg.created_at > existing.lastAt) existing.lastAt = msg.created_at;
    } else {
      followerMap.set(key, { platform: msg.platform ?? 'unknown', count: 1, lastAt: msg.created_at });
    }
  }

  const highValueFollowers: HighValueFollower[] = [];
  for (const [key, data] of followerMap.entries()) {
    if (data.count >= 2) {
      const senderName = key.split('::')[0];
      highValueFollowers.push({
        senderName,
        platform: data.platform,
        interactionCount: data.count,
        lastInteraction: data.lastAt,
      });
    }
  }
  highValueFollowers.sort((a, b) => b.interactionCount - a.interactionCount);

  // Prospects (3+ interactions)
  const prospects: Prospect[] = [];
  for (const [key, data] of followerMap.entries()) {
    if (data.count >= 3) {
      const senderName = key.split('::')[0];
      // Find sample content from this sender
      const sample = inbox.find(m => m.sender_name === senderName && m.platform === data.platform);
      prospects.push({
        sender_name: senderName,
        platform: data.platform,
        interaction_count: data.count,
        sample_content: (sample?.content ?? '').slice(0, 120),
      });
    }
  }
  prospects.sort((a, b) => b.interaction_count - a.interaction_count);

  // Best posting times (by engagement on posts)
  const timeMap = new Map<string, { totalEngagement: number; count: number }>();
  for (const post of posts) {
    const dt = new Date(post.posted_at ?? post.created_at);
    const hour = dt.getHours();
    const dow = dt.getDay();
    const key = `${dow}:${hour}`;
    const existing = timeMap.get(key) ?? { totalEngagement: 0, count: 0 };
    existing.totalEngagement += post.engagement_count ?? 0;
    existing.count++;
    timeMap.set(key, existing);
  }

  const bestPostingTimes: BestPostingTime[] = [];
  for (const [key, data] of timeMap.entries()) {
    const [dow, hour] = key.split(':').map(Number);
    bestPostingTimes.push({
      hour,
      dayOfWeek: dow,
      avgEngagement: data.count > 0 ? data.totalEngagement / data.count : 0,
    });
  }
  bestPostingTimes.sort((a, b) => b.avgEngagement - a.avgEngagement);

  return { platformMetrics, topContent, highValueFollowers, prospects, bestPostingTimes: bestPostingTimes.slice(0, 5) };
}

/**
 * Identify repeat engagers who could become real prospects.
 * Cross-references existing prospects table to avoid duplicates.
 */
export async function identifyProspects(userId: string): Promise<ProspectIdentification> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [inboxResult, existingResult] = await Promise.allSettled([
    supabase
      .from('social_inbox')
      .select('sender_name, platform, content')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo)
      .limit(500),
    supabase
      .from('prospects')
      .select('name, platform')
      .eq('user_id', userId),
  ]);

  const inbox = inboxResult.status === 'fulfilled' ? (inboxResult.value.data ?? []) : [];
  const existing = existingResult.status === 'fulfilled' ? (existingResult.value.data ?? []) : [];

  // Build set of existing prospect keys
  const existingKeys = new Set(existing.map(p => `${(p.name ?? '').toLowerCase()}::${p.platform}`));

  // Count interactions per sender
  const senderMap = new Map<string, { platform: string; count: number; sample: string }>();
  for (const msg of inbox) {
    const name = msg.sender_name ?? '';
    if (!name) continue;
    const key = `${name}::${msg.platform}`;
    const entry = senderMap.get(key);
    if (entry) {
      entry.count++;
    } else {
      senderMap.set(key, { platform: msg.platform, count: 1, sample: (msg.content ?? '').slice(0, 120) });
    }
  }

  const newProspects: Prospect[] = [];
  for (const [key, data] of senderMap.entries()) {
    if (data.count >= 3) {
      const senderName = key.split('::')[0];
      const lookupKey = `${senderName.toLowerCase()}::${data.platform}`;
      if (!existingKeys.has(lookupKey)) {
        newProspects.push({
          sender_name: senderName,
          platform: data.platform,
          interaction_count: data.count,
          sample_content: data.sample,
        });
      }
    }
  }

  newProspects.sort((a, b) => b.interaction_count - a.interaction_count);
  return { newProspects };
}

/**
 * Generate template-based DM response suggestions.
 * No AI calls — pure pattern matching for speed and cost.
 */
export function generateDMResponse(_userId: string, _senderId: string, incomingMessage: string): DMSuggestion[] {
  const msg = incomingMessage.toLowerCase();

  // Compliment about appearance
  if (matchesAny(msg, ['beautiful', 'gorgeous', 'hot', 'sexy', 'pretty', 'cute', 'stunning', 'fine', 'damn'])) {
    return [
      { text: 'thank you babe 💕 what caught your eye?', tone: 'flirty' },
      { text: 'mmm glad you like what you see 😏', tone: 'teasing' },
      { text: "you're sweet... keep talking like that", tone: 'warm' },
    ];
  }

  // Asking to meet
  if (matchesAny(msg, ['meet', 'hang out', 'link up', 'get together', 'see you', 'in person', 'where are you', 'your city'])) {
    return [
      { text: 'maybe... tell me more about yourself first', tone: 'teasing' },
      { text: "i don't meet just anyone. convince me 😈", tone: 'direct' },
      { text: "let's get to know each other better first babe", tone: 'warm' },
    ];
  }

  // Asking about content / links
  if (matchesAny(msg, ['onlyfans', 'content', 'pics', 'videos', 'subscribe', 'link', 'where can i', 'more of you'])) {
    return [
      { text: 'check my links for more 😈', tone: 'direct' },
      { text: "i've got way more where that came from... link in bio 💋", tone: 'flirty' },
      { text: 'the good stuff is on my page babe', tone: 'teasing' },
    ];
  }

  // Sexual / explicit messages
  if (matchesAny(msg, ['fuck', 'suck', 'dick', 'cock', 'pussy', 'ass', 'nude', 'naked', 'horny', 'hard', 'wet', 'cum'])) {
    return [
      { text: "mmm you're direct... i like that", tone: 'flirty' },
      { text: 'someone knows what they want 😈', tone: 'teasing' },
      { text: "that energy... i'm into it", tone: 'direct' },
    ];
  }

  // Generic / conversational
  return [
    { text: "hey babe 💕 what's on your mind?", tone: 'warm' },
    { text: 'glad you reached out 😊', tone: 'warm' },
    { text: "mm hi there... what brings you to my dms? 😏", tone: 'flirty' },
  ];
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

// ============================================
// HANDLER CONTEXT BUILDER
// ============================================

/**
 * Build social intelligence context block for Handler system prompt.
 */
export async function buildSocialIntelligenceContext(userId: string): Promise<string> {
  try {
    const [perfResult, prospectsResult] = await Promise.allSettled([
      analyzeSocialPerformance(userId),
      identifyProspects(userId),
    ]);

    const perf = perfResult.status === 'fulfilled' ? perfResult.value : null;
    const prospects = prospectsResult.status === 'fulfilled' ? prospectsResult.value : null;

    if (!perf && !prospects) return '';

    const lines: string[] = [];
    const totalMessages = perf?.platformMetrics.reduce((s, p) => s + p.inboundMessages, 0) ?? 0;

    if (totalMessages === 0 && (!prospects || prospects.newProspects.length === 0)) return '';

    lines.push('SOCIAL INTELLIGENCE:');

    // Message summary by platform
    if (perf && perf.platformMetrics.length > 0) {
      const platformParts = perf.platformMetrics
        .filter(p => p.inboundMessages > 0)
        .map(p => `${p.platform}: ${p.inboundMessages}`)
        .join(', ');
      lines.push(`  ${totalMessages} inbound messages this week (${platformParts}).`);
    }

    // Top content
    if (perf && perf.topContent.length > 0) {
      const top = perf.topContent[0];
      lines.push(`  Top performer: ${top.contentType ?? 'post'} on ${top.platform} got ${top.engagementCount} engagements.`);
    }

    // High-value followers
    if (perf && perf.highValueFollowers.length > 0) {
      const hvf = perf.highValueFollowers.slice(0, 3);
      const hvfStr = hvf.map(f => `${f.senderName} on ${f.platform}: ${f.interactionCount} interactions`).join('; ');
      lines.push(`  Repeat engagers: ${hvfStr}.`);
    }

    // New prospects
    if (prospects && prospects.newProspects.length > 0) {
      lines.push(`  ${prospects.newProspects.length} potential new prospect(s) identified:`);
      for (const p of prospects.newProspects.slice(0, 3)) {
        lines.push(`    - ${p.sender_name} on ${p.platform}: ${p.interaction_count} interactions`);
      }
    }

    // DM response rate — count messages that got a reply
    if (perf && totalMessages > 0) {
      const dmPlatforms = perf.platformMetrics.filter(p => p.inboundMessages > 0);
      const totalPosts = dmPlatforms.reduce((s, p) => s + p.posts, 0);
      if (totalPosts > 0) {
        const avgEngagement = dmPlatforms.reduce((s, p) => s + p.engagementRate, 0) / dmPlatforms.length;
        lines.push(`  Avg engagement rate: ${avgEngagement.toFixed(1)} per post.`);
      }
    }

    // Best posting times
    if (perf && perf.bestPostingTimes.length > 0) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const best = perf.bestPostingTimes[0];
      const ampm = best.hour >= 12 ? 'pm' : 'am';
      const displayHour = best.hour === 0 ? 12 : best.hour > 12 ? best.hour - 12 : best.hour;
      lines.push(`  Best posting time: ${dayNames[best.dayOfWeek]} ${displayHour}${ampm} (${best.avgEngagement.toFixed(0)} avg engagement).`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
