/**
 * Content Intelligence Context Builder
 * Formats strategy state + performance data for Handler AI prompts.
 * Dense, data-driven — the Handler sees everything Maxy doesn't.
 */

import { getContentStrategy, getUnloggedPostCount, getQuickPerformanceSummary } from './content-intelligence';

// ============================================
// FULL INTELLIGENCE CONTEXT (for Handler AI)
// ============================================

export async function buildContentIntelligenceContext(userId: string): Promise<string> {
  try {
    const strategy = await getContentStrategy(userId);
    if (!strategy) return '';

    const parts: string[] = [];
    const analysisAge = Math.floor(
      (Date.now() - new Date(strategy.lastAnalyzedAt).getTime()) / 86400000,
    );

    parts.push(`CONTENT INTELLIGENCE (analyzed ${analysisAge}d ago):`);

    // Platform performance
    const platforms = Object.entries(strategy.platformPerformance);
    if (platforms.length > 0) {
      parts.push('  PLATFORM PERFORMANCE:');
      for (const [platform, perf] of platforms) {
        const bestTypeStr = perf.best_type ? `, best: ${perf.best_type}` : '';
        const bestHourStr = perf.best_hour !== null ? `, peak: ${perf.best_hour}:00` : '';
        parts.push(`  - ${platform}: avg ${perf.avg_views} views, ${(perf.avg_engagement * 100).toFixed(1)}% eng${bestTypeStr}${bestHourStr} (${perf.post_count} posts)`);
      }
    }

    // Content type rankings
    const types = Object.entries(strategy.contentTypePerformance)
      .filter(([, v]) => v.count >= 2)
      .sort(([, a], [, b]) => b.avg_engagement - a.avg_engagement);

    if (types.length > 0) {
      parts.push('  CONTENT TYPE RANKINGS:');
      types.forEach(([type, perf], i) => {
        const skipEntry = strategy.skipPatterns[type];
        const skipStr = skipEntry ? `, ${Math.round(skipEntry.skip_rate * 100)}% skip` : '';
        parts.push(`  ${i + 1}. ${type}: ${(perf.avg_engagement * 100).toFixed(1)}% eng, $${perf.avg_revenue.toFixed(2)} avg rev${skipStr} (${perf.count} posts)`);
      });
    }

    // Timing
    const timing = strategy.timingPerformance;
    if (timing.best_hours.length > 0 || timing.best_days.length > 0) {
      parts.push('  TIMING:');
      if (timing.best_hours.length > 0) {
        parts.push(`  - Best hours: ${timing.best_hours.map(h => `${h}:00`).join(', ')}`);
      }
      if (timing.worst_hours.length > 0) {
        parts.push(`  - Worst hours: ${timing.worst_hours.map(h => `${h}:00`).join(', ')}`);
      }
      if (timing.best_days.length > 0) {
        parts.push(`  - Best days: ${timing.best_days.join(', ')}`);
      }
    }

    // Denial day correlation
    const denialEntries = Object.entries(strategy.denialDayPerformance)
      .filter(([, v]) => v.count >= 2);

    if (denialEntries.length > 0) {
      parts.push('  DENIAL DAY CORRELATION:');
      for (const [bucket, perf] of denialEntries) {
        parts.push(`  - Day ${bucket}: ${(perf.avg_engagement * 100).toFixed(1)}% eng (${perf.count} posts)`);
      }

      // Auto-generate insight
      const day5 = strategy.denialDayPerformance['5+'];
      const day12 = strategy.denialDayPerformance['1-2'];
      if (day5 && day12 && day5.avg_engagement > day12.avg_engagement * 1.5) {
        const ratio = Math.round(day5.avg_engagement / day12.avg_engagement);
        parts.push(`  INSIGHT: Day 5+ content gets ${ratio}x engagement. Save premium shoots for peak denial.`);
      }
    }

    // Skip patterns
    const skipEntries = Object.entries(strategy.skipPatterns)
      .filter(([, v]) => v.total >= 3);

    if (skipEntries.length > 0) {
      parts.push('  SKIP PATTERNS:');
      for (const [type, entry] of skipEntries) {
        const topReasons = Object.entries(entry.reasons)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 2)
          .map(([r]) => r);
        const reasonStr = topReasons.length > 0 ? ` (${topReasons.join(', ')})` : '';
        parts.push(`  - ${type}: ${Math.round(entry.skip_rate * 100)}% skip rate${reasonStr}`);
      }

      // Auto-generate insight
      const sorted = skipEntries.sort(([, a], [, b]) => a.skip_rate - b.skip_rate);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best && worst && worst[1].skip_rate > 0.5) {
        parts.push(`  INSIGHT: She completes ${best[0]} ${Math.round((1 - best[1].skip_rate) * 100)}% of the time. ${worst[0]} only ${Math.round((1 - worst[1].skip_rate) * 100)}%. Prescribe more ${best[0]}.`);
      }
    }

    // Revenue
    if (strategy.weeklyRevenue > 0 || strategy.monthlyRevenue > 0) {
      parts.push('  REVENUE:');
      parts.push(`  - This week: $${strategy.weeklyRevenue.toFixed(0)}`);
      parts.push(`  - This month: $${strategy.monthlyRevenue.toFixed(0)}`);
      parts.push(`  - Trend: ${strategy.revenueTrend}`);
      if (strategy.revenuePerHourOfEffort) {
        parts.push(`  - Per hour of effort: $${strategy.revenuePerHourOfEffort.toFixed(2)}`);
      }
    }

    // Recommendations
    const recParts: string[] = [];
    if (Object.keys(strategy.recommendedPlatformMix).length > 0) {
      const mix = Object.entries(strategy.recommendedPlatformMix)
        .sort(([, a], [, b]) => b - a)
        .map(([p, w]) => `${p} ${Math.round(w * 100)}%`)
        .join(', ');
      recParts.push(`Platform mix: ${mix}`);
    }
    if (Object.keys(strategy.recommendedPostingTimes).length > 0) {
      const times = Object.entries(strategy.recommendedPostingTimes)
        .map(([p, hrs]) => `${p}: ${hrs.map(h => `${h}:00`).join(',')}`)
        .join('; ');
      recParts.push(`Post times: ${times}`);
    }

    if (recParts.length > 0) {
      parts.push('  RECOMMENDATIONS:');
      for (const r of recParts) {
        parts.push(`  - ${r}`);
      }
    }

    // Unlogged posts check
    const unlogged = await getUnloggedPostCount(userId);
    if (unlogged >= 3) {
      parts.push(`  ACTION: ${unlogged} posts need performance logging. Prescribe "Check your numbers" today.`);
    }

    parts.push('');
    parts.push('USE THIS DATA: Prescribe shoot types that get completed AND perform well. Schedule premium content for denial 5+ windows. Never prescribe a shoot type with >70% skip rate unless deliberately pushing a boundary.');

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// CALENDAR CONTEXT (for Handler daily prescriptions)
// ============================================

