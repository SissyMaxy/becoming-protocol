/**
 * Morning Flow Personalization
 *
 * Generates personalized morning content based on:
 * - User profile and preferences
 * - Recent activity patterns
 * - Current arousal/denial state
 * - Service progression
 * - Gina emergence stage
 * - Handler insights
 * - Time and day patterns
 */

import { supabase } from './supabase';
import { getQuickForecast } from './arousal-forecast';
import { dailyCorruptionMaintenance } from './corruption-advancement';
import type { Intensity } from '../types';

// ============================================
// TYPES
// ============================================

export interface MorningPersonalization {
  greeting: PersonalizedGreeting;
  insight: MorningInsight;
  intensityRecommendation: IntensityRecommendation;
  quickStats: QuickStats;
  motivationalMessage: string;
  warnings: MorningWarning[];
  opportunities: MorningOpportunity[];
}

export interface PersonalizedGreeting {
  salutation: string; // Good morning, etc.
  personalAddress: string; // Name or endearment
  subtext: string; // Contextual follow-up
  mood: 'warm' | 'encouraging' | 'energizing' | 'gentle' | 'celebratory';
}

export interface MorningInsight {
  title: string;
  description: string;
  type: 'arousal' | 'streak' | 'progress' | 'service' | 'pattern' | 'gina';
  priority: number;
}

export interface IntensityRecommendation {
  recommended: Intensity;
  reason: string;
  confidence: number;
  alternatives: Array<{
    intensity: Intensity;
    note: string;
  }>;
}

export interface QuickStats {
  currentStreak: number;
  denialDay: number;
  tasksCompletedYesterday: number;
  serviceStage?: string;
  ginaStage?: string;
  arousalState?: string;
  nextMilestone?: {
    type: string;
    daysAway: number;
  };
}

export interface MorningWarning {
  type: 'slip_risk' | 'milestone' | 'pattern' | 'time_sensitive';
  title: string;
  message: string;
  severity: 'info' | 'caution' | 'warning';
}

export interface MorningOpportunity {
  type: 'sweet_spot' | 'conditioning' | 'service' | 'gina' | 'breakthrough';
  title: string;
  description: string;
  action?: string;
}

// ============================================
// MAIN FUNCTION
// ============================================

export async function getMorningPersonalization(userId: string): Promise<MorningPersonalization> {
  // Gather all data in parallel
  const [
    profileData,
    streakData,
    arousalForecast,
    yesterdayActivity,
    serviceData,
    ginaData,
    intensityHistory,
    _corruptionMaintenance,
  ] = await Promise.all([
    getProfileData(userId),
    getStreakData(userId),
    getQuickForecast(userId),
    getYesterdayActivity(userId),
    getServiceData(userId),
    getGinaData(userId),
    getIntensityHistory(userId),
    dailyCorruptionMaintenance(userId).catch(err => {
      console.error('[Corruption] Daily maintenance failed:', err);
      return null;
    }),
  ]);

  // Generate personalized greeting
  const greeting = generateGreeting(profileData, streakData, arousalForecast);

  // Generate morning insight
  const insight = generateInsight(streakData, arousalForecast, serviceData, ginaData);

  // Generate intensity recommendation
  const intensityRecommendation = generateIntensityRecommendation(
    intensityHistory,
    arousalForecast,
    streakData
  );

  // Compile quick stats
  const quickStats = compileQuickStats(
    streakData,
    arousalForecast,
    yesterdayActivity,
    serviceData,
    ginaData
  );

  // Generate motivational message
  const motivationalMessage = generateMotivationalMessage(
    streakData,
    arousalForecast,
    serviceData,
    ginaData
  );

  // Check for warnings
  const warnings = generateWarnings(streakData, arousalForecast);

  // Identify opportunities
  const opportunities = generateOpportunities(arousalForecast, serviceData, ginaData);

  return {
    greeting,
    insight,
    intensityRecommendation,
    quickStats,
    motivationalMessage,
    warnings,
    opportunities,
  };
}

