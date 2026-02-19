/**
 * Handler Systems Context Builder
 *
 * Gathers context from ALL protocol systems and formats it for Handler AI prompts.
 * Every prompt builder in handler-ai.ts and handler-v2/ai-client.ts calls this.
 *
 * Format: compact, data-dense — matches existing corruption context block style.
 * The Handler needs numbers and state, not prose.
 */

import { getPipelineComposite } from './gina/ladder-engine';
import {
  getVaultStats,
  getTodaySchedule,
  getActiveArc,
  getRevenueSummary,
  getFanCount,
} from './content-pipeline';
import {
  getVoiceTrainingProgress,
  checkVoiceAvoidance,
} from './voice-training';
import { getActiveLiveSession } from './cam';
import { getCamStats, getUpcomingSessions, getRecentSessions } from './content/cam-engine';
import { getSleepStats } from './sleep-content';
import { getOrCreateStreak } from './exercise';
import { getHypnoSessionSummary } from './hypno-sessions';
import { getLibraryStats } from './hypno-library';
import { getConversationCounts } from './sexting/conversations';
import { getAutoSendStats, getEscalatedMessages } from './sexting/messaging';
import { getGfeRevenueSummary } from './sexting/gfe';
import { getListingStats } from './marketplace/listings';
import { getOrderStats } from './marketplace/orders';
import { getActiveAuctionCount } from './marketplace/auctions';
import { getDailyAggregate, getWeeklyTrend } from './passive-voice/aggregation';
import { getRecentInterventions } from './passive-voice/interventions';
import { buildDenialContentContext } from './industry/denial-content-bridge';

// ============================================
// TYPES
// ============================================

export interface SystemsContext {
  gina: string;
  content: string;
  voice: string;
  cam: string;
  sleep: string;
  exercise: string;
  hypno: string;
  sexting: string;
  marketplace: string;
  passiveVoice: string;
  denialContent: string;
}

// ============================================
// INDIVIDUAL CONTEXT BUILDERS
// ============================================

async function buildGinaContext(userId: string): Promise<string> {
  try {
    const composite = await getPipelineComposite(userId);
    if (composite.channelsStarted === 0) return '';

    return `GINA PIPELINE: avg rung ${composite.average.toFixed(1)}/5, ${composite.channelsStarted}/10 channels active, ${composite.channelsAtMax} maxed
  leading: ${composite.leading ? `${composite.leading.channel} R${composite.leading.rung}` : 'none'} | lagging: ${composite.lagging ? `${composite.lagging.channel} R${composite.lagging.rung}` : 'none'} | gap: ${composite.widestGap}`;
  } catch {
    return '';
  }
}

