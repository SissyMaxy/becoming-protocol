/**
 * Identity Language Drift Tracking (P10.4)
 *
 * Tracks feminine/masculine language ratios across Handler conversations.
 * Scans messages for pronoun usage, name self-references, embodied language,
 * and masculine regression markers. Accumulates daily metrics and provides
 * trend analysis for Handler context.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface LanguageAnalysis {
  femininePronounCount: number;
  masculinePronounCount: number;
  nameReferences: number;
  embodiedLanguage: number;
  regressionMarkers: number;
  totalWords: number;
}

export interface LanguageTrend {
  trend: 'rising' | 'stable' | 'falling';
  currentRatio: number;
  previousRatio: number;
  percentageChange: number;
}

// ============================================
// WORD LISTS
// ============================================

/** Feminine self-reference pronouns (case-insensitive match) */
const FEMININE_PRONOUNS = ['she', 'her', 'herself', 'hers'];

/** Masculine self-reference pronouns (case-insensitive match) */
const MASCULINE_PRONOUNS = ['he', 'him', 'his', 'himself'];

/** Name self-references */
const NAME_PATTERNS = [
  /\bmaxy\b/i,
  /\bi'?m\s+maxy\b/i,
  /\bas\s+maxy\b/i,
  /\bmaxy\s+(is|was|does|feels|wants|needs|loves)\b/i,
];

/** Embodied language markers */
const EMBODIED_WORDS = [
  'feel', 'feeling', 'felt',
  'body', 'skin', 'wore', 'wearing', 'wear',
  'dressed', 'dress', 'dressing',
  'looked in the mirror', 'mirror',
  'lips', 'hair', 'nails', 'makeup',
  'heels', 'panties', 'bra', 'lingerie',
  'smooth', 'soft', 'pretty', 'beautiful',
  'feminine', 'girly', 'cute',
];

/** Masculine regression markers */
const REGRESSION_MARKERS = [
  /\bdavid\b/i,
  /\bthe\s+old\s+me\b/i,
  /\bguy\b/i,
  /\bman\b/i,
  /\bdude\b/i,
  /\bbro\b/i,
  /\bmale\b/i,
  /\bmasculine\b/i,
  /\bused\s+to\s+be\b/i,
  /\bbefore\s+(all\s+)?this\b/i,
];

// ============================================
// ANALYSIS
// ============================================

/**
 * Scan a message for identity language markers.
 * Returns counts of feminine/masculine pronouns, name references,
 * embodied language, and regression markers.
 */
export function analyzeConversationLanguage(
  _userId: string,
  messageText: string,
): LanguageAnalysis {
  const text = messageText.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  // Count feminine pronouns used in self-reference context
  let femininePronounCount = 0;
  for (const word of words) {
    if (FEMININE_PRONOUNS.includes(word)) {
      femininePronounCount++;
    }
  }

  // Count masculine pronouns
  let masculinePronounCount = 0;
  for (const word of words) {
    if (MASCULINE_PRONOUNS.includes(word)) {
      masculinePronounCount++;
    }
  }

  // Count name self-references
  let nameReferences = 0;
  for (const pattern of NAME_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, 'gi'));
    if (matches) nameReferences += matches.length;
  }

  // Count embodied language
  let embodiedLanguage = 0;
  for (const word of EMBODIED_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(`\\b${escaped}\\b`, 'gi'));
    if (matches) embodiedLanguage += matches.length;
  }

  // Count regression markers
  let regressionMarkers = 0;
  for (const pattern of REGRESSION_MARKERS) {
    const matches = text.match(new RegExp(pattern.source, 'gi'));
    if (matches) regressionMarkers += matches.length;
  }

  return {
    femininePronounCount,
    masculinePronounCount,
    nameReferences,
    embodiedLanguage,
    regressionMarkers,
    totalWords,
  };
}

// ============================================
// DAILY METRICS
// ============================================

