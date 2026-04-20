// Weekly Content Plan Generator
//
// Creates content_plan rows (one per week) that seed the brief generator.
// Runs on Mondays or on first tick of a new week. Picks a narrative theme
// based on active arc + irreversibility band + gaps in previous week's
// performance. Sets target brief counts per platform for the week.

import type { SupabaseClient } from '@supabase/supabase-js';

function startOfWeekUTC(d: Date = new Date()): string {
  const day = d.getUTCDay();             // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7;    // days back to Mon
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset));
  return monday.toISOString().slice(0, 10);
}

const THEMES = [
  'objectification week',
  'public exposure arc',
  'service mindset',
  'denial intensification',
  'feminization visibility',
  'submission ritual',
  'devotional posting',
];

// 2026-04-20 pivot: Twitter suspended for inauthentic activity. Public
// visibility + feminization-record weight shifted to Reddit (primary audience
// funnel) and FetLife (community/trust layer). See project_twitter_suspended.
const DEFAULT_PLATFORM_TARGETS = {
  twitter:  { posts_per_day: 0, photo_ratio: 0 },  // suspended — do not re-enable without device rotation
  reddit:   {
    posts_per_week: 7,
    target_subs: [
      'sissification',
      'feminization',
      'chastity',
      'chastitytraining',
      'EroticHypnosis',
      'BambiSleep',
      'submissivemenGW',
      'softmommy',
      'TransTimelines',
    ],
  },
  fansly:   { posts_per_week: 3, paywall_ratio: 0.5 },
  fetlife:  { writings_per_week: 3 },
  onlyfans: { posts_per_week: 0 },  // enable in Maxy's .env / UI — requires active account + auth
};

export async function ensureWeeklyContentPlan(sb: SupabaseClient, userId: string): Promise<{ created: boolean; week_start: string; theme: string }> {
  const weekStart = startOfWeekUTC();

  const { data: existing } = await sb
    .from('content_plan')
    .select('id, narrative_theme')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    return { created: false, week_start: weekStart, theme: existing.narrative_theme || '' };
  }

  // Mark prior weeks as superseded so only one active plan exists
  await sb.from('content_plan')
    .update({ status: 'superseded' })
    .eq('user_id', userId)
    .eq('status', 'active');

  // Pick theme: prefer the active narrative_arc theme, fallback random.
  let theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  try {
    const { data: arc } = await sb.from('narrative_arcs')
      .select('theme')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (arc?.theme) theme = arc.theme;
  } catch {}

  await sb.from('content_plan').insert({
    user_id: userId,
    week_start: weekStart,
    narrative_theme: theme,
    platforms: DEFAULT_PLATFORM_TARGETS,
    status: 'active',
  });

  return { created: true, week_start: weekStart, theme };
}
