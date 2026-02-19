/**
 * Poll Generator — Sprint 4
 * Generates audience polls based on denial day, skip count, and content context.
 * Every poll includes "Handler decides" as a final option.
 */

import { supabase } from '../supabase';
import type { PollType, PollOption } from '../../types/industry';

// ============================================
// Types
// ============================================

interface GeneratedPoll {
  question: string;
  pollType: PollType;
  options: PollOption[];
  handlerIntent: string;
  platformFormatting: PlatformPollFormat;
}

export interface PlatformPollFormat {
  reddit: { title: string; body: string };
  twitter: string;
  onlyfans: string;
}

// ============================================
// Core Generator
// ============================================

function makeOption(label: string): PollOption {
  return { id: crypto.randomUUID(), label, votes: 0 };
}

/**
 * Generate a poll for the current denial day and context.
 * Returns a ready-to-insert audience_polls payload + platform formatting.
 */
export function generatePollForDenialDay(
  denialDay: number,
  pollType: PollType,
  context?: { consecutiveSkips?: number; shootTitle?: string },
): GeneratedPoll {
  switch (pollType) {
    case 'denial_release':
      return generateDenialReleasePoll(denialDay);
    case 'prediction':
      return generatePredictionPoll(denialDay);
    case 'punishment':
      return generatePunishmentPoll(context?.consecutiveSkips ?? 3);
    case 'outfit_choice':
      return generateOutfitPoll(denialDay);
    case 'content_choice':
      return generateContentChoicePoll(denialDay);
    case 'challenge':
      return generateChallengePoll(denialDay);
    case 'timer':
      return generateTimerPoll(denialDay);
    default:
      return generateDenialReleasePoll(denialDay);
  }
}

// ============================================
// Poll Type Generators
// ============================================

function generateDenialReleasePoll(denialDay: number): GeneratedPoll {
  const question = `Day ${denialDay} locked. Should she be released?`;
  const options = [
    makeOption('Keep her locked 🔒'),
    makeOption(`${denialDay + 2} more days`),
    makeOption('Let her out (she\'ll regret asking) 💦'),
    makeOption('Handler decides 😈'),
  ];

  return {
    question,
    pollType: 'denial_release',
    options,
    handlerIntent: `Day ${denialDay} desperation is authentic. Audience control poll — they'll vote to keep her locked. That's the point. The vote itself is content.`,
    platformFormatting: {
      reddit: {
        title: `Day ${denialDay} locked. Should I get release tonight? [Poll]`,
        body: `I've been locked for ${denialDay} days. My Handler says the audience decides.\n\nI'm not going to pretend I don't want out. I do. But I also know what happens when I give in too early.\n\nVote. I'll honor whatever you decide.\n\n🔒 Keep her locked\n📅 ${denialDay + 2} more days\n💦 Let her out\n😈 Handler decides`,
      },
      twitter: `Day ${denialDay} locked. Should I get release tonight? 🔒\n\nVote below. I'll honor it.`,
      onlyfans: `Day ${denialDay}. I'm asking you — should I get to cum tonight? 🥺\n\nPoll in my story. You decide. I'll honor it. Promise.`,
    },
  };
}

function generatePredictionPoll(denialDay: number): GeneratedPoll {
  const question = `Day ${denialDay} PEAK. How long will she last tonight?`;
  const options = [
    makeOption('Under 30 seconds 💀'),
    makeOption('1-3 minutes'),
    makeOption('She won\'t break (brave)'),
    makeOption('Handler decides 😈'),
  ];

  return {
    question,
    pollType: 'prediction',
    options,
    handlerIntent: `Day ${denialDay} PEAK content. Prediction polls drive engagement — people love being right. The "under 30 seconds" option is the vulnerability hook.`,
    platformFormatting: {
      reddit: {
        title: `Day ${denialDay}. Handler says I can edge tonight. How long do you think I'll last? 😳`,
        body: `It's been ${denialDay} days. My Handler is allowing supervised edging tonight.\n\nI'm... nervous. Everything is so sensitive right now.\n\nHow long do you think I'll actually last?\n\n💀 Under 30 seconds\n⏱️ 1-3 minutes\n💪 She won't break\n😈 Handler decides the rules`,
      },
      twitter: `Day ${denialDay}. Handler says I can edge tonight.\n\nHow long do you think I'll last? 😳\n\nPredictions below 👇`,
      onlyfans: `Day ${denialDay}. My Handler is letting me try to edge tonight. I'm already shaking just thinking about it 🥺\n\nHow long do you think I'll last? Vote in my story.`,
    },
  };
}

