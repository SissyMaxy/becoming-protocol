/**
 * MorningBriefing — Handler Activity Report
 * Shows what the Handler did overnight.
 * "While you slept: 3 new followers, 12 comments made, 2 DMs answered."
 * The machine runs whether David shows up or not.
 */

import { useState, useEffect } from 'react';
import {
  Bot, MessageSquare, Users, BarChart3, TrendingUp,
  Clock, AlertTriangle, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { getRecentAutonomousActions, getTodayActionCount } from '../../lib/industry/community-engine';
import { getConsecutiveSkipCount } from '../../lib/industry/skip-escalation';
import { getKarmaStatus } from '../../lib/industry/reddit-karma';
import type { HandlerAutonomousAction } from '../../types/industry';

// ============================================
// Types
// ============================================

interface BriefingData {
  actions: HandlerAutonomousAction[];
  actionsByType: Record<string, number>;
  totalActionsToday: number;
  consecutiveSkips: number;
  karmaEstimate: number;
  isKarmaReady: boolean;
}

// ============================================
// Component
// ============================================

export function MorningBriefing() {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadBriefingData(user.id).then(setData).finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) {
    return (
      <div className={`rounded-xl border p-4 ${
        isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface border-protocol-border'
      }`}>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          <span className={`text-xs ${isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'}`}>
            Loading briefing...
          </span>
        </div>
      </div>
    );
  }

  if (!data || data.actions.length === 0) {
    return (
      <div className={`rounded-xl border p-4 ${
        isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border'
      }`}>
        <div className="flex items-center gap-2">
          <Bot className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-accent'}`} />
          <span className={`text-xs ${isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}`}>
            No Handler activity yet. The machine will start running.
          </span>
        </div>
      </div>
    );
  }

  const commentsMade = (data.actionsByType['community_comment'] ?? 0)
    + (data.actionsByType['subreddit_comment'] ?? 0);
  const repliesMade = data.actionsByType['engagement_reply'] ?? 0;
  const follows = data.actionsByType['follow'] ?? 0;
  const dmsSent = data.actionsByType['creator_dm'] ?? 0;
  const textPosts = data.actionsByType['text_post'] ?? 0;
  const polls = data.actionsByType['poll_posted'] ?? 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isBambiMode ? 'bg-white border-pink-200 shadow-sm' : 'bg-protocol-surface border-protocol-border'
    }`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Bot className={`w-5 h-5 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <div className="text-left">
            <p className={`text-sm font-semibold ${
              isBambiMode ? 'text-gray-800' : 'text-protocol-text'
            }`}>
              Handler Activity
            </p>
            <p className={`text-[10px] ${
              isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
            }`}>
              While you were away
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-purple-900/30 text-purple-400'
          }`}>
            {data.actions.length} actions
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Summary strip (always visible) */}
      <div className={`px-4 pb-3 flex flex-wrap gap-2 ${expanded ? 'pb-2' : ''}`}>
        {commentsMade > 0 && (
          <StatChip icon={MessageSquare} label={`${commentsMade} comments`} isBambiMode={isBambiMode} />
        )}
        {repliesMade > 0 && (
          <StatChip icon={MessageSquare} label={`${repliesMade} replies`} isBambiMode={isBambiMode} />
        )}
        {follows > 0 && (
          <StatChip icon={Users} label={`${follows} followed`} isBambiMode={isBambiMode} />
        )}
        {dmsSent > 0 && (
          <StatChip icon={Users} label={`${dmsSent} DMs`} isBambiMode={isBambiMode} />
        )}
        {textPosts > 0 && (
          <StatChip icon={TrendingUp} label={`${textPosts} posts`} isBambiMode={isBambiMode} />
        )}
        {polls > 0 && (
          <StatChip icon={BarChart3} label={`${polls} polls`} isBambiMode={isBambiMode} />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Skip warning */}
          {data.consecutiveSkips > 0 && (
            <div className={`rounded-lg p-2 flex items-center gap-2 ${
              isBambiMode
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-amber-900/20 border border-amber-800/30'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className={`text-xs ${
                isBambiMode ? 'text-amber-700' : 'text-amber-400'
              }`}>
                {data.consecutiveSkips} consecutive skip{data.consecutiveSkips !== 1 ? 's' : ''}. The machine keeps running.
              </span>
            </div>
          )}

          {/* Karma status */}
          {!data.isKarmaReady && data.karmaEstimate > 0 && (
            <div className={`rounded-lg p-2 flex items-center gap-2 ${
              isBambiMode
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-blue-900/20 border border-blue-800/30'
            }`}>
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
              <span className={`text-xs ${
                isBambiMode ? 'text-blue-700' : 'text-blue-400'
              }`}>
                Reddit karma: ~{data.karmaEstimate}/200. Building.
              </span>
            </div>
          )}

          {/* Recent actions */}
          <div className="space-y-1.5">
            <p className={`text-[10px] uppercase tracking-wider font-semibold ${
              isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
            }`}>
              Recent
            </p>
            {data.actions.slice(0, 8).map(action => (
              <ActionRow key={action.id} action={action} isBambiMode={isBambiMode} />
            ))}
          </div>

          {/* Footer */}
          <p className={`text-[10px] italic text-center pt-1 ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`}>
            Maxy's world got bigger without her lifting a finger.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatChip({
  icon: Icon,
  label,
  isBambiMode,
}: {
  icon: typeof MessageSquare;
  label: string;
  isBambiMode: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
      isBambiMode
        ? 'bg-gray-100 text-gray-600'
        : 'bg-protocol-bg text-protocol-text-secondary'
    }`}>
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}

