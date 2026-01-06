/**
 * Black Box Intelligence System
 *
 * This module analyzes user patterns that they can't see themselves.
 * Observations are stored hidden from the user and fed into AI prompts.
 *
 * The user NEVER sees these observations directly - they only experience
 * the effects through more personalized AI responses.
 */

import { DailyEntry, Domain } from '../types';
import { supabase } from './supabase';
import { recordInfraction } from './infractions';

// Observation types that Claude can act on
export type ObservationType =
  | 'pattern'           // Recurring behavior
  | 'correlation'       // X happens when Y
  | 'resistance'        // Avoidance patterns
  | 'breakthrough'      // Positive inflection point
  | 'hidden_strength'   // Unrecognized capability
  | 'blind_spot'        // Consistent weakness they don't address
  | 'prediction'        // Anticipated future behavior
  | 'intervention_needed' // Time to step in
  | 'gaming_detected'   // Going through motions
  | 'drift_signal';     // Losing engagement

export interface BlackBoxObservation {
  type: ObservationType;
  title: string;
  observation: string;
  confidence: number; // 0-1
  relatedDomains?: Domain[];
  dataPoints?: Record<string, unknown>;
  suggestedAction?: string;
  priority: number; // 1-10
  expiresAt?: string; // Some observations are time-sensitive
}

interface PatternDetectionResult {
  observations: BlackBoxObservation[];
  reinforcementTriggers: ReinforcementTrigger[];
}

interface ReinforcementTrigger {
  type: 'surprise_celebration' | 'hidden_unlock' | 'bonus_insight' | 'mystery_challenge' | 'easter_egg' | 'callback_reference';
  content: Record<string, unknown>;
  probability: number;
}

/**
 * Analyze user's data for hidden patterns
 * Called after each day's completion or periodically
 */
export async function analyzePatterns(
  userId: string,
  entries: DailyEntry[],
  profile: Record<string, unknown> | null
): Promise<PatternDetectionResult> {
  const observations: BlackBoxObservation[] = [];
  const reinforcementTriggers: ReinforcementTrigger[] = [];

  // Hidden milestones can trigger from day 1
  observations.push(...detectHiddenMilestones(entries));

  if (entries.length < 3) {
    // Not enough data for pattern detection yet, but milestones are checked
    reinforcementTriggers.push(...generateReinforcementTriggers(entries, observations));
    return { observations, reinforcementTriggers };
  }

  // Run pattern detection algorithms (need more data)
  observations.push(...detectJournalCorrelations(entries));
  observations.push(...detectResistancePatterns(entries));

  // Detect gaming behavior and record infractions
  const gamingObservations = detectGamingBehavior(entries);
  observations.push(...gamingObservations);

  // Record gaming infractions (async, don't wait)
  if (gamingObservations.length > 0) {
    recordGamingInfractions(userId, gamingObservations).catch(console.error);
  }

  observations.push(...detectDriftSignals(entries));
  observations.push(...detectBreakthroughs(entries));
  observations.push(...detectHiddenStrengths(entries));
  observations.push(...detectBlindSpots(entries, profile));
  observations.push(...detectTimePatterns(entries));

  // Generate reinforcement triggers
  reinforcementTriggers.push(...generateReinforcementTriggers(entries, observations));

  // Store observations (async, don't wait)
  storeObservations(userId, observations).catch(console.error);

  return { observations, reinforcementTriggers };
}

/**
 * Detect correlations between journaling content and completion
 * "She completes more after journaling about dysphoria"
 */
