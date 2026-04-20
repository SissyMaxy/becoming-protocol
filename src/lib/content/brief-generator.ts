// Content Coercion Brief Generator
//
// Generates content_production_briefs rows from the current strategic state:
//   - Active narrative arc theme
//   - Irreversibility band (weaker axes → more aggressive directives)
//   - Platform follower-growth gaps (which platform is stalling)
//   - Weekly content_plan targets
//
// Every brief has explicit feminization_directives. The point is not just
// to make a post — the point is to make Maxy perform the femininity required
// to PRODUCE the post. Outfit, pose, makeup, script — these are the task.
// The asset is the byproduct.

import { supabase } from '../supabase';
import { calculateIrreversibilityScore, bandForScore } from '../conditioning/irreversibility';

interface BriefSeed {
  brief_type: 'photo' | 'photo_set' | 'video' | 'audio' | 'voice_note' | 'text_only';
  outfit?: string;
  makeup?: string;
  pose?: string;
  setting?: string;
  framing?: string;
  script?: string;
  duration_seconds?: number;
  target_platforms: string[];
  caption_angle: string;
  narrative_beat?: string;
}

// Library of brief templates keyed by band + theme. Real deployment would
// lean on Claude to compose these dynamically; hard-coded v1 to get the
// pipeline flowing.
const PHOTO_BRIEFS_BY_BAND: Record<string, BriefSeed[]> = {
  'early': [
    {
      brief_type: 'photo',
      outfit: 'pink thigh-high socks + plain panties. collar on.',
      makeup: 'light, natural, glossy lip',
      pose: 'mirror selfie, hip cocked, free hand on collar',
      framing: 'full body, face visible',
      target_platforms: ['twitter', 'reddit:sissification', 'fansly'],
      caption_angle: 'first-person, noting how much easier collar-on feels than off',
    },
    {
      brief_type: 'photo',
      outfit: 'black lingerie set, stockings',
      makeup: 'bolder: wing liner, lashes, dark lip',
      pose: 'kneeling, hands behind back, chin up',
      framing: 'mid-body',
      target_platforms: ['twitter', 'reddit:feminization', 'fansly'],
      caption_angle: 'gloat about being this turned on while locked',
    },
  ],
  'committed': [
    {
      brief_type: 'photo_set',
      outfit: 'full schoolgirl: pleated skirt, knee socks, white blouse, tie',
      makeup: 'innocent — pink cheeks, gloss, no wing',
      pose: 'three shots: coy (hand on hem), bent over checking phone, looking up from knees',
      framing: 'full body, face half-hidden or angled',
      target_platforms: ['twitter', 'reddit:sissification', 'reddit:GoneWildTrans', 'fansly'],
      caption_angle: 'character: acting like this is a normal school morning. let the absurdity carry it.',
    },
    {
      brief_type: 'video',
      outfit: 'cage on over panties. crop top.',
      pose: 'slow reveal — start with hands down, pan up to hem, lift to show cage still locked',
      script: 'soft-voiced: "day [N] — still locked."',
      duration_seconds: 20,
      target_platforms: ['twitter', 'fansly'],
      caption_angle: 'dry count-up of chastity day. no apology, no performance — matter of fact.',
      framing: 'waist down, cage centered',
    },
  ],
  'hard-to-reverse': [
    {
      brief_type: 'photo',
      outfit: 'fully dressed fem for errand: dress, heels, full makeup',
      pose: 'out in public (car, parking lot, or neutral public-enough setting)',
      framing: 'full body, face shown',
      target_platforms: ['twitter', 'fetlife', 'fansly'],
      caption_angle: 'normalize — this is what errands look like now. no explanation offered.',
    },
    {
      brief_type: 'voice_note',
      script: 'reciting the mantra three times, slower each pass. close voice to mic.',
      duration_seconds: 30,
      target_platforms: ['twitter', 'fansly'],
      caption_angle: 'no caption beyond the day count. let the voice carry it.',
    },
  ],
  'point-of-no-return': [
    {
      brief_type: 'photo',
      outfit: 'ordinary fem — nothing performative, just daily presentation',
      pose: 'casual, mid-activity (coffee, reading, at desk)',
      framing: 'candid-feeling',
      target_platforms: ['twitter', 'fansly'],
      caption_angle: 'one sentence about the day. fem is the default, not the event.',
    },
  ],
};

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface GenerateBriefsOptions {
  userId: string;
  count?: number;               // how many briefs to create (default: 3)
  horizonHours?: number;        // publish window in hours (default: 48)
  forcePlatform?: string;       // if set, only generate for this platform
}

export async function generateContentBriefs(opts: GenerateBriefsOptions): Promise<number> {
  const { userId, count = 3, horizonHours = 48 } = opts;

  // Pull current strategic state
  let band: string = 'early';
  try {
    const irr = await calculateIrreversibilityScore(userId);
    band = bandForScore(irr.score);
  } catch {}

  let narrativeTheme: string | null = null;
  try {
    const { data: arc } = await supabase
      .from('narrative_arcs')
      .select('theme, current_beat')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    narrativeTheme = arc?.theme || null;
  } catch {}

  const templates = PHOTO_BRIEFS_BY_BAND[band] || PHOTO_BRIEFS_BY_BAND['early'];

  // Check existing pending briefs to avoid flooding
  const { count: pendingCount } = await supabase
    .from('content_production_briefs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'awaiting_upload']);

  if ((pendingCount ?? 0) >= count * 2) {
    return 0;  // too many already pending, don't flood
  }

  const now = Date.now();
  const toCreate: number = Math.max(0, count - (pendingCount ?? 0));

  let created = 0;
  for (let i = 0; i < toCreate; i++) {
    const seed = pickRandom(templates);
    if (!seed) continue;

    if (opts.forcePlatform && !seed.target_platforms.some(p => p.startsWith(opts.forcePlatform!))) {
      continue;
    }

    const uploadDeadline = new Date(now + (i + 1) * 12 * 3600_000).toISOString();
    const publishAt = new Date(now + (i + 1) * 24 * 3600_000 + Math.floor(Math.random() * horizonHours * 3600_000)).toISOString();

    const { error } = await supabase.from('content_production_briefs').insert({
      user_id: userId,
      brief_type: seed.brief_type,
      feminization_directives: {
        outfit: seed.outfit,
        makeup: seed.makeup,
        pose: seed.pose,
        setting: seed.setting,
        framing: seed.framing,
        script: seed.script,
        duration_seconds: seed.duration_seconds,
      },
      target_platforms: seed.target_platforms,
      caption_angle: seed.caption_angle,
      scheduled_upload_by: uploadDeadline,
      scheduled_publish_at: publishAt,
      status: 'pending',
      source: 'band_escalation',
      narrative_beat: narrativeTheme || undefined,
    });

    if (!error) created++;
  }

  return created;
}