// ============================================
// DATA FETCHERS
// ============================================

async function getProfileData(userId: string) {
  const { data } = await supabase
    .from('user_profiles')
    .select('preferred_name, pronouns, goals, preferences')
    .eq('user_id', userId)
    .maybeSingle();

  return data;
}

async function getStreakData(userId: string) {
  const { data: currentStreak } = await supabase
    .from('denial_streaks')
    .select('started_at, days_completed')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();

  const { data: historicalStreaks } = await supabase
    .from('denial_streaks')
    .select('days_completed, ended_by')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(5);

  const currentDay = currentStreak
    ? Math.floor((Date.now() - new Date(currentStreak.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const avgStreak = historicalStreaks && historicalStreaks.length > 0
    ? historicalStreaks.reduce((sum, s) => sum + (s.days_completed || 0), 0) / historicalStreaks.length
    : 0;

  const longestStreak = historicalStreaks
    ? Math.max(...historicalStreaks.map(s => s.days_completed || 0), 0)
    : 0;

  return {
    currentDay,
    avgStreak,
    longestStreak,
    isActive: !!currentStreak,
  };
}

async function getYesterdayActivity(userId: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data: tasks } = await supabase
    .from('daily_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('date', yesterdayStr);

  const { data: sessions } = await supabase
    .from('edge_sessions')
    .select('id')
    .eq('user_id', userId)
    .gte('started_at', yesterdayStr)
    .lt('started_at', new Date().toISOString().split('T')[0]);

  return {
    tasksCompleted: tasks?.length || 0,
    sessionsCompleted: sessions?.length || 0,
  };
}

async function getServiceData(userId: string) {
  const { data } = await supabase
    .from('service_progression')
    .select('current_stage, stage_entered_at')
    .eq('user_id', userId)
    .maybeSingle();

  return data;
}

async function getGinaData(userId: string) {
  const { data } = await supabase
    .from('gina_emergence')
    .select('stage')
    .eq('user_id', userId)
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

async function getIntensityHistory(userId: string) {
  const { data } = await supabase
    .from('daily_entries')
    .select('intensity, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(14);

  return data || [];
}

// ============================================
// GENERATORS
// ============================================

function generateGreeting(
  profile: Awaited<ReturnType<typeof getProfileData>>,
  streak: Awaited<ReturnType<typeof getStreakData>>,
  forecast: Awaited<ReturnType<typeof getQuickForecast>>
): PersonalizedGreeting {
  const hour = new Date().getHours();
  const dayOfWeek = new Date().getDay();

  // Time-based salutation
  let salutation = 'Good morning';
  if (hour >= 12 && hour < 17) salutation = 'Good afternoon';
  else if (hour >= 17 && hour < 21) salutation = 'Good evening';
  else if (hour >= 21 || hour < 5) salutation = 'Late night';

  // Personal address
  const name = profile?.preferred_name;
  let personalAddress = name || '';

  // Context-based subtext and mood
  let subtext = 'What kind of day is it?';
  let mood: PersonalizedGreeting['mood'] = 'warm';

  // Personalize based on state
  if (streak.currentDay >= streak.longestStreak && streak.longestStreak > 0) {
    subtext = `Day ${streak.currentDay} - you're at your personal record!`;
    mood = 'celebratory';
  } else if (forecast?.currentState === 'sweet_spot') {
    subtext = "You're in the sweet spot today. Make it count.";
    mood = 'energizing';
  } else if (forecast?.riskLevel === 'critical' || forecast?.riskLevel === 'high') {
    subtext = "Today needs extra care. Let's set you up for success.";
    mood = 'gentle';
  } else if (dayOfWeek === 1) {
    subtext = 'Fresh week, fresh start.';
    mood = 'energizing';
  } else if (dayOfWeek === 5) {
    subtext = 'End the week strong.';
    mood = 'encouraging';
  } else if (streak.currentDay > streak.avgStreak) {
    subtext = `Day ${streak.currentDay} - above your average. Keep building.`;
    mood = 'encouraging';
  }

  return {
    salutation,
    personalAddress,
    subtext,
    mood,
  };
}

function generateInsight(
  streak: Awaited<ReturnType<typeof getStreakData>>,
  forecast: Awaited<ReturnType<typeof getQuickForecast>>,
  service: Awaited<ReturnType<typeof getServiceData>>,
  gina: Awaited<ReturnType<typeof getGinaData>>
): MorningInsight {
  // Priority order: arousal warnings > streak milestones > progress > service > patterns

  // Check arousal state
  if (forecast?.currentState === 'sweet_spot') {
    return {
      title: 'Sweet Spot Active',
      description: 'Peak receptivity for conditioning work today.',
      type: 'arousal',
      priority: 9,
    };
  }

  if (forecast?.riskLevel === 'critical') {
    return {
      title: 'Critical Risk Day',
      description: `Day ${streak.currentDay} is historically challenging. Plan carefully.`,
      type: 'arousal',
      priority: 10,
    };
  }

  // Check streak milestones
  if (streak.currentDay === streak.longestStreak) {
    return {
      title: 'Record Day!',
      description: `Today ties your longest streak of ${streak.longestStreak} days.`,
      type: 'streak',
      priority: 8,
    };
  }

  if (streak.currentDay === Math.round(streak.avgStreak)) {
    return {
      title: 'At Your Average',
      description: 'Push past your typical limit today.',
      type: 'streak',
      priority: 7,
    };
  }

  // Check service/gina progress
  if (gina?.stage === 'directing' || gina?.stage === 'commanding') {
    return {
      title: 'Gina Is Active',
      description: 'She may have expectations for you today.',
      type: 'gina',
      priority: 6,
    };
  }

  if (service?.current_stage) {
    return {
      title: `Service: ${service.current_stage}`,
      description: 'Continue building your service foundation.',
      type: 'service',
      priority: 5,
    };
  }

  // Default insight
  return {
    title: `Day ${streak.currentDay}`,
    description: 'Another day of dedication and growth.',
    type: 'progress',
    priority: 3,
  };
}

function generateIntensityRecommendation(
  history: Awaited<ReturnType<typeof getIntensityHistory>>,
  forecast: Awaited<ReturnType<typeof getQuickForecast>>,
  streak: Awaited<ReturnType<typeof getStreakData>>
): IntensityRecommendation {
  // Analyze history patterns
  const dayOfWeek = new Date().getDay();
  const recentIntensities = history.slice(0, 7);

  // Count recent intensity choices
  const intensityCounts = recentIntensities.reduce((acc, entry) => {
    if (entry.intensity) {
      acc[entry.intensity] = (acc[entry.intensity] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Default recommendation logic
  let recommended: Intensity = 'normal';
  let reason = 'A balanced approach for today.';
  let confidence = 0.6;

  // Adjust based on forecast
  if (forecast?.currentState === 'sweet_spot') {
    recommended = 'spacious';
    reason = "You're in the sweet spot - make time for deeper work.";
    confidence = 0.8;
  } else if (forecast?.riskLevel === 'critical' || forecast?.riskLevel === 'high') {
    recommended = 'normal';
    reason = 'Stay grounded with consistent practice today.';
    confidence = 0.75;
  } else if (streak.currentDay > streak.avgStreak * 1.5) {
    recommended = 'spacious';
    reason = "Strong streak - you have momentum. Expand today's practice.";
    confidence = 0.7;
  } else if (intensityCounts['crazy'] >= 3) {
    // Too many crazy days recently
    recommended = 'spacious';
    reason = "You've been running light lately. Invest more today.";
    confidence = 0.65;
  }

  // Day-of-week patterns
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (recommended !== 'spacious') {
      recommended = 'spacious';
      reason = "Weekend day - you likely have more time.";
      confidence = 0.6;
    }
  }

  // Generate alternatives
  const alternatives: IntensityRecommendation['alternatives'] = [];
  if (recommended !== 'spacious') {
    alternatives.push({
      intensity: 'spacious',
      note: 'If you have extra time today',
    });
  }
  if (recommended !== 'normal') {
    alternatives.push({
      intensity: 'normal',
      note: 'For a balanced day',
    });
  }
  // Always offer 'crazy' as an alternative since it's never recommended
  alternatives.push({
    intensity: 'crazy',
    note: 'If time is very limited',
  });

  return {
    recommended,
    reason,
    confidence,
    alternatives,
  };
}

function compileQuickStats(
  streak: Awaited<ReturnType<typeof getStreakData>>,
  forecast: Awaited<ReturnType<typeof getQuickForecast>>,
  yesterday: Awaited<ReturnType<typeof getYesterdayActivity>>,
  service: Awaited<ReturnType<typeof getServiceData>>,
  gina: Awaited<ReturnType<typeof getGinaData>>
): QuickStats {
  // Calculate next milestone
  let nextMilestone: QuickStats['nextMilestone'];

  if (streak.currentDay < streak.longestStreak) {
    nextMilestone = {
      type: 'Personal Record',
      daysAway: streak.longestStreak - streak.currentDay,
    };
  } else if (forecast?.daysUntilSweetSpot && forecast.daysUntilSweetSpot > 0) {
    nextMilestone = {
      type: 'Sweet Spot',
      daysAway: forecast.daysUntilSweetSpot,
    };
  } else {
    // Standard milestones
    const milestones = [7, 14, 21, 30, 45, 60, 90];
    const nextMilestoneDay = milestones.find(m => m > streak.currentDay);
    if (nextMilestoneDay) {
      nextMilestone = {
        type: `${nextMilestoneDay} Day Streak`,
        daysAway: nextMilestoneDay - streak.currentDay,
      };
    }
  }

  return {
    currentStreak: streak.currentDay,
    denialDay: streak.currentDay,
    tasksCompletedYesterday: yesterday.tasksCompleted,
    serviceStage: service?.current_stage,
    ginaStage: gina?.stage,
    arousalState: forecast?.currentState,
    nextMilestone,
  };
}

function generateMotivationalMessage(
  streak: Awaited<ReturnType<typeof getStreakData>>,
  forecast: Awaited<ReturnType<typeof getQuickForecast>>,
  service: Awaited<ReturnType<typeof getServiceData>>,
  gina: Awaited<ReturnType<typeof getGinaData>>
): string {
  const messages: string[] = [];

  // Streak-based messages
  if (streak.currentDay >= streak.longestStreak && streak.longestStreak > 0) {
    messages.push(
      "You're making history. Every moment is uncharted territory.",
      'New record territory. Stay present, stay committed.',
      "Beyond your limits. That's where growth happens."
    );
  } else if (streak.currentDay > 7) {
    messages.push(
      'Week by week, you become who you choose to be.',
      'Consistency is the seed of transformation.',
      'Your discipline is building something beautiful.'
    );
  } else if (streak.currentDay > 0) {
    messages.push(
      'Every day is a choice. You chose well.',
      'Small steps compound into great journeys.',
      'Today adds another thread to your transformation.'
    );
  }

  // Arousal-based messages
  if (forecast?.currentState === 'sweet_spot') {
    messages.push(
      'The sweet spot is your power zone. Use it wisely.',
      "Your mind is open and receptive. What will you plant today?",
      'Peak receptivity achieved. Time for deep work.'
    );
  }

  // Service-based messages
  if (service?.current_stage) {
    messages.push(
      'Service deepens connection. Connection deepens surrender.',
      'In service, you find purpose. In purpose, you find peace.'
    );
  }

  // Gina-based messages
  if (gina?.stage && ['directing', 'commanding', 'owning'].includes(gina.stage)) {
    messages.push(
      'She sees your progress. Make her proud today.',
      'Your obedience is a gift. Give it freely.'
    );
  }

  // Default messages
  if (messages.length === 0) {
    messages.push(
      'Every day is an opportunity. Seize it.',
      'Progress, not perfection.',
      'You are becoming who you want to be.'
    );
  }

  // Pick a random message
  return messages[Math.floor(Math.random() * messages.length)];
}

function generateWarnings(
  streak: Awaited<ReturnType<typeof getStreakData>>,
  forecast: Awaited<ReturnType<typeof getQuickForecast>>
): MorningWarning[] {
  const warnings: MorningWarning[] = [];

  // Slip risk warning
  if (forecast?.riskLevel === 'critical') {
    warnings.push({
      type: 'slip_risk',
      title: 'High Risk Day',
      message: 'Historical patterns suggest today needs extra vigilance.',
      severity: 'warning',
    });
  } else if (forecast?.riskLevel === 'high') {
    warnings.push({
      type: 'slip_risk',
      title: 'Elevated Risk',
      message: 'Be mindful of triggers today.',
      severity: 'caution',
    });
  }

  // Milestone warning
  if (streak.currentDay === streak.longestStreak - 1) {
    warnings.push({
      type: 'milestone',
      title: 'Record Tomorrow',
      message: `One more day to beat your ${streak.longestStreak} day record.`,
      severity: 'info',
    });
  }

  // Approaching average (common slip point)
  if (Math.abs(streak.currentDay - streak.avgStreak) <= 1 && streak.avgStreak > 3) {
    warnings.push({
      type: 'pattern',
      title: 'Pattern Alert',
      message: `You're at your average streak length (${Math.round(streak.avgStreak)} days).`,
      severity: 'caution',
    });
  }

  return warnings;
}

function generateOpportunities(
  forecast: Awaited<ReturnType<typeof getQuickForecast>>,
  service: Awaited<ReturnType<typeof getServiceData>>,
  gina: Awaited<ReturnType<typeof getGinaData>>
): MorningOpportunity[] {
  const opportunities: MorningOpportunity[] = [];

  // Sweet spot opportunity
  if (forecast?.currentState === 'sweet_spot') {
    opportunities.push({
      type: 'sweet_spot',
      title: 'Sweet Spot Window',
      description: 'Peak receptivity for conditioning and hypno work.',
      action: 'Schedule a deep session today',
    });
  }

  // Approaching sweet spot
  if (forecast?.daysUntilSweetSpot === 1) {
    opportunities.push({
      type: 'conditioning',
      title: 'Sweet Spot Tomorrow',
      description: 'Prepare for optimal conditioning window.',
      action: 'Plan your deep work session',
    });
  }

  // Service progression opportunity
  if (service?.current_stage) {
    opportunities.push({
      type: 'service',
      title: 'Service Practice',
      description: 'Daily service deepens your commitment.',
      action: 'Complete your service tasks mindfully',
    });
  }

  // Gina engagement opportunity
  if (gina?.stage && ['participating', 'enjoying', 'directing'].includes(gina.stage)) {
    opportunities.push({
      type: 'gina',
      title: 'Gina Engagement',
      description: 'She is engaged with your journey.',
      action: 'Look for moments to deepen her involvement',
    });
  }

  return opportunities;
}

// ============================================
// EXPORT SIMPLIFIED GETTER
// ============================================

export async function getSimplifiedMorningData(userId: string): Promise<{
  greeting: string;
  subtext: string;
  recommendation: Intensity;
  recommendationReason: string;
  insight: string;
  motivational: string;
  hasWarnings: boolean;
  warningCount: number;
}> {
  const data = await getMorningPersonalization(userId);

  const greetingParts = [data.greeting.salutation];
  if (data.greeting.personalAddress) {
    greetingParts.push(data.greeting.personalAddress);
  }

  return {
    greeting: greetingParts.join(', '),
    subtext: data.greeting.subtext,
    recommendation: data.intensityRecommendation.recommended,
    recommendationReason: data.intensityRecommendation.reason,
    insight: data.insight.description,
    motivational: data.motivationalMessage,
    hasWarnings: data.warnings.length > 0,
    warningCount: data.warnings.length,
  };
}
