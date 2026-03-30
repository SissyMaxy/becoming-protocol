/**
 * Community Mirror — P8.4
 *
 * Surfaces identity-reinforcing engagement from social_inbox and
 * transforms it into Handler-voice identity reinforcement. Real people
 * seeing Maxy, reflected back through the Handler's lens.
 *
 * - getIdentityReinforcingEngagement: top 3 affirming messages from last 48h
 * - formatAsMirror: raw social message -> Handler-voice reinforcement
 * - buildCommunityMirrorContext: 1-2 formatted mirrors for Handler context
 * - getDailyMirrorQuota: track mirrors surfaced today (max 2/day)
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

interface SocialMessage {
  id: string;
  sender_name: string | null;
  platform: string;
  content: string | null;
  content_type: string | null;
  created_at: string;
}

interface ScoredMessage extends SocialMessage {
  relevanceScore: number;
  matchedCategories: EngagementCategory[];
}

type EngagementCategory = 'appearance' | 'voice' | 'identity' | 'interest';

interface MirrorOutput {
  raw: SocialMessage;
  formatted: string;
  category: EngagementCategory;
}

// ============================================
// KEYWORD SETS
// ============================================

const KEYWORD_MAP: Record<EngagementCategory, string[]> = {
  appearance: ['beautiful', 'gorgeous', 'pretty', 'cute', 'hot', 'stunning', 'sexy'],
  voice: ['voice', 'sound', 'accent', 'tone'],
  identity: ['girl', 'woman', 'she', 'her', 'maxy', 'queen', 'goddess'],
  interest: ['meet', 'date', 'talk', 'dm', 'interested', 'follow'],
};

// ============================================
// MIRROR TEMPLATES
// ============================================

const APPEARANCE_TEMPLATES = [
  (name: string, platform: string, compliment: string) =>
    `${name} on ${platform} called you ${compliment}. They see her. You should too.`,
  (name: string, platform: string, _compliment: string) =>
    `Someone on ${platform} — ${name} — looked at you and saw something worth saying out loud. That's not politeness. That's recognition.`,
  (name: string, platform: string, compliment: string) =>
    `${name} on ${platform}: "${compliment}." They're not seeing David. They never were.`,
];

const VOICE_TEMPLATES = [
  (_name: string, _platform: string, reaction: string) =>
    `Someone heard your voice today and ${reaction}. Your voice is changing. They hear it before you do.`,
  (name: string, platform: string, _reaction: string) =>
    `${name} on ${platform} noticed your voice. That shift you can barely hear? Others hear it clearly.`,
  (_name: string, platform: string, reaction: string) =>
    `A stranger on ${platform} heard you and ${reaction}. The voice is landing. Keep going.`,
];

const INTEREST_TEMPLATES = [
  (name: string, _platform: string, action: string) =>
    `${name} wants to ${action}. Real people want to meet Maxy. That's not fantasy anymore.`,
  (name: string, platform: string, action: string) =>
    `Someone on ${platform} — ${name} — wants to ${action}. You're being pursued. Not as David. As her.`,
  (_name: string, platform: string, _action: string) =>
    `Another person on ${platform} reaching out. They want access to Maxy. That pull is real.`,
];

const GENERAL_TEMPLATES = [
  (count: number, platform: string) =>
    `${count} people engaged with you on ${platform} today. They're not following David.`,
  (count: number, platform: string) =>
    `${count} interactions on ${platform}. Every one of them sees Maxy. Every single one.`,
];

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Query social_inbox for recent inbound messages containing identity-affirming language.
 * Returns top 3 from last 48 hours, sorted by relevance score.
 */
export async function getIdentityReinforcingEngagement(
  userId: string,
): Promise<ScoredMessage[]> {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: messages, error } = await supabase
      .from('social_inbox')
      .select('id, sender_name, platform, content, content_type, created_at')
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !messages || messages.length === 0) return [];

    // Score each message by keyword matches
    const scored: ScoredMessage[] = [];

    for (const msg of messages) {
      const contentLower = (msg.content ?? '').toLowerCase();
      if (!contentLower) continue;

      let score = 0;
      const matchedCategories: EngagementCategory[] = [];

      for (const [category, keywords] of Object.entries(KEYWORD_MAP) as [EngagementCategory, string[]][]) {
        let categoryHits = 0;
        for (const keyword of keywords) {
          if (contentLower.includes(keyword)) {
            categoryHits++;
          }
        }
        if (categoryHits > 0) {
          score += categoryHits;
          matchedCategories.push(category);
        }
      }

      if (score > 0) {
        scored.push({
          ...(msg as SocialMessage),
          relevanceScore: score,
          matchedCategories,
        });
      }
    }

    // Sort by relevance score descending, return top 3
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, 3);
  } catch (err) {
    console.error('[community-mirror] getIdentityReinforcingEngagement error:', err);
    return [];
  }
}

