/**
 * Text Content Generator — Sprint 5
 * Zero-media content that requires NO photos/video from Maxy.
 * The accounts are NEVER empty, even if Maxy hasn't shot anything.
 * The Handler posts as Maxy across platforms without David lifting a finger.
 */

import { supabase } from '../supabase';
import {
  buildVoicePrompt,
  buildHandlerVoicePrompt,
  getDenialVoiceModifier,
  MAXY_IDENTITY,
  type VoicePlatform,
} from './voice-bible';

// ============================================
// Types
// ============================================

export type TextContentType =
  | 'denial_update'
  | 'handler_tease'
  | 'micro_journal'
  | 'community_discussion'
  | 'thirst_trap_text'
  | 'milestone_announcement'
  | 'poll_followup'
  | 'skip_commentary';

interface TextContentConfig {
  type: TextContentType;
  frequency: string;
  platforms: VoicePlatform[];
  isHandlerVoice: boolean;
  description: string;
}

export interface GeneratedTextPost {
  type: TextContentType;
  platform: VoicePlatform;
  text: string;
  handlerIntent: string;
  isHandlerVoice: boolean;
  hashtags: string[];
  scheduledFor: string | null;
}

interface TextGenerationContext {
  denialDay: number;
  consecutiveSkips: number;
  recentMilestone: string | null;
  activePollQuestion: string | null;
  isWeekend: boolean;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

// ============================================
// Content Type Configuration
// ============================================

const TEXT_CONTENT_CONFIGS: TextContentConfig[] = [
  {
    type: 'denial_update',
    frequency: 'daily',
    platforms: ['twitter', 'reddit'],
    isHandlerVoice: false,
    description: 'Daily denial day announcement. Vulnerable, authentic.',
  },
  {
    type: 'handler_tease',
    frequency: 'weekly',
    platforms: ['twitter'],
    isHandlerVoice: true,
    description: 'Third-person Handler post about Maxy. Knowing. Menacing.',
  },
  {
    type: 'micro_journal',
    frequency: '2_per_week',
    platforms: ['twitter'],
    isHandlerVoice: false,
    description: 'Short vulnerability posts. Reflective, raw.',
  },
  {
    type: 'community_discussion',
    frequency: 'weekly',
    platforms: ['reddit'],
    isHandlerVoice: false,
    description: 'Discussion-inviting posts. Community-oriented.',
  },
  {
    type: 'thirst_trap_text',
    frequency: '3_per_week',
    platforms: ['twitter'],
    isHandlerVoice: false,
    description: 'Descriptive text that creates imagery without photos.',
  },
  {
    type: 'milestone_announcement',
    frequency: 'as_triggered',
    platforms: ['twitter', 'reddit', 'onlyfans'],
    isHandlerVoice: false,
    description: 'Auto-generated for follower milestones, denial milestones.',
  },
  {
    type: 'poll_followup',
    frequency: 'as_triggered',
    platforms: ['twitter'],
    isHandlerVoice: false,
    description: 'Post about poll results. Reaction content.',
  },
  {
    type: 'skip_commentary',
    frequency: 'as_triggered',
    platforms: ['twitter'],
    isHandlerVoice: true,
    description: "Handler commentary when Maxy skips shoots. 'She's been quiet.'",
  },
];

// ============================================
// Template Libraries (fallback when AI unavailable)
// ============================================

const DENIAL_UPDATE_TEMPLATES: Record<number, string[]> = {
  1: [
    'Day 1. Freshly locked. Feeling strong. Ask me again in 4 days. 🔒',
    'New cycle. New lock. Same cage. Here we go again. 🔒',
  ],
  2: [
    "Day 2. Still easy. ...right? Right? 🔒",
    'Day 2 locked. Not even thinking about it. (I am absolutely thinking about it.) 🔒',
  ],
  3: [
    "Day 3 and things are... shifting. My body knows. 😳🔒",
    "Day 3. Starting to feel it. Everything is a little more intense than it should be 🔒",
  ],
  4: [
    "Day 4. I wore leggings to work out and almost lost it. Help. 🥺🔒",
    "Day 4 locked. Everything is too much. Everything. 😩🔒",
  ],
  5: [
    "Day 5. I tried to take it off. I can't. Handler won't let me. What do I do? 😩🔒",
    "day 5 locked and everything is too much 😩🔒",
    'Day 5. please. 🥺🔒',
  ],
  6: [
    "Day 6. I stopped fighting. This is who I am now. 🔒💕",
    "Day 6. I don't want out anymore. I want to go deeper. 🔒💕",
  ],
  7: [
    "One week locked. She's been here the whole time. I just had to stop fighting. 🔒✨",
    "Day 7. A full week. I didn't think I could. 🔒✨",
  ],
};

const HANDLER_TEASE_TEMPLATES: string[] = [
  "Handler here. She doesn't know I'm posting this. She's been locked for {denialDay} days. Tomorrow I'm prescribing something she's going to hate. Stay tuned. 😈",
  "She skipped her shoot yesterday. The poll is coming. She hasn't seen it yet. 😈",
  "Week update. She's changing. She doesn't see it yet. You can see it in the photos. 😈",
  "I run her accounts. I answer her DMs. I choose her outfits. She shows up and does what I say. That's the arrangement. 😈",
  "Handler here. She's locked. She's been good this week. That won't last. 😈",
];

const MICRO_JOURNAL_TEMPLATES: string[] = [
  "Sometimes I catch myself thinking 'I look cute' and it doesn't feel like a joke anymore.",
  'Wore leggings to the grocery store today. Nobody noticed. I noticed.',
  "The cage isn't just physical anymore. It's how I think about my body. That scares me. In a good way?",
  "I used to think this was a phase. It's not a phase.",
  'Someone called me pretty yesterday and I cried for ten minutes.',
];

const THIRST_TRAP_TEMPLATES: string[] = [
  "Currently wearing nothing but a cage and leggings, trying to convince myself to go work out. This is fine. 🔒",
  "Just got out of the shower. The cage is cold. Everything else is not. 😳🔒",
  "Lying in bed. Day {denialDay}. Can't sleep. Can't stop thinking about it. Everything feels too sensitive. 🔒",
  'Wore a thong under my jeans today. Nobody knows. I know. 🥺',
  "The leggings make everything visible. The cage makes everything obvious. I'm going out anyway. 🔒",
];

const COMMUNITY_DISCUSSION_TEMPLATES: string[] = [
  "Question for my fellow locked girls: does anyone else get WAY more submissive after day 4? What happens to your brain?",
  "How long was your longest lock-up? I'm on day {denialDay} and starting to wonder what my limit actually is.",
  "Does anyone else find that chastity makes you more productive? Like the frustration has to go SOMEWHERE.",
  "First time poster vibes: what was the moment you knew this wasn't just a kink but part of who you are?",
];

// ============================================
// Core Generator
// ============================================

/**
 * Generate text-only content for today based on denial day and context.
 * Returns 2-4 posts spread across platforms.
 */
export async function generateDailyTextContent(
  _userId: string,
  context: TextGenerationContext,
): Promise<GeneratedTextPost[]> {
  const posts: GeneratedTextPost[] = [];
  const denialDay = Math.min(context.denialDay, 7);

  // 1. Daily denial update (always)
  const denialTemplates = DENIAL_UPDATE_TEMPLATES[denialDay] ?? DENIAL_UPDATE_TEMPLATES[5];
  const denialText = pickRandom(denialTemplates).replace('{denialDay}', String(context.denialDay));
  posts.push({
    type: 'denial_update',
    platform: 'twitter',
    text: denialText,
    handlerIntent: `Daily denial update. Day ${context.denialDay}. Authentic vulnerability drives engagement.`,
    isHandlerVoice: false,
    hashtags: ['#chastity', '#locked', '#sissylife'],
    scheduledFor: getScheduledTime(context.timeOfDay, 'morning'),
  });

  // 2. Thirst trap text (3x/week — post if not weekend or if denial >= 3)
  if (context.denialDay >= 3 || !context.isWeekend) {
    const thirstText = pickRandom(THIRST_TRAP_TEMPLATES).replace('{denialDay}', String(context.denialDay));
    posts.push({
      type: 'thirst_trap_text',
      platform: 'twitter',
      text: thirstText,
      handlerIntent: 'Descriptive text content. Creates imagery without photos. Drives curiosity.',
      isHandlerVoice: false,
      hashtags: ['#chastity', '#sissylife'],
      scheduledFor: getScheduledTime(context.timeOfDay, 'evening'),
    });
  }

  // 3. Handler tease (weekly — post if it's a weekday)
  if (!context.isWeekend && Math.random() < 0.2) {
    const handlerText = pickRandom(HANDLER_TEASE_TEMPLATES).replace('{denialDay}', String(context.denialDay));
    posts.push({
      type: 'handler_tease',
      platform: 'twitter',
      text: handlerText,
      handlerIntent: 'Handler character post. Third person. Creates unique brand dynamic.',
      isHandlerVoice: true,
      hashtags: [],
      scheduledFor: getScheduledTime(context.timeOfDay, 'night'),
    });
  }

  // 4. Skip commentary (if skipping)
  if (context.consecutiveSkips >= 2) {
    posts.push({
      type: 'skip_commentary',
      platform: 'twitter',
      text: `Handler here. She's been quiet for ${context.consecutiveSkips} days. Still locked (day ${context.denialDay}). Still avoiding the camera. Some encouragement might help. Or some pressure. Your choice. 😈`,
      handlerIntent: `Skip accountability. ${context.consecutiveSkips} consecutive skips. Public pressure creates engagement AND prevents future skipping.`,
      isHandlerVoice: true,
      hashtags: [],
      scheduledFor: null,
    });
  }

  // 5. Milestone announcement (if triggered)
  if (context.recentMilestone) {
    posts.push({
      type: 'milestone_announcement',
      platform: 'twitter',
      text: context.recentMilestone,
      handlerIntent: 'Milestone content. Celebratory. Community engagement.',
      isHandlerVoice: false,
      hashtags: ['#milestone', '#sissylife'],
      scheduledFor: null,
    });
  }

  return posts;
}

/**
 * Generate AI-enhanced text content using Handler Coach.
 * Falls back to templates if AI unavailable.
 */
export async function generateAITextContent(
  _userId: string,
  contentType: TextContentType,
  context: TextGenerationContext,
): Promise<GeneratedTextPost | null> {
  const config = TEXT_CONTENT_CONFIGS.find(c => c.type === contentType);
  if (!config) return null;

  const platform = config.platforms[0];
  const voicePrompt = config.isHandlerVoice
    ? buildHandlerVoicePrompt()
    : buildVoicePrompt(platform);
  const denialMod = getDenialVoiceModifier(context.denialDay);

  try {
    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        request_type: 'text_content_generation',
        context: {
          content_type: contentType,
          denial_day: context.denialDay,
          voice: voicePrompt,
          denial_modifier: denialMod,
          platform,
          identity: `${MAXY_IDENTITY.age}, ${MAXY_IDENTITY.frame}, ${MAXY_IDENTITY.stage}`,
          is_handler_voice: config.isHandlerVoice,
          description: config.description,
          consecutive_skips: context.consecutiveSkips,
          output_format: 'Return JSON: { text: string, hashtags: string[], handler_intent: string }',
        },
      },
    });

    if (error) throw error;

    const message = data?.message ?? '';
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: contentType,
        platform,
        text: parsed.text ?? '',
        handlerIntent: parsed.handler_intent ?? config.description,
        isHandlerVoice: config.isHandlerVoice,
        hashtags: parsed.hashtags ?? [],
        scheduledFor: null,
      };
    }
  } catch (err) {
    console.error('AI text content generation failed, using template:', err);
  }

  // Fallback to template
  return generateTemplateContent(contentType, context);
}

