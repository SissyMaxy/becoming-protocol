/**
 * Audit Alignment — grade auto-poster output against the Handler's plan.
 *
 * Reads ai_generated_content.generation_context (populated by reply-engine,
 * quote-tweet-engine, dm-outreach) and scores each row on three axes:
 *   - quality     — slop score, retries, refusals, pii suppressions
 *   - alignment   — does it match the active narrative arc / content plan
 *   - voice       — does voice_flavor match the target's nsfw flag
 *
 * Usage:
 *   npx tsx audit-alignment.ts              # last 50, all content types
 *   npx tsx audit-alignment.ts --limit 200
 *   npx tsx audit-alignment.ts --type reply
 *   npx tsx audit-alignment.ts --since 48h
 *   npx tsx audit-alignment.ts --fail-only  # only show rows that failed a check
 */

import 'dotenv/config';
import { supabase } from './config';
import type { GenerationContext } from './generation-context';

const USER_ID = process.env.USER_ID || '';

interface AgcRow {
  id: string;
  content_type: string;
  platform: string;
  content: string;
  status: string;
  target_account: string | null;
  generation_strategy: string | null;
  posted_at: string | null;
  created_at: string;
  generation_context: GenerationContext | null;
}

interface Grade {
  row: AgcRow;
  quality: number;    // 0-10
  alignment: number;  // 0-10
  voice: number;      // 0-10
  overall: number;    // 0-10 (weighted)
  flags: string[];
}

function parseArgs(): { limit: number; type?: string; sinceHours?: number; failOnly: boolean } {
  const args = process.argv.slice(2);
  let limit = 50;
  let type: string | undefined;
  let sinceHours: number | undefined;
  let failOnly = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit') limit = parseInt(args[++i], 10);
    else if (a === '--type') type = args[++i];
    else if (a === '--since') {
      const v = args[++i];
      const m = v.match(/^(\d+)([hd])$/);
      if (m) sinceHours = parseInt(m[1], 10) * (m[2] === 'd' ? 24 : 1);
    } else if (a === '--fail-only') failOnly = true;
  }

  return { limit, type, sinceHours, failOnly };
}

function gradeQuality(ctx: GenerationContext | null, row: AgcRow): { score: number; flags: string[] } {
  const flags: string[] = [];
  if (!ctx) {
    flags.push('no_context');
    return { score: 0, flags };
  }

  let score = 10;

  if (row.status === 'failed' || row.content === '[skipped]') {
    flags.push(`status:${row.status}`);
    if (ctx.notes) flags.push(`reason:${ctx.notes}`);
    return { score: 0, flags };
  }

  if (ctx.slop) {
    const s = ctx.slop.score;
    if (s < 9) { flags.push(`slop:${s}/10`); score -= (9 - s) * 2; }
    if (ctx.slop.attempts > 1) { flags.push(`retries:${ctx.slop.attempts}`); score -= (ctx.slop.attempts - 1); }
    if (ctx.slop.pattern_reasons.length > 0) flags.push(`patterns:${ctx.slop.pattern_reasons.length}`);
    if (ctx.slop.repetition_reasons.length > 0) flags.push(`repetition:${ctx.slop.repetition_reasons.length}`);
  } else if (['reply', 'quote_tweet', 'tweet', 'reddit_post', 'fetlife_post', 'caption'].includes(row.content_type)) {
    flags.push('no_slop_score');
    score -= 2;
  }

  if (ctx.refusal_detected) { flags.push('refusal'); score -= 3; }
  if (ctx.pii_action === 'suppress') { flags.push(`pii_suppress:${ctx.pii_reason}`); score -= 2; }

  return { score: Math.max(0, Math.min(10, score)), flags };
}

function gradeAlignment(ctx: GenerationContext | null): { score: number; flags: string[] } {
  const flags: string[] = [];
  if (!ctx) return { score: 0, flags: ['no_context'] };

  let score = 10;

  if (!ctx.handler_state) { flags.push('no_handler_state'); score -= 3; }
  if (!ctx.active_narrative_arc) { flags.push('no_active_arc'); score -= 2; }
  if (!ctx.active_content_plan) { flags.push('no_content_plan'); score -= 1; }
  if (!ctx.brief_id && (ctx.active_narrative_arc || ctx.active_content_plan)) {
    flags.push('no_brief_link');
    score -= 2;
  }

  return { score: Math.max(0, Math.min(10, score)), flags };
}

