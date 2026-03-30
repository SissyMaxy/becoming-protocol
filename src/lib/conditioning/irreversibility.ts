/**
 * Irreversibility Score System (P3.2)
 *
 * Composite 0-100 score measuring how permanent transformation has become.
 * Aggregates data from 10 systems, each scored 0-10, normalized to 0-100.
 *
 * Every query has error handling — returns 0/empty on failure.
 * Tables that don't exist yet will simply return 0.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface IrreversibilityComponent {
  value: number;
  maxPoints: number;
  description: string;
}

export interface IrreversibilityScore {
  score: number;
  components: Record<string, IrreversibilityComponent>;
  computedAt: string;
}

// ============================================
// COMPONENT CALCULATORS (each returns 0-10)
// ============================================

/** 1. Content Permanence: public content that can't be taken back. */
async function calcContentPermanence(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('content_posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'posted');

    if (error || count == null) return 0;
    return Math.min(10, count);
  } catch {
    return 0;
  }
}

/** 2. Social Exposure: engagement footprint — posts, interactions, DMs. */
async function calcSocialExposure(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('content_posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error || count == null || count === 0) return 0;
    // Log scale: 1 post = ~0, 10 posts = ~3.3, 100 = ~6.6, 1000 = ~10
    return Math.min(10, Math.round(Math.log10(count + 1) * 3.33));
  } catch {
    return 0;
  }
}

/** 3. Financial Investment: money spent on feminization items. */
async function calcFinancialInvestment(userId: string): Promise<number> {
  try {
    // Try investments table first
    const { data: investments, error: invErr } = await supabase
      .from('investments')
      .select('amount_cents')
      .eq('user_id', userId);

    if (!invErr && investments && investments.length > 0) {
      const totalCents = investments.reduce((sum, i) => sum + (i.amount_cents || 0), 0);
      const totalDollars = totalCents / 100;
      // $0 = 0, $500+ = 10
      return Math.min(10, Math.round((totalDollars / 500) * 10));
    }

    // Fallback: check user_progress for financial data
    const { data: progress, error: progErr } = await supabase
      .from('user_progress')
      .select('total_invested_cents')
      .eq('user_id', userId)
      .maybeSingle();

    if (progErr || !progress) return 0;
    const dollars = (progress.total_invested_cents || 0) / 100;
    return Math.min(10, Math.round((dollars / 500) * 10));
  } catch {
    return 0;
  }
}

/** 4. Physical Changes: owned items, body modifications, HRT status. */
async function calcPhysicalChanges(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_state')
      .select('owned_items')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return 0;

    const items = Array.isArray(data.owned_items) ? data.owned_items : [];
    // 0 items = 0, 20+ items = 10
    return Math.min(10, Math.round((items.length / 20) * 10));
  } catch {
    return 0;
  }
}

/** 5. Identity Adoption: days using chosen name, streak, total denial days. */
async function calcIdentityAdoption(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_state')
      .select('streak_days')
      .eq('user_id', userId)
      .maybeSingle();

    const streakDays = (!error && data?.streak_days) ? data.streak_days : 0;

    // Also query user_progress for totalDays
    const { data: progress, error: progErr } = await supabase
      .from('user_progress')
      .select('total_days')
      .eq('user_id', userId)
      .maybeSingle();

    const totalDays = (!progErr && progress?.total_days) ? progress.total_days : 0;
    const combined = streakDays + totalDays;

    // 0 = 0, 90+ days = 10
    return Math.min(10, Math.round((combined / 90) * 10));
  } catch {
    return 0;
  }
}

/** 6. Conditioning Depth: total sessions, trance depth progression. */
async function calcConditioningDepth(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('conditioning_sessions_v2')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error || count == null) return 0;
    // 0 = 0, 50+ sessions = 10
    return Math.min(10, Math.round((count / 50) * 10));
  } catch {
    return 0;
  }
}

/** 7. Relationship Integration: Gina discovery phase, positive seed channels. */
async function calcRelationshipIntegration(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('gina_discovery_state')
      .select('discovery_phase, channels_with_positive_seeds')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return 0;

    const phase = typeof data.discovery_phase === 'number' ? data.discovery_phase : 0;
    const channels = data.channels_with_positive_seeds || 0;

    // Phase contributes 0-6 (phase 0=0, phase 3+=6), channels contribute 0-4
    const phaseScore = Math.min(6, Math.round((phase / 3) * 6));
    const channelScore = Math.min(4, Math.round((channels / 5) * 4));

    return Math.min(10, phaseScore + channelScore);
  } catch {
    return 0;
  }
}