function detectJournalCorrelations(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];
  const entriesWithJournals = entries.filter(e => e.journal);

  if (entriesWithJournals.length < 5) return observations;

  // Analyze completion rates after different journal sentiments
  const dysphoriaJournals = entriesWithJournals.filter(e =>
    e.journal?.dysphoriaNote && e.journal.dysphoriaNote.length > 50
  );
  const euphoriaJournals = entriesWithJournals.filter(e =>
    e.journal?.euphoriaNote && e.journal.euphoriaNote.length > 50
  );

  // Check next-day completion after dysphoria journaling
  if (dysphoriaJournals.length >= 3) {
    const nextDayCompletions = dysphoriaJournals.map(entry => {
      const nextDay = getNextDayEntry(entries, entry.date);
      if (!nextDay) return null;
      return calculateCompletionRate(nextDay);
    }).filter(Boolean) as number[];

    const avgAfterDysphoria = nextDayCompletions.reduce((a, b) => a + b, 0) / nextDayCompletions.length;
    const overallAvg = calculateOverallCompletionRate(entries);

    if (avgAfterDysphoria > overallAvg + 15) {
      observations.push({
        type: 'correlation',
        title: 'Dysphoria Processing Boost',
        observation: `Completion rate increases by ${Math.round(avgAfterDysphoria - overallAvg)}% the day after journaling about dysphoria. Processing difficult feelings seems to fuel motivation.`,
        confidence: Math.min(0.9, 0.5 + (dysphoriaJournals.length * 0.1)),
        suggestedAction: 'Gently encourage journaling on hard days. Reference this pattern when she struggles.',
        priority: 7
      });
    } else if (avgAfterDysphoria < overallAvg - 15) {
      observations.push({
        type: 'correlation',
        title: 'Dysphoria Hangover',
        observation: `Completion drops by ${Math.round(overallAvg - avgAfterDysphoria)}% after heavy dysphoria days. She may need lighter prescriptions after processing.`,
        confidence: Math.min(0.85, 0.5 + (dysphoriaJournals.length * 0.08)),
        suggestedAction: 'Consider PROTECT mode the day after intense dysphoria journaling.',
        priority: 8
      });
    }
  }

  // Check completion after euphoria journaling
  if (euphoriaJournals.length >= 3) {
    const nextDayCompletions = euphoriaJournals.map(entry => {
      const nextDay = getNextDayEntry(entries, entry.date);
      if (!nextDay) return null;
      return calculateCompletionRate(nextDay);
    }).filter(Boolean) as number[];

    const avgAfterEuphoria = nextDayCompletions.reduce((a, b) => a + b, 0) / nextDayCompletions.length;
    const overallAvg = calculateOverallCompletionRate(entries);

    if (avgAfterEuphoria > overallAvg + 10) {
      observations.push({
        type: 'correlation',
        title: 'Euphoria Momentum',
        observation: `Good days create more good days. Completion is ${Math.round(avgAfterEuphoria - overallAvg)}% higher after euphoria journaling.`,
        confidence: Math.min(0.85, 0.5 + (euphoriaJournals.length * 0.08)),
        suggestedAction: 'Build on euphoria days with slightly more challenging tasks.',
        priority: 6
      });
    }
  }

  return observations;
}

/**
 * Detect resistance patterns
 * "Always skips social on Thursdays"
 */
