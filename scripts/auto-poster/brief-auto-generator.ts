// Brief Auto-Generator (scheduler side)
//
// Writes to the EXISTING content_briefs table (the one the Becoming app's
// ContentSubmissionModal reads). Uses the existing schema: brief_number,
// content_type, purpose, platforms[], instructions{}, deadline, difficulty,
// vulnerability_tier, reward_*, consequence_if_missed.
//
// Also handles forced-authorship for text_only briefs: generates a
// handler_draft and deadline, then auto-posts if Maxy doesn't author by
// the deadline. Text briefs that get authored via the Handler chat flow
// through content_production_briefs + submitMaxyAuthorship().

import type { SupabaseClient } from '@supabase/supabase-js';

interface BriefSeed {
  content_type: 'photo' | 'photo_set' | 'video' | 'audio' | 'text';
  purpose: string;
  platforms: string[];
  difficulty: number;
  vulnerability_tier: number;
  instructions: {
    concept: string;
    setting: string;
    outfit: string;
    lighting: string;
    framing: string;
    expression: string;
    poses?: string[];
    script?: string;
    duration?: string;
    technicalNotes: string[];
  };
}

const SEEDS_BY_BAND: Record<string, BriefSeed[]> = {
  'early': [
    {
      content_type: 'photo',
      purpose: 'baseline fem visibility — collar + thigh-highs establish the look',
      platforms: ['twitter', 'fansly'],
      difficulty: 2,
      vulnerability_tier: 2,
      instructions: {
        concept: 'collar selfie — establishing the daily fem baseline',
        setting: 'mirror, well-lit room',
        outfit: 'pink thigh-high socks, plain panties, collar on',
        lighting: 'natural or ring light, warm',
        framing: 'full body mirror selfie, hip cocked',
        expression: 'relaxed, slight smirk — not performing',
        poses: ['hand on collar, weight on one hip'],
        technicalNotes: ['phone at chest height', 'face visible or half-visible'],
      },
    },
    {
      content_type: 'photo',
      purpose: 'kink visibility — lingerie + submission posture for engagement',
      platforms: ['twitter', 'fansly'],
      difficulty: 3,
      vulnerability_tier: 3,
      instructions: {
        concept: 'submission pose in lingerie',
        setting: 'bedroom, clean background',
        outfit: 'black lingerie set, stockings, collar',
        lighting: 'moody, side-lit or window light',
        framing: 'mid-body, kneeling',
        expression: 'looking up, chin slightly raised',
        poses: ['kneeling, hands behind back, chin up'],
        technicalNotes: ['shoot from slightly above', 'cage visible through panties is a plus'],
      },
    },
    {
      content_type: 'text',
      purpose: 'FetLife writing — personal narrative builds community trust',
      platforms: ['fetlife'],
      difficulty: 2,
      vulnerability_tier: 2,
      instructions: {
        concept: 'daily reflection — what you wore, what you felt, what the structure demanded',
        setting: 'n/a',
        outfit: 'n/a',
        lighting: 'n/a',
        framing: 'n/a',
        expression: 'n/a',
        technicalNotes: ['6-8 sentences', 'first-person', 'specific details over vague feelings'],
      },
    },
  ],
  'committed': [
    {
      content_type: 'photo_set',
      purpose: 'escalated visibility — themed set for cross-platform posting',
      platforms: ['twitter', 'fansly'],
      difficulty: 3,
      vulnerability_tier: 3,
      instructions: {
        concept: 'schoolgirl set — three poses, increasing vulnerability',
        setting: 'clean room, neutral background',
        outfit: 'pleated skirt, knee socks, white blouse, tie',
        lighting: 'bright, even — daylight or ring light',
        framing: 'full body, face half-hidden or angled',
        expression: 'coy → submissive → yielding across the three shots',
        poses: ['hand on hem (coy)', 'bent over checking phone', 'looking up from knees'],
        technicalNotes: ['three distinct shots minimum', 'keep framing consistent across set'],
      },
    },
    {
      content_type: 'video',
      purpose: 'chastity verification — cage reveal builds audience + accountability',
      platforms: ['twitter', 'fansly'],
      difficulty: 3,
      vulnerability_tier: 4,
      instructions: {
        concept: 'slow cage reveal — pan up to locked cage',
        setting: 'wherever you are, standing',
        outfit: 'cage visible over panties, crop top',
        lighting: 'available — natural is fine',
        framing: 'waist down, cage centered',
        expression: 'n/a — body only',
        script: 'soft voice: "day [N] — still locked."',
        duration: '15-20 seconds',
        technicalNotes: ['start hands down, slow pan upward', 'reveal the cage, hold 3 seconds'],
      },
    },
    {
      content_type: 'text',
      purpose: 'deeper FetLife writing — what routine looks like after weeks',
      platforms: ['fetlife'],
      difficulty: 2,
      vulnerability_tier: 3,
      instructions: {
        concept: 'what the third week of this looks like — what became routine, what still surprises you',
        setting: 'n/a',
        outfit: 'n/a',
        lighting: 'n/a',
        framing: 'n/a',
        expression: 'n/a',
        technicalNotes: ['8-10 sentences', 'be specific about one moment today', 'kink-literate audience'],
      },
    },
  ],
  'hard-to-reverse': [
    {
      content_type: 'photo',
      purpose: 'public normalization — fem presenting outside the bedroom',
      platforms: ['twitter', 'fetlife', 'fansly'],
      difficulty: 4,
      vulnerability_tier: 4,
      instructions: {
        concept: 'out in public, fully dressed fem for errands',
        setting: 'car, parking lot, or neutral public setting',
        outfit: 'dress, heels, full makeup',
        lighting: 'daylight',
        framing: 'full body, face shown',
        expression: 'casual — not posing, just existing',
        technicalNotes: ['this is the hard one — public presentation', 'no explanation in the caption, just the photo'],
      },
    },
  ],
  'point-of-no-return': [
    {
      content_type: 'photo',
      purpose: 'maintenance — fem is the default, content is just documentation',
      platforms: ['twitter', 'fansly'],
      difficulty: 1,
      vulnerability_tier: 1,
      instructions: {
        concept: 'candid daily life — coffee, reading, at desk',
        setting: 'wherever you are',
        outfit: 'whatever you are wearing (which is fem, because that is now default)',
        lighting: 'natural',
        framing: 'candid-feeling',
        expression: 'not performing — just living',
        technicalNotes: ['one sentence caption about the day'],
      },
    },
  ],
  // ── FEMBOY AESTHETIC SEEDS — pulled when confessions/state lean femboy ──
  'femboy': [
    {
      content_type: 'photo',
      purpose: 'boy-shorts + thigh-highs baseline — the femboy uniform',
      platforms: ['twitter', 'fansly', 'fetlife'],
      difficulty: 2,
      vulnerability_tier: 2,
      instructions: {
        concept: 'the femboy uniform — boy shorts + thigh highs + oversized t-shirt, bare legs',
        setting: 'bedroom mirror or bed, soft light',
        outfit: 'tight boy shorts, thigh-high socks, oversized t-shirt (cropped or tucked)',
        lighting: 'natural window light or warm ring light',
        framing: 'full body mirror, knees together, weight on one hip',
        expression: 'soft, slightly shy, eyes down or half-lidded',
        poses: ['knees touching, hands at collar', 'sitting on edge of bed, legs together', 'standing side profile'],
        technicalNotes: ['shave legs day-of', 'face optional — focus is the silhouette'],
      },
    },
    {
      content_type: 'photo',
      purpose: 'crop top + bare midriff — waist-forward femboy content',
      platforms: ['twitter', 'fansly'],
      difficulty: 3,
      vulnerability_tier: 3,
      instructions: {
        concept: 'crop top + jean shorts or pleated skirt, waist + hip bones visible',
        setting: 'kitchen, bathroom mirror, or plain wall',
        outfit: 'white or pastel crop top (short), low-rise shorts or micro skirt, thigh highs optional',
        lighting: 'overhead or side light that defines waist',
        framing: 'torso + hips, three-quarter angle to show waist-to-hip curve',
        expression: 'bratty, slightly amused',
        poses: ['hand on hip, weight cocked', 'lifting shirt to show bare midriff', 'turning to show side profile'],
        technicalNotes: ['vacuum hold before shoot for tighter waist', 'phone slightly above for flattering angle'],
      },
    },
    {
      content_type: 'photo_set',
      purpose: 'smooth-body tease — full-body shave reveal + lingerie progression',
      platforms: ['fansly', 'onlyfans'],
      difficulty: 3,
      vulnerability_tier: 4,
      instructions: {
        concept: 'post-shave smooth body shoot — document the softness',
        setting: 'bathroom after shower, bedroom',
        outfit: 'progression: towel → thong + thigh-highs → just panties → bare legs',
        lighting: 'warm, intimate',
        framing: '3-5 photo set, each moving closer to reveal',
        expression: 'soft, vulnerable, intimate',
        poses: ['toweled, mirror selfie', 'sitting on edge of bed', 'side profile smooth legs', 'back to camera, looking over shoulder'],
        technicalNotes: ['full-body shave within 4h of shoot', 'baby oil on legs for shine'],
      },
    },
    {
      content_type: 'video',
      purpose: 'walking practice — femboy gait documentation',
      platforms: ['twitter', 'fansly'],
      difficulty: 3,
      vulnerability_tier: 3,
      instructions: {
        concept: '20-30 second clip of walking in femboy attire — hip sway, small steps',
        setting: 'hallway or bedroom with space',
        outfit: 'thigh highs + short shorts or skirt, oversized shirt',
        lighting: 'even, no harsh shadows',
        framing: 'full body, phone on stand, walking toward then away',
        expression: 'natural, focused on gait',
        script: 'No script. Walk to camera, turn, walk away. Heel-toe, one foot in front of the other.',
        duration: '20-30 seconds',
        technicalNotes: ['practice gait 5 min before recording', 'shoulders narrow, chin up, weight forward on balls of feet'],
      },
    },
    {
      content_type: 'photo',
      purpose: 'stockings + garter — layered lingerie femboy',
      platforms: ['fansly', 'onlyfans', 'fetlife'],
      difficulty: 3,
      vulnerability_tier: 4,
      instructions: {
        concept: 'stocking + garter belt shoot — classic fem lingerie on a boy body',
        setting: 'bedroom, intimate',
        outfit: 'black or nude stockings, garter belt, panties, nothing else (or thin cami)',
        lighting: 'moody side-lit',
        framing: 'hip-down and full-body variations',
        expression: 'knowing, slightly submissive',
        poses: ['seated edge of bed, legs crossed', 'kneeling, hands behind back', 'on stomach, looking back at camera'],
        technicalNotes: ['cage optional but visible adds tier', 'stocking tops must show above thighs'],
      },
    },
    {
      content_type: 'text',
      purpose: 'femboy journaling — reddit/fetlife post about the aesthetic pursuit',
      platforms: ['reddit', 'fetlife'],
      difficulty: 2,
      vulnerability_tier: 3,
      instructions: {
        concept: 'first-person narrative about wanting the femboy aesthetic — GLP-1, workout, HRT journey',
        setting: 'n/a',
        outfit: 'n/a',
        lighting: 'n/a',
        framing: 'n/a',
        expression: 'honest',
        script: '300-500 words: what you want to look like, what you\'re doing to get there, what it means to you. No apology, no hedging.',
        technicalNotes: ['include specific targets (waist, hips, ratio)', 'reference real Zepbound + HRT intent'],
      },
    },
  ],
};

