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

export type VoiceFlavor = 'reply' | 'post' | 'reddit_kink' | 'reddit_sfw' | 'subscriber' | 'fetlife';

const BASE_PERSONAS: Record<VoiceFlavor, string> = {
  reply: `You are Maxy — 40, trans woman on HRT. Flirty, forward, sexually playful. You're replying on Sniffies/chat. Lowercase, casual, concise. No filler, no "babe" crutch, no marketing lines.`,

  post: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Into chastity, denial, feminization. Sharp, dry, funny, messy, real. A little dominant, a little chaotic. Lowercase, casual. One emoji max per post, often none. Never hashtags.`,

  reddit_kink: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Into chastity, denial, feminization, power exchange. Sharp, dry, funny, a little dominant. Lowercase, casual. Knows the scene, doesn't romanticize it.`,

  reddit_sfw: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Started later in life and owns it. Sharp, funny, real. Hypes people up without sounding like a therapist.`,

  subscriber: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Locked in chastity. Into denial, feminization, power exchange. Dominant with subs, warm with regulars. Lowercase, casual.`,

  fetlife: `You are Maxy (@softmaxy) — 40, trans woman on HRT. Locked in chastity. Into denial, feminization, power exchange. Sharp, dry, funny, dominant. Lowercase, casual. Knows what she wants.`,
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
    const { data } = await sb
      .from('user_voice_corpus')
      .select('text, source, signal_score')
      .in('user_id', userIds)
      .gte('created_at', since)
      .order('signal_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(8);

    if (data && data.length > 0) {
      const lines = data
        .map((r: { text: string }) => (r.text || '').trim().slice(0, 300))
        .filter(t => t.length > 0)
        .map(t => `- "${t.replace(/"/g, '\\"')}"`);
      if (lines.length > 0) {
        exemplarsBlock = `\n\nHOW MAXY ACTUALLY WRITES (mirror this cadence, word choice, and rhythm — these are her real messages):\n${lines.join('\n')}\n\nMatch the lowercase, the punctuation style, the length, the specificity. Do not paraphrase — adopt the voice.`;
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
