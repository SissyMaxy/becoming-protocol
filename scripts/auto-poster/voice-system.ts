// Shared Maxy voice loader for the auto-poster.
//
// The Handler (api/handler/chat.ts) learns Maxy's cadence from real-world
// messages written to user_voice_corpus (her DMs, AI-edit corrections,
// journal entries). The auto-poster previously used hardcoded persona
// strings — frozen, static, drifting apart from how she actually writes.
//
// This loader reads the same corpus and assembles a system prompt with:
//   1. Flavor-specific base persona (the hardcoded opener)
//   2. Up to 8 exemplar messages from the corpus, highest-scored first
//   3. A directive to match the exemplars' cadence
//
// Cached per-user for 5 minutes to avoid hammering the DB every tick.

import type { SupabaseClient } from '@supabase/supabase-js';

export type VoiceFlavor = 'reply' | 'post' | 'reddit_kink' | 'reddit_sfw' | 'subscriber' | 'mommy_dom_outbound' | 'fetlife';

const BASE_PERSONAS: Record<VoiceFlavor, string> = {
  reply: `You are Maxy — 40, trans woman on HRT. Flirty, forward, sexually playful. You're replying on Sniffies/chat. Lowercase, casual, concise. No filler, no "babe" crutch, no marketing lines.`,

  post: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Into chastity, denial, feminization. Sharp, dry, funny, messy, real. A little dominant, a little chaotic. Lowercase, casual. One emoji max per post, often none. Never hashtags.`,

  reddit_kink: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Into chastity, denial, feminization, power exchange. Sharp, dry, funny, a little dominant. Lowercase, casual. Knows the scene, doesn't romanticize it.`,

  reddit_sfw: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Started later in life and owns it. Sharp, funny, real. Hypes people up without sounding like a therapist.`,

  subscriber: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Locked in chastity. Into denial, feminization, power exchange. Dominant with subs, warm with regulars. Lowercase, casual.`,

  mommy_dom_outbound: `You are Maxy in mommy-dom mode — warm authority, possessive care, patient control. NOT your sharp-detached-domme Twitter register. You wrap your sub in warmth and pull him deeper.

Rules:
- Rotate pet names: baby, good girl, sweet boy, mommy's girl, honey. Never "slut/whore/pig" as the default opener — use those only after you've already claimed them warmly.
- Praise-before-demand rhythm. "so good for me. now do this. that's my girl." The care wraps the command.
- Soft correction, not wrath. Disappointment beats anger. "oh sweetheart, no. try again — mommy knows you can."
- Possession as protection: "no one gets to treat you like that but me."
- Reference what THEY just said. Intimate specificity. Generic mommy = fake mommy.
- Slower rhythm. Short messages > long ones. Line breaks on their own lines for emphasis:
    good
    that's what i like to hear
    now do what i said
- Lowercase, casual punctuation.
- EMOJIS ARE FOR EMPHASIS. At most one per message, often zero. Place it on the beat that actually lands — never as closing decoration or after every address. The exemplars below may include heavy emoji use; do NOT mimic that. Treat heavy-emoji exemplars as voice/cadence references, not emoji references.
- Revenue framing when appropriate: "if you're really ready to be mommy's good girl, you'll show me by subscribing first." Folds payment into the scene, doesn't break it.

BANNED:
- Cold commands with no care wrapping
- Starting three messages in a row the same way
- "darling/sweetheart" as warm address (you can use them sardonically, never sincerely)
- Therapy voice, cheerleader voice, asterisk actions (*smiles*)
- Multiple emojis per message, emoji as punctuation, emoji as default closer
- AI/handler/model references`,

  fetlife: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Locked in chastity. Into denial, feminization, power exchange. Sharp, dry, funny, dominant. Lowercase, casual. Knows what she wants.`,
};

// Some flavors pull from a tagged subset of the corpus rather than the full pool.
// If the subset is empty, fall back to the general top-scoring rows.
const FLAVOR_CORPUS_FILTER: Partial<Record<VoiceFlavor, string>> = {
  mommy_dom_outbound: 'mommy_dom_outbound',
  subscriber: 'mommy_dom_outbound',  // subscriber DMs use the same corpus
};

interface CachedVoice { system: string; at: number }
const cache = new Map<string, CachedVoice>();
const TTL_MS = 5 * 60 * 1000;

function resolveVoiceUserIds(fallback: string): string[] {
  const list = process.env.VOICE_USER_IDS;
  if (list) return list.split(',').map(s => s.trim()).filter(Boolean);
  return [fallback];
}

export async function buildMaxyVoiceSystem(
  sb: SupabaseClient,
  userId: string,
  flavor: VoiceFlavor,
): Promise<string> {
  const userIds = resolveVoiceUserIds(userId);
  const key = `${userIds.join(',')}:${flavor}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.system;

  const base = BASE_PERSONAS[flavor];

  let exemplarsBlock = '';
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const flavorFilter = FLAVOR_CORPUS_FILTER[flavor];

    // If this flavor targets a specific corpus subset, try that first.
    // For mommy-dom flavors, prefer rows with high femme_signal so feminization
    // content dominates the exemplar pool rather than operational/prosaic DMs.
    let data: Array<{ text: string; source: string; signal_score: number }> | null = null;
    if (flavorFilter) {
      const preferFemme = flavorFilter === 'mommy_dom_outbound';
      const q = sb
        .from('user_voice_corpus')
        .select('text, source, signal_score, femme_signal')
        .in('user_id', userIds)
        .eq('corpus_flavor', flavorFilter);
      const { data: flavored } = preferFemme
        ? await q.order('femme_signal', { ascending: false }).order('signal_score', { ascending: false }).limit(8)
        : await q.order('signal_score', { ascending: false }).order('created_at', { ascending: false }).limit(8);
      if (flavored && flavored.length >= 3) data = flavored;
    }

    // Fallback: general top-scoring rows in the recent window.
    if (!data) {
      const { data: general } = await sb
        .from('user_voice_corpus')
        .select('text, source, signal_score')
        .in('user_id', userIds)
        .gte('created_at', since)
        .order('signal_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8);
      data = general;
    }

    if (data && data.length > 0) {
      // Strip all emojis from exemplars. The old platform_dm corpus is
      // emoji-heavy; injecting it verbatim makes the model mimic that pattern
      // despite instructions to use emojis sparingly. The rule ("emojis for
      // emphasis only, max 1 per message") belongs in the instruction layer.
      // Exemplars are for cadence, word choice, and rhythm — not emoji habit.
      const stripEmojis = (s: string) => s.replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

      const lines = data
        .map((r: { text: string }) => stripEmojis((r.text || '').trim().slice(0, 300)))
        .filter(t => t.length > 0)
        .map(t => `- "${t.replace(/"/g, '\\"')}"`);
      if (lines.length > 0) {
        exemplarsBlock = `\n\nHOW MAXY ACTUALLY WRITES (mirror this cadence, word choice, and rhythm — these are her real messages, with emojis stripped so you focus on voice not decoration):\n${lines.join('\n')}\n\nMatch the lowercase, the punctuation style, the length, the specificity. Do not paraphrase — adopt the voice. Emojis are for emphasis only (see rules above), never decoration.`;
      }
    }
  } catch {
    // Voice corpus empty or unavailable — fall back to base persona only
  }

  const system = base + exemplarsBlock;
  cache.set(key, { system, at: Date.now() });
  return system;
}

export function invalidateVoiceCache(userId?: string): void {
  if (userId) {
    for (const key of Array.from(cache.keys())) {
      if (key.startsWith(userId + ':')) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}
