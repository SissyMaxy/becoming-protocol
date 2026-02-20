/**
 * useSexting — Sexting & GFE management hook
 *
 * Provides conversation list, escalated messages, GFE subs, and stats.
 * David only sees escalated messages that need approval.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { SextingConversation, SextingMessage, GfeSubscription, SextingStats } from '../types/sexting';
import {
  getActiveConversations,
  getConversationCounts,
  escalateConversation,
} from '../lib/sexting/conversations';
import {
  getEscalatedMessages,
  sendMessage,
  rejectMessage,
  getAutoSendStats,
} from '../lib/sexting/messaging';
import {
  getActiveGfeSubscriptions,
  getGfeRevenueSummary,
} from '../lib/sexting/gfe';

interface UseSextingReturn {
  conversations: SextingConversation[];
  escalated: SextingMessage[];
  gfeSubscriptions: GfeSubscription[];
  stats: SextingStats;
  isLoading: boolean;

  approveMessage: (messageId: string) => Promise<void>;
  rejectMsg: (messageId: string) => Promise<void>;
  escalateConv: (conversationId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSexting(): UseSextingReturn {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<SextingConversation[]>([]);
  const [escalated, setEscalated] = useState<SextingMessage[]>([]);
  const [gfeSubscriptions, setGfeSubscriptions] = useState<GfeSubscription[]>([]);
  const [stats, setStats] = useState<SextingStats>({
    activeConversations: 0,
    totalConversations: 0,
    gfeSubscriptions: 0,
    gfeMonthlyRevenueCents: 0,
    autoSendRate: 0,
    escalatedCount: 0,
    todayRevenueCents: 0,
    totalRevenueCents: 0,
    avgResponseTimeMinutes: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const [convs, escalatedMsgs, gfeSubs, counts, autoStats, gfeRevenue] = await Promise.allSettled([
      getActiveConversations(user.id),
      getEscalatedMessages(user.id),
      getActiveGfeSubscriptions(user.id),
      getConversationCounts(user.id),
      getAutoSendStats(user.id),
      getGfeRevenueSummary(user.id),
    ]);

    setConversations(convs.status === 'fulfilled' ? convs.value : []);
    setEscalated(escalatedMsgs.status === 'fulfilled' ? escalatedMsgs.value : []);
    setGfeSubscriptions(gfeSubs.status === 'fulfilled' ? gfeSubs.value : []);

    const c = counts.status === 'fulfilled' ? counts.value : { active: 0, escalated: 0, total: 0 };
    const a = autoStats.status === 'fulfilled' ? autoStats.value : { totalSent: 0, autoSent: 0, rate: 0 };
    const g = gfeRevenue.status === 'fulfilled' ? gfeRevenue.value : { activeCount: 0, monthlyRevenueCents: 0, totalRevenueCents: 0 };

    setStats({
      activeConversations: c.active,
      totalConversations: c.total,
      gfeSubscriptions: g.activeCount,
      gfeMonthlyRevenueCents: g.monthlyRevenueCents,
      autoSendRate: a.rate,
      escalatedCount: c.escalated,
      todayRevenueCents: 0,
      totalRevenueCents: g.totalRevenueCents,
      avgResponseTimeMinutes: 0,
    });

    setIsLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const approveMessage = useCallback(async (messageId: string) => {
    await sendMessage(messageId);
    await load();
  }, [load]);

  const rejectMsg = useCallback(async (messageId: string) => {
    await rejectMessage(messageId);
    await load();
  }, [load]);

  const escalateConv = useCallback(async (conversationId: string) => {
    await escalateConversation(conversationId);
    await load();
  }, [load]);

  return {
    conversations,
    escalated,
    gfeSubscriptions,
    stats,
    isLoading,
    approveMessage,
    rejectMsg,
    escalateConv,
    refresh: load,
  };
}