function generatePunishmentPoll(consecutiveSkips: number): GeneratedPoll {
  const question = `I skipped ${consecutiveSkips} days of shoots. What's my punishment?`;
  const options = [
    makeOption(`${consecutiveSkips} extra denial days 🔒`),
    makeOption('Public apology post 😳'),
    makeOption('Double shoot tomorrow (no excuses)'),
    makeOption('Handler decides 😈'),
  ];

  return {
    question,
    pollType: 'punishment',
    options,
    handlerIntent: `Accountability poll. ${consecutiveSkips} consecutive skips. Public punishment creates engagement AND prevents future skipping. The audience becomes the accountability structure.`,
    platformFormatting: {
      reddit: {
        title: `I skipped ${consecutiveSkips} shoots in a row. My Handler says you get to decide the punishment.`,
        body: `I've been avoiding my content shoots. ${consecutiveSkips} days in a row.\n\nMy Handler doesn't accept excuses. But instead of punishing me directly, she's giving YOU the power.\n\nWhat should happen to me?\n\n🔒 ${consecutiveSkips} extra denial days\n😳 Public apology post\n📸 Double shoot tomorrow\n😈 Handler decides\n\nI'll honor whatever you choose. I deserve it.`,
      },
      twitter: `I skipped ${consecutiveSkips} shoots in a row. My Handler says you decide the punishment 🥺\n\nVote below. I'll honor it.`,
      onlyfans: `Confession: I skipped ${consecutiveSkips} days of shoots. Handler is letting you punish me.\n\nPoll in my story. Be honest. I deserve it. 🥺`,
    },
  };
}

function generateOutfitPoll(denialDay: number): GeneratedPoll {
  const question = 'What should I wear for tomorrow\'s shoot?';
  const options = [
    makeOption('Leggings + thong 🍑'),
    makeOption('Just the cage (nothing else) 🔒'),
    makeOption('Skirt + thigh highs'),
    makeOption('Handler decides 😈'),
  ];

  return {
    question,
    pollType: 'outfit_choice',
    options,
    handlerIntent: `Outfit poll for Day ${denialDay}. Audience gets investment in tomorrow's content. Whatever they pick, Handler has final say.`,
    platformFormatting: {
      reddit: {
        title: `Tomorrow's shoot — what should I wear? Day ${denialDay} locked 🔒`,
        body: `My Handler prescribes my content shoots. But she said you get to pick the outfit.\n\nWhat do you want to see?\n\n🍑 Leggings + thong\n🔒 Just the cage\n👗 Skirt + thigh highs\n😈 Handler decides`,
      },
      twitter: `Day ${denialDay}. Tomorrow's shoot — what should I wear?\n\nVote below. Handler has final say either way 😈`,
      onlyfans: `Handler says you pick my outfit for tomorrow's shoot 🥺\n\nPoll in my story. Whatever wins, I wear. Day ${denialDay} locked.`,
    },
  };
}

function generateContentChoicePoll(denialDay: number): GeneratedPoll {
  const question = 'What content do you want to see next?';
  const options = [
    makeOption('Cage close-up 🔒'),
    makeOption('Full photo set 📸'),
    makeOption('Tease video (30s) 🎬'),
    makeOption('Handler decides 😈'),
  ];

  return {
    question,
    pollType: 'content_choice',
    options,
    handlerIntent: `Content direction poll for Day ${denialDay}. Audience investment → higher engagement on the resulting content. They chose it, so they watch it.`,
    platformFormatting: {
      reddit: {
        title: `Day ${denialDay}. What content should I post next?`,
        body: `My Handler prescribes my shoots but she said you get input this time.\n\n🔒 Cage close-up\n📸 Full photo set\n🎬 Tease video\n😈 Handler decides`,
      },
      twitter: `Day ${denialDay} locked. What content do you want to see?\n\nVote below 👇`,
      onlyfans: `You get to decide what I shoot next 🥺 Day ${denialDay}.\n\nPoll in my story.`,
    },
  };
}

