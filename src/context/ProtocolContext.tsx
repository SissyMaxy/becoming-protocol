import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { DailyEntry, Intensity, JournalEntry, UserProgress, Domain } from '../types';
import { storage, updateProgressFromEntries, profileStorage, getCompletedDaysCount, getCompletedDates } from '../lib/storage';
import { getTodayDate, getYesterdayDate, getLocalDateString } from '../lib/protocol';
import { DOMAINS, PHASES } from '../data/constants';
import { generatePrescription, Prescription, createLevelLock } from '../lib/ai-prescription';
import { analyzeUser, UserAnalytics } from '../lib/analytics';
import { generateClaudePrescription } from '../lib/claude-api';
import { analyzePatterns, getPendingReinforcement, storeReinforcementTriggers } from '../lib/black-box';
import { supabase } from '../lib/supabase';
import type {
  Investment,
  InvestmentInput,
  InvestmentSummary,
  InvestmentMilestoneEvent,
  WishlistItem,
  WishlistItemInput,
  WishlistSummary,
  WishlistShare,
  WishlistShareInput,
} from '../types/investments';
import {
  getInvestments,
  getInvestmentSummary,
  addInvestment as addInvestmentApi,
  updateInvestment as updateInvestmentApi,
  deleteInvestment as deleteInvestmentApi,
  markInvestmentUsed as markInvestmentUsedApi,
} from '../lib/investments';
import {
  getWishlist,
  getWishlistSummary,
  addToWishlist as addToWishlistApi,
  updateWishlistItem as updateWishlistItemApi,
  removeFromWishlist as removeFromWishlistApi,
  markWishlistPurchased,
} from '../lib/wishlist';
import {
  getShares,
  createShare as createShareApi,
  revokeShare as revokeShareApi,
} from '../lib/wishlist-sharing';
import { checkMilestones } from '../lib/investment-milestones';
import {
  sendTaskCompleteBuzz,
  sendStreakMilestoneBuzz,
  sendLevelUpBuzz,
} from '../lib/lovense-feminization';
import { maybeLogService } from '../lib/service-log';

type AIMode = 'build' | 'protect' | 'recover';

interface LevelLocks {
  [domain: string]: string;
}

interface LevelUpEvent {
  domain: Domain;
  fromLevel: number;
  toLevel: number;
}

interface PhaseUpEvent {
  fromPhase: number;
  toPhase: number;
  phaseName: string;
}

interface ReinforcementEvent {
  type: 'surprise_celebration' | 'hidden_unlock' | 'bonus_insight' | 'mystery_challenge' | 'easter_egg' | 'callback_reference';
  content: Record<string, unknown>;
}

interface UnaskedQuestionEvent {
  shouldShow: boolean;
}

interface NameQuestionEvent {
  shouldShow: boolean;
}

interface ProtocolContextType {
  // State
  currentEntry: DailyEntry | null;
  progress: UserProgress;
  history: DailyEntry[];
  isLoading: boolean;

  // AI State
  prescription: Prescription | null;
  analytics: UserAnalytics | null;
  aiMode: AIMode;

  // Events
  levelUpEvent: LevelUpEvent | null;
  phaseUpEvent: PhaseUpEvent | null;
  streakMilestone: number | null;
  reinforcementEvent: ReinforcementEvent | null;
  unaskedQuestion: UnaskedQuestionEvent | null;
  nameQuestion: NameQuestionEvent | null;
  investmentMilestone: InvestmentMilestoneEvent | null;

  // Profile
  userName: string | null;

  // Investment & Wishlist State
  investments: Investment[];
  investmentSummary: InvestmentSummary | null;
  wishlist: WishlistItem[];
  wishlistSummary: WishlistSummary | null;
  wishlistShares: WishlistShare[];
  investmentsLoading: boolean;

