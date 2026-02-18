// ============================================
// Caption Generator
// AI-powered caption generation with arc context
// Template fallbacks when AI unavailable
// ============================================

import { invokeWithAuth } from '../handler-ai';
import type { ContentBeat, CaptionContext } from '../../types/narrative';

// ============================================
// AI Caption Generation
// ============================================

/**
 * Generate a fan-facing caption for posted content.
 * Uses Handler AI with full narrative context.
 * Falls back to templates if AI unavailable.
 */
export async function generateCaption(
  context: CaptionContext
): Promise<string> {
  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'generate_caption',
      context: {
        vaultItemId: context.vaultItemId,
        mediaType: context.mediaType,
        description: context.description,
        domain: context.domain,
        vulnerabilityScore: context.vulnerabilityScore,
        beat: context.beat ? {
          beatType: context.beat.beatType,
          beatNumber: context.beat.beatNumber,
          arcTitle: context.beat.arcTitle,
          narrativeFraming: context.beat.narrativeFraming,
          fanHook: context.beat.fanHook,
          sissificationFraming: context.beat.sissificationFraming,
        } : null,
        arc: context.arc ? {
          title: context.arc.title,
          arcType: context.arc.arcType,
          domain: context.arc.domain,
          currentBeat: context.arc.currentBeat,
          totalBeats: context.arc.totalBeats,
          stakesDescription: context.arc.stakesDescription,
        } : null,
        denialDay: context.denialDay,
        streakDays: context.streakDays,
        platform: context.platform,
      },
    });

    if (error) throw error;
    if (data && (data as Record<string, unknown>).caption) return (data as Record<string, unknown>).caption as string;
  } catch (err) {
    console.error('[caption-generator] AI caption failed, using template:', err);
  }

  // Fallback to template
  return generateTemplateCaption(context);
}

// ============================================
// Template Captions (Fallback)
// ============================================

/**
 * Generate a template caption when AI is unavailable.
 */
function generateTemplateCaption(context: CaptionContext): string {
  const { beat, denialDay, platform } = context;

  // If we have a beat, use beat-type-specific templates
  if (beat) {
    return getBeatCaption(beat, denialDay, platform);
  }

  // Standalone post templates
  return getStandaloneCaption(context);
}

function getBeatCaption(
  beat: ContentBeat,
  denialDay: number,
  platform: string
): string {
  const short = platform === 'reddit' || platform === 'twitter';
  const arcRef = beat.arcTitle ? ` [${beat.arcTitle}]` : '';

  const templates: Record<string, string[]> = {
    setup: [
      `Starting something new today.${arcRef} Day ${denialDay}. Let's see where this goes.`,
      `New chapter begins.${arcRef} First step is always the hardest.`,
      short ? `Day 1.${arcRef} Watch this space.` : `Beginning a new journey today.${arcRef} Follow along — this is going to be interesting.`,
    ],
    progress: [
      `Day ${beat.beatNumber || '?'}.${arcRef} Progress is progress. Compare to day 1.`,
      `Building momentum.${arcRef} She's getting stronger every day.`,
      short ? `Progress update.${arcRef}` : `Another day deeper.${arcRef} The changes are real.`,
    ],
    setback: [
      `Not every day is forward.${arcRef} Today was hard. Tomorrow I try again.`,
      `Struggled today.${arcRef} But struggling means I'm still in it.`,
    ],
    breakthrough: [
      `Something clicked today.${arcRef} She's real. I can feel her.`,
      `Breakthrough moment.${arcRef} This is why the work matters.`,
    ],
    climax: [
      `This is the moment.${arcRef} All the work led here.`,
      `Payoff time.${arcRef} Are you watching?`,
    ],
    reflection: [
      `Honest moment.${arcRef} Day ${denialDay}. Here's where I really am.`,
      `Real talk.${arcRef} Vulnerability is the content that matters most.`,
    ],
    tease: [
      `Something big is coming.${arcRef} Stay tuned.`,
      `Tomorrow changes everything.${arcRef}`,
    ],
    cam_session: [
      `Going live tonight. Day ${denialDay} of denial.${arcRef} This should be interesting.`,
      `Live session incoming.${arcRef} Come watch what happens.`,
    ],
    fan_interaction: [
      `Your turn.${arcRef} What should happen next?`,
      `You voted. Now watch.${arcRef}`,
    ],
    funding_push: [
      `Getting closer to the goal.${arcRef} Every tip counts.`,
      `Help make this happen.${arcRef} This is real transformation.`,
    ],
  };

  const options = templates[beat.beatType] || templates.progress;
  const caption = options[Math.floor(Math.random() * options.length)];

  // Append fan hook if available
  if (beat.fanHook) {
    return `${caption}\n\n${beat.fanHook}`;
  }

  return caption;
}

function getStandaloneCaption(context: CaptionContext): string {
  const { domain, denialDay, vulnerabilityScore } = context;

  // Domain-specific standalone captions
  const domainCaptions: Record<string, string[]> = {
    voice: [
      `Voice practice. Day ${denialDay}. She's in there.`,
      `Listen close. That's her.`,
    ],
    style: [
      `Today's look. Progress.`,
      `Getting better at being her.`,
    ],
    body: [
      `Progress update. The changes are real.`,
      `Documentation. Every measurement is evidence.`,
    ],
    denial: [
      `Day ${denialDay}. Still holding. Still building.`,
      `${denialDay} days. The desperation is fuel.`,
    ],
    arousal: [
      `Edge session documented. Day ${denialDay}.`,
      `The energy has to go somewhere. This is where.`,
    ],
    emergence: [
      `Maxy was here today. More than yesterday.`,
      `She's emerging. Day by day.`,
    ],
  };

  const options = domainCaptions[domain || ''] || [
    `Day ${denialDay}. Progress update.`,
    `Another step forward.`,
  ];

  let caption = options[Math.floor(Math.random() * options.length)];

  // High vulnerability content gets a more intimate tone
  if ((vulnerabilityScore || 0) >= 7) {
    caption += '\n\nThis one was hard to share.';
  }

  return caption;
}

// ============================================
// Caption Rules
// ============================================

/**
 * Validate caption for platform constraints and privacy rules.
 */
export function validateCaption(caption: string, platform: string): {
  valid: boolean;
  warnings: string[];
  truncated?: string;
} {
  const warnings: string[] = [];

  // Privacy: never include real name, location, employer, partner name
  const privacyPatterns = [
    { pattern: /\b(david|gina)\b/i, msg: 'Real name detected in caption' },
    { pattern: /\b(my (wife|husband|partner|employer))\b/i, msg: 'Personal reference detected' },
  ];

  for (const { pattern, msg } of privacyPatterns) {
    if (pattern.test(caption)) {
      warnings.push(msg);
    }
  }

  // Platform length limits
  const limits: Record<string, number> = {
    twitter: 280,
    reddit: 300,
    fansly: 500,
    onlyfans: 500,
  };

  const limit = limits[platform] || 500;
  let truncated: string | undefined;

  if (caption.length > limit) {
    truncated = caption.substring(0, limit - 3) + '...';
    warnings.push(`Caption exceeds ${platform} limit (${caption.length}/${limit})`);
  }

  return {
    valid: warnings.filter(w => w.includes('Real name') || w.includes('Personal')).length === 0,
    warnings,
    truncated,
  };
}