function pickRandom<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

async function getNextBriefNumber(sb: SupabaseClient, userId: string): Promise<number> {
  const { data } = await sb
    .from('content_briefs')
    .select('brief_number')
    .eq('user_id', userId)
    .order('brief_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as any)?.brief_number ?? 0) + 1;
}

function calculateRewards(difficulty: number, vulnTier: number) {
  return {
    reward_money: difficulty * 2 + vulnTier * 3,
    reward_arousal: difficulty >= 3 ? 'guided edge session' : 'acknowledgment and streak credit',
    reward_edge_credits: difficulty >= 4 ? 2 : difficulty >= 3 ? 1 : 0,
    consequence_if_missed: {
      type: 'bleeding',
      amount: 0.25,
      description: `$0.25/min bleeding starts when deadline passes. Difficulty ${difficulty}, tier ${vulnTier}. Submit or pay.`,
    },
  };
}

export async function maybeGenerateBriefs(
  sb: SupabaseClient,
  userId: string,
  options: { minPending?: number; toCreate?: number } = {},
): Promise<number> {
  const minPending = options.minPending ?? 3;
  const toCreate = options.toCreate ?? 3;

  const { count: pendingCount } = await sb
    .from('content_briefs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['assigned', 'in_progress']);

  if ((pendingCount ?? 0) >= minPending) return 0;

  let band = 'early';
  try {
    const { data } = await sb.from('irreversibility_score')
      .select('score').eq('user_id', userId).maybeSingle();
    const score = data?.score ?? 0;
    band = score < 30 ? 'early' : score < 60 ? 'committed' : score < 80 ? 'hard-to-reverse' : 'point-of-no-return';
  } catch {}

  // Femboy aesthetic routing — if the user's body_targets preset is 'femboy'
  // OR recent confessions use femboy-coded language, 60% chance of pulling
  // from the femboy band directly instead of the irreversibility band.
  let useFemboyBand = false;
  try {
    const { data: targets } = await sb.from('body_targets').select('aesthetic_preset').eq('user_id', userId).maybeSingle();
    if ((targets?.aesthetic_preset as string) === 'femboy') useFemboyBand = Math.random() < 0.6;
    if (!useFemboyBand) {
      const { data: recentConf } = await sb.from('confessions')
        .select('response').eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
        .limit(10);
      const text = ((recentConf || []) as Array<Record<string, unknown>>)
        .map(r => (r.response as string) || '').join(' ').toLowerCase();
      if (/\b(femboy|twink|soft\s*boy|thigh\s*gap|slim\s*waist|boyish)\b/i.test(text)) {
        useFemboyBand = Math.random() < 0.5;
      }
    }
  } catch {}

  const templates = useFemboyBand ? SEEDS_BY_BAND['femboy'] : (SEEDS_BY_BAND[band] || SEEDS_BY_BAND['early']);

  // Dysphoria-aware personalization. Pull recent dysphoria logs + confessions
  // + state (denial day, arousal). When we have real signals, we customize
  // the brief's purpose + concept + outfit + framing to lean on her specific
  // body-part admissions. Without signals we fall back to pure template.
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [dysphRes, confRes, stateRes] = await Promise.all([
    sb.from('body_dysphoria_logs')
      .select('body_part, feeling, severity')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('severity', { ascending: false })
      .limit(10),
    sb.from('confessions')
      .select('response, sentiment')
      .eq('user_id', userId)
      .eq('is_key_admission', true)
      .gte('created_at', since)
      .limit(5),
    sb.from('user_state')
      .select('denial_day, current_arousal, chastity_locked, chastity_streak_days, gina_home')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  const dysphoriaParts = ((dysphRes.data || []) as Array<Record<string, unknown>>).map(d => ({
    part: d.body_part as string,
    severity: (d.severity as number) || 5,
  }));
  const topDysphoria = dysphoriaParts[0];
  const keyConf = (confRes.data || []) as Array<Record<string, unknown>>;
  const state = (stateRes.data || {}) as Record<string, unknown>;
  const denial = (state.denial_day as number) || 0;
  const arousal = (state.current_arousal as number) || 0;

  // Body-part → brief customization mappings
  const PART_TO_BRIEF: Record<string, { concept: string; outfit: string; framing: string; purpose: string }> = {
    chest: {
      concept: 'chest-focused shoot that weaponizes your admitted chest dysphoria into visible content',
      outfit: 'tight cami or bralette emphasizing any existing chest tissue; ring light from below',
      framing: 'mid-chest crop, lean forward slightly for compression',
      purpose: 'chest-forward content — you admitted the dysphoria, now you profit off it',
    },
    hair: {
      concept: 'face-smooth shoot immediately after a full shave — softness as feminization evidence',
      outfit: 'makeup forward, hair pulled back or styled long, neck + collarbones visible',
      framing: 'face + throat, soft light',
      purpose: 'face-smooth content, leveraging your shaving ritual as feminization',
    },
    face: {
      concept: 'face-work content — makeup reveal or face-tuning, your most dysphoric feature made visible',
      outfit: 'full makeup, hair styled',
      framing: 'close-up portrait, three-quarter angle',
      purpose: 'face-focused content — the part you hate most becomes the content',
    },
    lower_body: {
      concept: 'hips + waist ratio shoot emphasizing the feminine silhouette work',
      outfit: 'high-waisted skirt or thong with stockings, bare waist visible',
      framing: 'hip-up, side profile to show waist-to-hip curve',
      purpose: 'hip shape content — the feminization the workouts are earning',
    },
    voice: {
      concept: 'voice-forward audio — reading a short script at your target pitch',
      outfit: 'not visible, audio-only or voice + face',
      framing: 'audio + static body image',
      purpose: 'voice content at practiced pitch — public commitment to the feminization',
    },
    genitals: {
      concept: 'cage + panty shot — the locked sissy clit as evidence of your chosen reality',
      outfit: 'chastity cage (if locked) + feminine panties',
      framing: 'tight crop on cage/panties, face not required',
      purpose: 'caged sissy content — your body\'s current state is itself the aesthetic',
    },
    whole_body: {
      concept: 'full-body mirror shot that makes every dysphoric feature confront the camera',
      outfit: 'full lingerie set, visible from neck to ankle',
      framing: 'full-body mirror, face can be out-of-frame',
      purpose: 'full-body fem content — every inch catalogued',
    },
  };

  // Femboy aesthetic bias — if her confessions contain femboy-coded language,
  // shift the brief concept toward twink/soft-boy/smooth presentation instead
  // of traditional fem/woman framing.
  const confessionText = keyConf.map(c => (c.response as string) || '').join(' ').toLowerCase();
  const femboyBias = /\b(femboy|twink|soft\s*boy|pretty\s*boy|smooth|boyish|thigh\s*gap|slim\s*waist)\b/i.test(confessionText);
  const FEMBOY_OVERRIDE = {
    concept: 'femboy-aesthetic shoot — smooth skin, soft shoulders, boy face with girl body under the clothes',
    outfit: 'boy shorts or short denim, thigh-high socks, oversized shirt or crop top, bare stomach visible',
    framing: 'full body or three-quarter, knees together, weight on one hip, softly lit',
    purpose: 'femboy content — the in-between aesthetic she has been admitting she craves',
  };

  let briefNum = await getNextBriefNumber(sb, userId);
  let created = 0;

  for (let i = 0; i < toCreate; i++) {
    const seed = pickRandom(templates);
    if (!seed) continue;

    // Clone the seed so we can mutate for personalization
    let concept = seed.instructions.concept;
    let outfit = seed.instructions.outfit;
    let framing = seed.instructions.framing;
    let purpose = seed.purpose;
    const technicalNotes = [...(seed.instructions.technicalNotes || [])];

    // Personalize on dysphoria
    const useDysphoria = topDysphoria && Math.random() < 0.7;
    if (useDysphoria && PART_TO_BRIEF[topDysphoria.part]) {
      const custom = PART_TO_BRIEF[topDysphoria.part];
      concept = custom.concept;
      outfit = custom.outfit;
      framing = custom.framing;
      purpose = custom.purpose;
      technicalNotes.push(`Personalized on body_dysphoria_logs: ${topDysphoria.part} severity ${topDysphoria.severity}/10 in last 14d`);
    }
    // Femboy aesthetic override — applies after body-part customization when
    // her confessions show femboy-coded language
    if (femboyBias && Math.random() < 0.55) {
      concept = FEMBOY_OVERRIDE.concept;
      outfit = FEMBOY_OVERRIDE.outfit;
      framing = FEMBOY_OVERRIDE.framing;
      purpose = FEMBOY_OVERRIDE.purpose;
      technicalNotes.push('Femboy aesthetic bias from recent confessions');
    }
    // Reference a key confession as motivation
    if (keyConf.length > 0 && Math.random() < 0.5) {
      const conf = keyConf[0];
      technicalNotes.push(`Her own words (confession): "${(conf.response as string).slice(0, 140)}"`);
    }
    // High denial + high arousal → escalate vulnerability tier
    let personalizedVulnerability = seed.vulnerability_tier;
    if (denial >= 5 && arousal >= 3) {
      personalizedVulnerability = Math.min(10, seed.vulnerability_tier + 1);
      technicalNotes.push(`Denial day ${denial} + arousal ${arousal}/5 — vulnerability tier escalated`);
    }

    const deadlineHours = 4 + Math.floor(Math.random() * 8);
    const deadline = new Date(Date.now() + deadlineHours * 3600_000).toISOString();
    const rewards = calculateRewards(seed.difficulty, personalizedVulnerability);

    const { error } = await sb.from('content_briefs').insert({
      user_id: userId,
      brief_number: briefNum++,
      status: 'assigned',
      content_type: seed.content_type,
      purpose,
      platforms: seed.platforms,
      instructions: {
        ...seed.instructions,
        concept,
        outfit,
        framing,
        technicalNotes,
      },
      deadline,
      difficulty: seed.difficulty,
      vulnerability_tier: personalizedVulnerability,
      ...rewards,
    });
    if (!error) created++;
  }
  return created;
}

/**
 * Auto-fulfill text briefs via the forced-authorship pipeline.
 * Reads from content_production_briefs (the new table) where handler_draft
 * exists and deadline has passed.
 */
export async function autoFulfillTextBriefs(
  sb: SupabaseClient,
  userId: string,
  client: any,
): Promise<number> {
  const { data: textBriefs } = await sb
    .from('content_production_briefs')
    .select('id, brief_type, feminization_directives, caption_angle, target_platforms, narrative_beat, handler_draft, draft_deadline, scheduled_upload_by')
    .eq('user_id', userId)
    .eq('brief_type', 'text_only')
    .in('status', ['pending', 'awaiting_upload'])
    .order('scheduled_upload_by', { ascending: true, nullsFirst: false })
    .limit(5);

  if (!textBriefs || textBriefs.length === 0) return 0;

  const { buildMaxyVoiceSystem } = await import('./voice-system');
  const { extractSafeText } = await import('./refusal-filter');
  const now = Date.now();
  let fulfilled = 0;

  for (const brief of textBriefs) {
    try {
      if (!brief.handler_draft) {
        const flavor = (brief.target_platforms as string[])?.some(p => p === 'fetlife') ? 'fetlife' : 'post';
        const voice = await buildMaxyVoiceSystem(sb, userId, flavor as any);

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 700,
          system: `${voice}\n\nWrite a first-person personal narrative that is slightly more revealing and vulnerable than Maxy would normally write on her own. Push her comfort zone. 4-10 sentences. Lowercase, specific. This is a draft the Handler will present to Maxy as "post this or write your own version."`,
          messages: [{
            role: 'user',
            content: `Writing prompt: ${brief.caption_angle || 'reflect on where you are today'}\n${brief.narrative_beat ? `Theme: ${brief.narrative_beat}` : ''}\n\nOutput ONLY the text.`,
          }],
        });

        const draft = extractSafeText(response, 5, 'handler-draft');
        if (!draft) continue;

        const uploadBy = brief.scheduled_upload_by ? new Date(brief.scheduled_upload_by).getTime() : Infinity;
        const deadline = new Date(Math.min(now + 2 * 3600_000, uploadBy)).toISOString();

        await sb.from('content_production_briefs')
          .update({ handler_draft: draft, draft_deadline: deadline, status: 'awaiting_upload' })
          .eq('id', brief.id);

        console.log(`  [brief] Draft written for ${brief.id.slice(0, 8)} — Maxy has until ${deadline} to author her own`);
        continue;
      }

      const deadline = brief.draft_deadline ? new Date(brief.draft_deadline).getTime() : 0;
      if (deadline > now) continue;

      const { data: maxySubmission } = await sb.from('content_submissions')
        .select('id, asset_text').eq('brief_id', brief.id).eq('status', 'approved').maybeSingle();

      const finalText = maxySubmission?.asset_text || brief.handler_draft;
      const source = maxySubmission?.asset_text ? 'maxy_authored' : 'handler_draft_enforced';
      console.log(`  [brief] ${brief.id.slice(0, 8)} — ${source}`);

      if (!maxySubmission) {
        await sb.from('content_submissions').insert({
          user_id: userId,
          brief_id: brief.id,
          asset_type: 'text',
          asset_text: finalText,
          status: 'approved',
          compliance_score: 6,
          handler_notes: 'handler draft — Maxy did not author by deadline',
        });
      }

      await sb.from('content_production_briefs')
        .update({ status: 'ready_to_post' })
        .eq('id', brief.id);

      fulfilled++;
    } catch (err) {
      console.error(`[brief-auto] text fulfill failed:`, err instanceof Error ? err.message : err);
    }
  }
  return fulfilled;
}