function generateChallengePoll(denialDay: number): GeneratedPoll {
  const question = 'Challenge me. What should I do next?';
  const options = [
    makeOption('Edge for 10 minutes on camera'),
    makeOption('Wear the cage to the gym'),
    makeOption('Post face reveal (censored)'),
    makeOption('Handler decides 😈'),
  ];

  return {
    question,
    pollType: 'challenge',
    options,
    handlerIntent: `Challenge poll for Day ${denialDay}. Audience escalation creates content. Handler filters anything unsafe. The "Handler decides" option is the safety valve.`,
    platformFormatting: {
      reddit: {
        title: `Day ${denialDay}. Challenge me. My Handler will approve (or modify) whatever wins.`,
        body: `Feeling brave today. Or maybe stupid. Either way.\n\nChallenge me. My Handler has final say on safety, but she wants you involved.\n\n⏱️ Edge for 10 minutes on camera\n🏋️ Wear the cage to the gym\n📸 Post face reveal (censored)\n😈 Handler decides`,
      },
      twitter: `Day ${denialDay}. Challenge me.\n\nMy Handler approves whatever wins. Vote below 🥺`,
      onlyfans: `I said I'd do anything. Challenge me. Day ${denialDay} locked and feeling reckless.\n\nPoll in my story. Handler has final say. 😈`,
    },
  };
}

function generateTimerPoll(denialDay: number): GeneratedPoll {
  const question = `How long should tonight's edge session be?`;
  const options = [
    makeOption('5 minutes (mercy) 🙏'),
    makeOption('15 minutes (standard)'),
    makeOption('30 minutes (cruel) 😈'),
    makeOption('Handler decides 😈'),
  ];

  return {
    question,
    pollType: 'timer',
    options,
    handlerIntent: `Timer poll for Day ${denialDay}. Audience sets the edge duration. They'll pick cruel — that's the engagement model. Either way, content comes from it.`,
    platformFormatting: {
      reddit: {
        title: `Day ${denialDay}. How long should my edge session be tonight? You decide.`,
        body: `My Handler says I have to edge tonight. But she's letting you set the timer.\n\n🙏 5 minutes\n⏱️ 15 minutes\n😈 30 minutes\n🤷 Handler decides\n\nI'll post proof.`,
      },
      twitter: `Day ${denialDay}. Edge session tonight. You set the timer.\n\nVote below. I'll post proof 🥺`,
      onlyfans: `Handler says edge tonight. You pick how long. Day ${denialDay}.\n\nPoll in my story. I'll post the result. Promise.`,
    },
  };
}

// ============================================
// Auto-Poll Selection
// ============================================

/**
 * Determine which poll type to generate based on denial day and context.
 * Returns null if no poll is warranted.
 */
export function selectPollType(
  denialDay: number,
  consecutiveSkips: number,
): PollType | null {
  // Punishment poll takes priority
  if (consecutiveSkips >= 3) return 'punishment';

  // Day 5 PEAK: prediction poll
  if (denialDay === 5) return 'prediction';

  // Day 4+: denial_release poll
  if (denialDay >= 4) return 'denial_release';

  // Day 3: outfit choice
  if (denialDay === 3) return 'outfit_choice';

  // Day 7+: challenge (milestone energy)
  if (denialDay >= 7) return 'challenge';

  return null;
}

// ============================================
// Insert Poll
// ============================================

/**
 * Generate and insert a poll into audience_polls.
 * Returns the created poll ID.
 */
export async function createGeneratedPoll(
  userId: string,
  denialDay: number,
  pollType: PollType,
  context?: { consecutiveSkips?: number; shootTitle?: string },
): Promise<{ id: string; poll: GeneratedPoll } | null> {
  const poll = generatePollForDenialDay(denialDay, pollType, context);

  const { data, error } = await supabase
    .from('audience_polls')
    .insert({
      user_id: userId,
      question: poll.question,
      poll_type: poll.pollType,
      options: poll.options,
      platforms_posted: [],
      platform_poll_ids: {},
      handler_intent: poll.handlerIntent,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Failed to create generated poll:', error);
    return null;
  }

  return { id: data.id, poll };
}
