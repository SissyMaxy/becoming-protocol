// Reddit Original-Posts Engine
//
// Picks a ready-to-post content_submission and publishes it to a targeted
// subreddit as an original post. This is the biggest unbuilt follower-growth
// lever — comments alone (the existing engine) earn karma slowly; original
// posts in targeted NSFW/kink subs drive real Fansly/OF subs.
//
// Karma-gated sub selection: the bigger/stricter the sub, the more karma
// you need before posting there. Low karma sits in small, permissive subs
// until threshold passes.

import type { BrowserContext, Page } from 'playwright';
import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { buildMaxyVoiceSystem } from '../voice-system';
import { extractSafeText } from '../refusal-filter';
import { checkBudget, incrementBudget } from '../engagement-budget';
import { rotateFansly, rotateAllPlatforms } from '../link-rotator';

const SUB_KARMA_REQS: Record<string, number> = {
  'sissification': 0,
  'feminization': 0,
  'Sissy': 0,
  'sissychastity': 0,
  'chastity': 20,
  'sissyology': 10,
  'EroticHypnosis': 10,
  'GoneWildTrans': 50,
  'TransGoneWild': 50,
  'GoneWildSissy': 25,
};

function eligibleSubs(currentKarma: number, requested?: string): string[] {
  if (requested) {
    const req = SUB_KARMA_REQS[requested] ?? 0;
    return currentKarma >= req ? [requested] : [];
  }
  return Object.entries(SUB_KARMA_REQS)
    .filter(([, k]) => currentKarma >= k)
    .map(([s]) => s);
}

async function getRedditKarma(sb: SupabaseClient, userId: string): Promise<number> {
  try {
    const { data } = await sb.from('platform_follower_snapshots')
      .select('follower_count')
      .eq('user_id', userId)
      .eq('platform', 'reddit')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any)?.follower_count ?? 0;
  } catch { return 0; }
}

interface BriefRow {
  id: string;
  brief_type: string;
  feminization_directives: Record<string, any>;
  caption_angle: string | null;
  target_platforms: string[];
  narrative_beat: string | null;
}

interface SubmissionRow {
  id: string;
  asset_url: string | null;
  asset_text: string | null;
  thumbnail_url: string | null;
}

/**
 * Find one content_brief that is ready_to_post AND targets Reddit.
 */
async function findReadyRedditBrief(sb: SupabaseClient, userId: string): Promise<{ brief: BriefRow; submission: SubmissionRow } | null> {
  const { data: briefs } = await sb
    .from('content_production_briefs')
    .select('id, brief_type, feminization_directives, caption_angle, target_platforms, narrative_beat')
    .eq('user_id', userId)
    .eq('status', 'ready_to_post')
    .lte('scheduled_publish_at', new Date().toISOString())
    .order('scheduled_publish_at', { ascending: true })
    .limit(20);

  if (!briefs || briefs.length === 0) return null;

  // Filter for briefs that include a reddit target
  const redditBrief = briefs.find(b =>
    Array.isArray(b.target_platforms) &&
    b.target_platforms.some((p: string) => p.startsWith('reddit')),
  ) as BriefRow | undefined;
  if (!redditBrief) return null;

  // Get the latest approved submission for this brief
  const { data: sub } = await sb
    .from('content_submissions')
    .select('id, asset_url, asset_text, thumbnail_url')
    .eq('user_id', userId)
    .eq('brief_id', redditBrief.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return null;
  return { brief: redditBrief, submission: sub as SubmissionRow };
}

async function generateRedditPostText(
  client: Anthropic,
  sb: SupabaseClient,
  userId: string,
  brief: BriefRow,
  subreddit: string,
): Promise<{ title: string; body: string } | null> {
  const flavor = ['sissification', 'feminization', 'Sissy', 'sissychastity', 'chastity', 'sissyology', 'EroticHypnosis'].includes(subreddit)
    ? 'reddit_kink' : 'reddit_sfw';

  const voice = await buildMaxyVoiceSystem(sb, userId, flavor);
  const caption = brief.caption_angle || 'no angle — keep it natural';
  const directives = brief.feminization_directives || {};

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: `${voice}

You are writing an original Reddit post for r/${subreddit}. Format:
  TITLE: <the post title — under 100 chars, no all-caps, no emoji spam>
  BODY: <the post body — 1-4 sentences. Context about the image/video. Lowercase, casual, real.>

Context:
  - The asset shows: ${[directives.outfit, directives.pose, directives.framing].filter(Boolean).join('; ')}
  ${directives.script ? `- Audio script: "${directives.script}"` : ''}
  - Caption angle: ${caption}
  ${brief.narrative_beat ? `- Narrative theme: ${brief.narrative_beat}` : ''}

Output exactly:
TITLE: ...
BODY: ...`,
    messages: [{ role: 'user', content: 'Write the title and body.' }],
  });

  const text = extractSafeText(response, 5, `Reddit-original r/${subreddit}`);
  if (!text) return null;

  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)$/);
  if (!titleMatch) return null;

  const title = titleMatch[1].trim().slice(0, 300);
  const body = (bodyMatch ? bodyMatch[1] : '').trim().slice(0, 2000);
  return { title, body };
}