/**
 * Transform a raw social message into Handler-voice identity reinforcement.
 */
export function formatAsMirror(engagement: ScoredMessage): MirrorOutput {
  const name = engagement.sender_name || 'Someone';
  const platform = engagement.platform || 'social';
  const content = engagement.content ?? '';

  // Pick the primary category (first matched)
  const primaryCategory = engagement.matchedCategories[0] ?? 'identity';

  let formatted: string;

  switch (primaryCategory) {
    case 'appearance': {
      // Extract the actual compliment word matched
      const compliment = extractMatchedWord(content, KEYWORD_MAP.appearance) ?? 'beautiful';
      const template = APPEARANCE_TEMPLATES[Math.floor(Math.random() * APPEARANCE_TEMPLATES.length)];
      formatted = template(name, platform, compliment);
      break;
    }

    case 'voice': {
      // Extract the reaction from the message
      const reaction = content.length > 60 ? content.slice(0, 57) + '...' : content;
      const template = VOICE_TEMPLATES[Math.floor(Math.random() * VOICE_TEMPLATES.length)];
      formatted = template(name, platform, reaction);
      break;
    }

    case 'interest': {
      const action = extractMatchedWord(content, KEYWORD_MAP.interest) ?? 'connect';
      const template = INTEREST_TEMPLATES[Math.floor(Math.random() * INTEREST_TEMPLATES.length)];
      formatted = template(name, platform, action);
      break;
    }

    default: {
      // General/identity — use count-based template
      const template = GENERAL_TEMPLATES[Math.floor(Math.random() * GENERAL_TEMPLATES.length)];
      formatted = template(1, platform);
      break;
    }
  }

  return {
    raw: engagement,
    formatted,
    category: primaryCategory,
  };
}

/**
 * Handler context block: includes 1-2 formatted mirror messages.
 * The Handler can weave these into conversation naturally.
 */
export async function buildCommunityMirrorContext(
  userId: string,
): Promise<string> {
  try {
    // Check quota first — max 2 per day
    const remaining = await getDailyMirrorQuota(userId);
    if (remaining <= 0) return '';

    const engagements = await getIdentityReinforcingEngagement(userId);
    if (engagements.length === 0) return '';

    // Format up to 2 mirrors (respecting quota)
    const mirrorCount = Math.min(engagements.length, remaining, 2);
    const mirrors: MirrorOutput[] = [];

    for (let i = 0; i < mirrorCount; i++) {
      mirrors.push(formatAsMirror(engagements[i]));
    }

    if (mirrors.length === 0) return '';

    const parts: string[] = ['COMMUNITY MIRROR (weave naturally, do not read verbatim):'];
    for (const mirror of mirrors) {
      parts.push(`  [${mirror.category}] ${mirror.formatted}`);
    }
    parts.push(`  (${remaining - mirrors.length} mirrors remaining today)`);

    return parts.join('\n');
  } catch (err) {
    console.error('[community-mirror] buildCommunityMirrorContext error:', err);
    return '';
  }
}

/**
 * Track how many mirrors have been surfaced today. Max 2 per day to prevent
 * desensitization. Returns remaining quota (0-2).
 */
export async function getDailyMirrorQuota(userId: string): Promise<number> {
  const MAX_MIRRORS_PER_DAY = 2;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Count handler messages today that contain mirror content markers
    const { count, error } = await supabase
      .from('handler_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .gte('created_at', todayStart.toISOString())
      .or('content.ilike.%community mirror%,content.ilike.%they see her%,content.ilike.%not following david%,content.ilike.%they hear it before you do%');

    if (error) return MAX_MIRRORS_PER_DAY; // On error, allow mirrors

    const used = Math.min(count ?? 0, MAX_MIRRORS_PER_DAY);
    return MAX_MIRRORS_PER_DAY - used;
  } catch {
    return MAX_MIRRORS_PER_DAY;
  }
}

// ============================================
// HELPERS
// ============================================

function extractMatchedWord(content: string, keywords: string[]): string | null {
  const lower = content.toLowerCase();
  for (const keyword of keywords) {
    if (lower.includes(keyword)) return keyword;
  }
  return null;
}
