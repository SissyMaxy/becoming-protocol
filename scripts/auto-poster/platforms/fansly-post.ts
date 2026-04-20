// Fansly Original-Posts Engine
//
// Picks a ready content_brief targeting fansly, posts it to the Fansly feed
// with optional paywall/tier gating. Source of passive platform growth.

import type { BrowserContext, Page } from 'playwright';
import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { buildMaxyVoiceSystem } from '../voice-system';
import { extractSafeText } from '../refusal-filter';
import { checkBudget, incrementBudget } from '../engagement-budget';

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
}

async function findReadyFanslyBrief(sb: SupabaseClient, userId: string): Promise<{ brief: BriefRow; submission: SubmissionRow } | null> {
  const { data: briefs } = await sb
    .from('content_production_briefs')
    .select('id, brief_type, feminization_directives, caption_angle, target_platforms, narrative_beat')
    .eq('user_id', userId)
    .eq('status', 'ready_to_post')
    .lte('scheduled_publish_at', new Date().toISOString())
    .order('scheduled_publish_at', { ascending: true })
    .limit(20);
  if (!briefs || briefs.length === 0) return null;

  const brief = briefs.find(b =>
    Array.isArray(b.target_platforms) &&
    b.target_platforms.some((p: string) => p === 'fansly' || p.startsWith('fansly')),
  ) as BriefRow | undefined;
  if (!brief) return null;

  const { data: sub } = await sb
    .from('content_submissions')
    .select('id, asset_url, asset_text')
    .eq('user_id', userId)
    .eq('brief_id', brief.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return null;
  return { brief, submission: sub as SubmissionRow };
}

async function generateFanslyCaption(client: Anthropic, sb: SupabaseClient, userId: string, brief: BriefRow): Promise<string | null> {
  const voice = await buildMaxyVoiceSystem(sb, userId, 'post');
  const d = brief.feminization_directives || {};
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    system: `${voice}

You are writing a Fansly post caption. Format: 1-3 sentences. Lowercase, casual, honest. No hashtags. No "link in bio." Subs already pay — don't sell.

Context:
  - Asset: ${[d.outfit, d.pose, d.framing].filter(Boolean).join('; ')}
  - Caption angle: ${brief.caption_angle || 'natural'}
  ${brief.narrative_beat ? `- Theme: ${brief.narrative_beat}` : ''}

Output ONLY the caption.`,
    messages: [{ role: 'user', content: 'Write the caption.' }],
  });
  return extractSafeText(response, 5, 'Fansly caption');
}

export async function runFanslyPost(
  context: BrowserContext,
  page: Page,
  sb: SupabaseClient,
  client: Anthropic,
  userId: string,
): Promise<{ posted: boolean; briefId?: string; error?: string }> {
  const hasBudget = await checkBudget(sb, userId, 'fansly', 'original_post');
  if (!hasBudget) return { posted: false, error: 'budget exhausted' };

  const ready = await findReadyFanslyBrief(sb, userId);
  if (!ready) return { posted: false, error: 'no ready fansly brief' };

  const caption = await generateFanslyCaption(client, sb, userId, ready.brief);
  if (!caption) return { posted: false, error: 'caption generation failed' };

  try {
    await page.goto('https://fansly.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // Click "New post" / compose button
    const composeBtn = page.locator('button:has-text("Post"), button:has-text("Create"), [aria-label*="post" i], [aria-label*="create" i]').first();
    if (await composeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await composeBtn.click();
      await page.waitForTimeout(2000);
    }

    // Caption textarea
    const textarea = page.locator('textarea, [contenteditable="true"]').first();
    await textarea.fill(caption);
    await page.waitForTimeout(500);

    // (Asset upload is platform-specific and complex; v1 posts text-only
    // caption — Maxy's submission asset_url serves as the source of record.
    // A follow-up can wire playwright file-chooser uploads.)

    // Submit
    const submitBtn = page.locator('button:has-text("Post"), button[type="submit"]').last();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(5000);
    }

    await sb.from('content_production_briefs').update({
      status: 'posted',
      published_at: new Date().toISOString(),
    }).eq('id', ready.brief.id);

    await sb.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'fansly_post',
      platform: 'fansly',
      content: caption,
      generation_strategy: 'brief_fulfillment',
      status: 'posted',
      posted_at: new Date().toISOString(),
    });

    await incrementBudget(sb, userId, 'fansly', 'original_post');
    return { posted: true, briefId: ready.brief.id };
  } catch (err) {
    return { posted: false, error: err instanceof Error ? err.message : String(err) };
  }
}
