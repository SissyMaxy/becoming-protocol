// FetLife Blog Post Engine
//
// FetLife rewards personal blog posts (called "writings") more than any other
// platform. Real kink-community trust-building happens here. This engine
// consumes content_production_briefs with brief_type='text_only' or those with caption
// angles long enough to stand alone, and publishes as a FetLife writing.

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

async function findReadyFetLifeBrief(sb: SupabaseClient, userId: string): Promise<BriefRow | null> {
  const { data: briefs } = await sb
    .from('content_production_briefs')
    .select('id, brief_type, feminization_directives, caption_angle, target_platforms, narrative_beat')
    .eq('user_id', userId)
    .eq('status', 'ready_to_post')
    .lte('scheduled_publish_at', new Date().toISOString())
    .order('scheduled_publish_at', { ascending: true })
    .limit(20);
  if (!briefs || briefs.length === 0) return null;
  return (briefs.find(b =>
    Array.isArray(b.target_platforms) &&
    b.target_platforms.some((p: string) => p === 'fetlife' || p.startsWith('fetlife')),
  ) as BriefRow | undefined) || null;
}

async function generateBlogWriting(client: Anthropic, sb: SupabaseClient, userId: string, brief: BriefRow): Promise<{ title: string; body: string } | null> {
  const voice = await buildMaxyVoiceSystem(sb, userId, 'fetlife');
  const d = brief.feminization_directives || {};

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: `${voice}

You are writing a FetLife "writing" (short blog post). FetLife readers want first-person kink-literate personal narrative. 4-10 sentences. Lowercase. Specific details matter — vague philosophy bombs.

Format:
  TITLE: <short, no caps, no emoji>
  BODY: <4-10 sentences, first person, about your lived experience>

Context:
  - Physical state right now: ${[d.outfit, d.pose].filter(Boolean).join('; ') || 'regular day'}
  - Angle/theme: ${brief.caption_angle || 'reflect on where you are today'}
  ${brief.narrative_beat ? `- Week theme: ${brief.narrative_beat}` : ''}

Output exactly TITLE: ... / BODY: ...`,
    messages: [{ role: 'user', content: 'Write the writing.' }],
  });

  const text = extractSafeText(response, 5, 'FetLife writing');
  if (!text) return null;
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)$/);
  if (!titleMatch || !bodyMatch) return null;
  return { title: titleMatch[1].trim().slice(0, 200), body: bodyMatch[1].trim().slice(0, 5000) };
}

export async function runFetLifeBlogPost(
  context: BrowserContext,
  page: Page,
  sb: SupabaseClient,
  client: Anthropic,
  userId: string,
): Promise<{ posted: boolean; briefId?: string; error?: string }> {
  const hasBudget = await checkBudget(sb, userId, 'fetlife', 'blog_post');
  if (!hasBudget) return { posted: false, error: 'budget exhausted' };

  const brief = await findReadyFetLifeBrief(sb, userId);
  if (!brief) return { posted: false, error: 'no ready fetlife brief' };

  const writing = await generateBlogWriting(client, sb, userId, brief);
  if (!writing) return { posted: false, error: 'generation failed' };

  try {
    await page.goto('https://fetlife.com/writings/new', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const titleInput = page.locator('input[name="writing[title]"], input[placeholder*="Title" i]').first();
    await titleInput.fill(writing.title);
    await page.waitForTimeout(500);

    const bodyInput = page.locator('textarea[name="writing[body]"], [contenteditable="true"]').first();
    await bodyInput.fill(writing.body);
    await page.waitForTimeout(500);

    const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    await sb.from('content_production_briefs').update({
      status: 'posted',
      published_at: new Date().toISOString(),
    }).eq('id', brief.id);

    await sb.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'fetlife_blog',
      platform: 'fetlife',
      content: `${writing.title}\n\n${writing.body}`,
      generation_strategy: 'brief_fulfillment',
      status: 'posted',
      posted_at: new Date().toISOString(),
    });

    await incrementBudget(sb, userId, 'fetlife', 'blog_post');
    return { posted: true, briefId: brief.id };
  } catch (err) {
    return { posted: false, error: err instanceof Error ? err.message : String(err) };
  }
}
