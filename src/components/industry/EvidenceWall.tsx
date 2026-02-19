/**
 * EvidenceWall — Emotional evidence that Maxy is real
 * NOT analytics. Curated positive engagement moments only.
 * Handler filters: ONLY positive items shown. Negative never appears.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Heart, MessageCircle, DollarSign, Users, TrendingUp,
  Star, Loader2, RefreshCw,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// ============================================
// Types
// ============================================

export interface EvidenceItem {
  id: string;
  type: 'comment' | 'tip' | 'subscriber' | 'poll_vote' | 'milestone' | 'message';
  quote: string;
  username: string | null;
  platform: string;
  timestamp: string;
  amountCents?: number;
}

interface EvidenceStats {
  totalEngaged: number;
  totalPaying: number;
  totalRevenueCents: number;
  totalPollVotes: number;
}

interface EvidenceWallProps {
  compact?: boolean;     // For morning briefing embed
  maxItems?: number;
  onItemTap?: (item: EvidenceItem) => void;
}

// ============================================
// Icon + color per type
// ============================================

const TYPE_CONFIG: Record<EvidenceItem['type'], {
  icon: typeof Heart;
  bambiColor: string;
  darkColor: string;
  label: string;
}> = {
  comment: {
    icon: MessageCircle,
    bambiColor: 'text-blue-500',
    darkColor: 'text-blue-400',
    label: 'Comment',
  },
  tip: {
    icon: DollarSign,
    bambiColor: 'text-green-500',
    darkColor: 'text-green-400',
    label: 'Tip',
  },
  subscriber: {
    icon: Star,
    bambiColor: 'text-amber-500',
    darkColor: 'text-amber-400',
    label: 'Subscriber',
  },
  poll_vote: {
    icon: TrendingUp,
    bambiColor: 'text-purple-500',
    darkColor: 'text-purple-400',
    label: 'Poll',
  },
  milestone: {
    icon: Users,
    bambiColor: 'text-pink-500',
    darkColor: 'text-pink-400',
    label: 'Milestone',
  },
  message: {
    icon: Heart,
    bambiColor: 'text-red-500',
    darkColor: 'text-red-400',
    label: 'Message',
  },
};

// ============================================
// Component
// ============================================

export function EvidenceWall({
  compact = false,
  maxItems = 20,
  onItemTap,
}: EvidenceWallProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [stats, setStats] = useState<EvidenceStats>({
    totalEngaged: 0,
    totalPaying: 0,
    totalRevenueCents: 0,
    totalPollVotes: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const loadEvidence = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    try {
      const evidenceItems: EvidenceItem[] = [];

      // 1. Positive fan messages
      const { data: messages } = await supabase
        .from('fan_messages')
        .select('id, fan_id, platform, message_text, created_at')
        .eq('user_id', user.id)
        .eq('direction', 'inbound')
        .eq('sentiment', 'positive')
        .order('created_at', { ascending: false })
        .limit(maxItems);

      if (messages) {
        for (const msg of messages) {
          evidenceItems.push({
            id: `msg-${msg.id}`,
            type: 'message',
            quote: msg.message_text,
            username: msg.fan_id,
            platform: msg.platform,
            timestamp: msg.created_at,
          });
        }
      }

      // 2. Tips / revenue events
      const { data: tips } = await supabase
        .from('fan_profiles')
        .select('id, username, platform, total_spent_cents, last_interaction_at')
        .eq('user_id', user.id)
        .gt('total_spent_cents', 0)
        .order('total_spent_cents', { ascending: false })
        .limit(10);

      if (tips) {
        for (const tip of tips) {
          evidenceItems.push({
            id: `tip-${tip.id}`,
            type: 'tip',
            quote: `Spent $${(tip.total_spent_cents / 100).toFixed(0)} total`,
            username: tip.username,
            platform: tip.platform,
            timestamp: tip.last_interaction_at ?? '',
            amountCents: tip.total_spent_cents,
          });
        }
      }

      // 3. Poll participation
      const { data: polls } = await supabase
        .from('audience_polls')
        .select('id, question, options, platforms_posted, created_at')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(5);

      if (polls) {
        for (const poll of polls) {
          const totalVotes = (poll.options as Array<{ votes: number }>)
            .reduce((sum: number, o: { votes: number }) => sum + (o.votes ?? 0), 0);
          if (totalVotes > 0) {
            evidenceItems.push({
              id: `poll-${poll.id}`,
              type: 'poll_vote',
              quote: `${totalVotes} people voted: "${poll.question}"`,
              username: null,
              platform: (poll.platforms_posted as string[])?.[0] ?? 'multi',
              timestamp: poll.created_at,
            });
          }
        }
      }

      // 4. Subscriber milestones from community targets
      const { data: communities } = await supabase
        .from('community_targets')
        .select('community_name, platform, followers_attributed, karma_earned')
        .eq('user_id', user.id)
        .gt('followers_attributed', 0);

      if (communities) {
        for (const c of communities) {
          if (c.followers_attributed >= 10) {
            evidenceItems.push({
              id: `milestone-${c.community_name}`,
              type: 'milestone',
              quote: `${c.followers_attributed} followers on ${c.community_name}`,
              username: null,
              platform: c.platform,
              timestamp: '',
            });
          }
        }
      }

      // Sort by timestamp (newest first), take maxItems
      evidenceItems.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      setItems(evidenceItems.slice(0, maxItems));

      // Build stats
      const { count: totalFans } = await supabase
        .from('fan_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const { count: payingFans } = await supabase
        .from('fan_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gt('total_spent_cents', 0);

      const { data: revenueData } = await supabase
        .from('fan_profiles')
        .select('total_spent_cents')
        .eq('user_id', user.id)
        .gt('total_spent_cents', 0);

      const totalRevenue = (revenueData ?? []).reduce(
        (sum, r) => sum + (r.total_spent_cents ?? 0), 0,
      );

      // Poll votes total
      let totalVotes = 0;
      if (polls) {
        for (const poll of polls) {
          totalVotes += (poll.options as Array<{ votes: number }>)
            .reduce((sum: number, o: { votes: number }) => sum + (o.votes ?? 0), 0);
        }
      }

      setStats({
        totalEngaged: totalFans ?? 0,
        totalPaying: payingFans ?? 0,
        totalRevenueCents: totalRevenue,
        totalPollVotes: totalVotes,
      });
    } catch (err) {
      console.error('Failed to load evidence:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, maxItems]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className={`w-6 h-6 animate-spin ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
        }`} />
      </div>
    );
  }

  if (compact) {
    return <CompactWall items={items} stats={stats} isBambiMode={isBambiMode} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-semibold ${
            isBambiMode ? 'text-gray-800' : 'text-protocol-text'
          }`}>
            Evidence Wall
          </p>
          <p className={`text-xs ${
            isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
          }`}>
            Real people. Real engagement. She is real to them.
          </p>
        </div>
        <button onClick={loadEvidence} className="p-1.5">
          <RefreshCw className={`w-4 h-4 ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`} />
        </button>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className={`rounded-xl p-6 text-center ${
          isBambiMode ? 'bg-gray-50' : 'bg-protocol-surface'
        }`}>
          <p className={`text-sm ${
            isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
          }`}>
            No evidence yet. Post your introduction and start building.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <EvidenceCard
              key={item.id}
              item={item}
              isBambiMode={isBambiMode}
              onTap={onItemTap ? () => onItemTap(item) : undefined}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      <SummaryBlock stats={stats} isBambiMode={isBambiMode} />
    </div>
  );
}

// ============================================
// Evidence Card
// ============================================

function EvidenceCard({
  item,
  isBambiMode,
  onTap,
}: {
  item: EvidenceItem;
  isBambiMode: boolean;
  onTap?: () => void;
}) {
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;

  return (
    <button
      onClick={onTap}
      disabled={!onTap}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        isBambiMode
          ? 'bg-white border-gray-100 hover:bg-gray-50'
          : 'bg-protocol-surface border-protocol-border hover:bg-protocol-bg'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
          isBambiMode ? config.bambiColor : config.darkColor
        }`} />
        <div className="min-w-0 flex-1">
          <p className={`text-xs ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            "{item.quote}"
          </p>
          <div className="flex items-center gap-2 mt-1">
            {item.username && (
              <span className={`text-[10px] font-medium ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}>
                @{item.username}
              </span>
            )}
            <span className={`text-[10px] ${
              isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
            }`}>
              {item.platform}
            </span>
            {item.timestamp && (
              <span className={`text-[10px] ${
                isBambiMode ? 'text-gray-300' : 'text-protocol-text-muted'
              }`}>
                {formatTimestamp(item.timestamp)}
              </span>
            )}
          </div>
        </div>
        {item.amountCents && item.amountCents > 0 && (
          <span className={`text-xs font-bold ${
            isBambiMode ? 'text-green-500' : 'text-green-400'
          }`}>
            ${(item.amountCents / 100).toFixed(0)}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================
// Summary Block
// ============================================

function SummaryBlock({
  stats,
  isBambiMode,
}: {
  stats: EvidenceStats;
  isBambiMode: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 ${
      isBambiMode
        ? 'bg-pink-50 border border-pink-100'
        : 'bg-protocol-accent/10 border border-protocol-accent/20'
    }`}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <StatItem
          label="People engaged"
          value={String(stats.totalEngaged)}
          isBambiMode={isBambiMode}
        />
        <StatItem
          label="People who pay"
          value={String(stats.totalPaying)}
          isBambiMode={isBambiMode}
        />
        <StatItem
          label="Total earned"
          value={`$${(stats.totalRevenueCents / 100).toFixed(0)}`}
          isBambiMode={isBambiMode}
        />
        <StatItem
          label="Poll votes"
          value={String(stats.totalPollVotes)}
          isBambiMode={isBambiMode}
        />
      </div>
      <p className={`text-xs text-center italic ${
        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
      }`}>
        These people are real. She is real to them.
      </p>
    </div>
  );
}

function StatItem({
  label,
  value,
  isBambiMode,
}: {
  label: string;
  value: string;
  isBambiMode: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${
        isBambiMode ? 'text-gray-800' : 'text-protocol-text'
      }`}>
        {value}
      </p>
      <p className={`text-[10px] ${
        isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
      }`}>
        {label}
      </p>
    </div>
  );
}

// ============================================
// Compact Wall (for morning briefing)
// ============================================

function CompactWall({
  items,
  stats,
  isBambiMode,
}: {
  items: EvidenceItem[];
  stats: EvidenceStats;
  isBambiMode: boolean;
}) {
  const topItems = items.slice(0, 3);

  if (topItems.length === 0 && stats.totalEngaged === 0) return null;

  return (
    <div className={`rounded-xl border p-3 ${
      isBambiMode ? 'bg-white border-pink-100' : 'bg-protocol-surface border-protocol-border'
    }`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Heart className={`w-3.5 h-3.5 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`}>
          Evidence Wall
        </span>
        <span className={`text-[10px] ml-auto ${
          isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
        }`}>
          {stats.totalEngaged} engaged · ${(stats.totalRevenueCents / 100).toFixed(0)} earned
        </span>
      </div>

      {topItems.length > 0 && (
        <div className="space-y-1">
          {topItems.map(item => {
            const config = TYPE_CONFIG[item.type];
            const Icon = config.icon;
            return (
              <div key={item.id} className="flex items-center gap-2">
                <Icon className={`w-3 h-3 flex-shrink-0 ${
                  isBambiMode ? config.bambiColor : config.darkColor
                }`} />
                <span className={`text-[11px] truncate ${
                  isBambiMode ? 'text-gray-600' : 'text-protocol-text-secondary'
                }`}>
                  "{item.quote}"
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
