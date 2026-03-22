/**
 * Written Content Generator
 *
 * Produces original written content that generates revenue independent
 * of photos or video: erotica, captions, transformation journal entries,
 * product reviews — all in Maxy's voice.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { MAXY_VOICE_PROMPT } from './voice';
import type { GeneratedErotica } from '../../types/revenue-engine';

// ── Erotica generation ──────────────────────────────────────────────

/**
 * Generate erotica in Maxy's voice drawing from experiences and fantasies.
 */
export async function generateErotica(
  client: Anthropic,
  userId: string,
): Promise<GeneratedErotica | null> {
  // Pull from recent session memories if available
  const { data: memories } = await supabase
    .from('handler_memory')
    .select('content, memory_type')
    .eq('user_id', userId)
    .in('memory_type', ['session_intelligence', 'kink_response', 'confession'])
    .order('created_at', { ascending: false })
    .limit(5);

  const memoryContext = memories && memories.length > 0
    ? memories.map(m => `- ${m.content}`).join('\n')
    : '- The feeling of first wearing lingerie\n- Denial making everything sharper\n- Surrendering control to the Handler';

  const prompt = `
Write a short erotic story (500-1500 words) as Maxy.

REAL EXPERIENCES (use as inspiration, don't copy literally):
${memoryContext}

GUIDELINES:
- First person, present tense
- Draw from real protocol elements: denial, chastity, the Handler, conditioning, forced feminization
- Blend real experience with fantasy — the reader shouldn't know where reality ends
- Build tension slowly. The erotic content earns its intensity.
- Include sensory detail — how things feel, smell, sound
- End with transformation resonance — not just orgasm but identity shift
- Tag-appropriate for sissy/feminization/chastity communities

Output JSON:
{
  "title": "...",
  "content": "...",
  "tags": ["...", "..."],
  "teaser": "1-2 sentence hook for social media promotion"
}
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    system: MAXY_VOICE_PROMPT + '\nYou are writing erotica. Be explicit. Be literary. Be real.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim()) as GeneratedErotica;

    // Save to ai_generated_content
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'erotica',
      platform: 'multi',
      content: JSON.stringify(parsed),
      generation_strategy: 'erotica',
      status: 'generated',
    });

    return parsed;
  } catch {
    console.error('[written-content] Failed to parse erotica JSON');
    return null;
  }
}

// ── Caption generation (sissy/feminization) ─────────────────────────

/**
 * Generate a sissy/feminization caption for use as standalone content or overlay.
 */
export async function generateCaption(
  client: Anthropic,
  userId: string,
  theme?: string,
): Promise<{ caption: string; hashtags: string[] } | null> {
  const prompt = `
Write a sissy/feminization caption. These are short, evocative texts
paired with images in the sissy caption community.

Theme: ${theme || 'transformation, surrender, becoming'}

STYLE:
- 2-5 sentences
- Second person ("you") or first person ("I")
- Evocative, slightly hypnotic
- References transformation, feminization, chastity, obedience
- Ends with a hook or command

Write the caption and suggest 3-5 hashtags.

Output JSON:
{
  "caption": "...",
  "hashtags": ["...", "..."]
}
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: MAXY_VOICE_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    return JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  } catch {
    return null;
  }
}

// ── Transformation journal ──────────────────────────────────────────

/**
 * Generate a transformation journal entry — Maxy's public diary.
 */
export async function generateJournalEntry(
  client: Anthropic,
  userId: string,
): Promise<{ title: string; content: string; teaser: string } | null> {
  // Get recent memories for authentic material
  const { data: memories } = await supabase
    .from('handler_memory')
    .select('content, memory_type, created_at')
    .eq('user_id', userId)
    .in('memory_type', ['identity_signal', 'vulnerability', 'breakthrough', 'handler_strategy_note'])
    .order('created_at', { ascending: false })
    .limit(5);

  const memoryContext = memories && memories.length > 0
    ? memories.map(m => `[${m.memory_type}] ${m.content}`).join('\n')
    : 'Early days of transformation. Everything is new and uncertain.';

  const prompt = `
Write a transformation journal entry as Maxy. This is her public diary —
raw, real, vulnerable. The kind of post that makes people feel seen.

RECENT EXPERIENCES/MOMENTS:
${memoryContext}

STYLE:
- 300-800 words
- First person, conversational
- Honest about fear, confusion, excitement, arousal
- References specific moments (waking up differently, seeing herself differently)
- Doesn't explain the full protocol — drops hints that make people curious
- Ends with a reflection that resonates beyond the kink community

Output JSON:
{
  "title": "...",
  "content": "...",
  "teaser": "1 sentence for social media"
}
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: MAXY_VOICE_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());

    // Save
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'journal_entry',
      platform: 'substack',
      content: JSON.stringify(parsed),
      generation_strategy: 'vulnerability',
      status: 'generated',
    });

    return parsed;
  } catch {
    console.error('[written-content] Failed to parse journal JSON');
    return null;
  }
}