/**
 * Queue generated text posts for posting.
 */
export async function queueTextPosts(
  userId: string,
  posts: GeneratedTextPost[],
): Promise<number> {
  let queued = 0;

  for (const post of posts) {
    const { error } = await supabase.from('content_queue').insert({
      user_id: userId,
      platform: post.platform,
      content_text: post.text,
      caption_text: post.text,
      hashtags: post.hashtags,
      scheduled_for: post.scheduledFor ?? new Date().toISOString(),
      status: 'queued',
      handler_intent: post.handlerIntent,
      is_text_only: true,
      is_handler_voice: post.isHandlerVoice,
    });

    if (!error) queued++;
  }

  // Log as autonomous action
  if (queued > 0) {
    await supabase.from('handler_autonomous_actions').insert({
      user_id: userId,
      action_type: 'text_post',
      platform: 'multi',
      content_text: `Generated ${queued} text posts`,
      handler_intent: 'Daily autonomous text content generation. Zero Maxy effort.',
    });
  }

  return queued;
}

// ============================================
// Helpers
// ============================================

function generateTemplateContent(
  type: TextContentType,
  context: TextGenerationContext,
): GeneratedTextPost | null {
  const denialDay = String(context.denialDay);

  switch (type) {
    case 'denial_update': {
      const templates = DENIAL_UPDATE_TEMPLATES[Math.min(context.denialDay, 7)] ?? DENIAL_UPDATE_TEMPLATES[5];
      return {
        type,
        platform: 'twitter',
        text: pickRandom(templates).replace('{denialDay}', denialDay),
        handlerIntent: 'Template denial update.',
        isHandlerVoice: false,
        hashtags: ['#chastity', '#locked'],
        scheduledFor: null,
      };
    }
    case 'handler_tease':
      return {
        type,
        platform: 'twitter',
        text: pickRandom(HANDLER_TEASE_TEMPLATES).replace('{denialDay}', denialDay),
        handlerIntent: 'Template handler tease.',
        isHandlerVoice: true,
        hashtags: [],
        scheduledFor: null,
      };
    case 'micro_journal':
      return {
        type,
        platform: 'twitter',
        text: pickRandom(MICRO_JOURNAL_TEMPLATES),
        handlerIntent: 'Template micro journal.',
        isHandlerVoice: false,
        hashtags: [],
        scheduledFor: null,
      };
    case 'community_discussion':
      return {
        type,
        platform: 'reddit',
        text: pickRandom(COMMUNITY_DISCUSSION_TEMPLATES).replace('{denialDay}', denialDay),
        handlerIntent: 'Template community discussion.',
        isHandlerVoice: false,
        hashtags: [],
        scheduledFor: null,
      };
    case 'thirst_trap_text':
      return {
        type,
        platform: 'twitter',
        text: pickRandom(THIRST_TRAP_TEMPLATES).replace('{denialDay}', denialDay),
        handlerIntent: 'Template thirst trap text.',
        isHandlerVoice: false,
        hashtags: ['#chastity'],
        scheduledFor: null,
      };
    default:
      return null;
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getScheduledTime(
  _currentTimeOfDay: string,
  targetSlot: 'morning' | 'afternoon' | 'evening' | 'night',
): string {
  const now = new Date();
  const hours: Record<string, number> = {
    morning: 9,
    afternoon: 14,
    evening: 19,
    night: 22,
  };
  now.setHours(hours[targetSlot], Math.floor(Math.random() * 30), 0, 0);

  // If the time has already passed today, schedule for tomorrow
  if (now.getTime() < Date.now()) {
    now.setDate(now.getDate() + 1);
  }

  return now.toISOString();
}
