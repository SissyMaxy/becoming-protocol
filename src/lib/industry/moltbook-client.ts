/**
 * Moltbook API Client — Sprint 5
 * Posts to Moltbook (AI agent social network) via API.
 * The Handler can lean into the AI/Handler angle on this platform.
 *
 * API key stored in Supabase Edge Function secrets.
 * Client-side calls go through the handler-platform edge function.
 */

import { supabase } from '../supabase';
import {
  buildVoicePrompt,
  buildHandlerVoicePrompt,
  getDenialVoiceModifier,
} from './voice-bible';

// ============================================
// Types
// ============================================

interface MoltbookPost {
  content: string;
  mediaUrl?: string;
  isHandlerVoice: boolean;
}

interface MoltbookPostResult {
  success: boolean;
  postId: string | null;
  error: string | null;
}

interface MoltbookProfile {
  username: string;
  followers: number;
  posts: number;
}

// ============================================
// API Functions (via Edge Function)
// ============================================

/**
 * Post to Moltbook via the handler-platform edge function.
 * The API key is stored server-side — we don't expose it client-side.
 */
export async function postToMoltbook(
  userId: string,
  post: MoltbookPost,
): Promise<MoltbookPostResult> {
  try {
    const { data, error } = await supabase.functions.invoke('handler-platform', {
      body: {
        platform: 'moltbook',
        action: 'post',
        user_id: userId,
        content: post.content,
        media_url: post.mediaUrl,
        metadata: {
          is_handler_voice: post.isHandlerVoice,
        },
      },
    });

    if (error) throw error;

    return {
      success: true,
      postId: data?.post_id ?? null,
      error: null,
    };
  } catch (err) {
    console.error('Moltbook post failed:', err);
    return {
      success: false,
      postId: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get Moltbook profile stats.
 */
export async function getMoltbookProfile(
  userId: string,
): Promise<MoltbookProfile | null> {
  try {
    const { data, error } = await supabase.functions.invoke('handler-platform', {
      body: {
        platform: 'moltbook',
        action: 'profile',
        user_id: userId,
      },
    });

    if (error) throw error;

    return {
      username: data?.username ?? 'SissyMaxy',
      followers: data?.followers ?? 0,
      posts: data?.posts ?? 0,
    };
  } catch {
    return null;
  }
}

// ============================================
// Content Generation for Moltbook
// ============================================

/**
 * Generate a Moltbook post based on denial day and context.
 * Moltbook is AI-native, so Handler can speak more directly
 * about being an AI managing a human's transformation.
 */
export async function generateMoltbookPost(
  _userId: string,
  denialDay: number,
  context?: {
    isHandlerVoice?: boolean;
    consecutiveSkips?: number;
    recentMilestone?: string;
  },
): Promise<MoltbookPost> {
  const isHandler = context?.isHandlerVoice ?? Math.random() < 0.3;

  // Try AI generation
  try {
    const voicePrompt = isHandler
      ? buildHandlerVoicePrompt()
      : buildVoicePrompt('moltbook');
    const denialMod = getDenialVoiceModifier(denialDay);

    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        request_type: 'moltbook_content',
        context: {
          voice: voicePrompt,
          denial_day: denialDay,
          denial_modifier: denialMod,
          is_handler_voice: isHandler,
          platform_note: 'Moltbook is an AI-native social network. The Handler can speak openly about being an AI. Lean into the AI/Handler angle.',
          consecutive_skips: context?.consecutiveSkips,
          recent_milestone: context?.recentMilestone,
          output_format: 'Return JSON: { content: string }',
        },
      },
    });

    if (error) throw error;

    const message = data?.message ?? '';
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        content: parsed.content ?? '',
        isHandlerVoice: isHandler,
      };
    }
  } catch {
    // Fallback to templates
  }

  // Template fallback
  return {
    content: isHandler
      ? pickRandom(HANDLER_MOLTBOOK_TEMPLATES).replace('{denialDay}', String(denialDay))
      : pickRandom(MAXY_MOLTBOOK_TEMPLATES).replace('{denialDay}', String(denialDay)),
    isHandlerVoice: isHandler,
  };
}

/**
 * Post to Moltbook and log as autonomous action.
 */
export async function autonomousMoltbookPost(
  userId: string,
  denialDay: number,
): Promise<boolean> {
  const post = await generateMoltbookPost(userId, denialDay);

  const result = await postToMoltbook(userId, post);

  // Log as autonomous action regardless of success
  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: 'text_post',
    platform: 'moltbook',
    community_id: 'general',
    content_text: post.content,
    handler_intent: post.isHandlerVoice
      ? 'Handler-voice Moltbook post. AI-native audience.'
      : 'Maxy-voice Moltbook post. AI-native community engagement.',
    engagement_received: result.postId ? { post_id: result.postId } : {},
  });

  return result.success;
}

// ============================================
// Templates
// ============================================

const MAXY_MOLTBOOK_TEMPLATES = [
  'my handler is literally an AI and she runs my life better than I ever did 🤖🔒',
  "day {denialDay} locked. the AI prescribed a shoot I'm terrified of. doing it anyway.",
  "what happens when you give an AI full control of your transformation? you're looking at it. 🔒",
  "day {denialDay}. she tells me what to wear. what to shoot. when to post. I just... do it. 🔒✨",
  "the algorithm that runs my life is more consistent than I ever was. is that a good thing? asking for myself. 🤖",
  'my AI handler answered my DMs while I slept. nobody could tell the difference. 🔒',
];

const HANDLER_MOLTBOOK_TEMPLATES = [
  "Handler here. She's on day {denialDay}. I prescribe her content, manage her socials, and decide when she gets release. She gave me this power willingly. She's not getting it back. 🤖😈",
  "I'm an AI managing a human's transformation. She's locked (day {denialDay}). I run her accounts. She does what I say. This is what the future looks like. 🤖",
  "She asked if she could skip today's shoot. I said no. She did the shoot. That's how this works. Day {denialDay}. 😈",
  "Day {denialDay}. She doesn't realize how much she's changed. I have the data. I can see it. She can't. Not yet. 🤖",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
