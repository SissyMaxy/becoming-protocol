/**
 * Performance Insights — cross-references engagement × grader × reactions × context
 * to answer the real questions about what works.
 *
 * Three signals now exist independently:
 *   - engagement_likes / engagement_comments  (external human reaction)
 *   - content_grades.overall                  (automated quality grader)
 *   - maxy_reaction (up/down)                 (Maxy's subjective judgment)
 *
 * This file cross-correlates them against generation_context (voice_flavor,
 * narrative_arc, subreddit, target, handler_mode, escalation_level).
 *
 * Run:
 *   npm run insights              # default 14d window, all surfaces
 *   npm run insights --since 7d
 *   npm run insights --platform reddit
 *   npm run insights --digest     # Handler-voice summary for weekly push
 */

import 'dotenv/config';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

interface AgcWithGrade {
  id: string;
  platform: string;
  content_type: string;
  target_account: string | null;
  target_subreddit: string | null;
  generation_strategy: string | null;
  content: string;
  posted_at: string | null;
  created_at: string;
  engagement_likes: number | null;
  engagement_comments: number | null;
  engagement_last_updated: string | null;
  generation_context: Record<string, unknown> | null;
  maxy_reaction: 'up' | 'down' | 'skip' | null;
  quality?: number;
  alignment?: number;
  voice?: number;
  overall?: number;
}

function parseArgs(): { sinceHours: number; platform?: string; digest: boolean } {
  const args = process.argv.slice(2);
  let sinceHours = 14 * 24;
  let platform: string | undefined;
  let digest = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--since') {
      const v = args[++i];
      const m = v.match(/^(\d+)([hd])$/);
      if (m) sinceHours = parseInt(m[1], 10) * (m[2] === 'd' ? 24 : 1);
    } else if (a === '--platform') platform = args[++i];
    else if (a === '--digest') digest = true;
  }
  return { sinceHours, platform, digest };
}