  // Actions
  startDay: (intensity: Intensity) => Promise<void>;
  regenerateToday: () => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  saveJournal: (journal: JournalEntry) => Promise<void>;
  loadHistory: () => Promise<void>;
  getEntryByDate: (date: string) => Promise<DailyEntry | null>;
  resetProgress: () => Promise<void>;

  // Investment Actions
  addInvestment: (input: InvestmentInput) => Promise<Investment>;
  updateInvestment: (id: string, updates: Partial<InvestmentInput>) => Promise<void>;
  deleteInvestment: (id: string) => Promise<void>;
  markInvestmentUsed: (id: string) => Promise<void>;
  refreshInvestmentData: () => Promise<void>;

  // Wishlist Actions
  addToWishlist: (input: WishlistItemInput) => Promise<WishlistItem>;
  updateWishlistItem: (id: string, updates: Partial<WishlistItemInput>) => Promise<void>;
  removeFromWishlist: (id: string) => Promise<void>;
  purchaseWishlistItem: (id: string, purchaseDetails: {
    actualPrice: number;
    purchaseDate: string;
    retailer?: string;
  }) => Promise<Investment>;

  // Share Actions
  createWishlistShare: (input: WishlistShareInput) => Promise<string>;
  revokeWishlistShare: (shareId: string) => Promise<void>;

  // Event dismissals
  dismissLevelUp: () => void;
  dismissPhaseUp: () => void;
  dismissStreakMilestone: () => void;
  dismissReinforcement: () => void;
  dismissUnaskedQuestion: () => void;
  answerUnaskedQuestion: (answer: string) => Promise<void>;
  dismissNameQuestion: () => void;
  updateUserName: (name: string) => Promise<void>;
  dismissInvestmentMilestone: () => void;

  // Lovense Integration
  lovenseRewardsEnabled: boolean;
  setLovenseRewardsEnabled: (enabled: boolean) => void;
}

const defaultProgress: UserProgress = {
  overallStreak: 0,
  longestStreak: 0,
  totalDays: 0,
  domainProgress: DOMAINS.map(d => ({
    domain: d.domain,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    totalDays: 0
  })),
  phase: {
    currentPhase: 1,
    phaseName: PHASES[0].name,
    daysInPhase: 0,
    phaseStartDate: getTodayDate()
  }
};

const ProtocolContext = createContext<ProtocolContextType | undefined>(undefined);

const PHASE_NAMES: Record<number, string> = {
  1: 'Foundation',
  2: 'Expression',
  3: 'Integration',
  4: 'Embodiment'
};