function gradeVoice(ctx: GenerationContext | null, row: AgcRow): { score: number; flags: string[] } {
  const flags: string[] = [];
  if (!ctx) return { score: 0, flags: ['no_context'] };

  let score = 10;
  const flavor = ctx.voice_flavor || '';
  const nsfwTarget = ctx.target?.nsfw;

  if (!flavor) { flags.push('no_voice_flavor'); return { score: 5, flags }; }

  if (row.content_type === 'reply') {
    if (nsfwTarget === true && flavor !== 'reply_nsfw') { flags.push(`flavor_mismatch:nsfw_target/${flavor}`); score -= 4; }
    if (nsfwTarget === false && flavor !== 'reply_sfw') { flags.push(`flavor_mismatch:sfw_target/${flavor}`); score -= 4; }
  } else if (row.content_type === 'quote_tweet' && flavor !== 'quote_tweet') {
    flags.push(`flavor_mismatch:qt/${flavor}`);
    score -= 4;
  } else if (row.content_type === 'dm_response') {
    if (nsfwTarget === true && flavor !== 'dm_cold_nsfw') { flags.push(`flavor_mismatch:nsfw_dm/${flavor}`); score -= 4; }
    if (nsfwTarget === false && flavor !== 'dm_cold_sfw') { flags.push(`flavor_mismatch:sfw_dm/${flavor}`); score -= 4; }
  } else if (['tweet', 'reddit_post', 'fetlife_post', 'caption'].includes(row.content_type)) {
    const expected = `post_${row.platform}`;
    if (flavor !== expected) { flags.push(`flavor_mismatch:${expected}/${flavor}`); score -= 3; }
  }

  return { score: Math.max(0, Math.min(10, score)), flags };
}

function gradeRow(row: AgcRow): Grade {
  const ctx = row.generation_context || null;
  const q = gradeQuality(ctx, row);
  const a = gradeAlignment(ctx);
  const v = gradeVoice(ctx, row);

  // Quality is highest-weight — a 4/10 slop reply is failing regardless of alignment.
  const overall = q.score * 0.5 + a.score * 0.25 + v.score * 0.25;

  return {
    row,
    quality: q.score,
    alignment: a.score,
    voice: v.score,
    overall: Math.round(overall * 10) / 10,
    flags: [...q.flags, ...a.flags, ...v.flags],
  };
}

function fmt(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width - 1) + '…';
  return s + ' '.repeat(width - s.length);
}

async function main() {
  if (!USER_ID) {
    console.error('Missing USER_ID');
    process.exit(1);
  }

  const { limit, type, sinceHours, failOnly } = parseArgs();

  let query = supabase
    .from('ai_generated_content')
    .select('id, content_type, platform, content, status, target_account, generation_strategy, posted_at, created_at, generation_context')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (type) query = query.eq('content_type', type);
  if (sinceHours) {
    const cutoff = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
    query = query.gte('created_at', cutoff);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log('No rows.');
    return;
  }

  const grades = (data as AgcRow[]).map(gradeRow);
  const shown = failOnly ? grades.filter(g => g.overall < 7) : grades;

  console.log(`\nAudit: ${data.length} rows (${type ? `type=${type} ` : ''}${sinceHours ? `since=${sinceHours}h ` : ''}${failOnly ? 'fail-only' : ''})\n`);
  console.log(fmt('when', 17), fmt('type', 14), fmt('target', 18), fmt('Q', 4), fmt('A', 4), fmt('V', 4), fmt('★', 5), 'flags / preview');
  console.log('─'.repeat(120));

  for (const g of shown) {
    const when = (g.row.posted_at || g.row.created_at).slice(5, 16).replace('T', ' ');
    const target = (g.row.target_account || '-').slice(0, 17);
    const preview = g.row.content.replace(/\s+/g, ' ').slice(0, 40);
    const flagStr = g.flags.length > 0 ? `[${g.flags.slice(0, 4).join(',')}] ` : '';
    console.log(
      fmt(when, 17),
      fmt(g.row.content_type, 14),
      fmt(target, 18),
      fmt(String(g.quality), 4),
      fmt(String(g.alignment), 4),
      fmt(String(g.voice), 4),
      fmt(String(g.overall), 5),
      flagStr + preview,
    );
  }

  // Summary stats over full population (not failOnly slice)
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const avgQ = avg(grades.map(g => g.quality));
  const avgA = avg(grades.map(g => g.alignment));
  const avgV = avg(grades.map(g => g.voice));
  const avgO = avg(grades.map(g => g.overall));
  const noCtx = grades.filter(g => !g.row.generation_context).length;

  console.log('\n── Summary ──');
  console.log(`  rows graded:           ${grades.length}`);
  console.log(`  missing context:       ${noCtx} (${Math.round((noCtx / grades.length) * 100)}%)`);
  console.log(`  avg quality:           ${avgQ.toFixed(1)}/10`);
  console.log(`  avg plan alignment:    ${avgA.toFixed(1)}/10`);
  console.log(`  avg voice alignment:   ${avgV.toFixed(1)}/10`);
  console.log(`  avg overall:           ${avgO.toFixed(1)}/10`);
  console.log(`  failing (<7 overall):  ${grades.filter(g => g.overall < 7).length}`);
  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