export async function runRedditOriginalPost(
  context: BrowserContext,
  page: Page,
  sb: SupabaseClient,
  client: Anthropic,
  userId: string,
): Promise<{ posted: boolean; subreddit?: string; briefId?: string; error?: string }> {
  // Budget
  const hasBudget = await checkBudget(sb, userId, 'reddit', 'original_post');
  if (!hasBudget) return { posted: false, error: 'budget exhausted' };

  const ready = await findReadyRedditBrief(sb, userId);
  if (!ready) return { posted: false, error: 'no ready reddit brief' };

  const karma = await getRedditKarma(sb, userId);
  const explicitSub = (ready.brief.target_platforms.find((p: string) => p.startsWith('reddit:')) || '').replace('reddit:', '') || undefined;
  const eligible = eligibleSubs(karma, explicitSub);
  if (eligible.length === 0) {
    return { posted: false, error: `karma ${karma} insufficient for requested sub` };
  }
  const subreddit = eligible[Math.floor(Math.random() * eligible.length)];

  const postText = await generateRedditPostText(client, sb, userId, ready.brief, subreddit);
  if (!postText) return { posted: false, error: 'text generation failed' };

  // Inject cross-platform link (Fansly, usually) into body at low rate
  const bodyWithLink = rotateFansly(postText.body, 0.3);

  // Navigate to submit page
  try {
    await page.goto(`https://www.reddit.com/r/${subreddit}/submit`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // Choose image/link mode based on asset
    const asset = ready.submission;
    if (asset.asset_url) {
      // Image/video post — click image tab
      const imageTab = page.locator('button:has-text("Images & Video"), [role="tab"]:has-text("Images")').first();
      if (await imageTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await imageTab.click();
        await page.waitForTimeout(1000);
      }
      // Upload from URL is complex; for v1 we post as link to asset_url
      const urlInput = page.locator('input[placeholder*="url" i], input[type="url"]').first();
      if (await urlInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await urlInput.fill(asset.asset_url);
      }
    }

    // Title
    const titleInput = page.locator('textarea[placeholder*="Title" i], input[placeholder*="Title" i]').first();
    await titleInput.fill(postText.title);
    await page.waitForTimeout(500);

    // Body
    if (bodyWithLink) {
      const bodyInput = page.locator('[contenteditable="true"], textarea[name="text"]').first();
      if (await bodyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await bodyInput.click();
        await bodyInput.fill(bodyWithLink);
      }
    }

    // Submit
    const submitBtn = page.locator('button:has-text("Post"), button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(5000);
    }

    // Mark the brief as posted
    await sb.from('content_production_briefs').update({
      status: 'posted',
      published_at: new Date().toISOString(),
    }).eq('id', ready.brief.id);

    await incrementBudget(sb, userId, 'reddit', 'original_post');

    return { posted: true, subreddit, briefId: ready.brief.id };
  } catch (err) {
    return { posted: false, subreddit, error: err instanceof Error ? err.message : String(err) };
  }
}
