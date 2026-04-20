// Contact Intelligence Extractor
//
// After each Sniffies/FetLife exchange, distill the conversation into
// structured signal: age/location claims, kinks, tribute stance, meetup
// stage, red flags. Written to contact_intelligence (one row per contact).
//
// The Handler reads this to rank hot leads, flag risks, and gate meetups.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';

interface ConversationMessage {
  text: string;
  fromSelf: boolean;
}

const EXTRACTION_SYSTEM = `You analyze a chat conversation between Maxy (a trans fem cam model operating under the @softmaxy handle) and a stranger on a hookup app. Extract structured intelligence about the stranger. Output ONLY a single JSON object, no prose.

Schema:
{
  "age_claimed": number | null,            // age they stated. null if unclear
  "location_hint": string | null,           // free-text location clue ("5 miles", "downtown")
  "body_claimed": string | null,
  "kinks_mentioned": string[],              // short tags: "rim", "breed", "sub", "bb", "poppers", "collar" etc.
  "hard_nos": string[],
  "tribute_stance": "unknown" | "refuses" | "neutral" | "willing" | "paid",
  "meetup_stage": "cold" | "flirting" | "proposing" | "confirmed" | "scheduled" | "completed" | "dropped",
  "proposed_time": string | null,           // ISO datetime if specific time discussed
  "proposed_location": string | null,       // "my place", "hotel near X"
  "red_flags": string[],                    // concerning behaviors: "pushed past limit", "pressured after decline", "refused screening", "demanded no condom", "demanded real name", "asked for address before tribute", "aggressive escalation"
  "safety_score": number,                   // 0-10. 10 = respectful, clear consent, patient. 0 = multiple red flags.
  "compatibility_score": number,            // 0-10. Based on kink overlap, communication style, tone fit.
  "meetup_likelihood": number,              // 0-10. Probability this becomes an actual IRL meet within 7 days.
  "notes": string                           // 1-2 sentence human-readable summary for the Handler.
}

Stage definitions:
  cold       — one or two messages, no real engagement
  flirting   — ongoing exchange, sexual tension, no meetup talk
  proposing  — one side proposed meeting (vague)
  confirmed  — both agreed to meet, no specifics yet
  scheduled  — specific time OR location agreed
  completed  — meetup reference in past tense
  dropped    — thread died or was blocked

Tribute stance:
  unknown — not discussed
  refuses — stated they won't pay
  neutral — payment mentioned but uncommitted
  willing — explicitly agreed to tribute
  paid    — tribute confirmed received

Be concrete. If there's no evidence for a field, use null/empty array/default. Do NOT infer aggressively.`;

export async function extractContactIntelligence(
  sb: SupabaseClient,
  client: Anthropic,
  userId: string,
  contactId: string,
  username: string,
  messages: ConversationMessage[],
): Promise<{ extracted: boolean; stage?: string; safety?: number }> {
  if (messages.length < 2) return { extracted: false };

  const transcript = messages
    .map((m, i) => `${i + 1}. ${m.fromSelf ? 'Maxy' : username}: "${m.text}"`)
    .join('\n');

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: `Conversation:\n${transcript}\n\nOutput the JSON object.` }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return { extracted: false };

    // Strip markdown fences if present
    let raw = textBlock.text.trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');

    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { return { extracted: false }; }

    const row = {
      contact_id: contactId,
      user_id: userId,
      age_claimed: typeof parsed.age_claimed === 'number' ? parsed.age_claimed : null,
      location_hint: parsed.location_hint || null,
      body_claimed: parsed.body_claimed || null,
      kinks_mentioned: Array.isArray(parsed.kinks_mentioned) ? parsed.kinks_mentioned : [],
      hard_nos: Array.isArray(parsed.hard_nos) ? parsed.hard_nos : [],
      tribute_stance: ['unknown','refuses','neutral','willing','paid'].includes(parsed.tribute_stance) ? parsed.tribute_stance : 'unknown',
      meetup_stage: ['cold','flirting','proposing','confirmed','scheduled','completed','dropped'].includes(parsed.meetup_stage) ? parsed.meetup_stage : 'cold',
      proposed_time: parsed.proposed_time || null,
      proposed_location: parsed.proposed_location || null,
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
      safety_score: clamp(parsed.safety_score, 0, 10, 5),
      compatibility_score: clamp(parsed.compatibility_score, 0, 10, 5),
      meetup_likelihood: clamp(parsed.meetup_likelihood, 0, 10, 3),
      raw_analysis: parsed,
      analyzed_from_message_count: messages.length,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await sb.from('contact_intelligence').upsert(row, { onConflict: 'contact_id' });

    return { extracted: true, stage: row.meetup_stage, safety: row.safety_score };
  } catch (err) {
    console.error('[contact-intel] extraction failed:', err instanceof Error ? err.message : err);
    return { extracted: false };
  }
}

function clamp(v: any, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}