export function ProtocolProvider({ children }: { children: React.ReactNode }) {
  const [currentEntry, setCurrentEntry] = useState<DailyEntry | null>(null);
  const [progress, setProgress] = useState<UserProgress>(defaultProgress);
  const [history, setHistory] = useState<DailyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // AI State
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [levelLocks, setLevelLocks] = useState<LevelLocks>({});

  // Events
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
  const [phaseUpEvent, setPhaseUpEvent] = useState<PhaseUpEvent | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  const [reinforcementEvent, setReinforcementEvent] = useState<ReinforcementEvent | null>(null);
  const [unaskedQuestion, setUnaskedQuestion] = useState<UnaskedQuestionEvent | null>(null);
  const [nameQuestion, setNameQuestion] = useState<NameQuestionEvent | null>(null);
  const [investmentMilestone, setInvestmentMilestone] = useState<InvestmentMilestoneEvent | null>(null);

  // Profile
  const [userName, setUserName] = useState<string | null>(null);

  // Investment & Wishlist State
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investmentSummary, setInvestmentSummary] = useState<InvestmentSummary | null>(null);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistSummary, setWishlistSummary] = useState<WishlistSummary | null>(null);
  const [wishlistShares, setWishlistShares] = useState<WishlistShare[]>([]);
  const [investmentsLoading, setInvestmentsLoading] = useState(false);

  // Lovense Integration
  const [lovenseRewardsEnabled, setLovenseRewardsEnabled] = useState(false);

  // Initialize on mount
  useEffect(() => {
    async function initialize() {
      setIsLoading(true);
      try {
        // Load progress
        const savedProgress = await storage.getProgress();
        setProgress(savedProgress);

        // Load user profile for name
        const profile = await profileStorage.getProfile();
        setUserName(profile?.preferredName || null);

        // Check for today's entry
        const today = getTodayDate();
        const now = new Date();
        console.log('[DEBUG] Current time:', now.toLocaleString());
        console.log('[DEBUG] Today (local):', today);

        // Get all entries to see what exists
        const allEntries = await storage.getAllEntries();
        console.log('[DEBUG] All entries in database:', allEntries.map(e => ({ date: e.date, createdAt: e.createdAt })));
        setHistory(allEntries);

        const todayEntry = await storage.getEntry(today);
        console.log('[DEBUG] Found entry for today:', todayEntry ? `date=${todayEntry.date}, createdAt=${todayEntry.createdAt}` : 'NO ENTRY');

        if (todayEntry) {
          setCurrentEntry(todayEntry);
        } else {
          console.log('[DEBUG] No entry for today - should show morning flow');
        }

        // Recalculate progress from daily_tasks table (the source of truth)
        let effectiveProgress = savedProgress;

        // Get actual completed days from daily_tasks table
        const actualCompletedDays = await getCompletedDaysCount();
        const completedDates = await getCompletedDates();

        // Calculate streak from completed dates
        let calculatedStreak = 0;
        if (completedDates.length > 0) {
          const today = getTodayDate();
          const yesterday = getYesterdayDate();

          // Check if most recent is today or yesterday
          if (completedDates[0] === today || completedDates[0] === yesterday) {
            calculatedStreak = 1;
            let expectedDate = new Date(completedDates[0] + 'T00:00:00');

            for (let i = 1; i < completedDates.length; i++) {
              expectedDate.setDate(expectedDate.getDate() - 1);
              const expectedStr = getLocalDateString(expectedDate);
              if (completedDates[i] === expectedStr) {
                calculatedStreak++;
              } else {
                break;
              }
            }
          }
        }

        // Update progress if different
        if (actualCompletedDays !== savedProgress.totalDays || calculatedStreak !== savedProgress.overallStreak) {
          // Calculate phase based on actual completed days
          let currentPhase = 1;
          let daysAccumulated = 0;

          for (const phase of PHASES) {
            if (phase.durationDays === 0) {
              currentPhase = phase.phase;
              break;
            }
            if (actualCompletedDays < daysAccumulated + phase.durationDays) {
              currentPhase = phase.phase;
              break;
            }
            daysAccumulated += phase.durationDays;
            currentPhase = phase.phase + 1;
          }

          const phaseInfo = PHASES.find(p => p.phase === currentPhase) || PHASES[0];
          const daysInPhase = Math.max(0, actualCompletedDays - daysAccumulated);

          const updatedProgress: UserProgress = {
            ...savedProgress,
            totalDays: actualCompletedDays,
            overallStreak: calculatedStreak,
            longestStreak: Math.max(calculatedStreak, savedProgress.longestStreak),
            phase: {
              currentPhase,
              phaseName: phaseInfo.name,
              daysInPhase,
              phaseStartDate: savedProgress.phase.phaseStartDate
            }
          };

          await storage.saveProgress(updatedProgress);
          setProgress(updatedProgress);
          effectiveProgress = updatedProgress;
        }

        // Check if we should show the name question (day 3-5, no name set)
        if (!profile?.preferredName && effectiveProgress.totalDays >= 3 && effectiveProgress.totalDays <= 5) {
          // 50% chance on days 3-5 if no name
          if (Math.random() < 0.5) {
            setNameQuestion({ shouldShow: true });
          }
        }

        // Load investment and wishlist data
        try {
          setInvestmentsLoading(true);
          const [investmentsData, summaryData, wishlistData, wishlistSummaryData, sharesData] = await Promise.all([
            getInvestments(),
            getInvestmentSummary(),
            getWishlist(),
            getWishlistSummary(),
            getShares(),
          ]);
          setInvestments(investmentsData);
          setInvestmentSummary(summaryData);
          setWishlist(wishlistData);
          setWishlistSummary(wishlistSummaryData);
          setWishlistShares(sharesData);
        } catch (error) {
          console.error('Failed to load investment data:', error);
        } finally {
          setInvestmentsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initialize();
  }, []);

  // Start a new day with selected intensity using AI prescription
  const startDay = useCallback(async (intensity: Intensity) => {
    const today = getTodayDate();
    const existingEntry = await storage.getEntry(today);

    if (existingEntry) {
      // Already have today's entry, just update state
      setCurrentEntry(existingEntry);
      return;
    }

    // Run analytics first (needed for both Claude and fallback)
    const userAnalytics = analyzeUser(progress, history, levelLocks);
    setAnalytics(userAnalytics);

    let aiPrescription: Prescription;

    // Try Claude API first, fall back to rule-based if unavailable
    try {
      const claudeResult = await generateClaudePrescription(
        progress,
        history,
        intensity,
        {
          mode: userAnalytics.recommendedMode,
          streakAtRisk: userAnalytics.streakStatus === 'at_risk',
          decayingDomains: userAnalytics.domainsAtRisk,
          baselineDomains: userAnalytics.baselineDomains
        }
      );

      if (claudeResult) {
        aiPrescription = {
          tasks: claudeResult.tasks,
          note: claudeResult.note,
          warnings: claudeResult.warnings,
          celebrations: claudeResult.celebrations,
          mode: userAnalytics.recommendedMode,
          reasoning: `AI-generated prescription in ${userAnalytics.recommendedMode.toUpperCase()} mode`
        };
        console.log('Using Claude-generated prescription');
      } else {
        // Claude not available, use fallback
        aiPrescription = generatePrescription(progress, history, intensity, levelLocks);
        console.log('Using rule-based prescription (Claude unavailable)');
      }
    } catch (error) {
      console.error('Claude API error, using fallback:', error);
      aiPrescription = generatePrescription(progress, history, intensity, levelLocks);
    }

    setPrescription(aiPrescription);

    // Create new entry with AI-generated tasks
    const newEntry: DailyEntry = {
      id: crypto.randomUUID(),
      date: today,
      intensity,
      tasks: aiPrescription.tasks,
      journal: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.saveEntry(newEntry);
    setCurrentEntry(newEntry);

    // Update history
    const allEntries = await storage.getAllEntries();
    setHistory(allEntries);

    // Check for streak milestones
    const milestones = [7, 14, 21, 30, 60, 90, 100, 365];
    if (milestones.includes(progress.overallStreak)) {
      setStreakMilestone(progress.overallStreak);
    }
  }, [progress, history, levelLocks]);

  // Force regenerate today's prescription (for development/testing)
  const regenerateToday = useCallback(async () => {
    const today = getTodayDate();

    // Delete today's entry from storage
    await storage.deleteEntry(today);
    setCurrentEntry(null);

    // Regenerate with current intensity or default to normal
    const intensity: Intensity = currentEntry?.intensity || 'normal';

    // Run analytics
    const userAnalytics = analyzeUser(progress, history, levelLocks);
    setAnalytics(userAnalytics);

    // Generate new prescription
    const aiPrescription = generatePrescription(progress, history, intensity, levelLocks);
    setPrescription(aiPrescription);

    // Create new entry
    const newEntry: DailyEntry = {
      id: crypto.randomUUID(),
      date: today,
      intensity,
      tasks: aiPrescription.tasks,
      journal: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.saveEntry(newEntry);
    setCurrentEntry(newEntry);

    // Update history
    const allEntries = await storage.getAllEntries();
    setHistory(allEntries);

    console.log('Regenerated today\'s prescription with new templates');
  }, [progress, history, levelLocks, currentEntry]);

  // Toggle task completion
  const toggleTask = useCallback(async (taskId: string) => {
    if (!currentEntry) return;

    // Find the task to check if it was incomplete before
    const taskBefore = currentEntry.tasks.find(t => t.id === taskId);
    const wasIncomplete = taskBefore && !taskBefore.completed;

    const updatedTasks = currentEntry.tasks.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );

    const updatedEntry: DailyEntry = {
      ...currentEntry,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString()
    };

    await storage.saveEntry(updatedEntry);
    setCurrentEntry(updatedEntry);

    // Send task complete buzz if Lovense is enabled and task was just completed
    if (lovenseRewardsEnabled && wasIncomplete) {
      sendTaskCompleteBuzz().catch(console.error);
    }

    // Auto-log service for serve/worship tasks
    if (wasIncomplete && taskBefore) {
      maybeLogService(taskBefore.id, taskBefore.title, taskBefore.description).catch(console.error);
    }

    // Update progress
    const allEntries = await storage.getAllEntries();
    const previousProgress = progress;
    const updatedProgress = updateProgressFromEntries(allEntries, progress);
    await storage.saveProgress(updatedProgress);
    setProgress(updatedProgress);
    setHistory(allEntries);

    // Check for level ups (ratchet principle)
    updatedProgress.domainProgress.forEach(current => {
      const previous = previousProgress.domainProgress.find(
        p => p.domain === current.domain
      );

      if (previous && current.level > previous.level) {
        // Level up detected - create level lock
        const lock = createLevelLock(current.domain);
        setLevelLocks(prev => ({
          ...prev,
          [lock.domain]: lock.lockedUntil
        }));

        // Trigger level up event
        setLevelUpEvent({
          domain: current.domain,
          fromLevel: previous.level,
          toLevel: current.level
        });

        // Send level up buzz if Lovense is enabled
        if (lovenseRewardsEnabled) {
          sendLevelUpBuzz().catch(console.error);
        }
      }
    });

    // Check for phase advancement
    if (updatedProgress.phase.currentPhase > previousProgress.phase.currentPhase) {
      setPhaseUpEvent({
        fromPhase: previousProgress.phase.currentPhase,
        toPhase: updatedProgress.phase.currentPhase,
        phaseName: PHASE_NAMES[updatedProgress.phase.currentPhase] || 'Unknown'
      });
    }

    // Check for streak milestones
    const milestones = [7, 14, 21, 30, 60, 90, 100, 365];
    if (
      milestones.includes(updatedProgress.overallStreak) &&
      updatedProgress.overallStreak > previousProgress.overallStreak
    ) {
      setStreakMilestone(updatedProgress.overallStreak);

      // Send streak milestone buzz if Lovense is enabled
      if (lovenseRewardsEnabled) {
        sendStreakMilestoneBuzz().catch(console.error);
      }
    }

    // Update analytics
    const userAnalytics = analyzeUser(updatedProgress, allEntries, levelLocks);
    setAnalytics(userAnalytics);
  }, [currentEntry, progress, levelLocks, lovenseRewardsEnabled]);

  // Save journal entry
  const saveJournal = useCallback(async (journal: JournalEntry) => {
    if (!currentEntry) return;

    const updatedEntry: DailyEntry = {
      ...currentEntry,
      journal,
      updatedAt: new Date().toISOString()
    };

    await storage.saveEntry(updatedEntry);
    setCurrentEntry(updatedEntry);

    // Update history
    const allEntries = await storage.getAllEntries();
    setHistory(allEntries);

    // Run black box pattern analysis after journal save
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profile = await profileStorage.getProfile();
        const { observations, reinforcementTriggers } = await analyzePatterns(
          user.id,
          allEntries,
          profile as Record<string, unknown> | null
        );

        // Store any reinforcement triggers for later delivery
        if (reinforcementTriggers.length > 0) {
          await storeReinforcementTriggers(user.id, reinforcementTriggers);
        }

        // Check if we should show an unasked question (~10% chance)
        if (Math.random() < 0.1) {
          setUnaskedQuestion({ shouldShow: true });
        }

        // Check for pending reinforcement to show
        const pendingReinforcement = await getPendingReinforcement(user.id);
        if (pendingReinforcement) {
          setReinforcementEvent({
            type: pendingReinforcement.type,
            content: pendingReinforcement.content
          });
        }

        console.log(`Black box analyzed: ${observations.length} observations`);
      }
    } catch (error) {
      console.error('Black box analysis error:', error);
    }
  }, [currentEntry]);

  // Load all history
  const loadHistory = useCallback(async () => {
    const allEntries = await storage.getAllEntries();
    setHistory(allEntries);
  }, []);

  // Get entry by date
  const getEntryByDate = useCallback(async (date: string): Promise<DailyEntry | null> => {
    return storage.getEntry(date);
  }, []);

  // Reset all progress (danger!)
  const resetProgress = useCallback(async () => {
    await storage.clearAll();
    setCurrentEntry(null);
    setProgress(defaultProgress);
    setHistory([]);
    setPrescription(null);
    setAnalytics(null);
    setLevelLocks({});
  }, []);

  // ============================================
  // INVESTMENT & WISHLIST ACTIONS
  // ============================================

  // Refresh all investment data
  const refreshInvestmentData = useCallback(async () => {
    try {
      setInvestmentsLoading(true);
      const [investmentsData, summaryData, wishlistData, wishlistSummaryData, sharesData] = await Promise.all([
        getInvestments(),
        getInvestmentSummary(),
        getWishlist(),
        getWishlistSummary(),
        getShares(),
      ]);
      setInvestments(investmentsData);
      setInvestmentSummary(summaryData);
      setWishlist(wishlistData);
      setWishlistSummary(wishlistSummaryData);
      setWishlistShares(sharesData);
    } catch (error) {
      console.error('Failed to refresh investment data:', error);
    } finally {
      setInvestmentsLoading(false);
    }
  }, []);

  // Add investment
  const addInvestment = useCallback(async (input: InvestmentInput): Promise<Investment> => {
    const previousSummary = investmentSummary;
    const previousCategories = investments.map(i => i.category);

    const newInvestment = await addInvestmentApi(input);

    // Refresh data
    const [investmentsData, summaryData] = await Promise.all([
      getInvestments(),
      getInvestmentSummary(),
    ]);
    setInvestments(investmentsData);
    setInvestmentSummary(summaryData);

    // Check for milestones
    const isNewCategory = !previousCategories.includes(input.category);
    const milestones = await checkMilestones(
      summaryData,
      isNewCategory ? input.category : undefined,
      previousSummary?.totalInvested,
      previousSummary?.byCategory
    );

    // Trigger first milestone event if any
    if (milestones.length > 0) {
      setInvestmentMilestone(milestones[0]);
    }

    return newInvestment;
  }, [investmentSummary, investments]);

  // Update investment
  const updateInvestment = useCallback(async (id: string, updates: Partial<InvestmentInput>) => {
    await updateInvestmentApi(id, updates);
    await refreshInvestmentData();
  }, [refreshInvestmentData]);

  // Delete investment
  const deleteInvestment = useCallback(async (id: string) => {
    await deleteInvestmentApi(id);
    await refreshInvestmentData();
  }, [refreshInvestmentData]);

  // Mark investment as used
  const markInvestmentUsedAction = useCallback(async (id: string) => {
    await markInvestmentUsedApi(id);
    // Update local state
    setInvestments(prev => prev.map(inv =>
      inv.id === id
        ? { ...inv, timesUsed: inv.timesUsed + 1, lastUsedAt: new Date().toISOString() }
        : inv
    ));
  }, []);

  // Add to wishlist
  const addToWishlist = useCallback(async (input: WishlistItemInput): Promise<WishlistItem> => {
    const newItem = await addToWishlistApi(input);
    const [wishlistData, summaryData] = await Promise.all([
      getWishlist(),
      getWishlistSummary(),
    ]);
    setWishlist(wishlistData);
    setWishlistSummary(summaryData);
    return newItem;
  }, []);

  // Update wishlist item
  const updateWishlistItem = useCallback(async (id: string, updates: Partial<WishlistItemInput>) => {
    await updateWishlistItemApi(id, updates);
    const [wishlistData, summaryData] = await Promise.all([
      getWishlist(),
      getWishlistSummary(),
    ]);
    setWishlist(wishlistData);
    setWishlistSummary(summaryData);
  }, []);

  // Remove from wishlist
  const removeFromWishlist = useCallback(async (id: string) => {
    await removeFromWishlistApi(id);
    const [wishlistData, summaryData] = await Promise.all([
      getWishlist(),
      getWishlistSummary(),
    ]);
    setWishlist(wishlistData);
    setWishlistSummary(summaryData);
  }, []);

  // Purchase wishlist item (move to investments)
  const purchaseWishlistItem = useCallback(async (
    id: string,
    purchaseDetails: { actualPrice: number; purchaseDate: string; retailer?: string }
  ): Promise<Investment> => {
    const previousSummary = investmentSummary;
    const previousCategories = investments.map(i => i.category);

    const investment = await markWishlistPurchased(id, purchaseDetails);

    // Refresh all data
    await refreshInvestmentData();

    // Get fresh summary for milestone check
    const summaryData = await getInvestmentSummary();
    const isNewCategory = !previousCategories.includes(investment.category);

    // Check for milestones
    const milestones = await checkMilestones(
      summaryData,
      isNewCategory ? investment.category : undefined,
      previousSummary?.totalInvested,
      previousSummary?.byCategory
    );

    if (milestones.length > 0) {
      setInvestmentMilestone(milestones[0]);
    }

    return investment;
  }, [investmentSummary, investments, refreshInvestmentData]);

  // Create wishlist share
  const createWishlistShare = useCallback(async (input: WishlistShareInput): Promise<string> => {
    const token = await createShareApi(input);
    const sharesData = await getShares();
    setWishlistShares(sharesData);
    return token;
  }, []);

  // Revoke wishlist share
  const revokeWishlistShare = useCallback(async (shareId: string) => {
    await revokeShareApi(shareId);
    const sharesData = await getShares();
    setWishlistShares(sharesData);
  }, []);

  // Event dismissal handlers
  const dismissLevelUp = useCallback(() => setLevelUpEvent(null), []);
  const dismissPhaseUp = useCallback(() => setPhaseUpEvent(null), []);
  const dismissStreakMilestone = useCallback(() => setStreakMilestone(null), []);
  const dismissReinforcement = useCallback(() => setReinforcementEvent(null), []);
  const dismissUnaskedQuestion = useCallback(() => setUnaskedQuestion(null), []);
  const dismissInvestmentMilestone = useCallback(() => setInvestmentMilestone(null), []);

  // Handle unasked question answer
  const answerUnaskedQuestion = useCallback(async (answer: string) => {
    setUnaskedQuestion(null);

    // Store the answer in AI notes for future context
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('ai_conversations').insert({
          user_id: user.id,
          context_type: 'question',
          user_input: answer,
          ai_response: 'Unasked question response stored',
          model_used: 'user_reflection'
        });
      }
    } catch (error) {
      console.error('Error storing unasked question answer:', error);
    }
  }, []);

  // Dismiss name question
  const dismissNameQuestion = useCallback(() => setNameQuestion(null), []);

  // Update user's name (can be called from settings or name question)
  const updateUserName = useCallback(async (name: string) => {
    setNameQuestion(null);
    setUserName(name);

    // Update the profile in the database
    try {
      const currentProfile = await profileStorage.getProfile();
      if (currentProfile) {
        await profileStorage.saveProfile({
          ...currentProfile,
          preferredName: name
        });
      }
    } catch (error) {
      console.error('Error updating user name:', error);
    }
  }, []);

  const value: ProtocolContextType = {
    currentEntry,
    progress,
    history,
    isLoading,

    // AI State
    prescription,
    analytics,
    aiMode: analytics?.recommendedMode || 'build',

    // Events
    levelUpEvent,
    phaseUpEvent,
    streakMilestone,
    reinforcementEvent,
    unaskedQuestion,
    nameQuestion,
    investmentMilestone,

    // Profile
    userName,

    // Investment & Wishlist State
    investments,
    investmentSummary,
    wishlist,
    wishlistSummary,
    wishlistShares,
    investmentsLoading,

    // Actions
    startDay,
    regenerateToday,
    toggleTask,
    saveJournal,
    loadHistory,
    getEntryByDate,
    resetProgress,

    // Investment Actions
    addInvestment,
    updateInvestment,
    deleteInvestment,
    markInvestmentUsed: markInvestmentUsedAction,
    refreshInvestmentData,

    // Wishlist Actions
    addToWishlist,
    updateWishlistItem,
    removeFromWishlist,
    purchaseWishlistItem,

    // Share Actions
    createWishlistShare,
    revokeWishlistShare,

    // Event dismissals
    dismissLevelUp,
    dismissPhaseUp,
    dismissStreakMilestone,
    dismissReinforcement,
    dismissUnaskedQuestion,
    answerUnaskedQuestion,
    dismissNameQuestion,
    updateUserName,
    dismissInvestmentMilestone,

    // Lovense Integration
    lovenseRewardsEnabled,
    setLovenseRewardsEnabled,
  };

  return (
    <ProtocolContext.Provider value={value}>
      {children}
    </ProtocolContext.Provider>
  );
}