export async function buildCalendarContext(userId: string): Promise<string> {
  try {
    const strategy = await getContentStrategy(userId);
    if (!strategy || !strategy.weeklyPlan || Object.keys(strategy.weeklyPlan).length === 0) return '';

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = dayNames[new Date().getDay()];

    const parts: string[] = [];
    parts.push('CONTENT CALENDAR THIS WEEK:');

    let completed = 0;
    let skipped = 0;
    let pending = 0;

    for (const day of dayNames) {
      const plan = strategy.weeklyPlan[day];
      if (!plan) continue;
      const status = plan.status || 'pending';
      const isToday = day === today;
      const marker = isToday ? ' <<<' : '';
      const shootStr = plan.shoot ? `shoot: ${plan.shoot}` : `type: ${plan.type}`;

      parts.push(`  ${day.slice(0, 3)}: ${shootStr} → ${plan.platform} @ ${plan.post_time}:00 [${status}]${marker}`);

      if (status === 'done') completed++;
      else if (status === 'skipped') skipped++;
      else pending++;
    }

    parts.push(`  Progress: ${completed} done, ${skipped} skipped, ${pending} pending`);

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// MORNING BRIEFING SURFACE (obfuscation layer)
// ============================================

export async function buildOvernightSummaryForBriefing(userId: string): Promise<string> {
  try {
    const summary = await getQuickPerformanceSummary(userId);
    if (summary.weeklyViews === 0 && summary.weeklyNewFollowers === 0) return '';

    const parts: string[] = [];
    parts.push('OVERNIGHT PERFORMANCE:');

    if (summary.topPostThisWeek) {
      parts.push(`  Top post: ${summary.topPostThisWeek.type} on ${summary.topPostThisWeek.platform} — ${summary.topPostThisWeek.views} views, ${summary.topPostThisWeek.likes} likes`);
    }

    parts.push(`  Weekly: ${summary.weeklyViews} views, ${summary.weeklyNewFollowers} new followers, $${summary.weeklyRevenue.toFixed(0)} revenue`);
    parts.push(`  Trend: ${summary.trend}`);

    // Surface instruction for Handler
    if (summary.weeklyViews > 0) {
      parts.push(`  SURFACE TO MAXY: "${summary.weeklyViews} people saw her this week. ${summary.weeklyNewFollowers > 0 ? `${summary.weeklyNewFollowers} new followers.` : ''} She's real to all of them."`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