/** 8. Audience Lock-in: subscriber count, revenue generated. */
async function calcAudienceLockIn(userId: string): Promise<number> {
  try {
    // Try content revenue summary
    const { data: revenue, error: revErr } = await supabase
      .from('content_revenue')
      .select('total_cents')
      .eq('user_id', userId)
      .maybeSingle();

    let revScore = 0;
    if (!revErr && revenue && revenue.total_cents > 0) {
      // $0 = 0, $1000+ = 5
      revScore = Math.min(5, Math.round((revenue.total_cents / 100000) * 5));
    }

    // Try fan count
    const { count: fanCount, error: fanErr } = await supabase
      .from('fan_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    let fanScore = 0;
    if (!fanErr && fanCount != null && fanCount > 0) {
      // 0 = 0, 50+ fans = 5
      fanScore = Math.min(5, Math.round((fanCount / 50) * 5));
    }

    return Math.min(10, revScore + fanScore);
  } catch {
    return 0;
  }
}

/** 9. Behavioral Automation: conditioned triggers, response rates. */
async function calcBehavioralAutomation(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('conditioned_triggers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('estimated_strength', ['established', 'conditioned']);

    if (error || count == null) return 0;
    // 0 = 0, 10+ established triggers = 10
    return Math.min(10, count);
  } catch {
    return 0;
  }
}

/** 10. Time Investment: total hours estimated from daily entries. */
async function calcTimeInvestment(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('daily_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error || count == null) return 0;
    // Estimate ~30 min per daily entry, so 20 entries = ~10 hours
    // 0 entries = 0, 200+ entries (~100 hours) = 10
    return Math.min(10, Math.round((count / 200) * 10));
  } catch {
    return 0;
  }
}

// ============================================
// MAIN CALCULATOR
// ============================================

export async function calculateIrreversibilityScore(
  userId: string,
): Promise<IrreversibilityScore> {
  const [
    contentPermanence,
    socialExposure,
    financialInvestment,
    physicalChanges,
    identityAdoption,
    conditioningDepth,
    relationshipIntegration,
    audienceLockIn,
    behavioralAutomation,
    timeInvestment,
  ] = await Promise.allSettled([
    calcContentPermanence(userId),
    calcSocialExposure(userId),
    calcFinancialInvestment(userId),
    calcPhysicalChanges(userId),
    calcIdentityAdoption(userId),
    calcConditioningDepth(userId),
    calcRelationshipIntegration(userId),
    calcAudienceLockIn(userId),
    calcBehavioralAutomation(userId),
    calcTimeInvestment(userId),
  ]);

  const val = (r: PromiseSettledResult<number>) =>
    r.status === 'fulfilled' ? r.value : 0;

  const components: Record<string, IrreversibilityComponent> = {
    contentPermanence: {
      value: val(contentPermanence),
      maxPoints: 10,
      description: 'Public content posted (0=none, 10=10+ posts)',
    },
    socialExposure: {
      value: val(socialExposure),
      maxPoints: 10,
      description: 'Engagement footprint — log scale of total posts/interactions',
    },
    financialInvestment: {
      value: val(financialInvestment),
      maxPoints: 10,
      description: 'Money spent on feminization ($0=0, $500+=10)',
    },
    physicalChanges: {
      value: val(physicalChanges),
      maxPoints: 10,
      description: 'Owned items count (0=none, 20+=10)',
    },
    identityAdoption: {
      value: val(identityAdoption),
      maxPoints: 10,
      description: 'Days using chosen name + streak (0=none, 90+=10)',
    },
    conditioningDepth: {
      value: val(conditioningDepth),
      maxPoints: 10,
      description: 'Total conditioning sessions (0=none, 50+=10)',
    },
    relationshipIntegration: {
      value: val(relationshipIntegration),
      maxPoints: 10,
      description: 'Gina discovery phase + positive seed channels',
    },
    audienceLockIn: {
      value: val(audienceLockIn),
      maxPoints: 10,
      description: 'Subscriber count + revenue generated',
    },
    behavioralAutomation: {
      value: val(behavioralAutomation),
      maxPoints: 10,
      description: 'Established conditioned triggers (0=none, 10+=10)',
    },
    timeInvestment: {
      value: val(timeInvestment),
      maxPoints: 10,
      description: 'Total daily entries as time proxy (0=none, 200+=10)',
    },
  };

  const rawTotal = Object.values(components).reduce((sum, c) => sum + c.value, 0);
  const score = rawTotal; // 10 components * 10 max = 100 max, already normalized

  return {
    score,
    components,
    computedAt: new Date().toISOString(),
  };
}

// ============================================
// HANDLER CONTEXT BUILDER
// ============================================

/**
 * Build a compact context string for injection into Handler system prompts.
 * Returns empty string if score is 0 (no data).
 */
export async function buildIrreversibilityContext(
  userId: string,
): Promise<string> {
  try {
    const result = await calculateIrreversibilityScore(userId);

    if (result.score === 0) return '';

    const c = result.components;
    const componentLine = [
      `Content: ${c.contentPermanence.value}/10`,
      `Social: ${c.socialExposure.value}/10`,
      `Financial: ${c.financialInvestment.value}/10`,
      `Physical: ${c.physicalChanges.value}/10`,
      `Identity: ${c.identityAdoption.value}/10`,
      `Conditioning: ${c.conditioningDepth.value}/10`,
      `Relationship: ${c.relationshipIntegration.value}/10`,
      `Audience: ${c.audienceLockIn.value}/10`,
      `Behavioral: ${c.behavioralAutomation.value}/10`,
      `Time: ${c.timeInvestment.value}/10`,
    ].join(', ');

    // Identify strongest and weakest
    const sorted = Object.entries(c).sort((a, b) => b[1].value - a[1].value);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];

    const lines = [
      `IRREVERSIBILITY: ${result.score}/100`,
      `  ${componentLine}`,
      `  strongest: ${strongest[0]} (${strongest[1].value}/10) | weakest: ${weakest[0]} (${weakest[1].value}/10)`,
    ];

    return lines.join('\n');
  } catch (err) {
    console.error('[irreversibility] buildIrreversibilityContext exception:', err);
    return '';
  }
}