export function useProtocol(): ProtocolContextType {
  const context = useContext(ProtocolContext);
  if (context === undefined) {
    throw new Error('useProtocol must be used within a ProtocolProvider');
  }
  return context;
}

// Debug functions exposed globally for troubleshooting date issues
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__debugProtocol = {
    // Show current date calculations
    showDates: () => {
      const now = new Date();
      const today = getTodayDate();
      console.log('Current time (local):', now.toLocaleString());
      console.log('Today date (local):', today);
      console.log('UTC date:', now.toISOString().split('T')[0]);
      console.log('Timezone offset (minutes):', now.getTimezoneOffset());
    },

    // Delete today's entry to force a reset
    forceNewDay: async () => {
      const today = getTodayDate();
      console.log('Deleting entry for:', today);
      await storage.deleteEntry(today);
      console.log('Done! Refresh the page to see the morning flow.');
      return 'Entry deleted. Refresh the page.';
    },

    // List all entries
    listEntries: async () => {
      const entries = await storage.getAllEntries();
      console.table(entries.map(e => ({
        date: e.date,
        createdAt: e.createdAt,
        tasksCompleted: e.tasks.filter(t => t.completed).length,
        totalTasks: e.tasks.length
      })));
      return entries;
    },

    // Delete a specific date's entry
    deleteEntry: async (date: string) => {
      console.log('Deleting entry for:', date);
      await storage.deleteEntry(date);
      console.log('Done! Refresh the page.');
      return 'Entry deleted.';
    }
  };

  console.log('[Protocol Debug] Debug tools available at window.__debugProtocol');
  console.log('[Protocol Debug] Commands: showDates(), forceNewDay(), listEntries(), deleteEntry(date)');
}