function ActionRow({
  action,
  isBambiMode,
}: {
  action: HandlerAutonomousAction;
  isBambiMode: boolean;
}) {
  const typeLabels: Record<string, string> = {
    community_comment: 'Commented',
    subreddit_comment: 'Commented',
    engagement_reply: 'Replied',
    follow: 'Followed',
    creator_dm: 'DM sent',
    text_post: 'Posted',
    poll_posted: 'Poll posted',
    cross_promo: 'Cross-promo',
    repost: 'Reposted',
    milestone_post: 'Milestone',
  };

  const typeIcons: Record<string, typeof MessageSquare> = {
    community_comment: MessageSquare,
    subreddit_comment: MessageSquare,
    engagement_reply: MessageSquare,
    follow: Users,
    creator_dm: Users,
    text_post: TrendingUp,
    poll_posted: BarChart3,
    cross_promo: Users,
    repost: TrendingUp,
    milestone_post: TrendingUp,
  };

  const Icon = typeIcons[action.actionType] ?? Clock;
  const label = typeLabels[action.actionType] ?? action.actionType;
  const time = formatTime(action.createdAt);

  return (
    <div className="flex items-start gap-2">
      <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
        isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
      }`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            {label}
          </span>
          {action.target && (
            <span className={`text-[10px] ${
              isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
            }`}>
              {action.target}
            </span>
          )}
          <span className={`text-[10px] ml-auto flex-shrink-0 ${
            isBambiMode ? 'text-gray-300' : 'text-protocol-text-muted'
          }`}>
            {time}
          </span>
        </div>
        {action.contentText && (
          <p className={`text-[10px] truncate ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`}>
            {action.contentText}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================
// Data Loading
// ============================================

async function loadBriefingData(userId: string): Promise<BriefingData> {
  const [actionsResult, todayResult, skipsResult, karmaResult] = await Promise.allSettled([
    getRecentAutonomousActions(userId, 24),
    getTodayActionCount(userId),
    getConsecutiveSkipCount(userId),
    getKarmaStatus(userId),
  ]);

  const actions = actionsResult.status === 'fulfilled' ? actionsResult.value : [];
  const totalToday = todayResult.status === 'fulfilled' ? todayResult.value : 0;
  const skips = skipsResult.status === 'fulfilled' ? skipsResult.value : 0;
  const karma = karmaResult.status === 'fulfilled' ? karmaResult.value : null;

  // Count by type
  const byType: Record<string, number> = {};
  for (const a of actions) {
    byType[a.actionType] = (byType[a.actionType] ?? 0) + 1;
  }

  return {
    actions,
    actionsByType: byType,
    totalActionsToday: totalToday,
    consecutiveSkips: skips,
    karmaEstimate: karma?.estimatedKarma ?? 0,
    isKarmaReady: karma?.isReadyForContent ?? false,
  };
}

// ============================================
// Helpers
// ============================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

  if (diffHours < 1) {
    const diffMin = Math.floor(diffMs / (60 * 1000));
    return `${diffMin}m`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  return `${Math.floor(diffHours / 24)}d`;
}
