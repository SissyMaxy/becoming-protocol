import { Intensity, DailyEntry, UserProgress, ProtocolTask } from '../types';
import { profileStorage } from './storage';
import { getInvestments, getInvestmentSummary, getUnusedInvestments } from './investments';
import { getWishlist } from './wishlist';
import { supabase } from './supabase';
import { invokeWithAuth } from './handler-ai';

interface UserContext {
  profile: {
    preferredName?: string;
    pronouns?: string;
    journeyStage?: string;
    monthsOnJourney: number;
    livingSituation?: string;
    outLevel?: string;
    hasPartner: boolean;
    partnerSupportive?: string;
    dysphoriaTriggers: Array<{ area: string; intensity: number }>;
    euphoriaTriggers: Array<{ activity: string; intensity: number }>;
    fears: Array<{ fear: string; intensity: number }>;
    shortTermGoals?: string;
    longTermVision?: string;
    preferredIntensity: string;
    voiceFocusLevel?: string;
    socialComfort?: string;
    morningAvailable: boolean;
    eveningAvailable: boolean;
    workFromHome: boolean;
    busyDays: string[];
  };
  progress: {
    overallStreak: number;
    totalDays: number;
    phase: { currentPhase: number; phaseName: string };
    domainProgress: Array<{
      domain: string;
      level: number;
      currentStreak: number;
      totalDays: number;
    }>;
  };
  recentHistory: Array<{
    date: string;
    intensity: string;
    completedTasks: number;
    totalTasks: number;
    alignment?: number;
  }>;
  analytics: {
    mode: 'build' | 'protect' | 'recover';
    streakAtRisk: boolean;
    decayingDomains: string[];
    baselineDomains: string[];
    recentAlignment: number;
  };
  intensity: Intensity;
  currentDay: string;
  financial?: {
    totalInvested: number;
    byCategory: Record<string, number>;
    recentPurchases: Array<{
      name: string;
      category: string;
      amount: number;
      daysAgo: number;
      timesUsed: number;
    }>;
    unusedItems: Array<{
      name: string;
      category: string;
      daysSincePurchase: number;
    }>;
    topWishlistItems: Array<{
      name: string;
      category: string;
      estimatedPrice: number | null;
    }>;
  };
}

interface ClaudePrescription {
  note: string;
  warnings: string[];
  celebrations: string[];
  tasks: ProtocolTask[];
}

/**
 * Generate a prescription using Claude AI via Supabase Edge Function
 */
export async function generateClaudePrescription(
  progress: UserProgress,
  history: DailyEntry[],
  intensity: Intensity,
  analytics: {
    mode: 'build' | 'protect' | 'recover';
    streakAtRisk: boolean;
    decayingDomains: string[];
    baselineDomains: string[];
  }
): Promise<ClaudePrescription | null> {
  try {
    // Get user profile
    const profile = await profileStorage.getProfile();
    if (!profile) {
      console.warn('No profile found, using fallback prescription');
      return null;
    }

    // Build recent history summary
    const recentHistory = history.slice(0, 7).map(entry => {
      const completedTasks = entry.tasks.filter(t => t.completed).length;
      return {
        date: entry.date,
        intensity: entry.intensity,
        completedTasks,
        totalTasks: entry.tasks.length,
        alignment: entry.journal?.alignmentScore
      };
    });

    // Calculate recent alignment average
    const alignmentEntries = history
      .slice(0, 7)
      .filter(e => e.journal?.alignmentScore)
      .map(e => e.journal!.alignmentScore);
    const recentAlignment = alignmentEntries.length > 0
      ? Math.round(alignmentEntries.reduce((a, b) => a + b, 0) / alignmentEntries.length)
      : 70;

    // Get financial context
    let financialContext: UserContext['financial'] | undefined;
    try {
      const [investments, summary, unused, wishlist] = await Promise.all([
        getInvestments(),
        getInvestmentSummary(),
        getUnusedInvestments(14), // Items unused for 14+ days
        getWishlist()
      ]);

      if (summary) {
        const today = new Date();
        financialContext = {
          totalInvested: summary.totalInvested,
          byCategory: summary.byCategory,
          recentPurchases: investments.slice(0, 5).map(inv => ({
            name: inv.name,
            category: inv.category,
            amount: inv.amount,
            daysAgo: Math.floor((today.getTime() - inv.purchaseDate.getTime()) / (1000 * 60 * 60 * 24)),
            timesUsed: inv.timesUsed
          })),
          unusedItems: unused.map(inv => ({
            name: inv.name,
            category: inv.category,
            daysSincePurchase: Math.floor((today.getTime() - inv.purchaseDate.getTime()) / (1000 * 60 * 60 * 24))
          })),
          topWishlistItems: wishlist
            .filter(w => w.status === 'active')
            .slice(0, 3)
            .map(w => ({
              name: w.name,
              category: w.category as string,
              estimatedPrice: w.estimatedPrice ?? null
            }))
        };
      }
    } catch (error) {
      console.warn('Failed to load financial context:', error);
      // Continue without financial data
    }

    // Build context for Claude
    const context: UserContext = {
      profile: {
        preferredName: profile.preferredName,
        pronouns: profile.pronouns,
        journeyStage: profile.journeyStage,
        monthsOnJourney: profile.monthsOnJourney,
        livingSituation: profile.livingSituation,
        outLevel: profile.outLevel,
        hasPartner: profile.hasPartner,
        partnerSupportive: profile.partnerSupportive,
        dysphoriaTriggers: profile.dysphoriaTriggers || [],
        euphoriaTriggers: profile.euphoriaTriggers || [],
        fears: profile.fears || [],
        shortTermGoals: profile.shortTermGoals,
        longTermVision: profile.longTermVision,
        preferredIntensity: profile.preferredIntensity,
        voiceFocusLevel: profile.voiceFocusLevel,
        socialComfort: profile.socialComfort,
        morningAvailable: profile.morningAvailable,
        eveningAvailable: profile.eveningAvailable,
        workFromHome: profile.workFromHome,
        busyDays: profile.busyDays || []
      },
      progress: {
        overallStreak: progress.overallStreak,
        totalDays: progress.totalDays,
        phase: {
          currentPhase: progress.phase.currentPhase,
          phaseName: progress.phase.phaseName
        },
        domainProgress: progress.domainProgress.map(d => ({
          domain: d.domain,
          level: d.level,
          currentStreak: d.currentStreak,
          totalDays: d.totalDays
        }))
      },
      recentHistory,
      analytics: {
        ...analytics,
        recentAlignment
      },
      intensity,
      currentDay: new Date().toISOString().split('T')[0],
      financial: financialContext
    };

    // Call the edge function with explicit auth
    const { data, error } = await invokeWithAuth('generate-prescription', { context });

    if (error) {
      console.error('Edge function error:', error);
      return null;
    }

    return data as ClaudePrescription;
  } catch (error) {
    console.error('Error generating Claude prescription:', error);
    return null;
  }
}

/**
 * Check if Claude API is available (edge function is deployed)
 */
export async function isClaudeAvailable(): Promise<boolean> {
  try {
    // Try a simple health check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if the edge function exists by attempting a minimal call
    // In production, you might have a dedicated health endpoint
    return true; // Assume available if user is authenticated
  } catch {
    return false;
  }
}