function detectResistancePatterns(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  if (entries.length < 14) return observations;

  // Analyze by day of week
  const dayOfWeekStats: Record<number, { completed: number; total: number; skippedDomains: Record<string, number> }> = {};

  entries.forEach(entry => {
    const dayOfWeek = new Date(entry.date).getDay();
    if (!dayOfWeekStats[dayOfWeek]) {
      dayOfWeekStats[dayOfWeek] = { completed: 0, total: 0, skippedDomains: {} };
    }

    entry.tasks.forEach(task => {
      dayOfWeekStats[dayOfWeek].total++;
      if (task.completed) {
        dayOfWeekStats[dayOfWeek].completed++;
      } else {
        dayOfWeekStats[dayOfWeek].skippedDomains[task.domain] =
          (dayOfWeekStats[dayOfWeek].skippedDomains[task.domain] || 0) + 1;
      }
    });
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const overallRate = calculateOverallCompletionRate(entries);

  // Find days with significantly lower completion
  Object.entries(dayOfWeekStats).forEach(([day, stats]) => {
    const dayRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
    const dayNum = parseInt(day);

    if (dayRate < overallRate - 20 && stats.total >= 5) {
      // Find most skipped domain on this day
      const mostSkipped = Object.entries(stats.skippedDomains)
        .sort(([, a], [, b]) => b - a)[0];

      observations.push({
        type: 'resistance',
        title: `${dayNames[dayNum]} Resistance`,
        observation: `Completion drops to ${Math.round(dayRate)}% on ${dayNames[dayNum]}s (vs ${Math.round(overallRate)}% average).${mostSkipped ? ` ${mostSkipped[0]} is most often skipped.` : ''}`,
        confidence: Math.min(0.9, 0.6 + (stats.total * 0.02)),
        relatedDomains: mostSkipped ? [mostSkipped[0] as Domain] : undefined,
        suggestedAction: `Consider lighter ${dayNames[dayNum]} prescriptions or address what makes this day harder.`,
        priority: 7,
        dataPoints: { dayOfWeek: dayNum, completionRate: dayRate, skippedDomains: stats.skippedDomains }
      });
    }
  });

  // Detect domain-specific resistance
  const domainSkipRates: Record<string, { skipped: number; total: number }> = {};

  entries.forEach(entry => {
    entry.tasks.forEach(task => {
      if (!domainSkipRates[task.domain]) {
        domainSkipRates[task.domain] = { skipped: 0, total: 0 };
      }
      domainSkipRates[task.domain].total++;
      if (!task.completed) {
        domainSkipRates[task.domain].skipped++;
      }
    });
  });

  Object.entries(domainSkipRates).forEach(([domain, stats]) => {
    const skipRate = stats.total > 0 ? (stats.skipped / stats.total) * 100 : 0;

    if (skipRate > 50 && stats.total >= 10) {
      observations.push({
        type: 'resistance',
        title: `${domain} Avoidance`,
        observation: `${domain} tasks are skipped ${Math.round(skipRate)}% of the time. This might indicate fear, discomfort, or simply wrong timing.`,
        confidence: Math.min(0.9, 0.5 + (stats.total * 0.02)),
        relatedDomains: [domain as Domain],
        suggestedAction: `Explore why ${domain} is challenging. Consider gentler entry points or addressing underlying fears.`,
        priority: 8
      });
    }
  });

  return observations;
}

/**
 * Detect gaming behavior
 * "Perfect completion but empty journals"
 */
function detectGamingBehavior(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  if (entries.length < 7) return observations;

  const recentEntries = entries.slice(0, 14);

  // Check for perfect completion with minimal journaling
  const perfectDays = recentEntries.filter(e =>
    e.tasks.every(t => t.completed)
  );

  if (perfectDays.length >= 5) {
    const emptyJournalPerfectDays = perfectDays.filter(e =>
      !e.journal ||
      (e.journal.euphoriaNote.length < 20 && e.journal.dysphoriaNote.length < 20 && e.journal.insights.length < 20)
    );

    if (emptyJournalPerfectDays.length >= perfectDays.length * 0.7) {
      observations.push({
        type: 'gaming_detected',
        title: 'Going Through Motions',
        observation: `${perfectDays.length} perfect completion days but ${emptyJournalPerfectDays.length} have minimal journaling. She might be checking boxes without real engagement.`,
        confidence: 0.75,
        suggestedAction: 'Ask deeper questions. Add reflection tasks. Consider if tasks are too easy.',
        priority: 9
      });
    }
  }

  // Check for rapid task completion (suspicious speed)
  // This would require timestamps on task completion - future enhancement

  // Check for consistent "just enough" completion
  const justEnoughDays = recentEntries.filter(e => {
    const completed = e.tasks.filter(t => t.completed).length;
    const total = e.tasks.length;
    const rate = total > 0 ? completed / total : 0;
    return rate >= 0.5 && rate <= 0.6; // Exactly hitting minimum
  });

  if (justEnoughDays.length >= recentEntries.length * 0.5) {
    observations.push({
      type: 'gaming_detected',
      title: 'Minimum Viable Effort',
      observation: `${justEnoughDays.length} of last ${recentEntries.length} days show exactly 50-60% completion. She might be gaming the streak system.`,
      confidence: 0.7,
      suggestedAction: 'Consider raising the bar or adding quality metrics. This pattern often precedes burnout.',
      priority: 7
    });
  }

  return observations;
}

/**
 * Record gaming behavior as infractions
 * Called when gaming patterns are detected
 */
async function recordGamingInfractions(
  userId: string,
  gamingObservations: BlackBoxObservation[]
): Promise<void> {
  for (const obs of gamingObservations) {
    if (obs.type !== 'gaming_detected') continue;

    try {
      await recordInfraction(userId, {
        type: 'gaming_detected',
        severity: 'medium',
        aiNotes: `${obs.title}: ${obs.observation}`,
        patternContext: {
          title: obs.title,
          confidence: obs.confidence,
          suggestedAction: obs.suggestedAction,
        },
      });
    } catch (error) {
      console.error('Error recording gaming infraction:', error);
    }
  }
}

/**
 * Detect drift signals
 * "Going through motions, losing engagement"
 */
function detectDriftSignals(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  if (entries.length < 14) return observations;

  // Compare recent week to previous week
  const thisWeek = entries.slice(0, 7);
  const lastWeek = entries.slice(7, 14);

  const thisWeekRate = calculateOverallCompletionRate(thisWeek);
  const lastWeekRate = calculateOverallCompletionRate(lastWeek);

  // Declining completion
  if (lastWeekRate - thisWeekRate > 15) {
    observations.push({
      type: 'drift_signal',
      title: 'Engagement Declining',
      observation: `Completion dropped from ${Math.round(lastWeekRate)}% to ${Math.round(thisWeekRate)}% this week. Early drift signal.`,
      confidence: 0.8,
      suggestedAction: 'Switch to PROTECT mode. Ask about life changes. Reduce task load.',
      priority: 9
    });
  }

  // Declining alignment scores
  const thisWeekAlignments = thisWeek
    .filter(e => e.journal?.alignmentScore)
    .map(e => e.journal!.alignmentScore);
  const lastWeekAlignments = lastWeek
    .filter(e => e.journal?.alignmentScore)
    .map(e => e.journal!.alignmentScore);

  if (thisWeekAlignments.length >= 3 && lastWeekAlignments.length >= 3) {
    const thisAvg = thisWeekAlignments.reduce((a, b) => a + b, 0) / thisWeekAlignments.length;
    const lastAvg = lastWeekAlignments.reduce((a, b) => a + b, 0) / lastWeekAlignments.length;

    if (lastAvg - thisAvg > 1.5) {
      observations.push({
        type: 'drift_signal',
        title: 'Alignment Dropping',
        observation: `Self-reported alignment fell from ${lastAvg.toFixed(1)} to ${thisAvg.toFixed(1)}. She's feeling less connected to her practice.`,
        confidence: 0.85,
        suggestedAction: 'Time for a heart-to-heart. What changed? What does she need?',
        priority: 9
      });
    }
  }

  // Journal length declining
  const thisWeekJournalLength = thisWeek
    .filter(e => e.journal)
    .reduce((sum, e) => sum + (e.journal?.euphoriaNote.length || 0) + (e.journal?.dysphoriaNote.length || 0) + (e.journal?.insights.length || 0), 0);
  const lastWeekJournalLength = lastWeek
    .filter(e => e.journal)
    .reduce((sum, e) => sum + (e.journal?.euphoriaNote.length || 0) + (e.journal?.dysphoriaNote.length || 0) + (e.journal?.insights.length || 0), 0);

  if (lastWeekJournalLength > 0 && thisWeekJournalLength < lastWeekJournalLength * 0.5) {
    observations.push({
      type: 'drift_signal',
      title: 'Journaling Declined',
      observation: `Journal entries are half as detailed as last week. She's reflecting less.`,
      confidence: 0.7,
      suggestedAction: 'Prompt specific reflection questions. Make journaling feel easier.',
      priority: 6
    });
  }

  return observations;
}

/**
 * Detect breakthroughs
 * Positive inflection points
 */
function detectBreakthroughs(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  if (entries.length < 7) return observations;

  // Perfect week detection
  const lastWeek = entries.slice(0, 7);
  const perfectWeek = lastWeek.every(e => {
    const rate = calculateCompletionRate(e);
    return rate >= 80;
  });

  if (perfectWeek) {
    observations.push({
      type: 'breakthrough',
      title: 'Perfect Week',
      observation: `She completed 80%+ every day this week. This is a significant milestone.`,
      confidence: 1.0,
      suggestedAction: 'Celebrate! This is rare. Consider leveling up challenges.',
      priority: 8
    });
  }

  // Domain mastery detection (consistently high in one area)
  const domainRates: Record<string, number[]> = {};
  lastWeek.forEach(entry => {
    entry.tasks.forEach(task => {
      if (!domainRates[task.domain]) domainRates[task.domain] = [];
      domainRates[task.domain].push(task.completed ? 100 : 0);
    });
  });

  Object.entries(domainRates).forEach(([domain, rates]) => {
    if (rates.length >= 5) {
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      if (avg >= 90) {
        observations.push({
          type: 'breakthrough',
          title: `${domain} Mastery`,
          observation: `${domain} completion is at ${Math.round(avg)}% this week. She's owning this domain.`,
          confidence: 0.9,
          relatedDomains: [domain as Domain],
          suggestedAction: 'Acknowledge this strength. Use it as foundation for harder challenges.',
          priority: 6
        });
      }
    }
  });

  return observations;
}

/**
 * Detect hidden strengths
 */
function detectHiddenStrengths(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  if (entries.length < 14) return observations;

  // Find domains she completes without realizing she's good at them
  const domainStats: Record<string, { completed: number; total: number }> = {};

  entries.slice(0, 14).forEach(entry => {
    entry.tasks.forEach(task => {
      if (!domainStats[task.domain]) domainStats[task.domain] = { completed: 0, total: 0 };
      domainStats[task.domain].total++;
      if (task.completed) domainStats[task.domain].completed++;
    });
  });

  const overallRate = calculateOverallCompletionRate(entries.slice(0, 14));

  Object.entries(domainStats).forEach(([domain, stats]) => {
    const rate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
    if (rate > overallRate + 20 && stats.total >= 8) {
      observations.push({
        type: 'hidden_strength',
        title: `Natural at ${domain}`,
        observation: `${domain} completion is ${Math.round(rate)}% vs ${Math.round(overallRate)}% overall. She may not realize how naturally this comes to her.`,
        confidence: 0.8,
        relatedDomains: [domain as Domain],
        suggestedAction: 'Point out this strength at the right moment. Build confidence.',
        priority: 5
      });
    }
  });

  return observations;
}

/**
 * Detect blind spots
 */
function detectBlindSpots(entries: DailyEntry[], profile: Record<string, unknown> | null): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  if (entries.length < 14) return observations;

  // Domains consistently avoided despite being mentioned in goals
  const shortTermGoals = (profile?.shortTermGoals as string) || '';
  const longTermVision = (profile?.longTermVision as string) || '';
  const goalsText = `${shortTermGoals} ${longTermVision}`.toLowerCase();

  const domainKeywords: Record<string, string[]> = {
    voice: ['voice', 'speak', 'sound', 'talk'],
    social: ['social', 'friend', 'public', 'out', 'people'],
    style: ['style', 'clothes', 'fashion', 'makeup', 'dress'],
    movement: ['move', 'walk', 'posture', 'gesture'],
    skincare: ['skin', 'face', 'routine'],
    mindset: ['mind', 'confidence', 'mental', 'think'],
    body: ['body', 'physical', 'hrt']
  };

  const domainStats: Record<string, { completed: number; total: number }> = {};
  entries.slice(0, 14).forEach(entry => {
    entry.tasks.forEach(task => {
      if (!domainStats[task.domain]) domainStats[task.domain] = { completed: 0, total: 0 };
      domainStats[task.domain].total++;
      if (task.completed) domainStats[task.domain].completed++;
    });
  });

  Object.entries(domainKeywords).forEach(([domain, keywords]) => {
    const mentionedInGoals = keywords.some(kw => goalsText.includes(kw));
    const stats = domainStats[domain];

    if (mentionedInGoals && stats && stats.total >= 5) {
      const rate = (stats.completed / stats.total) * 100;
      if (rate < 40) {
        observations.push({
          type: 'blind_spot',
          title: `${domain} Gap`,
          observation: `She mentions ${domain} in her goals but only completes ${Math.round(rate)}% of ${domain} tasks. There's a disconnect between intention and action.`,
          confidence: 0.75,
          relatedDomains: [domain as Domain],
          suggestedAction: 'Gently explore what blocks this domain. Fear? Time? Skill gap?',
          priority: 8
        });
      }
    }
  });

  return observations;
}

/**
 * Detect time-based patterns
 */
function detectTimePatterns(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  // This would require more granular timestamp data
  // For now, we can detect patterns based on intensity choices

  if (entries.length < 14) return observations;

  const intensityPatterns: Record<string, number> = {};
  entries.slice(0, 14).forEach(entry => {
    intensityPatterns[entry.intensity] = (intensityPatterns[entry.intensity] || 0) + 1;
  });

  // Always choosing gentle
  if ((intensityPatterns['gentle'] || 0) >= 10) {
    observations.push({
      type: 'pattern',
      title: 'Comfort Zone',
      observation: `She chooses "gentle" ${intensityPatterns['gentle']} of the last 14 days. Might be avoiding challenge.`,
      confidence: 0.7,
      suggestedAction: 'Occasionally suggest a "normal" day. Build confidence to stretch.',
      priority: 5
    });
  }

  // Always choosing challenging
  if ((intensityPatterns['challenging'] || 0) >= 10) {
    observations.push({
      type: 'pattern',
      title: 'Pushing Too Hard',
      observation: `She chooses "challenging" ${intensityPatterns['challenging']} of the last 14 days. Risk of burnout.`,
      confidence: 0.7,
      suggestedAction: 'Watch for declining completion. Suggest rest days.',
      priority: 6
    });
  }

  return observations;
}

/**
 * Detect hidden milestones
 * Surprising celebrations for achievements the user didn't know they were tracking
 */
function detectHiddenMilestones(entries: DailyEntry[]): BlackBoxObservation[] {
  const observations: BlackBoxObservation[] = [];

  if (entries.length === 0) return observations;

  const today = entries[0];
  const totalDays = entries.length;

  // First perfect day (100% completion)
  if (entries.length >= 1) {
    const perfectDays = entries.filter(e => calculateCompletionRate(e) === 100);
    if (perfectDays.length === 1 && calculateCompletionRate(today) === 100) {
      observations.push({
        type: 'breakthrough',
        title: 'First Perfect Day',
        observation: `Your first 100% completion day. This is a moment worth remembering.`,
        confidence: 1.0,
        suggestedAction: 'Celebrate this milestone! First perfect day is significant.',
        priority: 10
      });
    }
  }

  // First task completed ever (only on day 1)
  if (totalDays === 1) {
    const completedToday = today.tasks.filter(t => t.completed).length;
    if (completedToday === 1) {
      observations.push({
        type: 'breakthrough',
        title: 'First Step',
        observation: `You completed your first task. Every journey begins with a single step.`,
        confidence: 1.0,
        suggestedAction: 'This is the beginning. Acknowledge it.',
        priority: 10
      });
    }
  }

  // First task in a domain
  const domainsCompleted: Record<string, boolean> = {};
  const previousDomains: Set<string> = new Set();

  entries.slice(1).forEach(entry => {
    entry.tasks.forEach(task => {
      if (task.completed) previousDomains.add(task.domain);
    });
  });

  today.tasks.forEach(task => {
    if (task.completed && !previousDomains.has(task.domain) && !domainsCompleted[task.domain]) {
      domainsCompleted[task.domain] = true;
      observations.push({
        type: 'breakthrough',
        title: `First ${task.domain} Task`,
        observation: `You completed your first ${task.domain} task. A new territory explored.`,
        confidence: 1.0,
        relatedDomains: [task.domain as Domain],
        suggestedAction: 'Acknowledge new domain exploration.',
        priority: 8
      });
    }
  });

  // Weekend warrior (completing on Saturday or Sunday when completion is often lower)
  const dayOfWeek = new Date(today.date).getDay();
  if ((dayOfWeek === 0 || dayOfWeek === 6) && calculateCompletionRate(today) >= 70) {
    // Check if weekends are typically lower
    const weekendEntries = entries.filter(e => {
      const d = new Date(e.date).getDay();
      return d === 0 || d === 6;
    });
    const weekdayEntries = entries.filter(e => {
      const d = new Date(e.date).getDay();
      return d !== 0 && d !== 6;
    });

    if (weekendEntries.length >= 3 && weekdayEntries.length >= 3) {
      const weekendRate = calculateOverallCompletionRate(weekendEntries);
      const weekdayRate = calculateOverallCompletionRate(weekdayEntries);

      if (weekdayRate > weekendRate + 15 && calculateCompletionRate(today) >= 70) {
        observations.push({
          type: 'breakthrough',
          title: 'Weekend Warrior',
          observation: `You showed up on the weekend when most people take it easy. That's dedication.`,
          confidence: 0.85,
          suggestedAction: 'Acknowledge weekend consistency.',
          priority: 6
        });
      }
    }
  }

  // Secret streak numbers (fun milestones)
  const currentStreak = countCurrentStreak(entries);
  const secretMilestones = [3, 11, 21, 31, 42, 69, 77, 100, 111, 123, 200, 365];

  if (secretMilestones.includes(currentStreak)) {
    const messages: Record<number, string> = {
      3: "Three days. A habit begins to form.",
      11: "Eleven days. You've passed the first test.",
      21: "Twenty-one days. They say this is when habits stick.",
      31: "A month. You've proven something to yourself.",
      42: "Forty-two days. The answer to everything, perhaps.",
      69: "Nice.",
      77: "Lucky sevens. You've earned your fortune.",
      100: "One hundred days. Triple digits. Remarkable.",
      111: "Make a wish. 1:11.",
      123: "One, two, three. Counting up to something beautiful.",
      200: "Two hundred days. This is who you are now.",
      365: "One year. Every single day. You became her."
    };

    observations.push({
      type: 'breakthrough',
      title: `Day ${currentStreak}`,
      observation: messages[currentStreak] || `Day ${currentStreak}. A quiet milestone.`,
      confidence: 1.0,
      suggestedAction: 'Surprise celebration for hidden milestone.',
      priority: 9
    });
  }

  // Completing a task they usually skip
  const taskCompletionHistory: Record<string, { completed: number; total: number }> = {};

  entries.slice(1).forEach(entry => {
    entry.tasks.forEach(task => {
      const key = `${task.domain}-${task.title}`;
      if (!taskCompletionHistory[key]) {
        taskCompletionHistory[key] = { completed: 0, total: 0 };
      }
      taskCompletionHistory[key].total++;
      if (task.completed) taskCompletionHistory[key].completed++;
    });
  });

  today.tasks.forEach(task => {
    const key = `${task.domain}-${task.title}`;
    const history = taskCompletionHistory[key];

    if (history && history.total >= 5 && task.completed) {
      const skipRate = ((history.total - history.completed) / history.total) * 100;
      if (skipRate >= 70) {
        observations.push({
          type: 'breakthrough',
          title: 'Overcame Resistance',
          observation: `You completed "${task.title}" - something you usually skip. Breaking patterns takes courage.`,
          confidence: 0.8,
          relatedDomains: [task.domain as Domain],
          suggestedAction: 'Celebrate breaking through usual resistance.',
          priority: 7
        });
      }
    }
  });

  // First "crazy" intensity (highest challenge)
  if (today.intensity === 'crazy') {
    const previousCrazy = entries.slice(1).filter(e => e.intensity === 'crazy');
    if (previousCrazy.length === 0) {
      observations.push({
        type: 'breakthrough',
        title: 'First Challenge',
        observation: `You chose the highest intensity for the first time. You're ready to push yourself.`,
        confidence: 1.0,
        suggestedAction: 'Acknowledge courage in choosing difficulty.',
        priority: 8
      });
    }
  }

  // Journaling streak
  const journalStreak = countJournalStreak(entries);
  const journalMilestones = [7, 14, 30];

  if (journalMilestones.includes(journalStreak)) {
    observations.push({
      type: 'breakthrough',
      title: `${journalStreak} Days of Reflection`,
      observation: `You've journaled meaningfully for ${journalStreak} days straight. Your self-awareness is deepening.`,
      confidence: 1.0,
      suggestedAction: 'Celebrate consistent journaling.',
      priority: 7
    });
  }

  return observations;
}

// Count current streak
function countCurrentStreak(entries: DailyEntry[]): number {
  let streak = 0;
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const entry of sortedEntries) {
    if (calculateCompletionRate(entry) >= 50) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Count journal streak
function countJournalStreak(entries: DailyEntry[]): number {
  let streak = 0;
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const entry of sortedEntries) {
    if (entry.journal &&
        ((entry.journal.euphoriaNote?.length || 0) > 20 ||
         (entry.journal.dysphoriaNote?.length || 0) > 20 ||
         (entry.journal.insights?.length || 0) > 20)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Generate variable reinforcement triggers
 */
function generateReinforcementTriggers(
  entries: DailyEntry[],
  observations: BlackBoxObservation[]
): ReinforcementTrigger[] {
  const triggers: ReinforcementTrigger[] = [];

  // Random celebration (~10% chance)
  if (Math.random() < 0.1) {
    const messages = [
      "I noticed something about you today. Keep going.",
      "You're building something beautiful, even when you can't see it.",
      "The woman you're becoming would be proud of you right now.",
      "Some days the practice is the victory. Today was one of those days.",
      "I see patterns in your journey that tell a story of growth."
    ];

    triggers.push({
      type: 'bonus_insight',
      content: { message: messages[Math.floor(Math.random() * messages.length)] },
      probability: 1.0
    });
  }

  // Callback to earlier journal entries (~5% chance)
  if (Math.random() < 0.05 && entries.length > 14) {
    const oldEntry = entries[Math.floor(Math.random() * (entries.length - 7)) + 7];
    if (oldEntry.journal?.insights && oldEntry.journal.insights.length > 30) {
      triggers.push({
        type: 'callback_reference',
        content: {
          date: oldEntry.date,
          snippet: oldEntry.journal.insights.slice(0, 100),
          message: `${Math.floor((Date.now() - new Date(oldEntry.date).getTime()) / (1000 * 60 * 60 * 24))} days ago, you wrote something. Do you remember?`
        },
        probability: 1.0
      });
    }
  }

  // Mystery challenge (~3% chance)
  if (Math.random() < 0.03) {
    const challenges = [
      { challenge: "Do one task with your eyes closed (where safe).", reward: "Notice how much you've internalized." },
      { challenge: "Time yourself on your fastest task. Can you beat it?", reward: "Speed comes from comfort." },
      { challenge: "Teach someone one thing you've learned.", reward: "Teaching solidifies learning." },
      { challenge: "Do your hardest task first today.", reward: "Front-load the resistance." }
    ];

    triggers.push({
      type: 'mystery_challenge',
      content: challenges[Math.floor(Math.random() * challenges.length)],
      probability: 1.0
    });
  }

  // Surprise celebration based on hidden milestone
  const breakthroughObs = observations.find(o => o.type === 'breakthrough');
  if (breakthroughObs && Math.random() < 0.5) {
    triggers.push({
      type: 'surprise_celebration',
      content: {
        title: breakthroughObs.title,
        message: `I've been watching. ${breakthroughObs.observation} You earned this recognition.`
      },
      probability: 1.0
    });
  }

  return triggers;
}

// Helper functions
function getNextDayEntry(entries: DailyEntry[], date: string): DailyEntry | null {
  const currentDate = new Date(date);
  const nextDate = new Date(currentDate.getTime() + 86400000);
  const nextDateStr = nextDate.toISOString().split('T')[0];
  return entries.find(e => e.date === nextDateStr) || null;
}

function calculateCompletionRate(entry: DailyEntry): number {
  if (entry.tasks.length === 0) return 0;
  const completed = entry.tasks.filter(t => t.completed).length;
  return (completed / entry.tasks.length) * 100;
}

function calculateOverallCompletionRate(entries: DailyEntry[]): number {
  let total = 0;
  let completed = 0;
  entries.forEach(entry => {
    total += entry.tasks.length;
    completed += entry.tasks.filter(t => t.completed).length;
  });
  return total > 0 ? (completed / total) * 100 : 0;
}

/**
 * Store observations in the black box
 */
async function storeObservations(userId: string, observations: BlackBoxObservation[]): Promise<void> {
  if (observations.length === 0) return;

  const dbObservations = observations.map(obs => ({
    user_id: userId,
    observation_type: obs.type,
    title: obs.title,
    observation: obs.observation,
    confidence: obs.confidence,
    related_domains: obs.relatedDomains || null,
    data_points: obs.dataPoints || {},
    suggested_action: obs.suggestedAction || null,
    priority: obs.priority,
    expires_at: obs.expiresAt || null,
    is_active: true,
    observed_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('black_box_observations')
    .insert(dbObservations);

  if (error) {
    console.error('Error storing black box observations:', error);
  }
}

/**
 * Get recent active observations for AI prompt injection
 */
export async function getActiveObservations(userId: string, limit = 10): Promise<BlackBoxObservation[]> {
  const { data, error } = await supabase
    .from('black_box_observations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .order('observed_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map(row => ({
    type: row.observation_type as ObservationType,
    title: row.title,
    observation: row.observation,
    confidence: row.confidence,
    relatedDomains: row.related_domains as Domain[] | undefined,
    dataPoints: row.data_points,
    suggestedAction: row.suggested_action,
    priority: row.priority,
    expiresAt: row.expires_at
  }));
}

/**
 * Store reinforcement triggers for later delivery
 */
export async function storeReinforcementTriggers(
  userId: string,
  triggers: ReinforcementTrigger[]
): Promise<void> {
  if (triggers.length === 0) return;

  const dbTriggers = triggers.map(trigger => ({
    user_id: userId,
    reinforcement_type: trigger.type,
    trigger_probability: trigger.probability,
    content: trigger.content,
    is_triggered: false,
    created_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('reinforcement_schedule')
    .insert(dbTriggers);

  if (error) {
    console.error('Error storing reinforcement triggers:', error);
  }
}

/**
 * Get pending reinforcement for delivery
 */
export async function getPendingReinforcement(userId: string): Promise<ReinforcementTrigger | null> {
  const { data, error } = await supabase
    .from('reinforcement_schedule')
    .select('*')
    .eq('user_id', userId)
    .eq('is_triggered', false)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  // Mark as triggered
  await supabase
    .from('reinforcement_schedule')
    .update({ is_triggered: true, triggered_at: new Date().toISOString() })
    .eq('id', data[0].id);

  return {
    type: data[0].reinforcement_type,
    content: data[0].content,
    probability: data[0].trigger_probability
  };
}