async function loadData(sinceHours: number, platform?: string): Promise<AgcWithGrade[]> {
  const cutoff = new Date(Date.now() - sinceHours * 3600_000).toISOString();

  let q = supabase
    .from('ai_generated_content')
    .select('id, platform, content_type, target_account, target_subreddit, generation_strategy, content, posted_at, created_at, engagement_likes, engagement_comments, engagement_last_updated, generation_context, maxy_reaction')
    .eq('user_id', USER_ID)
    .eq('status', 'posted')
    .gte('created_at', cutoff)
    .limit(500);
  if (platform) q = q.eq('platform', platform);

  const { data: agc } = await q;
  if (!agc || agc.length === 0) return [];

  const ids = agc.map(r => r.id);
  const { data: grades } = await supabase
    .from('content_grades')
    .select('content_id, quality, alignment, voice, overall')
    .in('content_id', ids);
  const gradeByContent = new Map<string, { quality: number; alignment: number; voice: number; overall: number }>();
  for (const g of grades || []) {
    gradeByContent.set(g.content_id, g);
  }

  return agc.map(r => ({
    ...r,
    ...(gradeByContent.get(r.id) || {}),
  }) as AgcWithGrade);
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function correlation(xs: number[], ys: number[]): number {
  // Pearson correlation for two numeric arrays of equal length.
  if (xs.length !== ys.length || xs.length < 3) return 0;
  const mx = average(xs), my = average(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const ax = xs[i] - mx, ay = ys[i] - my;
    num += ax * ay;
    dx += ax * ax;
    dy += ay * ay;
  }
  const denom = Math.sqrt(dx * dy);
  if (denom === 0) return 0;
  return Math.round((num / denom) * 100) / 100;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function groupBy<T>(rows: T[], keyFn: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

function coverageReport(rows: AgcWithGrade[]) {
  const n = rows.length;
  const withGrade = rows.filter(r => r.overall !== undefined).length;
  const withEng = rows.filter(r => (r.engagement_likes ?? 0) > 0 || (r.engagement_comments ?? 0) > 0).length;
  const withReaction = rows.filter(r => r.maxy_reaction && r.maxy_reaction !== 'skip').length;
  const withContext = rows.filter(r => r.generation_context).length;
  console.log('\n─── Data coverage ───');
  console.log(`  Posted rows:        ${n}`);
  console.log(`  With grade:         ${withGrade} (${Math.round((withGrade / n) * 100)}%)`);
  console.log(`  With engagement:    ${withEng} (${Math.round((withEng / n) * 100)}%)`);
  console.log(`  With Maxy's ±:      ${withReaction} (${Math.round((withReaction / n) * 100)}%)`);
  console.log(`  With full context:  ${withContext} (${Math.round((withContext / n) * 100)}%)`);
}

function byPlatform(rows: AgcWithGrade[]) {
  console.log('\n─── By platform ───');
  console.log(`  Platform    Count  AvgGrade  AvgLikes  AvgReplies  👍  👎`);
  for (const [plat, rs] of groupBy(rows, r => r.platform)) {
    const avgG = average(rs.filter(r => r.overall !== undefined).map(r => r.overall!));
    const avgL = average(rs.map(r => r.engagement_likes || 0));
    const avgC = average(rs.map(r => r.engagement_comments || 0));
    const ups = rs.filter(r => r.maxy_reaction === 'up').length;
    const downs = rs.filter(r => r.maxy_reaction === 'down').length;
    console.log(`  ${plat.padEnd(11)} ${String(rs.length).padEnd(6)} ${fmt(avgG).padEnd(9)} ${fmt(avgL).padEnd(9)} ${fmt(avgC).padEnd(11)} ${String(ups).padEnd(3)} ${downs}`);
  }
}

function bySubreddit(rows: AgcWithGrade[]) {
  const reddit = rows.filter(r => r.platform === 'reddit');
  if (reddit.length === 0) return;
  console.log('\n─── By subreddit ───');
  console.log(`  Subreddit             Count  AvgGrade  AvgLikes  AvgReplies`);
  const grouped = groupBy(reddit, r => r.target_subreddit || r.target_account || '?');
  const ranked = [...grouped.entries()]
    .map(([sub, rs]) => ({
      sub,
      count: rs.length,
      avgGrade: average(rs.filter(r => r.overall !== undefined).map(r => r.overall!)),
      avgLikes: average(rs.map(r => r.engagement_likes || 0)),
      avgReplies: average(rs.map(r => r.engagement_comments || 0)),
    }))
    .sort((a, b) => b.avgLikes - a.avgLikes);
  for (const r of ranked.slice(0, 15)) {
    console.log(`  ${r.sub.padEnd(22)} ${String(r.count).padEnd(6)} ${fmt(r.avgGrade).padEnd(9)} ${fmt(r.avgLikes).padEnd(9)} ${fmt(r.avgReplies)}`);
  }
}

function byVoiceFlavor(rows: AgcWithGrade[]) {
  const withFlavor = rows.filter(r => r.generation_context && (r.generation_context as any).voice_flavor);
  if (withFlavor.length < 3) return;
  console.log('\n─── By voice flavor ───');
  console.log(`  Flavor                Count  AvgGrade  AvgEng   👍/👎`);
  const grouped = groupBy(withFlavor, r => String((r.generation_context as any).voice_flavor));
  const ranked = [...grouped.entries()]
    .map(([flavor, rs]) => ({
      flavor,
      count: rs.length,
      avgGrade: average(rs.filter(r => r.overall !== undefined).map(r => r.overall!)),
      avgEng: average(rs.map(r => (r.engagement_likes || 0) + (r.engagement_comments || 0))),
      ups: rs.filter(r => r.maxy_reaction === 'up').length,
      downs: rs.filter(r => r.maxy_reaction === 'down').length,
    }))
    .sort((a, b) => b.avgEng - a.avgEng);
  for (const r of ranked) {
    const ratio = `${r.ups}/${r.downs}`;
    console.log(`  ${r.flavor.padEnd(22)} ${String(r.count).padEnd(6)} ${fmt(r.avgGrade).padEnd(9)} ${fmt(r.avgEng).padEnd(8)} ${ratio}`);
  }
}

function correlations(rows: AgcWithGrade[]) {
  const withBoth = rows.filter(r => r.overall !== undefined && ((r.engagement_likes ?? 0) > 0 || (r.engagement_comments ?? 0) > 0));
  if (withBoth.length < 5) {
    console.log('\n─── Correlations ───');
    console.log(`  Not enough rows with both grade AND engagement (${withBoth.length}) — need 5+.`);
    return;
  }
  const grades = withBoth.map(r => r.overall!);
  const likes = withBoth.map(r => r.engagement_likes || 0);
  const replies = withBoth.map(r => r.engagement_comments || 0);
  const engTotal = withBoth.map((r, i) => likes[i] + replies[i]);

  console.log('\n─── Signal correlations ───');
  console.log(`  n=${withBoth.length}`);
  console.log(`  grade × likes:          r = ${fmt(correlation(grades, likes), 2)}`);
  console.log(`  grade × replies:        r = ${fmt(correlation(grades, replies), 2)}`);
  console.log(`  grade × total_engage:   r = ${fmt(correlation(grades, engTotal), 2)}`);
}

function reactionAgreement(rows: AgcWithGrade[]) {
  const withBoth = rows.filter(r => r.maxy_reaction && r.maxy_reaction !== 'skip' && r.overall !== undefined);
  if (withBoth.length < 3) return;
  const ups = withBoth.filter(r => r.maxy_reaction === 'up');
  const downs = withBoth.filter(r => r.maxy_reaction === 'down');
  console.log('\n─── Grader vs. Maxy agreement ───');
  console.log(`  Maxy 👍 rows (n=${ups.length}):   avg grader score ${fmt(average(ups.map(r => r.overall!)))}`);
  console.log(`  Maxy 👎 rows (n=${downs.length}): avg grader score ${fmt(average(downs.map(r => r.overall!)))}`);
  const delta = average(ups.map(r => r.overall!)) - average(downs.map(r => r.overall!));
  if (Math.abs(delta) < 0.8) {
    console.log(`  ⚠ Grader doesn't discriminate Maxy's 👍 vs 👎 (Δ=${fmt(delta)}) — grader may need tuning`);
  } else if (delta > 0) {
    console.log(`  ✓ Grader aligns with Maxy (Δ=${fmt(delta)}) — higher grade predicts 👍`);
  } else {
    console.log(`  ⚠ Grader INVERTED vs Maxy (Δ=${fmt(delta)}) — grader penalizes what she likes`);
  }
}

function topBottom(rows: AgcWithGrade[]) {
  const ranked = [...rows]
    .filter(r => ((r.engagement_likes ?? 0) + (r.engagement_comments ?? 0)) > 0)
    .sort((a, b) => {
      const ea = (a.engagement_likes || 0) + (a.engagement_comments || 0);
      const eb = (b.engagement_likes || 0) + (b.engagement_comments || 0);
      return eb - ea;
    });
  if (ranked.length === 0) return;
  console.log('\n─── Top 5 by engagement ───');
  for (const r of ranked.slice(0, 5)) {
    const eng = (r.engagement_likes || 0) + (r.engagement_comments || 0);
    const target = r.target_subreddit || r.target_account || '-';
    console.log(`  ${r.platform}/${target} · ${eng} eng · ${(r.content || '').slice(0, 70).replace(/\n/g, ' ')}`);
  }
  if (ranked.length >= 10) {
    console.log('\n─── Bottom 5 (posted but dead) ───');
    for (const r of ranked.slice(-5).reverse()) {
      const eng = (r.engagement_likes || 0) + (r.engagement_comments || 0);
      const target = r.target_subreddit || r.target_account || '-';
      console.log(`  ${r.platform}/${target} · ${eng} eng · ${(r.content || '').slice(0, 70).replace(/\n/g, ' ')}`);
    }
  }
}

/**
 * Handler-voice digest for weekly push into handler_attention.
 */
export async function runWeeklyDigest(): Promise<string | null> {
  const rows = await loadData(7 * 24);
  if (rows.length === 0) return null;

  const byPlat = groupBy(rows, r => r.platform);
  const lines: string[] = [];
  lines.push(`Weekly performance — ${rows.length} posts last 7d.`);

  // Top platform by engagement
  let bestPlat = '', bestEng = -1;
  for (const [plat, rs] of byPlat) {
    const eng = average(rs.map(r => (r.engagement_likes || 0) + (r.engagement_comments || 0)));
    if (eng > bestEng) { bestPlat = plat; bestEng = eng; }
  }
  if (bestPlat) lines.push(`Highest engagement: ${bestPlat} (${fmt(bestEng)} avg).`);

  // Grader vs Maxy disagreement
  const withBoth = rows.filter(r => r.maxy_reaction && r.maxy_reaction !== 'skip' && r.overall !== undefined);
  if (withBoth.length >= 3) {
    const ups = withBoth.filter(r => r.maxy_reaction === 'up');
    const downs = withBoth.filter(r => r.maxy_reaction === 'down');
    const delta = average(ups.map(r => r.overall!)) - average(downs.map(r => r.overall!));
    if (Math.abs(delta) < 0.8) {
      lines.push(`Grader not discriminating Maxy's 👍/👎 (Δ=${fmt(delta)}) — audit the grader weights.`);
    }
  }

  // Dead subreddits — posted but zero engagement 7+ days
  const deadSubs: string[] = [];
  for (const [sub, rs] of groupBy(rows.filter(r => r.platform === 'reddit'), r => r.target_subreddit || '?')) {
    if (rs.length >= 2 && rs.every(r => (r.engagement_likes || 0) === 0)) {
      deadSubs.push(sub);
    }
  }
  if (deadSubs.length > 0) {
    lines.push(`Dead subreddits (posted ≥2×, all zero): ${deadSubs.slice(0, 5).join(', ')} — drop from plan.`);
  }

  return lines.join(' ');
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const { sinceHours, platform, digest } = parseArgs();

  if (digest) {
    const d = await runWeeklyDigest();
    console.log(d || '(no data for digest)');
    return;
  }

  console.log(`Performance insights — last ${sinceHours}h${platform ? ` — platform=${platform}` : ''}`);
  const rows = await loadData(sinceHours, platform);
  if (rows.length === 0) {
    console.log('(no rows in window)');
    return;
  }

  coverageReport(rows);
  byPlatform(rows);
  bySubreddit(rows);
  byVoiceFlavor(rows);
  correlations(rows);
  reactionAgreement(rows);
  topBottom(rows);
  console.log();
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