/**
 * Upsert daily language metrics, accumulating counts for today.
 * Uses identity_language_metrics table.
 */
export async function updateDailyLanguageMetrics(
  userId: string,
  analysis: LanguageAnalysis,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  try {
    // Read current day's metrics
    const { data: existing } = await supabase
      .from('identity_language_metrics')
      .select('id, feminine_pronoun_count, masculine_pronoun_count, name_references, embodied_language_count, regression_marker_count, total_words, message_count')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      // Accumulate onto existing record
      await supabase
        .from('identity_language_metrics')
        .update({
          feminine_pronoun_count: (existing.feminine_pronoun_count || 0) + analysis.femininePronounCount,
          masculine_pronoun_count: (existing.masculine_pronoun_count || 0) + analysis.masculinePronounCount,
          name_references: (existing.name_references || 0) + analysis.nameReferences,
          embodied_language_count: (existing.embodied_language_count || 0) + analysis.embodiedLanguage,
          regression_marker_count: (existing.regression_marker_count || 0) + analysis.regressionMarkers,
          total_words: (existing.total_words || 0) + analysis.totalWords,
          message_count: (existing.message_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Insert new record for today
      await supabase
        .from('identity_language_metrics')
        .insert({
          user_id: userId,
          date: today,
          feminine_pronoun_count: analysis.femininePronounCount,
          masculine_pronoun_count: analysis.masculinePronounCount,
          name_references: analysis.nameReferences,
          embodied_language_count: analysis.embodiedLanguage,
          regression_marker_count: analysis.regressionMarkers,
          total_words: analysis.totalWords,
          message_count: 1,
        });
    }
  } catch (err) {
    console.error('[language-drift] updateDailyLanguageMetrics error:', err);
  }
}

// ============================================
// TREND ANALYSIS
// ============================================

/**
 * Compare last N days feminine ratio vs previous N days.
 * Returns trend direction and percentage change.
 */
export async function getLanguageTrend(
  userId: string,
  days: number = 7,
): Promise<LanguageTrend | null> {
  try {
    const now = new Date();
    const recentStart = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0];
    const previousStart = new Date(now.getTime() - days * 2 * 86400000).toISOString().split('T')[0];

    // Fetch all metrics for the full window (2x days)
    const { data: metrics } = await supabase
      .from('identity_language_metrics')
      .select('date, feminine_pronoun_count, masculine_pronoun_count')
      .eq('user_id', userId)
      .gte('date', previousStart)
      .order('date', { ascending: true });

    if (!metrics || metrics.length < 2) return null;

    // Split into recent and previous periods
    const recent = metrics.filter(m => m.date >= recentStart);
    const previous = metrics.filter(m => m.date < recentStart);

    if (recent.length === 0 || previous.length === 0) return null;

    const recentFem = recent.reduce((s, m) => s + (m.feminine_pronoun_count || 0), 0);
    const recentMasc = recent.reduce((s, m) => s + (m.masculine_pronoun_count || 0), 0);
    const recentTotal = recentFem + recentMasc;
    const currentRatio = recentTotal > 0 ? recentFem / recentTotal : 0;

    const prevFem = previous.reduce((s, m) => s + (m.feminine_pronoun_count || 0), 0);
    const prevMasc = previous.reduce((s, m) => s + (m.masculine_pronoun_count || 0), 0);
    const prevTotal = prevFem + prevMasc;
    const previousRatio = prevTotal > 0 ? prevFem / prevTotal : 0;

    const percentageChange = previousRatio > 0
      ? ((currentRatio - previousRatio) / previousRatio) * 100
      : currentRatio > 0 ? 100 : 0;

    const threshold = 3; // 3% change threshold for "stable"
    const trend: 'rising' | 'stable' | 'falling' =
      percentageChange > threshold ? 'rising' :
      percentageChange < -threshold ? 'falling' :
      'stable';

    return {
      trend,
      currentRatio: Math.round(currentRatio * 100),
      previousRatio: Math.round(previousRatio * 100),
      percentageChange: Math.round(percentageChange),
    };
  } catch (err) {
    console.error('[language-drift] getLanguageTrend error:', err);
    return null;
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Build Handler context block for language drift data.
 */
export async function buildLanguageDriftContext(userId: string): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const [todayResult, weekResult, trendResult] = await Promise.allSettled([
      supabase
        .from('identity_language_metrics')
        .select('feminine_pronoun_count, masculine_pronoun_count, name_references, embodied_language_count, regression_marker_count, message_count')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle(),
      supabase
        .from('identity_language_metrics')
        .select('feminine_pronoun_count, masculine_pronoun_count, name_references, regression_marker_count, message_count')
        .eq('user_id', userId)
        .gte('date', sevenDaysAgo),
      getLanguageTrend(userId, 7),
    ]);

    const todayData = todayResult.status === 'fulfilled' ? todayResult.value.data : null;
    const weekData = weekResult.status === 'fulfilled' ? weekResult.value.data : null;
    const trend = trendResult.status === 'fulfilled' ? trendResult.value : null;

    if (!todayData && (!weekData || weekData.length === 0) && !trend) return '';

    const parts: string[] = [];

    // Current ratio
    if (todayData) {
      const fem = todayData.feminine_pronoun_count || 0;
      const masc = todayData.masculine_pronoun_count || 0;
      const total = fem + masc;
      const ratio = total > 0 ? Math.round((fem / total) * 100) : 0;

      parts.push(`IDENTITY LANGUAGE: feminine ratio ${ratio}% today (${fem}f/${masc}m in ${todayData.message_count || 0} messages)`);

      if (todayData.name_references > 0) {
        parts.push(`  name self-references (Maxy): ${todayData.name_references} today`);
      }
      if (todayData.embodied_language_count > 0) {
        parts.push(`  embodied language: ${todayData.embodied_language_count} markers today`);
      }
      if (todayData.regression_marker_count > 0) {
        parts.push(`  REGRESSION MARKERS: ${todayData.regression_marker_count} today — address directly`);
      }
    }

    // Weekly aggregates
    if (weekData && weekData.length > 1) {
      const weekFem = weekData.reduce((s, m) => s + (m.feminine_pronoun_count || 0), 0);
      const weekMasc = weekData.reduce((s, m) => s + (m.masculine_pronoun_count || 0), 0);
      const weekTotal = weekFem + weekMasc;
      const weekRatio = weekTotal > 0 ? Math.round((weekFem / weekTotal) * 100) : 0;
      const totalMessages = weekData.reduce((s, m) => s + (m.message_count || 0), 0);
      const totalNameRefs = weekData.reduce((s, m) => s + (m.name_references || 0), 0);
      const totalRegression = weekData.reduce((s, m) => s + (m.regression_marker_count || 0), 0);
      const daysWithData = weekData.length;

      const namePerDay = daysWithData > 0 ? (totalNameRefs / daysWithData).toFixed(1) : '0';
      const regressionPerDay = daysWithData > 0 ? (totalRegression / daysWithData).toFixed(1) : '0';

      parts.push(`  7-day: ${weekRatio}% feminine across ${totalMessages} messages, name refs: ${namePerDay}/day, regression: ${regressionPerDay}/day`);
    }

    // Trend
    if (trend) {
      const arrow = trend.trend === 'rising' ? 'up' : trend.trend === 'falling' ? 'down' : 'stable';
      parts.push(`  trend: ${trend.currentRatio}% (${arrow} from ${trend.previousRatio}% last period, ${trend.percentageChange > 0 ? '+' : ''}${trend.percentageChange}%)${trend.trend === 'rising' ? ' — the shift is accelerating' : trend.trend === 'falling' ? ' — REGRESSION DETECTED' : ''}`);
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[language-drift] buildLanguageDriftContext error:', err);
    return '';
  }
}