async function buildContentContext(userId: string): Promise<string> {
  try {
    const [vault, schedule, arc, revenue, fanCount] = await Promise.allSettled([
      getVaultStats(userId),
      getTodaySchedule(userId),
      getActiveArc(userId),
      getRevenueSummary(userId),
      getFanCount(userId),
    ]);

    const parts: string[] = [];

    const v = vault.status === 'fulfilled' ? vault.value : null;
    if (v) {
      parts.push(`CONTENT PIPELINE: vault ${v.pending} pending, ${v.approved} approved, ${v.distributed} distributed`);
    }

    const s = schedule.status === 'fulfilled' ? schedule.value : [];
    if (s.length > 0) {
      parts.push(`  today: ${s.length} posts scheduled`);
    }

    const a = arc.status === 'fulfilled' ? arc.value : null;
    if (a) {
      parts.push(`  arc: "${a.title}" (${a.arc_status})`);
    }

    const r = revenue.status === 'fulfilled' ? revenue.value : null;
    if (r && r.total_cents > 0) {
      parts.push(`  revenue: $${(r.total_cents / 100).toFixed(0)} total, $${(r.last_30d_cents / 100).toFixed(0)} last 30d, trend ${r.trend}`);
    }

    const fc = fanCount.status === 'fulfilled' ? fanCount.value : 0;
    if (fc > 0) {
      parts.push(`  fans: ${fc} tracked`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildVoiceContext(userId: string): Promise<string> {
  try {
    const [progress, avoidance] = await Promise.allSettled([
      getVoiceTrainingProgress(userId),
      checkVoiceAvoidance(userId),
    ]);

    const p = progress.status === 'fulfilled' ? progress.value : null;
    const av = avoidance.status === 'fulfilled' ? avoidance.value : null;

    if (!p) return '';

    const pitchStr = p.currentPitchHz
      ? `${p.currentPitchHz}Hz (target ${p.targetPitchHz}Hz)`
      : 'no baseline';

    const avoidStr = av && av.level !== 'none'
      ? ` — AVOIDANCE: ${av.level} (${av.daysSinceLastPractice}d)`
      : '';

    return `VOICE: L${p.voiceLevel} pitch ${pitchStr}, streak ${p.drillStreak}d, ${p.totalDrills} drills total${avoidStr}`;
  } catch {
    return '';
  }
}

async function buildCamContext(userId: string): Promise<string> {
  try {
    const [active, stats, upcoming, recent] = await Promise.allSettled([
      getActiveLiveSession(userId),
      getCamStats(userId),
      getUpcomingSessions(userId),
      getRecentSessions(userId, 1),
    ]);

    const parts: string[] = [];

    const a = active.status === 'fulfilled' ? active.value : null;
    if (a) {
      const elapsed = a.liveStartedAt
        ? Math.round((Date.now() - new Date(a.liveStartedAt).getTime()) / 60000)
        : 0;
      parts.push(`CAM: LIVE NOW (${a.status}) ${elapsed}min elapsed, ${a.edgeCount} edges, ${a.tipCount} tips`);
      if (a.denialEnforced) parts.push('  denial enforced');
    }

    const s = stats.status === 'fulfilled' ? stats.value : null;
    if (s && s.totalSessions > 0) {
      const prefix = a ? '  ' : 'CAM: ';
      parts.push(`${prefix}${s.totalSessions} sessions, $${(s.totalRevenueCents / 100).toFixed(0)} total revenue, avg ${s.avgDurationMinutes}min`);
    }

    // Next scheduled session
    const up = upcoming.status === 'fulfilled' ? upcoming.value : [];
    if (!a && up.length > 0) {
      const next = up[0];
      const when = next.scheduledAt
        ? new Date(next.scheduledAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
        : 'unscheduled';
      const denialNote = next.denialEnforced ? ' (denial enforced)' : '';
      const outfitNote = next.outfitDirective ? ` outfit: ${next.outfitDirective}` : '';
      parts.push(`  next: ${when}${denialNote}${outfitNote}`);
    }

    // Last session summary
    const rec = recent.status === 'fulfilled' ? recent.value : [];
    if (rec.length > 0) {
      const last = rec[0];
      const dur = last.actualDurationMinutes || 0;
      const rev = (last.totalTipsCents + last.totalPrivatesCents) / 100;
      parts.push(`  last: ${dur}min, $${rev.toFixed(0)}, ${last.edgeCount} edges, ${last.highlights.length} highlights`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildSleepContext(userId: string): Promise<string> {
  try {
    const stats = await getSleepStats(userId, 30);
    if (stats.totalSessions === 0) return '';

    const complianceRate = stats.totalSessions > 0
      ? Math.round((stats.compliantSessions / stats.totalSessions) * 100)
      : 0;

    return `SLEEP: ${stats.totalSessions} sessions (30d), ${complianceRate}% compliance, ${stats.totalAffirmationsHeard} affirmations heard, avg ${stats.avgSessionMinutes}min`;
  } catch {
    return '';
  }
}

async function buildExerciseContext(userId: string): Promise<string> {
  try {
    const streak = await getOrCreateStreak(userId);
    if (streak.totalSessions === 0 && streak.currentStreakWeeks === 0) return '';

    const gymStr = streak.gymGateUnlocked ? 'gym UNLOCKED' : 'gym locked';
    const daysSince = streak.lastSessionAt
      ? Math.floor((Date.now() - new Date(streak.lastSessionAt).getTime()) / 86400000)
      : 999;

    return `EXERCISE: Week ${streak.currentStreakWeeks} streak, ${streak.sessionsThisWeek}/3 this week, ${gymStr}${daysSince >= 3 ? ` — NO WORKOUT ${daysSince}d` : ''}`;
  } catch {
    return '';
  }
}

async function buildHypnoContext(userId: string): Promise<string> {
  try {
    const [summary, libStats] = await Promise.allSettled([
      getHypnoSessionSummary(userId),
      getLibraryStats(userId),
    ]);

    const s = summary.status === 'fulfilled' ? summary.value : null;
    const lib = libStats.status === 'fulfilled' ? libStats.value : null;

    if (!s && (!lib || lib.totalItems === 0)) return '';

    const parts: string[] = [];

    if (s && s.totalSessions > 0) {
      const completionRate = s.totalSessions > 0
        ? Math.round((s.completedSessions / s.totalSessions) * 100)
        : 0;
      parts.push(`HYPNO: ${s.totalSessions} sessions (30d: ${s.sessionsLast30Days}), ${completionRate}% completion, avg depth ${s.avgTranceDepth.toFixed(1)}, ${s.totalCaptures} captures from ${s.sessionsWithCaptures} sessions`);
      if (s.bypassSessions > 0) {
        parts.push(`  bypass sessions: ${s.bypassSessions}`);
      }
    }

    if (lib && lib.totalItems > 0) {
      const prefix = parts.length > 0 ? '  ' : 'HYPNO: ';
      parts.push(`${prefix}library: ${lib.totalItems} items, avg capture value ${lib.avgCaptureValue.toFixed(1)}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildSextingContext(userId: string): Promise<string> {
  try {
    const [counts, autoStats, escalated, gfeRevenue] = await Promise.allSettled([
      getConversationCounts(userId),
      getAutoSendStats(userId),
      getEscalatedMessages(userId),
      getGfeRevenueSummary(userId),
    ]);

    const c = counts.status === 'fulfilled' ? counts.value : { active: 0, escalated: 0, total: 0 };
    const a = autoStats.status === 'fulfilled' ? autoStats.value : { totalSent: 0, autoSent: 0, rate: 0 };
    const e = escalated.status === 'fulfilled' ? escalated.value : [];
    const g = gfeRevenue.status === 'fulfilled' ? gfeRevenue.value : { activeCount: 0, monthlyRevenueCents: 0, totalRevenueCents: 0 };

    if (c.total === 0 && g.activeCount === 0) return '';

    const parts: string[] = [];
    parts.push(`SEXTING: ${c.active} active conversations, ${g.activeCount} GFE subs ($${Math.round(g.monthlyRevenueCents / 100)}/mo), ${Math.round(a.rate * 100)}% auto-send rate`);

    if (e.length > 0 || g.totalRevenueCents > 0) {
      const escalatedStr = e.length > 0 ? `${e.length} messages pending David` : '';
      const revenueStr = g.totalRevenueCents > 0 ? `total revenue: $${Math.round(g.totalRevenueCents / 100)}` : '';
      parts.push(`  ${[escalatedStr, revenueStr].filter(Boolean).join(' | ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildMarketplaceContext(userId: string): Promise<string> {
  try {
    const [listingStats, orderStats, auctionCount] = await Promise.allSettled([
      getListingStats(userId),
      getOrderStats(userId),
      getActiveAuctionCount(userId),
    ]);

    const ls = listingStats.status === 'fulfilled' ? listingStats.value : { active: 0, totalListings: 0, byCategory: {} };
    const os = orderStats.status === 'fulfilled' ? orderStats.value : { pending: 0, pendingRevenueCents: 0, completed: 0, delivered: 0, totalRevenueCents: 0, avgOrderCents: 0 };
    const ac = auctionCount.status === 'fulfilled' ? auctionCount.value : 0;

    if (ls.totalListings === 0 && os.completed === 0) return '';

    const parts: string[] = [];
    parts.push(`MARKETPLACE: ${ls.active} active listings, ${os.pending} pending orders ($${Math.round(os.pendingRevenueCents / 100)}), ${os.completed} completed, $${Math.round(os.totalRevenueCents / 100)} total revenue`);

    const cats = Object.entries(ls.byCategory);
    const topCat = cats.length > 0 ? cats.sort((a, b) => b[1] - a[1])[0][0] : null;
    const details = [
      topCat ? `top category: ${topCat}` : '',
      os.avgOrderCents > 0 ? `avg order: $${Math.round(os.avgOrderCents / 100)}` : '',
      ac > 0 ? `auctions active: ${ac}` : '',
    ].filter(Boolean);

    if (details.length > 0) {
      parts.push(`  ${details.join(' | ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

async function buildPassiveVoiceContext(userId: string): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [todayAgg, weeklyTrend, interventions] = await Promise.allSettled([
      getDailyAggregate(userId, today),
      getWeeklyTrend(userId),
      getRecentInterventions(userId, 1),
    ]);

    const t = todayAgg.status === 'fulfilled' ? todayAgg.value : null;
    const w = weeklyTrend.status === 'fulfilled' ? weeklyTrend.value : [];
    const i = interventions.status === 'fulfilled' ? interventions.value : [];

    if (!t && w.length === 0) return '';

    const parts: string[] = [];

    if (t) {
      const targetStr = t.time_in_target_pct !== null ? `${Math.round(t.time_in_target_pct)}% time in target` : '';
      const durStr = `${Math.round(t.total_duration_seconds / 60)}min monitored`;
      parts.push(`PASSIVE VOICE: today avg ${t.avg_pitch_hz}Hz (target 190Hz), ${targetStr}, ${durStr}`);
    }

    if (w.length >= 2) {
      const hzValues = w.map((d) => d.avg_pitch_hz).filter((h): h is number => h !== null);
      if (hzValues.length >= 2) {
        const trendStr = hzValues.map((h) => Math.round(h)).join('→');
        const improving = hzValues[hzValues.length - 1] > hzValues[0];
        parts.push(`  7-day trend: ${trendStr}Hz (${improving ? 'improving' : 'declining'})${i.length > 0 ? ` | interventions today: ${i.length}` : ''}`);
      }
    } else if (i.length > 0) {
      parts.push(`  interventions today: ${i.length}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// MAIN CONTEXT BUILDERS
// ============================================

/**
 * Full systems context — for morning briefing and daily plan.
 * All systems, maximum data density.
 */
export async function buildFullSystemsContext(userId: string): Promise<string> {
  const [gina, content, voice, cam, sleep, exercise, hypno, sexting, marketplace, passiveVoice, denialContent] = await Promise.allSettled([
    buildGinaContext(userId),
    buildContentContext(userId),
    buildVoiceContext(userId),
    buildCamContext(userId),
    buildSleepContext(userId),
    buildExerciseContext(userId),
    buildHypnoContext(userId),
    buildSextingContext(userId),
    buildMarketplaceContext(userId),
    buildPassiveVoiceContext(userId),
    buildDenialContentContext(userId),
  ]);

  const blocks = [
    gina.status === 'fulfilled' ? gina.value : '',
    content.status === 'fulfilled' ? content.value : '',
    denialContent.status === 'fulfilled' ? denialContent.value : '',
    voice.status === 'fulfilled' ? voice.value : '',
    cam.status === 'fulfilled' ? cam.value : '',
    hypno.status === 'fulfilled' ? hypno.value : '',
    sexting.status === 'fulfilled' ? sexting.value : '',
    marketplace.status === 'fulfilled' ? marketplace.value : '',
    passiveVoice.status === 'fulfilled' ? passiveVoice.value : '',
    sleep.status === 'fulfilled' ? sleep.value : '',
    exercise.status === 'fulfilled' ? exercise.value : '',
  ].filter(Boolean);

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}

/**
 * Debrief context — for evening debrief.
 * Content pipeline performance, voice progress, exercise, sleep.
 */
export async function buildDebriefContext(userId: string): Promise<string> {
  const [content, voice, exercise, sleep, hypno, sexting, marketplace, passiveVoice, denialContent] = await Promise.allSettled([
    buildContentContext(userId),
    buildVoiceContext(userId),
    buildExerciseContext(userId),
    buildSleepContext(userId),
    buildHypnoContext(userId),
    buildSextingContext(userId),
    buildMarketplaceContext(userId),
    buildPassiveVoiceContext(userId),
    buildDenialContentContext(userId),
  ]);

  const blocks = [
    content.status === 'fulfilled' ? content.value : '',
    denialContent.status === 'fulfilled' ? denialContent.value : '',
    voice.status === 'fulfilled' ? voice.value : '',
    hypno.status === 'fulfilled' ? hypno.value : '',
    sexting.status === 'fulfilled' ? sexting.value : '',
    marketplace.status === 'fulfilled' ? marketplace.value : '',
    passiveVoice.status === 'fulfilled' ? passiveVoice.value : '',
    exercise.status === 'fulfilled' ? exercise.value : '',
    sleep.status === 'fulfilled' ? sleep.value : '',
  ].filter(Boolean);

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}

/**
 * Session context — for edge sessions and commitment extraction.
 * Voice avoidance (leverage), content revenue (motivation), Gina pipeline (escalation).
 */
export async function buildSessionContext(userId: string): Promise<string> {
  const [gina, voice, content] = await Promise.allSettled([
    buildGinaContext(userId),
    buildVoiceContext(userId),
    buildContentContext(userId),
  ]);

  const blocks = [
    gina.status === 'fulfilled' ? gina.value : '',
    voice.status === 'fulfilled' ? voice.value : '',
    content.status === 'fulfilled' ? content.value : '',
  ].filter(Boolean);

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}

/**
 * Intervention context — for pop-ups, task enhancement, interventions.
 * Compact subset: voice avoidance, exercise gap, content pending.
 */
export async function buildInterventionContext(userId: string): Promise<string> {
  const [voice, exercise, content] = await Promise.allSettled([
    buildVoiceContext(userId),
    buildExerciseContext(userId),
    buildContentContext(userId),
  ]);

  const blocks = [
    voice.status === 'fulfilled' ? voice.value : '',
    exercise.status === 'fulfilled' ? exercise.value : '',
    content.status === 'fulfilled' ? content.value : '',
  ].filter(Boolean);

  if (blocks.length === 0) return '';
  return '\n' + blocks.join('\n');
}
